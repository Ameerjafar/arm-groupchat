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
// Real Jupiter integration for devnet/mainnet
async function executeJupiterSwap(
  inputMint: string,
  outputMint: string,
  amount: number,
  userWalletKeypair: Keypair,
  slippageBps: number = 100
) {
  try {
    // Convert amount to lamports/smallest unit
    const amountInSmallestUnit = Math.floor(amount * 1e9);

    console.log('🔄 Fetching Jupiter quote...');

    // Step 1: Get quote from Jupiter
    const quoteResponse = await fetch(
      `https://quote-api.jup.ag/v6/quote?` +
      `inputMint=${inputMint}&` +
      `outputMint=${outputMint}&` +
      `amount=${amountInSmallestUnit}&` +
      `slippageBps=${slippageBps}`
    );

    if (!quoteResponse.ok) {
      throw new Error('Failed to get Jupiter quote');
    }

    const quoteData = await quoteResponse.json();
    console.log('✅ Quote received:', quoteData);

    // Step 2: Get swap transaction
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: userWalletKeypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto'
      })
    });

    if (!swapResponse.ok) {
      throw new Error('Failed to get swap transaction');
    }

    const { swapTransaction } = await swapResponse.json();

    // Step 3: Deserialize and sign transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    transaction.sign([userWalletKeypair]);

    // Step 4: Send transaction
    console.log('📤 Sending transaction...');
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 3
    });

    // Step 5: Confirm transaction
    console.log('⏳ Confirming transaction...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Swap successful!');
    console.log('Transaction:', `https://solscan.io/tx/${signature}`);

    return {
      signature,
      inputAmount: amount,
      outputAmount: parseInt(quoteData.outAmount) / 1e9,
      explorerUrl: `https://solscan.io/tx/${signature}`
    };

  } catch (error: any) {
    console.error('Jupiter swap error:', error);
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

    // Find user by Telegram ID - THIS WAS MISSING
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

    if (!user.privateKey) {
      return res.status(400).json({
        success: false,
        message: "Private key not found. Please reconnect your wallet."
      });
    }

    // Reconstruct keypair from stored private key
    const keypair = Keypair.fromSecretKey(bs58.decode(user.privateKey));

    // Get token mint addresses
    const fromTokenMint = DEVNET_TOKEN_MINTS[fromToken.toUpperCase()];
    const toTokenMint = DEVNET_TOKEN_MINTS[toToken.toUpperCase()];

    if (!fromTokenMint || !toTokenMint) {
      return res.status(400).json({
        success: false,
        message: `Token not supported. Supported: ${Object.keys(DEVNET_TOKEN_MINTS).join(', ')}`
      });
    }

    transactionId = nanoid();

    console.log(`🔄 Executing REAL swap: ${amount} ${fromToken} → ${toToken}`);

    // Execute real Jupiter swap
    const swapResult = await executeJupiterSwap(
      fromTokenMint,
      toTokenMint,
      amount,
      keypair,
      100 // 1% slippage
    );

    // Create transaction record - REMOVED signature field
    const transaction = await prisma.initiatedTransaction.create({
      data: {
        userId: user.id,
        transactionId,
        username: username,
        chatId: chatId.toString(),
        fromToken: fromToken.toUpperCase(),
        toToken: toToken.toUpperCase(),
        fromAmount: amount,
        estimatedToAmount: swapResult.outputAmount,
        fromTokenPrice: 0,
        toTokenPrice: 0,
        estimatedValueUSD: 0,
        status: 'COMPLETED',
        priceSource: 'jupiter-v6',
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        signature: swapResult.signature
      }
    });

    // Return success
    return res.status(200).json({
      success: true,
      message: `✅ Swap completed: ${amount} ${fromToken} → ${swapResult.outputAmount.toFixed(6)} ${toToken}`,
      data: {
        transactionId: transaction.transactionId,
        signature: swapResult.signature,
        fromToken,
        toToken,
        amount,
        receivedAmount: swapResult.outputAmount.toFixed(6),
        explorerUrl: swapResult.explorerUrl,
        timestamp: transaction.initiatedAt
      }
    });

  } catch (error: any) {
    console.error("Trade error:", error);

    if (transactionId) {
      await prisma.initiatedTransaction.updateMany({
        where: { transactionId },
        data: {
          status: 'FAILED',
          errorMessage: error.message || 'Unknown error',
          failedAt: new Date()
        }
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Trade execution failed"
    });
  }
});


