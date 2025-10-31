import {
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  printSimulate,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { initSdk, txVersion, connection, owner } from "./config";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  createSyncNativeInstruction,
  createMintToInstruction,
  getMint,
} from "@solana/spl-token";
import { sendAndConfirmTransaction } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * Check wallet balance before pool creation
 */
const checkWalletBalance = async (
  conn: Connection,
  requiredSol: number
): Promise<boolean> => {
  try {
    console.log("\n--- Checking Wallet Balance ---");
    const balanceLamports = await conn.getBalance(owner.publicKey);
    const balanceSOL = balanceLamports / 1_000_000_000;

    console.log(`Wallet: ${owner.publicKey.toBase58()}`);
    console.log(
      `Balance: ${balanceSOL.toFixed(4)} SOL (${balanceLamports} lamports)`
    );
    console.log(`Required: ${requiredSol} SOL for pool creation + fees`);

    if (balanceLamports < requiredSol * 1_000_000_000) {
      console.error(
        `❌ Insufficient SOL. Need ${requiredSol} SOL but have ${balanceSOL.toFixed(
          4
        )} SOL`
      );
      console.log(`\n💡 Get devnet SOL using:`);
      console.log(
        `   solana airdrop 10 ${owner.publicKey.toBase58()} --url devnet`
      );
      return false;
    }

    console.log("✅ Sufficient balance");
    return true;
  } catch (error) {
    console.error("❌ Error checking balance:", error);
    throw error;
  }
};

/**
 * Create Associated Token Accounts for both tokens if they don't exist
 */
const createATAsIfNeeded = async (
  conn: Connection,
  mintA: PublicKey,
  mintB: PublicKey
): Promise<{ ataA: PublicKey; ataB: PublicKey }> => {
  try {
    console.log("\n--- Creating Associated Token Accounts ---");

    const ataA = await getAssociatedTokenAddress(mintA, owner.publicKey);
    const ataB = await getAssociatedTokenAddress(mintB, owner.publicKey);

    console.log(`ATA A: ${ataA.toBase58()}`);
    console.log(`ATA B: ${ataB.toBase58()}`);

    const ataAExists = await conn.getAccountInfo(ataA);
    const ataBExists = await conn.getAccountInfo(ataB);

    const tx = new Transaction();

    if (!ataAExists) {
      console.log("Creating ATA for Token A...");
      tx.add(
        createAssociatedTokenAccountInstruction(
          owner.publicKey,
          ataA,
          owner.publicKey,
          mintA
        )
      );
    } else {
      console.log("✅ ATA A already exists");
    }

    if (!ataBExists) {
      console.log("Creating ATA for Token B...");
      tx.add(
        createAssociatedTokenAccountInstruction(
          owner.publicKey,
          ataB,
          owner.publicKey,
          mintB
        )
      );
    } else {
      console.log("✅ ATA B already exists");
    }

    if (tx.instructions.length > 0) {
      console.log("Sending ATA creation transaction...");
      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = owner.publicKey;

      const signature = await sendAndConfirmTransaction(conn, tx, [owner]);
      console.log(`✅ ATAs created successfully: ${signature}`);
    }

    return { ataA, ataB };
  } catch (error) {
    console.error("❌ Error creating ATAs:", error);
    throw error;
  }
};

/**
 * Mint tokens to ATA B if it has zero balance
 */
const mintTokensToATA = async (
  conn: Connection,
  mintB: PublicKey,
  ataB: PublicKey,
  amount: BN,
  decimals: number
): Promise<void> => {
  try {
    console.log("\n--- Minting Tokens to ATA B ---");

    // Check if token is already minted on-chain
    const mintInfo = await getMint(conn, mintB);
    console.log(`Token supply: ${mintInfo.supply}`);
    console.log(`Token decimals: ${mintInfo.decimals}`);
    console.log(`Token authority: ${mintInfo.owner?.toBase58()}`);

    // Check current ATA B balance
    const ataInfo = await conn.getParsedAccountInfo(ataB);
    let currentBalance = 0;

    if (ataInfo.value && ataInfo.value.data) {
      currentBalance = parseInt(
        (ataInfo.value.data as any).parsed.info.tokenAmount.amount
      );
    }

    console.log(`Current ATA B Balance: ${currentBalance}`);

    if (currentBalance >= amount.toNumber()) {
      console.log("✅ ATA B already has sufficient tokens, skipping mint");
      return;
    }

    const mintAmount = amount.sub(new BN(currentBalance));
    console.log(
      `Minting ${mintAmount.toString()} tokens to ATA B...`
    );

    // Create mint instruction
    const mintTx = new Transaction().add(
      createMintToInstruction(
        mintB, // token mint
        ataB, // destination token account
        owner.publicKey, // authority
        mintAmount.toNumber(), // amount
        [owner], // signers
        TOKEN_PROGRAM_ID
      )
    );

    const { blockhash } = await conn.getLatestBlockhash();
    mintTx.recentBlockhash = blockhash;
    mintTx.feePayer = owner.publicKey;

    const signature = await sendAndConfirmTransaction(conn, mintTx, [owner]);
    console.log(`✅ Tokens minted successfully: ${signature}`);

    // Verify new balance
    const newAtaInfo = await conn.getParsedAccountInfo(ataB);
    if (newAtaInfo.value && newAtaInfo.value.data) {
      const newBalance = parseInt(
        (newAtaInfo.value.data as any).parsed.info.tokenAmount.amount
      );
      console.log(`New ATA B Balance: ${newBalance}`);
    }
  } catch (error: any) {
    console.error("❌ Error minting tokens:", error.message);
    console.log(
      `\n💡 If mint fails, the token might not have mint authority set to your wallet.`
    );
    console.log(
      `   Check the token's mint authority and try manually minting tokens.`
    );
    throw error;
  }
};

