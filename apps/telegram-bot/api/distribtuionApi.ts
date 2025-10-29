// services/distributionApiService.ts
import axios, { AxiosInstance } from "axios";
import { config } from "../config/config";

export class DistributionApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: config.backendUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  // ==================== DISTRIBUTION CALCULATIONS ====================

  /**
   * Calculate distribution amount for a member (full cash-out)
   */
  async calculateDistribution(groupId: string, walletAddress: string) {
    try {
      const response = await this.api.get(
        `/distribution/calculate/${groupId}/${walletAddress}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Calculate Distribution:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Calculate profit-only distribution for a member
   */
  async calculateProfit(groupId: string, walletAddress: string) {
    try {
      const response = await this.api.get(
        `/distribution/profit/${groupId}/${walletAddress}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Calculate Profit:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  // ==================== DISTRIBUTION EXECUTION ====================

  /**
   * Cash out member (full distribution with share burning)
   */
  async cashOut(groupId: string, telegramId: string) {
    try {
      const response = await this.api.post("/distribution/cashout", {
        groupId,
        telegramId,
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Cash Out:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Claim profit only (keeps shares intact)
   */
  async claimProfit(groupId: string, telegramId: string) {
    try {
      const response = await this.api.post("/distribution/claim-profit", {
        groupId,
        telegramId,
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Claim Profit:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Cash out all members in a fund (authority only)
   */
  async cashOutAll(groupId: string, authorityTelegramId: string) {
    try {
      const response = await this.api.post("/distribution/cashout-all", {
        groupId,
        authorityTelegramId,
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Cash Out All:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  // ==================== DISTRIBUTION INFO ====================

  /**
   * Get all members' distribution info
   */
  async getAllMembersInfo(groupId: string) {
    try {
      const response = await this.api.get(`/distribution/all/${groupId}`);
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get All Members Info:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Get distribution history for a user
   */
  async getDistributionHistory(telegramId: string, groupId?: string) {
    try {
      const params = groupId ? { groupId } : {};
      const response = await this.api.get(
        `/distribution/history/${telegramId}`,
        { params }
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Distribution History:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Get fund distribution statistics
   */
  async getFundStats(groupId: string) {
    try {
      const response = await this.api.get(`/distribution/stats/${groupId}`);
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Fund Stats:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Get member's current position (both cash-out and profit-only info)
   */
  async getMemberPosition(groupId: string, telegramId: string) {
    try {
      const response = await this.api.get(
        `/distribution/position/${groupId}/${telegramId}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Member Position:",
        error.response?.data || error.message
      );
      throw error;
    }
  }
}
