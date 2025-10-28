import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import os from "os";
import { BN } from "@coral-xyz/anchor";
import { GroupchatFund } from "../../../../contract/groupchat_fund/target/types/groupchat_fund";
import IDL from "../../../../contract/groupchat_fund/target/idl/groupchat_fund.json";

// Load keypair helper
function loadKeypairFromFile(filepath: string): Keypair {
  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(filepath, "utf-8"))
  );
  return Keypair.fromSecretKey(secretKey);
}

// PDA helpers
function getFundPDA(groupId: string, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), Buffer.from(groupId)],
    programId
  );
}

function getMemberPDA(
  fundKey: PublicKey,
  memberWallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), fundKey.toBuffer(), memberWallet.toBuffer()],
    programId
  );
}

async function setupFundAndMember() {
  try {
    // Setup connection
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    console.log("✅ Connected to Solana devnet\n");
    
    // Load wallet
    const walletPath = path.join(os.homedir(), ".config", "solana", "id.json");
    const keypair = loadKeypairFromFile(walletPath);
    const wallet = new anchor.Wallet(keypair);
    console.log("Wallet:", keypair.publicKey.toString());
    
    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL\n`);
    
    // Setup provider and program
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    
    const programId = new PublicKey("9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy");
    const program = new anchor.Program<GroupchatFund>(
      IDL as any,
      provider
    );

    const groupId = "test_group_1";
    const [fundPDA] = getFundPDA(groupId, programId);
    const [memberPDA] = getMemberPDA(fundPDA, keypair.publicKey, programId);

    console.log("Fund PDA:", fundPDA.toString());
    console.log("Member PDA:", memberPDA.toString());
    console.log();

    // Step 1: Check if fund exists, if not initialize it
    console.log("📋 Step 1: Checking fund...");
    try {
      const fundAccount = await program.account.fund.fetch(fundPDA);
      console.log("✅ Fund already exists");
      console.log(`   Total Value: ${fundAccount.totalValue.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
      console.log(`   Total Shares: ${fundAccount.totalShares.toString()}`);
    } catch (error) {
      console.log("⚠️  Fund doesn't exist, creating...");
      
      const tx = await program.methods
        .initializeFund(
          groupId,
          "Test Fund",
          new BN(100_000_000), // min contribution: 0.1 SOL
          100, // trading fee: 1%
          2    // required approvals: 2
        )
        .accountsPartial({
          fund: fundPDA,
          authority: keypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypair])
        .rpc();
      
      console.log("✅ Fund initialized");
      console.log("   TX:", tx);
    }
    console.log();

    // Step 2: Add member
    console.log("📋 Step 2: Adding member...");
    try {
      const memberAccount = await program.account.member.fetch(memberPDA);
      console.log("✅ Member already exists");
      console.log(`   Role: ${Object.keys(memberAccount.role)[0]}`);
      console.log(`   Shares: ${memberAccount.shares.toString()}`);
    } catch (error) {
      console.log("⚠️  Member doesn't exist, adding...");
      
      const tx = await program.methods
        .addMember("telegram_user_123")
        .accountsPartial({
          fund: fundPDA,
          member: memberPDA,
          memberWallet: keypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypair])
        .rpc();
      
      console.log("✅ Member added");
      console.log("   TX:", tx);
    }
    console.log();

    // Step 3: Update member role to Trader
    console.log("📋 Step 3: Updating member role to Trader...");
    try {
      const memberAccount = await program.account.member.fetch(memberPDA);
      const currentRole = Object.keys(memberAccount.role)[0];
      
      if (currentRole === "trader" || currentRole === "manager") {
        console.log(`✅ Member already has ${currentRole} role`);
      } else {
        const tx = await program.methods
          .updateMemberRole({ trader: {} })
          .accountsPartial({
            fund: fundPDA,
            member: memberPDA,
            authority: keypair.publicKey,
          })
          .signers([keypair])
          .rpc();
        
        console.log("✅ Member role updated to Trader");
        console.log("   TX:", tx);
      }
    } catch (error) {
      console.error("❌ Failed to update role:", error);
    }
    console.log();

    // Step 4: Add member to approved traders list
    console.log("📋 Step 4: Adding to approved traders list...");
    try {
      const fundAccount = await program.account.fund.fetch(fundPDA);
      const isApproved = fundAccount.approvedTraders.some(
        (trader) => trader.equals(keypair.publicKey)
      );
      
      if (isApproved) {
        console.log("✅ Member already in approved traders list");
      } else {
        const tx = await program.methods
          .manageTrader(keypair.publicKey, true)
          .accountsPartial({
            fund: fundPDA,
            authority: keypair.publicKey,
          })
          .signers([keypair])
          .rpc();
        
        console.log("✅ Member added to approved traders");
        console.log("   TX:", tx);
      }
    } catch (error) {
      console.error("❌ Failed to add trader:", error);
    }
    console.log();

    // Step 5: Contribute some funds (optional but recommended)
    console.log("📋 Step 5: Contributing to fund...");
    try {
      const memberAccount = await program.account.member.fetch(memberPDA);
      
      if (memberAccount.shares.toNumber() > 0) {
        console.log(`✅ Member already has ${memberAccount.shares.toString()} shares`);
      } else {
        const contributionAmount = 500_000_000; // 0.5 SOL
        
        const tx = await program.methods
          .contribute(new BN(contributionAmount))
          .accountsPartial({
            fund: fundPDA,
            member: memberPDA,
            memberWallet: keypair.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([keypair])
          .rpc();
        
        console.log("✅ Contribution successful");
        console.log(`   Amount: ${contributionAmount / anchor.web3.LAMPORTS_PER_SOL} SOL`);
        console.log("   TX:", tx);
      }
    } catch (error) {
      console.error("❌ Failed to contribute:", error);
    }
    console.log();

    // Final status
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Setup complete!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\nFinal Status:");
    
    const fundAccount = await program.account.fund.fetch(fundPDA);
    const memberAccount = await program.account.member.fetch(memberPDA);
    
    console.log("\nFund:");
    console.log(`  Total Value: ${fundAccount.totalValue.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  Total Shares: ${fundAccount.totalShares.toString()}`);
    console.log(`  Approved Traders: ${fundAccount.approvedTraders.length}`);
    console.log(`  Active: ${fundAccount.isActive}`);
    
    console.log("\nMember:");
    console.log(`  Role: ${Object.keys(memberAccount.role)[0]}`);
    console.log(`  Shares: ${memberAccount.shares.toString()}`);
    console.log(`  Total Contributed: ${memberAccount.totalContributed.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  Active: ${memberAccount.isActive}`);
    
    console.log("\n✨ You can now run the propose trade script!");

  } catch (error: any) {
    console.error("\n❌ Setup failed:", error.message || error);
    process.exit(1);
  }
}

setupFundAndMember()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
