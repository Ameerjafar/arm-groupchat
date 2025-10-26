import { Telegraf, session } from "telegraf";
import { MyContext } from "./types/context";
import { config } from "./config/config";
import { registerWalletCommands } from "./commands/walletCommands";
import { registerFundCommands } from "./commands/fundCommands";
import { registerGeneralCommands } from "./commands/generalCommands";
import { registerEventHandlers } from "./handlers/eventHandlers";
import { registerErrorHandlers } from "./middleware/errorMiddleware";

console.log("🔄 Initializing bot...");

const bot = new Telegraf<MyContext>(config.botToken);
console.log("this is bot token", config.botToken);
bot.use(session());

console.log("📝 Registering commands...");

try {
  console.log("  → Registering wallet commands...");
  registerWalletCommands(bot);
  console.log("  ✓ Wallet commands registered");
} catch (error) {
  console.error("  ✗ Error in wallet commands:", error);
  process.exit(1);
}

try {
  console.log("  → Registering fund commands...");
  registerFundCommands(bot);
  console.log("  ✓ Fund commands registered");
} catch (error) {
  console.error("  ✗ Error in fund commands:", error);
  process.exit(1);
}

try {
  console.log("  → Registering general commands...");
  registerGeneralCommands(bot);
  console.log("  ✓ General commands registered");
} catch (error) {
  console.error("  ✗ Error in general commands:", error);
  process.exit(1);
}

try {
  console.log("  → Registering event handlers...");
  registerEventHandlers(bot);
  console.log("  ✓ Event handlers registered");
} catch (error) {
  console.error("  ✗ Error in event handlers:", error);
  process.exit(1);
}

try {
  console.log("  → Registering error handlers...");
  registerErrorHandlers(bot);
  console.log("  ✓ Error handlers registered");
} catch (error) {
  console.error("  ✗ Error in error handlers:", error);
  process.exit(1);
}

console.log("🚀 Launching bot...");
console.log(bot.botInfo?.username)
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
