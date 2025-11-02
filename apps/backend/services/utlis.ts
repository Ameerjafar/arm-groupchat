import { PublicKey } from "@solana/web3.js";
import crypto from 'crypto';

export const validateSolanaAddress = (addressString: any) => {
  try {
    const publicKey = new PublicKey(addressString);
    const isOnCurve = PublicKey.isOnCurve(publicKey.toBytes());
    return { isValidFormat: true, isOnCurve: isOnCurve, publicKey: publicKey };
  } catch (error: any) {
    console.error("Invalid public key format:", error.message);
    return { isValidFormat: false, isOnCurve: false, publicKey: null };
  }
};

export function decrypt(text: string): string {
  const keyBuffer = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  
  const parts = text.split(":");
  const iv = Buffer.from(parts[0]!, "hex");
  const encryptedText = parts[1];
  
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
  let decrypted = decipher.update(encryptedText!, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted; // Returns base58 string
}
