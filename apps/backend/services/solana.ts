import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "../../../packages/idl.json";
import bs58 from "bs58";

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

// Load your backend wallet (KEEP THIS SECRET!)
const BACKEND_WALLET = Keypair.fromSecretKey(
  bs58.decode(process.env.SOLANA_PRIVATE_KEY!)
);

export async function initializeFundOnBlockchain(
  groupId: string,
  fundName: string,
  minContribution: number,
  tradingFeeBps: number,
  userWalletAddress: string
) {
  try {
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(BACKEND_WALLET),
      { commitment: "confirmed" }
    );

    const program = new anchor.Program(idl as anchor.Idl, provider);

    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    if (!program.methods.initializeFund) {
      console.log("we cannot find the intialize fund method");
      return;
    }
    // Create and sign transaction
    const tx = await program.methods
      .initializeFund(
        groupId,
        fundName,
        new anchor.BN(minContribution),
        tradingFeeBps
      )
      .accounts({
        fund: fundPda,
        authority: new PublicKey(userWalletAddress),
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = BACKEND_WALLET.publicKey;

    // Sign with backend wallet
    tx.sign(BACKEND_WALLET);

    // Send transaction
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature);

    return { signature, fundPda: fundPda.toBase58() };
  } catch (error) {
    throw error;
  }
}
