import express, { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { Prisma, PrismaClient } from '@prisma/client';
import axios from 'axios';
import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import bs58 from 'bs58';

const prisma = new PrismaClient();

const tradeRoute = express.Router();

// Use DEVNET for testing
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

interface TradeBody {
  chatId: string | number;
  userId: number;
  username: string;
  tradeDetails: string;
}

// Devnet Token Addresses
const DEVNET_TOKEN_MINTS: { [key: string]: string } = {
  'SOL': 'So11111111111111111111111111111111111111112', // Native SOL
  'USDC': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC Devnet
  'USDT': 'EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS', // USDT Devnet (example)
};

// Jupiter API helper function for DEVNET
async function getJupiterDevnetSwapTransaction(
  inputMint: string,
  outputMint: string,
  amount: number,
  userPublicKey: string,
  slippageBps: number = 100 // 1% slippage for devnet
) {
  try {
    // NOTE: Jupiter doesn't have full devnet support
    // For testing, we'll simulate the swap logic
    console.log('🧪 DEVNET MODE: Simulating Jupiter swap...');

    // Simulate price calculation (you can adjust these)
    const mockPrices: { [key: string]: number } = {
      'SOL': 100,
      'USDC': 1,
      'USDT': 1,
    };

    const inputToken = Object.keys(DEVNET_TOKEN_MINTS).find(
      key => DEVNET_TOKEN_MINTS[key] === inputMint
    ) || 'SOL';

    const outputToken = Object.keys(DEVNET_TOKEN_MINTS).find(
      key => DEVNET_TOKEN_MINTS[key] === outputMint
    ) || 'USDC';

    const inputPrice = mockPrices[inputToken] || 1;
    const outputPrice = mockPrices[outputToken] || 1;

    const estimatedOutput = (amount * inputPrice) / outputPrice;
    const slippageAdjusted = estimatedOutput * (1 - slippageBps / 10000);

    return {
      transaction: null, // No actual transaction for simulation
      quote: {
        inputMint,
        outputMint,
        inAmount: Math.floor(amount * 1e9),
        outAmount: Math.floor(slippageAdjusted * 1e9),
        priceImpactPct: '0.1',
      },
      outputAmount: Math.floor(slippageAdjusted * 1e9),
      simulated: true
    };
  } catch (error: any) {
    console.error('Swap simulation error:', error);
    throw new Error(`Failed to simulate swap: ${error.message}`);
  }
}

// Simple devnet token transfer (for actual testing)
async function createDevnetTokenTransfer(
  fromWallet: string,
  toWallet: string,
  amount: number,
  tokenMint: string
) {
  try {
    const fromPubkey = new PublicKey(fromWallet);
    const toPubkey = new PublicKey(toWallet);
    const mintPubkey = new PublicKey(tokenMint);

    // Get or create associated token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      fromPubkey
    );

    const toTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      toPubkey
    );

    console.log('From Token Account:', fromTokenAccount.toBase58());
    console.log('To Token Account:', toTokenAccount.toBase58());

    return {
      fromTokenAccount: fromTokenAccount.toBase58(),
      toTokenAccount: toTokenAccount.toBase58(),
      amount: Math.floor(amount * 1e9) // Convert to smallest unit
    };
  } catch (error: any) {
    console.error('Token transfer setup error:', error);
    throw error;
  }
}

tradeRoute.post("/makeTrade", async (req: Request<{}, {}, TradeBody>, res: Response) => {
  let transactionId: string | null = null;

  try {
    const { chatId, userId, username, tradeDetails } = req.body;

    // Validate required fields
    if (!userId || !chatId || !username) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId, chatId, or username"
      });
    }

    if (!tradeDetails) {
      return res.status(400).json({
        success: false,
        message: "Trade details missing"
      });
    }

    // Parse "SOL USDC 5"
    const [fromToken, toToken, amountString] = tradeDetails.trim().split(" ");
    const amount = parseFloat(amountString!);

    if (!fromToken || !toToken || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid trade format. Use: <fromToken> <toToken> <amount> (e.g., SOL USDC 0.1)"
      });
    }

    // Find user by Telegram ID
    const user = await prisma.user.findUnique({
      where: { telegramId: userId.toString() }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please use /register or /connectwallet command first."
      });
    }

    // Check if user has connected wallet
    if (!user.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "Please connect your wallet using /connectwallet command first."
      });
    }

    // Get token mint addresses
    const fromTokenMint = DEVNET_TOKEN_MINTS[fromToken.toUpperCase()];
    const toTokenMint = DEVNET_TOKEN_MINTS[toToken.toUpperCase()];

    if (!fromTokenMint || !toTokenMint) {
      return res.status(400).json({
        success: false,
        message: `Token not supported on devnet. Supported tokens: ${Object.keys(DEVNET_TOKEN_MINTS).join(', ')}`
      });
    }

    // Check wallet balance on devnet
    try {
      const publicKey = new PublicKey(user.walletAddress);
      const balance = await connection.getBalance(publicKey);
      const solBalance = balance / LAMPORTS_PER_SOL;

      console.log(`💰 Wallet Balance: ${solBalance} SOL`);

      if (fromToken.toUpperCase() === 'SOL' && amount > solBalance) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. You have ${solBalance.toFixed(4)} SOL but trying to swap ${amount} SOL`
        });
      }
    } catch (error) {
      console.error('Balance check error:', error);
    }

    transactionId = nanoid();

    console.log(`🧪 DEVNET: Initiating Swap: ${amount} ${fromToken} → ${toToken}`);

    // Get simulated swap quote
    const jupiterSwap = await getJupiterDevnetSwapTransaction(
      fromTokenMint,
      toTokenMint,
      amount,
      user.walletAddress
    );

    const estimatedToAmount = jupiterSwap.outputAmount / 1e9;

    console.log(`✅ Simulated Quote: ${amount} ${fromToken} → ${estimatedToAmount.toFixed(6)} ${toToken}`);

    // Create transaction record
    const transaction = await prisma.initiatedTransaction.create({
      data: {
        userId: user.id,
        transactionId,
        username: username,
        chatId: chatId.toString(),
        fromToken: fromToken.toUpperCase(),
        toToken: toToken.toUpperCase(),
        fromAmount: amount,
        estimatedToAmount: estimatedToAmount,
        fromTokenPrice: 0, // Set to 0 for devnet testing
        toTokenPrice: 0,
        estimatedValueUSD: 0,
        status: 'COMPLETED', // Mark as completed for testing
        priceSource: 'devnet-simulation',
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown'
      }
    });

    console.log('✅ Transaction saved to DB:', transaction.id);

    // Return success with devnet info
    return res.status(200).json({
      success: true,
      message: `🧪 DEVNET: Simulated swap: ${amount} ${fromToken} → ${estimatedToAmount.toFixed(6)} ${toToken}`,
      data: {
        network: 'devnet',
        transactionId: transaction.transactionId,
        fromToken,
        toToken,
        amount,
        estimatedToAmount: estimatedToAmount.toFixed(6),
        timestamp: transaction.initiatedAt,
        quote: jupiterSwap.quote,
        explorerUrl: `https://explorer.solana.com/address/${user.walletAddress}?cluster=devnet`
      }
    });

  } catch (error: any) {
    console.error("Trade error:", error);

    // Log the full error
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Prisma error code:", error.code);
      console.error("Prisma error meta:", error.meta);
    }

    // Update transaction status to failed if transaction was created
    if (transactionId) {
      try {
        await prisma.initiatedTransaction.updateMany({
          where: { transactionId },
          data: {
            status: 'FAILED',
            errorMessage: error.message || 'Unknown error',
            failedAt: new Date()
          }
        });
      } catch (dbError) {
        console.error("Failed to update transaction status:", dbError);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Trade execution failed"
    });
  }
});

