import { Telegraf, session, Context, Markup } from "telegraf";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

interface MySession {
  waitingForWallet?: boolean;
}

interface MyContext extends Context {
  session: MySession;
}

const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN!);
bot.use(session());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Your Mini Web App URL (deploy to Vercel/Netlify)
const WEB_APP_URL = process.env.WEB_APP_URL || "https://yourdapp.vercel.app";

bot.start(async (ctx) => {
  await ctx.reply(
    "🤖 Welcome to the Group Fund Bot!\n\n" +
      "I help you manage collective investments on Solana.\n\n" +
      "Commands:\n" +
      "/connectwallet - Link your Solana wallet\n" +
      "/contribute - Contribute to the group fund\n" +
      "/mybalance - Check your wallet balance\n" +
      "/fundinfo - View fund details\n" +
      "/help - Show all commands"
  );
});

bot.command("connectwallet", async (ctx) => {
  try {
    ctx.session ??= {};
    ctx.session.waitingForWallet = true;
    await ctx.reply(
      "💬 Please enter your Solana wallet public address:\n\n" +
        "⚠️ Only send your PUBLIC KEY (starts with A-Z, a-z, 1-9)\n" +
        "❌ NEVER send your private key or seed phrase!"
    );
  } catch (err) {
    console.error("Error in /connectwallet:", err);
    await ctx.reply("❌ Something went wrong. Try again later.");
  }
});

// ✅ NEW: Contribute command with Mini Web App
bot.command("contribute", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const userId = ctx.from?.id.toString();

  try {
    // Check if user has connected wallet
    const userCheck = await axios.post(
      `${process.env.BACKEND_URL}/user/checkWallet`,
      { telegramId: userId }
    );

    if (!userCheck.data.hasWallet) {
      return ctx.reply(
        "⚠️ You need to connect your wallet first!\n\n" +
          "Use /connectwallet to link your Solana wallet."
      );
    }

    // Check if fund exists for this group
    const fundCheck = await axios.post(
      `${process.env.BACKEND_URL}/fund/checkExists`,
      { groupId: chatId }
    );

    if (!fundCheck.data.exists) {
      return ctx.reply(
        "⚠️ This group doesn't have a fund yet!\n\n" +
          "Ask an admin to initialize the fund with /initfund"
      );
    }

    // Create Web App button with group and user context
    const webAppUrl = `${WEB_APP_URL}/contribute?groupId=${chatId}&userId=${userId}`;

    await ctx.reply(
      "💰 Click the button below to contribute to the group fund:\n\n" +
        "✅ You'll connect your wallet securely\n" +
        "✅ No private keys shared\n" +
        "✅ Sign transaction in your wallet",
      Markup.inlineKeyboard([
        [
          Markup.button.webApp(
            "💰 Contribute Now",
            webAppUrl
          ),
        ],
      ])
    );
  } catch (error: any) {
    console.error("Error in /contribute:", error.message);
    await ctx.reply("❌ Could not process your request. Try again later.");
  }
});

// ✅ NEW: Initialize fund command (admin only)
bot.command("initfund", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const userId = ctx.from?.id;

  try {
    // Check if user is admin
    const member = await ctx.getChatMember(userId!);
    if (member.status !== "creator" && member.status !== "administrator") {
      return ctx.reply("⚠️ Only admins can initialize the fund.");
    }

    // Check if fund already exists
    const fundCheck = await axios.post(
      `${process.env.BACKEND_URL}/fund/checkExists`,
      { groupId: chatId }
    );

    if (fundCheck.data.exists) {
      return ctx.reply("ℹ️ Fund already exists for this group!");
    }

    // Create Web App button for fund initialization
    const webAppUrl = `${WEB_APP_URL}/init-fund?groupId=${chatId}&userId=${userId}`;

    await ctx.reply(
      "🏦 Initialize a new fund for this group:\n\n" +
        "Set up:\n" +
        "• Fund name\n" +
        "• Minimum contribution\n" +
        "• Trading fee\n\n" +
        "Click below to continue:",
      Markup.inlineKeyboard([
        [
          Markup.button.webApp(
            "🏦 Initialize Fund",
            webAppUrl
          ),
        ],
      ])
    );
  } catch (error: any) {
    console.error("Error in /initfund:", error.message);
    await ctx.reply("❌ Could not initialize fund. Try again later.");
  }
});

