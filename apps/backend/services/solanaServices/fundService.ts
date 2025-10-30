// services/solanaServices/fundService.ts

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { prisma } from "@repo/db";
import { decrypt } from "../utlis";
import { GroupchatFund } from "../../../../contract/groupchat_fund/target/types/groupchat_fund";
import IDL from "../../../../contract/groupchat_fund/target/idl/groupchat_fund.json";

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

const programId = new PublicKey(
  process.env.PROGRAM_ID || "JDomJJbEK48FriJ5RVuTmgDGbNN8DLKAv33NdTydcWWd"
);

// ==================== TYPES ====================

type FundInitResult = {
  fundPdaAddress: string;
  authority: string;
  transactionSignature: string | null;
  alreadyExists: boolean;
  success?: boolean;
};

type SetupFundResult = FundInitResult & {
  memberPDA?: string;
  setupComplete?: boolean;
};

// ==================== HELPER FUNCTIONS ====================

// ✅ ADD THIS EXPORT
export function getFundPDA(groupId: string, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), Buffer.from(groupId)],
    programId
  );
}

// ✅ ADD THIS EXPORT TOO
export function getMemberPDA(
  fundKey: PublicKey,
  memberWallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), fundKey.toBuffer(), memberWallet.toBuffer()],
    programId
  );
}

