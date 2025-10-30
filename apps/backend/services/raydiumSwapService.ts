import { 
  Raydium, 
  TxVersion, 
  CurveCalculator 
} from '@raydium-io/raydium-sdk-v2';
import { 
  Connection, 
  Keypair, 
  clusterApiUrl, 
  LAMPORTS_PER_SOL,
  PublicKey
} from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { BN } from 'bn.js';
import bs58 from 'bs58';

// Devnet CPMM Program IDs (from Raydium docs)
const DEVNET_CPMM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
const DEVNET_FEE_ACC = new PublicKey('G11FKBRaAkHAKuLCgLM6K6NUc9rTjPAznRCjZifrTQe2');

interface SwapResult {
  success: boolean;
  transactionSignature?: string;
  fromToken?: string;
  toToken?: string;
  amount?: string;
  outputAmount?: string;
  message?: string;
}

/**
 * Initialize Raydium SDK for devnet
 */
async function initRaydium(signer: Keypair): Promise<Raydium> {
  const connection = new Connection(
    clusterApiUrl('devnet'),
    'confirmed'
  );

  const raydium = await Raydium.load({
    owner: signer,
    connection: connection,
    cluster: 'devnet',
    disableFeatureCheck: true, // Important for devnet
    disableLoadToken: false,
  });

  console.log('✅ Raydium SDK initialized for devnet');
  return raydium;
}

/**
 * Swap SOL to USDC (or any other token) on Raydium CPMM pools
 */
export async function swapSolToToken(
  fundKeypair: Keypair,
  targetTokenMint: string, // USDC or other token mint address
  amountInSol: number,
  slippagePercent: number = 1 // 1% slippage
): Promise<SwapResult> {
  try {
    console.log('🔄 Initializing Raydium SDK...');
    const raydium = await initRaydium(fundKeypair);

    // Get token info for SOL (wrapped SOL)
    console.log('📊 Fetching token info...');
    const solToken = await raydium.token.getTokenInfo(NATIVE_MINT.toBase58());
    const targetToken = await raydium.token.getTokenInfo(targetTokenMint);

    if (!solToken || !targetToken) {
      throw new Error('Failed to fetch token info');
    }

    console.log(`💱 Swapping ${amountInSol} SOL for ${targetToken.symbol}`);

    // Convert SOL amount to lamports (with token decimals)
    const amountInLamports = new BN(amountInSol * 10 ** solToken.decimals);

    // Find or get pool info
    // Note: You'll need to have a CPMM pool created on devnet
    // For testing, you should create a pool first or use an existing one
    const poolId = await findCpmmPool(raydium, solToken.address, targetToken.address);

    if (!poolId) {
      throw new Error(
        `No CPMM pool found for ${solToken.symbol}/${targetToken.symbol} on devnet. ` +
        'Please create a pool first.'
      );
    }

    console.log('🏊 Using pool:', poolId);

    // Get pool info from RPC
    const { poolInfo, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
    const { baseReserve, quoteReserve, configInfo } = rpcData;

    // Determine if we're trading base or quote
    const baseIn = solToken.address === poolInfo.mintA.address;

    // Calculate swap result
    const swapResult = CurveCalculator.swap(
      amountInLamports,
      baseIn ? baseReserve : quoteReserve,
      baseIn ? quoteReserve : baseReserve,
      configInfo!.tradeFeeRate
    );

    console.log('📈 Expected output:', swapResult.destinationAmountSwapped.toString());
    console.log('💸 Trading fee:', swapResult.tradeFee.toString());

    // Execute the swap
    const { execute, transaction } = await raydium.cpmm.swap({
      poolInfo,
      baseIn,
      swapResult,
      inputAmount: amountInLamports,
      txVersion: TxVersion.V0,
      slippage: slippagePercent / 100, // Convert percentage to decimal
      config: {
        associatedOnly: false, // Allow non-ATA accounts
        checkCreateATAOwner: true, // Auto-create ATA if needed
      },
    });

    console.log('🚀 Executing swap transaction...');

    // Execute transaction
    const { txId } = await execute({ sendAndConfirm: true });

    console.log('✅ Swap successful! TX:', txId);

    return {
      success: true,
      transactionSignature: txId,
      fromToken: solToken.address,
      toToken: targetToken.address,
      amount: amountInSol.toString(),
      outputAmount: swapResult.destinationAmountSwapped.toString(),
      message: 'Swap executed successfully',
    };
  } catch (error: any) {
    console.error('❌ Raydium swap error:', error);
    
    return {
      success: false,
      message: error.message || 'Swap failed',
    };
  }
}

/**
 * Find CPMM pool for token pair
 */
async function findCpmmPool(
  raydium: Raydium,
  tokenA: string,
  tokenB: string
): Promise<string | null> {
  try {
    // Fetch all CPMM pools (you may want to cache this)
    const poolData = await raydium.api.fetchPoolByMints({
      mint1: tokenA,
      mint2: tokenB,
      poolType: 'cpmm',
    });

    if (poolData && poolData.length > 0) {
      return poolData[0].id; // Return first pool found
    }

    return null;
  } catch (error) {
    console.error('Error finding pool:', error);
    return null;
  }
}

/**
 * Create a CPMM pool on devnet (for initial setup)
 * This should be called once to set up your testing environment
 */
export async function createCpmmPoolDevnet(
  fundKeypair: Keypair,
  customTokenMint: string,
  initialTokenAmount: number,
  initialSolAmount: number
): Promise<{ success: boolean; poolId?: string; message?: string }> {
  try {
    console.log('🏊 Creating CPMM pool on devnet...');
    const raydium = await initRaydium(fundKeypair);

    // Get token info
    const mintA = await raydium.token.getTokenInfo(customTokenMint);
    const mintB = await raydium.token.getTokenInfo(NATIVE_MINT.toBase58()); // SOL

    if (!mintA || !mintB) {
      throw new Error('Failed to fetch token info');
    }

    // Get fee configs
    const feeConfigs = await raydium.api.getCpmmConfigs();
    const feeConfig = {
      ...feeConfigs[0],
      id: new PublicKey('9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6'),
    };

    // Create pool
    const { execute, extInfo } = await raydium.cpmm.createPool({
      programId: DEVNET_CPMM,
      poolFeeAccount: DEVNET_FEE_ACC,
      mintA,
      mintB,
      mintAAmount: new BN(initialTokenAmount * 10 ** mintA.decimals),
      mintBAmount: new BN(initialSolAmount * LAMPORTS_PER_SOL),
      startTime: new BN(0), // Start immediately
      config: feeConfig,
      txVersion: TxVersion.V0,
    });

    const { txId } = await execute({ sendAndConfirm: true });

    console.log('✅ Pool created! TX:', txId);
    console.log('🏊 Pool ID:', extInfo.address.toString());

    return {
      success: true,
      poolId: extInfo.address.toString(),
      message: 'Pool created successfully',
    };
  } catch (error: any) {
    console.error('❌ Pool creation error:', error);
    return {
      success: false,
      message: error.message || 'Pool creation failed',
    };
  }
}
