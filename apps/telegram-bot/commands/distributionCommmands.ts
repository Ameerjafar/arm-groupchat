import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";
import { DistributionApiService } from "../api/distribtuionApi";
import { prisma } from "@repo/db";

const distributionApi = new DistributionApiService();

export function registerDistributionCommands(bot: Telegraf<MyContext>) {
  
  // ========== MY VALUE ==========
  bot.command("myvalue", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user?.walletAddress) {
        return ctx.reply("🔐 Create a wallet first: /start");
      }

      await ctx.reply("⏳ Calculating...");

      const response = await distributionApi.calculateDistribution(
        chatId,
        user.walletAddress
      );

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const d = response.data;
      const statusEmoji = d.status === "PROFIT" ? "📈" : d.status === "LOSS" ? "📉" : "➖";

      const message =
        `${statusEmoji} **Your Position**\n\n` +
        `**Holdings:**\n` +
        `${d.shares} shares (${d.sharePercentage.toFixed(2)}%)\n` +
        `Current value: ${d.currentValueSOL.toFixed(4)} SOL\n` +
        `Initial: ${d.initialContributionSOL.toFixed(4)} SOL\n\n` +
        `${statusEmoji} ${d.status}: ${Math.abs(d.profitOrLossSOL).toFixed(4)} SOL\n\n` +
        `**If you withdraw now:**\n` +
        `Fee: ${d.tradingFeeSOL.toFixed(4)} SOL\n` +
        `You get: **${d.distributionAmountSOL.toFixed(4)} SOL**\n\n` +
        `• /cashout - Exit completely\n` +
        `• /claimprofits - Take profits only`;

      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Error checking value:", error);
      await ctx.reply(`❌ ${error.message}`);
    }
  });

  // ========== CASH OUT ==========
  bot.command("cashout", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user?.walletAddress) {
        return ctx.reply("🔐 Create a wallet first: /start");
      }

      // Calculate first
      const calcResponse = await distributionApi.calculateDistribution(
        chatId,
        user.walletAddress
      );

      if (!calcResponse.success) {
        return ctx.reply(`❌ ${calcResponse.error}`);
      }

      const d = calcResponse.data;

      if (d.distributionAmountSOL <= 0) {
        return ctx.reply("❌ No value to withdraw.");
      }

      const statusEmoji = d.status === "PROFIT" ? "📈" : d.status === "LOSS" ? "📉" : "➖";

      // Show confirmation
      await ctx.reply(
        `⚠️ **Confirm Cash Out**\n\n` +
          `${d.shares} shares → ${d.distributionAmountSOL.toFixed(4)} SOL\n` +
          `${statusEmoji} ${d.status}: ${Math.abs(d.profitOrLossSOL).toFixed(4)} SOL\n` +
          `Fee: ${d.tradingFeeSOL.toFixed(4)} SOL\n\n` +
          `**This will burn all your shares!**\n\n` +
          `Processing...`,
        { parse_mode: "Markdown" }
      );

      // Execute
      const response = await distributionApi.cashOut(chatId, userId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const result = response.data;

      await ctx.reply(
        `✅ **Cash Out Complete**\n\n` +
          `Received: ${result.distributionAmountSOL.toFixed(4)} SOL\n` +
          `Result: ${result.status}\n\n` +
          `Your shares have been burned.\n` +
          `Check your wallet! 💰`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Cash out error:", error);

      let msg = "❌ Withdrawal failed.";
      if (error.response?.data?.error?.includes("Insufficient funds")) {
        msg = "❌ Fund balance too low.";
      } else if (error.response?.data?.error?.includes("not active")) {
        msg = "❌ Fund is paused.";
      }

      await ctx.reply(`${msg}\n\n${error.response?.data?.error || error.message}`);
    }
  });

  // ========== CLAIM PROFITS ==========
  bot.command("claimprofits", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user?.walletAddress) {
        return ctx.reply("🔐 Create a wallet first: /start");
      }

      // Calculate profit
      const calcResponse = await distributionApi.calculateProfit(
        chatId,
        user.walletAddress
      );

      if (!calcResponse.success) {
        return ctx.reply(`❌ ${calcResponse.error}`);
      }

      const p = calcResponse.data;

      if (p.netProfitSOL <= 0) {
        return ctx.reply(
          `📊 **No Profits Yet**\n\n` +
            `Shares: ${p.shares} (${p.sharePercentage.toFixed(2)}%)\n` +
            `Value: ${p.currentValueSOL.toFixed(4)} SOL\n` +
            `Initial: ${p.initialContributionSOL.toFixed(4)} SOL\n\n` +
            `Keep growing the fund! 📈`,
          { parse_mode: "Markdown" }
        );
      }

      await ctx.reply(
        `💰 **Claim ${p.netProfitSOL.toFixed(4)} SOL?**\n\n` +
          `Gross profit: ${p.grossProfitSOL.toFixed(4)} SOL\n` +
          `Fee: ${p.feeSOL.toFixed(4)} SOL\n` +
          `Net: ${p.netProfitSOL.toFixed(4)} SOL\n\n` +
          `✅ Your ${p.shares} shares stay invested.\n\n` +
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
        `✅ **Profits Claimed**\n\n` +
          `Received: ${result.netProfitSOL.toFixed(4)} SOL\n` +
          `Shares kept: ${p.shares}\n\n` +
          `Still invested! 🚀`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Claim error:", error);

      let msg = "❌ Claim failed.";
      if (error.response?.data?.error?.includes("No profit")) {
        msg = "❌ No profits available.";
      }

      await ctx.reply(`${msg}\n\n${error.response?.data?.error || error.message}`);
    }
  });

  // ========== CASH OUT ALL (Admin) ==========
  bot.command("cashoutall", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    try {
      await ctx.reply("⏳ Processing cash-out for all members...");

      const response = await distributionApi.cashOutAll(chatId, userId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const { results, summary } = response.data;

      let totalDist = BigInt(0);
      let totalProfit = BigInt(0);
      let totalLoss = BigInt(0);

      for (const r of results) {
        if (r.success && r.distributionAmount) {
          totalDist += BigInt(r.distributionAmount);
          const pl = BigInt(r.profitOrLoss || "0");
          if (pl > BigInt(0)) totalProfit += pl;
          else totalLoss += pl;
        }
      }

      let msg = `✅ **Mass Cash-Out Complete**\n\n`;
      msg += `Success: ${summary.successful} | Failed: ${summary.failed}\n\n`;
      msg += `**Total: ${(Number(totalDist) / 1e9).toFixed(4)} SOL**\n`;
      msg += `Profit: ${(Number(totalProfit) / 1e9).toFixed(4)} SOL\n`;
      msg += `Loss: ${(Math.abs(Number(totalLoss)) / 1e9).toFixed(4)} SOL\n\n`;
      msg += `**Top Members:**\n`;

      for (const r of results.slice(0, 8)) {
        if (r.success) {
          const amt = r.distributionAmount ? (Number(r.distributionAmount) / 1e9).toFixed(4) : "0";
          msg += `✅ User ${r.telegramId.slice(-4)}: ${amt} SOL\n`;
        } else {
          msg += `❌ User ${r.telegramId.slice(-4)}: Failed\n`;
        }
      }

      if (results.length > 8) {
        msg += `\n...${results.length - 8} more`;
      }

      await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Mass cash-out error:", error);
      await ctx.reply(`❌ ${error.response?.data?.error || error.message}`);
    }
  });

  // ========== ALL VALUES (Admin) ==========
  bot.command("allvalues", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    try {
      await ctx.reply("⏳ Loading...");

      const response = await distributionApi.getAllMembersInfo(chatId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const members = response.data;

      if (members.length === 0) {
        return ctx.reply("📊 No active members.");
      }

      let msg = `📊 **Fund Overview**\n\n`;

      let totalVal = BigInt(0);
      let totalProfit = BigInt(0);
      let totalLoss = BigInt(0);

      for (const m of members.slice(0, 10)) {
        const d = m.distributionInfo;
        totalVal += BigInt(d.distributionAmount);

        let emoji = "➖";
        if (d.status === "PROFIT") {
          emoji = "📈";
          totalProfit += BigInt(d.profitOrLoss);
        } else if (d.status === "LOSS") {
          emoji = "📉";
          totalLoss += BigInt(d.profitOrLoss);
        }

        msg += `${emoji} User ${m.telegramId.slice(-4)}\n`;
        msg += `   ${d.shares} shares (${d.sharePercentage.toFixed(1)}%)\n`;
        msg += `   ${d.distributionAmountSOL.toFixed(4)} SOL\n\n`;
      }

      if (members.length > 10) {
        msg += `_...${members.length - 10} more_\n\n`;
      }

      msg += `**Total Value: ${(Number(totalVal) / 1e9).toFixed(4)} SOL**\n`;
      msg += `Profit: ${(Number(totalProfit) / 1e9).toFixed(4)} SOL\n`;
      msg += `Loss: ${(Math.abs(Number(totalLoss)) / 1e9).toFixed(4)} SOL`;

      await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Error fetching values:", error);
      await ctx.reply(`❌ ${error.response?.data?.error || error.message}`);
    }
  });

  // ========== MY HISTORY ==========
  bot.command("myhistory", async (ctx) => {
    const userId = ctx.from.id.toString();
    const chatId = ctx.chat?.id.toString();

    try {
      const response = await distributionApi.getDistributionHistory(userId, chatId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const dists = response.data;

      if (dists.length === 0) {
        return ctx.reply("📊 No withdrawal history.");
      }

      let msg = `📜 **Your Withdrawals**\n\n`;

      for (const d of dists.slice(0, 8)) {
        const date = new Date(d.distributedAt).toLocaleDateString();
        const emoji = d.type === "FULL_CASHOUT" ? "💰" : "💸";
        const plSign = d.profitOrLossSOL >= 0 ? "+" : "";

        msg += `${emoji} ${d.amountSOL.toFixed(4)} SOL\n`;
        msg += `   ${date} · ${plSign}${d.profitOrLossSOL.toFixed(4)} SOL\n\n`;
      }

      if (dists.length > 8) {
        msg += `_...${dists.length - 8} more_`;
      }

      await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("History error:", error);
      await ctx.reply(`❌ ${error.response?.data?.error || error.message}`);
    }
  });

  // ========== FUND STATS (Admin) ==========
  bot.command("fundstats", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    try {
      const response = await distributionApi.getFundStats(chatId);

      if (!response.success) {
        return ctx.reply(`❌ ${response.error}`);
      }

      const s = response.data;

      const lastDist = s.lastDistribution
        ? new Date(s.lastDistribution).toLocaleDateString()
        : "Never";

      const msg =
        `📊 **Distribution Stats**\n\n` +
        `Total: ${s.totalDistributedSOL.toFixed(4)} SOL\n` +
        `Count: ${s.totalDistributions}\n\n` +
        `Profit: ${s.totalProfitSOL.toFixed(4)} SOL\n` +
        `Loss: ${s.totalLossSOL.toFixed(4)} SOL\n\n` +
        `Cash-outs: ${s.cashOutCount}\n` +
        `Profit claims: ${s.profitClaimCount}\n\n` +
        `Last: ${lastDist}`;

      await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Stats error:", error);
      await ctx.reply(`❌ ${error.response?.data?.error || error.message}`);
    }
  });
}
