// routes/tradeRoutes.ts
import express from 'express';
import {
  createProposal,
  approveTradeProposal,
  getProposals,
  getProposalById,
  getPendingProposals,
  syncProposal,
  cleanupExpiredProposals,
} from '../controllers/tradeController';

const tradeRoute = express.Router();


// ==================== PROPOSAL ROUTES ====================

// Create a new trade proposal
tradeRoute.post('/proposal', createProposal);

// Approve a trade proposal
tradeRoute.post('/proposal/approve', approveTradeProposal);

// Get all proposals for a group
tradeRoute.get('/proposals', getProposals);

// Get proposal by ID
tradeRoute.get('/proposal', getProposalById);

// Get pending proposals
tradeRoute.get('/proposals/pending', getPendingProposals);

// Sync proposal with on-chain data
tradeRoute.post('/proposal/sync', syncProposal);

// Cleanup expired proposals
tradeRoute.post('/proposals/cleanup', cleanupExpiredProposals);

export default tradeRoute;
