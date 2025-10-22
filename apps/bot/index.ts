import { Telegraf } from "telegraf";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

bot.start((ctx) =>
  ctx.reply("Welcome to DegenFundBot 💰\nType /help to see commands")
);
bot.command("balance", async (ctx) => {
  const args = ctx.message.text.split(" ");
  const address = args[1];
  if (!address) return ctx.reply("⚠️ Usage: /balance <wallet_address>");

  try {
    const balance = await connection.getBalance(new PublicKey(address));
    ctx.reply(`💸 Balance: ${balance / 1e9} SOL`);
  } catch (err) {
    ctx.reply("❌ Invalid wallet address");
  }
});

bot.command("connectWallet", async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  const webAppUrl = `${process.env.FRONTEND_URL}/connectwallet?telegramId=${telegramId}&username=${username}`;

  await ctx.reply("Click below to connect your wallet 👇", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔗 Connect Wallet", web_app: { url: webAppUrl } }],
      ],
    },
  });
});
bot.command("help", (ctx) => {
  ctx.reply(
    "💡 Available commands:\n/balance <wallet_address> - Check SOL balance"
  );
});

bot.launch();
console.log("🚀 Telegram bot running...");
