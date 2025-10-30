// controllers/distributionController.ts
import { Request, Response } from "express";
import {
  calculateDistributionAmount,
  calculateProfitOnly,
  distributeValueToMember,
  distributeProfitToMember,
  distributeValueToAllMembers,
  getAllMembersDistributionInfo,
} from "../services/solanaServices/distributionService";
import { prisma } from "@repo/db";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import crypto from "crypto";
import bs58 from "bs58";
import idl from "../../../contract/groupchat_fund/target/idl/groupchat_fund.json";

let connection: Connection;

function initializeSolana() {
  if (!connection) {
    connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );
  }
}

function getConnection(): Connection {
  if (!connection) {
    initializeSolana();
  }
  return connection;
}

function createProgram(walletKeypair?: Keypair): anchor.Program {
  const conn = getConnection();
  
  const wallet = walletKeypair 
    ? new anchor.Wallet(walletKeypair)
    : {
        publicKey: PublicKey.default,
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any[]) => txs,
      } as any;

  const provider = new anchor.AnchorProvider(conn, wallet as any, {
    commitment: "confirmed",
  });

  return new anchor.Program(idl as any, provider);
}

function getProgram(): anchor.Program {
  return createProgram();
}

/**
 * Decrypt encrypted private key
 */
function decryptPrivateKey(encryptedKey: string): string {
  const keyBuffer = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");

  const parts = encryptedKey.split(":");
  const iv = Buffer.from(parts[0]!, "hex");
  const encryptedText = parts[1];

  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
  let decrypted = decipher.update(encryptedText!, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Get keypair from encrypted private key with validation
 */
function getKeypairFromEncrypted(
  encryptedPrivateKey: string,
  expectedWalletAddress: string
): Keypair | null {
  try {
    const decryptedBase58String = decryptPrivateKey(encryptedPrivateKey);
    const secretKey = bs58.decode(decryptedBase58String);

    if (secretKey.length !== 64) {
      console.error(`Invalid secret key length: ${secretKey.length}, expected 64`);
      return null;
    }

    const keypair = Keypair.fromSecretKey(secretKey);

    if (keypair.publicKey.toString() !== expectedWalletAddress) {
      console.error("Decrypted keypair does not match stored wallet address");
      console.error("Expected:", expectedWalletAddress);
      console.error("Got:", keypair.publicKey.toString());
      return null;
    }

    return keypair;
  } catch (error: any) {
    console.error("Error decrypting keypair:", error);
    return null;
  }
}

/**
 * Fetch on-chain account with retry logic
 */
async function fetchAccountWithRetry(
  program: anchor.Program,
  accountType: string,
  pda: PublicKey,
  maxRetries: number = 3
): Promise<any> {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Fetching ${accountType} account at ${pda.toString()}...`);
      const account = await (program.account as any)[accountType].fetch(pda);
      console.log(`✅ Successfully fetched ${accountType} account`);
      return account;
    } catch (err: any) {
      lastError = err;
      console.error(`Attempt ${i + 1}/${maxRetries} failed:`, err.message);
      
      if (i === maxRetries - 1) {
        console.error(`Failed to fetch ${accountType} account after ${maxRetries} attempts`);
        throw new Error(`Failed to fetch ${accountType} account: ${err.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  
  throw lastError;
}

/**
 * Derive PDAs for fund and member
 */
function derivePDAs(program: anchor.Program, groupId: string, memberWallet: PublicKey) {
  const [fundPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), Buffer.from(groupId)],
    program.programId
  );

  const [memberPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("member"), fundPDA.toBuffer(), memberWallet.toBuffer()],
    program.programId
  );

  console.log("📍 Derived PDAs:", {
    fundPDA: fundPDA.toString(),
    memberPDA: memberPDA.toString(),
    groupId,
    programId: program.programId.toString(),
  });

  return { fundPDA, memberPDA };
}

// ==================== CONTROLLER ====================

