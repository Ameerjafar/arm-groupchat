import { Telegraf, session } from "telegraf";
import { MyContext } from "./types/context";
import { config } from "./config/config";
import { registerFundCommands } from "./commands/fundCommands";
import { registerGeneralCommands } from "./commands/generalCommands";
import { registerEventHandlers } from "./handlers/eventHandlers";
import { registerErrorHandlers } from "./middleware/errorMiddleware";
import { registerContributorCommands } from "./commands/contributeCommands";
import { registerTradeCommands } from "./commands/tradeCommands";
import { registerDistributionCommands } from "./commands/distributionCommmands";
console.log("🔄 Initializing bot...");

const bot = new Telegraf<MyContext>(config.botToken);
console.log("this is bot token", config.botToken);
bot.use(session());

console.log("📝 Registering commands...");


console.log("  → Registering fund commands...");
registerFundCommands(bot);
console.log("  ✓ Fund commands registered");

console.log("  → Registering contributor commands...");
registerContributorCommands(bot);
console.log("  ✓ Contributor commands registered");

console.log("  → Registering general commands...");
registerGeneralCommands(bot);
console.log("  ✓ General commands registered");

console.log("  → Registering event handlers...");
registerEventHandlers(bot);
console.log("  ✓ Event handlers registered");

console.log("  → Registering error handlers...");
registerErrorHandlers(bot);
console.log("  ✓ Error handlers registered");
registerTradeCommands(bot);
registerDistributionCommands(bot);
console.log("🚀 Launching bot...");
console.log(bot.botInfo?.username);

bot.launch();

console.log("✅ Bot launch initiated successfully!");
console.log(`🤖 Bot username: @${bot.botInfo?.id || 'unknown'}`);

process.once("SIGINT", () => {
  console.log("⚠️ SIGINT received, stopping bot...");
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  console.log("⚠️ SIGTERM received, stopping bot...");
  bot.stop("SIGTERM");
});
