// services/contributionService.ts
import { CreateContributionType, GetContributionType, GetUserFundContributionType, updateMemberType } from "../types/contributionServiceType";
import { ContributorApiService } from "./contributorApiService";

export class ContributionService {
  private apiService: ContributorApiService;

  constructor() {
    this.apiService = new ContributorApiService();
  }

  async createContribution({
    groupId,
    telegramId,
    amountSol
  }: CreateContributionType) {
    console.log("it is calling correctly");
    const response = await this.apiService.createContribution({
      groupId,
      telegramId,
      amountSol,
    });
    return response;
  }

  async getContributionsByFund({
    groupId,
    page,
    limit
  }: GetContributionType
  ) {
    const response = await this.apiService.getContributionsByFund({
      groupId,
      page,
      limit
  });
    return response;
  }

  async getContributionsByUser(telegramId: string) {
    const response = await this.apiService.getContributionsByUser(telegramId);
    return response;
  }

  async getUserFundContribution({groupId, telegramId}: GetUserFundContributionType) {
    const response = await this.apiService.getUserFundContribution(
      groupId,
      telegramId
    );
    return response;
  }

  async hasUserContributed(
    groupId: string,
    telegramId: string
  ): Promise<boolean> {
    const hasContributed = await this.apiService.hasUserContributed(
      groupId,
      telegramId
    );
    return hasContributed;
  }

  async getUserShares(groupId: string, telegramId: string) {
    const shares = await this.apiService.getUserShares(groupId, telegramId);
    return shares;
  }

  // ✅ Updated method with correct parameters
  async updateMemberRole({
    groupId, 
    memberTelegramId, 
    newRole, 
    authorityTelegramId
  }: updateMemberType) {
    const updateMember = await this.apiService.updateMember({
      groupId, 
      memberTelegramId, 
      newRole,
      authorityTelegramId
    });
    return updateMember;
  }
}
