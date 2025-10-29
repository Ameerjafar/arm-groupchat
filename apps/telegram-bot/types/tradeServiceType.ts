// types/tradeServiceType.ts

/**
 * Execute trade (admin only)
 */
export type ExecuteTradeType = {
  groupId: string;
  telegramId: string;
  fromToken: string;
  toToken: string;
  amount: string;
  minimumOut: string;
};

/**
 * Check if user can execute trades
 */
export type CheckTradePermissionsType = {
  groupId: string;
  telegramId: string;
};

/**
 * Get trade history
 */
export type GetTradeHistoryType = {
  groupId: string;
  limit?: number;
};

/**
 * Get fund trading info
 */
export type GetFundTradingInfoType = {
  groupId: string;
};

/**
 * Get fund statistics
 */
export type GetFundStatisticsType = {
  groupId: string;
};
