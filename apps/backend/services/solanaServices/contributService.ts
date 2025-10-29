// services/solanaServices/contributionService.ts
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { GroupchatFund } from "../../../../contract/groupchat_fund/target/types/groupchat_fund";
import IDL from "../../../../contract/groupchat_fund/target/idl/groupchat_fund.json";
import { prisma } from "@repo/db";
import bs58 from "bs58";
import { decrypt } from "../utlis";

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

const programId = new PublicKey(
  process.env.PROGRAM_ID || "9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy"
);

// ==================== HELPER FUNCTIONS ====================

// Get user keypair from database
async function getUserKeypair(telegramId: string): Promise<Keypair | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: {
        encryptedPrivateKey: true,
        walletAddress: true,
      },
    });

    if (!user || !user.encryptedPrivateKey) {
      console.error("User not found or no encrypted private key");
      return null;
    }

    const decryptedBase58String = decrypt(user.encryptedPrivateKey);
    const secretKey = bs58.decode(decryptedBase58String);

    if (secretKey.length !== 64) {
      throw new Error(`Invalid secret key length: ${secretKey.length}`);
    }

    const keypair = Keypair.fromSecretKey(secretKey);

    if (keypair.publicKey.toString() !== user.walletAddress) {
      console.error("Decrypted keypair does not match stored wallet address");
      return null;
    }

    return keypair;
  } catch (error) {
    console.error("Error loading user keypair:", error);
    return null;
  }
}

// Get program instance
function getProgram(wallet: anchor.Wallet): Program<GroupchatFund> {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program<GroupchatFund>(IDL as any, provider);
}

// Get program instance without wallet (for read-only operations)
function getProgramReadOnly(): Program<GroupchatFund> {
  const provider = new AnchorProvider(
    connection,
    {} as any,
    { commitment: "confirmed" }
  );
  return new Program<GroupchatFund>(IDL as any, provider);
}

// ==================== MEMBER OPERATIONS ====================

/**
 * Add a new member to a fund
 * Matches Rust: pub fn add_member(ctx: Context<AddMember>, telegram_id: String)
 */
