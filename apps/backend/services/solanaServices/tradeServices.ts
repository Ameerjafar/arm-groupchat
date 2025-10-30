// services/solanaServices/tradeServices.ts

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
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
import { swapSolToToken } from '../raydiumSwapService.ts';

// ==================== SOLANA SETUP ====================

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

const programId = new PublicKey(
  process.env.PROGRAM_ID || "JDomJJbEK48FriJ5RVuTmgDGbNN8DLKAv33NdTydcWWd"
);

// ==================== TOKEN MINTS ====================

const TOKEN_MINTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get user keypair from encrypted database
 */
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

/**
 * Get program instance
 */
function getProgram(wallet: anchor.Wallet): Program<GroupchatFund> {
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program<GroupchatFund>(IDL as any, provider);
}

/**
 * Get program for reading (no signer needed)
 */
function getProgramForReading(): Program<GroupchatFund> {
  const provider = new anchor.AnchorProvider(
    connection,
    {} as any,
    { commitment: "confirmed" }
  );
  return new Program<GroupchatFund>(IDL as any, provider);
}

/**
 * Validate and convert token address to PublicKey
 */
function validateTokenAddress(token: string): PublicKey {
  // If it's a token symbol, convert to mint address
  const mintAddress = TOKEN_MINTS[token.toUpperCase()] || token;

  console.log(`Token input: ${token} → Mint: ${mintAddress}`);

  try {
    // Validate it's a proper base58 string
    if (!mintAddress || mintAddress.length < 32) {
      throw new Error(`Invalid token address: ${mintAddress}`);
    }

    // Try to decode as base58
    const decoded = bs58.decode(mintAddress);
    if (decoded.length !== 32) {
      throw new Error(
        `Invalid public key length: ${decoded.length}, expected 32`
      );
    }

    return new PublicKey(mintAddress);
  } catch (error: any) {
    throw new Error(
      `Failed to parse token address '${token}': ${error.message}`
    );
  }
}

// ==================== PDA HELPERS ====================

/**
 * Derive fund PDA
 */
export function getFundPDA(
  groupId: string,
  programId: PublicKey = new PublicKey(process.env.PROGRAM_ID!)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), Buffer.from(groupId)],
    programId
  );
}

/**
 * Derive member PDA
 */
export function getMemberPDA(
  fundKey: PublicKey,
  memberWallet: PublicKey,
  programId_: PublicKey = programId
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), fundKey.toBuffer(), memberWallet.toBuffer()],
    programId_
  );
}

// ==================== TRADE OPERATIONS ====================

/**
 * Execute trade (admin only)
 */
export async function executeTrade(
  groupId: string,
  telegramId: string,
  fromToken: string,
  toToken: string,
  amount: string,
  minimumOut: string
): Promise<{
  success: boolean;
  transactionSignature?: string;
  fromToken?: string;
  toToken?: string;
  amount?: string;
  minimumOut?: string;
  message?: string;
}> {
  try {
    console.log("⚡ Executing trade...");
    console.log("Raw inputs:", { fromToken, toToken, amount, minimumOut });

    // Validate token addresses
    let fromTokenPubkey: PublicKey;
    let toTokenPubkey: PublicKey;

    try {
      fromTokenPubkey = validateTokenAddress(fromToken);
      toTokenPubkey = validateTokenAddress(toToken);
    } catch (error: any) {
      console.error("❌ Token validation error:", error.message);
      throw error;
    }

    console.log("From Token PubKey:", fromTokenPubkey.toString());
    console.log("To Token PubKey:", toTokenPubkey.toString());
    console.log("Amount:", amount);
    console.log("Minimum Out:", minimumOut);

    // Validate amounts are valid numbers
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new Error(`Invalid amount: ${amount}`);
    }

    if (!minimumOut || isNaN(Number(minimumOut)) || Number(minimumOut) < 0) {
      throw new Error(`Invalid minimumOut: ${minimumOut}`);
    }

    // Get authority keypair
    const authorityKeypair = await getUserKeypair(telegramId);
    if (!authorityKeypair) {
      throw new Error("Failed to load authority keypair");
    }

    console.log("Authority:", authorityKeypair.publicKey.toString());

    // Create program
    const wallet = new anchor.Wallet(authorityKeypair);
    const program = getProgram(wallet);

    // Derive fund PDA
    const [fundPDA] = getFundPDA(groupId, program.programId);

    console.log("Fund PDA:", fundPDA.toString());
    console.log("Program ID:", program.programId.toString());

    // Fetch fund account to verify authority
    const fundAccount = await program.account.fund.fetch(fundPDA);

    if (fundAccount.authority.toString() !== authorityKeypair.publicKey.toString()) {
      throw new Error("Only fund authority (admin) can execute trades");
    }

    if (!fundAccount.isActive) {
      throw new Error("Fund is not active");
    }

    // Convert amounts to BN
    const amountBN = new BN(amount);
    const minimumOutBN = new BN(minimumOut);

    console.log("Amount BN:", amountBN.toString());
    console.log("Minimum Out BN:", minimumOutBN.toString());

    // Check sufficient balance
    if (amountBN.gt(fundAccount.totalValue)) {
      throw new Error(
        `Insufficient funds. Available: ${fundAccount.totalValue.toNumber() / LAMPORTS_PER_SOL} SOL`
      );
    }

    // ✅ Execute trade with validated public keys
    console.log("📤 Sending transaction...");
    const tx = await program.methods
      .executeTradeMock(
        fromTokenPubkey, // ✅ Now guaranteed to be valid PublicKey
        toTokenPubkey, // ✅ Now guaranteed to be valid PublicKey
        amountBN,
        minimumOutBN
      )
      .accounts({
        fund: fundPDA,
        authority: authorityKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authorityKeypair])
      .rpc();

    console.log("✅ Trade executed successfully");
    console.log("Transaction Signature:", tx);

    return {
      success: true,
      transactionSignature: tx,
      fromToken: fromTokenPubkey.toString(),
      toToken: toTokenPubkey.toString(),
      amount,
      minimumOut,
    };
  } catch (error: any) {
    console.error("❌ Error executing trade:", error.message);
    console.error("Full error:", error);
    throw new Error(error.message || "Failed to execute trade");
  }
}

