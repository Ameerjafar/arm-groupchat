import { Telegraf, Markup } from "telegraf";
import { MyContext } from "../types/context";
import { FundService } from "../services/fundService";
import { WalletService } from "../services/walletService";
import { config } from "../config/config";

export function registerFundCommands(bot: Telegraf<MyContext>) {
  const fundService = new FundService();
  const walletService = new WalletService();

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
      const member = await ctx.getChatMember(parseInt(userId));
      if (member.status !== "creator" && member.status !== "administrator") {
        return ctx.reply(
          "🚫 **Admin Only**\n\n" +
            "Only group admins can initialize a fund.\n" +
            "Ask an admin to run this command.",
          { parse_mode: "Markdown" }
        );
      }

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
          "Please wait while we set up your custodial fund wallet...",
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
          "⚙️ Use /fundsettings to customize fund parameters.\n" +
          "💰 Members can now use /contribute to join!",
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Error in /initfund:", error);
      ctx.reply(
        "❌ **Could not initialize fund**\n\n" +
          "Please try again or contact support if the issue continues.",
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
      // Check if user is admin
      const member = await ctx.getChatMember(parseInt(userId));
      if (member.status !== "creator" && member.status !== "administrator") {
        return ctx.reply(
          "🚫 **Admin Only**\n\n" +
            "Only group admins can pause the fund.",
          { parse_mode: "Markdown" }
        );
      }

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
      // Check if user is admin
      const member = await ctx.getChatMember(parseInt(userId));
      if (member.status !== "creator" && member.status !== "administrator") {
        return ctx.reply(
          "🚫 **Admin Only**\n\n" +
            "Only group admins can resume the fund.",
          { parse_mode: "Markdown" }
        );
      }

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
      // Check if user is admin
      const member = await ctx.getChatMember(parseInt(userId));
      if (member.status !== "creator" && member.status !== "administrator") {
        return ctx.reply(
          "🚫 **Admin Only**\n\n" +
            "Only group admins can close the fund.",
          { parse_mode: "Markdown" }
        );
      }

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

      // Wait for confirmation
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
          "❌ No fund found for this group.\n" +
            "Use /initfund to set up a group fund.",
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
        `📊 *Group Fund Information*\n\n` +
          `*Fund Name:* ${data.fundName ?? "-"}\n` +
          `*Fund PDA:* \`${data.fundPdaAddress}\`\n` +
          `*Owner:* ${owner}\n\n` +
          `*Total Value:* ${Number(data.balanceSol).toFixed(2)} SOL\n` +
          `*Min Contribution:* ${Number(data.minContributionSol).toFixed(2)} SOL\n` +
          `*Trading Fee:* ${data.tradingFeePercent ?? data.tradingFeeBps / 100}%\n` +
          `*Status:* ${status}\n` +
          `\n${data.status === "ACTIVE" ? "Use /contribute to join the fund!" : "Fund is not accepting contributions."}`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      if (error.response?.status === 404) {
        ctx.reply(
          "⚠️ **No Fund Found**\n\n" +
            "This group doesn't have a fund yet.\n" +
            "Ask an admin to use /initfund to create one."
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

  // MY SHARES Command
  // bot.command("myshares", async (ctx) => {
  //   const chatId = ctx.chat.id.toString();
  //   const userId = ctx.from.id.toString();

  //   if (ctx.chat.type === "private") {
  //     return ctx.reply(
  //       "⚠️ This command only works in **group chats**.\n\n" +
  //         "Use this in a group to view your position.",
  //       { parse_mode: "Markdown" }
  //     );
  //   }

  //   try {
  //     const member = await fundService.getMemberInfo(chatId, userId);

  //     ctx.reply(
  //       `👤 **Your Position**\n\n` +
  //         `📈 Shares: ${member.shares}\n` +
  //         `💰 Total Contributed: ${(member.totalContributed / 1e9).toFixed(2)} SOL\n` +
  //         `👔 Role: ${member.role}\n` +
  //         `⭐ Reputation: ${member.reputationScore}\n\n` +
  //         `Use /contribute to add more!`,
  //       { parse_mode: "Markdown" }
  //     );
  //   } catch (error: any) {
  //     if (error.response?.status === 404) {
  //       ctx.reply(
  //         "⚠️ **No Position Found**\n\n" +
  //           "You haven't contributed to this fund yet.\n" +
  //           "Use /contribute to join!"
  //       );
  //     } else {
  //       console.error("Error fetching member info:", error);
  //       ctx.reply(
  //         "❌ **Could not fetch your information**\n\n" +
  //           "Please try again later."
  //       );
  //     }
  //   }
  // });

  // HELP Command - List all fund commands
  bot.command("fundhelp", async (ctx) => {
    ctx.reply(
      "🔰 **Fund Commands**\n\n" +
        "*Admin Commands:*\n" +
        "• `/initfund` - Create a new fund\n" +
        "• `/pausefund` - Pause fund operations\n" +
        "• `/resumefund` - Resume fund operations\n" +
        "• `/closefund` - Close and delete fund\n\n" +
        "*Member Commands:*\n" +
        "• `/fundinfo` - View fund details\n" +
        "• `/contribute` - Add funds to the group\n" +
        "• `/myshares` - View your position\n" +
        "• `/fundhelp` - Show this help message",
      { parse_mode: "Markdown" }
    );
  });
}