export async function addMemberToFund(groupId: string, telegramId: string) {
  try {
    console.log("👤 Adding member to fund...");

    const userKeypair = await getUserKeypair(telegramId);
    if (!userKeypair) {
      throw new Error("Failed to load user keypair");
    }

    console.log("User public key:", userKeypair.publicKey.toBase58());

    const wallet = new anchor.Wallet(userKeypair);
    const program = getProgram(wallet);

    // Derive PDAs
    const [fundPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("member"),
        fundPDA.toBuffer(),
        userKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    console.log("Fund PDA:", fundPDA.toBase58());
    console.log("Member PDA:", memberPDA.toBase58());

    // Add member
    const tx = await program.methods
      .addMember(telegramId)
      .accountsPartial({
        fund: fundPDA,
        member: memberPDA,
        memberWallet: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    console.log("✅ Member added successfully");
    console.log("Transaction:", tx);

    return {
      success: true,
      transactionSignature: tx,
      memberPdaAddress: memberPDA.toBase58(),
    };
  } catch (error: any) {
    console.error("❌ Error in addMemberToFund:", error.message);
    throw error;
  }
}

/**
 * Check if member account exists
 */
export async function checkMemberExists(
  groupId: string,
  userPublicKey: PublicKey
): Promise<boolean> {
  try {
    const program = getProgramReadOnly();

    const [fundPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), fundPDA.toBuffer(), userPublicKey.toBuffer()],
      program.programId
    );

    await program.account.member.fetch(memberPDA);
    return true;
  } catch {
    return false;
  }
}

// ==================== CONTRIBUTION OPERATIONS ====================

/**
 * Contribute to fund
 * Matches Rust: pub fn contribute(ctx: Context<Contribute>, amount: u64)
 */
export async function contributeToFund(
  groupId: string,
  telegramId: string,
  amountSol: number
) {
  try {
    console.log("💰 Contributing to fund...");
    console.log("Amount:", amountSol, "SOL");

    const userKeypair = await getUserKeypair(telegramId);
    if (!userKeypair) {
      throw new Error("Failed to load user keypair");
    }

    console.log("User public key:", userKeypair.publicKey.toBase58());

    const wallet = new anchor.Wallet(userKeypair);
    const program = getProgram(wallet);

    // Convert SOL to lamports
    const amountLamports = new BN(amountSol * LAMPORTS_PER_SOL);

    // Derive PDAs
    const [fundPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("member"),
        fundPDA.toBuffer(),
        userKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    console.log("Fund PDA:", fundPDA.toBase58());
    console.log("Member PDA:", memberPDA.toBase58());

    // Check if member exists, if not create one first
    const memberExists = await checkMemberExists(groupId, userKeypair.publicKey);

    if (!memberExists) {
      console.log("Member doesn't exist, creating member account first...");
      await addMemberToFund(groupId, telegramId);
    }

    // Fetch fund account
    const fundAccount = await program.account.fund.fetch(fundPDA);

    // Check if fund is active
    if (!fundAccount.isActive) {
      throw new Error("Fund is not active");
    }

    // Check minimum contribution
    if (amountLamports.lt(fundAccount.minContribution)) {
      throw new Error(
        `Contribution below minimum required: ${
          fundAccount.minContribution.toNumber() / LAMPORTS_PER_SOL
        } SOL`
      );
    }

    // Calculate shares to be minted
    let sharesMinted: BN;
    if (fundAccount.totalShares.isZero()) {
      sharesMinted = amountLamports;
    } else {
      sharesMinted = amountLamports
        .mul(fundAccount.totalShares)
        .div(fundAccount.totalValue);
    }

    console.log("Shares to be minted:", sharesMinted.toString());

    // Check user balance
    const balance = await connection.getBalance(userKeypair.publicKey);
    console.log("User balance:", balance / LAMPORTS_PER_SOL, "SOL");

    if (balance < amountLamports.toNumber() + 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Insufficient balance. Required: ${
          (amountLamports.toNumber() + 0.01 * LAMPORTS_PER_SOL) /
          LAMPORTS_PER_SOL
        } SOL, Available: ${balance / LAMPORTS_PER_SOL} SOL`
      );
    }

    // Execute contribute instruction
    console.log("Sending contribute transaction...");

    const tx = await program.methods
      .contribute(amountLamports)
      .accountsPartial({
        fund: fundPDA,
        member: memberPDA,
        memberWallet: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    console.log("✅ Contribution successful!");
    console.log("Transaction signature:", tx);

    // Fetch updated fund balance
    const updatedFund = await program.account.fund.fetch(fundPDA);
    const newFundBalance = updatedFund.totalValue.toNumber() / LAMPORTS_PER_SOL;

    // Fetch updated member info
    const updatedMember = await program.account.member.fetch(memberPDA);

    return {
      success: true,
      transactionSignature: tx,
      sharesMinted: sharesMinted.toString(),
      totalShares: updatedMember.shares.toString(),
      newFundBalance,
      fundPdaAddress: fundPDA.toBase58(),
    };
  } catch (error: any) {
    console.error("❌ Error in contributeToFund:", error.message);
    throw error;
  }
}

// ==================== WITHDRAWAL OPERATIONS ====================

/**
 * Withdraw shares from fund
 * Matches Rust: pub fn withdraw(ctx: Context<Withdraw>, shares_to_burn: u64)
 */
export async function withdrawFromFund(
  groupId: string,
  telegramId: string,
  sharesToBurn: number
) {
  try {
    console.log("💸 Withdrawing from fund...");
    console.log("Shares to burn:", sharesToBurn);

    const userKeypair = await getUserKeypair(telegramId);
    if (!userKeypair) {
      throw new Error("Failed to load user keypair");
    }

    const wallet = new anchor.Wallet(userKeypair);
    const program = getProgram(wallet);

    // Derive PDAs
    const [fundPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("member"),
        fundPDA.toBuffer(),
        userKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    // Fetch member account
    const memberAccount = await program.account.member.fetch(memberPDA);
    const memberShares = memberAccount.shares.toNumber();

    if (memberShares < sharesToBurn) {
      throw new Error(
        `Insufficient shares. Have: ${memberShares}, Requested: ${sharesToBurn}`
      );
    }

    // Fetch fund account to calculate withdrawal amount
    const fundAccount = await program.account.fund.fetch(fundPDA);
    const sharesToBurnBN = new BN(sharesToBurn);
    const withdrawalAmountLamports = sharesToBurnBN
      .mul(fundAccount.totalValue)
      .div(fundAccount.totalShares)
      .toNumber();

    console.log(
      "Withdrawal amount:",
      withdrawalAmountLamports / LAMPORTS_PER_SOL,
      "SOL"
    );

    // Execute withdraw instruction
    const tx = await program.methods
      .withdraw(sharesToBurnBN)
      .accountsPartial({
        fund: fundPDA,
        member: memberPDA,
        memberWallet: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    console.log("✅ Withdrawal successful!");
    console.log("Transaction signature:", tx);

    // Fetch updated member shares
    const updatedMember = await program.account.member.fetch(memberPDA);

    return {
      success: true,
      transactionSignature: tx,
      withdrawalAmount: withdrawalAmountLamports / LAMPORTS_PER_SOL,
      remainingShares: updatedMember.shares.toString(),
    };
  } catch (error: any) {
    console.error("❌ Error in withdrawFromFund:", error.message);
    throw error;
  }
}

// ==================== QUERY OPERATIONS ====================

/**
 * Get member's share information
 */
export async function getMemberShares(groupId: string, telegramId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user?.walletAddress) {
      throw new Error("User wallet not found");
    }

    const userPublicKey = new PublicKey(user.walletAddress);
    const program = getProgramReadOnly();

    const [fundPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), fundPDA.toBuffer(), userPublicKey.toBuffer()],
      program.programId
    );

    const memberAccount = await program.account.member.fetch(memberPDA);
    const fundAccount = await program.account.fund.fetch(fundPDA);

    // Calculate member's share of fund value
    let shareValue = 0;
    if (!fundAccount.totalShares.isZero()) {
      shareValue =
        (memberAccount.shares.toNumber() * fundAccount.totalValue.toNumber()) /
        fundAccount.totalShares.toNumber() /
        LAMPORTS_PER_SOL;
    }

    return {
      shares: memberAccount.shares.toString(),
      shareValue: shareValue,
      totalContributed:
        memberAccount.totalContributed.toNumber() / LAMPORTS_PER_SOL,
      isActive: memberAccount.isActive,
      wallet: memberAccount.wallet.toBase58(),
      telegramId: memberAccount.telegramId,
    };
  } catch (error: any) {
    console.error("❌ Error in getMemberShares:", error.message);
    throw error;
  }
}

/**
 * Get fund information
 */
export async function getFundInfo(groupId: string) {
  try {
    const program = getProgramReadOnly();

    const [fundPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const fundAccount = await program.account.fund.fetch(fundPDA);

    return {
      fundPdaAddress: fundPDA.toBase58(),
      totalShares: fundAccount.totalShares.toString(),
      totalValue: fundAccount.totalValue.toNumber() / LAMPORTS_PER_SOL,
      minContribution:
        fundAccount.minContribution.toNumber() / LAMPORTS_PER_SOL,
      tradingFeeBps: fundAccount.tradingFeeBps,
      isActive: fundAccount.isActive,
      fundName: fundAccount.fundName,
      authority: fundAccount.authority.toBase58(),
      groupId: fundAccount.groupId,
      bump: fundAccount.bump,
    };
  } catch (error: any) {
    console.error("❌ Error in getFundInfo:", error.message);
    throw new Error("Fund not found on blockchain");
  }
}

/**
 * Get all members of a fund
 */
export async function getAllFundMembers(groupId: string) {
  try {
    const program = getProgramReadOnly();

    const [fundPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    // Fetch all member accounts for this fund
    const members = await program.account.member.all([
      {
        memcmp: {
          offset: 8, // Discriminator
          bytes: fundPDA.toBase58(),
        },
      },
    ]);

    const fundAccount = await program.account.fund.fetch(fundPDA);

    return members.map((member) => {
      const shareValue =
        !fundAccount.totalShares.isZero()
          ? (member.account.shares.toNumber() *
              fundAccount.totalValue.toNumber()) /
            fundAccount.totalShares.toNumber() /
            LAMPORTS_PER_SOL
          : 0;

      return {
        publicKey: member.publicKey.toBase58(),
        wallet: member.account.wallet.toBase58(),
        telegramId: member.account.telegramId,
        shares: member.account.shares.toString(),
        shareValue,
        totalContributed:
          member.account.totalContributed.toNumber() / LAMPORTS_PER_SOL,
        isActive: member.account.isActive,
      };
    });
  } catch (error: any) {
    console.error("❌ Error in getAllFundMembers:", error.message);
    throw error;
  }
}
