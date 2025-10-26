import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";

export function registerErrorHandlers(bot: Telegraf<MyContext>) {
  bot.catch((err, ctx) => {
    console.error(`❌ Error for ${ctx.updateType}:`, err);
    ctx
      .reply(
        "❌ **An unexpected error occurred**\n\n" +
          "Our team has been notified. Please try again later.\n" +
          "If the issue persists, contact support."
      )
      .catch(console.error);
  });
}
