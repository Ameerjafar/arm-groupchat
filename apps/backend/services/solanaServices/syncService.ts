// services/solanaServices/syncService.ts

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { GroupchatFund } from "../../../../contract/groupchat_fund/target/types/groupchat_fund";
import IDL from "../../../../contract/groupchat_fund/target/idl/groupchat_fund.json";
import { prisma } from "@repo/db";
import { getFundPDA } from "./fundService";

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

const programId = new PublicKey(
  process.env.PROGRAM_ID || "9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy"
);

/**
 * Sync fund balance from blockchain to database
 * This is called after every blockchain operation that changes balance
 */
export async function syncFundBalance(groupId: string): Promise<number> {
  try {
    console.log(`🔄 Syncing fund balance for group ${groupId}...`);

    // Create provider for reading (no wallet needed)
    const provider = new anchor.AnchorProvider(
      connection,
      {} as any,
      { commitment: "confirmed" }
    );
    const program = new Program<GroupchatFund>(IDL as any, provider);

    // Get fund PDA
    const [fundPDA] = getFundPDA(groupId, programId);

    // ✅ STEP 1: Fetch actual balance from blockchain
    const fundAccount = await program.account.fund.fetch(fundPDA);
    const actualBalance = fundAccount.totalValue.toNumber(); // in lamports

    console.log(`📊 Blockchain balance: ${actualBalance / LAMPORTS_PER_SOL} SOL`);

    // ✅ STEP 2: Update database with blockchain balance
    const updatedFund = await prisma.fund.update({
      where: { groupId },
      data: {
        balance: BigInt(actualBalance),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Database synced: ${actualBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`📝 Previous DB balance: ${Number(updatedFund.balance) / LAMPORTS_PER_SOL} SOL`);

    return actualBalance; // Return in lamports
  } catch (error: any) {
    console.error(`❌ Failed to sync fund balance:`, error.message);
    throw error;
  }
}

/**
 * Get fund balance directly from blockchain
 * Use this when you just need to read balance without updating DB
 */
export async function getFundBalance(groupId: string): Promise<number> {
  try {
    const provider = new anchor.AnchorProvider(
      connection,
      {} as any,
      { commitment: "confirmed" }
    );
    const program = new Program<GroupchatFund>(IDL as any, provider);

    const [fundPDA] = getFundPDA(groupId, programId);
    const fundAccount = await program.account.fund.fetch(fundPDA);

    return fundAccount.totalValue.toNumber(); // in lamports
  } catch (error: any) {
    console.error(`❌ Failed to get fund balance:`, error.message);
    throw error;
  }
}

/**
 * Sync all fund data from blockchain to database
 * This syncs balance, shares, and status
 */
export async function syncFullFundData(groupId: string) {
  try {
    console.log(`🔄 Full sync for group ${groupId}...`);

    const provider = new anchor.AnchorProvider(
      connection,
      {} as any,
      { commitment: "confirmed" }
    );
    const program = new Program<GroupchatFund>(IDL as any, provider);

    const [fundPDA] = getFundPDA(groupId, programId);
    const fundAccount = await program.account.fund.fetch(fundPDA);

    // Update database with all blockchain data
    const updatedFund = await prisma.fund.update({
      where: { groupId },
      data: {
        balance: fundAccount.totalValue,
        status: fundAccount.isActive ? "ACTIVE" : "PAUSED",
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Full sync complete for ${groupId}`);

    return {
      balance: fundAccount.totalValue.toNumber(),
      totalShares: fundAccount.totalShares.toNumber(),
      isActive: fundAccount.isActive,
    };
  } catch (error: any) {
    console.error(`❌ Full sync failed:`, error.message);
    throw error;
  }
}

/**
 * Sync multiple funds at once
 * Useful for batch operations or cron jobs
 */
export async function syncMultipleFunds(groupIds: string[]) {
  const results = [];

  for (const groupId of groupIds) {
    try {
      const balance = await syncFundBalance(groupId);
      results.push({
        groupId,
        success: true,
        balance: balance / LAMPORTS_PER_SOL,
      });
    } catch (error: any) {
      results.push({
        groupId,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Check if database balance matches blockchain
 * Useful for debugging or health checks
 */
export async function verifyFundBalance(groupId: string): Promise<{
  matches: boolean;
  blockchainBalance: number;
  databaseBalance: number;
  difference: number;
}> {
  try {
    // Get blockchain balance
    const blockchainBalance = await getFundBalance(groupId);

    // Get database balance
    const fund = await prisma.fund.findUnique({
      where: { groupId },
      select: { balance: true },
    });

    if (!fund) {
      throw new Error("Fund not found in database");
    }

    const databaseBalance = Number(fund.balance);
    const difference = blockchainBalance - databaseBalance;
    const matches = difference === 0;

    return {
      matches,
      blockchainBalance: blockchainBalance / LAMPORTS_PER_SOL,
      databaseBalance: databaseBalance / LAMPORTS_PER_SOL,
      difference: difference / LAMPORTS_PER_SOL,
    };
  } catch (error: any) {
    console.error("Error verifying balance:", error.message);
    throw error;
  }
}
