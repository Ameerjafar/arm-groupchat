// services/tradeApiService.ts
import axios, { AxiosInstance } from "axios";
import { config } from "../config/config";
import { ExecuteTradeType } from "../types/tradeServiceType";

export class TradeApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: config.backendUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  // ==================== TRADE EXECUTION ====================

  /**
   * Execute trade (admin only)
   */
  async executeTrade(data: ExecuteTradeType) {
    try {
      const response = await this.api.post("/trade/execute", data);
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Execute Trade:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Check if user can execute trades
   */
  async checkTradePermissions(groupId: string, telegramId: string) {
    try {
      const response = await this.api.get("/trade/permissions", {
        params: { groupId, telegramId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Check Permissions:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Get fund trading info
   */
  async getFundTradingInfo(groupId: string) {
    try {
      const response = await this.api.get("/trade/info", {
        params: { groupId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Trading Info:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Get trade history
   */
  async getTradeHistory(groupId: string, limit: number = 10) {
    try {
      const response = await this.api.get("/trade/history", {
        params: { groupId, limit },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Trade History:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Get fund statistics
   */
  async getFundStatistics(groupId: string) {
    try {
      const response = await this.api.get("/trade/statistics", {
        params: { groupId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Statistics:",
        error.response?.data || error.message
      );
      throw error;
    }
  }
}