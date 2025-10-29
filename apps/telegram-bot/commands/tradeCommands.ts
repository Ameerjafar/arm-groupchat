import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
// Helper: Format token address for display
import { TradeApiService } from "../services/tradeApiService";
function formatAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Helper: Get token name from address
function getTokenName(address: string): string {
  if (address === "So11111111111111111111111111111111111111112") return "SOL";
  if (address === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") return "USDC";
  if (address === "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB") return "USDT";
  return formatAddress(address);
}

// Helper: Parse token shortcuts
function parseTokenAddress(input: string): string {
  const upperInput = input.toUpperCase();
  if (upperInput === "SOL") return "So11111111111111111111111111111111111111112";
  if (upperInput === "USDC") return "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  if (upperInput === "USDT") return "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
  return input;
}

// Helper: Convert to lamports/smallest unit
function toSmallestUnit(amount: number, decimals: number = 9): string {
  return Math.floor(amount * Math.pow(10, decimals)).toString();
}

// Helper: Convert from lamports/smallest unit
function fromSmallestUnit(amount: string, decimals: number = 9): number {
  return parseInt(amount) / Math.pow(10, decimals);
}

export function registerTradeCommands(bot: Telegraf<MyContext>) {
  const tradeService = new TradeApiService();
  bot.command("trade", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.split(" ").slice(1);
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ This command only works in **group chats**.", {
        parse_mode: "Markdown",
      });
    }

    if (args.length === 0) {
      return ctx.reply(
        "⚡ **Execute Trade (Admin Only)**\n\n" +
          "Use this format:\n" +
          "`/trade <from_token> <to_token> <amount> <min_out>`\n\n" +
          "*Examples:*\n" +
          "• `/trade SOL USDC 0.5 50`\n" +
          "  (Trade 0.5 SOL for minimum 50 USDC)\n\n" +
          "• `/trade USDC SOL 100 0.95`\n" +
          "  (Trade 100 USDC for minimum 0.95 SOL)\n\n" +
          "*Supported Tokens:* SOL, USDC, USDT\n\n" +
          "⚠️ *Note:* Only the fund creator (admin) can execute trades.",
        { parse_mode: "Markdown" }
      );
    }

    if (args.length !== 4) {
      return ctx.reply(
        "❌ **Invalid format**\n\n" +
          "Usage: `/trade <from> <to> <amount> <min_out>`\n\n" +
          "Example: `/trade SOL USDC 0.5 50`",
        { parse_mode: "Markdown" }
      );
    }

    const [fromTokenInput, toTokenInput, amountStr, minOutStr] = args;

    try {
      const loadingMsg = await ctx.reply("⚡ **Executing trade...**", {
        parse_mode: "Markdown",
      });

      const fromToken = parseTokenAddress(fromTokenInput!);
      const toToken = parseTokenAddress(toTokenInput!);
      const amount = parseFloat(amountStr!);
      const minOut = parseFloat(minOutStr!);

      if (isNaN(amount) || isNaN(minOut) || amount <= 0 || minOut <= 0) {
        await ctx.deleteMessage(loadingMsg.message_id);
        return ctx.reply("❌ Invalid amount format. Please use positive numbers.");
      }

      const fromDecimals = fromToken === "So11111111111111111111111111111111111111112" ? 9 : 6;
      const toDecimals = toToken === "So11111111111111111111111111111111111111112" ? 9 : 6;

      const amountSmallest = toSmallestUnit(amount, fromDecimals);
      const minOutSmallest = toSmallestUnit(minOut, toDecimals);

      const result = await tradeService.executeTrade({
        groupId: chatId,
        telegramId: userId,
        fromToken,
        toToken,
        amount: amountSmallest,
        minimumOut: minOutSmallest,
      });

      await ctx.deleteMessage(loadingMsg.message_id);

      if (result.success) {
        const fromTokenName = getTokenName(fromToken);
        const toTokenName = getTokenName(toToken);

        return ctx.reply(
          `✅ **Trade Executed!**\n\n` +
            `⚡ *Trade:* ${amountStr} ${fromTokenName} → ${minOutStr} ${toTokenName}\n` +
            `📊 *Status:* EXECUTED\n` +
            `🔗 [View Transaction](https://explorer.solana.com/tx/${result.transactionSignature}?cluster=devnet)\n\n` +
            `💡 Check fund balance with /fundinfo`,
          { parse_mode: "Markdown", disable_web_page_preview: true }
        );
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message;

      if (errorMsg.includes("UnauthorizedTrader") || errorMsg.includes("Only fund authority")) {
        return ctx.reply(
          `❌ **Not Authorized**\n\n` +
            `Only the fund creator (admin) can execute trades.\n\n` +
            `Check who the admin is with \`/fundinfo\``,
          { parse_mode: "Markdown" }
        );
      }

      if (errorMsg.includes("InsufficientFunds")) {
        return ctx.reply(
          `❌ **Insufficient Funds**\n\n` +
            `The fund doesn't have enough balance for this trade.\n\n` +
            `Check balance with \`/fundinfo\``,
          { parse_mode: "Markdown" }
        );
      }

      if (errorMsg.includes("FundNotActive")) {
        return ctx.reply(
          `❌ **Fund Not Active**\n\n` +
            `The fund is currently paused or closed.\n\n` +
            `Ask the admin to resume it.`,
          { parse_mode: "Markdown" }
        );
      }

      return ctx.reply(`❌ **Trade Failed**: ${errorMsg}`, {
        parse_mode: "Markdown",
      });
    }
  });

  // ==================== TRADE HISTORY ====================

  bot.command("tradehistory", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ This command only works in **group chats**.", {
        parse_mode: "Markdown",
      });
    }

    try {
      const loadingMsg = await ctx.reply("⏳ Fetching trade history...");

      const result = await tradeService.getTradeHistory(chatId, 10);

      await ctx.deleteMessage(loadingMsg.message_id);

      if (result.success && result.data.trades.length > 0) {
        let message = `📊 **Trade History** (Last ${result.data.trades.length})\n\n`;

        for (const trade of result.data.trades) {
          const amount = fromSmallestUnit(trade.amount);
          const timestamp = new Date(trade.timestamp).toLocaleString();

          message +=
            `🔄 *${amount.toFixed(4)} tokens*\n` +
            `📅 ${timestamp}\n` +
            `📍 Status: ${trade.status}\n` +
            `🔗 [View](https://explorer.solana.com/tx/${trade.signature}?cluster=devnet)\n\n`;
        }

        return ctx.reply(message, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        });
      } else {
        return ctx.reply("ℹ️ No trade history found.");
      }
    } catch (error: any) {
      console.error("Error fetching trade history:", error);
      return ctx.reply(`❌ Error: ${error.message}`);
    }
  });

  // ==================== CHECK ADMIN ====================

  bot.command("checkadmin", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ This command only works in **group chats**.", {
        parse_mode: "Markdown",
      });
    }

    try {
      const loadingMsg = await ctx.reply("⏳ Checking...");

      const result = await tradeService.checkTradePermissions(chatId, userId);

      await ctx.deleteMessage(loadingMsg.message_id);

      if (result.success && result.data.canTrade) {
        return ctx.reply(
          `✅ **You are the Fund Admin!**\n\n` +
            `You can execute trades with \`/trade\``,
          { parse_mode: "Markdown" }
        );
      } else {
        return ctx.reply(
          `ℹ️ **Not Admin**\n\n` +
            `Reason: ${result.data.reason}\n\n` +
            `Only the fund creator can execute trades.`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (error: any) {
      return ctx.reply(`❌ Error: ${error.message}`);
    }
  });

  // ==================== TRADE HELP ====================

  bot.command("tradehelp", async (ctx) => {
    ctx.reply(
      "🔰 **Trade Commands**\n\n" +
        "*Admin Only:*\n" +
        "• `/trade <from> <to> <amount> <min>` - Execute trade\n" +
        "  Example: `/trade SOL USDC 0.5 50`\n" +
        "  ⚡ Only fund creator (admin) can trade\n\n" +
        "*Information:*\n" +
        "• `/tradehistory` - View recent trades\n" +
        "• `/checkadmin` - Check if you're admin\n" +
        "• `/fundinfo` - View fund details\n\n" +
        "*Supported Tokens:* SOL, USDC, USDT\n\n" +
        "*How it works:*\n" +
        "1. Only the fund creator is the admin\n" +
        "2. Admin can execute trades instantly\n" +
        "3. All trades are logged on blockchain\n" +
        "4. Members can contribute and withdraw\n\n" +
        "Need help? Use /help",
      { parse_mode: "Markdown" }
    );
  });
}
