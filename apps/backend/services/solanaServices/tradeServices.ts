// services/solanaServices/tradeServices.ts

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { 
  Connection,
  PublicKey, 
  Keypair, 
  SystemProgram,
  LAMPORTS_PER_SOL 
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
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program<GroupchatFund>(IDL as any, provider);
}

// ==================== PDA HELPER FUNCTIONS ====================

export function getFundPDA(groupId: string, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), Buffer.from(groupId)],
    programId
  );
}

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

// ==================== TRADE OPERATIONS ====================

/**
 * Execute trade (admin only)
 */
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
    console.log("From:", fromToken);
    console.log("To:", toToken);
    console.log("Amount:", amount);
    console.log("Minimum Out:", minimumOut);

    const authorityKeypair = await getUserKeypair(authorityTelegramId);
    if (!authorityKeypair) {
      throw new Error("Failed to load authority keypair");
    }

    const wallet = new anchor.Wallet(authorityKeypair);
    const program = getProgram(wallet);

    const [fundPDA] = getFundPDA(groupId, program.programId);
    
    console.log("Fund PDA:", fundPDA.toString());
    console.log("Authority:", authorityKeypair.publicKey.toString());
    const fundAccount = await program.account.fund.fetch(fundPDA);
    
    if (fundAccount.authority.toString() !== authorityKeypair.publicKey.toString()) {
      throw new Error("Only fund authority (admin) can execute trades");
    }

    if (!fundAccount.isActive) {
      throw new Error("Fund is not active");
    }

    // Check sufficient balance
    const amountBN = new BN(amount);
    if (amountBN.gt(fundAccount.totalValue)) {
      throw new Error(
        `Insufficient funds. Available: ${fundAccount.totalValue.toNumber() / LAMPORTS_PER_SOL} SOL`
      );
    }

    // Execute trade
    const tx = await program.methods
      .executeTrade(
        new PublicKey(fromToken),
        new PublicKey(toToken),
        amountBN,
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
      fromToken,
      toToken,
      amount,
      minimumOut,
    };
  } catch (error: any) {
    console.error("❌ Error executing trade:", error.message);
    throw error;
  }
}

/**
 * Check if user is the fund authority (can trade)
 */
export async function canExecuteTrade(
  groupId: string,
  telegramId: string
): Promise<{ canTrade: boolean; reason?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { walletAddress: true },
    });

    if (!user?.walletAddress) {
      return { canTrade: false, reason: "User wallet not found" };
    }

    const userPublicKey = new PublicKey(user.walletAddress);
    
    // Create a dummy wallet just for reading
    const provider = new anchor.AnchorProvider(
      connection,
      {} as any,
      { commitment: "confirmed" }
    );
    const program = new Program<GroupchatFund>(IDL as any, provider);

    const [fundPDA] = getFundPDA(groupId, program.programId);
    const fundAccount = await program.account.fund.fetch(fundPDA);

    // Check if user is the fund authority
    if (!fundAccount.authority.equals(userPublicKey)) {
      return { 
        canTrade: false, 
        reason: "Only fund authority (admin) can execute trades" 
      };
    }

    // Check if fund is active
    if (!fundAccount.isActive) {
      return { canTrade: false, reason: "Fund is not active" };
    }

    // Check if fund has balance
    if (fundAccount.totalValue.isZero()) {
      return { canTrade: false, reason: "Fund has no balance" };
    }

    return { canTrade: true };
  } catch (error: any) {
    console.error("Error checking trade permissions:", error.message);
    return { canTrade: false, reason: "Error checking permissions" };
  }
}

/**
 * Get fund trading info
 */
export async function getFundTradingInfo(groupId: string) {
  try {
    const provider = new anchor.AnchorProvider(
      connection,
      {} as any,
      { commitment: "confirmed" }
    );
    const program = new Program<GroupchatFund>(IDL as any, provider);

    const [fundPDA] = getFundPDA(groupId, program.programId);
    const fundAccount = await program.account.fund.fetch(fundPDA);

    return {
      fundPDA: fundPDA.toBase58(),
      authority: fundAccount.authority.toBase58(),
      totalValue: fundAccount.totalValue.toNumber() / LAMPORTS_PER_SOL,
      isActive: fundAccount.isActive,
      tradingFeeBps: fundAccount.tradingFeeBps,
    };
  } catch (error: any) {
    console.error("Error fetching fund trading info:", error.message);
    throw error;
  }
}

/**
 * Get trade history (placeholder - implement based on your needs)
 */
export async function getTradeHistory(groupId: string, limit: number = 10) {
  try {
    // TODO: Implement trade history tracking
    // Options:
    // 1. Parse transaction logs for the fund PDA
    // 2. Store trades in database when executed
    // 3. Use Solana program logs
    
    console.log("Getting trade history for group:", groupId);
    
    return {
      trades: [],
      message: "Trade history not yet implemented"
    };
  } catch (error: any) {
    console.error("Error fetching trade history:", error.message);
    throw error;
  }
}
