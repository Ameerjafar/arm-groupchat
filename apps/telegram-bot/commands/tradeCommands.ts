import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TradeApiService } from "../api/tradeApi";

// ========== TEMPORARY TRADE STORAGE ==========
// Store pending trades in memory with short IDs
const pendingTrades = new Map<string, {
  chatId: string;
  userId: string;
  fromToken: string;
  toToken: string;
  amount: number;
  minOut: number;
  expiresAt: number;
}>();

// Clean up expired trades every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, trade] of pendingTrades.entries()) {
    if (trade.expiresAt < now) {
      pendingTrades.delete(id);
    }
  }
}, 60000);

function generateTradeId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function formatAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getTokenName(address: string): string {
  const tokens: Record<string, string> = {
    "So11111111111111111111111111111111111111112": "SOL",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
  };
  return tokens[address] || formatAddress(address);
}

function parseTokenAddress(input: string): string {
  const tokens: Record<string, string> = {
    "SOL": "So11111111111111111111111111111111111111112",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  };
  return tokens[input.toUpperCase()] || input;
}

function toSmallestUnit(amount: number, decimals: number = 9): string {
  return Math.floor(amount * Math.pow(10, decimals)).toString();
}

function fromSmallestUnit(amount: string, decimals: number = 9): number {
  return parseInt(amount) / Math.pow(10, decimals);
}

function getTokenDecimals(address: string): number {
  return address === "So11111111111111111111111111111111111111112" ? 9 : 6;
}

