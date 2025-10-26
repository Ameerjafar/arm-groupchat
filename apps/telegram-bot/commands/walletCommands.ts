import { Telegraf, Markup } from "telegraf";
import { MyContext } from "../types/context";
import { WalletService } from "../services/walletService";
import { ApiService } from "../services/apiService";
import { getNoWalletMessage, isValidSolanaAddress, isValidAmount } from "../utils/validation";

export function registerWalletCommands(bot: Telegraf<MyContext>) {
  const walletService = new WalletService();
  const apiService = new ApiService();

  // START Command
  bot.start(async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || ctx.from.first_name || "Unknown";
    const groupId = ctx.chat.id.toString();

    try {
      const walletCheck = await walletService.checkWallet(telegramId);

      if (walletCheck.hasWallet) {
        const addMemberRes = await apiService.addGroupMember(telegramId, groupId);
        console.log(`✅ Added ${username} to group: ${addMemberRes.data.message}`);
        
        return ctx.reply(
          `🎉 Welcome back in another group, ${ctx.from.first_name}!\n\n` +
            `**Quick Commands:**\n` +
            `/deposit - Get your deposit address\n` +
            `/mybalance - Check your balance\n` +
            `/withdraw - Withdraw funds\n` +
            `/contribute - Join group fund\n` +
            `/help - View all commands`,
          { parse_mode: "Markdown" }
        );
      }

      const { publicKey, encryptedPrivateKey } = walletService.generateWallet();

      await apiService.createUser({
        telegramId,
        username,
        walletAddress: publicKey,
        encryptedPrivateKey,
        groupId
      });

      await ctx.reply(
        `🎉 Welcome to Group Fund Bot, ${ctx.from.first_name}!\n\n` +
          `✅ Your wallet has been created:\n\`${publicKey}\`\n\n` +
          `📥 **Next Steps:**\n` +
          `1. Deposit SOL to start trading\n` +
          `2. Use /mybalance to check your balance\n` +
          `3. Use /contribute to join group funds\n\n` +
          `🔒 **Security Note:**\n` +
          `We securely custody your keys. Use /exportkey anytime to retrieve your private key.\n\n` +
          `Need help? Type /help for all commands.`,
        { parse_mode: "Markdown" }
      );

      console.log(`✅ Created wallet for ${telegramId} (${username}): ${publicKey}`);
    } catch (error: any) {
      const errMessage = error.response?.data.message;
      
      if (errMessage === "you are already in the group") {
        ctx.reply("you are already a member of this group don't worry");
      } else {
        console.error("Error creating wallet:", error.message);
        ctx.reply(
          "❌ **Wallet Creation Failed**\n\n" +
            "We couldn't create your wallet. Please try again:\n" +
            "• Use /start to retry\n" +
            "• Check your internet connection\n" +
            "• Contact support if the issue persists",
          { parse_mode: "Markdown" }
        );
      }
    }
  });

  // DEPOSIT Command
  bot.command("deposit", async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const isPrivateChat = ctx.chat.type === "private";

    try {
      const walletCheck = await walletService.checkWallet(telegramId);

      if (!walletCheck.hasWallet) {
        return ctx.reply(getNoWalletMessage(isPrivateChat), { parse_mode: "Markdown" });
      }

      ctx.reply(
        `📥 **Your Deposit Address:**\n\n` +
          `\`${walletCheck.walletAddress}\`\n\n` +
          `💡 **How to deposit:**\n` +
          `• Send SOL or tokens to this address\n` +
          `• Use /mybalance to check your balance\n` +
          `• Deposits usually confirm in 1-2 minutes`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Error fetching deposit address:", error);
      ctx.reply(
        "❌ **Unable to fetch deposit address**\n\n" +
          "Please try again or contact support if the issue continues."
      );
    }
  });

  // MY BALANCE Command
  bot.command("mybalance", async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const isPrivateChat = ctx.chat.type === "private";

    try {
      const walletCheck = await walletService.checkWallet(telegramId);

      if (!walletCheck.hasWallet) {
        return ctx.reply(getNoWalletMessage(isPrivateChat), { parse_mode: "Markdown" });
      }

      await ctx.reply("🔎 Checking your balance...");

      const solBalance = await walletService.getBalance(telegramId);
      
      ctx.reply(
        `💰 **Your Balance**\n\n` +
          `${solBalance} SOL\n\n` +
          `Use /deposit to add more funds\n` +
          `Use /withdraw to send funds`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Error fetching balance:", error);
      ctx.reply(
        "❌ **Could not fetch balance**\n\n" +
          "This might be a temporary issue. Please:\n" +
          "• Try again in a few seconds\n" +
          "• Check if your wallet exists with /start\n" +
          "• Contact support if the problem persists"
      );
    }
  });

  // EXPORT KEY Command
  bot.command("exportkey", async (ctx) => {
    const telegramId = ctx.from.id.toString();

    if (ctx.chat.type !== "private") {
      return ctx.reply(
        "🚨 **SECURITY WARNING**\n\n" +
          "For your safety, this command only works in **private chat**.\n\n" +
          "👉 Click here to chat with me privately: @" + ctx.me,
        { parse_mode: "Markdown" }
      );
    }

    try {
      const walletCheck = await walletService.checkWallet(telegramId);

      if (!walletCheck.hasWallet) {
        return ctx.reply(getNoWalletMessage(true), { parse_mode: "Markdown" });
      }

      const privateKey = await walletService.exportPrivateKey(telegramId);

      await ctx.reply(
        `🔑 **Your Private Key:**\n\n` +
          `\`${privateKey}\`\n\n` +
          `⚠️ **CRITICAL SECURITY WARNINGS:**\n` +
          `• NEVER share this with anyone\n` +
          `• Anyone with this key controls your funds\n` +
          `• Import to Phantom/Solflare for full control\n` +
          `• DELETE this message after saving securely\n\n` +
          `Stay safe! 🔒`,
        { parse_mode: "Markdown" }
      );

      console.log(`⚠️ User ${telegramId} exported private key`);
    } catch (error) {
      console.error("Error retrieving private key:", error);
      ctx.reply(
        "❌ **Error retrieving private key**\n\n" +
          "Please contact support for assistance."
      );
    }
  });

  // WITHDRAW Command
  bot.command("withdraw", async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const isPrivateChat = ctx.chat.type === "private";
    const args = ctx.message.text.split(" ");

    try {
      const walletCheck = await walletService.checkWallet(telegramId);

      if (!walletCheck.hasWallet) {
        return ctx.reply(getNoWalletMessage(isPrivateChat), { parse_mode: "Markdown" });
      }

      if (args.length < 3) {
        return ctx.reply(
          "📤 **Withdraw Funds**\n\n" +
            "**Usage:**\n" +
            "`/withdraw <amount> <destination_address>`\n\n" +
            "**Example:**\n" +
            "`/withdraw 0.5 YourWalletAddressHere`\n\n" +
            "Make sure to double-check the destination address!",
          { parse_mode: "Markdown" }
        );
      }

      const amount = parseFloat(args[1]!);
      const destination = args[2]!;

      if (!isValidAmount(amount)) {
        return ctx.reply(
          "❌ **Invalid amount**\n\n" +
            "Please enter a valid positive number.\n" +
            "Example: `/withdraw 0.5 YourAddress`",
          { parse_mode: "Markdown" }
        );
      }

      if (!isValidSolanaAddress(destination)) {
        return ctx.reply(
          "❌ **Invalid destination address**\n\n" +
            "Please check the wallet address and try again.\n" +
            "Solana addresses are typically 32-44 characters long."
        );
      }

      await ctx.reply("⏳ Processing your withdrawal...");

      const response = await walletService.withdraw(telegramId, amount, destination);

      if (response.data.success) {
        ctx.reply(
          `✅ **Withdrawal Successful!**\n\n` +
            `💰 Amount: ${amount} SOL\n` +
            `📝 Transaction: \`${response.data.signature}\`\n\n` +
            `Your funds should arrive in 1-2 minutes.`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (error: any) {
      console.error("Withdrawal error:", error);
      const errorMsg = error.response?.data?.message || error.message;

      if (errorMsg.includes("Insufficient")) {
        ctx.reply(
          "❌ **Insufficient Balance**\n\n" +
            "You don't have enough SOL for this withdrawal.\n" +
            "Use /mybalance to check your current balance."
        );
      } else {
        ctx.reply(
          `❌ **Withdrawal Failed**\n\n` +
            `${errorMsg}\n\n` +
            `Please try again or contact support if the issue persists.`
        );
      }
    }
  });
}
