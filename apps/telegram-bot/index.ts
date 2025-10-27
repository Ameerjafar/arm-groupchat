import { Telegraf, session, Context } from "telegraf";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

interface MySession {
  waitingForWallet?: boolean;
  waitingForProfitDetails?: boolean;
  waitingForTradeDetails?: boolean;
  waitingForSellDetails?: boolean;
}

interface MyContext extends Context {
  session: MySession;
}

const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN!);
bot.use(session());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// ============================================
// COMMANDS (All commands must be before text handlers)
// ============================================

bot.start(async (ctx) => {
  await ctx.reply("🤖 Welcome! I can help you connect your Solana wallet.");
});

bot.command("help", (ctx) => {
  const helpMessage =
    "💡 **Available Commands:**\n\n" +
    "**Wallet Management:**\n" +
    "/connectwallet - Link your Solana wallet\n" +
    "/balance - Check SOL balance of any wallet\n" +
    "/mybalance - Check your SOL balance\n" +
    "/walletbalance - Check SOL and USDC balance\n" + // NEW
    "**Trading (Admin Only):**\n" +
    "/trade - Initiate a token trade\n" +
    "/shareprofit - Share profits among members\n" +
    "/tradehistory - View trading history\n\n" +
    "**User Management:**\n" +
    "/register - Register yourself in the database\n\n" +
    "**General:**\n" +
    "/help - Show this help message";
  ctx.reply(helpMessage, { parse_mode: "Markdown" });
});


// Command to check specific token
bot.command("checktoken", async (ctx) => {
  try {
    const args = ctx.message.text.split(" ");
    const tokenSymbol = args[1];

    if (!tokenSymbol) {
      return ctx.reply(
        "⚠️ Usage: /checktoken <symbol>\n\n" +
        "Example: `/checktoken USDC`\n" +
        "Available: SOL, USDC, USDT, BONK, JUP",
        { parse_mode: "Markdown" }
      );
    }

    const telegramId = ctx.from.id;

    const response = await axios.post(
      `${process.env.BACKEND_URL}/wallet/getTokenBalance`,
      { telegramId, tokenSymbol: tokenSymbol.toUpperCase() }
    );

    if (!response.data.success) {
      return ctx.reply(`⚠️ ${response.data.message}`);
    }

    const { symbol, balance } = response.data.data;
    const emoji = getTokenEmoji(symbol);

    await ctx.reply(
      `${emoji} **${symbol} Balance**\n\n` +
      `💰 ${balance} ${symbol}`,
      { parse_mode: "Markdown" }
    );

  } catch (error: any) {
    console.error("Error in /checktoken command:", error);
    const errorMsg = error.response?.data?.message || "Failed to fetch token balance";
    await ctx.reply(`❌ ${errorMsg}`);
  }
});

bot.command("walletbalance", async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    
    await ctx.reply("🔍 Fetching your wallet balances...");
    
    const response = await axios.post(
      `${process.env.BACKEND_URL}/trade/getWalletBalances`,
      { telegramId }
    );
    
    if (!response.data.success) {
      return ctx.reply(`⚠️ ${response.data.message}`);
    }
    
    const { solBalance, usdcBalance, walletAddress } = response.data.data;
    
    await ctx.reply(
      `💼 **Your Wallet Balances**\n\n` +
      `🔗 Wallet: \`${walletAddress}\`\n\n` +
      `◎ SOL: ${solBalance}\n` +
      `💵 USDC: ${usdcBalance}\n\n` +
      `Network: Devnet`,
      { parse_mode: "Markdown" }
    );
  } catch (error: any) {
    console.error("Error in /walletbalance command:", error);
    const errorMsg = error.response?.data?.message || "Failed to fetch wallet balances";
    await ctx.reply(`❌ ${errorMsg}`);
  }
});