export function registerTradeCommands(bot: Telegraf<MyContext>) {
  const tradeService = new TradeApiService();

  // ========== TRADE ==========
  bot.command("trade", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.split(" ").slice(1);
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    // Show usage
    if (args.length === 0) {
      return ctx.reply(
        `⚡ **Execute Trade**\n\n` +
          `Format: \`/trade FROM TO AMOUNT MIN\`\n\n` +
          `Examples:\n` +
          `• \`/trade SOL USDC 0.5 50\`\n` +
          `• \`/trade USDC SOL 100 0.95\`\n\n` +
          `Tokens: SOL, USDC, USDT\n\n` +
          `⚠️ Admin only`,
        { parse_mode: "Markdown" }
      );
    }

    if (args.length !== 4) {
      return ctx.reply(
        `❌ Wrong format.\n\n` +
          `Use: \`/trade FROM TO AMOUNT MIN\`\n` +
          `Example: \`/trade SOL USDC 0.5 50\``,
        { parse_mode: "Markdown" }
      );
    }

    const [fromTokenInput, toTokenInput, amountStr, minOutStr] = args;

    try {
      const fromToken = parseTokenAddress(fromTokenInput!);
      const toToken = parseTokenAddress(toTokenInput!);
      const amount = parseFloat(amountStr!);
      const minOut = parseFloat(minOutStr!);

      if (isNaN(amount) || isNaN(minOut) || amount <= 0 || minOut <= 0) {
        return ctx.reply("❌ Invalid amounts. Use positive numbers only.");
      }

      const fromName = getTokenName(fromToken);
      const toName = getTokenName(toToken);

      // Generate short trade ID and store trade details
      const tradeId = generateTradeId();
      pendingTrades.set(tradeId, {
        chatId,
        userId,
        fromToken,
        toToken,
        amount,
        minOut,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      // Show confirmation with inline buttons (SHORT callback data)
      await ctx.reply(
        `⚡ **Confirm Trade**\n\n` +
          `${amount} ${fromName} → ${minOut}+ ${toName}\n\n` +
          `Minimum received: ${minOut} ${toName}\n\n` +
          `⚠️ This will execute immediately.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Execute",
                  callback_data: `tc:${tradeId}`, // ✅ Only 11 bytes!
                },
                {
                  text: "❌ Cancel",
                  callback_data: `tx:${tradeId}`, // ✅ Only 11 bytes!
                },
              ],
            ],
          },
        }
      );
    } catch (error: any) {
      console.error("Trade setup error:", error);
      return ctx.reply(`❌ ${error.message}`);
    }
  });

  // Handle trade confirmation (shortened callback)
  bot.action(/^tc:(.+)$/, async (ctx) => {
    const tradeId = ctx.match[1];
    const clickUserId = ctx.from.id.toString();

    // Get trade details from memory
    const trade = pendingTrades.get(tradeId); 

    if (!trade) {
      return ctx.answerCbQuery("⚠️ Trade expired or not found.", {
        show_alert: true,
      });
    }

    // Verify user
    if (clickUserId !== trade.userId) {
      return ctx.answerCbQuery("⚠️ Only the requester can confirm this.", {
        show_alert: true,
      });
    }

    // Check expiration
    if (trade.expiresAt < Date.now()) {
      pendingTrades.delete(tradeId);
      return ctx.answerCbQuery("⚠️ Trade expired.", {
        show_alert: true,
      });
    }

    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText("⏳ Executing trade...", { parse_mode: "Markdown" });

      const fromDecimals = getTokenDecimals(trade.fromToken);
      const toDecimals = getTokenDecimals(trade.toToken);

      const amountSmallest = toSmallestUnit(trade.amount, fromDecimals);
      const minOutSmallest = toSmallestUnit(trade.minOut, toDecimals);

      const result = await tradeService.executeTrade({
        groupId: trade.chatId,
        telegramId: trade.userId,
        fromToken: trade.fromToken,
        toToken: trade.toToken,
        amount: amountSmallest,
        minimumOut: minOutSmallest,
      });

      // Clean up
      pendingTrades.delete(tradeId);

      if (result.success) {
        const fromName = getTokenName(trade.fromToken);
        const toName = getTokenName(trade.toToken);

        return ctx.editMessageText(
          `✅ **Trade Complete**\n\n` +
            `${trade.amount} ${fromName} → ${trade.minOut}+ ${toName}\n\n` +
            `New Balance: ${result.data.newBalance} SOL\n\n` +
            `[View on Explorer](${result.data.explorerUrl})`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (error: any) {
      console.error("Trade execution error:", error);
      const errorMsg = error.response?.data?.message || error.message;

      let msg = "❌ Trade failed.";
      if (errorMsg.includes("UnauthorizedTrader") || errorMsg.includes("Only fund authority")) {
        msg = "❌ Admin only.\n\nCheck /fundinfo for admin details.";
      } else if (errorMsg.includes("InsufficientFunds")) {
        msg = "❌ Insufficient balance.\n\nCheck /fundinfo.";
      } else if (errorMsg.includes("FundNotActive")) {
        msg = "❌ Fund is paused.\n\nAsk admin to resume.";
      } else {
        msg = `❌ Trade failed: ${errorMsg}`;
      }

      ctx.editMessageText(msg, { parse_mode: "Markdown" });

      pendingTrades.delete(tradeId);
    }
  });
  bot.action(/^tx:(.+)$/, async (ctx) => {
    const tradeId = ctx.match[1];
    const clickUserId = ctx.from.id.toString();

    const trade = pendingTrades.get(tradeId);

    if (!trade) {
      return ctx.answerCbQuery("⚠️ Trade expired or not found.", {
        show_alert: true,
      });
    }

    if (clickUserId !== trade.userId) {
      return ctx.answerCbQuery("⚠️ Only the requester can cancel this.", {
        show_alert: true,
      });
    }

    // Clean up
    pendingTrades.delete(tradeId);

    await ctx.answerCbQuery();
    await ctx.editMessageText("❌ Trade cancelled.", { parse_mode: "Markdown" });
  });
  bot.command("tradehistory", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      const result = await tradeService.getTradeHistory(chatId, 10);

      if (!result.success || result.data.trades.length === 0) {
        return ctx.reply("📊 No trades yet.");
      }

      let msg = `📊 **Recent Trades** (${result.data.trades.length})\n\n`;

      for (const trade of result.data.trades.slice(0, 8)) {
        const amount = fromSmallestUnit(trade.amount);
        const date = new Date(trade.timestamp).toLocaleDateString();
        const statusEmoji = trade.status === "CONFIRMED" ? "✅" : trade.status === "PENDING" ? "⏳" : "❌";

        msg += `${statusEmoji} ${amount.toFixed(4)} tokens\n`;
        msg += `   ${date} · ${trade.status}\n`;
        
        if (trade.explorerUrl) {
          msg += `   [View Tx](${trade.explorerUrl})\n`;
        }
        msg += `\n`;
      }

      if (result.data.trades.length > 8) {
        msg += `_...${result.data.trades.length - 8} more_`;
      }

      return ctx.reply(msg, { parse_mode: "Markdown", disable_web_page_preview: true });
    } catch (error: any) {
      console.error("Trade history error:", error);
      return ctx.reply(`❌ ${error.message}`);
    }
  });

  // ========== CHECK ADMIN ==========
  bot.command("checkadmin", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ Use this command in a group chat.");
    }

    try {
      const result = await tradeService.checkTradePermissions(chatId, userId);

      if (result.success && result.data.canTrade) {
        return ctx.reply(
          `✅ **You're the admin**\n\nYou can execute trades with /trade`,
          { parse_mode: "Markdown" }
        );
      } else {
        return ctx.reply(
          `ℹ️ You're not the admin.\n\n${result.data.reason || "Only fund creator can trade."}`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (error: any) {
      return ctx.reply(`❌ ${error.message}`);
    }
  });

  bot.command("tradehelp", async (ctx) => {
    ctx.reply(
      `🔰 **Trade Commands**\n\n` +
        `**Admin Only:**\n` +
        `• /trade - Execute swap\n` +
        `  Example: \`/trade SOL USDC 0.5 50\`\n\n` +
        `**Info:**\n` +
        `• /tradehistory - Recent trades\n` +
        `• /checkadmin - Check permissions\n` +
        `• /fundinfo - Fund details\n\n` +
        `**Tokens:** SOL, USDC, USDT\n\n` +
        `**How it works:**\n` +
        `Only the fund creator can trade. All trades are recorded on-chain. Members can contribute and withdraw anytime.`,
      { parse_mode: "Markdown" }
    );
  });
}