/**
 * Check if user can execute trades
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

    // Create a program for reading
    const program = getProgramForReading();

    const [fundPDA] = getFundPDA(groupId, program.programId);
    const fundAccount = await program.account.fund.fetch(fundPDA);

    // Check if user is the fund authority
    if (!fundAccount.authority.equals(userPublicKey)) {
      return {
        canTrade: false,
        reason: "Only fund authority (admin) can execute trades",
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
    const program = getProgramForReading();

    const [fundPDA] = getFundPDA(groupId, program.programId);
    const fundAccount = await program.account.fund.fetch(fundPDA);

    // Get transactions from database
    const fund = await prisma.fund.findUnique({
      where: { groupId },
      include: {
        transactions: {
          where: { type: "TRADE" },
          orderBy: { timestamp: "desc" },
          take: 10,
        },
      },
    });

    return {
      fundPDA: fundPDA.toBase58(),
      authority: fundAccount.authority.toBase58(),
      totalValue: fundAccount.totalValue.toNumber() / LAMPORTS_PER_SOL,
      totalShares: fundAccount.totalShares.toNumber(),
      isActive: fundAccount.isActive,
      tradingFeeBps: fundAccount.tradingFeeBps,
      recentTrades: fund?.transactions || [],
    };
  } catch (error: any) {
    console.error("Error fetching fund trading info:", error.message);
    throw error;
  }
}

/**
 * Get trade history from database
 */
export async function getTradeHistory(groupId: string, limit: number = 10) {
  try {
    const fund = await prisma.fund.findUnique({
      where: { groupId },
      include: {
        transactions: {
          where: { type: "TRADE" },
          orderBy: { timestamp: "desc" },
          take: limit,
        },
      },
    });

    if (!fund) {
      return {
        success: false,
        trades: [],
        message: "Fund not found",
      };
    }

    const trades = fund.transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount.toString(),
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      signature: tx.signature,
      status: tx.status,
      initiator: tx.initiator,
      timestamp: tx.timestamp,
      explorerUrl: tx.signature
        ? `https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`
        : null,
    }));

    return {
      success: true,
      trades,
      total: trades.length,
    };
  } catch (error: any) {
    console.error("Error fetching trade history:", error.message);
    return {
      success: false,
      trades: [],
      message: error.message,
    };
  }
}


/**
 * Execute trade using Raydium SDK V2
 */
export const executeTrade = async (
  groupId: string,
  telegramId: string,
  fromToken: string,
  toToken: string,
  amount: string,
  minimumOut: string
) => {
  try {
    // Get fund's secret key from your secure storage
    const fundSecretKey = await getFundSecretKey(groupId);
    const fundKeypair = Keypair.fromSecretKey(bs58.decode(fundSecretKey));

    // Parse amount
    const amountInSol = parseFloat(amount);

    console.log(`🔄 Executing trade: ${amountInSol} SOL → ${toToken}`);

    // Execute swap using Raydium
    const swapResult = await swapSolToToken(
      fundKeypair,
      toToken, // Target token mint address (e.g., USDC)
      amountInSol,
      1 // 1% slippage
    );

    if (!swapResult.success) {
      throw new Error(swapResult.message || 'Swap failed');
    }

    return {
      success: true,
      transactionSignature: swapResult.transactionSignature,
      fromToken: swapResult.fromToken,
      toToken: swapResult.toToken,
      amount: swapResult.amount,
      minimumOut: swapResult.outputAmount,
      message: 'Trade executed successfully',
    };
  } catch (error: any) {
    console.error('❌ Execute trade error:', error);
    return {
      success: false,
      message: error.message || 'Trade execution failed',
    };
  }
};

/**
 * Retrieve fund's secret key securely
 * Implement this based on your security model
 */
async function getFundSecretKey(groupId: string): Promise<string> {
  // TODO: Implement secure key retrieval from database or key management service
  // This should fetch the encrypted private key and decrypt it
  // For now, this is a placeholder
  const fund = await prisma.fund.findUnique({
    where: { groupId },
  });

  if (!fund || !fund.privateKey) {
    throw new Error('Fund private key not found');
  }

  // Return the private key (ensure it's stored encrypted in production!)
  return fund.privateKey;
}