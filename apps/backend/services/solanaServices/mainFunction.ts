import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { GroupchatFund } from "../../../../contract/groupchat_fund/target/types/groupchat_fund";
import IDL from "../../../../contract/groupchat_fund/target/idl/groupchat_fund.json";
import { proposeTrade, canProposeTrade, getProposalDetails } from "./tradeServices";
import dotenv from 'dotenv';
dotenv.config();
async function main() {
  // Setup
  console.log("ANCHOR WALLET", process.env.ANCHOR_WALLET);
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  
  const programId = new PublicKey("9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy");
  const program = new anchor.Program<GroupchatFund>(IDL as any, provider);

  // Configuration
  const groupId = "test_group_1";
  const proposerKeypair = wallet.payer;
  
  // Token addresses
  const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
  const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  console.log("🔍 Checking if member can propose trades...");
  
  // Check permissions first
  const canPropose = await canProposeTrade(program, groupId, proposerKeypair.publicKey);
  
  if (!canPropose) {
    console.error("❌ Member is not authorized to propose trades");
    console.log("Make sure:");
    console.log("1. Member is registered (call addMember)");
    console.log("2. Member role is Trader or Manager (call updateMemberRole)");
    console.log("3. Member is in approved traders list (call manageTrader)");
    return;
  }

  console.log("✅ Member can propose trades");

  // Create proposal
  console.log("\n📝 Creating trade proposal...");
  console.log(`Swap: ${1} SOL → ${100} USDC minimum`);

  const result = await proposeTrade(
    program,
    proposerKeypair,
    groupId,
    SOL_MINT,
    USDC_MINT,
    0.1 * LAMPORTS_PER_SOL,  // 1 SOL
    100_000_000     // 100 USDC minimum
  );

  if (result.success) {
    console.log("\n✅ Proposal created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Transaction:", result.transactionSignature);
    console.log("Proposal ID:", result.proposalId);
    console.log("Proposal Address:", result.proposalPDA.toString());
    
    // Fetch and display proposal details
    console.log("\n📊 Proposal Details:");
    const details = await getProposalDetails(program, groupId, result.proposalId);
    console.log("From Token:", details.fromToken.toString());
    console.log("To Token:", details.toToken.toString());
    console.log("Amount:", details.amount);
    console.log("Minimum Out:", details.minimumOut);
    console.log("Status:", Object.keys(details.status)[0]);
    console.log("Created At:", details.createdAt.toLocaleString());
    console.log("Expires At:", details.expiresAt.toLocaleString());
    console.log("Approvals:", details.approvalCount);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
