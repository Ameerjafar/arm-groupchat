import { Request, Response, NextFunction } from 'express';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { prisma } from '@repo/db';
import { contributeToFund, getFundInfo, getMemberShares } from '../services/solanaServices/contributService';

// Create a contribution (handles both blockchain and database)
export const createContribution = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    console.log("inside the create contribution");
    const { groupId, telegramId, amountSol } = req.body;

    // Validate inputs
    if (!groupId || !telegramId || !amountSol) {
      return res.status(400).json({
        success: false,
        message: 'groupId, telegramId, and amountSol are required',
      });
    }

    if (amountSol <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0',
      });
    }

    // Check if fund exists
    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    if (fund.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: `Fund is ${fund.status}. Contributions are not allowed.`,
      });
    }

    // Check minimum contribution
    const minContributionSol = Number(fund.minContribution) / LAMPORTS_PER_SOL;
    if (amountSol < minContributionSol) {
      return res.status(400).json({
        success: false,
        message: `Minimum contribution is ${minContributionSol} SOL`,
      });
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user?.walletAddress) {
      return res.status(404).json({
        success: false,
        message: 'User wallet not found',
      });
    }

    // Execute contribution on blockchain
    const blockchainResult = await contributeToFund(groupId, telegramId, amountSol);

    // Use shares from blockchain result
    const sharesMinted = BigInt(blockchainResult.sharesMinted);
    const amountInLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    // Store in database using transaction
    const [contribution, updatedFund, transaction] = await prisma.$transaction([
      // Create contribution record
      prisma.contribution.create({
        data: {
          fundId: fund.id,
          contributorTelegramId: telegramId,
          contributorWallet: user.walletAddress,
          amount: BigInt(amountInLamports),
          sharesMinted: sharesMinted,
          transactionSignature: blockchainResult.transactionSignature,
        },
      }),
      // Update fund balance
      prisma.fund.update({
        where: { id: fund.id },
        data: {
          balance: {
            increment: BigInt(amountInLamports),
          },
        },
      }),
      // Create transaction record
      prisma.transaction.create({
        data: {
          fundId: fund.id,
          type: 'CONTRIBUTION',
          amount: BigInt(amountInLamports),
          signature: blockchainResult.transactionSignature,
          fromAddress: user.walletAddress,
          toAddress: fund.fundPdaAddress,
          initiator: user.walletAddress,
          status: 'CONFIRMED',
        },
      }),
    ]);

    return res.status(201).json({
      success: true,
      message: 'Contribution successful',
      data: {
        contributionId: contribution.id,
        amount: contribution.amount.toString(),
        amountSol: amountSol,
        sharesMinted: contribution.sharesMinted.toString(),
        transactionSignature: contribution.transactionSignature,
        fundBalance: updatedFund.balance.toString(),
        fundBalanceSol: Number(updatedFund.balance) / LAMPORTS_PER_SOL,
      },
    });
  } catch (error: any) {
    console.error('Contribution error:', error);

    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Duplicate transaction signature',
      });
    }

    if (error.message?.includes('below minimum')) {
      return res.status(400).json({
        success: false,
        message: 'Contribution below minimum required',
      });
    }

    if (error.message?.includes('not active')) {
      return res.status(400).json({
        success: false,
        message: 'Fund is not active',
      });
    }

    return next(error);
  }
};

