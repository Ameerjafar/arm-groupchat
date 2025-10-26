import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create a contribution
export const createContribution = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { fundId, contributorId, amount, signature } = req.body;

    // Verify fund exists and is active
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
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
        message: 'Fund is not active',
      });
    }

    // Create contribution and update fund balance in a transaction
    const [contribution, updatedFund] = await prisma.$transaction([
      prisma.contribution.create({
        data: {
          fundId,
          contributorId,
          amount: BigInt(amount),
          signature,
        },
      }),
      prisma.fund.update({
        where: { id: fundId },
        data: {
          balance: {
            increment: BigInt(amount),
          },
        },
      }),
    ]);

    return res.status(201).json({
      success: true,
      message: 'Contribution added successfully',
      data: {
        ...contribution,
        amount: contribution.amount.toString(),
      },
      fundBalance: updatedFund.balance.toString(),
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Duplicate transaction signature',
      });
    }
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
    const { fundId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [contributions, total] = await prisma.$transaction([
      prisma.contribution.findMany({
        where: { fundId },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.contribution.count({ where: { fundId } }),
    ]);

    return res.json({
      success: true,
      data: contributions.map(c => ({
        ...c,
        amount: c.amount.toString(),
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

// Get contributions by contributor
export const getContributionsByContributor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { contributorId } = req.params;

    const contributions = await prisma.contribution.findMany({
      where: { contributorId },
      include: {
        fund: {
          select: {
            groupId: true,
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

    return res.json({
      success: true,
      data: contributions.map(c => ({
        ...c,
        amount: c.amount.toString(),
      })),
      summary: {
        totalContributions: contributions.length,
        totalAmount: totalContributed.toString(),
      },
    });
  } catch (error) {
    return next(error);
  }
};
