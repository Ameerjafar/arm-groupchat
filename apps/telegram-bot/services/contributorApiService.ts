// services/contributorApiService.ts
import axios from "axios";
import { config } from "../config/config";
import { CreateContributionType, GetContributionType, updateMemberType } from "../types/contributionServiceType";

export class ContributorApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.backendUrl;
  }

  async createContribution({
    groupId,
    telegramId,
    amountSol
  }: CreateContributionType) {
    try {
      console.log(this.baseUrl);
      const response = await axios.post(`${this.baseUrl}/contribution`, {
        groupId,
        telegramId,
        amountSol
      });
      console.log("got the response");
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || "Failed to create contribution"
      );
    }
  }

  async getContributionsByFund({
    groupId,
    page = 1,
    limit = 20
  }: GetContributionType) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/contributions/fund?groupId=${groupId}`,
        {
          params: { page, limit },
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || "Failed to fetch fund contributions"
      );
    }
  }

  async getContributionsByUser(telegramId: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/contributions/user?telegramId=${telegramId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || "Failed to fetch user contributions"
      );
    }
  }

  // Get user's contributions to a specific fund
  async getUserFundContribution(groupId: string, telegramId: string) {
    console.log("getUserFundContribution");
    try {
      const response = await axios.get(
        `${this.baseUrl}/contribution/myshares?groupId=${groupId}&telegramId=${telegramId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || "Failed to fetch contribution details"
      );
    }
  }

  // Check if user has contributed to a fund
  async hasUserContributed(
    groupId: string,
    telegramId: string
  ): Promise<boolean> {
    try {
      const response = await this.getUserFundContribution(groupId, telegramId);
      return response.data && response.data.summary.totalContributions > 0;
    } catch (error) {
      return false;
    }
  }

  // Get user's total shares in a fund
  async getUserShares(groupId: string, telegramId: string) {
    try {
      const response = await this.getUserFundContribution(groupId, telegramId);
      return {
        totalShares: response.data.summary.totalShares,
        totalAmount: response.data.summary.totalAmountSol,
        totalContributions: response.data.summary.totalContributions,
      };
    } catch (error: any) {
      throw new Error("Failed to fetch user shares");
    }
  }

  // ✅ Updated method with correct parameters matching backend controller
  async updateMember({
    groupId, 
    memberTelegramId, 
    newRole, 
    authorityTelegramId
  }: updateMemberType) {
    try {
      const response = await axios.post(`${this.baseUrl}/fund/updateRoleMember`, {
        groupId,
        memberTelegramId,
        newRole,
        authorityTelegramId
      });
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || "Failed to update member role"
      );
    }
  }
}
