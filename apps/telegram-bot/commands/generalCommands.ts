import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";

export function registerGeneralCommands(bot: Telegraf<MyContext>) {
  bot.command("help", (ctx) => {
    ctx.reply(
      "💡 **Available Commands**\n\n" +
        "**💼 Wallet Commands:**\n" +
        "/start - Create your wallet\n" +
        "/deposit - Get deposit address\n" +
        "/mybalance - Check your balance\n" +
        "/withdraw - Withdraw funds\n" +
        "/exportkey - Export private key (DM only)\n\n" +
        "**🏦 Fund Commands:**\n" +
        "/initfund - Initialize fund (admin only)\n" +
        "/contribute - Contribute to fund\n" +
        "/fundinfo - View fund details\n" +
        "/myshares - View your position\n\n" +
        "Need more help? Contact support!",
      { parse_mode: "Markdown" }
    );
  });
}