export const distributionController = {
  /**
   * Calculate distribution amount for a member
   * GET /api/distribution/calculate/:groupId/:walletAddress
   */
  calculateDistribution: async (req: Request, res: Response) => {
    try {
      const { groupId, walletAddress } = req.params;

      if (!groupId || !walletAddress) {
        return res.status(400).json({
          success: false,
          error: "Group ID and wallet address are required",
        });
      }

      const program = getProgram();
      const memberWallet = new PublicKey(walletAddress);

      const distributionInfo = await calculateDistributionAmount({
        program,
        groupId,
        memberWallet,
      });

      res.json({
        success: true,
        data: {
          ...distributionInfo,
          currentValueSOL: Number(distributionInfo.currentValue) / 1e9,
          distributionAmountSOL:
            Number(distributionInfo.distributionAmount) / 1e9,
          profitOrLossSOL: Number(distributionInfo.profitOrLoss) / 1e9,
          tradingFeeSOL: Number(distributionInfo.tradingFee) / 1e9,
          initialContributionSOL:
            Number(distributionInfo.initialContribution) / 1e9,
        },
      });
    } catch (error: any) {
      console.error("Error calculating distribution:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to calculate distribution",
      });
    }
  },

  /**
   * Calculate profit-only distribution for a member
   * GET /api/distribution/profit/:groupId/:walletAddress
   */
  calculateProfit: async (req: Request, res: Response) => {
    try {
      const { groupId, walletAddress } = req.params;

      if (!groupId || !walletAddress) {
        return res.status(400).json({
          success: false,
          error: "Group ID and wallet address are required",
        });
      }

      const program = getProgram();
      const memberWallet = new PublicKey(walletAddress);

      const profitInfo = await calculateProfitOnly({
        program,
        groupId,
        memberWallet,
      });

      res.json({
        success: true,
        data: {
          ...profitInfo,
          currentValueSOL: Number(profitInfo.currentValue) / 1e9,
          netProfitSOL: Number(profitInfo.netProfit) / 1e9,
          grossProfitSOL: Number(profitInfo.grossProfit) / 1e9,
          feeSOL: Number(profitInfo.fee) / 1e9,
          initialContributionSOL:
            Number(profitInfo.initialContribution) / 1e9,
        },
      });
    } catch (error: any) {
      console.error("Error calculating profit:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to calculate profit",
      });
    }
  },

  /**
   * Distribute full value to a member (cash out)
   * POST /api/distribution/cashout
   */
  cashOut: async (req: Request, res: Response) => {
    try {
      const { groupId, telegramId } = req.body;

      console.log("📥 Cash out request:", { groupId, telegramId });

      if (!groupId || !telegramId) {
        return res.status(400).json({
          success: false,
          error: "Group ID and Telegram ID are required",
        });
      }

      const conn = getConnection();

      // Get user with wallet using telegramId
      const user = await prisma.user.findUnique({
        where: { telegramId },
      });

      if (!user || !user.walletAddress || !user.encryptedPrivateKey) {
        return res.status(404).json({
          success: false,
          error: "User wallet not found",
        });
      }

      console.log("👤 User found:", user.username);

      const memberWallet = new PublicKey(user.walletAddress);

      // Decrypt private key and create keypair with validation
      const memberKeypair = getKeypairFromEncrypted(
        user.encryptedPrivateKey,
        user.walletAddress
      );

      if (!memberKeypair) {
        return res.status(500).json({
          success: false,
          error: "Failed to decrypt private key",
        });
      }

      console.log("🔑 Keypair created successfully");

      // Create program with member's wallet
      const program = createProgram(memberKeypair);

      // Calculate what they'll receive
      const distInfo = await calculateDistributionAmount({
        program,
        groupId,
        memberWallet,
      });

      console.log("💰 Distribution info:", {
        amount: Number(distInfo.distributionAmount) / 1e9,
        status: distInfo.status,
      });

      if (Number(distInfo.distributionAmount) <= 0) {
        return res.status(400).json({
          success: false,
          error: "No value to distribute",
        });
      }

      // Get fund record
      const fund = await prisma.fund.findUnique({
        where: { groupId },
      });

      if (!fund) {
        return res.status(404).json({
          success: false,
          error: "Fund not found in database",
        });
      }

      // Distribute value
      console.log("📤 Executing distribute value transaction...");
      const txSignature = await distributeValueToMember({
        program,
        groupId,
        memberWallet,
      });

      console.log("✅ Transaction successful:", txSignature);

      // CONFIRM TRANSACTION
      console.log("⏳ Confirming transaction...");
      await conn.confirmTransaction(txSignature, "confirmed");
      console.log("✅ Transaction confirmed");

      // SAVE TO DATABASE FIRST (before trying to fetch on-chain state)
      console.log("💾 Saving distribution to database...");
      const distribution = await prisma.distribution.create({
        data: {
          userId: user.telegramId,
          fundId: groupId,
          type: "FULL_CASHOUT",
          amount: distInfo.distributionAmount,
          profitOrLoss: distInfo.profitOrLoss,
          sharesBurned: distInfo.shares,
          txSignature: txSignature,
          distributedAt: new Date(),
        },
      });

      console.log("✅ Distribution saved:", distribution.id);

      // TRY TO FETCH UPDATED ON-CHAIN STATE (but don't fail if it doesn't work)
      let onChainState = null;
      try {
        console.log("📊 Attempting to fetch updated on-chain state...");
        const { fundPDA, memberPDA } = derivePDAs(program, groupId, memberWallet);

        const memberAccount = await fetchAccountWithRetry(program, "member", memberPDA).catch(err => {
          console.warn("Could not fetch member account:", err.message);
          return null;
        });

        const fundAccount = await fetchAccountWithRetry(program, "fund", fundPDA).catch(err => {
          console.warn("Could not fetch fund account:", err.message);
          return null;
        });

        if (fundAccount && memberAccount) {
          console.log("📊 Updated on-chain state:", {
            memberShares: memberAccount?.shares?.toString() || "N/A",
            fundTotalShares: fundAccount.totalShares?.toString() || "N/A",
            fundBalance: fundAccount.totalValue?.toString() || "N/A", // ✅ FIXED: Use totalValue not balance
          });

          onChainState = {
            memberShares: memberAccount?.shares?.toString() || "0",
            fundBalance: fundAccount.totalValue?.toString() || "0", // ✅ FIXED
            fundTotalShares: fundAccount.totalShares?.toString() || "0",
          };

          // Update fund balance if we successfully fetched it
          await prisma.fund.update({
            where: { groupId },
            data: {
              balance: BigInt(fundAccount.totalValue.toString()), // ✅ FIXED: Convert totalValue to BigInt
              updatedAt: new Date(),
            },
          });

          console.log("💾 Fund balance updated in database");
        } else {
          console.warn("⚠️ Could not fetch all account data, skipping balance update");
        }
      } catch (error: any) {
        console.error("⚠️ Error fetching on-chain state (non-fatal):", error.message);
      }

      res.json({
        success: true,
        data: {
          distribution,
          distributionAmountSOL: Number(distInfo.distributionAmount) / 1e9,
          profitOrLossSOL: Number(distInfo.profitOrLoss) / 1e9,
          status: distInfo.status,
          txSignature: txSignature,
          onChainState: onChainState || { note: "On-chain state not available yet" },
        },
      });
    } catch (error: any) {
      console.error("❌ Error cashing out:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to cash out",
        details: error.toString(),
      });
    }
  },

  /**
   * Distribute profit only to a member
   * POST /api/distribution/claim-profit
   */
  claimProfit: async (req: Request, res: Response) => {
    try {
      const { groupId, telegramId } = req.body;

      console.log("📥 Claim profit request:", { groupId, telegramId });

      if (!groupId || !telegramId) {
        return res.status(400).json({
          success: false,
          error: "Group ID and Telegram ID are required",
        });
      }

      const conn = getConnection();

      const user = await prisma.user.findUnique({
        where: { telegramId },
      });

      if (!user || !user.walletAddress || !user.encryptedPrivateKey) {
        return res.status(404).json({
          success: false,
          error: "User wallet not found",
        });
      }

      console.log("👤 User found:", user.username);

      const memberWallet = new PublicKey(user.walletAddress);

      // Decrypt private key and create keypair with validation
      const memberKeypair = getKeypairFromEncrypted(
        user.encryptedPrivateKey,
        user.walletAddress
      );

      if (!memberKeypair) {
        return res.status(500).json({
          success: false,
          error: "Failed to decrypt private key",
        });
      }

      console.log("🔑 Keypair created successfully");

      // Create program with member's wallet
      const program = createProgram(memberKeypair);

      // Calculate profit
      const profitInfo = await calculateProfitOnly({
        program,
        groupId,
        memberWallet,
      });

      console.log("💰 Profit info:", {
        netProfit: Number(profitInfo.netProfit) / 1e9,
        grossProfit: Number(profitInfo.grossProfit) / 1e9,
      });

      if (Number(profitInfo.netProfit) <= 0) {
        return res.status(400).json({
          success: false,
          error: "No profit available to claim",
        });
      }

      // Get fund record
      const fund = await prisma.fund.findUnique({
        where: { groupId },
      });

      if (!fund) {
        return res.status(404).json({
          success: false,
          error: "Fund not found in database",
        });
      }

      // Distribute profit
      console.log("📤 Executing distribute profit transaction...");
      const txSignature = await distributeProfitToMember({
        program,
        groupId,
        memberWallet,
      });

      console.log("✅ Transaction successful:", txSignature);

      // CONFIRM TRANSACTION
      console.log("⏳ Confirming transaction...");
      await conn.confirmTransaction(txSignature, "confirmed");
      console.log("✅ Transaction confirmed");

      // SAVE TO DATABASE FIRST
      console.log("💾 Saving distribution to database...");
      const distribution = await prisma.distribution.create({
        data: {
          userId: user.telegramId,
          fundId: groupId,
          type: "PROFIT_ONLY",
          amount: profitInfo.netProfit,
          profitOrLoss: profitInfo.grossProfit,
          sharesBurned: "0",
          txSignature: txSignature,
          distributedAt: new Date(),
        },
      });

      console.log("✅ Distribution saved:", distribution.id);

      // TRY TO FETCH UPDATED ON-CHAIN STATE
      let onChainState = null;
      try {
        console.log("📊 Attempting to fetch updated on-chain state...");
        const { fundPDA } = derivePDAs(program, groupId, memberWallet);

        const fundAccount = await fetchAccountWithRetry(program, "fund", fundPDA).catch(err => {
          console.warn("Could not fetch fund account:", err.message);
          return null;
        });

        if (fundAccount) {
          console.log("📊 Updated on-chain state:", {
            fundBalance: fundAccount.totalValue?.toString() || "N/A", // ✅ FIXED
          });

          onChainState = {
            fundBalance: fundAccount.totalValue?.toString() || "0", // ✅ FIXED
          };

          // Update fund balance
          await prisma.fund.update({
            where: { groupId },
            data: {
              balance: BigInt(fundAccount.totalValue.toString()), // ✅ FIXED
              updatedAt: new Date(),
            },
          });

          console.log("💾 Fund balance updated in database");
        } else {
          console.warn("⚠️ Could not fetch fund account, skipping balance update");
        }
      } catch (error: any) {
        console.error("⚠️ Error fetching on-chain state (non-fatal):", error.message);
      }

      res.json({
        success: true,
        data: {
          distribution,
          netProfitSOL: Number(profitInfo.netProfit) / 1e9,
          grossProfitSOL: Number(profitInfo.grossProfit) / 1e9,
          txSignature: txSignature,
          onChainState: onChainState || { note: "On-chain state not available yet" },
        },
      });
    } catch (error: any) {
      console.error("❌ Error claiming profit:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to claim profit",
        details: error.toString(),
      });
    }
  },

  /**
   * Cash out all members in a fund
   * POST /api/distribution/cashout-all
   */
  cashOutAll: async (req: Request, res: Response) => {
    try {
      const { groupId, authorityTelegramId } = req.body;

      console.log("📥 Cash out all request:", { groupId, authorityTelegramId });

      if (!groupId || !authorityTelegramId) {
        return res.status(400).json({
          success: false,
          error: "Group ID and authority Telegram ID are required",
        });
      }

      const conn = getConnection();

      // Verify authority
      const fund = await prisma.fund.findUnique({
        where: { groupId },
      });

      if (!fund) {
        return res.status(404).json({
          success: false,
          error: "Fund not found",
        });
      }

      if (fund.authority !== authorityTelegramId) {
        return res.status(403).json({
          success: false,
          error: "Only fund authority can cash out all members",
        });
      }

      console.log("✅ Authority verified");

      // Get all members who have contributed to this fund
      const contributions = await prisma.contribution.findMany({
        where: { fundId: fund.id },
        select: { contributorTelegramId: true },
        distinct: ["contributorTelegramId"],
      });

      const telegramIds = contributions.map((c) => c.contributorTelegramId);

      const members = await prisma.user.findMany({
        where: {
          telegramId: {
            in: telegramIds,
          },
        },
      });

      console.log(`👥 Found ${members.length} members to cash out`);

      // Create keypair map
      const memberKeypairs = new Map();
      for (const member of members) {
        if (member.walletAddress && member.encryptedPrivateKey) {
          const keypair = getKeypairFromEncrypted(
            member.encryptedPrivateKey,
            member.walletAddress
          );
          
          if (keypair) {
            memberKeypairs.set(member.walletAddress, keypair);
          } else {
            console.error(`Failed to decrypt key for ${member.username}`);
          }
        }
      }

      // Create program for batch operations
      const program = getProgram();

      // Distribute to all
      console.log("📤 Executing batch distributions...");
      const results = await distributeValueToAllMembers({
        program,
        connection: conn,
        groupId,
        memberKeypairs,
      });

      console.log(`✅ Batch distributions completed: ${results.length} results`);

      // Confirm all successful transactions
      const successfulResults = results.filter(r => r.success && r.tx);
      
      console.log("⏳ Confirming all transactions...");
      await Promise.all(
        successfulResults.map(r => conn.confirmTransaction(r.tx!, "confirmed"))
      );
      console.log("✅ All transactions confirmed");

      // Save successful distributions to database
      console.log("💾 Syncing database for all distributions...");
      for (const result of successfulResults) {
        const user = await prisma.user.findFirst({
          where: {
            walletAddress: result.wallet,
          },
        });

        if (user) {
          await prisma.distribution.create({
            data: {
              userId: user.telegramId,
              fundId: groupId,
              type: "FULL_CASHOUT",
              amount: result.distributionAmount || "0",
              profitOrLoss: result.profitOrLoss || "0",
              sharesBurned: result.shares,
              txSignature: result.tx!,
              distributedAt: new Date(),
            },
          });
        }
      }

      // TRY to fetch final fund state
      let onChainState = null;
      try {
        const { fundPDA } = derivePDAs(program, groupId, PublicKey.default);
        const fundAccount = await fetchAccountWithRetry(program, "fund", fundPDA).catch(() => null);

        if (fundAccount) {
          onChainState = {
            fundBalance: fundAccount.totalValue?.toString() || "0", // ✅ FIXED
            fundTotalShares: fundAccount.totalShares?.toString() || "0",
          };

          // Update fund with final on-chain balance
          await prisma.fund.update({
            where: { groupId },
            data: {
              balance: BigInt(fundAccount.totalValue.toString()), // ✅ FIXED
              updatedAt: new Date(),
            },
          });
        }
      } catch (error: any) {
        console.error("⚠️ Error fetching final fund state (non-fatal):", error.message);
      }

      console.log("💾 Database synced successfully for all members");

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            successful: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
          },
          onChainState: onChainState || { note: "On-chain state not available yet" },
        },
      });
    } catch (error: any) {
      console.error("❌ Error cashing out all:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to cash out all members",
        details: error.toString(),
      });
    }
  },

  /**
   * Get all members' distribution info
   * GET /api/distribution/all/:groupId
   */
  getAllMembersInfo: async (req: Request, res: Response) => {
    try {
      const { groupId } = req.params;

      if (!groupId) {
        return res.status(400).json({
          success: false,
          error: "Group ID is required",
        });
      }

      const program = getProgram();

      const membersInfo = await getAllMembersDistributionInfo({
        program,
        groupId,
      });

      const formattedInfo = membersInfo.map((info) => ({
        ...info,
        distributionInfo: {
          ...info.distributionInfo,
          currentValueSOL: Number(info.distributionInfo.currentValue) / 1e9,
          distributionAmountSOL:
            Number(info.distributionInfo.distributionAmount) / 1e9,
          profitOrLossSOL: Number(info.distributionInfo.profitOrLoss) / 1e9,
          tradingFeeSOL: Number(info.distributionInfo.tradingFee) / 1e9,
        },
      }));

      res.json({
        success: true,
        data: formattedInfo,
      });
    } catch (error: any) {
      console.error("Error getting all members info:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get members info",
      });
    }
  },

  /**
   * Get distribution history for a user
   * GET /api/distribution/history/:telegramId
   */
  getDistributionHistory: async (req: Request, res: Response) => {
    try {
      const { telegramId } = req.params;
      const { groupId } = req.query;

      if (!telegramId) {
        return res.status(400).json({
          success: false,
          error: "Telegram ID is required",
        });
      }

      const where: any = { userId: telegramId };
      if (groupId) {
        where.fundId = groupId as string;
      }

      const distributions = await prisma.distribution.findMany({
        where,
        orderBy: { distributedAt: "desc" },
        include: {
          user: {
            select: {
              telegramId: true,
              username: true,
            },
          },
        },
      });

      const formattedDistributions = distributions.map((dist) => ({
        ...dist,
        amountSOL: Number(dist.amount) / 1e9,
        profitOrLossSOL: Number(dist.profitOrLoss) / 1e9,
      }));

      res.json({
        success: true,
        data: formattedDistributions,
      });
    } catch (error: any) {
      console.error("Error getting distribution history:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get distribution history",
      });
    }
  },

  /**
   * Get distribution statistics for a fund
   * GET /api/distribution/stats/:groupId
   */
  getFundStats: async (req: Request, res: Response) => {
    try {
      const { groupId } = req.params;

      if (!groupId) {
        return res.status(400).json({
          success: false,
          error: "Group ID is required",
        });
      }

      const distributions = await prisma.distribution.findMany({
        where: { fundId: groupId },
        orderBy: { distributedAt: "desc" },
      });

      const totalDistributed = distributions.reduce(
        (sum, d) => sum + BigInt(d.amount),
        BigInt(0)
      );

      const totalProfit = distributions.reduce((sum, d) => {
        const pl = BigInt(d.profitOrLoss);
        return pl > BigInt(0) ? sum + pl : sum;
      }, BigInt(0));

      const totalLoss = distributions.reduce((sum, d) => {
        const pl = BigInt(d.profitOrLoss);
        return pl < BigInt(0) ? sum + pl : sum;
      }, BigInt(0));

      const cashOutCount = distributions.filter(
        (d) => d.type === "FULL_CASHOUT"
      ).length;
      const profitClaimCount = distributions.filter(
        (d) => d.type === "PROFIT_ONLY"
      ).length;

      res.json({
        success: true,
        data: {
          totalDistributions: distributions.length,
          totalDistributedSOL: Number(totalDistributed) / 1e9,
          totalProfitSOL: Number(totalProfit) / 1e9,
          totalLossSOL: Math.abs(Number(totalLoss)) / 1e9,
          cashOutCount,
          profitClaimCount,
          lastDistribution: distributions[0]?.distributedAt || null,
        },
      });
    } catch (error: any) {
      console.error("Error getting fund stats:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get fund statistics",
      });
    }
  },

  /**
   * Get member's current position
   * GET /api/distribution/position/:groupId/:telegramId
   */
  getMemberPosition: async (req: Request, res: Response) => {
    try {
      const { groupId, telegramId } = req.params;

      if (!groupId || !telegramId) {
        return res.status(400).json({
          success: false,
          error: "Group ID and Telegram ID are required",
        });
      }

      const program = getProgram();

      const user = await prisma.user.findUnique({
        where: { telegramId },
      });

      if (!user || !user.walletAddress) {
        return res.status(404).json({
          success: false,
          error: "User wallet not found",
        });
      }

      const memberWallet = new PublicKey(user.walletAddress);

      const [distInfo, profitInfo] = await Promise.all([
        calculateDistributionAmount({
          program,
          groupId,
          memberWallet,
        }),
        calculateProfitOnly({
          program,
          groupId,
          memberWallet,
        }).catch(() => null),
      ]);

      res.json({
        success: true,
        data: {
          cashOutInfo: {
            ...distInfo,
            currentValueSOL: Number(distInfo.currentValue) / 1e9,
            distributionAmountSOL: Number(distInfo.distributionAmount) / 1e9,
            profitOrLossSOL: Number(distInfo.profitOrLoss) / 1e9,
          },
          profitOnlyInfo: profitInfo
            ? {
                ...profitInfo,
                netProfitSOL: Number(profitInfo.netProfit) / 1e9,
                grossProfitSOL: Number(profitInfo.grossProfit) / 1e9,
              }
            : null,
        },
      });
    } catch (error: any) {
      console.error("Error getting member position:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get member position",
      });
    }
  },
};
