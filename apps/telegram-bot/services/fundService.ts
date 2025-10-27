import { ApiService } from "./apiService";
import { closeFundObject, CreateFundType, UpdateObjectType } from "../types/fundServiceType";
export class FundService {
  private apiService: ApiService;

  constructor() {
    this.apiService = new ApiService();
  }

  async checkFundExists(groupId: string) {
    const response = await this.apiService.checkFundExists(groupId);
    return response.data.exists;
  }

  async getFundInfo(groupId: string) {
    const response = await this.apiService.getFundInfo(groupId);
    return response.data;
  }

  async getMemberInfo(groupId: string, telegramId: string) {
    const response = await this.apiService.getMemberInfo(groupId, telegramId);
    return response.data;
  }
  async createFund({groupId, telegramId, fundName, minContribution, tradingFeeBps}: CreateFundType) {
    const response = await this.apiService.createFund(groupId, telegramId, fundName, minContribution, tradingFeeBps);
    return response.data;
  }
  async closeFund({groupId, telegramId}: closeFundObject) {
    const response = await this.apiService.closeFund(groupId, telegramId);
    return response.data;
  }
  async updateFundStatus({groupId, telegramId, status}: UpdateObjectType) {
    const response = await this.apiService.updateFundStatus(groupId, telegramId, status);
    return response.data;
  }
}
