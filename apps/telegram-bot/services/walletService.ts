import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { encrypt, decrypt } from "../utils/encryption";
import { ApiService } from "./apiService";

export class WalletService {
  private apiService: ApiService;

  constructor() {
    this.apiService = new ApiService();
  }

  generateWallet() {
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    const privateKey = bs58.encode(keypair.secretKey);
    const encryptedPrivateKey = encrypt(privateKey);

    return { publicKey, encryptedPrivateKey };
  }

  async checkWallet(telegramId: string) {
    return this.apiService.checkUserWallet(telegramId);
  }

  async getBalance(telegramId: string) {
    const response = await this.apiService.getUserBalance(telegramId);
    return (response.data.userBalance / 1e9).toFixed(4);
  }

  async exportPrivateKey(telegramId: string): Promise<string> {
    const response = await this.apiService.getPrivateKey(telegramId);
    
    if (!response.data.encryptedPrivateKey) {
      throw new Error("Private key not found");
    }

    return decrypt(response.data.encryptedPrivateKey);
  }

  async withdraw(telegramId: string, amount: number, destination: string) {
    return this.apiService.withdraw(telegramId, amount, destination);
  }
}
