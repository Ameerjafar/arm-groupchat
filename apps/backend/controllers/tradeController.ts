// controllers/tradeController.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '@repo/db';
import { ProposalStatus } from '@prisma/client';
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { GroupchatFund } from '../../../contract/groupchat_fund/target/types/groupchat_fund';
import IDL from '../../../contract/groupchat_fund/target/idl/groupchat_fund.json';
import {
  proposeTrade,
  approveProposal,
  getProposalDetails,
  canProposeTrade,
  canApproveProposal,
  getAllProposals,
  getPendingProposals as getPendingProposalsFromChain,
} from '../services/solanaServices/tradeServices';
import { manageTrader } from '../services/solanaServices/fundService';
import { decrypt } from '../services/utlis';

// Solana setup
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

const programId = new PublicKey(
  process.env.PROGRAM_ID || '9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy'
);

function getProgram(wallet: anchor.Wallet): Program<GroupchatFund> {
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  return new anchor.Program<GroupchatFund>(IDL as any, provider);
}

// Helper function to get user keypair from database
async function getUserKeypair(telegramId: string): Promise<Keypair | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: {
        encryptedPrivateKey: true,
        walletAddress: true,
      },
    });

    if (!user || !user.encryptedPrivateKey) {
      console.error('User not found or no encrypted private key');
      return null;
    }

    // Decrypt the private key
    const decryptedPrivateKey = decrypt(user.encryptedPrivateKey);

    // Convert base58 string to Keypair
    const privateKeyBytes = bs58.decode(decryptedPrivateKey);
    const keypair = Keypair.fromSecretKey(privateKeyBytes);

    // Verify the public key matches
    if (keypair.publicKey.toString() !== user.walletAddress) {
      console.error('Decrypted keypair does not match stored wallet address');
      return null;
    }

    return keypair;
  } catch (error) {
    console.error('Error loading user keypair:', error);
    return null;
  }
}

// ==================== TRADER MANAGEMENT ====================

// Add trader to approved list
export const addApprovedTrader = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, telegramId, traderWallet } = req.body;

    if (!groupId || !telegramId || !traderWallet) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: groupId, telegramId, traderWallet',
      });
    }

    // Get fund
    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    // Get user (must be authority)
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user || user.walletAddress !== fund.initiator) {
      return res.status(403).json({
        success: false,
        message: 'Only fund authority can add traders',
      });
    }

    // Add trader on blockchain
    const result = await manageTrader(groupId, telegramId, traderWallet, true);

    return res.json({
      success: true,
      message: 'Trader added successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('Error adding trader:', error);
    
    if (error.message?.includes('TooManyTraders')) {
      return res.status(400).json({
        success: false,
        message: 'Maximum traders reached (10)',
      });
    }
    
    if (error.message?.includes('TraderAlreadyAdded')) {
      return res.status(400).json({
        success: false,
        message: 'Trader already in approved list',
      });
    }
    
    return next(error);
  }
};

// Remove trader from approved list
export const removeApprovedTrader = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, telegramId, traderWallet } = req.body;

    if (!groupId || !telegramId || !traderWallet) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Get fund
    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    // Get user (must be authority)
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user || user.walletAddress !== fund.initiator) {
      return res.status(403).json({
        success: false,
        message: 'Only fund authority can remove traders',
      });
    }

    // Remove trader on blockchain
    const result = await manageTrader(groupId, telegramId, traderWallet, false);

    return res.json({
      success: true,
      message: 'Trader removed successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('Error removing trader:', error);
    return next(error);
  }
};

