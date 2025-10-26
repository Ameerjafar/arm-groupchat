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
