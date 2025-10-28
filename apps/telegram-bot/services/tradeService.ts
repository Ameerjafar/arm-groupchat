// services/tradeService.ts
import { TradeApiService } from "./tradeApiService";
import {
  CreateProposalType,
  ApproveProposalType,
  GetProposalByIdType,
  SyncProposalType,
} from "../types/tradeServiceType";

export class TradeService {
  private apiService: TradeApiService;

  constructor() {
    this.apiService = new TradeApiService();
  }

  // ==================== TRADER MANAGEMENT ====================

  async addApprovedTrader(data: {
    groupId: string;
    telegramId: string;
    traderWallet: string;
  }) {
    console.log("Adding approved trader...");
    const response = await this.apiService.addApprovedTrader(data);
    return response;
  }

  async removeApprovedTrader(data: {
    groupId: string;
    telegramId: string;
    traderWallet: string;
  }) {
    console.log("Removing approved trader...");
    const response = await this.apiService.removeApprovedTrader(data);
    return response;
  }

  async getApprovedTraders(groupId: string) {
    const response = await this.apiService.getApprovedTraders(groupId);
    return response;
  }

  // ==================== PROPOSAL OPERATIONS ====================

  async createProposal({
    groupId,
    telegramId,
    fromToken,
    toToken,
    amount,
    minimumOut,
  }: CreateProposalType) {
    console.log("Creating trade proposal...");
    const response = await this.apiService.createProposal({
      groupId,
      telegramId,
      fromToken,
      toToken,
      amount,
      minimumOut,
    });
    return response;
  }

  async approveProposal({
    groupId,
    telegramId,
    proposalId,
  }: ApproveProposalType) {
    console.log(`Approving proposal ${proposalId}...`);
    const response = await this.apiService.approveProposal({
      groupId,
      telegramId,
      proposalId,
    });
    return response;
  }

  async getProposals(groupId: string, telegramId: string, status?: string) {
    const response = await this.apiService.getProposals(
      groupId,
      telegramId,
      status
    );
    return response;
  }

  async getProposalById({
    groupId,
    telegramId,
    proposalId,
  }: GetProposalByIdType) {
    const response = await this.apiService.getProposalById(
      groupId,
      telegramId,
      proposalId
    );
    return response;
  }

  async getPendingProposals(groupId: string, telegramId: string) {
    const response = await this.apiService.getPendingProposals(
      groupId,
      telegramId
    );
    return response;
  }

  async syncProposal({ groupId, telegramId, proposalId }: SyncProposalType) {
    console.log(`Syncing proposal ${proposalId} with blockchain...`);
    const response = await this.apiService.syncProposal({
      groupId,
      telegramId,
      proposalId,
    });
    return response;
  }

  async cleanupExpiredProposals(groupId: string, telegramId: string) {
    console.log("Cleaning up expired proposals...");
    const response = await this.apiService.cleanupExpiredProposals(
      groupId,
      telegramId
    );
    return response;
  }

  async canProposeTrade(groupId: string, telegramId: string): Promise<boolean> {
    const canPropose = await this.apiService.canProposeTrade(
      groupId,
      telegramId
    );
    return canPropose;
  }

  async canApproveProposal(
    groupId: string,
    telegramId: string,
    proposalId: number
  ) {
    const canApprove = await this.apiService.canApproveProposal(
      groupId,
      telegramId,
      proposalId
    );
    return canApprove;
  }

  async getProposalStatus(
    groupId: string,
    telegramId: string,
    proposalId: number
  ) {
    const status = await this.apiService.getProposalStatus(
      groupId,
      telegramId,
      proposalId
    );
    return status;
  }
}
