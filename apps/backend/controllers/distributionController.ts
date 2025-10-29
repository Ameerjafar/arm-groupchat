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
import bs58 from "bs58"; // Add this import
import idl from "../../../contract/groupchat_fund/target/idl/groupchat_fund.json";

// ==================== HELPER FUNCTIONS ====================

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
    // Decrypt the private key (returns base58 string)
    const decryptedBase58String = decryptPrivateKey(encryptedPrivateKey);
    
    // Decode base58 to get secret key bytes
    const secretKey = bs58.decode(decryptedBase58String);

    // Validate secret key length
    if (secretKey.length !== 64) {
      console.error(`Invalid secret key length: ${secretKey.length}, expected 64`);
      return null;
    }

    // Create keypair from secret key
    const keypair = Keypair.fromSecretKey(secretKey);

    // Verify the public key matches the stored wallet address
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

      // Distribute value
      console.log("📤 Executing distribute value transaction...");
      const tx = await distributeValueToMember({
        program,
        groupId,
        memberWallet,
      });

      console.log("✅ Transaction successful:", tx);

      // Save to database
      const distribution = await prisma.distribution.create({
        data: {
          userId: user.telegramId,
          fundId: groupId,
          type: "FULL_CASHOUT",
          amount: distInfo.distributionAmount,
          profitOrLoss: distInfo.profitOrLoss,
          sharesBurned: distInfo.shares,
          txSignature: tx,
          distributedAt: new Date(),
        },
      });

      console.log("💾 Saved to database:", distribution.id);

      res.json({
        success: true,
        data: {
          distribution,
          distributionAmountSOL: Number(distInfo.distributionAmount) / 1e9,
          profitOrLossSOL: Number(distInfo.profitOrLoss) / 1e9,
          status: distInfo.status,
          txSignature: tx,
        },
      });
    } catch (error: any) {
      console.error("❌ Error cashing out:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to cash out",
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

      if (!groupId || !telegramId) {
        return res.status(400).json({
          success: false,
          error: "Group ID and Telegram ID are required",
        });
      }

      const user = await prisma.user.findUnique({
        where: { telegramId },
      });

      if (!user || !user.walletAddress || !user.encryptedPrivateKey) {
        return res.status(404).json({
          success: false,
          error: "User wallet not found",
        });
      }

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

      // Create program with member's wallet
      const program = createProgram(memberKeypair);

      // Calculate profit
      const profitInfo = await calculateProfitOnly({
        program,
        groupId,
        memberWallet,
      });

      if (Number(profitInfo.netProfit) <= 0) {
        return res.status(400).json({
          success: false,
          error: "No profit available to claim",
        });
      }

      // Distribute profit
      const tx = await distributeProfitToMember({
        program,
        groupId,
        memberWallet,
      });

      const distribution = await prisma.distribution.create({
        data: {
          userId: user.telegramId,
          fundId: groupId,
          type: "PROFIT_ONLY",
          amount: profitInfo.netProfit,
          profitOrLoss: profitInfo.grossProfit,
          sharesBurned: "0",
          txSignature: tx,
          distributedAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          distribution,
          netProfitSOL: Number(profitInfo.netProfit) / 1e9,
          grossProfitSOL: Number(profitInfo.grossProfit) / 1e9,
          txSignature: tx,
        },
      });
    } catch (error: any) {
      console.error("❌ Error claiming profit:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to claim profit",
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

      if (!groupId || !authorityTelegramId) {
        return res.status(400).json({
          success: false,
          error: "Group ID and authority Telegram ID are required",
        });
      }

      const connection = getConnection();

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
      const results = await distributeValueToAllMembers({
        program,
        connection,
        groupId,
        memberKeypairs,
      });

      // Save successful distributions to database
      for (const result of results) {
        if (result.success && result.tx) {
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
                txSignature: result.tx,
                distributedAt: new Date(),
              },
            });
          }
        }
      }

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            successful: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
          },
        },
      });
    } catch (error: any) {
      console.error("❌ Error cashing out all:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to cash out all members",
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