// ✅ NEW: Get user's shares in a fund (for /myshares command)
export const getMyShares = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    console.log("this is calling correctly");
    const { groupId, telegramId } = req.query;

    if (!groupId || !telegramId) {
      return res.status(400).json({
        success: false,
        message: 'groupId and telegramId are required',
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    const contributions = await prisma.contribution.findMany({
      where: {
        fundId: fund.id,
        contributorTelegramId: telegramId as string,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (contributions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No contributions found for this fund',
      });
    }

    // Calculate totals from database
    const totalContributed = contributions.reduce(
      (sum, c) => sum + c.amount,
      BigInt(0)
    );

    const totalSharesFromDb = contributions.reduce(
      (sum, c) => sum + c.sharesMinted,
      BigInt(0)
    );

    // ✅ Get on-chain fund info (source of truth for total shares and balance)
    let blockchainFundInfo;
    try {
      blockchainFundInfo = await getFundInfo(groupId as string);
    } catch (error) {
      console.error('Error fetching blockchain fund info:', error);
      // If blockchain call fails, return error
      return res.status(503).json({
        success: false,
        message: 'Unable to fetch blockchain data. Please try again.',
      });
    }

    // ✅ Get on-chain member shares (source of truth for user's shares)
    let onChainShares;
    try {
      onChainShares = await getMemberShares(groupId as string, telegramId as string);
    } catch (error) {
      console.error('Error fetching on-chain shares:', error);
      // Fallback to database if blockchain call fails
      onChainShares = {
        shares: totalSharesFromDb.toString(),
        totalContributed: Number(totalContributed) / LAMPORTS_PER_SOL,
        isActive: true,
      };
    }

    // Get all fund contributors for comparison
    const allContributions = await prisma.contribution.findMany({
      where: { fundId: fund.id },
    });

    // ✅ Use BLOCKCHAIN total shares (not database)
    const blockchainTotalShares = BigInt(blockchainFundInfo.totalShares);
    const blockchainTotalValue = blockchainFundInfo.totalValue * LAMPORTS_PER_SOL; // Convert SOL to lamports

    // ✅ Calculate ownership percentage using blockchain data
    const userShares = BigInt(onChainShares.shares);
    const ownershipPercentage = blockchainTotalShares > BigInt(0)
      ? (Number(userShares) / Number(blockchainTotalShares)) * 100
      : 0;

    // ✅ Calculate current value of shares using blockchain fund value
    const shareValue = blockchainTotalShares > BigInt(0)
      ? (Number(userShares) / Number(blockchainTotalShares)) * blockchainTotalValue
      : 0;

    const totalContributedValue = Number(totalContributed);
    const profitLoss = shareValue - totalContributedValue;
    const profitLossPercentage = totalContributedValue > 0
      ? (profitLoss / totalContributedValue) * 100
      : 0;

    return res.json({
      success: true,
      data: {
        // User's position
        userPosition: {
          shares: onChainShares.shares,
          totalContributed: totalContributed.toString(),
          totalContributedSol: Number(totalContributed) / LAMPORTS_PER_SOL,
          numberOfContributions: contributions.length,
          isActive: onChainShares.isActive,
          ownershipPercentage: ownershipPercentage.toFixed(2),
          currentValue: shareValue,
          currentValueSol: shareValue / LAMPORTS_PER_SOL,
          profitLoss: profitLoss,
          profitLossSol: profitLoss / LAMPORTS_PER_SOL,
          profitLossPercentage: profitLossPercentage.toFixed(2),
        },
        
        // Fund info (from blockchain)
        fundInfo: {
          fundName: fund.fundName,
          groupId: fund.groupId,
          status: fund.status,
          totalBalance: blockchainFundInfo.totalValue.toString(), // From blockchain
          totalBalanceSol: blockchainFundInfo.totalValue, // Already in SOL
          totalShares: blockchainFundInfo.totalShares, // From blockchain
          totalContributors: new Set(allContributions.map(c => c.contributorTelegramId)).size,
          totalContributions: allContributions.length,
          minContribution: blockchainFundInfo.minContribution,
          tradingFeeBps: blockchainFundInfo.tradingFeeBps,
          isActive: blockchainFundInfo.isActive,
        },

        // User's contribution history (last 5)
        recentContributions: contributions.slice(0, 5).map(c => ({
          id: c.id,
          amount: c.amount.toString(),
          amountSol: Number(c.amount) / LAMPORTS_PER_SOL,
          sharesMinted: c.sharesMinted.toString(),
          transactionSignature: c.transactionSignature,
          createdAt: c.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('Get my shares error:', error);
    return next(error);
  }
};


// Get contributions by fund
export const getContributionsByFund = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId } = req.query;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    const [contributions, total] = await prisma.$transaction([
      prisma.contribution.findMany({
        where: { fundId: fund.id },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.contribution.count({ where: { fundId: fund.id } }),
    ]);

    const totalContributed = contributions.reduce(
      (sum, c) => sum + c.amount,
      BigInt(0)
    );

    return res.json({
      success: true,
      data: contributions.map(c => ({
        id: c.id,
        contributorTelegramId: c.contributorTelegramId,
        contributorWallet: c.contributorWallet,
        amount: c.amount.toString(),
        amountSol: Number(c.amount) / LAMPORTS_PER_SOL,
        sharesMinted: c.sharesMinted.toString(),
        transactionSignature: c.transactionSignature,
        createdAt: c.createdAt,
      })),
      summary: {
        totalContributions: total,
        totalAmount: totalContributed.toString(),
        totalAmountSol: Number(totalContributed) / LAMPORTS_PER_SOL,
      },
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get contributions error:', error);
    return next(error);
  }
};

// Get contributions by contributor (user)
export const getContributionsByContributor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { telegramId } = req.query;

    const contributions = await prisma.contribution.findMany({
      where: { contributorTelegramId: telegramId as string },
      include: {
        fund: {
          select: {
            groupId: true,
            fundName: true,
            fundPdaAddress: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalContributed = contributions.reduce(
      (sum, c) => sum + c.amount,
      BigInt(0)
    );

    const totalSharesEarned = contributions.reduce(
      (sum, c) => sum + c.sharesMinted,
      BigInt(0)
    );

    return res.json({
      success: true,
      data: contributions.map(c => ({
        id: c.id,
        fundName: c.fund.fundName,
        groupId: c.fund.groupId,
        fundStatus: c.fund.status,
        amount: c.amount.toString(),
        amountSol: Number(c.amount) / LAMPORTS_PER_SOL,
        sharesMinted: c.sharesMinted.toString(),
        transactionSignature: c.transactionSignature,
        createdAt: c.createdAt,
      })),
      summary: {
        totalContributions: contributions.length,
        totalAmount: totalContributed.toString(),
        totalAmountSol: Number(totalContributed) / LAMPORTS_PER_SOL,
        totalSharesEarned: totalSharesEarned.toString(),
        fundsContributedTo: new Set(contributions.map(c => c.fund.groupId)).size,
      },
    });
  } catch (error) {
    console.error('Get contributor contributions error:', error);
    return next(error);
  }
};

// Get user's contribution to a specific fund
export const getUserFundContribution = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, telegramId } = req.query;

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    const contributions = await prisma.contribution.findMany({
      where: {
        fundId: fund.id,
        contributorTelegramId: telegramId as string,
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalContributed = contributions.reduce(
      (sum, c) => sum + c.amount,
      BigInt(0)
    );

    const totalShares = contributions.reduce(
      (sum, c) => sum + c.sharesMinted,
      BigInt(0)
    );

    return res.json({
      success: true,
      data: {
        contributions: contributions.map(c => ({
          id: c.id,
          amount: c.amount.toString(),
          amountSol: Number(c.amount) / LAMPORTS_PER_SOL,
          sharesMinted: c.sharesMinted.toString(),
          transactionSignature: c.transactionSignature,
          createdAt: c.createdAt,
        })),
        summary: {
          totalContributions: contributions.length,
          totalAmount: totalContributed.toString(),
          totalAmountSol: Number(totalContributed) / LAMPORTS_PER_SOL,
          totalShares: totalShares.toString(),
        },
      },
    });
  } catch (error) {
    console.error('Get user fund contribution error:', error);
    return next(error);
  }
};
