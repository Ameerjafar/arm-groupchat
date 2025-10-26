import { Telegraf, Markup } from "telegraf";
import { MyContext } from "../types/context";
import { FundService } from "../services/fundService";
import { WalletService } from "../services/walletService";
import { config } from "../config/config";
import { getNoWalletMessage } from "../utils/validation";

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
            "Ask an admin to run this command."
        );
      }

      const fundExists = await fundService.checkFundExists(chatId);

      if (fundExists) {
        return ctx.reply(
          "ℹ️ **Fund Already Exists**\n\n" +
            "This group already has an active fund!\n" +
            "Use /fundinfo to view details."
        );
      }

      const walletCheck = await walletService.checkWallet(userId);

      if (!walletCheck.hasWallet) {
        return ctx.reply(
          "⚠️ **Wallet Required**\n\n" +
            "You need a wallet before creating a fund.\n\n" +
            "👉 Send /start to me in **private chat** to create your wallet first.",
          { parse_mode: "Markdown" }
        );
      }

      const webAppUrl = `${config.webAppUrl}/init-fund?groupId=${chatId}&userId=${userId}`;

      ctx.reply(
        "🏦 **Initialize Group Fund**\n\n" +
          "Click the button below to set up your group fund:",
        Markup.inlineKeyboard([
          [Markup.button.webApp("🏦 Initialize Fund", webAppUrl)],
        ])
      );
    } catch (error) {
      console.error("Error in /initfund:", error);
      ctx.reply(
        "❌ **Could not initialize fund**\n\n" +
          "Please try again or contact support if the issue continues."
      );
    }
  });

  // CONTRIBUTE Command
  bot.command("contribute", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

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

      const fundExists = await fundService.checkFundExists(chatId);

      if (!fundExists) {
        return ctx.reply(
          "⚠️ **No Fund Found**\n\n" +
            "This group doesn't have a fund yet.\n" +
            "Ask an admin to use /initfund to create one."
        );
      }

      const webAppUrl = `${config.webAppUrl}/contribute?groupId=${chatId}&userId=${userId}`;

      ctx.reply(
        "💰 **Contribute to Fund**\n\n" +
          "Click the button below to make your contribution:",
        Markup.inlineKeyboard([
          [Markup.button.webApp("💰 Contribute Now", webAppUrl)],
        ])
      );
    } catch (error) {
      console.error("Error in /contribute:", error);
      ctx.reply(
        "❌ **Could not process request**\n\n" +
          "Please try again or contact support."
      );
    }
  });

  // FUND INFO Command
  bot.command("fundinfo", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.\n\n" +
          "Use this in a group to view its fund information.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      const fund = await fundService.getFundInfo(chatId);

      ctx.reply(
        `📊 **Fund Information**\n\n` +
          `📌 Name: ${fund.fundName}\n` +
          `💰 Total Value: ${(fund.totalValue / 1e9).toFixed(2)} SOL\n` +
          `📈 Total Shares: ${fund.totalShares}\n` +
          `👥 Members: ${fund.memberCount}\n` +
          `💵 Min Contribution: ${(fund.minContribution / 1e9).toFixed(2)} SOL\n` +
          `📊 Trading Fee: ${fund.tradingFeeBps / 100}%\n` +
          `${fund.isActive ? "🟢 Status: Active" : "🔴 Status: Paused"}\n\n` +
          `Use /contribute to join the fund!`,
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
  bot.command("myshares", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.\n\n" +
          "Use this in a group to view your position.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      const member = await fundService.getMemberInfo(chatId, userId);

      ctx.reply(
        `👤 **Your Position**\n\n` +
          `📈 Shares: ${member.shares}\n` +
          `💰 Total Contributed: ${(member.totalContributed / 1e9).toFixed(2)} SOL\n` +
          `👔 Role: ${member.role}\n` +
          `⭐ Reputation: ${member.reputationScore}\n\n` +
          `Use /contribute to add more!`,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      if (error.response?.status === 404) {
        ctx.reply(
          "⚠️ **No Position Found**\n\n" +
            "You haven't contributed to this fund yet.\n" +
            "Use /contribute to join!"
        );
      } else {
        console.error("Error fetching member info:", error);
        ctx.reply(
          "❌ **Could not fetch your information**\n\n" +
            "Please try again later."
        );
      }
    }
  });
}
