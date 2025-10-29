import { Request, Response, NextFunction } from 'express';
import { prisma } from '@repo/db';
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { GroupchatFund } from '../../../contract/groupchat_fund/target/types/groupchat_fund';
import IDL from '../../../contract/groupchat_fund/target/idl/groupchat_fund.json';
import { syncFundBalance } from '../services/solanaServices/syncService';
import {
  executeTrade,
  canExecuteTrade,
  getFundTradingInfo,
} from '../services/solanaServices/tradeServices';
import { decrypt } from '../services/utlis';

// Solana setup
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

const programId = new PublicKey(
  process.env.PROGRAM_ID || '9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy'
);

function getProgram(wallet: anchor.Wallet): Program<GroupchatFund> {
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  return new anchor.Program<GroupchatFund>(IDL as any, provider);
}

// Helper function to get user keypair from database
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
      console.error('User not found or no encrypted private key');
      return null;
    }

    // Decrypt the private key
    const decryptedPrivateKey = decrypt(user.encryptedPrivateKey);

    // Convert base58 string to Keypair
    const privateKeyBytes = bs58.decode(decryptedPrivateKey);
    const keypair = Keypair.fromSecretKey(privateKeyBytes);

    // Verify the public key matches
    if (keypair.publicKey.toString() !== user.walletAddress) {
      console.error('Decrypted keypair does not match stored wallet address');
      return null;
    }

    return keypair;
  } catch (error) {
    console.error('Error loading user keypair:', error);
    return null;
  }
}

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

    console.log('Executing trade...');

    // Validate inputs
    if (!groupId || !telegramId || !fromToken || !toToken || !amount || !minimumOut) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: groupId, telegramId, fromToken, toToken, amount, minimumOut',
      });
    }

    // Get fund from database
    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found for this group',
      });
    }

    if (fund.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Fund is not active',
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user || !user.walletAddress) {
      return res.status(404).json({
        success: false,
        message: 'User not found or wallet not connected',
      });
    }

    // Verify user is fund authority (admin)
    if (user.walletAddress !== fund.initiator) {
      return res.status(403).json({
        success: false,
        message: 'Only fund authority (admin) can execute trades',
      });
    }

    // Check trading permissions
    const { canTrade, reason } = await canExecuteTrade(groupId, telegramId);

    if (!canTrade) {
      return res.status(403).json({
        success: false,
        message: reason || 'You are not authorized to execute trades',
      });
    }

    // Execute trade on blockchain
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
        message: 'Failed to execute trade on blockchain',
      });
    }
    let newBalance = 0;
    try {
      newBalance = await syncFundBalance(groupId);
      console.log(`✅ Database synced: ${newBalance / LAMPORTS_PER_SOL} SOL`);
    } catch (syncError) {
      console.error('⚠️ Database sync failed (trade still successful):', syncError);
      // Trade succeeded, sync failed - non-critical
    }

    // Log transaction in database
    await prisma.transaction.create({
      data: {
        fundId: fund.id,
        type: 'TRADE',
        amount: BigInt(amount),
        signature: blockchainResult.transactionSignature,
        fromAddress: fromToken,
        toAddress: toToken,
        initiator: telegramId,
        status: 'CONFIRMED',
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Trade executed successfully',
      transactionSignature: blockchainResult.transactionSignature, 
      data: {
        fromToken: blockchainResult.fromToken,
        toToken: blockchainResult.toToken,
        amount: blockchainResult.amount,
        minimumOut: blockchainResult.minimumOut,
        newBalance: newBalance / LAMPORTS_PER_SOL,
        transactionSignature: blockchainResult.transactionSignature, // ✅ Also in data
        explorerUrl: `https://explorer.solana.com/tx/${blockchainResult.transactionSignature}?cluster=devnet`,
      },
    });
  } catch (error: any) {
    console.error('Error executing trade:', error);

    if (error.message?.includes('InsufficientFunds') || error.message?.includes('Insufficient funds')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message?.includes('UnauthorizedTrader')) {
      return res.status(403).json({
        success: false,
        message: 'Only fund authority can execute trades',
      });
    }

    if (error.message?.includes('FundNotActive')) {
      return res.status(400).json({
        success: false,
        message: 'Fund is not active',
      });
    }

    return next(error);
  }
};

// ==================== QUERY OPERATIONS ====================

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
        message: 'groupId and telegramId are required',
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
        reason: reason || (canTrade ? 'Authorized to trade' : 'Not authorized'),
      },
    });
  } catch (error: any) {
    console.error('Error checking trade permissions:', error);
    return next(error);
  }
};


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
        message: 'groupId is required',
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

    const tradingInfo = await getFundTradingInfo(groupId as string);

    return res.json({
      success: true,
      message: 'Fund trading info retrieved successfully',
      data: tradingInfo,
    });
  } catch (error: any) {
    console.error('Error fetching fund trading info:', error);
    return next(error);
  }
};

/**
 * Get trade history for a fund
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
        message: 'groupId is required',
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

    // Get from database
    const trades = await prisma.transaction.findMany({
      where: {
        fundId: fund.id,
        type: 'TRADE',
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit ? parseInt(limit as string) : 10,
    });

    return res.json({
      success: true,
      message: 'Trade history retrieved successfully',
      data: {
        trades: trades.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount.toString(),
          fromAddress: t.fromAddress,
          toAddress: t.toAddress,
          signature: t.signature,
          status: t.status,
          initiator: t.initiator,
          timestamp: t.timestamp,
          explorerUrl: t.signature 
            ? `https://explorer.solana.com/tx/${t.signature}?cluster=devnet`
            : null,
        })),
        total: trades.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching trade history:', error);
    return next(error);
  }
};

/**
 * Get fund statistics
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
        message: 'groupId is required',
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
      include: {
        transactions: {
          where: { type: 'TRADE' },
        },
      },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    const totalTrades = fund.transactions.length;
    const successfulTrades = fund.transactions.filter(
      t => t.status === 'CONFIRMED'
    ).length;

    return res.json({
      success: true,
      message: 'Fund statistics retrieved successfully',
      data: {
        totalTrades,
        successfulTrades,
        failedTrades: totalTrades - successfulTrades,
        fundStatus: fund.status,
        createdAt: fund.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Error fetching fund statistics:', error);
    return next(error);
  }
};