// routes/tradeRoute.ts

tradeRoute.post("/calculateProfit", async (req: Request, res: Response) => {
  try {
    const { chatId, userId } = req.body;

    if (!chatId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Get all completed trades for this group
    const trades = await prisma.initiatedTransaction.findMany({
      where: {
        chatId: chatId.toString(),
        status: 'COMPLETED'
      },
      orderBy: {
        initiatedAt: 'desc'
      }
    });

    if (trades.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalTrades: 0,
          totalProfit: 0,
          trades: []
        }
      });
    }

    // Calculate profit
    let totalInvested = 0;
    let totalReceived = 0;

    const tradeDetails = trades.map(trade => {
      const invested = Number(trade.fromAmount) * (Number(trade.fromTokenPrice) || 0);
      const received = Number(trade.estimatedToAmount) * (Number(trade.toTokenPrice) || 0);

      const profit = received - invested;

      totalInvested += invested;
      totalReceived += received;

      return {
        transactionId: trade.transactionId,
        date: trade.initiatedAt,
        from: `${trade.fromAmount} ${trade.fromToken}`,
        to: `${trade.estimatedToAmount} ${trade.toToken}`,
        investedUSD: invested.toFixed(2),
        receivedUSD: received.toFixed(2),
        profitUSD: profit.toFixed(2),
        profitPercent: ((profit / invested) * 100).toFixed(2)
      };
    });

    const totalProfit = totalReceived - totalInvested;
    const profitPercent = (totalProfit / totalInvested) * 100;

    return res.status(200).json({
      success: true,
      data: {
        totalTrades: trades.length,
        totalInvestedUSD: totalInvested.toFixed(2),
        totalReceivedUSD: totalReceived.toFixed(2),
        totalProfitUSD: totalProfit.toFixed(2),
        profitPercent: profitPercent.toFixed(2),
        trades: tradeDetails
      }
    });

  } catch (error: any) {
    console.error("Error calculating profit:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to calculate profit"
    });
  }
});

tradeRoute.post("/shareProfit", async (req: Request, res: Response) => {
  try {
    const { chatId, userId, totalProfit, shares } = req.body;

    if (!chatId || !userId || !totalProfit || !shares) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Validate shares add up to 100%
    const totalShares = shares.reduce((sum: number, s: any) => sum + s.share, 0);
    if (Math.abs(totalShares - 100) > 0.01) {
      return res.status(400).json({
        success: false,
        message: "Shares must add up to 100%"
      });
    }

    // Calculate individual amounts
    const distributions = shares.map((s: any) => ({
      peer: s.peer,
      share: s.share,
      amount: (totalProfit * s.share / 100).toFixed(2)
    }));

    // Save profit distribution record
    await prisma.profitDistribution.create({
      data: {
        chatId: chatId.toString(),
        initiatorId: userId.toString(),
        totalProfit: parseFloat(totalProfit),
        distributions: JSON.stringify(distributions),
        distributedAt: new Date()
      }
    });

    // Format response message
    let message = `Profit Distribution:\n\n`;
    distributions.forEach((d: any) => {
      message += `${d.peer}: ${d.share}% = $${d.amount}\n`;
    });

    return res.status(200).json({
      success: true,
      message,
      data: { distributions }
    });

  } catch (error: any) {
    console.error("Error sharing profit:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to share profit"
    });
  }
});



export default tradeRoute;