// Get list of approved traders
export const getApprovedTraders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'groupId is required',
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    // Fetch fund from blockchain to get approved traders
    const userKeypair = await getUserKeypair(fund.initiator || '');
    if (!userKeypair) {
      return res.status(400).json({
        success: false,
        message: 'Failed to load fund authority keypair',
      });
    }

    const wallet = new anchor.Wallet(userKeypair);
    const program = getProgram(wallet);

    const [fundPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('fund'), Buffer.from(groupId as string)],
      program.programId
    );

    const fundAccount = await program.account.fund.fetch(fundPDA);

    return res.json({
      success: true,
      message: 'Approved traders retrieved successfully',
      data: {
        approvedTraders: fundAccount.approvedTraders.map(t => t.toString()),
        requiredApprovals: fundAccount.requiredApprovals,
        totalTraders: fundAccount.approvedTraders.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching approved traders:', error);
    return next(error);
  }
};

// ==================== PROPOSAL OPERATIONS ====================

// Create a new trade proposal
export const createProposal = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const {
      groupId,
      telegramId,
      fromToken,
      toToken,
      amount,
      minimumOut,
    } = req.body;

    console.log('Creating trade proposal...');

    // Validate inputs
    if (!groupId || !telegramId || !fromToken || !toToken || !amount || !minimumOut) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Get fund from database
    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found for this group',
      });
    }

    if (fund.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Fund is not active',
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user || !user.walletAddress) {
      return res.status(404).json({
        success: false,
        message: 'User not found or wallet not connected',
      });
    }

    // Get user keypair
    const proposerKeypair = await getUserKeypair(telegramId);
    if (!proposerKeypair) {
      return res.status(400).json({
        success: false,
        message: 'Failed to load user keypair',
      });
    }

    // Check permissions on-chain
    const wallet = new anchor.Wallet(proposerKeypair);
    const program = getProgram(wallet);

    const canPropose = await canProposeTrade(
      program,
      groupId,
      proposerKeypair.publicKey
    );

    if (!canPropose) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to create trade proposals. Ensure you are a Trader/Manager and approved.',
      });
    }

    // ===== BLOCKCHAIN FIRST: Create proposal on-chain =====
    const blockchainResult = await proposeTrade(
      program,
      proposerKeypair,
      groupId,
      new PublicKey(fromToken),
      new PublicKey(toToken),
      Number(amount),
      Number(minimumOut)
    );

    if (!blockchainResult?.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create proposal on blockchain',
      });
    }

    // Fetch on-chain proposal details to get accurate data
    const onChainDetails = await getProposalDetails(
      program,
      groupId,
      blockchainResult.proposalId
    );

    if (!onChainDetails) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch proposal details from blockchain',
      });
    }

    // ===== DATABASE: Save blockchain data to database =====
    const proposal = await prisma.tradeProposal.create({
      data: {
        fundId: fund.id,
        proposalId: blockchainResult.proposalId,
        proposalPdaAddress: blockchainResult.proposalPDA.toString(),
        proposerTelegramId: telegramId,
        proposerWallet: proposerKeypair.publicKey.toString(),
        fromToken,
        toToken,
        amount: BigInt(amount),
        minimumOut: BigInt(minimumOut),
        status: ProposalStatus.PENDING,
        approvalCount: onChainDetails.approvalCount,
        requiredApprovals: onChainDetails.approvalCount,
        expiresAt: onChainDetails.expiresAt,
        transactionSignature: blockchainResult.transactionSignature,
      },
    });

    // Log transaction
    await prisma.transaction.create({
      data: {
        fundId: fund.id,
        type: 'PROPOSAL',
        amount: BigInt(amount),
        signature: blockchainResult.transactionSignature,
        fromAddress: proposerKeypair.publicKey.toString(),
        initiator: telegramId,
        status: 'CONFIRMED',
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Trade proposal created successfully',
      data: {
        id: proposal.id,
        proposalId: proposal.proposalId,
        proposalPdaAddress: proposal.proposalPdaAddress,
        fromToken: proposal.fromToken,
        toToken: proposal.toToken,
        amount: proposal.amount.toString(),
        minimumOut: proposal.minimumOut.toString(),
        status: proposal.status,
        approvalCount: proposal.approvalCount,
        requiredApprovals: proposal.requiredApprovals,
        expiresAt: proposal.expiresAt,
        transactionSignature: proposal.transactionSignature,
        explorerUrl: `https://explorer.solana.com/tx/${proposal.transactionSignature}?cluster=devnet`,
        createdAt: proposal.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Error creating proposal:', error);
    
    if (error.message?.includes('InsufficientFunds')) {
      return res.status(400).json({
        success: false,
        message: 'Fund does not have enough balance for this trade',
      });
    }
    
    if (error.message?.includes('UnauthorizedTrader')) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to create trade proposals',
      });
    }

    if (error.message?.includes('NotApprovedTrader')) {
      return res.status(403).json({
        success: false,
        message: 'You are not in the approved traders list',
      });
    }
    
    return next(error);
  }
};

