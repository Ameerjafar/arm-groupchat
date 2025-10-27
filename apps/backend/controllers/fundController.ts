// Create a new fund
// controllers/fundController.ts
import { Request, Response, NextFunction } from 'express';
import { initializeFundOnBlockchain, closeFundOnBlockchain, pauseFundOnBlockchain, resumeFundOnBlockchain } from '../services/solanaServices/fundService';
import { prisma } from '@repo/db';
// Create a new fund
export const createFund = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const {
      groupId,
      fundName,
      telegramId,
      minContribution,
      tradingFeeBps = 100, // 1% default
    } = req.body;

    // First, check if user exists and has a wallet
    console.log("")
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user?.walletAddress) {
      return res.status(405).json({ 
        success: false,
        message: "User does not exist or wallet not connected" 
      });
    }
    const fundExist = await prisma.fund.findUnique({
      where: {
        groupId
      }
    })
    if(fundExist) {
      return res.status(403).json({message: "fund account already exists for this group"});
    }

    const blockchainResponse = await initializeFundOnBlockchain(
      groupId,
      fundName,
      minContribution,
      tradingFeeBps,
      telegramId
    );
    if(!blockchainResponse) return;
    // Now store the blockchain data in database
    const fund = await prisma.fund.create({
      data: {
        groupId,
        fundPdaAddress: blockchainResponse.fundPdaAddress,
        authority: String(blockchainResponse.authority),
        initiator: user.walletAddress,
        minContribution,
        tradingFeeBps,
        fundName,
        transactionSignature: blockchainResponse.transactionSignature,
        
        balance: BigInt(0), 
        status: 'ACTIVE',
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Fund created successfully',
      data: {
        ...fund,
        minContribution: fund.minContribution.toString(),
        tradingFeeBps: fund.tradingFeeBps.toString(),
        balance: fund.balance.toString(), 
        fundName
      },
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Fund already exists for this group',
      });
    }
    return next(error);
  }
};

// Check if fund exists
export const checkFundExists = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
    console.log("inside the exist function");
  try {
    const { groupId } = req.body;

    const fund = await prisma.fund.findUnique({
      where: { groupId },
      select: {
        id: true,
        fundPdaAddress: true,
        balance: true,
        status: true,
        createdAt: true,
      },
    });

    if (fund) {
      return res.json({
        exists: true,
        fund: {
          ...fund,
          balance: fund.balance.toString(),
        },
      });
    }

    return res.json({ exists: false });
  } catch (error) {
    return next(error);
  }
};

