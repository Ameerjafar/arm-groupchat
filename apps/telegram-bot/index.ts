import { Telegraf, session, Context } from "telegraf";
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
bot.start(async (ctx) => {
  await ctx.reply("🤖 Welcome! I can help you connect your Solana wallet.");
});

bot.command("connectwallet", async (ctx) => {
  try {
    ctx.session ??= {};
    console.log("session", ctx.session);
    ctx.session.waitingForWallet = true;
    console.log(ctx.session);
    await ctx.reply("💬 Please enter your Solana wallet public address:");
    console.log("Waiting for wallet input...");
  } catch (err) {
    console.error("Error in /connectwallet:", err);
    await ctx.reply("❌ Something went wrong. Try again later.");
  }
});

bot.command("balance", async (ctx) => {
  console.log('inside balance');
  
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
  console.log("inside the mybalance");
  await ctx.reply("🔎 Querying your balance from the blockchain...");

  const telegramId = ctx.from.id.toString();

  try {
    const response = await axios.post(
      `${process.env.BACKEND_URL}/user/userBalance`,
      { telegramId }
    );

    const userBalance = response.data.userBalance; // note: typo fix (userBalane -> userBalance)
    console.log("backend response", response.data);
    const solBalance = (userBalance / 1e9).toFixed(4);
    await ctx.reply(`💰 Your balance: ${solBalance} SOL`);
  } catch (error: any) {
    const errMessage = error?.response?.data?.message || error.message;
    console.error("❌ Error fetching balance:", errMessage);
    await ctx.reply("⚠️ Could not fetch your balance. Try again later.");
  }
});


bot.on("text", async (ctx) => {
  if (!ctx.session?.waitingForWallet) {
    return;
  }
  console.log("inside the text thing");
  const walletAddress = ctx.message.text.trim();
  const telegramId = ctx.from.id.toString();
  const groupId = ctx.message.chat.id.toString();
  const username = ctx.from.username || "unknown";
  console.log("above the session");
  ctx.session.waitingForWallet = false;

  console.log("📬 Received wallet:", walletAddress);
  console.log("Backend URL:", process.env.BACKEND_URL);

  try {
    console.log(process.env.BACKEND_URL!);
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
      await ctx.reply("wallet updated successfully");
    } else {
      await ctx.reply(
        `✅ Wallet linked successfully!\n\n🔗 Address: ${walletAddress}`
      );
    }

    console.log("✅ Wallet info sent:", res.data);
  } catch (err: any) {
    const errorMessage = err?.response?.data?.message;
    if (err?.response?.data?.message === "invalid public key format") {
      await ctx.reply("Please enter valid public address");
    } else if (errorMessage === "user already exists") {
      await ctx.reply("You are already connected with your wallet");
    } else {
      console.error("❌ Backend error:", err?.response?.data?.message);
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
        "Thank you for added me in the group, Please make me admin to function properly. ✅"
      );
      continue;
    }
    const telegramId = member.id.toString();
    const username = member.username || member.first_name || "Unknown";
    console.log(
      `👋 New member joined: ${username} (${telegramId}) in group ${groupId}`
    );

    await ctx.reply(`🎉 Welcome, ${username}!`);

    try {
      console.log("create the user calling");
      const createUserRes = await axios.post(
        `${process.env.BACKEND_URL}/user/createuser`,
        {
          telegramId,
          username,
          groupId,
        }
      );

      console.log(
        `✅ User created: ${createUserRes.data.message || "Success"}`
      );
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log("409 error message");
        console.log(`ℹ️ User ${username} already exists in DB.`);
      } else {
        console.error(`❌ Error creating user ${username}:`, error.message);
        await ctx.reply(`⚠️ Error creating user ${username}.`);
      }
    }

    try {
      const addMemberRes = await axios.post(
        `${process.env.BACKEND_URL}/group/addMember`,
        {
          telegramId,
          groupId,
        }
      );

      console.log(
        `✅ Added ${username} to group: ${addMemberRes.data.message}`
      );
      await ctx.reply(
        `✅ ${username} has been added to the group successfully!`
      );
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
      "Thank you for added me in the group, please make me as the admin to function properly ✅"
    );
    try {
      console.log("create group is calling");
      await axios.post(`${process.env.BACKEND_URL}/group/creategroup`, {
        groupId: chatId,
        name: chatName,
      });
      console.log("✅ Group created in DB");
      await ctx.reply("/help command will help you to find my all commands");
    } catch (error: any) {
      console.error("❌ Error creating group in DB:", error.message);
    }
  }
});



bot.command("help", (ctx) => {
  ctx.reply(
    "💡 Commands:\n/connectwallet - Link your wallet\n/balance <address> - Check SOL balance"
  );
});

bot.launch();
console.log("🚀 Telegram bot running...");
