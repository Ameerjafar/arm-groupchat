// controllers/tradeController.ts
import { Request, Response, NextFunction } from "express";
import { prisma } from "@repo/db";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  executeTrade,
  canExecuteTrade,
  getFundTradingInfo,
  getTradeHistory,
  getFundPDA,
} from "../services/solanaServices/tradeServices";
import * as anchor from "@coral-xyz/anchor";
import IDL from "../../../contract/groupchat_fund/target/idl/groupchat_fund.json";
import { GroupchatFund } from "../../../contract/groupchat_fund/target/types/groupchat_fund";
import { PublicKey } from "@solana/web3.js";

// ==================== SETUP ====================

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

const programId = new PublicKey(
  process.env.PROGRAM_ID || "JDomJJbEK48FriJ5RVuTmgDGbNN8DLKAv33NdTydcWWd"
);

/**
 * Get program for reading on-chain data
 */
function getProgramForReading(): anchor.Program<GroupchatFund> {
  const provider = new anchor.AnchorProvider(
    connection,
    {} as any,
    { commitment: "confirmed" }
  );
  return new anchor.Program<GroupchatFund>(IDL as any, provider);
}

/**
 * Sync fund balance and shares after trade
 */
async function syncFundAfterTrade(groupId: string): Promise<void> {
  try {
    console.log("📊 Syncing fund state after trade...");

    const program = getProgramForReading();
    const [fundPDA] = getFundPDA(groupId, program.programId);

    // Fetch latest on-chain fund data
    const fundAccount = await program.account.fund.fetch(fundPDA);

    console.log("📈 On-chain fund state:", {
      totalValue: fundAccount.totalValue.toNumber() / LAMPORTS_PER_SOL,
      totalShares: fundAccount.totalShares.toNumber(),
      isActive: fundAccount.isActive,
    });

    // Convert BN to string for Prisma BigInt
    const balanceString = fundAccount.totalValue.toString();
    const sharesString = fundAccount.totalShares.toString();

    console.log("🔄 Converting to database format:", {
      balance: balanceString,
      shares: sharesString,
    });

    // Update database with latest on-chain values
    await prisma.fund.update({
      where: { groupId },
      data: {
        balance: BigInt(balanceString),
        updatedAt: new Date(),
      },
    });

    console.log("✅ Fund state synced to database");
  } catch (error: any) {
    console.error("⚠️ Error syncing fund after trade:", error.message);
    // Don't throw - trade was successful, just warn about sync issue
  }
}

// ==================== EXECUTE TRADE ====================

export const executeTradeController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const {
      groupId,
      telegramId,
      fromToken,
      toToken,
      amount,
      minimumOut,
    } = req.body;

    console.log("📥 Executing trade...");
    console.log("Inputs:", { groupId, telegramId, fromToken, toToken, amount, minimumOut });

    // Validate inputs
    if (!groupId || !telegramId || !fromToken || !toToken || !amount || !minimumOut) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: groupId, telegramId, fromToken, toToken, amount, minimumOut",
      });
    }

    // Get fund from database
    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: "Fund not found for this group",
      });
    }

    if (fund.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Fund is not active",
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user || !user.walletAddress) {
      return res.status(404).json({
        success: false,
        message: "User not found or wallet not connected",
      });
    }

    // Verify user is fund authority (admin)
    if (user.walletAddress !== fund.initiator) {
      return res.status(403).json({
        success: false,
        message: "Only fund authority (admin) can execute trades",
      });
    }

    // Check trading permissions
    const { canTrade, reason } = await canExecuteTrade(groupId, telegramId);

    if (!canTrade) {
      return res.status(403).json({
        success: false,
        message: reason || "You are not authorized to execute trades",
      });
    }

    // Execute trade on blockchain
    console.log("🚀 Calling executeTrade service...");
    const blockchainResult = await executeTrade(
      groupId,
      telegramId,
      fromToken,
      toToken,
      amount,
      minimumOut
    );

    if (!blockchainResult?.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to execute trade on blockchain",
        error: blockchainResult?.message,
      });
    }

    console.log("✅ Trade executed on blockchain");

    // Log transaction in database
    const txRecord = await prisma.transaction.create({
      data: {
        fundId: fund.id,
        type: "TRADE",
        amount: BigInt(amount),
        signature: blockchainResult.transactionSignature!,
        fromAddress: blockchainResult.fromToken,
        toAddress: blockchainResult.toToken,
        initiator: telegramId,
        status: "CONFIRMED",
      },
    });

    console.log("💾 Transaction logged in database:", txRecord.id);

    // SYNC FUND STATE AFTER TRADE
    await syncFundAfterTrade(groupId);

    // Fetch updated fund data for response
    const updatedFund = await prisma.fund.findUnique({
      where: { groupId },
    });

    const newBalanceSOL = updatedFund ? Number(updatedFund.balance) / LAMPORTS_PER_SOL : 0;

    console.log("💰 Updated fund balance:", newBalanceSOL, "SOL");

    return res.status(201).json({
      success: true,
      message: "Trade executed successfully",
      data: {
        fromToken: blockchainResult.fromToken,
        toToken: blockchainResult.toToken,
        amount: blockchainResult.amount,
        minimumOut: blockchainResult.minimumOut,
        transactionSignature: blockchainResult.transactionSignature,
        explorerUrl: `https://explorer.solana.com/tx/${blockchainResult.transactionSignature}?cluster=devnet`,
        updatedFundBalance: newBalanceSOL,
      },
    });
  } catch (error: any) {
    console.error("❌ Error executing trade:", error);

    if (error.message?.includes("InsufficientFunds") || error.message?.includes("Insufficient funds")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message?.includes("UnauthorizedTrader") || error.message?.includes("Only fund authority")) {
      return res.status(403).json({
        success: false,
        message: "Only fund authority can execute trades",
      });
    }

    if (error.message?.includes("FundNotActive")) {
      return res.status(400).json({
        success: false,
        message: "Fund is not active",
      });
    }

    return next(error);
  }
};

