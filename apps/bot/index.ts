import { Telegraf, session, Context } from "telegraf";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

interface MySession {
  waitingForWallet?: boolean;
  walletAddress? : string;
}

interface MyContext extends Context {
  session: MySession;
}
const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN!);
bot.use(session());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

bot.start(async (ctx) => {
  await ctx.reply(
    "🤖 Welcome! I can help you connect your Solana wallet.\n\n" +
    "💡 Here are the available commands:\n" +
    "/connectwallet - Link your wallet\n" +
    "/enterAddressManually - Enter your wallet address manually\n" +
    "/balance - Check SOL balance\n" +
    "/help - Show available commands"
  );
});

bot.command("enterAddressManually", async (ctx) => {
  try {
    ctx.session ??= {}; // 

    ctx.session.waitingForWallet = true;
    await ctx.reply("💬 Please enter your Solana wallet public address:");
    console.log("Waiting for wallet input...");
  } catch (err) {
    console.error("Error in /connectwallet:", err);
    await ctx.reply("❌ Something went wrong. Try again later.");
  }
});

bot.on("text", async (ctx) => {
  if (!ctx.session?.waitingForWallet) return;

  const walletAddress = ctx.message.text.trim();
  const telegramId = "sldkafdfdkd;lfkflsad";
  const username = ctx.from.username || "unknown";

  ctx.session.waitingForWallet = false;

  console.log("📬 Received wallet:", walletAddress);
  console.log("Backend URL:", process.env.BACKEND_URL);

  try {
    console.log(process.env.BACKEND_URL!);
    const res = await axios.post(`${process.env.BACKEND_URL}/createuser`, {
      telegramId,
      username,
      walletAddress,
    });
    ctx.session.walletAddress = walletAddress;

    await ctx.reply(
      `✅ Wallet linked successfully!\n\n🔗 Address: ${walletAddress}`
    );

    console.log("✅ Wallet info sent:", res.data);
  } catch (err: any) {
    if (err?.response?.data?.message === "invalid public key format") {
      await ctx.reply("Please enter valid public address");
    } else {
      console.error("❌ Backend error:", err.message);
      await ctx.reply("⚠️ Could not connect to backend. Try again later.");
    }
  }
});

bot.command("balance", async (ctx) => {
  const args = ctx.message.text.split(" ");
  const address = args[1];

  // Check if the user has already connected their wallet
  if (!address && !ctx.session?.walletAddress) {
    return ctx.reply(
      "⚠️ No wallet address provided or connected.\n" +
      "Please connect your wallet first using /connectwallet or provide an address directly: /balance <wallet_address>"
    );
  }

  // Use the connected wallet address if no address is provided
  const walletAddress = address || ctx.session.walletAddress;

  try {
    const balance = await connection.getBalance(new PublicKey(walletAddress ?? ''));
    ctx.reply(`💸 Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  } catch (err) {
    ctx.reply("❌ Invalid wallet address");
  }
});

bot.command("help", (ctx) => {
  ctx.reply(
    "💡 Commands:\n/connectwallet - Link your wallet\n/balance <address> - Check SOL balance"
  );
});

bot.launch();
console.log("🚀 Telegram bot running...");
