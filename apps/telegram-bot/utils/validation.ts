import { PublicKey } from "@solana/web3.js";

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function isValidAmount(amount: number): boolean {
  return !isNaN(amount) && amount > 0;
}

export function getNoWalletMessage(isPrivateChat: boolean = false): string {
  if (isPrivateChat) {
    return (
      "⚠️ You don't have a wallet yet!\n\n" +
      "Use /start to create your wallet first."
    );
  }
  return (
    "⚠️ You don't have a wallet yet!\n\n" +
    "👉 Please send /start to me in **private chat** to create your wallet."
  );
}