// ==================== QUERY OPERATIONS ====================

/**
 * Check if user can execute trades
 * GET /api/trade/check-permissions?groupId=...&telegramId=...
 */
export const checkTradePermissions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, telegramId } = req.query;

    if (!groupId || !telegramId) {
      return res.status(400).json({
        success: false,
        message: "groupId and telegramId are required",
      });
    }

    const { canTrade, reason } = await canExecuteTrade(
      groupId as string,
      telegramId as string
    );

    return res.json({
      success: true,
      data: {
        canTrade,
        reason: reason || (canTrade ? "Authorized to trade" : "Not authorized"),
      },
    });
  } catch (error: any) {
    console.error("Error checking trade permissions:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking permissions",
      error: error.message,
    });
  }
};

/**
 * Get fund trading info
 * GET /api/trade/info?groupId=...
 */
export const getFundTradingInfoController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "groupId is required",
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: "Fund not found",
      });
    }

    const tradingInfo = await getFundTradingInfo(groupId as string);

    return res.json({
      success: true,
      message: "Fund trading info retrieved successfully",
      data: {
        ...tradingInfo,
        databaseBalance: Number(fund.balance) / LAMPORTS_PER_SOL,
      },
    });
  } catch (error: any) {
    console.error("Error fetching fund trading info:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching fund trading info",
      error: error.message,
    });
  }
};

/**
 * Get trade history for a fund
 * GET /api/trade/history?groupId=...&limit=10
 */
export const getTradeHistoryController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, limit } = req.query;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "groupId is required",
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: "Fund not found",
      });
    }

    const result = await getTradeHistory(
      groupId as string,
      limit ? parseInt(limit as string) : 10
    );

    return res.json({
      success: result.success,
      message: "Trade history retrieved successfully",
      data: {
        trades: result.trades,
        total: result.total,
      },
    });
  } catch (error: any) {
    console.error("Error fetching trade history:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching trade history",
      error: error.message,
    });
  }
};

/**
 * Get fund statistics
 * GET /api/trade/stats?groupId=...
 */
export const getFundStatistics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "groupId is required",
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
      include: {
        transactions: {
          where: { type: "TRADE" },
        },
      },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: "Fund not found",
      });
    }

    const totalTrades = fund.transactions.length;
    const successfulTrades = fund.transactions.filter(
      (t) => t.status === "CONFIRMED"
    ).length;
    const failedTrades = totalTrades - successfulTrades;

    // Calculate total volume
    const totalVolume = fund.transactions.reduce(
      (sum, t) => sum + t.amount,
      BigInt(0)
    );

    return res.json({
      success: true,
      message: "Fund statistics retrieved successfully",
      data: {
        totalTrades,
        successfulTrades,
        failedTrades,
        totalVolumeSOL: Number(totalVolume) / LAMPORTS_PER_SOL,
        currentBalanceSOL: Number(fund.balance) / LAMPORTS_PER_SOL,
        fundStatus: fund.status,
        fundName: fund.fundName,
        createdAt: fund.createdAt,
        updatedAt: fund.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error fetching fund statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching fund statistics",
      error: error.message,
    });
  }
};
