import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { GroupchatFund } from "../../../../contract/groupchat_fund/target/types/groupchat_fund";

// PDA Helper Functions
export function getFundPDA(groupId: string, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fund"), Buffer.from(groupId)],
    programId
  );
}

export function getMemberPDA(
  fundKey: PublicKey,
  memberWallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), fundKey.toBuffer(), memberWallet.toBuffer()],
    programId
  );
}

export function getProposalPDA(
  fundKey: PublicKey,
  proposalId: number,
  programId: PublicKey
): [PublicKey, number] {
  const proposalIdBuffer = Buffer.alloc(8);
  proposalIdBuffer.writeBigUInt64LE(BigInt(proposalId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), fundKey.toBuffer(), proposalIdBuffer],
    programId
  );
}

// Propose Trade
export async function proposeTrade(
  program: Program<GroupchatFund>,
  proposer: Keypair,
  groupId: string,
  fromToken: PublicKey,
  toToken: PublicKey,
  amount: number,
  minimumOut: number
) {
  try {
    // Derive PDAs
    const [fundPDA] = getFundPDA(groupId, program.programId);

    // Fetch fund account to get next_proposal_id
    const fundAccount = await program.account.fund.fetch(fundPDA);
    const proposalId = fundAccount.nextProposalId.toNumber();

    const [proposalPDA] = getProposalPDA(fundPDA, proposalId, program.programId);

    // Execute instruction using accountsPartial
    const tx = await program.methods
      .proposeTrade(
        fromToken,
        toToken,
        new BN(amount),
        new BN(minimumOut)
      )
      .accountsPartial({
        fund: fundPDA,
        proposal: proposalPDA,
        proposer: proposer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([proposer])
      .rpc();

    console.log("Trade proposal created:", tx);
    console.log("Proposal ID:", proposalId);
    
    return { 
      success: true,
      transactionSignature: tx, 
      proposalId,
      proposalPDA 
    };
  } catch (error) {
    console.error("Error proposing trade:", error);
    throw error;
  }
}

// Approve Proposal
export async function approveProposal(
  program: Program<GroupchatFund>,
  approver: Keypair,
  groupId: string,
  proposalId: number
) {
  try {
    // Derive PDAs
    const [fundPDA] = getFundPDA(groupId, program.programId);
    const [proposalPDA] = getProposalPDA(fundPDA, proposalId, program.programId);

    // Execute instruction using accountsPartial
    const tx = await program.methods
      .approveProposal()
      .accountsPartial({
        fund: fundPDA,
        proposal: proposalPDA,
        approver: approver.publicKey,
      })
      .signers([approver])
      .rpc();

    console.log("Proposal approved:", tx);
    
    // Fetch updated proposal to check status
    const proposalAccount = await program.account.tradeProposal.fetch(proposalPDA);
    
    return { 
      success: true,
      transactionSignature: tx,
      approvalCount: proposalAccount.approvals.length,
      status: proposalAccount.status
    };
  } catch (error) {
    console.error("Error approving proposal:", error);
    throw error;
  }
}

// Helper: Get Proposal Details
export async function getProposalDetails(
  program: Program<GroupchatFund>,
  groupId: string,
  proposalId: number
) {
  try {
    const [fundPDA] = getFundPDA(groupId, program.programId);
    const [proposalPDA] = getProposalPDA(fundPDA, proposalId, program.programId);
    
    const proposal = await program.account.tradeProposal.fetch(proposalPDA);
    
    return {
      proposalId: proposal.proposalId.toNumber(),
      proposer: proposal.proposer,
      fromToken: proposal.fromToken,
      toToken: proposal.toToken,
      amount: proposal.amount.toNumber(),
      minimumOut: proposal.minimumOut.toNumber(),
      approvals: proposal.approvals,
      approvalCount: proposal.approvals.length,
      status: proposal.status,
      createdAt: new Date(proposal.createdAt.toNumber() * 1000),
      expiresAt: new Date(proposal.expiresAt.toNumber() * 1000),
      isExpired: Date.now() / 1000 > proposal.expiresAt.toNumber()
    };
  } catch (error) {
    console.error("Error fetching proposal details:", error);
    throw error;
  }
}

// Helper: Check if member can propose trades
export async function canProposeTrade(
  program: Program<GroupchatFund>,
  groupId: string,
  memberWallet: PublicKey
): Promise<boolean> {
  try {
    const [fundPDA] = getFundPDA(groupId, program.programId);
    const [memberPDA] = getMemberPDA(fundPDA, memberWallet, program.programId);

    const fundAccount = await program.account.fund.fetch(fundPDA);
    const memberAccount = await program.account.member.fetch(memberPDA);

    // Check if member is Trader or Manager
    const isTraderOrManager = 
      Object.keys(memberAccount.role)[0] === "trader" || 
      Object.keys(memberAccount.role)[0] === "manager";

    // Check if member is in approved traders list
    const isApprovedTrader = fundAccount.approvedTraders.some(
      (trader) => trader.equals(memberWallet)
    );

    return isTraderOrManager && isApprovedTrader && memberAccount.isActive && fundAccount.isActive;
  } catch (error) {
    console.error("Error checking trade permissions:", error);
    return false;
  }
}

// Helper: Check if member can approve proposal
export async function canApproveProposal(
  program: Program<GroupchatFund>,
  groupId: string,
  memberWallet: PublicKey,
  proposalId: number
): Promise<{ canApprove: boolean; reason?: string }> {
  try {
    const [fundPDA] = getFundPDA(groupId, program.programId);
    const [memberPDA] = getMemberPDA(fundPDA, memberWallet, program.programId);
    const [proposalPDA] = getProposalPDA(fundPDA, proposalId, program.programId);

    const fundAccount = await program.account.fund.fetch(fundPDA);
    const memberAccount = await program.account.member.fetch(memberPDA);
    const proposalAccount = await program.account.tradeProposal.fetch(proposalPDA);

    // Check role
    const isTraderOrManager = 
      Object.keys(memberAccount.role)[0] === "trader" || 
      Object.keys(memberAccount.role)[0] === "manager";
    
    if (!isTraderOrManager) {
      return { canApprove: false, reason: "Member is not a trader or manager" };
    }

    // Check if in approved traders list
    const isApprovedTrader = fundAccount.approvedTraders.some(
      (trader) => trader.equals(memberWallet)
    );
    
    if (!isApprovedTrader) {
      return { canApprove: false, reason: "Not an approved trader" };
    }

    // Check proposal status
    if (Object.keys(proposalAccount.status)[0] !== "pending") {
      return { canApprove: false, reason: "Proposal is not pending" };
    }

    // Check expiration
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime >= proposalAccount.expiresAt.toNumber()) {
      return { canApprove: false, reason: "Proposal has expired" };
    }

    // Check if proposer is trying to approve their own proposal
    if (proposalAccount.proposer.equals(memberWallet)) {
      return { canApprove: false, reason: "Cannot approve your own proposal" };
    }

    // Check if already approved
    const hasAlreadyApproved = proposalAccount.approvals.some(
      (approver) => approver.equals(memberWallet)
    );
    
    if (hasAlreadyApproved) {
      return { canApprove: false, reason: "Already approved this proposal" };
    }

    return { canApprove: true };
  } catch (error) {
    console.error("Error checking approval permissions:", error);
    return { canApprove: false, reason: "Error checking permissions" };
  }
}

// Helper: Get all proposals for a fund
export async function getAllProposals(
  program: Program<GroupchatFund>,
  groupId: string
) {
  try {
    const [fundPDA] = getFundPDA(groupId, program.programId);
    const fundAccount = await program.account.fund.fetch(fundPDA);
    
    const totalProposals = fundAccount.nextProposalId.toNumber();
    const proposals = [];

    for (let i = 0; i < totalProposals; i++) {
      try {
        const proposalDetails = await getProposalDetails(program, groupId, i);
        proposals.push(proposalDetails);
      } catch (error) {
        console.log(`Proposal ${i} not found or closed`);
      }
    }

    return proposals;
  } catch (error) {
    console.error("Error fetching all proposals:", error);
    throw error;
  }
}

// Helper: Get pending proposals requiring approval
export async function getPendingProposals(
  program: Program<GroupchatFund>,
  groupId: string
) {
  try {
    const allProposals = await getAllProposals(program, groupId);
    return allProposals.filter(
      (proposal) => Object.keys(proposal.status)[0] === "pending" && !proposal.isExpired
    );
  } catch (error) {
    console.error("Error fetching pending proposals:", error);
    throw error;
  }
}

// Helper: Get approved proposals ready to execute
export async function getApprovedProposals(
  program: Program<GroupchatFund>,
  groupId: string
) {
  try {
    const allProposals = await getAllProposals(program, groupId);
    return allProposals.filter(
      (proposal) => Object.keys(proposal.status)[0] === "approved"
    );
  } catch (error) {
    console.error("Error fetching approved proposals:", error);
    throw error;
  }
}