bot.command("sell", async (ctx) => {
  try {
    const chatId = ctx.chat.id;

    // Check if user is admin
    const admins = await ctx.telegram.getChatAdministrators(chatId);
    const adminIds = admins.map((admin) => admin.user.id);
    const isAdmin = adminIds.includes(ctx.from.id);

    if (!isAdmin) {
      await ctx.reply("🚫 You must be a group admin to sell tokens.");
      return;
    }

    await ctx.reply(
      "💰 Please enter sell details in this format:\n\n`<fromToken> <toToken> <amount>`\nExample: `USDC SOL 100`",
      { parse_mode: "Markdown" }
    );

    ctx.session ??= {};
    ctx.session.waitingForSellDetails = true;
  } catch (err) {
    console.error("Error in /sell:", err);
    await ctx.reply("⚠️ Could not initiate sell. Try again later.");
  }
});


// Helper function for token emojis
function getTokenEmoji(symbol: string): string {
  const emojiMap: { [key: string]: string } = {
    'SOL': '◎',
    'USDC': '💵',
    'USDT': '💰',
    'BONK': '🐕',
    'JUP': '🪐',
    'BTC': '₿',
    'ETH': 'Ξ',
  };
  return emojiMap[symbol.toUpperCase()] || '🪙';
}

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

bot.command("trade", async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const admins = await ctx.telegram.getChatAdministrators(chatId);
    const adminIds = admins.map((admin) => admin.user.id);
    const isAdmin = adminIds.includes(ctx.from.id);

    if (!isAdmin) {
      await ctx.reply("🚫 You must be a group admin to initiate a trade.");
      return;
    }

    await ctx.reply(
      "🧩 Please enter trade details in this format:\n\n`<fromToken> <toToken> <amount>`\nExample: `SOL USDC 5`",
      { parse_mode: "Markdown" }
    );

    ctx.session ??= {};
    ctx.session.waitingForTradeDetails = true;
  } catch (err) {
    console.error("Error in /trade:", err);
    await ctx.reply("⚠️ Could not initiate trade. Try again later.");
  }
});

bot.command("shareprofit", async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const admins = await ctx.telegram.getChatAdministrators(chatId);
    const adminIds = admins.map((admin) => admin.user.id);
    const isAdmin = adminIds.includes(ctx.from.id);

    if (!isAdmin) {
      await ctx.reply("🚫 Only group admins can share profits.");
      return;
    }

    await ctx.reply(
      "💰 Please enter profit-sharing details in this format:\n\n`<totalProfit> <peer1>:<share1> <peer2>:<share2>`\nExample: `1000 @user1:50 @user2:50`"
    );

    ctx.session ??= {};
    ctx.session.waitingForProfitDetails = true;
  } catch (err) {
    console.error("Error in /shareprofit:", err);
    await ctx.reply("⚠️ Could not initiate profit sharing. Try again later.");
  }
});

bot.command("tradehistory", async (ctx) => {
  try {
    const response = await axios.get(`${process.env.BACKEND_URL}/trade/history`, {
      params: { chatId: ctx.chat.id },
    });

    if (response.data.success) {
      const history = response.data.history;
      if (history.length === 0) {
        return ctx.reply("📜 No trades found in the history.");
      }

      const historyMessage = history
        .map(
          (trade: any, index: number) =>
            `${index + 1}. ${trade.fromToken} → ${trade.toToken}, Amount: ${trade.amount}, Profit: ${trade.profit}`
        )
        .join("\n");

      await ctx.reply(`📜 Trade History:\n\n${historyMessage}`);
    } else {
      await ctx.reply(`⚠️ Error: ${response.data.message || "Something went wrong."}`);
    }
  } catch (error) {
    console.error("Error fetching trade history:", error);
    await ctx.reply("⚠️ Could not fetch trade history. Please try again.");
  }
});

bot.command("register", async (ctx) => {
  try {
    console.log("Register command called");

    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || ctx.from.first_name || "Unknown";
    const groupId = ctx.chat.id.toString();

    try {
      const createUserRes = await axios.post(
        `${process.env.BACKEND_URL}/user/createuser`,
        {
          telegramId,
          username,
          groupId,
        }
      );

      await ctx.reply(`✅ You have been registered successfully!`);
      console.log(`✅ User created: ${createUserRes.data.message || "Success"}`);
    } catch (error: any) {
      if (error.response?.status === 409) {
        await ctx.reply("ℹ️ You are already registered in the database.");
      } else {
        console.error(`❌ Error creating user:`, error.message);
        await ctx.reply(
          `❌ Registration failed. Error: ${error.response?.data?.message || error.message}`
        );
      }
    }
  } catch (err) {
    console.error("Error in /register:", err);
    await ctx.reply("❌ Something went wrong. Try again later.");
  }
});