/**
 * Fund ATAs with tokens needed for pool creation
 */
const fundATAs = async (
  conn: Connection,
  ataA: PublicKey,
  ataB: PublicKey,
  mintAAmount: BN,
  mintBAmount: BN,
  decimalsA: number,
  decimalsB: number
): Promise<void> => {
  try {
    console.log("\n--- Funding ATAs with Tokens ---");

    // For SOL (native), we need to send lamports and sync
    console.log(
      `Funding SOL ATA with ${mintAAmount.toString()} lamports...`
    );

    const transferTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: ataA,
        lamports: mintAAmount.toNumber(),
      })
    );

    const { blockhash } = await conn.getLatestBlockhash();
    transferTx.recentBlockhash = blockhash;
    transferTx.feePayer = owner.publicKey;

    const transferSignature = await sendAndConfirmTransaction(
      conn,
      transferTx,
      [owner]
    );
    console.log(`✅ SOL transferred: ${transferSignature}`);

    // Now sync the native SOL
    console.log("Syncing native SOL...");
    const syncTx = new Transaction().add(
      createSyncNativeInstruction(ataA, TOKEN_PROGRAM_ID)
    );

    const syncBlockhash = await conn.getLatestBlockhash();
    syncTx.recentBlockhash = syncBlockhash.blockhash;
    syncTx.feePayer = owner.publicKey;

    const syncSignature = await sendAndConfirmTransaction(conn, syncTx, [
      owner,
    ]);
    console.log(`✅ SOL synced: ${syncSignature}`);
  } catch (error) {
    console.error("❌ Error funding ATAs:", error);
    throw error;
  }
};

/**
 * Verify ATA balances before pool creation
 */
const verifyATABalances = async (
  conn: Connection,
  ataA: PublicKey,
  ataB: PublicKey,
  requiredAmountA: BN,
  requiredAmountB: BN
): Promise<boolean> => {
  try {
    console.log("\n--- Verifying ATA Balances ---");
    const ataAInfo = await conn.getParsedAccountInfo(ataA);
    const ataBInfo = await conn.getParsedAccountInfo(ataB);

    let balanceA = 0;
    let balanceB = 0;

    if (ataAInfo.value && ataAInfo.value.data) {
      balanceA = parseInt(
        (ataAInfo.value.data as any).parsed.info.tokenAmount.amount
      );
      console.log(
        `ATA A Balance: ${balanceA} (required: ${requiredAmountA.toString()})`
      );
    }

    if (ataBInfo.value && ataBInfo.value.data) {
      balanceB = parseInt(
        (ataBInfo.value.data as any).parsed.info.tokenAmount.amount
      );
      console.log(
        `ATA B Balance: ${balanceB} (required: ${requiredAmountB.toString()})`
      );
    }

    const isValid =
      balanceA >= requiredAmountA.toNumber() &&
      balanceB >= requiredAmountB.toNumber();

    if (!isValid) {
      console.warn(
        "⚠️ Insufficient balance in one or both ATAs. Please fund them first."
      );
      return false;
    }

    console.log("✅ All balances verified");
    return true;
  } catch (error) {
    console.error("❌ Error verifying balances:", error);
    throw error;
  }
};

/**
 * Create a CPMM pool with two tokens on devnet
 * Initial Liquidity: 2 SOL and 1000 tokens
 */