// Get fund by groupId
export const getFundByGroupId = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId } = req.query;

    // Validate groupId
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'groupId is required',
      });
    }

    // Fetch fund
    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    console.log('Fund fetched:', fund?.id);

    // Check if fund exists
    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found for this group',
      });
    }

    // Get owner/initiator details
    const owner = await prisma.user.findUnique({
      where: { walletAddress: fund.initiator || undefined },
      select: {
        telegramId: true,
        username: true,
        walletAddress: true,
      },
    });

    return res.json({
      success: true,
      message: 'Fund retrieved successfully',
      data: {
        // Basic fund info
        id: fund.id,
        groupId: fund.groupId,
        fundPdaAddress: fund.fundPdaAddress,
        authority: fund.authority,
        
        // Owner/Initiator info
        owner: owner ? {
          telegramId: owner.telegramId,
          username: owner.username || 'Unknown',
          walletAddress: owner.walletAddress,
        } : null,
        
        // Financial details
        balance: fund.balance.toString(),
        balanceSol: Number(fund.balance) / 1e9, // Balance in SOL
        minContribution: fund.minContribution.toString(),
        minContributionSol: Number(fund.minContribution) / 1e9, // Min in SOL
        tradingFeeBps: fund.tradingFeeBps,
        tradingFeePercent: fund.tradingFeeBps / 100, // e.g., 1%
        
        // Status
        status: fund.status,
        isRecovered: fund.isRecovered,
        
        // Blockchain info
        transactionSignature: fund.transactionSignature,
        lastSyncedSlot: fund.lastSyncedSlot?.toString() || null,
        
        // Timestamps
        createdAt: fund.createdAt,
        updatedAt: fund.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Get fund error:', error);
    return next(error);
  }
};



// Update fund balance (for sync operations)
export const updateFundBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { fundPdaAddress } = req.params;
    const { balance, lastSyncedSlot } = req.body;

    const fund = await prisma.fund.update({
      where: { fundPdaAddress },
      data: {
        balance: BigInt(balance),
        lastSyncedSlot: lastSyncedSlot ? BigInt(lastSyncedSlot) : undefined,
      },
    });

    return res.json({
      success: true,
      message: 'Fund balance updated',
      data: {
        ...fund,
        balance: fund.balance.toString(),
        lastSyncedSlot: fund.lastSyncedSlot?.toString(),
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const updateFundStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    console.log('inside the update fund model');
    const { status, telegramId, groupId } = req.body;

    // Validate status
    if (!["ACTIVE", "CLOSED", "PAUSED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Must be ACTIVE, CLOSED, or PAUSED",
      });
    }

    // Validate telegramId
    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "telegramId is required",
      });
    }

    // Check if fund exists
    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: "Fund not found",
      });
    }

    // Verify user is the fund authority
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user || user.walletAddress !== fund.initiator) {
      return res.status(403).json({
        success: false,
        message: "Only the fund creator can change fund status",
      });
    }

    // If fund is already in the requested status
    if (fund.status === status) {
      return res.status(400).json({
        success: false,
        message: `Fund is already ${status}`,
      });
    }

    // Handle CLOSED status separately (requires close_fund instruction)
    if (status === "CLOSED") {
      return res.status(400).json({
        success: false,
        message: "To close a fund, use the DELETE /api/fund/:groupId endpoint",
      });
    }

    let blockchainResult;
    
    // Update blockchain based on status change
    try {
      if (status === "PAUSED") {
        // Pause on blockchain
        blockchainResult = await pauseFundOnBlockchain(groupId!, telegramId);
      } else if (status === "ACTIVE" && fund.status === "PAUSED") {
        // Resume on blockchain
        blockchainResult = await resumeFundOnBlockchain(groupId!, telegramId);
      }
    } catch (blockchainError: any) {
      console.error("Blockchain update failed:", blockchainError);
      
      if (blockchainError.message.includes("authority")) {
        return res.status(403).json({
          success: false,
          message: blockchainError.message,
        });
      }
      
      // If blockchain update fails, don't update database
      return res.status(500).json({
        success: false,
        message: `Failed to update fund on blockchain: ${blockchainError.message}`,
      });
    }

    // Update database
    const updatedFund = await prisma.fund.update({
      where: { groupId },
      data: {
        status: status as "ACTIVE" | "CLOSED" | "PAUSED",
        updatedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      message: `Fund status updated to ${status}`,
      data: {
        id: updatedFund.id,
        groupId: updatedFund.groupId,
        fundPdaAddress: updatedFund.fundPdaAddress,
        status: updatedFund.status,
        transactionSignature: blockchainResult?.transactionSignature || null,
        updatedAt: updatedFund.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Update fund status error:", error);
    return next(error);
  }
};

// Delete fund (soft delete by setting status to CLOSED)
// controllers/fundController.ts
export const deleteFund = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { telegramId, groupId } = req.body;

    // Validate inputs
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "groupId is required",
      });
    }

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "telegramId is required",
      });
    }

    // Check if fund exists in database
    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: "Fund not found",
      });
    }

    // Check if already closed
    if (fund.status === "CLOSED") {
      return res.status(400).json({
        success: false,
        message: "Fund is already closed",
      });
    }

    // Verify user is the fund creator/authority
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user || user.walletAddress !== fund.initiator) {
      return res.status(403).json({
        success: false,
        message: "Only the fund creator can close the fund",
      });
    }

    // Close fund on blockchain first
    let blockchainResult;
    try {
      blockchainResult = await closeFundOnBlockchain(groupId, telegramId);
    } catch (blockchainError: any) {
      console.error("Blockchain close failed:", blockchainError);

      // Handle specific blockchain errors
      if (blockchainError.message.includes("Fund not found")) {
        // Fund doesn't exist on blockchain, just update DB
        console.log("Fund not on blockchain, updating DB only");
      } else if (blockchainError.message.includes("balance") || 
                 blockchainError.message.includes("shares")) {
        return res.status(400).json({
          success: false,
          message: blockchainError.message,
        });
      } else if (blockchainError.message.includes("authority")) {
        return res.status(403).json({
          success: false,
          message: blockchainError.message,
        });
      } else {
        throw blockchainError;
      }
    }

    // Update database
    const updatedFund = await prisma.fund.update({
      where: { groupId },
      data: { 
        status: "CLOSED",
        updatedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      message: "Fund closed successfully",
      data: {
        id: updatedFund.id,
        groupId: updatedFund.groupId,
        fundPdaAddress: updatedFund.fundPdaAddress,
        status: updatedFund.status,
        transactionSignature: blockchainResult?.transactionSignature || null,
        rentReclaimed: blockchainResult?.rentReclaimed || false,
        closedAt: updatedFund.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Delete fund error:", error);
    return next(error);
  }
};