// ============================================
// SINGLE TEXT HANDLER (Must be after all commands)
// ============================================

bot.on("text", async (ctx) => {
  ctx.session ??= {};

  if (ctx.session.waitingForSellDetails) {
    const sellDetails = ctx.message.text.trim();
    ctx.session.waitingForSellDetails = false;

    try {
      const response = await axios.post(
        `${process.env.BACKEND_URL}/trade/makeTrade`,
        {
          chatId: ctx.chat.id,
          userId: ctx.from.id,
          username: ctx.from.username,
          tradeDetails: sellDetails,
        }
      );

      if (response.data.success) {
        const { data } = response.data;
        
        await ctx.reply(
          `✅ Tokens sold successfully!\n\n` +
          `📊 Trade Summary:\n` +
          `Sold: ${data.amount} ${data.fromToken}\n` +
          `Received: ${data.estimatedToAmount} ${data.toToken}\n\n` +
          `💡 Use /shareprofit to distribute profits to group members`,
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.reply(`⚠️ Error: ${response.data.message}`);
      }
    } catch (error) {
      console.error("Error in sell execution:", error);
      await ctx.reply("⚠️ Failed to sell tokens. Please try again.");
    }
    return;
  }

  // Handle trade details input
  if (ctx.session.waitingForTradeDetails) {
    const tradeDetails = ctx.message.text.trim();
    ctx.session.waitingForTradeDetails = false;

    console.log(`${process.env.BACKEND_URL}/trade/makeTrade`);

    try {
      const response = await axios.post(`${process.env.BACKEND_URL}/trade/makeTrade`, {
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        username: ctx.from.username,
        tradeDetails,
      });

      if (response.data.success) {
        await ctx.reply(`✅ Trade executed successfully!\n${response.data.message}`);
      } else {
        await ctx.reply(`⚠️ Error: ${response.data.message || "Something went wrong."}`);
      }
    } catch (error) {
      console.error("Error in trade execution:", error);
      await ctx.reply("⚠️ Failed to execute trade. Please try again.");
    }
    return; // Important: Exit after handling
  }

  // Handle profit-sharing details input
  if (ctx.session.waitingForProfitDetails) {
    const profitDetails = ctx.message.text.trim();
    ctx.session.waitingForProfitDetails = false;

    try {
      const [totalProfitString, ...peerShares] = profitDetails.split(" ");
      const totalProfit = parseFloat(totalProfitString!);

      if (isNaN(totalProfit) || totalProfit <= 0) {
        return ctx.reply("⚠️ Invalid total profit amount. Please try again.");
      }

      const shares = peerShares.map((peerShare) => {
        const [peer, shareString] = peerShare.split(":");
        const share = parseFloat(shareString!);
        if (!peer || isNaN(share) || share <= 0) {
          throw new Error("Invalid profit-sharing format.");
        }
        return { peer, share };
      });

      const totalShares = shares.reduce((sum, { share }) => sum + share, 0);
      if (totalShares !== 100) {
        return ctx.reply("⚠️ Total shares must equal 100%. Please try again.");
      }

      const response = await axios.post(`${process.env.BACKEND_URL}/trade/shareProfit`, {
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        username: ctx.from.username,
        totalProfit,
        shares,
      });

      if (response.data.success) {
        await ctx.reply(`✅ Profit shared successfully!\n${response.data.message}`);
      } else {
        await ctx.reply(`⚠️ Error: ${response.data.message || "Something went wrong."}`);
      }
    } catch (error) {
      console.error("Error in profit sharing:", error);
      await ctx.reply("⚠️ Failed to share profits. Please try again.");
    }
    return; // Important: Exit after handling
  }

  // Handle wallet address input
  if (ctx.session.waitingForWallet) {
    console.log("Inside wallet address handler");
    const walletAddress = ctx.message.text.trim();
    const telegramId = ctx.from.id.toString();
    const groupId = ctx.message.chat.id.toString();
    const username = ctx.from.username || "unknown";
    ctx.session.waitingForWallet = false;

    console.log("📬 Received wallet:", walletAddress);

    try {
      const res = await axios.post(`${process.env.BACKEND_URL}/user/connectwallet`, {
        telegramId,
        username,
        walletAddress,
        groupId,
      });

      if (res.data.message === "updated the wallet address") {
        await ctx.reply("✅ Wallet updated successfully");
      } else {
        await ctx.reply(`✅ Wallet linked successfully!\n\n🔗 Address: ${walletAddress}`);
      }

      console.log("✅ Wallet info sent:", res.data);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message;
      if (errorMessage === "invalid public key format") {
        await ctx.reply("⚠️ Please enter valid public address");
      } else if (errorMessage === "user already exists") {
        await ctx.reply("⚠️ You are already connected with your wallet");
      } else {
        console.error("❌ Backend error:", errorMessage);
        await ctx.reply("⚠️ Could not connect to backend. Try again later.");
      }
    }
    return; // Important: Exit after handling
  }

  // If no session flag is set, ignore the message
});



// ============================================
// EVENT HANDLERS (After text handler)
// ============================================

bot.on("new_chat_members", async (ctx) => {
  console.log("New chat members event triggered");

  const newMembers = ctx.message.new_chat_members;
  const groupId = ctx.chat.id.toString();

  for (const member of newMembers) {
    if (member.is_bot) {
      await ctx.reply("Thank you for adding me to the group! Please make me admin to function properly. ✅");
      continue;
    }

    const telegramId = member.id.toString();
    const username = member.username || member.first_name || "Unknown";
    console.log(`👋 New member joined: ${username} (${telegramId}) in group ${groupId}`);

    await ctx.reply(`🎉 Welcome, ${username}!`);

    // Create user
    try {
      const createUserRes = await axios.post(`${process.env.BACKEND_URL}/user/createuser`, {
        telegramId,
        username,
        groupId,
      });
      console.log(`✅ User created: ${createUserRes.data.message || "Success"}`);
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log(`ℹ️ User ${username} already exists in DB.`);
      } else {
        console.error(`❌ Error creating user ${username}:`, error.message);
        await ctx.reply(`⚠️ Error creating user ${username}.`);
      }
    }

    // Add member to group
    try {
      const addMemberRes = await axios.post(`${process.env.BACKEND_URL}/group/addMember`, {
        telegramId,
        groupId,
      });
      console.log(`✅ Added ${username} to group: ${addMemberRes.data.message}`);
      await ctx.reply(`✅ ${username} has been added to the group successfully!`);
    } catch (error: any) {
      if (error.response) {
        const { status, data } = error.response;
        if (status === 404) {
          console.warn(`⚠️ Add member failed - ${data.message}`);
          await ctx.reply(`⚠️ ${data.message}`);
        } else if (status === 400) {
          console.warn(`⚠️ Missing parameters for addMember request.`);
          await ctx.reply("⚠️ Missing required details. Could not add member.");
        } else {
          console.error(`❌ Server error while adding member: ${data.message}`);
          await ctx.reply("⚠️ Internal server error while adding member.");
        }
      } else {
        console.error("❌ Network/unknown error:", error.message);
        await ctx.reply("⚠️ Could not reach backend. Try again later.");
      }
    }
  }
});

bot.on("left_chat_member", async (ctx) => {
  const leftMember = ctx.message.left_chat_member;
  const telegramId = leftMember.id.toString();
  const username = leftMember.username || leftMember.first_name || "Unknown";
  const groupId = ctx.chat.id.toString();

  console.log(`👋 Member left: ${username} (${telegramId}) from group ${groupId}`);

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
    ctx.reply("Thank you for adding me to the group! Please make me admin to function properly ✅");

    try {
      await axios.post(`${process.env.BACKEND_URL}/group/creategroup`, {
        groupId: chatId,
        name: chatName,
      });
      console.log("✅ Group created in DB");
      await ctx.reply("/help command will help you find all my commands");
    } catch (error: any) {
      console.error("❌ Error creating group in DB:", error.message);
    }
  }
});

// ============================================
// BOT LAUNCH
// ============================================

bot.launch();
console.log("🚀 Telegram bot running...");

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