export const createPool = async () => {
  try {
    const rpcUrl =
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const conn = new Connection(rpcUrl, "confirmed");

    console.log("🚀 Starting CPMM Pool Creation...");

    // Check balance first (2 SOL for liquidity + 5 SOL for fees and rent)
    const hasBalance = await checkWalletBalance(conn, 7);
    if (!hasBalance) {
      throw new Error("Insufficient SOL balance");
    }

    const raydium = await initSdk({ loadToken: true });

    console.log("Initializing CPMM Pool Creation...");

    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const USDC_MINT = "GGqMi4BHZiCrj96ZmETvmAMeDLAjxBnt8y6L4gzJSXAQ";

    const mintA = await raydium.token.getTokenInfo(SOL_MINT);
    const mintB = await raydium.token.getTokenInfo(USDC_MINT);

    console.log(`Token A (${mintA.symbol}):`, mintA.address);
    console.log(`Token B (${mintB.symbol}):`, mintB.address);

    // Step 1: Create Associated Token Accounts
    const { ataA, ataB } = await createATAsIfNeeded(
      conn,
      new PublicKey(mintA.address),
      new PublicKey(mintB.address)
    );

    // Step 2: Define initial liquidity amounts
    // 2 SOL (9 decimals: 2 * 10^9)
    const mintAAmount = new BN(2 * Math.pow(10, mintA.decimals));
    // 1000 tokens (6 decimals: 1000 * 10^6)
    const mintBAmount = new BN(1000 * Math.pow(10, mintB.decimals));

    console.log(`\nInitial Liquidity:`);
    console.log(
      `  ${mintA.symbol}: ${mintAAmount.toString()} (${mintA.decimals} decimals) = 2 SOL`
    );
    console.log(
      `  ${mintB.symbol}: ${mintBAmount.toString()} (${mintB.decimals} decimals) = 1000 tokens`
    );

    // Step 3: Fund the SOL ATA
    await fundATAs(
      conn,
      ataA,
      ataB,
      mintAAmount,
      mintBAmount,
      mintA.decimals,
      mintB.decimals
    );

    // Step 4: Mint tokens to Token B ATA
    await mintTokensToATA(conn, new PublicKey(mintB.address), ataB, mintBAmount, mintB.decimals);

    // Step 5: Verify balances
    const balancesOk = await verifyATABalances(
      conn,
      ataA,
      ataB,
      mintAAmount,
      mintBAmount
    );

    if (!balancesOk) {
      throw new Error(
        "Insufficient balances in ATAs. Please fund them first."
      );
    }

    // Fetch available fee configurations
    const feeConfigs = await raydium.api.getCpmmConfigs();
    console.log(`\nAvailable fee configs: ${feeConfigs.length}`);

    if (raydium.cluster === "devnet") {
      feeConfigs.forEach((config, index) => {
        config.id = getCpmmPdaAmmConfigId(
          DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
          config.index
        ).publicKey.toBase58();
        console.log(`Fee Config ${index}:`, {
          fee: config.tradeFeeRate,
          id: config.id,
        });
      });
    }

    const selectedFeeConfig = feeConfigs[0];

    if (!selectedFeeConfig) {
      throw new Error("No fee config available");
    }

    console.log(
      `\nSelected fee config: ${selectedFeeConfig.tradeFeeRate} bps (${selectedFeeConfig.id})`
    );

    // Build pool creation transaction
    console.log("\nBuilding pool creation transaction...");
    const { execute, extInfo, transaction } = await raydium.cpmm.createPool({
      programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
      mintA,
      mintB,
      mintAAmount,
      mintBAmount,
      startTime: new BN(0),
      feeConfig: selectedFeeConfig,
      associatedOnly: false,
      ownerInfo: {
        useSOLBalance: true,
      },
      txVersion,
    });

    console.log("\n--- Pool Creation Transaction Details ---");
    console.log("Pool ID:", extInfo.address.poolId?.toString());
    console.log("Token Vault A:", extInfo.address.vaultA?.toString());
    console.log("Token Vault B:", extInfo.address.vaultB?.toString());
    console.log("LP Token Mint:", extInfo.address.lpMint?.toString());
    console.log("Authority:", extInfo.address.authority?.toString());
    console.log("Config ID:", extInfo.address.configId?.toString());

    console.log("\n📊 Simulating transaction...");
    printSimulate([transaction]);

    console.log("\n⏳ Executing pool creation...");
    const { txId } = await execute({ sendAndConfirm: true });

    console.log("\n✅ Pool created successfully!");
    console.log("Transaction ID:", txId);
    console.log(
      "Explorer Link: https://explorer.solana.com/tx/" +
        txId +
        "?cluster=devnet"
    );
    console.log("\n--- Final Pool Details ---");
    console.log("Pool ID:", extInfo.address.poolId?.toString());
    console.log("LP Token Mint:", extInfo.address.lpMint?.toString());
    console.log("Vault A (SOL):", extInfo.address.vaultA?.toString());
    console.log("Vault B (Token):", extInfo.address.vaultB?.toString());
    console.log("Authority:", extInfo.address.authority?.toString());

    return {
      txId,
      poolId: extInfo.address.poolId?.toString(),
      lpMint: extInfo.address.lpMint?.toString(),
      vaultA: extInfo.address.vaultA?.toString(),
      vaultB: extInfo.address.vaultB?.toString(),
      authority: extInfo.address.authority?.toString(),
    };
  } catch (error: any) {
    console.error("\n❌ Error creating pool:", error.message || error);
    if (error.logs) {
      console.error("Transaction logs:", error.logs);
    }
    throw error;
  }
};

// Main execution
createPool()
  .then((result) => {
    console.log("\n✅ Pool creation completed successfully!");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Pool creation failed:", error.message || error);
    process.exit(1);
  });
