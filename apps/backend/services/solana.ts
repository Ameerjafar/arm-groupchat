import * as anchor from "@project-serum/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idl from '../services/idl.json';
const PROGRAM_ID = new PublicKey("5bDEAfuk7KFuQFdfZUaieL5YtMt3nxUSTGJwcvQuRyu3");

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = new anchor.Program(
  idl as any,
  PROGRAM_ID,
  provider
);

// Example function: initialize a new fund vault
export async function initializeFund() {
  const authority = provider.wallet.publicKey;
  const [fundPda, fundBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), authority.toBuffer()],
    PROGRAM_ID
  );

  console.log("Initializing Fund:", fundPda.toBase58());

  await program?.methods?.initializeFund("Alpha Group", new anchor.BN(1000000), 50) // min_contribution: 1_000_000, trading_fee_bps: 50 = 0.5%
    .accounts({
      fund: fundPda,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Fund initialized!");
}

// Example function: add a member
// export async function addMember(memberWallet: PublicKey, telegramId: string) {
//   const authority = provider.wallet.publicKey;

//   const [fundPda] = PublicKey.findProgramAddressSync(
//     [Buffer.from("fund"), authority.toBuffer()],
//     PROGRAM_ID
//   );

//   const [memberPda] = PublicKey.findProgramAddressSync(
//     [Buffer.from("member"), fundPda.toBuffer(), memberWallet.toBuffer()],
//     PROGRAM_ID
//   );

//   console.log("Adding member:", memberWallet.toBase58());

//   await program.methods
//     .addMember(telegramId, { contributor: {} }) // role: Contributor
//     .accounts({
//       fund: fundPda,
//       member: memberPda,
//       memberWallet,
//       authority,
//       systemProgram: SystemProgram.programId,
//     })
//     .rpc();

//   console.log("✅ Member added!");
// }

// // Example function: contribute to the fund
// export async function contribute(
//   memberWallet: anchor.web3.Keypair,
//   memberTokenAccount: PublicKey,
//   vaultTokenAccount: PublicKey,
//   amount: number
// ) {
//   const [fundPda] = PublicKey.findProgramAddressSync(
//     [Buffer.from("fund"), provider.wallet.publicKey.toBuffer()],
//     PROGRAM_ID
//   );

//   const [memberPda] = PublicKey.findProgramAddressSync(
//     [Buffer.from("member"), fundPda.toBuffer(), memberWallet.publicKey.toBuffer()],
//     PROGRAM_ID
//   );

//   console.log("Contributing:", amount);

//   await program.methods
//     .contribute(new anchor.BN(amount))
//     .accounts({
//       fund: fundPda,
//       member: memberPda,
//       memberTokenAccount,
//       vaultTokenAccount,
//       memberWallet: memberWallet.publicKey,
//       tokenProgram: TOKEN_PROGRAM_ID,
//     })
//     .signers([memberWallet])
//     .rpc();

//   console.log("✅ Contribution successful!");
// }

// // Example function: withdraw shares
// export async function withdraw(
//   memberWallet: anchor.web3.Keypair,
//   memberTokenAccount: PublicKey,
//   vaultTokenAccount: PublicKey,
//   sharesToBurn: number
// ) {
//   const [fundPda] = PublicKey.findProgramAddressSync(
//     [Buffer.from("fund"), provider.wallet.publicKey.toBuffer()],
//     PROGRAM_ID
//   );

//   const [memberPda] = PublicKey.findProgramAddressSync(
//     [Buffer.from("member"), fundPda.toBuffer(), memberWallet.publicKey.toBuffer()],
//     PROGRAM_ID
//   );

//   console.log("Withdrawing shares:", sharesToBurn);

//   await program.methods
//     .withdraw(new anchor.BN(sharesToBurn))
//     .accounts({
//       fund: fundPda,
//       member: memberPda,
//       memberTokenAccount,
//       vaultTokenAccount,
//       memberWallet: memberWallet.publicKey,
//       tokenProgram: TOKEN_PROGRAM_ID,
//     })
//     .signers([memberWallet])
//     .rpc();

//   console.log("✅ Withdrawal successful!");
// }
