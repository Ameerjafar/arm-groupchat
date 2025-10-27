import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import idl from "../../../../packages/idl.json";
import { prisma } from "@repo/db";
import bs58 from "bs58";
import { decrypt } from "../utlis";

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

export async function contributeToFund(
  groupId: string,
  telegramId: string,
  amountSol: number
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

    if (secretKey.length !== 64) {
      throw new Error(`Invalid secret key length: ${secretKey.length}`);
    }

    const userKeypair = Keypair.fromSecretKey(secretKey);
    console.log("User public key:", userKeypair.publicKey.toBase58());

    // Setup Anchor provider and program
    const provider = new AnchorProvider(
      connection,
      new anchor.Wallet(userKeypair),
      { commitment: "confirmed" }
    );

    const program = new Program(idl as anchor.Idl, provider);

    // Convert SOL to lamports
    const amountLamports = new BN(amountSol * LAMPORTS_PER_SOL);

    // Derive PDAs
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("member"),
        fundPda.toBuffer(),
        userKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    console.log("Fund PDA:", fundPda.toBase58());
    console.log("Member PDA:", memberPda.toBase58());

    // Check if member exists, if not create one first
    const memberExists = await checkMemberExists(groupId, userKeypair.publicKey);

    if (!memberExists) {
      console.log("Member doesn't exist, creating member account first...");
      await addMemberToFund(groupId, telegramId);
    }

    // Fetch fund account
    const fundAccount = await program.account.fund.fetch(fundPda);

    // Check if fund is active
    if (!fundAccount.isActive) {
      throw new Error("Fund is not active");
    }

    // Check minimum contribution
    if (amountLamports.lt(fundAccount.minContribution)) {
      throw new Error(
        `Contribution below minimum required: ${
          fundAccount.minContribution.toNumber() / LAMPORTS_PER_SOL
        } SOL`
      );
    }
    let sharesMinted: BN;
    if (fundAccount.totalShares.isZero()) {
      sharesMinted = amountLamports;
    } else {
      sharesMinted = amountLamports
        .mul(fundAccount.totalShares)
        .div(fundAccount.totalValue);
    }

    console.log("Shares to be minted:", sharesMinted.toString());

    const balance = await connection.getBalance(userKeypair.publicKey);
    console.log("User balance:", balance / LAMPORTS_PER_SOL, "SOL");

    if (balance < amountLamports.toNumber() + 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Insufficient balance. Required: ${
          (amountLamports.toNumber() + 0.01 * LAMPORTS_PER_SOL) /
          LAMPORTS_PER_SOL
        } SOL, Available: ${balance / LAMPORTS_PER_SOL} SOL`
      );
    }

    // Execute contribute instruction
    console.log("Sending contribute transaction...");

    if (!program.methods.contribute) {
      throw new Error("contribute method not found in program");
    }

    const signature = await program.methods
      .contribute(amountLamports)
      .accounts({
        fund: fundPda,
        member: memberPda,
        memberWallet: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Contribution successful!");
    console.log("Transaction signature:", signature);

    // Fetch updated fund balance
    const updatedFund = await program.account.fund.fetch(fundPda);
    const newFundBalance = updatedFund.totalValue.toNumber() / LAMPORTS_PER_SOL;

    return {
      transactionSignature: signature,
      sharesMinted: sharesMinted.toString(),
      newFundBalance,
      fundPdaAddress: fundPda.toBase58(),
    };
  } catch (error: any) {
    console.error("❌ Error in contributeToFund:", error.message);
    throw error;
  }
}

/**
 * Add a new member to a fund
 */
export async function addMemberToFund(groupId: string, telegramId: string) {
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
    const userKeypair = Keypair.fromSecretKey(secretKey);

    // Setup Anchor provider and program
    const provider = new AnchorProvider(
      connection,
      new anchor.Wallet(userKeypair),
      { commitment: "confirmed" }
    );

    const program = new Program(idl as anchor.Idl, provider);

    // Derive PDAs
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("member"),
        fundPda.toBuffer(),
        userKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    console.log("Adding member to fund...");
    console.log("Member PDA:", memberPda.toBase58());

    if (!program.methods.addMember) {
      throw new Error("addMember method not found in program");
    }

    const signature = await program.methods
      .addMember(telegramId)
      .accounts({
        fund: fundPda,
        member: memberPda,
        memberWallet: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Member added successfully");
    console.log("Transaction signature:", signature);

    return {
      transactionSignature: signature,
      memberPdaAddress: memberPda.toBase58(),
    };
  } catch (error: any) {
    console.error("❌ Error in addMemberToFund:", error.message);
    throw error;
  }
}

/**
 * Withdraw shares from fund
 */
export async function withdrawFromFund(
  groupId: string,
  telegramId: string,
  sharesToBurn: number
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
    const userKeypair = Keypair.fromSecretKey(secretKey);

    // Setup Anchor provider and program
    const provider = new AnchorProvider(
      connection,
      new anchor.Wallet(userKeypair),
      { commitment: "confirmed" }
    );

    const program = new Program(idl as anchor.Idl, provider);

    // Derive PDAs
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("member"),
        fundPda.toBuffer(),
        userKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    // Fetch member account
    const memberAccount = await program.account.member.fetch(memberPda);
    const memberShares = memberAccount.shares.toNumber();

    if (memberShares < sharesToBurn) {
      throw new Error(
        `Insufficient shares. Have: ${memberShares}, Requested: ${sharesToBurn}`
      );
    }

    // Fetch fund account to calculate withdrawal amount
    const fundAccount = await program.account.fund.fetch(fundPda);
    const sharesToBurnBN = new BN(sharesToBurn);
    const withdrawalAmountLamports = sharesToBurnBN
      .mul(fundAccount.totalValue)
      .div(fundAccount.totalShares)
      .toNumber();

    console.log(
      "Withdrawal amount:",
      withdrawalAmountLamports / LAMPORTS_PER_SOL,
      "SOL"
    );

    if (!program.methods.withdraw) {
      throw new Error("withdraw method not found in program");
    }

    const signature = await program.methods
      .withdraw(sharesToBurnBN)
      .accounts({
        fund: fundPda,
        member: memberPda,
        memberWallet: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Withdrawal successful!");
    console.log("Transaction signature:", signature);

    // Fetch updated member shares
    const updatedMember = await program.account.member.fetch(memberPda);

    return {
      transactionSignature: signature,
      withdrawalAmount: withdrawalAmountLamports / LAMPORTS_PER_SOL,
      remainingShares: updatedMember.shares.toString(),
    };
  } catch (error: any) {
    console.error("❌ Error in withdrawFromFund:", error.message);
    throw error;
  }
}

/**
 * Get member's share information
 */
export async function getMemberShares(groupId: string, telegramId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user?.walletAddress) {
      throw new Error("User wallet not found");
    }

    const userPublicKey = new PublicKey(user.walletAddress);

    const provider = new AnchorProvider(
      connection,
      {} as any,
      { commitment: "confirmed" }
    );

    const program = new Program(idl as anchor.Idl, provider);

    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), fundPda.toBuffer(), userPublicKey.toBuffer()],
      program.programId
    );

    const memberAccount = await program.account.member.fetch(memberPda);

    return {
      shares: memberAccount.shares.toString(),
      totalContributed: memberAccount.totalContributed.toNumber() / LAMPORTS_PER_SOL,
      isActive: memberAccount.isActive,
      wallet: memberAccount.wallet.toBase58(),
      successfulTrades: memberAccount.successfulTrades,
      failedTrades: memberAccount.failedTrades,
      reputationScore: memberAccount.reputationScore,
    };
  } catch (error: any) {
    console.error("❌ Error in getMemberShares:", error.message);
    throw error;
  }
}

/**
 * Check if member account exists
 */
export async function checkMemberExists(
  groupId: string,
  userPublicKey: PublicKey
): Promise<boolean> {
  try {
    const provider = new AnchorProvider(
      connection,
      {} as any,
      { commitment: "confirmed" }
    );

    const program = new Program(idl as anchor.Idl, provider);

    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), fundPda.toBuffer(), userPublicKey.toBuffer()],
      program.programId
    );

    await program.account.member.fetch(memberPda);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get fund information
 */
export async function getFundInfo(groupId: string) {
  try {
    const provider = new AnchorProvider(
      connection,
      {} as any,
      { commitment: "confirmed" }
    );

    const program = new Program(idl as anchor.Idl, provider);

    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const fundAccount = await program.account.fund.fetch(fundPda);

    return {
      fundPdaAddress: fundPda.toBase58(),
      totalShares: fundAccount.totalShares.toString(),
      totalValue: fundAccount.totalValue.toNumber() / LAMPORTS_PER_SOL,
      minContribution: fundAccount.minContribution.toNumber() / LAMPORTS_PER_SOL,
      tradingFeeBps: fundAccount.tradingFeeBps,
      isActive: fundAccount.isActive,
      fundName: fundAccount.fundName,
      authority: fundAccount.authority.toBase58(),
      groupId: fundAccount.groupId,
    };
  } catch (error: any) {
    console.error("❌ Error in getFundInfo:", error.message);
    throw new Error("Fund not found on blockchain");
  }
}
