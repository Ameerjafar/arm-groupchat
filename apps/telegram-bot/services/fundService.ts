import { ApiService } from "./apiService";

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
}
