import { Request, Response, Router } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const walletRoute = Router();

// Solana connection
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Token metadata cache for better UX
const TOKEN_METADATA: { [key: string]: { symbol: string; name: string; decimals: number } } = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Solana', decimals: 9 },
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  // Mainnet tokens (if you switch to mainnet)
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk', decimals: 5 },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter', decimals: 6 },
};

interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  uiAmount: string;
  tokenAccount: string;
}

// Get all token balances for a wallet
walletRoute.post('/getTokenBalances', async (req: Request, res: Response) => {
  try {
    const { telegramId } = req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram ID is required'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found. Please register first.'
      });
    }

    if (!user.walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'No wallet connected. Use /connectwallet first.'
      });
    }

    const walletPubkey = new PublicKey(user.walletAddress);

    // Get SOL balance
    const solBalance = await connection.getBalance(walletPubkey);
    
    // Get all token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );

    const tokens: TokenBalance[] = [];

    // Add SOL balance
    tokens.push({
      mint: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      name: 'Solana',
      balance: solBalance,
      decimals: 9,
      uiAmount: (solBalance / 1e9).toFixed(4),
      tokenAccount: user.walletAddress
    });

    // Process SPL tokens
    for (const accountInfo of tokenAccounts.value) {
      const parsedInfo = accountInfo.account.data.parsed.info;
      const mint = parsedInfo.mint;
      const balance = parsedInfo.tokenAmount.amount;
      const decimals = parsedInfo.tokenAmount.decimals;
      const uiAmount = parsedInfo.tokenAmount.uiAmountString;

      // Only include tokens with balance > 0
      if (parseFloat(balance) > 0) {
        const metadata = TOKEN_METADATA[mint] || {
          symbol: mint.substring(0, 8) + '...',
          name: 'Unknown Token',
          decimals: decimals
        };

        tokens.push({
          mint,
          symbol: metadata.symbol,
          name: metadata.name,
          balance: parseFloat(balance),
          decimals,
          uiAmount: uiAmount || '0',
          tokenAccount: accountInfo.pubkey.toBase58()
        });
      }
    }

    // Sort by balance (highest first)
    tokens.sort((a, b) => {
      const aValue = parseFloat(a.uiAmount);
      const bValue = parseFloat(b.uiAmount);
      return bValue - aValue;
    });

    return res.status(200).json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        tokens,
        totalTokens: tokens.length,
        network: process.env.SOLANA_NETWORK || 'devnet'
      }
    });

  } catch (error: any) {
    console.error('Error fetching token balances:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch token balances'
    });
  }
});

// Get specific token balance
walletRoute.post('/getTokenBalance', async (req: Request, res: Response) => {
  try {
    const { telegramId, tokenSymbol } = req.body;

    if (!telegramId || !tokenSymbol) {
      return res.status(400).json({
        success: false,
        message: 'Telegram ID and token symbol are required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() }
    });

    if (!user?.walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'No wallet connected'
      });
    }

    const walletPubkey = new PublicKey(user.walletAddress);

    // Handle SOL separately
    if (tokenSymbol.toUpperCase() === 'SOL') {
      const balance = await connection.getBalance(walletPubkey);
      return res.status(200).json({
        success: true,
        data: {
          symbol: 'SOL',
          balance: (balance / 1e9).toFixed(4),
          mint: 'So11111111111111111111111111111111111111112'
        }
      });
    }

    // Find token mint by symbol
    const tokenMint = Object.keys(TOKEN_METADATA).find(
      mint => TOKEN_METADATA[mint]!.symbol.toUpperCase() === tokenSymbol.toUpperCase()
    );

    if (!tokenMint) {
      return res.status(404).json({
        success: false,
        message: `Token ${tokenSymbol} not supported`
      });
    }

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: new PublicKey(tokenMint) }
    );

    if (tokenAccounts.value.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          symbol: tokenSymbol.toUpperCase(),
          balance: '0',
          mint: tokenMint
        }
      });
    }

    const balance = tokenAccounts.value[0]!.account.data.parsed.info.tokenAmount.uiAmountString;

    return res.status(200).json({
      success: true,
      data: {
        symbol: tokenSymbol.toUpperCase(),
        balance,
        mint: tokenMint
      }
    });

  } catch (error: any) {
    console.error('Error fetching token balance:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch token balance'
    });
  }
});

export default walletRoute;
