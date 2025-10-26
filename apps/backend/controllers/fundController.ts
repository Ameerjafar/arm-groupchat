// controllers/fundController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create a new fund
export const createFund = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const {
      groupId,
      fundPdaAddress,
      authority,
      initiator,
      transactionSignature,
      balance = 0
    } = req.body;

    const fund = await prisma.fund.create({
      data: {
        groupId,
        fundPdaAddress,
        authority,
        initiator,
        transactionSignature,
        balance: BigInt(balance),
        status: 'ACTIVE',
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Fund created successfully',
      data: {
        ...fund,
        balance: fund.balance.toString(), // Convert BigInt to string for JSON
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
    const { groupId } = req.params;

    const fund = await prisma.fund.findUnique({
      where: { groupId },
      include: {
        contributions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    return res.json({
      success: true,
      data: {
        ...fund,
        balance: fund.balance.toString(),
        contributions: fund.contributions.map(c => ({
          ...c,
          amount: c.amount.toString(),
        })),
        transactions: fund.transactions.map(t => ({
          ...t,
          amount: t.amount.toString(),
          slot: t.slot?.toString(),
        })),
      },
    });
  } catch (error) {
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

// Update fund status
export const updateFundStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'CLOSED', 'PAUSED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value',
      });
    }

    const fund = await prisma.fund.update({
      where: { groupId },
      data: { status },
    });

    return res.json({
      success: true,
      message: 'Fund status updated',
      data: fund,
    });
  } catch (error) {
    return next(error);
  }
};

// Get all funds (admin/monitoring)
export const getAllFunds = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = status ? { status: status as any } : {};

    const [funds, total] = await prisma.$transaction([
      prisma.fund.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              contributions: true,
              transactions: true,
            },
          },
        },
      }),
      prisma.fund.count({ where }),
    ]);

    return res.json({
      success: true,
      data: funds.map(f => ({
        ...f,
        balance: f.balance.toString(),
        lastSyncedSlot: f.lastSyncedSlot?.toString(),
      })),
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// Delete fund (soft delete by setting status to CLOSED)
export const deleteFund = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId } = req.params;

    const fund = await prisma.fund.update({
      where: { groupId },
      data: { status: 'CLOSED' },
    });

    return res.json({
      success: true,
      message: 'Fund closed successfully',
      data: fund,
    });
  } catch (error) {
    return next(error);
  }
};
