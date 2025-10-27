import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";
import { FundService } from "../services/fundService";
import { WalletService } from "../services/walletService";
import { ContributionService } from "../services/contributionService";

export function registerContributorCommands(bot: Telegraf<MyContext>) {
  const fundService = new FundService();
  const walletService = new WalletService();
  const contributionService = new ContributionService(); // ✅ Changed from ContributorApiService

  bot.command("contribute", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(" ");

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.\n\n" +
          "Join a group with an active fund to contribute.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      const walletCheck = await walletService.checkWallet(userId);
      if (!walletCheck.hasWallet) {
        return ctx.reply(
          "⚠️ **Wallet Required**\n\n" +
            "You need a wallet before contributing.\n\n" +
            "👉 Send /start to me in **private chat** to create your wallet.",
          { parse_mode: "Markdown" }
        );
      }

      // Check if fund exists and get info
      const fundExists = await fundService.checkFundExists(chatId);

      if (!fundExists) {
        return ctx.reply(
          "⚠️ **No Fund Found**\n\n" +
            "This group doesn't have a fund yet.\n" +
            "Ask an admin to use /initfund to create one."
        );
      }

      const fund = await fundService.getFundInfo(chatId);
      const fundData = fund.data;

      if (fundData.status !== "ACTIVE") {
        return ctx.reply(
          `⚠️ **Fund is ${fundData.status}**\n\n` +
            "Contributions are currently not allowed.",
          { parse_mode: "Markdown" }
        );
      }

      // Check if amount is provided
      if (args.length < 2) {
        return ctx.reply(
          "💰 **How to Contribute**\n\n" +
            `Usage: \`/contribute <amount>\`\n\n` +
            `Example: \`/contribute 0.5\`\n\n` +
            `**Fund Details:**\n` +
            `📌 Fund: ${fundData.fundName}\n` +
            `💵 Min Contribution: ${Number(fundData.minContributionSol).toFixed(2)} SOL\n` +
            `💰 Current Balance: ${Number(fundData.balanceSol).toFixed(2)} SOL\n` +
            `📊 Trading Fee: ${fundData.tradingFeeBps / 100}%\n\n` +
            `Please specify the amount in SOL you want to contribute.`,
          { parse_mode: "Markdown" }
        );
      }
      const amount = parseFloat(args[1]!);

      if (isNaN(amount) || amount <= 0) {
        return ctx.reply(
          "❌ **Invalid Amount**\n\n" +
            "Please provide a valid number greater than 0.\n\n" +
            `Example: \`/contribute 0.5\``,
          { parse_mode: "Markdown" }
        );
      }

      const minContribution = Number(fundData.minContributionSol);
      if (amount < minContribution) {
        return ctx.reply(
          `❌ **Below Minimum**\n\n` +
            `Minimum contribution: ${minContribution.toFixed(2)} SOL\n` +
            `Your amount: ${amount.toFixed(2)} SOL\n\n` +
            `Please contribute at least ${minContribution.toFixed(2)} SOL.`,
          { parse_mode: "Markdown" }
        );
      }

      // Confirm contribution
      await ctx.reply(
        `💰 **Confirm Contribution**\n\n` +
          `Amount: ${amount.toFixed(4)} SOL\n` +
          `Fund: ${fundData.fundName}\n` +
          `Trading Fee: ${fundData.tradingFeeBps / 100}%\n\n` +
          `Click below to confirm your contribution:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Confirm Contribution",
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
      ctx.reply("❌ Could not process request. Please try again.");
    }
  });

  // Handle contribution confirmation
  bot.action(/^contribute_confirm:(.+):(.+):(.+)$/, async (ctx) => {
    const [, chatId, requestUserId, amountStr] = ctx.match;
    const clickUserId = ctx.from.id.toString();
    const amount = parseFloat(amountStr!);

    if (clickUserId !== requestUserId) {
      return ctx.answerCbQuery(
        "⚠️ Only the person who initiated can confirm.",
        { show_alert: true }
      );
    }

    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        "⏳ **Processing Contribution...**\n\n" +
          `Amount: ${amount.toFixed(4)} SOL\n\n` +
          "Please wait while we process your transaction...",
        { parse_mode: "Markdown" }
      );

      // ✅ Call contribution service with proper method
      const data = await contributionService.createContribution({
        groupId: chatId as string,
        telegramId: requestUserId,
        amountSol: amount,
      });

      await ctx.editMessageText(
        `✅ **Contribution Successful!**\n\n` +
          `💰 Amount: ${data.data.amountSol} SOL\n` +
          `📈 Shares Received: ${data.data.sharesMinted}\n` +
          `💵 New Fund Balance: ${data.data.fundBalanceSol.toFixed(2)} SOL\n\n` +
          `🔗 [View Transaction](https://solscan.io/tx/${data.data.transactionSignature}?cluster=devnet)\n\n` +
          `Use /myshares to view your position!`,
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );
    } catch (error: any) {
      console.error("Contribution error:", error);
      await ctx.editMessageText(
        `❌ **Contribution Failed**\n\n` +
          `${error.message || "Unknown error occurred"}\n\n` +
          `Please try again or contact support.`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Handle contribution cancel
  bot.action(/^contribute_cancel:(.+):(.+)$/, async (ctx) => {
    const [, chatId, requestUserId] = ctx.match;
    const clickUserId = ctx.from.id.toString();

    if (clickUserId !== requestUserId) {
      return ctx.answerCbQuery("⚠️ Only the person who initiated can cancel.", {
        show_alert: true,
      });
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      "❌ **Contribution Cancelled**\n\n" +
        "Your contribution was not processed.\n\n" +
        "Use /contribute again when you're ready.",
      { parse_mode: "Markdown" }
    );
  });

  bot.command("myshares", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();
  
    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.",
        { parse_mode: "Markdown" }
      );
    }
  
    try {
      // ✅ Call getMyShares method (add this to your ContributionService)
      const response = await contributionService.getUserFundContribution({
        groupId: chatId,
        telegramId: userId,
      });
  
      if (!response || !response.data) {
        return ctx.reply(
          "⚠️ **No Position Found**\n\n" +
            "You haven't contributed to this fund yet.\n" +
            "Use /contribute to join!",
          { parse_mode: "Markdown" }
        );
      }
  
      // ✅ Correct: Use userPosition and fundInfo from response
      const { userPosition, fundInfo } = response.data;
  
      const profitEmoji = userPosition.profitLoss >= 0 ? "📈" : "📉";
      const profitColor = userPosition.profitLoss >= 0 ? "+" : "";
  
      ctx.reply(
        `👤 **Your Position in ${fundInfo.fundName}**\n\n` +
          `**Your Holdings:**\n` +
          `📈 Shares: ${userPosition.shares}\n` +
          `💰 Contributed: ${userPosition.totalContributedSol.toFixed(4)} SOL\n` +
          `💵 Current Value: ${userPosition.currentValueSol.toFixed(4)} SOL\n` +
          `📊 Ownership: ${userPosition.ownershipPercentage}%\n` +
          `📝 Contributions: ${userPosition.numberOfContributions}\n\n` +
          `**Performance:**\n` +
          `${profitEmoji} P/L: ${profitColor}${userPosition.profitLossSol.toFixed(4)} SOL (${profitColor}${userPosition.profitLossPercentage}%)\n\n` +
          `**Fund Overview:**\n` +
          `💼 Total Balance: ${fundInfo.totalBalanceSol.toFixed(2)} SOL\n` +
          `👥 Contributors: ${fundInfo.totalContributors}\n` +
          `📊 Total Shares: ${fundInfo.totalShares}\n` +
          `🟢 Status: ${fundInfo.status}\n\n` +
          `Use /contribute to add more!`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Error fetching shares:", error);
      ctx.reply(
        "⚠️ **No Position Found**\n\n" +
          "You haven't contributed to this fund yet.\n" +
          "Use /contribute to join!"
      );
    }
  });
  

  bot.command("mycontributions", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.\n\n" +
          "Use this in a group to view your contribution history.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      // ✅ Use ContributionService method
      const response = await contributionService.getUserFundContribution({
        groupId: chatId,
        telegramId: userId,
      });

      if (!response || !response.data || response.data.contributions.length === 0) {
        return ctx.reply(
          "⚠️ **No Contributions Found**\n\n" +
            "You haven't contributed to this fund yet.\n" +
            "Use /contribute to join!",
          { parse_mode: "Markdown" }
        );
      }

      const contributions = response.data.contributions;
      const summary = response.data.summary;

      const recentContributions = contributions.slice(0, 5);

      let message = `📜 **Your Contribution History**\n\n`;
      message += `💰 Total: ${Number(summary.totalAmountSol).toFixed(4)} SOL\n`;
      message += `📈 Shares: ${summary.totalShares}\n`;
      message += `📊 Contributions: ${summary.totalContributions}\n\n`;
      message += `**Recent Contributions:**\n\n`;

      recentContributions.forEach((c: any, i: number) => {
        const date = new Date(c.createdAt).toLocaleDateString();
        message += `${i + 1}. ${Number(c.amountSol).toFixed(4)} SOL → ${c.sharesMinted} shares\n`;
        message += `   📅 ${date}\n`;
        message += `   🔗 [View Tx](https://solscan.io/tx/${c.transactionSignature}?cluster=devnet)\n\n`;
      });

      if (contributions.length > 5) {
        message += `_...and ${contributions.length - 5} more_\n\n`;
      }

      message += `Use \`/contribute <amount>\` to add more!`;

      ctx.reply(message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    } catch (error) {
      console.error("Error fetching contributions:", error);
      ctx.reply("❌ Could not fetch your contribution history.");
    }
  });

  bot.command("myfunds", async (ctx) => {
    const userId = ctx.from.id.toString();

    try {
      // ✅ Use ContributionService method
      const response = await contributionService.getContributionsByUser(userId);

      if (!response || !response.data || response.data.length === 0) {
        return ctx.reply(
          "⚠️ **No Contributions Found**\n\n" +
            "You haven't contributed to any funds yet.",
          { parse_mode: "Markdown" }
        );
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

      let message = `🏦 **Your Funds Portfolio**\n\n`;
      message += `💰 Total Invested: ${Number(summary.totalAmountSol).toFixed(4)} SOL\n`;
      message += `📈 Total Shares: ${summary.totalSharesEarned}\n`;
      message += `📊 Funds: ${summary.fundsContributedTo}\n\n`;

      let index = 1;
      fundMap.forEach((fund, groupId) => {
        const statusEmoji =
          fund.status === "ACTIVE" ? "🟢" : fund.status === "PAUSED" ? "🟡" : "🔴";
        message += `${index}. **${fund.fundName}** ${statusEmoji}\n`;
        message += `   💰 ${fund.totalAmount.toFixed(4)} SOL (${fund.count} contributions)\n`;
        message += `   📈 ${fund.totalShares.toFixed(2)} shares\n\n`;
        index++;
      });

      ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error fetching user funds:", error);
      ctx.reply("❌ Could not fetch your funds portfolio.");
    }
  });

  bot.command("contributors", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ This command only works in **group chats**.", {
        parse_mode: "Markdown",
      });
    }

    try {
      // ✅ Use ContributionService method
      const response = await contributionService.getContributionsByFund({
        groupId: chatId,
        page: 1,
        limit: 100,
      });

      if (!response || !response.data || response.data.length === 0) {
        return ctx.reply(
          "⚠️ **No Contributors Found**\n\n" +
            "This fund doesn't have any contributors yet.",
          { parse_mode: "Markdown" }
        );
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

      const sortedContributors = Array.from(contributorMap.values()).sort(
        (a, b) => b.totalAmount - a.totalAmount
      );

      let message = `👥 **Fund Contributors**\n\n`;
      message += `💰 Total Funds: ${Number(summary.totalAmountSol).toFixed(2)} SOL\n`;
      message += `📊 Total Contributions: ${summary.totalContributions}\n`;
      message += `👤 Contributors: ${sortedContributors.length}\n\n`;

      sortedContributors.slice(0, 10).forEach((c, i) => {
        message += `${i + 1}. [User](tg://user?id=${c.telegramId})\n`;
        message += `   💰 ${c.totalAmount.toFixed(4)} SOL (${c.count}x)\n`;
        message += `   📈 ${c.totalShares.toFixed(2)} shares\n\n`;
      });

      if (sortedContributors.length > 10) {
        message += `_...and ${sortedContributors.length - 10} more_`;
      }

      ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error fetching contributors:", error);
      ctx.reply("❌ Could not fetch contributors list.");
    }
  });

  bot.command("contributehelp", async (ctx) => {
    ctx.reply(
      "💰 **Contribution Guide**\n\n" +
        "*How to Contribute:*\n" +
        "1. Ensure you have a wallet (/start in private chat)\n" +
        "2. Use `/contribute <amount>` in the group\n" +
        "3. Example: `/contribute 0.5` (for 0.5 SOL)\n" +
        "4. Confirm the transaction\n" +
        "5. You'll receive shares proportional to your contribution\n\n" +
        "*Commands:*\n" +
        "• `/contribute <amount>` - Make a contribution\n" +
        "• `/myshares` - View your current position\n" +
        "• `/mycontributions` - See your contribution history\n" +
        "• `/myfunds` - View all funds you've contributed to\n" +
        "• `/contributors` - See all fund contributors\n" +
        "• `/contributehelp` - Show this guide\n\n" +
        "*Shares Explained:*\n" +
        "Shares represent your ownership in the fund. When you contribute, you receive shares based on the fund's current value. Your shares can grow as the fund makes successful trades!\n\n" +
        "*Questions?*\n" +
        "Contact the group admin or use /fundinfo for fund details.",
      { parse_mode: "Markdown" }
    );
  });
}