// Get user keypair from database
export async function getUserKeypair(telegramId: string): Promise<Keypair | null> {
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

// Ensure sufficient balance with airdrop
async function ensureSufficientBalance(keypair: Keypair): Promise<void> {
  let balance = await connection.getBalance(keypair.publicKey);
  console.log("Current balance:", balance / LAMPORTS_PER_SOL, "SOL");

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log("Requesting airdrop...");

    try {
      const airdropSignature = await connection.requestAirdrop(
        keypair.publicKey,
        2 * LAMPORTS_PER_SOL
      );

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature: airdropSignature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      console.log("✅ Airdrop confirmed!");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      balance = await connection.getBalance(keypair.publicKey);
      console.log("New balance:", balance / LAMPORTS_PER_SOL, "SOL");
    } catch (airdropError: any) {
      console.error("Airdrop failed:", airdropError.message);
      throw new Error(
        `Failed to get airdrop. Fund wallet: ${keypair.publicKey.toBase58()}`
      );
    }
  }

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Insufficient balance: ${balance / LAMPORTS_PER_SOL} SOL. ` +
      `Fund required: ${keypair.publicKey.toBase58()}`
    );
  }

  console.log("✅ Balance sufficient");
}

// Get program instance
function getProgram(wallet: anchor.Wallet): Program<GroupchatFund> {
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new anchor.Program<GroupchatFund>(IDL as any, provider);
}

// ==================== FUND OPERATIONS ====================

// Initialize fund on blockchain (SIMPLIFIED)
export async function initializeFundOnBlockchain(
  groupId: string,
  fundName: string,
  minContribution: number,
  tradingFeeBps: number,
  telegramId: string
): Promise<FundInitResult> {
  try {
    console.log("🔄 Initializing fund on blockchain...");
    console.log("Group ID:", groupId);
    console.log("Fund Name:", fundName);

    const authorityKeypair = await getUserKeypair(telegramId);
    if (!authorityKeypair) {
      throw new Error("Failed to load authority keypair");
    }

    console.log("Authority wallet:", authorityKeypair.publicKey.toString());

    await ensureSufficientBalance(authorityKeypair);

    const wallet = new anchor.Wallet(authorityKeypair);
    const program = getProgram(wallet);

    // Use the exported function
    const [fundPDA] = getFundPDA(groupId, program.programId);

    console.log("Fund PDA:", fundPDA.toString());

    // Check if fund already exists
    try {
      const existingFund = await program.account.fund.fetch(fundPDA);
      if (existingFund) {
        console.log("⚠️ Fund already exists!");
        return {
          fundPdaAddress: fundPDA.toString(),
          authority: existingFund.authority.toString(),
          transactionSignature: null,
          alreadyExists: true,
        };
      }
    } catch (error: any) {
      if (!error.message.includes("Account does not exist")) {
        throw error;
      }
      console.log("Fund doesn't exist, creating new one");
    }

    // ✅ SIMPLIFIED: Initialize fund
    const tx = await program.methods
      .initializeFund(
        groupId,
        fundName,
        new BN(minContribution),
        tradingFeeBps
      )
      .accountsPartial({
        fund: fundPDA,
        authority: authorityKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authorityKeypair])
      .rpc();

    console.log("✅ Fund created successfully!");
    console.log("Transaction:", tx);

    return {
      success: true,
      transactionSignature: tx,
      fundPdaAddress: fundPDA.toString(),
      authority: authorityKeypair.publicKey.toString(),
      alreadyExists: false,
    };
  } catch (error: any) {
    console.error("❌ Error in initializeFundOnBlockchain:", error.message);
    throw error;
  }
}

// Close fund on blockchain
export async function closeFundOnBlockchain(
  groupId: string,
  telegramId: string
) {
  try {
    console.log("🔒 Closing fund on blockchain...");

    const authorityKeypair = await getUserKeypair(telegramId);
    if (!authorityKeypair) {
      throw new Error("Failed to load authority keypair");
    }

    const wallet = new anchor.Wallet(authorityKeypair);
    const program = getProgram(wallet);

    const [fundPDA] = getFundPDA(groupId, program.programId);

    console.log("Fund PDA:", fundPDA.toString());

    // Check if fund exists and get its data
    let fundAccount;
    try {
      fundAccount = await program.account.fund.fetch(fundPDA);
      console.log("Fund found");
    } catch (error) {
      throw new Error("Fund not found on blockchain");
    }

    // Verify authority
    if (fundAccount.authority.toString() !== authorityKeypair.publicKey.toString()) {
      throw new Error("Only fund authority can close the fund");
    }

    // Check if fund is empty
    if (fundAccount.totalValue.toNumber() > 0) {
      throw new Error(
        `Fund has balance: ${fundAccount.totalValue.toNumber() / LAMPORTS_PER_SOL} SOL. ` +
        `Must withdraw all funds first.`
      );
    }

    if (fundAccount.totalShares.toNumber() > 0) {
      throw new Error(
        `Fund has ${fundAccount.totalShares.toString()} shares remaining. ` +
        `All members must withdraw first.`
      );
    }

    const tx = await program.methods
      .closeFund()
      .accountsPartial({
        fund: fundPDA,
        authority: authorityKeypair.publicKey,
      })
      .signers([authorityKeypair])
      .rpc();

    console.log("✅ Fund closed successfully on blockchain!");
    console.log("Transaction:", tx);

    return {
      success: true,
      transactionSignature: tx,
      rentReclaimed: true,
    };
  } catch (error: any) {
    console.error("❌ Error closing fund on blockchain:", error.message);
    throw error;
  }
}

// Pause fund on blockchain
export async function pauseFundOnBlockchain(
  groupId: string,
  telegramId: string
) {
  try {
    console.log("⏸️ Pausing fund on blockchain...");

    const authorityKeypair = await getUserKeypair(telegramId);
    if (!authorityKeypair) {
      throw new Error("Failed to load authority keypair");
    }

    const wallet = new anchor.Wallet(authorityKeypair);
    const program = getProgram(wallet);

    const [fundPDA] = getFundPDA(groupId, program.programId);

    const fundAccount = await program.account.fund.fetch(fundPDA);
    if (fundAccount.authority.toString() !== authorityKeypair.publicKey.toString()) {
      throw new Error("Only fund authority can pause the fund");
    }

    const tx = await program.methods
      .pauseFund()
      .accountsPartial({
        fund: fundPDA,
        authority: authorityKeypair.publicKey,
      })
      .signers([authorityKeypair])
      .rpc();

    console.log("✅ Fund paused on blockchain");

    return {
      success: true,
      transactionSignature: tx,
    };
  } catch (error: any) {
    console.error("❌ Error pausing fund:", error.message);
    throw error;
  }
}

// Resume fund on blockchain
export async function resumeFundOnBlockchain(
  groupId: string,
  telegramId: string
) {
  try {
    console.log("▶️ Resuming fund on blockchain...");

    const authorityKeypair = await getUserKeypair(telegramId);
    if (!authorityKeypair) {
      throw new Error("Failed to load authority keypair");
    }

    const wallet = new anchor.Wallet(authorityKeypair);
    const program = getProgram(wallet);

    const [fundPDA] = getFundPDA(groupId, program.programId);

    const fundAccount = await program.account.fund.fetch(fundPDA);
    if (fundAccount.authority.toString() !== authorityKeypair.publicKey.toString()) {
      throw new Error("Only fund authority can resume the fund");
    }

    const tx = await program.methods
      .resumeFund()
      .accountsPartial({
        fund: fundPDA,
        authority: authorityKeypair.publicKey,
      })
      .signers([authorityKeypair])
      .rpc();

    console.log("✅ Fund resumed on blockchain");

    return {
      success: true,
      transactionSignature: tx,
    };
  } catch (error: any) {
    console.error("❌ Error resuming fund:", error.message);
    throw error;
  }
}

// Add member to fund
export async function addMemberToFund(
  groupId: string,
  memberTelegramId: string,
  memberWalletAddress: string
) {
  try {
    console.log("👤 Adding member to fund...");

    const memberKeypair = await getUserKeypair(memberTelegramId);
    if (!memberKeypair) {
      throw new Error("Failed to load member keypair");
    }

    const wallet = new anchor.Wallet(memberKeypair);
    const program = getProgram(wallet);

    const [fundPDA] = getFundPDA(groupId, program.programId);
    const [memberPDA] = getMemberPDA(fundPDA, memberKeypair.publicKey, program.programId);

    console.log("Member PDA:", memberPDA.toString());

    const tx = await program.methods
      .addMember(memberTelegramId)
      .accountsPartial({
        fund: fundPDA,
        member: memberPDA,
        memberWallet: memberKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([memberKeypair])
      .rpc();

    console.log("✅ Member added successfully");

    return {
      success: true,
      transactionSignature: tx,
      memberPDA: memberPDA.toString(),
    };
  } catch (error: any) {
    console.error("❌ Error adding member:", error.message);
    throw error;
  }
}

// ✅ Execute trade (admin only)
export async function executeTrade(
  groupId: string,
  authorityTelegramId: string,
  fromToken: string,
  toToken: string,
  amount: string,
  minimumOut: string
) {
  try {
    console.log("⚡ Executing trade...");

    const authorityKeypair = await getUserKeypair(authorityTelegramId);
    if (!authorityKeypair) {
      throw new Error("Failed to load authority keypair");
    }

    const wallet = new anchor.Wallet(authorityKeypair);
    const program = getProgram(wallet);

    const [fundPDA] = getFundPDA(groupId, program.programId);

    const tx = await program.methods
      .executeTrade(
        new PublicKey(fromToken),
        new PublicKey(toToken),
        new BN(amount),
        new BN(minimumOut)
      )
      .accountsPartial({
        fund: fundPDA,
        authority: authorityKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authorityKeypair])
      .rpc();

    console.log("✅ Trade executed successfully!");
    console.log("Transaction:", tx);

    return {
      success: true,
      transactionSignature: tx,
    };
  } catch (error: any) {
    console.error("❌ Error executing trade:", error.message);
    throw error;
  }
}

// ✅ Setup fund (admin only, no trader setup needed)
export async function setupFund(
  groupId: string,
  fundName: string,
  minContribution: number,
  tradingFeeBps: number,
  creatorTelegramId: string
): Promise<SetupFundResult> {
  try {
    console.log("🚀 Setting up fund...");

    // Step 1: Initialize the fund
    const fundResult = await initializeFundOnBlockchain(
      groupId,
      fundName,
      minContribution,
      tradingFeeBps,
      creatorTelegramId
    );

    if (fundResult.alreadyExists) {
      console.log("Fund already exists");
      return fundResult;
    }

    console.log("✅ Fund initialized");

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Add the creator as a member
    const memberResult = await addMemberToFund(
      groupId,
      creatorTelegramId,
      fundResult.authority
    );

    console.log("✅ Creator added as member");
    console.log("🎉 Fund setup complete! Admin can now trade.");

    return {
      ...fundResult,
      memberPDA: memberResult.memberPDA,
      setupComplete: true,
    };
  } catch (error: any) {
    console.error("❌ Error in fund setup:", error.message);
    throw error;
  }
}
