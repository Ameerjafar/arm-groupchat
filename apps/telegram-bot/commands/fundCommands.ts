import { Telegraf, Markup } from "telegraf";
import { MyContext } from "../types/context";
import { FundService } from "../services/fundService";
import { WalletService } from "../services/walletService";
import { prisma } from '@repo/db'
import { config } from "../config/config";

export function registerFundCommands(bot: Telegraf<MyContext>) {
  const fundService = new FundService();
  const walletService = new WalletService();

  /**
   * Helper function to check if user has started the bot
   */
  async function checkUserHasStartedBot(ctx: MyContext, userId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user) {
        await ctx.reply(
          "⚠️ **Get Started First!**\n\n" +
            "Before using fund commands, you need to:\n\n" +
            "1️⃣ Start a private chat with the bot\n" +
            "2️⃣ Click the link below or search for the bot\n" +
            "3️⃣ Send `/start` to create your wallet\n" +
            "4️⃣ Come back here and try again!\n\n" +
            `👉 [Click here to start](https://t.me/${ctx.botInfo?.username}?start=setup)`,
          { parse_mode: "Markdown" }
        );
        return false;
      }

      if (!user.walletAddress) {
        await ctx.reply(
          "⚠️ **Wallet Not Setup!**\n\n" +
            "Your wallet hasn't been created yet.\n\n" +
            "Please:\n" +
            "1️⃣ Open a private chat with the bot\n" +
            "2️⃣ Send `/start` to create your wallet\n" +
            "3️⃣ Come back and try again!\n\n" +
            `👉 [Start the bot](https://t.me/${ctx.botInfo?.username}?start=wallet)`,
          { parse_mode: "Markdown" }
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error checking user status:", error);
      await ctx.reply(
        "❌ An error occurred. Please try again later.",
        { parse_mode: "Markdown" }
      );
      return false;
    }
  }

  /**
   * Helper to check admin permissions
   */
  async function checkIsAdmin(ctx: MyContext, userId: string): Promise<boolean> {
    try {
      const member = await ctx.getChatMember(parseInt(userId));
      if (member.status !== "creator" && member.status !== "administrator") {
        await ctx.reply(
          "🚫 **Admin Only**\n\n" +
            "Only group admins can use this command.\n" +
            "Ask an admin to run this command.",
          { parse_mode: "Markdown" }
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error checking admin status:", error);
      await ctx.reply("❌ Could not verify permissions. Please try again.");
      return false;
    }
  }

  // INIT FUND Command
  bot.command("initfund", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.\n\n" +
          "Please use this command in the group where you want to create a fund.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      // Check if user has started bot first
      const hasStarted = await checkUserHasStartedBot(ctx, userId);
      if (!hasStarted) return;

      // Check admin permissions
      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) return;

      // Check if fund already exists
      const fundExists = await fundService.checkFundExists(chatId);

      if (fundExists) {
        return ctx.reply(
          "ℹ️ **Fund Already Exists**\n\n" +
            "This group already has an active fund!\n" +
            "Use /fundinfo to view details.",
          { parse_mode: "Markdown" }
        );
      }

      const loadingMsg = await ctx.reply(
        "⏳ **Creating Fund...**\n\n" +
          "Please wait while we set up your group fund...",
        { parse_mode: "Markdown" }
      );

      const fund = await fundService.createFund({
        groupId: chatId,
        telegramId: userId,
        fundName: ctx.chat.title || "Group Fund",
        minContribution: 0.1 * 1e9,
        tradingFeeBps: 100,
      });
      const fundData = fund.data;

      await ctx.deleteMessage(loadingMsg.message_id);

      ctx.reply(
        "✅ **Fund Created Successfully!**\n\n" +
          `📌 Name: ${fundData.fundName}\n` +
          `🔐 Wallet: \`${fundData.fundPdaAddress}\`\n` +
          `💵 Min Contribution: ${(fundData.minContribution / 1e9).toFixed(2)} SOL\n` +
          `📊 Trading Fee: ${fundData.tradingFeeBps / 100}%\n\n` +
          "💰 Members can now use /contribute to join!\n\n" +
          "⚠️ **Note:** Members must start the bot first!\n" +
          `Send them: @${ctx.botInfo?.username}`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Error in /initfund:", error);
      
      // Handle specific error cases
      if (error.response?.status === 403) {
        const message = error.response?.data?.message || "";
        if (message.includes("member of the group")) {
          return ctx.reply(
            "❌ **Not a Group Member**\n\n" +
              "You must be a member of this group to create a fund.",
            { parse_mode: "Markdown" }
          );
        } else if (message.includes("Bot is not a member")) {
          return ctx.reply(
            "❌ **Bot Configuration Error**\n\n" +
              "The bot needs to be added to this group with proper permissions.\n" +
              "Please add the bot as an admin.",
            { parse_mode: "Markdown" }
          );
        }
      }
      
      ctx.reply(
        "❌ **Could not initialize fund**\n\n" +
          "Please try again or contact support if the issue continues.\n\n" +
          `Error: ${error.response?.data?.message || error.message}`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // PAUSE FUND Command
  bot.command("pausefund", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      // Check if user has started bot
      const hasStarted = await checkUserHasStartedBot(ctx, userId);
      if (!hasStarted) return;

      // Check admin permissions
      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) return;

      await ctx.reply("⏳ Pausing fund...");

      const result = await fundService.updateFundStatus({
        groupId: chatId,
        telegramId: userId,
        status: "PAUSED"
      });

      return ctx.reply(
        "⏸️ **Fund Paused**\n\n" +
          "The fund is now paused. No contributions or trades can be made.\n\n" +
          `Transaction: \`${result.data.transactionSignature || 'N/A'}\`\n\n` +
          "Use /resumefund to resume operations.",
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Pause fund error:", error);
      const message = error.response?.data?.message || "Failed to pause fund";
      ctx.reply(`❌ **Error**: ${message}`, { parse_mode: "Markdown" });
    }
  });

  // RESUME FUND Command
  bot.command("resumefund", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      // Check if user has started bot
      const hasStarted = await checkUserHasStartedBot(ctx, userId);
      if (!hasStarted) return;

      // Check admin permissions
      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) return;

      await ctx.reply("⏳ Resuming fund...");

      const result = await fundService.updateFundStatus({
        groupId: chatId,
        telegramId: userId,
        status: "ACTIVE",
      });

      return ctx.reply(
        "▶️ **Fund Resumed**\n\n" +
          "The fund is now active. Contributions and trades can continue.\n\n" +
          `Transaction: \`${result.data.transactionSignature || 'N/A'}\``,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Resume fund error:", error);
      const message = error.response?.data?.message || "Failed to resume fund";
      ctx.reply(`❌ **Error**: ${message}`, { parse_mode: "Markdown" });
    }
  });

  // CLOSE FUND Command
  bot.command("closefund", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      // Check if user has started bot
      const hasStarted = await checkUserHasStartedBot(ctx, userId);
      if (!hasStarted) return;

      // Check admin permissions
      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) return;

      // Confirmation prompt
      await ctx.reply(
        "⚠️ **Close Fund Confirmation**\n\n" +
          "Are you sure you want to close this fund?\n\n" +
          "⚠️ **Warning:**\n" +
          "• All members must withdraw their funds first\n" +
          "• The fund balance must be zero\n" +
          "• This action cannot be undone\n" +
          "• Rent will be reclaimed to your wallet\n\n" +
          "Reply with `yes` to confirm or `no` to cancel.",
        { parse_mode: "Markdown" }
      );

      // Wait for confirmation (note: this pattern has limitations, consider using sessions)
      bot.hears(/^yes$/i, async (confirmCtx) => {
        if (confirmCtx.from.id.toString() !== userId) return;
        if (confirmCtx.chat.id.toString() !== chatId) return;

        try {
          await confirmCtx.reply("⏳ Closing fund... This may take a moment.");

          const result = await fundService.closeFund({
            groupId: chatId,
            telegramId: userId,
          });

          return confirmCtx.reply(
            "✅ **Fund Closed Successfully!**\n\n" +
              `Transaction: \`${result.data.transactionSignature || 'N/A'}\`\n` +
              `${result.data.rentReclaimed ? '💰 Rent has been reclaimed to your wallet!' : ''}\n\n` +
              `View on Solscan: https://solscan.io/tx/${result.data.transactionSignature}?cluster=devnet`,
            { parse_mode: "Markdown" }
          );
        } catch (error: any) {
          console.error("Close fund error:", error);
          const message = error.response?.data?.message || "Failed to close fund";
          confirmCtx.reply(`❌ **Error**: ${message}`, { parse_mode: "Markdown" });
        }
      });

      bot.hears(/^no$/i, async (confirmCtx) => {
        if (confirmCtx.from.id.toString() !== userId) return;
        if (confirmCtx.chat.id.toString() !== chatId) return;

        confirmCtx.reply("❌ Fund closure cancelled.", { parse_mode: "Markdown" });
      });
    } catch (error: any) {
      console.error("Close fund error:", error);
      ctx.reply("❌ Failed to process request.", { parse_mode: "Markdown" });
    }
  });

  // FUND INFO Command
  bot.command("fundinfo", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in group chats.\n\n" +
          "Use this in a group to view its fund information.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      const fund = await fundService.getFundInfo(chatId);

      if (!fund || !fund.data) {
        return ctx.reply(
          "❌ **No Fund Found**\n\n" +
            "This group doesn't have a fund yet.\n\n" +
            "Ask an admin to use /initfund to create one.\n\n" +
            "⚠️ **Admin must start the bot first:**\n" +
            `👉 @${ctx.botInfo?.username}`,
          { parse_mode: "Markdown" }
        );
      }

      const data = fund.data;
      const status = data.status === "ACTIVE" ? "🟢 Active" : 
                     data.status === "PAUSED" ? "🟡 Paused" : "🔴 Closed";
      const owner = data.owner
        ? `[${data.owner.username ?? "Owner"}](tg://user?id=${data.owner.telegramId})`
        : "Unknown";

      ctx.reply(
        `📊 **Group Fund Information**\n\n` +
          `**Fund Name:** ${data.fundName ?? "-"}\n` +
          `**Fund PDA:** \`${data.fundPdaAddress}\`\n` +
          `**Owner:** ${owner}\n\n` +
          `**Total Value:** ${Number(data.balanceSol).toFixed(2)} SOL\n` +
          `**Min Contribution:** ${Number(data.minContributionSol).toFixed(2)} SOL\n` +
          `**Trading Fee:** ${data.tradingFeePercent ?? data.tradingFeeBps / 100}%\n` +
          `**Status:** ${status}\n\n` +
          `${data.status === "ACTIVE" 
            ? "💰 Use /contribute to join the fund!\n\n⚠️ **Note:** You must start the bot first!\n👉 @" + ctx.botInfo?.username
            : "⚠️ Fund is not accepting contributions."}`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      if (error.response?.status === 404) {
        ctx.reply(
          "⚠️ **No Fund Found**\n\n" +
            "This group doesn't have a fund yet.\n" +
            "Ask an admin to use /initfund to create one.\n\n" +
            "⚠️ Admin must start the bot first!"
        );
      } else {
        console.error("Error fetching fund info:", error);
        ctx.reply(
          "❌ **Could not fetch fund information**\n\n" +
            "Please try again later."
        );
      }
    }
  });

  // HELP Command - List all fund commands
  bot.command("fundhelp", async (ctx) => {
    ctx.reply(
      "🔰 **Fund Commands**\n\n" +
        "**Admin Commands:**\n" +
        "• `/initfund` - Create a new fund\n" +
        "• `/pausefund` - Pause fund operations\n" +
        "• `/resumefund` - Resume fund operations\n" +
        "• `/closefund` - Close and delete fund\n\n" +
        "**Member Commands:**\n" +
        "• `/fundinfo` - View fund details\n" +
        "• `/contribute` - Add funds to the group\n" +
        "• `/myvalue` - View your position\n" +
        "• `/cashout` - Withdraw your funds\n" +
        "• `/claimprofits` - Claim profits only\n" +
        "• `/fundhelp` - Show this help message\n\n" +
        "⚠️ **Important:**\n" +
        `Before using any command, start the bot:\n` +
        `👉 @${ctx.botInfo?.username}\n` +
        `Send /start in private chat to create your wallet.`,
      { parse_mode: "Markdown" }
    );
  });
}
