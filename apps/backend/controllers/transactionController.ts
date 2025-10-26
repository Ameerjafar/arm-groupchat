// controllers/transactionController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create a transaction
export const createTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const {
      fundId,
      type,
      amount,
      signature,
      fromAddress,
      toAddress,
      initiator,
      slot,
      blockTime,
    } = req.body;

    const transaction = await prisma.transaction.create({
      data: {
        fundId,
        type,
        amount: BigInt(amount),
        signature,
        fromAddress,
        toAddress,
        initiator,
        slot: slot ? BigInt(slot) : undefined,
        blockTime: blockTime ? new Date(blockTime) : undefined,
        status: 'PENDING',
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Transaction created',
      data: {
        ...transaction,
        amount: transaction.amount.toString(),
        slot: transaction.slot?.toString(),
      },
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Transaction already exists',
      });
    }
    return next(error);
  }
};

// Update transaction status
export const updateTransactionStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { signature } = req.params;
    const { status, slot, blockTime } = req.body;

    if (!['PENDING', 'CONFIRMED', 'FAILED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    const transaction = await prisma.transaction.update({
      where: { signature },
      data: {
        status,
        slot: slot ? BigInt(slot) : undefined,
        blockTime: blockTime ? new Date(blockTime) : undefined,
      },
    });

    return res.json({
      success: true,
      message: 'Transaction status updated',
      data: {
        ...transaction,
        amount: transaction.amount.toString(),
        slot: transaction.slot?.toString(),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// Get transactions by fund
export const getTransactionsByFund = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { fundId } = req.params;
    const { type, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { fundId };
    if (type) where.type = type;
    if (status) where.status = status;

    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.transaction.count({ where }),
    ]);

    return res.json({
      success: true,
      data: transactions.map(t => ({
        ...t,
        amount: t.amount.toString(),
        slot: t.slot?.toString(),
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

// Get transaction by signature
export const getTransactionBySignature = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { signature } = req.params;

    const transaction = await prisma.transaction.findUnique({
      where: { signature },
      include: {
        fund: {
          select: {
            groupId: true,
            fundPdaAddress: true,
          },
        },
      },
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    return res.json({
      success: true,
      data: {
        ...transaction,
        amount: transaction.amount.toString(),
        slot: transaction.slot?.toString(),
      },
    });
  } catch (error) {
    return next(error);
  }
};
