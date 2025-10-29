// routes/tradeRoutes.ts

import { Router } from 'express';
import {
  executeTradeController,
  checkTradePermissions,
  getFundTradingInfoController,
  getTradeHistoryController,
  getFundStatistics,
} from '../controllers/tradeController';

const router = Router();

// ==================== TRADE EXECUTION ====================
router.post('/execute', executeTradeController);

// ==================== QUERY OPERATIONS ====================
router.get('/permissions', checkTradePermissions);
router.get('/info', getFundTradingInfoController);
router.get('/history', getTradeHistoryController);
router.get('/statistics', getFundStatistics);

export default router;
