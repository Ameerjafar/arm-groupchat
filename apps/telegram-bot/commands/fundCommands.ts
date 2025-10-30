import { Telegraf, Markup } from "telegraf";
import { MyContext } from "../types/context";
import { FundService } from "../api/fundService";
import { prisma } from '@repo/db'

export function registerFundCommands(bot: Telegraf<MyContext>) {
  const fundService = new FundService();  
  async function checkUserHasStartedBot(ctx: MyContext, userId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user?.walletAddress) {
        await ctx.reply(
          `🔐 **Setup Required**\n\n` +
            `Start the bot first to create your wallet:\n` +
            `👉 @${ctx.botInfo?.username}\n\n` +
            `Send /start in private chat, then come back here.`,
          { parse_mode: "Markdown" }
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error checking user:", error);
      await ctx.reply("❌ Please try again.");
      return false;
    }
  }

  async function checkIsAdmin(ctx: MyContext, userId: string): Promise<boolean> {
    try {
      const member = await ctx.getChatMember(parseInt(userId));
      if (member.status !== "creator" && member.status !== "administrator") {
        await ctx.reply("🚫 Admin only.", { parse_mode: "Markdown" });
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error checking admin:", error);
      await ctx.reply("❌ Could not verify permissions.");
      return false;
    }
  }

  // ========== INIT FUND ==========
  bot.command("initfund", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      const hasStarted = await checkUserHasStartedBot(ctx, userId);
      if (!hasStarted) return;

      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) return;

      const fundExists = await fundService.checkFundExists(chatId);
      if (fundExists) {
        return ctx.reply(
          "ℹ️ Fund already exists.\n\nUse /fundinfo to view details.",
          { parse_mode: "Markdown" }
        );
      }

      await ctx.reply("⏳ Creating fund...", { parse_mode: "Markdown" });

      const fund = await fundService.createFund({
        groupId: chatId,
        telegramId: userId,
        fundName: ctx.chat.title || "Group Fund",
        minContribution: 0.1 * 1e9,
        tradingFeeBps: 100,
      });

      const d = fund.data;

      ctx.reply(
        `✅ **Fund Created**\n\n` +
          `Fund Name ${d.fundName}\n` +
          `Min: ${(d.minContribution / 1e9).toFixed(2)} SOL\n` +
          `Fee: ${d.tradingFeeBps / 100}%\n\n` +
          `Members can now use /contribute!\n\n` +
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Init fund error:", error);
      
      if (error.response?.status === 403) {
        const msg = error.response?.data?.message || "";
        if (msg.includes("member of the group")) {
          return ctx.reply("❌ You must be a group member.");
        } else if (msg.includes("Bot is not a member")) {
          return ctx.reply("❌ Add bot as group admin first.");
        }
      }
      
      ctx.reply(
        `❌ Failed to create fund.\n\n${error.response?.data?.message || error.message}`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // ========== PAUSE FUND ==========
  bot.command("pausefund", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      const hasStarted = await checkUserHasStartedBot(ctx, userId);
      if (!hasStarted) return;

      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) return;

      await ctx.reply("⏳ Pausing...");

      const result = await fundService.updateFundStatus({
        groupId: chatId,
        telegramId: userId,
        status: "PAUSED"
      });

      return ctx.reply(
        `⏸️ **Fund Paused**\n\n` +
          `No contributions or trades allowed.\n\n` +
          `Use /resumefund to reactivate.`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Pause error:", error);
      const msg = error.response?.data?.message || "Failed to pause";
      ctx.reply(`❌ ${msg}`);
    }
  });

  // ========== RESUME FUND ==========
  bot.command("resumefund", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      const hasStarted = await checkUserHasStartedBot(ctx, userId);
      if (!hasStarted) return;

      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) return;

      await ctx.reply("⏳ Resuming...");

      const result = await fundService.updateFundStatus({
        groupId: chatId,
        telegramId: userId,
        status: "ACTIVE",
      });

      return ctx.reply(
        `▶️ **Fund Active**\n\n` +
          `Contributions and trades can now continue.`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Resume error:", error);
      const msg = error.response?.data?.message || "Failed to resume";
      ctx.reply(`❌ ${msg}`);
    }
  });

  // ========== CLOSE FUND ==========
  bot.command("closefund", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      const hasStarted = await checkUserHasStartedBot(ctx, userId);
      if (!hasStarted) return;

      const isAdmin = await checkIsAdmin(ctx, userId);
      if (!isAdmin) return;

      // Improved confirmation with inline buttons
      await ctx.reply(
        `⚠️ **Close This Fund?**\n\n` +
          `Requirements:\n` +
          `• All members must withdraw first\n` +
          `• Balance must be zero\n` +
          `• Cannot be undone\n\n` +
          `Rent will be reclaimed to your wallet.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Close Fund",
                  callback_data: `closefund_confirm:${chatId}:${userId}`,
                },
                {
                  text: "❌ Cancel",
                  callback_data: `closefund_cancel:${chatId}:${userId}`,
                },
              ],
            ],
          },
        }
      );
    } catch (error: any) {
      console.error("Close fund error:", error);
      ctx.reply("❌ Failed to process request.");
    }
  });

  // Handle close fund confirmation
  bot.action(/^closefund_confirm:(.+):(.+)$/, async (ctx) => {
    const [, chatId, requestUserId] = ctx.match;
    const clickUserId = ctx.from.id.toString();

    if (clickUserId !== requestUserId) {
      return ctx.answerCbQuery("⚠️ Only you can confirm this.", {
        show_alert: true,
      });
    }

    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText("⏳ Closing fund...", { parse_mode: "Markdown" });

      const result = await fundService.closeFund({
        groupId: chatId as string,
        telegramId: requestUserId,
      });

      return ctx.editMessageText(
        `✅ **Fund Closed**\n\n` +
          `${result.data.rentReclaimed ? '💰 Rent reclaimed to your wallet.' : ''}`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Close error:", error);
      const msg = error.response?.data?.message || "Failed to close fund";
      ctx.editMessageText(`❌ ${msg}`, { parse_mode: "Markdown" });
    }
  });

  // Handle close fund cancel
  bot.action(/^closefund_cancel:(.+):(.+)$/, async (ctx) => {
    const [, chatId, requestUserId] = ctx.match;
    const clickUserId = ctx.from.id.toString();

    if (clickUserId !== requestUserId) {
      return ctx.answerCbQuery("⚠️ Only you can cancel this.", {
        show_alert: true,
      });
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText("❌ Cancelled.", { parse_mode: "Markdown" });
  });

  // ========== FUND INFO ==========
  bot.command("fundinfo", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      const fund = await fundService.getFundInfo(chatId);
      const fundData = fund.data;
      if (!fundData) {
        return ctx.reply(
          `❌ **No Fund**\n\n` +
            `Ask an admin to use /initfund.\n\n` +
            `⚠️ Admin must start @${ctx.botInfo?.username} first.`,
          { parse_mode: "Markdown" }
        );
      }

      const d = fund.data;
      const statusEmoji = d.status === "ACTIVE" ? "🟢" : d.status === "PAUSED" ? "🟡" : "🔴";

      ctx.reply(
        `📊 **Group Name: ${d.fundName ?? "Group Fund"}**\n\n` +
          `Balance: ${Number(d.balanceSol).toFixed(2)} SOL\n` +
          `Min: ${Number(d.minContributionSol).toFixed(2)} SOL\n` +
          `Fee: ${d.tradingFeePercent ?? d.tradingFeeBps / 100}%\n` +
          `Status: ${statusEmoji} ${d.status}\n\n` +
          `${d.status === "ACTIVE" 
            ? `💰 Use /contribute to join!\n\n⚠️ Start @${ctx.botInfo?.username} first.`
            : "⚠️ Not accepting contributions."}`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      if (error.response?.status === 404) {
        ctx.reply(
          `⚠️ No fund found.\n\n` +
            `Ask an admin to use /initfund.\n\n` +
            `⚠️ Admin must start the bot first.`
        );
      } else {
        console.error("Fund info error:", error);
        ctx.reply("❌ Could not fetch fund info.");
      }
    }
  });

  bot.command("fundhelp", async (ctx) => {
    const isGroup = ctx.chat.type !== "private";
    
    ctx.reply(
      `🔰 **Fund Commands**\n\n` +
        `**Admin Commands:**${isGroup ? "" : " (use in group)"}\n` +
        `• /initfund - Create fund\n` +
        `• /pausefund - Pause operations\n` +
        `• /resumefund - Resume operations\n` +
        `• /closefund - Close fund\n\n` +
        `**Member Commands:**${isGroup ? "" : " (use in group)"}\n` +
        `• /fundinfo - View details\n` +
        `• /contribute - Add funds\n` +
        `• /myvalue - Your position\n` +
        `• /cashout - Withdraw all\n` +
        `• /claimprofits - Take profits\n\n`
    );
  });
}
