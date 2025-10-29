// routes/distributionRoutes.ts
import express from "express";
import { distributionController } from "../controllers/distributionController";

const distributionRoute = express.Router();

// ==================== CALCULATION ENDPOINTS ====================

/**
 * Calculate distribution amount for a member (full cash-out)
 * GET /api/distribution/calculate/:groupId/:walletAddress
 * 
 * Returns: Full cash-out information including profit/loss, fees, etc.
 */
distributionRoute.get(
  "/calculate/:groupId/:walletAddress",
  distributionController.calculateDistribution
);

/**
 * Calculate profit-only distribution for a member
 * GET /api/distribution/profit/:groupId/:walletAddress
 * 
 * Returns: Profit information (only works if member has profit)
 */
distributionRoute.get(
  "/profit/:groupId/:walletAddress",
  distributionController.calculateProfit
);

/**
 * Get member's current position (both cash-out and profit-only info)
 * GET /api/distribution/position/:groupId/:telegramId
 * 
 * Returns: Complete position info with both distribution options
 */
distributionRoute.get(
  "/position/:groupId/:telegramId",
  distributionController.getMemberPosition
);

// ==================== DISTRIBUTION EXECUTION ENDPOINTS ====================

/**
 * Cash out member (full distribution with share burning)
 * POST /api/distribution/cashout
 * 
 * Body: { groupId: string, telegramId: string }
 * Returns: Transaction signature and distribution details
 */
distributionRoute.post(
  "/cashout",
  distributionController.cashOut
);

/**
 * Claim profit only (keeps shares intact)
 * POST /api/distribution/claim-profit
 * 
 * Body: { groupId: string, telegramId: string }
 * Returns: Transaction signature and profit details
 */
distributionRoute.post(
  "/claim-profit",
  distributionController.claimProfit
);

/**
 * Cash out all members in a fund (authority only)
 * POST /api/distribution/cashout-all
 * 
 * Body: { groupId: string, authorityTelegramId: string }
 * Returns: Array of results for each member
 */
distributionRoute.post(
  "/cashout-all",
  distributionController.cashOutAll
);

// ==================== INFORMATION ENDPOINTS ====================

/**
 * Get all members' distribution info for a fund
 * GET /api/distribution/all/:groupId
 * 
 * Returns: Array of all members with their distribution info
 */
distributionRoute.get(
  "/all/:groupId",
  distributionController.getAllMembersInfo
);

/**
 * Get distribution history for a user
 * GET /api/distribution/history/:telegramId?groupId=optional
 * 
 * Query Params: groupId (optional) - filter by specific fund
 * Returns: Array of past distributions
 */
distributionRoute.get(
  "/history/:telegramId",
  distributionController.getDistributionHistory
);

/**
 * Get fund distribution statistics
 * GET /api/distribution/stats/:groupId
 * 
 * Returns: Aggregate statistics for all distributions in fund
 */
distributionRoute.get(
  "/stats/:groupId",
  distributionController.getFundStats
)

export default distributionRoute;
