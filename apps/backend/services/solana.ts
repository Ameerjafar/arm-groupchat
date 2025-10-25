import dotenv from "dotenv";
dotenv.config();

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idl from "../../../packages/idl.json";

const PROGRAM_ID = new PublicKey(
  "9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy"
);

console.log("RPC URL:", process.env.ANCHOR_PROVIDER_URL);

const provider = AnchorProvider.env();
console.log("Provider loaded successfully");

anchor.setProvider(provider);

const program = new Program(idl as Idl, provider);
console.log("✅ Program initialized");

/**
 * Check if a fund exists for a given group
 */
export async function checkFundExists(groupId: string): Promise<boolean> {
  const [fundPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), Buffer.from(groupId)],
    program.programId
  );

  try {
    await program.account.fund.fetch(fundPda);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Initialize a new fund for a Telegram group
 */
export async function initializeFund({
  groupId,
  fundName,
  minContribution,
  tradingFeeBps,
  ownerWalletAddress,
}: {
  groupId: string;
  fundName: string;
  minContribution: number;
  tradingFeeBps: number;
  ownerWalletAddress: PublicKey;
}) {
  const authority = ownerWalletAddress;

  const [fundPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), Buffer.from(groupId)],
    program.programId
  );

  console.log("Initializing Fund for group:", groupId);
  console.log("Fund PDA:", fundPda.toBase58());

  if (!program.methods.initializeFund) {
    console.log("❌ Cannot find the program method");
    return;
  }

  const txSignature = await program.methods
    .initializeFund(
      groupId,
      fundName,
      new anchor.BN(minContribution),
      tradingFeeBps
    )
    .accounts({
      fund: fundPda,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Fund initialized!");
  console.log("Transaction signature:", txSignature);

  return txSignature;
}

/**
 * Contribute to fund - Auto-registers member on first contribution
 * This replaces the old add_member function
 */
export async function contribute({
  groupId,
  memberWallet,
  telegramId,
  amount,
  memberTokenAccount,
  vaultTokenAccount,
}: {
  groupId: string;
  memberWallet: Keypair; // Member's wallet keypair (must sign)
  telegramId: string; // Member's Telegram ID
  amount: number; // Amount to contribute (in token's smallest unit)
  memberTokenAccount: PublicKey; 
  vaultTokenAccount: PublicKey;
}) {
  // Check if fund exists
  const fundExists = await checkFundExists(groupId);
  if (!fundExists) {
    throw new Error(
      `❌ Fund for group ${groupId} does not exist. Initialize it first with initializeFund()`
    );
  }

  const [fundPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), Buffer.from(groupId)],
    program.programId
  );

  const [memberPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("member"),
      fundPda.toBuffer(),
      memberWallet.publicKey.toBuffer(),
    ],
    program.programId
  );

  console.log("Contributing to fund:", groupId);
  console.log("Member PDA:", memberPda.toBase58());
  console.log("Amount:", amount);
  if(!program.methods.contribute) {
    console.log("we cannot find the contribute method in this program");
    return;
  }
  try {
    const txSignature = await program.methods
      .contribute(
        telegramId, 
        new anchor.BN(amount) 
      )
      .accounts({
        fund: fundPda,
        member: memberPda, // Will be created if first contribution
        memberTokenAccount: memberTokenAccount,
        vaultTokenAccount: vaultTokenAccount,
        memberWallet: memberWallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([memberWallet]) // Member must sign (pays rent on first contribution)
      .rpc();

    console.log("✅ Contribution successful!");
    console.log("Transaction signature:", txSignature);

    return txSignature;
  } catch (error: any) {
    if (
      error.message.includes("AccountNotInitialized") ||
      error.message.includes("Account does not exist")
    ) {
      throw new Error(
        `❌ Fund for group ${groupId} has not been initialized. ` +
          `Initialize it first with initializeFund()`
      );
    }
    throw error;
  }
}

// Example usage
async function main() {
  // 1. Initialize fund
  await initializeFund({
    groupId: "-1001234567890",
    fundName: "Alpha Trading Group",
    minContribution: 1000000, // 1 token (6 decimals)
    tradingFeeBps: 50,
    ownerWalletAddress: provider.wallet.publicKey,
  });

  // 2. Member contributes (auto-registers on first contribution)
  // Note: Replace these with actual values
  const memberKeypair = Keypair.generate(); // Replace with actual member keypair
  const memberTokenAccountPubkey = new PublicKey("..."); // Replace with actual token account
  const vaultTokenAccountPubkey = new PublicKey("..."); // Replace with actual vault token account

  await contribute({
    groupId: "-1001234567890",
    memberWallet: memberKeypair, 
    telegramId: "123456789",
    amount: 5000000, 
    memberTokenAccount: memberTokenAccountPubkey,
    vaultTokenAccount: vaultTokenAccountPubkey,
  });
}

main().catch(console.error);
