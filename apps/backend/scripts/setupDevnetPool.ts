import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { createCpmmPoolDevnet } from '../services/raydiumSwapService';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the correct path
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  try {
    console.log('🚀 Starting devnet pool setup...');
    console.log('📂 Current directory:', __dirname);

    // Get fund keypair from environment
    const secretKey = process.env.FUND_SECRET_KEY?.trim();
    
    console.log('🔍 Checking environment variables...');
    console.log('FUND_SECRET_KEY exists:', !!secretKey);
    console.log('FUND_SECRET_KEY length:', secretKey?.length || 0);
    
    if (!secretKey || secretKey === '') {
      throw new Error(
        'FUND_SECRET_KEY not found or empty in environment variables.\n' +
        'Please set it in your .env file as a base58-encoded private key.'
      );
    }

    // Validate it's a proper base58 string
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(secretKey)) {
      throw new Error(
        'FUND_SECRET_KEY does not appear to be a valid base58 string.\n' +
        'It should only contain base58 characters (no 0, O, I, l).'
      );
    }

    console.log('🔐 Decoding private key...');
    const fundKeypair = Keypair.fromSecretKey(bs58.decode(secretKey));
    console.log('✅ Loaded fund keypair:', fundKeypair.publicKey.toBase58());

    // Get token mint address
    const tokenMint = process.env.DEVNET_TOKEN_MINT?.trim();
    
    if (!tokenMint || tokenMint === '') {
      throw new Error(
        'DEVNET_TOKEN_MINT not found in environment variables.\n' +
        'Please set it in your .env file.'
      );
    }

    console.log('🪙 Token mint:', tokenMint);

    // Create pool with initial liquidity
    console.log('📊 Creating pool with 1000 tokens and 1 SOL...');
    
    const result = await createCpmmPoolDevnet(
      fundKeypair,
      tokenMint,
      1000, // 1000 tokens
      1     // 1 SOL
    );

    if (result.success) {
      console.log('\n✅ Pool created successfully!');
      console.log('🏊 Pool ID:', result.poolId);
      console.log('\n📝 Save this Pool ID to your .env file:');
      console.log(`DEVNET_POOL_ID=${result.poolId}`);
    } else {
      console.error('❌ Pool creation failed:', result.message);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

main();