// ✅ NEW: Fund info command
bot.command("fundinfo", async (ctx) => {
  const chatId = ctx.chat.id.toString();

  try {
    const response = await axios.post(
      `${process.env.BACKEND_URL}/fund/info`,
      { groupId: chatId }
    );

    const fund = response.data;

    await ctx.reply(
      `📊 Fund Information\n\n` +
        `Name: ${fund.fundName}\n` +
        `Total Value: ${(fund.totalValue / 1_000_000).toFixed(2)} tokens\n` +
        `Total Shares: ${fund.totalShares}\n` +
        `Members: ${fund.memberCount}\n` +
        `Min Contribution: ${(fund.minContribution / 1_000_000).toFixed(2)} tokens\n` +
        `Trading Fee: ${fund.tradingFeeBps / 100}%\n` +
        `Status: ${fund.isActive ? "🟢 Active" : "🔴 Paused"}`
    );
  } catch (error: any) {
    if (error.response?.status === 404) {
      await ctx.reply(
        "⚠️ No fund exists for this group yet.\n\n" +
          "Ask an admin to initialize with /initfund"
      );
    } else {
      console.error("Error fetching fund info:", error.message);
      await ctx.reply("❌ Could not fetch fund information.");
    }
  }
});

// ✅ NEW: My shares command
bot.command("myshares", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const userId = ctx.from?.id.toString();

  try {
    const response = await axios.post(
      `${process.env.BACKEND_URL}/fund/memberInfo`,
      { groupId: chatId, telegramId: userId }
    );

    const member = response.data;

    await ctx.reply(
      `👤 Your Fund Position\n\n` +
        `Shares: ${member.shares}\n` +
        `Total Contributed: ${(member.totalContributed / 1_000_000).toFixed(2)} tokens\n` +
        `Role: ${member.role}\n` +
        `Reputation: ${member.reputationScore}\n` +
        `Successful Trades: ${member.successfulTrades}\n` +
        `Failed Trades: ${member.failedTrades}`
    );
  } catch (error: any) {
    if (error.response?.status === 404) {
      await ctx.reply(
        "⚠️ You haven't contributed to this fund yet.\n\n" +
          "Use /contribute to join!"
      );
    } else {
      console.error("Error fetching member info:", error.message);
      await ctx.reply("❌ Could not fetch your information.");
    }
  }
});

