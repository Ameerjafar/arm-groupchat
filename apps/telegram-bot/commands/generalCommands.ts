import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";
import { prisma } from "@repo/db";
import * as crypto from "crypto";

function decrypt(encryptedData: string, encryptionKey: string): string {
  const parts = encryptedData.split(":");
  const iv = Buffer.from(parts[0]!, "hex");
  const encryptedText = Buffer.from(parts[1]!, "hex");
  
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(encryptionKey, "hex"),
    iv
  );
  
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString();
}

export function registerGeneralCommands(bot: Telegraf<MyContext>) {
  
  bot.command("help", (ctx) => {
    const isPrivate = ctx.chat.type === "private";

    ctx.reply(
      `💡 **Bot Commands**\n\n` +
        `**🔐 Wallet** ${isPrivate ? "" : "(private chat)"}\n` +
        `• /mybalance - Check balance\n` +
        `• /exportkey - Export private key\n\n` +
        `**🏦 Fund Management** ${isPrivate ? "(group chat)" : ""}\n` +
        `• /initfund - Create fund (admin)\n` +
        `• /fundinfo - View fund details\n` +
        `• /pausefund - Pause fund (admin)\n` +
        `• /resumefund - Resume fund (admin)\n` +
        `• /closefund - Close fund (admin)\n\n` +
        `**💰 Contributing**\n` +
        `• /contribute - Add funds\n` +
        `• /myshares - Your position\n` +
        `• /mycontributions - Your history\n` +
        `• /myfunds - All portfolios\n` +
        `• /contributors - Fund members\n\n` +
        `**💸 Withdrawals**\n` +
        `• /myvalue - Current value\n` +
        `• /cashout - Exit completely\n` +
        `• /claimprofits - Take profits only\n` +
        `• /myhistory - Withdrawal history\n\n` +
        `**⚡ Trading** ${isPrivate ? "(group chat)" : ""}\n` +
        `• /trade - Execute swap (admin)\n` +
        `• /tradehistory - Recent trades\n` +
        `• /checkadmin - Check permissions\n\n` +
        `**ℹ️ Help**\n` +
        `• /fundhelp - Fund guide\n` +
        `• /contributehelp - How to contribute\n` +
        `• /tradehelp - Trading guide\n` +
        `• /help - This message`,
      { parse_mode: "Markdown" }
    );
  });

  // ========== EXPORT KEY ==========
  bot.command("exportkey", async (ctx) => {
    const userId = ctx.from.id.toString();

    // Security: Only allow in private chat
    if (ctx.chat.type !== "private") {
      return ctx.reply(
        "🚫 **Security Warning**\n\n" +
          "This command only works in private chat for your safety.\n\n" +
          `👉 Send me /exportkey privately: @${ctx.botInfo?.username}`,
        { parse_mode: "Markdown" }
      );
    }

    try {
      console.log("prisma is working correctly")
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });
      console.log("after the prisma");
      if (!user || !user.walletAddress) {
        return ctx.reply(
          "❌ **No Wallet Found**\n\n" +
            "You don't have a wallet yet.\n" +
            "Use /start to create one.",
          { parse_mode: "Markdown" }
        );
      }

      if (!user.encryptedPrivateKey) {
        return ctx.reply(
          "❌ **Key Not Available**\n\n" +
            "Your private key is not stored.\n" +
            "Contact support for assistance.",
          { parse_mode: "Markdown" }
        );
      }

      // Show warning with confirmation
      await ctx.reply(
        "⚠️ **Export Private Key?**\n\n" +
          "**SECURITY WARNING:**\n" +
          "• Never share your private key\n" +
          "• Anyone with this key controls your funds\n" +
          "• Delete the message after saving it\n" +
          "• Store it in a secure location\n\n" +
          "Do you want to proceed?",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Export Key",
                  callback_data: `exportkey_confirm:${userId}`,
                },
                {
                  text: "❌ Cancel",
                  callback_data: `exportkey_cancel:${userId}`,
                },
              ],
            ],
          },
        }
      );
    } catch (error: any) {
      // console.error("Export key error:", error);
      ctx.reply("❌ Failed to process request. Please try again.");
    }
  });

  // Handle export key confirmation
  bot.action(/^exportkey_confirm:(.+)$/, async (ctx) => {
    const [, requestUserId] = ctx.match;
    const clickUserId = ctx.from.id.toString();

    if (clickUserId !== requestUserId) {
      return ctx.answerCbQuery("⚠️ Only you can confirm this.", {
        show_alert: true,
      });
    }

    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText("⏳ Decrypting...", { parse_mode: "Markdown" });

      // Get user and encryption key
      const user = await prisma.user.findUnique({
        where: { telegramId: requestUserId },
      });

      if (!user || !user.encryptedPrivateKey) {
        return ctx.editMessageText(
          "❌ Private key not found.",
          { parse_mode: "Markdown" }
        );
      }

      // Get encryption key from environment
      const encryptionKey = process.env.ENCRYPTION_KEY;
      
      if (!encryptionKey) {
        console.error("ENCRYPTION_KEY not found in environment");
        return ctx.editMessageText(
          "❌ Server configuration error. Contact support.",
          { parse_mode: "Markdown" }
        );
      }
      const privateKey = decrypt(user.encryptedPrivateKey, encryptionKey);
      await ctx.editMessageText(
        "✅ **Private Key Exported**\n\n" +
          "Your key is in the next message.\n\n" +
          "⚠️ **DELETE IT** after copying!",
        { parse_mode: "Markdown" }
      );

      // Send private key in separate message for easy deletion
      const keyMessage = await ctx.reply(
        `🔑 **Your Private Key:**\n\n` +
          `\`${privateKey}\`\n\n` +
          `⚠️ Delete this message immediately after saving!`,
        { parse_mode: "Markdown" }
      );

      // Auto-delete warning after 60 seconds
      setTimeout(async () => {
        try {
          await ctx.telegram.sendMessage(
            ctx.chat.id,
            "⚠️ **Security Reminder**\n\n" +
              "Make sure you deleted the private key message!\n\n" +
              "If not, scroll up and delete it now.",
            { parse_mode: "Markdown" }
          );
        } catch (err) {
          console.error("Failed to send reminder:", err);
        }
      }, 60000); 
      console.log(`Private key exported by user: ${requestUserId} at ${new Date().toISOString()}`);

    } catch (error: any) {
      console.error("Decryption error:", error);
      ctx.editMessageText(
        "❌ Failed to decrypt private key.\n\n" +
          "Contact support if this persists.",
        { parse_mode: "Markdown" }
      );
    }
  });

  // Handle export key cancel
  bot.action(/^exportkey_cancel:(.+)$/, async (ctx) => {
    const [, requestUserId] = ctx.match;
    const clickUserId = ctx.from.id.toString();

    if (clickUserId !== requestUserId) {
      return ctx.answerCbQuery("⚠️ Only you can cancel this.", {
        show_alert: true,
      });
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      "❌ **Export Cancelled**\n\n" +
        "Your private key remains secure.",
      { parse_mode: "Markdown" }
    );
  });
}
