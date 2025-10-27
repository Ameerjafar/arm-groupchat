import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "../../../packages/idl.json";
import bs58 from "bs58";
import { prisma } from "@repo/db";
import { decrypt } from "./utlis";

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

export async function initializeFundOnBlockchain(
  groupId: string,
  fundName: string,
  minContribution: number,
  tradingFeeBps: number,
  telegramId: string
) {
  try {
    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.walletAddress || !user.encryptedPrivateKey) {
      throw new Error("User wallet or private key not found");
    }

    console.log("Decrypting private key...");

    // Decrypt and restore keypair
    const decryptedBase58String = decrypt(user.encryptedPrivateKey);
    const secretKey = bs58.decode(decryptedBase58String);

    if (secretKey.length !== 64) {
      throw new Error(`Invalid secret key length: ${secretKey.length}`);
    }

    const restoredKeypair = Keypair.fromSecretKey(secretKey);

    console.log("Keypair restored successfully");
    console.log("Public key:", restoredKeypair.publicKey.toBase58());

    // Check balance
    let balance = await connection.getBalance(restoredKeypair.publicKey);
    console.log("Current balance:", balance / LAMPORTS_PER_SOL, "SOL");

    // ✅ FIX: Request airdrop and WAIT for confirmation
    if (balance < 0.5 * LAMPORTS_PER_SOL) {
      console.log("Requesting airdrop...");

      try {
        const airdropSignature = await connection.requestAirdrop(
          restoredKeypair.publicKey,
          2 * LAMPORTS_PER_SOL
        );

        console.log("Airdrop signature:", airdropSignature);

        // ✅ WAIT for airdrop confirmation
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction(
          {
            signature: airdropSignature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "confirmed"
        );

        console.log("✅ Airdrop confirmed!");

        // ✅ Wait a bit for balance to update
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // ✅ Check balance again
        balance = await connection.getBalance(restoredKeypair.publicKey);
        console.log("New balance:", balance / LAMPORTS_PER_SOL, "SOL");

        if (balance < 0.1 * LAMPORTS_PER_SOL) {
          throw new Error(
            `Balance still insufficient: ${balance / LAMPORTS_PER_SOL} SOL. ` +
            `Please fund manually: ${restoredKeypair.publicKey.toBase58()}`
          );
        }
      } catch (airdropError: any) {
        console.error("Airdrop failed:", airdropError.message);
        throw new Error(
          `Failed to get airdrop. Please fund your wallet:\n` +
          `Address: ${restoredKeypair.publicKey.toBase58()}\n` +
          `Use: https://faucet.solana.com`
        );
      }
    }

    // ✅ Verify sufficient balance
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Insufficient balance: ${balance / LAMPORTS_PER_SOL} SOL. ` +
        `Fund required: ${restoredKeypair.publicKey.toBase58()}`
      );
    }

    console.log("✅ Balance sufficient, creating fund...");

    // Setup Anchor provider and program
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(restoredKeypair),
      { commitment: "confirmed" }
    );

    const program = new anchor.Program(idl as anchor.Idl, provider);

    // Derive PDA
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    console.log("Fund PDA:", fundPda.toBase58());

    // ✅ Check if fund already exists
    try {
      const existingFund = await program.account.fund.fetch(fundPda);
      console.log("⚠️ Fund already exists!");
      return {
        fundPdaAddress: fundPda.toBase58(),
        authority: existingFund.authority.toBase58(),
        transactionSignature: null,
        alreadyExists: true,
      };
    } catch (error) {
      // Fund doesn't exist, continue
      console.log("Fund doesn't exist, creating new one");
    }

    // Verify method exists
    if (!program.methods.initializeFund) {
      throw new Error("initializeFund method not found in program");
    }

    // Create and send transaction
    console.log("Creating transaction...");
    const tx = await program.methods
      .initializeFund(
        groupId,
        fundName,
        new anchor.BN(minContribution),
        tradingFeeBps
      )
      .accounts({
        fund: fundPda,
        authority: restoredKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = restoredKeypair.publicKey;

    // Sign transaction
    tx.sign(restoredKeypair);

    console.log("Sending transaction...");

    // Send and confirm
    const signature = await connection.sendRawTransaction(tx.serialize());
    
    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed"
    );

    console.log("✅ Fund created successfully!");
    console.log("Transaction:", signature);

    return {
      transactionSignature: signature,
      fundPdaAddress: fundPda.toBase58(),
      authority: restoredKeypair.publicKey.toBase58(),
      alreadyExists: false,
    };
  } catch (error: any) {
    console.error("❌ Error in initializeFundOnBlockchain:", error.message);
    throw error;
  }
}


// services/solanaService.ts
export async function closeFundOnBlockchain(
  groupId: string,
  telegramId: string
) {
  try {
    // Get user and decrypt keypair
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user?.encryptedPrivateKey) {
      throw new Error("User wallet not found");
    }

    console.log("Decrypting private key...");
    const decryptedBase58String = decrypt(user.encryptedPrivateKey);
    const secretKey = bs58.decode(decryptedBase58String);
    const keypair = Keypair.fromSecretKey(secretKey);

    console.log("Authority:", keypair.publicKey.toBase58());

    // Setup Anchor
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(keypair),
      { commitment: "confirmed" }
    );

    const program = new anchor.Program(idl as anchor.Idl, provider);

    // Derive PDA
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    console.log("Fund PDA:", fundPda.toBase58());

    // Check if fund exists and get its data
    let fundAccount;
    try {
      fundAccount = await program.account.fund.fetch(fundPda);
      console.log("Fund found:", fundAccount);
    } catch (error) {
      throw new Error("Fund not found on blockchain");
    }

    // Verify authority
    if (fundAccount.authority.toBase58() !== keypair.publicKey.toBase58()) {
      throw new Error("Only fund authority can close the fund");
    }

    // Check if fund is empty
    if (fundAccount.totalValue > 0) {
      throw new Error(
        `Fund has balance: ${fundAccount.totalValue}. Must withdraw all funds first.`
      );
    }

    if (fundAccount.totalShares > 0) {
      throw new Error(
        `Fund has ${fundAccount.totalShares} shares remaining. All members must withdraw first.`
      );
    }

    // Close the fund
    console.log("Closing fund on blockchain...");
    if(!program.methods.closeFund) {
      console.log("close fund method could not found");
      return;
    }
    const tx = await program.methods
      .closeFund()
      .accounts({
        fund: fundPda,
        authority: keypair.publicKey,
      })
      .rpc();

    console.log("✅ Fund closed successfully on blockchain!");
    console.log("Transaction:", tx);
    console.log("Rent reclaimed to:", keypair.publicKey.toBase58());

    return {
      success: true,
      transactionSignature: tx,
      rentReclaimed: true,
    };
  } catch (error: any) {
    console.error("Error closing fund on blockchain:", error);
    throw error;
  }
}


// services/solanaService.ts

// Pause fund on blockchain
export async function pauseFundOnBlockchain(
  groupId: string,
  telegramId: string
) {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user?.encryptedPrivateKey) {
      throw new Error("User wallet not found");
    }

    console.log("Decrypting private key...");
    const decryptedBase58String = decrypt(user.encryptedPrivateKey);
    const secretKey = bs58.decode(decryptedBase58String);
    const keypair = Keypair.fromSecretKey(secretKey);

    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(keypair),
      { commitment: "confirmed" }
    );

    const program = new anchor.Program(idl as anchor.Idl, provider);

    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    console.log("Pausing fund on blockchain...");

    // Verify fund exists and authority
    const fundAccount = await program.account.fund.fetch(fundPda);
    if (fundAccount.authority.toBase58() !== keypair.publicKey.toBase58()) {
      throw new Error("Only fund authority can pause the fund");
    }

    // Call pause_fund instruction
    if(!program.methods.pauseFund) {
      console.log("cannot found the method pausefund");
      return;
    }
    const tx = await program.methods
      .pauseFund()
      .accounts({
        fund: fundPda,
        authority: keypair.publicKey,
      })
      .rpc();

    console.log("✅ Fund paused on blockchain");
    return { transactionSignature: tx };
  } catch (error: any) {
    console.error("Error pausing fund:", error);
    throw error;
  }
}

// Resume fund on blockchain
export async function resumeFundOnBlockchain(
  groupId: string,
  telegramId: string
) {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user?.encryptedPrivateKey) {
      throw new Error("User wallet not found");
    }

    console.log("Decrypting private key...");
    const decryptedBase58String = decrypt(user.encryptedPrivateKey);
    const secretKey = bs58.decode(decryptedBase58String);
    const keypair = Keypair.fromSecretKey(secretKey);

    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(keypair),
      { commitment: "confirmed" }
    );

    const program = new anchor.Program(idl as anchor.Idl, provider);

    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    console.log("Resuming fund on blockchain...");

    // Verify fund exists and authority
    const fundAccount = await program.account.fund.fetch(fundPda);
    if (fundAccount.authority.toBase58() !== keypair.publicKey.toBase58()) {
      throw new Error("Only fund authority can resume the fund");
    }
    if(!program.methods.resumeFund) {
      console.log("method resume fund is not found");
      return;
    }
    const tx = await program.methods
      .resumeFund()
      .accounts({
        fund: fundPda,
        authority: keypair.publicKey,
      })
      .rpc();

    console.log("✅ Fund resumed on blockchain");
    return { transactionSignature: tx };
  } catch (error: any) {
    console.error("Error resuming fund:", error);
    throw error;
  }
}