bot.command("balance", async (ctx) => {
  const args = ctx.message.text.split(" ");
  const address = args[1];

  if (!address) return ctx.reply("⚠️ Usage: /balance <wallet_address>");

  try {
    const balance = await connection.getBalance(new PublicKey(address));
    ctx.reply(`💸 Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  } catch (err) {
    ctx.reply("❌ Invalid wallet address");
  }
});

bot.command("mybalance", async (ctx) => {
  await ctx.reply("🔎 Querying your balance from the blockchain...");

  const telegramId = ctx.from.id.toString();

  try {
    const response = await axios.post(
      `${process.env.BACKEND_URL}/user/userBalance`,
      { telegramId }
    );

    const userBalance = response.data.userBalance;
    const solBalance = (userBalance / 1e9).toFixed(4);
    await ctx.reply(`💰 Your balance: ${solBalance} SOL`);
  } catch (error: any) {
    const errMessage = error?.response?.data?.message || error.message;
    console.error("❌ Error fetching balance:", errMessage);
    await ctx.reply("⚠️ Could not fetch your balance. Try again later.");
  }
});

bot.command("help", (ctx) => {
  ctx.reply(
    "💡 **Available Commands:**\n\n" +
      "**Wallet Management:**\n" +
      "/connectwallet - Link your Solana wallet\n" +
      "/mybalance - Check your SOL balance\n" +
      "/balance <address> - Check any wallet's balance\n\n" +
      "**Fund Management:**\n" +
      "/initfund - Initialize group fund (admin only)\n" +
      "/contribute - Contribute to the fund\n" +
      "/fundinfo - View fund details\n" +
      "/myshares - View your position\n\n" +
      "/help - Show this message"
  );
});


bot.on("text", async (ctx) => {
  if (!ctx.session?.waitingForWallet) {
    return;
  }

  const walletAddress = ctx.message.text.trim();
  const telegramId = ctx.from.id.toString();
  const groupId = ctx.message.chat.id.toString();
  const username = ctx.from.username || "unknown";

  ctx.session.waitingForWallet = false;

  console.log("📬 Received wallet:", walletAddress);

  try {
    const res = await axios.post(
      `${process.env.BACKEND_URL}/user/connectwallet`,
      {
        telegramId,
        username,
        walletAddress,
        groupId,
      }
    );

    if (res.data.message === "updated the wallet address") {
      await ctx.reply("✅ Wallet updated successfully!");
    } else {
      await ctx.reply(
        `✅ Wallet linked successfully!\n\n` +
          `🔗 Address: ${walletAddress}\n\n` +
          `You can now use /contribute to add funds!`
      );
    }

    console.log("✅ Wallet info sent:", res.data);
  } catch (err: any) {
    const errorMessage = err?.response?.data?.message;
    if (errorMessage === "invalid public key format") {
      await ctx.reply("❌ Please enter a valid Solana public address.");
    } else if (errorMessage === "user already exists") {
      await ctx.reply("ℹ️ You are already connected with your wallet.");
    } else {
      console.error("❌ Backend error:", errorMessage);
      await ctx.reply("⚠️ Could not connect to backend. Try again later.");
    }
  }
});

bot.on("new_chat_members", async (ctx) => {
  const newMembers = ctx.message.new_chat_members;
  const groupId = ctx.chat.id.toString();

  for (const member of newMembers) {
    const botCheck = member.is_bot;
    if (botCheck) {
      await ctx.reply(
        "🤖 Thank you for adding me to the group!\n\n" +
          "⚠️ Please make me an admin to function properly.\n\n" +
          "Admins can use /initfund to create a group fund! ✅"
      );
      continue;
    }

    const telegramId = member.id.toString();
    const username = member.username || member.first_name || "Unknown";

    console.log(
      `👋 New member joined: ${username} (${telegramId}) in group ${groupId}`
    );

    await ctx.reply(
      `🎉 Welcome, ${username}!\n\n` +
        `Use /connectwallet to link your Solana wallet and join the fund!`
    );

    try {
      const createUserRes = await axios.post(
        `${process.env.BACKEND_URL}/user/createuser`,
        { telegramId, username, groupId }
      );

      console.log(`✅ User created: ${createUserRes.data.message || "Success"}`);
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log(`ℹ️ User ${username} already exists in DB.`);
      } else {
        console.error(`❌ Error creating user ${username}:`, error.message);
      }
    }

    try {
      const addMemberRes = await axios.post(
        `${process.env.BACKEND_URL}/group/addMember`,
        { telegramId, groupId }
      );

      console.log(`✅ Added ${username} to group: ${addMemberRes.data.message}`);
    } catch (error: any) {
      console.error("❌ Error adding member:", error.message);
    }
  }
});

bot.on("left_chat_member", async (ctx) => {
  const leftMember = ctx.message.left_chat_member;
  const telegramId = leftMember.id.toString();
  const username = leftMember.username || leftMember.first_name || "Unknown";
  const groupId = ctx.chat.id.toString();

  console.log(
    `👋 Member left: ${username} (${telegramId}) from group ${groupId}`
  );

  try {
    await axios.post(`${process.env.BACKEND_URL}/group/removeMember`, {
      telegramId,
      groupId,
    });
    console.log(`✅ ${username} removed from group in DB`);
  } catch (error: any) {
    console.error(`❌ Failed to remove ${username}:`, error.message);
  }
});

bot.on("my_chat_member", async (ctx: any) => {
  const newStatus = ctx.myChatMember.new_chat_member.status;
  const oldStatus = ctx.myChatMember.old_chat_member.status;
  const chatId = ctx.chat.id.toString();
  const chatName = ctx.chat?.title || "Unknown Group";

  if (
    (oldStatus === "left" || oldStatus === "kicked") &&
    (newStatus === "member" || newStatus === "administrator")
  ) {
    console.log(`🚀 Bot added to group: ${chatName} (${chatId})`);

    ctx.reply(
      "🤖 Thank you for adding me to the group!\n\n" +
        "⚠️ Please make me an admin to function properly.\n\n" +
        "Use /help to see all available commands! ✅"
    );

    try {
      await axios.post(`${process.env.BACKEND_URL}/group/creategroup`, {
        groupId: chatId,
        name: chatName,
      });
      console.log("✅ Group created in DB");
    } catch (error: any) {
      console.error("❌ Error creating group in DB:", error.message);
    }
  }
});

bot.launch();
console.log("🚀 Telegram bot running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
