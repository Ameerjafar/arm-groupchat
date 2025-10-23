import { PublicKey,Connection, clusterApiUrl  } from "@solana/web3.js";

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



