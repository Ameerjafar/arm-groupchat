import axios, { AxiosInstance } from "axios";
import { config } from "../config/config";
import {
  CreateContributionType,
  GetContributionType,
  GetUserFundContributionType,
  updateMemberType,
} from "../types/contributionServiceType";

export class ContributionApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: config.backendUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
  async createContribution({
    groupId,
    telegramId,
    amountSol,
  }: CreateContributionType) {
    try {
      console.log("Creating contribution...");
      const response = await this.api.post("/contribution", {
        groupId,
        telegramId,
        amountSol,
      });
      console.log("Got the response");
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Create Contribution:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.message || "Failed to create contribution"
      );
    }
  }
  async getContributionsByFund({
    groupId,
    page = 1,
    limit = 20,
  }: GetContributionType) {
    try {
      const response = await this.api.get("/contributions/fund", {
        params: { groupId, page, limit },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get Fund Contributions:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.message || "Failed to fetch fund contributions"
      );
    }
  }
  async getContributionsByUser(telegramId: string) {
    try {
      const response = await this.api.get("/contributions/user", {
        params: { telegramId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get User Contributions:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.message || "Failed to fetch user contributions"
      );
    }
  }
  async getUserFundContribution({
    groupId,
    telegramId,
  }: GetUserFundContributionType) {
    try {
      console.log("Getting user fund contribution...");
      const response = await this.api.get("/contribution/myshares", {
        params: { groupId, telegramId },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Get User Fund Contribution:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.message || "Failed to fetch contribution details"
      );
    }
  }
  async hasUserContributed(
    groupId: string,
    telegramId: string
  ): Promise<boolean> {
    try {
      const response = await this.getUserFundContribution({
        groupId,
        telegramId,
      });
      return response.data && response.data.summary.totalContributions > 0;
    } catch (error) {
      console.error("API Error - Check User Contribution:", error);
      return false;
    }
  }

  /**
   * Get user's shares in a fund
   */
  async getUserShares(groupId: string, telegramId: string) {
    try {
      const response = await this.getUserFundContribution({
        groupId,
        telegramId,
      });
      return {
        totalShares: response.data.summary.totalShares,
        totalAmount: response.data.summary.totalAmountSol,
        totalContributions: response.data.summary.totalContributions,
      };
    } catch (error: any) {
      console.error(
        "API Error - Get User Shares:",
        error.response?.data || error.message
      );
      throw new Error("Failed to fetch user shares");
    }
  }
  async updateMember({
    groupId,
    memberTelegramId,
    newRole,
    authorityTelegramId,
  }: updateMemberType) {
    try {
      const response = await this.api.post("/fund/updateRoleMember", {
        groupId,
        memberTelegramId,
        newRole,
        authorityTelegramId,
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "API Error - Update Member Role:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.message || "Failed to update member role"
      );
    }
  }
}
