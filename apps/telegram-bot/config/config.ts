import dotenv from "dotenv";

dotenv.config();
export const config = {
  botToken: process.env.BOT_TOKEN!,
  backendUrl: process.env.BACKEND_URL!,
  webAppUrl: process.env.WEB_APP_URL || "https://nonconjecturable-jadwiga-vitalistically.ngrok-free.dev",
  encryptionKey: Buffer.from(process.env.ENCRYPTION_KEY!, "hex"),
  solana: {
    network: "devnet",
    cluster: "confirmed" as const
  }
};