// Approve a trade proposal
export const approveTradeProposal = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, proposalId, telegramId } = req.body;

    // Validate inputs
    if (!groupId || proposalId === undefined || !telegramId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Get fund from database
    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    // Get proposal from database
    const proposal = await prisma.tradeProposal.findFirst({
      where: {
        fundId: fund.id,
        proposalId: parseInt(proposalId),
      },
      include: {
        approvals: true,
      },
    });

    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: 'Proposal not found',
      });
    }

    if (proposal.status !== ProposalStatus.PENDING) {
      return res.status(400).json({
        success: false,
        message: `Proposal is ${proposal.status}, cannot approve`,
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user || !user.walletAddress) {
      return res.status(404).json({
        success: false,
        message: 'User not found or wallet not connected',
      });
    }

    // Check if already approved in DB
    const existingApproval = proposal.approvals.find(
      (a) => a.approverWallet === user.walletAddress
    );

    if (existingApproval) {
      return res.status(400).json({
        success: false,
        message: 'You have already approved this proposal',
      });
    }

    // Check if expired
    if (new Date() > proposal.expiresAt) {
      await prisma.tradeProposal.update({
        where: { id: proposal.id },
        data: { status: ProposalStatus.EXPIRED },
      });
      
      return res.status(400).json({
        success: false,
        message: 'Proposal has expired',
      });
    }

    // Get approver keypair
    const approverKeypair = await getUserKeypair(telegramId);
    if (!approverKeypair) {
      return res.status(400).json({
        success: false,
        message: 'Failed to load user keypair',
      });
    }

    // Check permissions on-chain
    const wallet = new anchor.Wallet(approverKeypair);
    const program = getProgram(wallet);

    const { canApprove, reason } = await canApproveProposal(
      program,
      groupId,
      approverKeypair.publicKey,
      parseInt(proposalId)
    );

    if (!canApprove) {
      return res.status(403).json({
        success: false,
        message: `Cannot approve: ${reason}`,
      });
    }

    // ===== BLOCKCHAIN FIRST: Approve on-chain =====
    const blockchainResult = await approveProposal(
      program,
      approverKeypair,
      groupId,
      parseInt(proposalId)
    );

    if (!blockchainResult?.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to approve proposal on blockchain',
      });
    }

    // ===== DATABASE: Save approval to database =====
    const approval = await prisma.proposalApproval.create({
      data: {
        proposalId: proposal.id,
        approverTelegramId: telegramId,
        approverWallet: approverKeypair.publicKey.toString(),
        transactionSignature: blockchainResult.transactionSignature,
      },
    });

    // Update proposal status
    const statusKey = Object.keys(blockchainResult.status)[0];
    const newStatus =
      statusKey === 'approved'
        ? ProposalStatus.APPROVED
        : ProposalStatus.PENDING;

    const updatedProposal = await prisma.tradeProposal.update({
      where: { id: proposal.id },
      data: {
        approvalCount: blockchainResult.approvalCount,
        status: newStatus,
      },
      include: {
        approvals: true,
      },
    });

    return res.json({
      success: true,
      message: newStatus === ProposalStatus.APPROVED 
        ? 'Proposal approved! Ready to execute.' 
        : 'Approval recorded successfully',
      data: {
        proposalId: updatedProposal.proposalId,
        status: updatedProposal.status,
        approvalCount: updatedProposal.approvalCount,
        requiredApprovals: updatedProposal.requiredApprovals,
        transactionSignature: blockchainResult.transactionSignature,
        explorerUrl: `https://explorer.solana.com/tx/${blockchainResult.transactionSignature}?cluster=devnet`,
        approval: {
          id: approval.id,
          approverTelegramId: approval.approverTelegramId,
          approverWallet: approval.approverWallet,
          approvedAt: approval.approvedAt,
        },
      },
    });
  } catch (error: any) {
    console.error('Error approving proposal:', error);
    
    if (error.message?.includes('CannotApproveSelf')) {
      return res.status(400).json({
        success: false,
        message: 'You cannot approve your own proposal',
      });
    }
    
    if (error.message?.includes('NotApprovedTrader')) {
      return res.status(403).json({
        success: false,
        message: 'You are not an approved trader',
      });
    }

    if (error.message?.includes('AlreadyApproved')) {
      return res.status(400).json({
        success: false,
        message: 'You have already approved this proposal',
      });
    }

    if (error.message?.includes('ProposalExpired')) {
      return res.status(400).json({
        success: false,
        message: 'Proposal has expired',
      });
    }
    
    return next(error);
  }
};

