// commands/distributionCommands.ts
import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";
import { DistributionApiService } from "../services/distribtuionApiService";
import { prisma } from "@repo/db";

const distributionApi = new DistributionApiService();

export function registerDistributionCommands(bot: Telegraf<MyContext>) {
  bot.command("myvalue", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    try {
      await ctx.reply("🔍 Calculating your current value...");

      // Get user info first
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user || !user.walletAddress) {
        return ctx.reply("❌ You don't have a wallet. Use /start first.");
      }

      const response = await distributionApi.calculateDistribution(
        chatId,
        user.walletAddress
      );

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const distInfo = response.data;
      let statusEmoji = "🟡";
      if (distInfo.status === "PROFIT") statusEmoji = "🟢";
      if (distInfo.status === "LOSS") statusEmoji = "🔴";

      const message =
        `${statusEmoji} *Your Fund Value* ${statusEmoji}\n\n` +
        `*Position:*\n` +
        `Your Shares: ${distInfo.shares}\n` +
        `Total Shares: ${distInfo.totalShares}\n` +
        `Share %: ${distInfo.sharePercentage.toFixed(2)}%\n\n` +
        `*Value:*\n` +
        `Initial: ${distInfo.initialContributionSOL.toFixed(4)} SOL\n` +
        `Current: ${distInfo.currentValueSOL.toFixed(4)} SOL\n` +
        `${distInfo.status}: ${Math.abs(distInfo.profitOrLossSOL).toFixed(
          4
        )} SOL\n\n` +
        `*Cash-Out Amount:*\n` +
        `Trading Fee: ${distInfo.tradingFeeSOL.toFixed(4)} SOL\n` +
        `You'd Receive: *${distInfo.distributionAmountSOL.toFixed(
          4
        )} SOL*\n\n` +
        `Commands:\n` +
        `• /cashout - Withdraw everything (burns shares)\n` +
        `• /claimprofits - Claim profits only (keeps shares)`;

      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Error checking value:", error);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  });

  /**
   * Command to cash out completely (burn all shares)
   */
  bot.command("cashout", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user || !user.walletAddress) {
        return ctx.reply("❌ You don't have a wallet.");
      }

      // First calculate to show preview
      const calcResponse = await distributionApi.calculateDistribution(
        chatId,
        user.walletAddress
      );

      if (!calcResponse.success) {
        return ctx.reply(`❌ ${calcResponse.error}`);
      }

      const distInfo = calcResponse.data;

      if (distInfo.distributionAmountSOL <= 0) {
        return ctx.reply("❌ No value to cash out.");
      }

      let statusEmoji = distInfo.status === "PROFIT" ? "📈" : "📉";
      if (distInfo.status === "BREAK-EVEN") statusEmoji = "➖";

      await ctx.reply(
        `${statusEmoji} *Cash Out Summary*\n\n` +
          `Shares to Burn: ${distInfo.shares}\n` +
          `Initial: ${distInfo.initialContributionSOL.toFixed(4)} SOL\n` +
          `Current: ${distInfo.currentValueSOL.toFixed(4)} SOL\n` +
          `${distInfo.status}: ${Math.abs(distInfo.profitOrLossSOL).toFixed(
            4
          )} SOL\n` +
          `Fee: ${distInfo.tradingFeeSOL.toFixed(4)} SOL\n\n` +
          `*You'll Receive: ${distInfo.distributionAmountSOL.toFixed(
            4
          )} SOL*\n\n` +
          `⚠️ This will burn all your shares!\n\n` +
          `Processing...`,
        { parse_mode: "Markdown" }
      );

      // Execute cash out
      const response = await distributionApi.cashOut(chatId, userId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const result = response.data;

      await ctx.reply(
        `✅ *Cash Out Complete!*\n\n` +
          `Amount: ${result.distributionAmountSOL.toFixed(4)} SOL\n` +
          `Result: ${result.status}\n` +
          `Transaction: \`${result.txSignature}\`\n\n` +
          `Your shares have been burned. Check your wallet! 💰`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Error cashing out:", error);

      let errorMessage = "❌ Failed to cash out.";
      if (error.response?.data?.error?.includes("Insufficient funds")) {
        errorMessage = "❌ Fund doesn't have enough balance.";
      } else if (
        error.response?.data?.error?.includes("Fund is not active")
      ) {
        errorMessage = "❌ Fund is currently paused.";
      }

      await ctx.reply(
        `${errorMessage}\n\nError: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  });

  /**
   * Command to claim profits only (keeps shares)
   */
  bot.command("claimprofits", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user || !user.walletAddress) {
        return ctx.reply("❌ You don't have a wallet.");
      }

      // Calculate profit first
      const calcResponse = await distributionApi.calculateProfit(
        chatId,
        user.walletAddress
      );

      if (!calcResponse.success) {
        return ctx.reply(`❌ ${calcResponse.error}`);
      }

      const profitInfo = calcResponse.data;

      if (profitInfo.netProfitSOL <= 0) {
        return ctx.reply(
          `📊 *No Profits Yet*\n\n` +
            `Your Shares: ${profitInfo.shares}\n` +
            `Share %: ${profitInfo.sharePercentage.toFixed(2)}%\n` +
            `Current Value: ${profitInfo.currentValueSOL.toFixed(4)} SOL\n` +
            `Initial: ${profitInfo.initialContributionSOL.toFixed(
              4
            )} SOL\n\n` +
            `Keep trading to generate profits! 📈`,
          { parse_mode: "Markdown" }
        );
      }

      await ctx.reply(
        `💰 *Profit Claim*\n\n` +
          `Gross Profit: ${profitInfo.grossProfitSOL.toFixed(4)} SOL\n` +
          `Fee (${profitInfo.tradingFeeBps} bps): ${profitInfo.feeSOL.toFixed(
            4
          )} SOL\n` +
          `*Net Profit: ${profitInfo.netProfitSOL.toFixed(4)} SOL*\n\n` +
          `✅ Your shares will remain intact!\n\n` +
          `Processing...`,
        { parse_mode: "Markdown" }
      );

      // Execute claim
      const response = await distributionApi.claimProfit(chatId, userId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const result = response.data;

      await ctx.reply(
        `✅ *Profits Claimed!*\n\n` +
          `Amount: ${result.netProfitSOL.toFixed(4)} SOL\n` +
          `Shares Retained: ${profitInfo.shares}\n` +
          `Transaction: \`${result.txSignature}\`\n\n` +
          `You're still invested! 🚀`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Error claiming profits:", error);

      let errorMessage = "❌ Failed to claim profits.";
      if (error.response?.data?.error?.includes("No profit")) {
        errorMessage = "❌ No profits available yet.";
      }

      await ctx.reply(
        `${errorMessage}\n\nError: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  });

  /**
   * Command for fund authority to cash out all members
   */
  bot.command("cashoutall", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    try {
      await ctx.reply("🔄 Starting cash-out for all members...");

      const response = await distributionApi.cashOutAll(chatId, userId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const { results, summary } = response.data;

      let totalDistributed = BigInt(0);
      let totalProfit = BigInt(0);
      let totalLoss = BigInt(0);

      for (const r of results) {
        if (r.success && r.distributionAmount) {
          totalDistributed += BigInt(r.distributionAmount);
          const pl = BigInt(r.profitOrLoss || "0");
          if (pl > BigInt(0)) {
            totalProfit += pl;
          } else {
            totalLoss += pl;
          }
        }
      }

      let message = `📊 *Mass Cash-Out Complete*\n\n`;
      message += `✅ Success: ${summary.successful}\n`;
      message += `❌ Failed: ${summary.failed}\n\n`;
      message += `*Total Distributed: ${(Number(totalDistributed) / 1e9).toFixed(
        4
      )} SOL*\n`;
      message += `Total Profit: ${(Number(totalProfit) / 1e9).toFixed(
        4
      )} SOL\n`;
      message += `Total Loss: ${(Math.abs(Number(totalLoss)) / 1e9).toFixed(
        4
      )} SOL\n\n`;
      message += `*Member Details:*\n`;

      for (const r of results.slice(0, 10)) {
        if (r.success) {
          const amtSOL = r.distributionAmount
            ? (Number(r.distributionAmount) / 1e9).toFixed(4)
            : "0";
          message += `✅ ${r.telegramId}: ${amtSOL} SOL (${r.status})\n`;
        } else {
          message += `❌ ${r.telegramId}: ${r.error}\n`;
        }
      }

      if (results.length > 10) {
        message += `\n...and ${results.length - 10} more`;
      }

      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Error cashing out all:", error);
      await ctx.reply(
        `❌ Error: ${error.response?.data?.error || error.message}`
      );
    }
  });

  /**
   * Command to view all members' current values
   */
  bot.command("allvalues", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    try {
      await ctx.reply("🔍 Fetching all members' values...");

      const response = await distributionApi.getAllMembersInfo(chatId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const membersInfo = response.data;

      if (membersInfo.length === 0) {
        return ctx.reply("📊 No active members found.");
      }

      let message = `📊 *All Members' Values*\n\n`;

      let totalValue = BigInt(0);
      let totalProfit = BigInt(0);
      let totalLoss = BigInt(0);

      for (const memberInfo of membersInfo) {
        const distInfo = memberInfo.distributionInfo;
        totalValue += BigInt(distInfo.distributionAmount);

        let statusEmoji = "🟡";
        if (distInfo.status === "PROFIT") {
          statusEmoji = "🟢";
          totalProfit += BigInt(distInfo.profitOrLoss);
        } else if (distInfo.status === "LOSS") {
          statusEmoji = "🔴";
          totalLoss += BigInt(distInfo.profitOrLoss);
        }

        message += `${statusEmoji} *${memberInfo.telegramId}*\n`;
        message += `   Shares: ${distInfo.shares} (${distInfo.sharePercentage.toFixed(
          1
        )}%)\n`;
        message += `   Value: ${distInfo.distributionAmountSOL.toFixed(
          4
        )} SOL\n`;
        message += `   ${distInfo.status}: ${Math.abs(
          distInfo.profitOrLossSOL
        ).toFixed(4)} SOL\n\n`;
      }

      message += `*Summary:*\n`;
      message += `Total Value: ${(Number(totalValue) / 1e9).toFixed(4)} SOL\n`;
      message += `Total Profit: ${(Number(totalProfit) / 1e9).toFixed(
        4
      )} SOL\n`;
      message += `Total Loss: ${(Math.abs(Number(totalLoss)) / 1e9).toFixed(
        4
      )} SOL\n\n`;
      message += `Use /cashoutall to cash everyone out.`;

      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Error fetching all values:", error);
      await ctx.reply(
        `❌ Error: ${error.response?.data?.error || error.message}`
      );
    }
  });

  /**
   * Command to view distribution history
   */
  bot.command("myhistory", async (ctx) => {
    const userId = ctx.from.id.toString();
    const chatId = ctx.chat?.id.toString();

    try {
      await ctx.reply("🔍 Fetching your distribution history...");

      const response = await distributionApi.getDistributionHistory(
        userId,
        chatId
      );

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const distributions = response.data;

      if (distributions.length === 0) {
        return ctx.reply("📊 No distribution history found.");
      }

      let message = `📊 *Your Distribution History*\n\n`;

      for (const dist of distributions.slice(0, 10)) {
        const date = new Date(dist.distributedAt).toLocaleDateString();
        const typeEmoji = dist.type === "FULL_CASHOUT" ? "💰" : "💸";

        message += `${typeEmoji} *${dist.type}*\n`;
        message += `   Date: ${date}\n`;
        message += `   Amount: ${dist.amountSOL.toFixed(4)} SOL\n`;
        message += `   P/L: ${dist.profitOrLossSOL.toFixed(4)} SOL\n`;
        message += `   Tx: \`${dist.txSignature.slice(0, 8)}...\`\n\n`;
      }

      if (distributions.length > 10) {
        message += `\n...and ${distributions.length - 10} more`;
      }

      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Error fetching history:", error);
      await ctx.reply(
        `❌ Error: ${error.response?.data?.error || error.message}`
      );
    }
  });

  /**
   * Command to view fund distribution statistics
   */
  bot.command("fundstats", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    try {
      await ctx.reply("🔍 Fetching fund statistics...");

      const response = await distributionApi.getFundStats(chatId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const stats = response.data;

      const message =
        `📊 *Fund Distribution Statistics*\n\n` +
        `Total Distributions: ${stats.totalDistributions}\n` +
        `Total Distributed: ${stats.totalDistributedSOL.toFixed(4)} SOL\n\n` +
        `*Breakdown:*\n` +
        `Total Profit: ${stats.totalProfitSOL.toFixed(4)} SOL\n` +
        `Total Loss: ${stats.totalLossSOL.toFixed(4)} SOL\n\n` +
        `*Distribution Types:*\n` +
        `Full Cash-outs: ${stats.cashOutCount}\n` +
        `Profit Claims: ${stats.profitClaimCount}\n\n` +
        `Last Distribution: ${
          stats.lastDistribution
            ? new Date(stats.lastDistribution).toLocaleString()
            : "Never"
        }`;

      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Error fetching fund stats:", error);
      await ctx.reply(
        `❌ Error: ${error.response?.data?.error || error.message}`
      );
    }
  });
}
