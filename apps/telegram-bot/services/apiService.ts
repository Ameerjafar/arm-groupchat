import axios from "axios";
import { config } from "../config/config";

export class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.backendUrl;
  }

  async checkUserWallet(telegramId: string): Promise<{ hasWallet: boolean; walletAddress?: string }> {
    try {
      const response = await axios.post(`${this.baseUrl}/user/checkWallet`, { telegramId });
      return response.data;
    } catch (error) {
      return { hasWallet: false };
    }
  }

  async createUser(data: {
    telegramId: string;
    username: string;
    walletAddress: string;
    encryptedPrivateKey: string;
    groupId: string;
  }) {
    return axios.post(`${this.baseUrl}/user/createuser`, data);
  }

  async addGroupMember(telegramId: string, groupId: string) {
    return axios.post(`${this.baseUrl}/group/addMember`, { telegramId, groupId });
  }

  async removeGroupMember(telegramId: string, groupId: string) {
    return axios.post(`${this.baseUrl}/group/removeMember`, { telegramId, groupId });
  }

  async getUserBalance(telegramId: string) {
    return axios.post(`${this.baseUrl}/user/userBalance`, { telegramId });
  }

  async getPrivateKey(telegramId: string) {
    return axios.post(`${this.baseUrl}/user/getPrivateKey`, { telegramId });
  }

  async withdraw(telegramId: string, amount: number, destination: string) {
    return axios.post(`${this.baseUrl}/user/withdraw`, { telegramId, amount, destination });
  }

  async checkFundExists(groupId: string) {
    return axios.post(`${this.baseUrl}/fund/exists`, { groupId });
  }

  async getFundInfo(groupId: string) {
    return axios.post(`${this.baseUrl}/fund/info`, { groupId });
  }

  async getMemberInfo(groupId: string, telegramId: string) {
    return axios.post(`${this.baseUrl}/fund/memberInfo`, { groupId, telegramId });
  }

  async createGroup(groupId: string, name: string) {
    return axios.post(`${this.baseUrl}/group/creategroup`, { groupId, name });
  }
}
