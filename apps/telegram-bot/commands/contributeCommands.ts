import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";
import { FundService } from "../api/fundService";
import { ContributionApiService } from "../api/contributorApi";
import { ApiService } from "../api/apiService";

export function registerContributorCommands(bot: Telegraf<MyContext>) {
  const fundService = new FundService();
  const contributionService = new ContributionApiService();
  const apiService = new ApiService(); 

  // ========== CONTRIBUTE ==========
  bot.command("contribute", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(" ");

    // Check if in group
    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ Use this command in a group chat with an active fund.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      // ✅ Check if user has wallet (ran /start)
      const walletCheck = await apiService.checkUserWallet(userId);
      if (!walletCheck.hasWallet) {
        return ctx.reply(
          "❌ You need to create a wallet first!\n\n" +
            "Send /start to @YourBotName in a private chat to set up your wallet.",
          { parse_mode: "Markdown" }
        );
      }

      // Check fund exists
      const fundExists = await fundService.checkFundExists(chatId);
      if (!fundExists) {
        return ctx.reply(
          "❌ No fund found in this group.\n\n" +
            "Ask an admin to use /initfund first."
        );
      }

      const fund = await fundService.getFundInfo(chatId);
      const fundData = fund.data;

      // Check fund status
      if (fundData.status !== "ACTIVE") {
        return ctx.reply(
          `⚠️ Fund is ${fundData.status}. Contributions are paused.`,
          { parse_mode: "Markdown" }
        );
      }

      // Show usage if no amount
      if (args.length < 2) {
        return ctx.reply(
          `💰 **${fundData.fundName}**\n\n` +
            `Min: ${Number(fundData.minContributionSol).toFixed(2)} SOL\n` +
            `Balance: ${Number(fundData.balanceSol).toFixed(2)} SOL\n` +
            `Fee: ${fundData.tradingFeeBps / 100}%\n\n` +
            `Usage: \`/contribute 0.5\``,
          { parse_mode: "Markdown" }
        );
      }

      const amount = parseFloat(args[1]!);
      const minContribution = Number(fundData.minContributionSol);

      // Validate amount
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ Please enter a valid amount greater than 0.");
      }

      if (amount < minContribution) {
        return ctx.reply(
          `❌ Minimum is ${minContribution.toFixed(2)} SOL.\n` +
            `You entered ${amount.toFixed(2)} SOL.`,
          { parse_mode: "Markdown" }
        );
      }

      // ✅ Check user balance
      const balanceResponse = await apiService.getUserBalance(userId);
      const userBalance = Number(balanceResponse.data.balance);
      console.log(fundData);
      if (userBalance < amount) {
        return ctx.reply(
          `❌ Insufficient balance!\n\n` +
            `You have: ${userBalance.toFixed(4)} SOL\n` +
            `Required: ${amount.toFixed(4)} SOL\n\n` +
            `Please deposit SOL to your wallet first.`,
          { parse_mode: "Markdown" }
        );
      }

      // Confirm contribution
      await ctx.reply(
        `💰 Confirm ${amount.toFixed(4)} SOL to ${ctx.chat.title}?`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Confirm",
                  callback_data: `contribute_confirm:${chatId}:${userId}:${amount}`,
                },
                {
                  text: "❌ Cancel",
                  callback_data: `contribute_cancel:${chatId}:${userId}`,
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in /contribute:", error);
      ctx.reply("❌ Something went wrong. Please try again.");
    }
  });

  // Handle confirmation
  bot.action(/^contribute_confirm:(.+):(.+):(.+)$/, async (ctx) => {
    const [, chatId, requestUserId, amountStr] = ctx.match;
    const clickUserId = ctx.from.id.toString();
    const amount = parseFloat(amountStr!);

    if (clickUserId !== requestUserId) {
      return ctx.answerCbQuery("⚠️ Only you can confirm this.", {
        show_alert: true,
      });
    }

    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `⏳ Processing ${amount.toFixed(4)} SOL...\n\nPlease wait.`,
        { parse_mode: "Markdown" }
      );

      const data = await contributionService.createContribution({
        groupId: chatId as string,
        telegramId: requestUserId,
        amountSol: amount,
      });

      await ctx.editMessageText(
        `✅ Contribution successful!\n\n` +
          `💰 ${data.data.amountSol} SOL\n` +
          `📈 ${data.data.sharesMinted} shares received\n` +
          `💵 Fund balance: ${data.data.fundBalanceSol.toFixed(2)} SOL\n\n` +
          `Use /myshares to see your position.`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Contribution error:", error);
      await ctx.editMessageText(
        `❌ Failed: ${error.message || "Unknown error"}\n\nPlease try again.`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Handle cancel
  bot.action(/^contribute_cancel:(.+):(.+)$/, async (ctx) => {
    const [, chatId, requestUserId] = ctx.match;
    const clickUserId = ctx.from.id.toString();

    if (clickUserId !== requestUserId) {
      return ctx.answerCbQuery("⚠️ Only you can cancel this.", {
        show_alert: true,
      });
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      "❌ Cancelled.\n\nUse /contribute when ready.",
      { parse_mode: "Markdown" }
    );
  });

  // ========== MY SHARES ==========
  bot.command("myshares", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      // ✅ Check wallet exists
      const walletCheck = await apiService.checkUserWallet(userId);
      if (!walletCheck.hasWallet) {
        return ctx.reply(
          "❌ You need to create a wallet first!\n\n" +
            "Send /start to the bot in private chat.",
          { parse_mode: "Markdown" }
        );
      }

      const response = await contributionService.getUserFundContribution({
        groupId: chatId,
        telegramId: userId,
      });

      if (!response?.data) {
        return ctx.reply(
          "You haven't contributed yet.\n\nUse /contribute to join!",
          { parse_mode: "Markdown" }
        );
      }

      const { userPosition, fundInfo } = response.data;
      const profitSign = userPosition.profitLoss >= 0 ? "+" : "";
      const profitEmoji = userPosition.profitLoss >= 0 ? "📈" : "📉";

      ctx.reply(
        `📊 **Your Position**\n\n` +
          `**fund Name:${fundInfo.fundName}**\n` +
          `Shares: ${userPosition.shares}\n` +
          `Value: ${userPosition.currentValueSol.toFixed(4)} SOL\n` +
          `Ownership: ${userPosition.ownershipPercentage}%\n\n` +
          `${profitEmoji} P/L: ${profitSign}${userPosition.profitLossSol.toFixed(4)} SOL (${profitSign}${userPosition.profitLossPercentage}%)\n\n` +
          `Contributed: ${userPosition.totalContributedSol.toFixed(4)} SOL (${userPosition.numberOfContributions}x)`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Error fetching shares:", error);
      ctx.reply("You haven't contributed yet.\n\nUse /contribute to join!");
    }
  });

  // ========== MY CONTRIBUTIONS ==========
  bot.command("mycontributions", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      const response = await contributionService.getUserFundContribution({
        groupId: chatId,
        telegramId: userId,
      });

      if (!response?.data || response.data.contributions.length === 0) {
        return ctx.reply("You haven't contributed yet.\n\nUse /contribute to join!");
      }

      const contributions = response.data.contributions;
      const summary = response.data.summary;
      const recent = contributions.slice(0, 5);

      let message = `📜 **Your History**\n\n`;
      message += `Total: ${Number(summary.totalAmountSol).toFixed(4)} SOL (${summary.totalContributions}x)\n`;
      message += `Shares: ${summary.totalShares}\n\n`;

      recent.forEach((c: any, i: number) => {
        const date = new Date(c.createdAt).toLocaleDateString();
        message += `${i + 1}. ${Number(c.amountSol).toFixed(4)} SOL → ${c.sharesMinted} shares\n`;
        message += `   ${date}\n\n`;
      });

      if (contributions.length > 5) {
        message += `_...and ${contributions.length - 5} more_`;
      }

      ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error fetching contributions:", error);
      ctx.reply("❌ Could not fetch your history.");
    }
  });

  // ========== MY FUNDS ==========
  bot.command("myfunds", async (ctx) => {
    const userId = ctx.from.id.toString();

    try {
      const response = await contributionService.getContributionsByUser(userId);

      if (!response?.data || response.data.length === 0) {
        return ctx.reply("You haven't contributed to any funds yet.");
      }

      const contributions = response.data;
      const summary = response.summary;

      // Group by fund
      const fundMap = new Map();
      contributions.forEach((c: any) => {
        if (!fundMap.has(c.groupId)) {
          fundMap.set(c.groupId, {
            fundName: c.fundName,
            status: c.fundStatus,
            totalAmount: 0,
            totalShares: 0,
            count: 0,
          });
        }
        const fund = fundMap.get(c.groupId);
        fund.totalAmount += Number(c.amountSol);
        fund.totalShares += parseFloat(c.sharesMinted);
        fund.count += 1;
      });

      let message = `🏦 **Your Portfolio**\n\n`;
      message += `Total: ${Number(summary.totalAmountSol).toFixed(4)} SOL\n`;
      message += `Funds: ${summary.fundsContributedTo}\n\n`;

      let index = 1;
      fundMap.forEach((fund) => {
        const statusEmoji = fund.status === "ACTIVE" ? "🟢" : fund.status === "PAUSED" ? "🟡" : "🔴";
        message += `${index}. ${fund.fundName} ${statusEmoji}\n`;
        message += `   ${fund.totalAmount.toFixed(4)} SOL · ${fund.totalShares.toFixed(2)} shares\n\n`;
        index++;
      });

      ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error fetching funds:", error);
      ctx.reply("❌ Could not fetch your portfolio.");
    }
  });

  // ========== CONTRIBUTORS ==========
  bot.command("contributors", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      const response = await contributionService.getContributionsByFund({
        groupId: chatId,
        page: 1,
        limit: 100,
      });

      if (!response?.data || response.data.length === 0) {
        return ctx.reply("No contributors yet.");
      }

      const contributions = response.data;
      const summary = response.summary;
      const contributorMap = new Map();

      contributions.forEach((c: any) => {
        const key = c.contributorTelegramId;
        if (!contributorMap.has(key)) {
          contributorMap.set(key, {
            telegramId: c.contributorTelegramId,
            totalAmount: 0,
            totalShares: 0,
            count: 0,
          });
        }
        const contributor = contributorMap.get(key);
        contributor.totalAmount += Number(c.amountSol);
        contributor.totalShares += parseFloat(c.sharesMinted);
        contributor.count += 1;
      });

      const sorted = Array.from(contributorMap.values()).sort(
        (a, b) => b.totalAmount - a.totalAmount
      );

      let message = `👥 **Contributors**\n\n`;
      message += `Total: ${Number(summary.totalAmountSol).toFixed(2)} SOL\n`;
      message += `Members: ${sorted.length}\n\n`;

      sorted.slice(0, 10).forEach((c, i) => {
        message += `${i + 1}. [User](tg://user?id=${c.telegramId})\n`;
        message += `   ${c.totalAmount.toFixed(4)} SOL · ${c.totalShares.toFixed(2)} shares\n\n`;
      });

      if (sorted.length > 10) {
        message += `_...and ${sorted.length - 10} more_`;
      }

      ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error fetching contributors:", error);
      ctx.reply("❌ Could not fetch contributors.");
    }
  });

  // ========== HELP ==========
  bot.command("contributehelp", async (ctx) => {
    ctx.reply(
      "💰 **How to Contribute**\n\n" +
        "1. Create a wallet: /start (in private chat)\n" +
        "2. Contribute: `/contribute 0.5` (in group)\n" +
        "3. View position: /myshares\n\n" +
        "**What are shares?**\n" +
        "Shares represent your ownership percentage in the fund. " +
        "As the fund grows from successful trades, your shares become more valuable.\n\n" +
        "**Commands:**\n" +
        "• /myshares - Your position\n" +
        "• /mycontributions - History\n" +
        "• /myfunds - All portfolios\n" +
        "• /contributors - Fund members",
      { parse_mode: "Markdown" }
    );
  });
}
