// services/tradeApiService.ts
import axios, { AxiosInstance } from "axios";
import { config } from "../config/config";
import {
  CreateProposalType,
  ApproveProposalType,
  SyncProposalType,
} from "../types/tradeServiceType";

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

  // ==================== TRADER MANAGEMENT ====================

  async addApprovedTrader(data: {
    groupId: string;
    telegramId: string;
    traderWallet: string;
  }) {
    try {
      const response = await this.api.post("/trade/trader/add", data);
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Add Trader:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async removeApprovedTrader(data: {
    groupId: string;
    telegramId: string;
    traderWallet: string;
  }) {
    try {
      const response = await this.api.post("/trade/trader/remove", data);
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Remove Trader:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async getApprovedTraders(groupId: string) {
    try {
      const response = await this.api.get("/trade/traders", {
        params: { groupId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Traders:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  // ==================== PROPOSAL OPERATIONS ====================

  async createProposal(data: CreateProposalType) {
    try {
      const response = await this.api.post("/trade/proposal", data);
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Create Proposal:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async approveProposal(data: ApproveProposalType) {
    try {
      const response = await this.api.post("/trade/proposal/approve", data);
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Approve Proposal:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async getProposals(groupId: string, telegramId: string, status?: string) {
    try {
      const response = await this.api.get("/trade/proposals", {
        params: { groupId, telegramId, status },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Proposals:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async getProposalById(
    groupId: string,
    telegramId: string,
    proposalId: number
  ) {
    try {
      const response = await this.api.get("/trade/proposal", {
        params: { groupId, telegramId, proposalId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Proposal By ID:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async getPendingProposals(groupId: string, telegramId: string) {
    try {
      const response = await this.api.get("/trade/proposals/pending", {
        params: { groupId, telegramId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Pending Proposals:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async syncProposal(data: SyncProposalType) {
    try {
      const response = await this.api.post("/trade/proposal/sync", data);
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Sync Proposal:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async cleanupExpiredProposals(groupId: string, telegramId: string) {
    try {
      const response = await this.api.post("/trade/proposals/cleanup", {
        groupId,
        telegramId,
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Cleanup Expired:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async canProposeTrade(
    groupId: string,
    telegramId: string
  ): Promise<boolean> {
    try {
      const response = await this.api.get("/trade/can-propose", {
        params: { groupId, telegramId },
      });
      return response.data.canPropose || false;
    } catch (error: any) {
      console.error(
        "API Error - Can Propose Trade:",
        error.response?.data || error.message
      );
      return false;
    }
  }

  async canApproveProposal(
    groupId: string,
    telegramId: string,
    proposalId: number
  ) {
    try {
      const response = await this.api.get("/trade/can-approve", {
        params: { groupId, telegramId, proposalId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Can Approve Proposal:",
        error.response?.data || error.message
      );
      return { canApprove: false, reason: "Error checking permissions" };
    }
  }

  async getProposalStatus(
    groupId: string,
    telegramId: string,
    proposalId: number
  ) {
    try {
      const response = await this.api.get("/trade/proposal/status", {
        params: { groupId, telegramId, proposalId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Proposal Status:",
        error.response?.data || error.message
      );
      throw error;
    }
  }
}