tradeRoute.post("/getTokenAccounts", async (req: Request, res: Response) => {
  try {
    const { telegramId } = req.body;

    const user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() }
    });

    if (!user || !user.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "Wallet not connected"
      });
    }

    const walletPubkey = new PublicKey(user.walletAddress);
    const tokenAccounts = [];

    // Check each token
    for (const [symbol, mint] of Object.entries(DEVNET_TOKEN_MINTS)) {
      if (symbol === 'SOL') continue; // Skip native SOL

      try {
        const mintPubkey = new PublicKey(mint);
        const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);

        const accountInfo = await connection.getAccountInfo(ata);

        tokenAccounts.push({
          symbol,
          mint,
          tokenAccount: ata.toBase58(),
          exists: accountInfo !== null,
          balance: accountInfo ?
            (await connection.getTokenAccountBalance(ata)).value.uiAmount : 0
        });
      } catch (error) {
        console.error(`Error checking ${symbol}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        tokenAccounts
      }
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});



// Simple devnet token transfer (for actual testing)
async function ensureTokenAccount(
  walletPubkey: PublicKey,
  tokenMint: PublicKey,
  payerKeypair: Keypair // You need this to pay for account creation
): Promise<string> {
  try {
    const associatedTokenAddress = await getAssociatedTokenAddress(
      tokenMint,
      walletPubkey
    );

    // Check if account exists
    const accountInfo = await connection.getAccountInfo(associatedTokenAddress);

    if (!accountInfo) {
      console.log('🔨 Creating associated token account...');

      // Create the account
      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payerKeypair.publicKey, // Payer
          associatedTokenAddress, // Associated token account
          walletPubkey, // Owner
          tokenMint // Token mint
        )
      );

      const signature = await connection.sendTransaction(
        transaction,
        [payerKeypair]
      );

      await connection.confirmTransaction(signature);
      console.log('✅ Token account created:', associatedTokenAddress.toBase58());
    }

    return associatedTokenAddress.toBase58();
  } catch (error) {
    console.error('Error ensuring token account:', error);
    throw error;
  }
}

tradeRoute.post("/requestDevnetUSDC", async (req: Request, res: Response) => {
  try {
    const { telegramId } = req.body;

    const user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() }
    });

    if (!user || !user.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "Wallet not connected"
      });
    }

    const walletPubkey = new PublicKey(user.walletAddress);
    const usdcMint = new PublicKey(DEVNET_TOKEN_MINTS['USDC']!);

    // Get or create USDC token account
    const usdcTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      walletPubkey
    );

    // Check if token account exists
    const accountInfo = await connection.getAccountInfo(usdcTokenAccount);

    if (!accountInfo) {
      // Need to create it first
      return res.status(200).json({
        success: false,
        message: "USDC token account doesn't exist. You need to create it first or receive USDC from someone who will create it for you.",
        data: {
          expectedTokenAccount: usdcTokenAccount.toBase58(),
          instructions: "Use a devnet faucet or have someone send you USDC"
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: "USDC token account exists",
      data: {
        tokenAccount: usdcTokenAccount.toBase58(),
        instructions: "Request devnet USDC from: https://spl-token-faucet.com/ or use Solana CLI"
      }
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message
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

tradeRoute.post("/getWalletBalances", async (req: Request, res: Response) => {
  try {
    const { telegramId } = req.body;

    console.log('here');


    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "Missing telegramId"
      });
    }

    // Find user by Telegram ID
    const user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please use /register or /connectwallet first."
      });
    }

    if (!user.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "No wallet connected. Use /connectwallet first."
      });
    }

    const publicKey = new PublicKey(user.walletAddress);

    // Get SOL balance
    const solBalanceLamports = await connection.getBalance(publicKey);
    const solBalance = (solBalanceLamports / LAMPORTS_PER_SOL).toFixed(4);

    // Get USDC balance (SPL Token)
    let usdcBalance = "0.0000";
    try {
      const usdcMint = new PublicKey(DEVNET_TOKEN_MINTS['USDC']!);
      const usdcTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        publicKey
      );

      // Check if token account exists
      const tokenAccountInfo = await connection.getAccountInfo(usdcTokenAccount);

      if (tokenAccountInfo) {
        const balance = await connection.getTokenAccountBalance(usdcTokenAccount);
        usdcBalance = balance.value.uiAmount?.toFixed(4) || "0.0000";
      }
    } catch (error) {
      console.log("USDC account not found or error fetching balance:", error);
      // USDC balance remains 0 if account doesn't exist
    }

    return res.status(200).json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        solBalance,
        usdcBalance,
        network: "devnet"
      }
    });

  } catch (error: any) {
    console.error("Error fetching wallet balances:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch wallet balances"
    });
  }
});




export default tradeRoute;