// Get all proposals for a group (from blockchain)
export const getProposals = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, status, telegramId } = req.query;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'groupId is required',
      });
    }

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: 'telegramId is required',
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    // Get user keypair to query blockchain
    const userKeypair = await getUserKeypair(telegramId as string);
    if (!userKeypair) {
      return res.status(400).json({
        success: false,
        message: 'Failed to load user keypair',
      });
    }

    const wallet = new anchor.Wallet(userKeypair);
    const program = getProgram(wallet);

    // ===== BLOCKCHAIN FIRST: Fetch from blockchain =====
    const onChainProposals = await getAllProposals(program, groupId as string);

    // Filter by status if provided
    let filteredProposals = onChainProposals;
    if (status) {
      filteredProposals = onChainProposals.filter(
        (p) => Object.keys(p.status)[0]!.toLowerCase() === (status as string).toLowerCase()
      );
    }

    return res.json({
      success: true,
      message: 'Proposals retrieved successfully',
      data: filteredProposals.map((p) => ({
        proposalId: p.proposalId,
        proposer: p.proposer.toString(),
        fromToken: p.fromToken.toString(),
        toToken: p.toToken.toString(),
        amount: p.amount.toString(),
        minimumOut: p.minimumOut.toString(),
        status: Object.keys(p.status)[0],
        approvalCount: p.approvalCount,
        approvals: p.approvals.map(a => a.toString()),
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
        isExpired: p.isExpired,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching proposals:', error);
    return next(error);
  }
};

// Get proposal by ID (from blockchain)
export const getProposalById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, proposalId, telegramId } = req.query;

    if (!groupId || !proposalId || !telegramId) {
      return res.status(400).json({
        success: false,
        message: 'groupId, proposalId, and telegramId are required',
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    // Get user keypair
    const userKeypair = await getUserKeypair(telegramId as string);
    if (!userKeypair) {
      return res.status(400).json({
        success: false,
        message: 'Failed to load user keypair',
      });
    }

    const wallet = new anchor.Wallet(userKeypair);
    const program = getProgram(wallet);

    // ===== BLOCKCHAIN: Fetch from blockchain =====
    const onChainProposal = await getProposalDetails(
      program,
      groupId as string,
      parseInt(proposalId as string)
    );

    if (!onChainProposal) {
      return res.status(404).json({
        success: false,
        message: 'Proposal not found on blockchain',
      });
    }

    return res.json({
      success: true,
      message: 'Proposal retrieved successfully',
      data: {
        proposalId: onChainProposal.proposalId,
        proposer: onChainProposal.proposer.toString(),
        fromToken: onChainProposal.fromToken.toString(),
        toToken: onChainProposal.toToken.toString(),
        amount: onChainProposal.amount.toString(),
        minimumOut: onChainProposal.minimumOut.toString(),
        status: Object.keys(onChainProposal.status)[0],
        approvalCount: onChainProposal.approvalCount,
        approvals: onChainProposal.approvals.map(a => a.toString()),
        createdAt: onChainProposal.createdAt,
        expiresAt: onChainProposal.expiresAt,
        isExpired: onChainProposal.isExpired,
      },
    });
  } catch (error: any) {
    console.error('Error fetching proposal:', error);
    return next(error);
  }
};

// Get pending proposals (from blockchain)
export const getPendingProposals = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, telegramId } = req.query;

    if (!groupId || !telegramId) {
      return res.status(400).json({
        success: false,
        message: 'groupId and telegramId are required',
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId: groupId as string },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    // Get user keypair
    const userKeypair = await getUserKeypair(telegramId as string);
    if (!userKeypair) {
      return res.status(400).json({
        success: false,
        message: 'Failed to load user keypair',
      });
    }

    const wallet = new anchor.Wallet(userKeypair);
    const program = getProgram(wallet);

    // ===== BLOCKCHAIN: Fetch pending proposals =====
    const pendingProposals = await getPendingProposalsFromChain(program, groupId as string);

    return res.json({
      success: true,
      message: 'Pending proposals retrieved successfully',
      data: pendingProposals.map((p) => ({
        proposalId: p.proposalId,
        proposer: p.proposer.toString(),
        fromToken: p.fromToken.toString(),
        toToken: p.toToken.toString(),
        amount: p.amount.toString(),
        minimumOut: p.minimumOut.toString(),
        approvalCount: p.approvalCount,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching pending proposals:', error);
    return next(error);
  }
};

// Sync proposal with on-chain data
export const syncProposal = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId, proposalId, telegramId } = req.body;

    if (!groupId || proposalId === undefined || !telegramId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    const proposal = await prisma.tradeProposal.findFirst({
      where: {
        fundId: fund.id,
        proposalId: parseInt(proposalId),
      },
    });

    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: 'Proposal not found in database',
      });
    }

    // Fetch on-chain data
    const userKeypair = await getUserKeypair(telegramId);
    if (!userKeypair) {
      return res.status(400).json({
        success: false,
        message: 'Failed to load user keypair',
      });
    }

    const wallet = new anchor.Wallet(userKeypair);
    const program = getProgram(wallet);

    const onChainDetails = await getProposalDetails(
      program,
      groupId,
      parseInt(proposalId)
    );

    if (!onChainDetails) {
      return res.status(404).json({
        success: false,
        message: 'Proposal not found on-chain',
      });
    }

    // Map on-chain status to DB status
    const statusKey = Object.keys(onChainDetails.status)[0];
    let dbStatus: ProposalStatus;

    switch (statusKey) {
      case 'pending':
        dbStatus = ProposalStatus.PENDING;
        break;
      case 'approved':
        dbStatus = ProposalStatus.APPROVED;
        break;
      case 'rejected':
        dbStatus = ProposalStatus.REJECTED;
        break;
      case 'executed':
        dbStatus = ProposalStatus.EXECUTED;
        break;
      case 'expired':
        dbStatus = ProposalStatus.EXPIRED;
        break;
      default:
        dbStatus = ProposalStatus.PENDING;
    }

    // Update database with blockchain data
    const updatedProposal = await prisma.tradeProposal.update({
      where: { id: proposal.id },
      data: {
        status: dbStatus,
        approvalCount: onChainDetails.approvalCount,
      },
    });

    return res.json({
      success: true,
      message: 'Proposal synced successfully with blockchain',
      data: {
        proposalId: updatedProposal.proposalId,
        status: updatedProposal.status,
        approvalCount: updatedProposal.approvalCount,
        onChainStatus: statusKey,
      },
    });
  } catch (error: any) {
    console.error('Error syncing proposal:', error);
    return next(error);
  }
};

// Cleanup expired proposals
export const cleanupExpiredProposals = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'groupId is required',
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { groupId },
    });

    if (!fund) {
      return res.status(404).json({
        success: false,
        message: 'Fund not found',
      });
    }

    const now = new Date();

    const result = await prisma.tradeProposal.updateMany({
      where: {
        fundId: fund.id,
        status: ProposalStatus.PENDING,
        expiresAt: {
          lt: now,
        },
      },
      data: {
        status: ProposalStatus.EXPIRED,
      },
    });

    return res.json({
      success: true,
      message: `${result.count} expired proposals updated`,
      data: {
        count: result.count,
      },
    });
  } catch (error: any) {
    console.error('Error cleaning up expired proposals:', error);
    return next(error);
  }
};
