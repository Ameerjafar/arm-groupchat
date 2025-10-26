import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";
import { ApiService } from "../services/apiService";

export function registerEventHandlers(bot: Telegraf<MyContext>) {
  const apiService = new ApiService();

  // New chat members
  bot.on("new_chat_members", async (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    const groupId = ctx.chat.id.toString();

    for (const member of newMembers) {
      if (member.is_bot) {
        await ctx.reply(
          "🤖 Thank you for adding me to the group!\n\n" +
            "⚠️ Please make me an admin to function properly.\n\n" +
            "Admins can use /initfund to create a group fund! ✅"
        );
        continue;
      }

      const telegramId = member.id.toString();
      const username = member.username || member.first_name || "Unknown";

      console.log(`👋 New member joined: ${username} (${telegramId}) in group ${groupId}`);

      await ctx.reply(
        `🎉 Welcome, ${username}!\n\n` +
          `Use /connectwallet to link your Solana wallet and join the fund!`
      );
    }
  });

  // Bot added to group
  bot.on("my_chat_member", async (ctx: any) => {
    const newStatus = ctx.myChatMember.new_chat_member.status;
    const oldStatus = ctx.myChatMember.old_chat_member.status;
    const chatId = ctx.chat.id.toString();
    const chatName = ctx.chat?.title || "Unknown Group";

    if (
      (oldStatus === "left" || oldStatus === "kicked") &&
      (newStatus === "member" || newStatus === "administrator")
    ) {
      console.log(`🚀 Bot added to group: ${chatName} (${chatId})`);

      ctx.reply(
        "🤖 Thank you for adding me to the group!\n\n" +
          "⚠️ Please make me an admin to function properly.\n\n" +
          "Use /help to see all available commands! ✅"
      );

      try {
        await apiService.createGroup(chatId, chatName);
        console.log("✅ Group created in DB");
      } catch (error: any) {
        console.error("❌ Error creating group in DB:", error.message);
      }
    }
  });

  // Member left
  bot.on("left_chat_member", async (ctx) => {
    const leftMember = ctx.message.left_chat_member;
    const telegramId = leftMember.id.toString();
    const username = leftMember.username || leftMember.first_name || "Unknown";
    const groupId = ctx.chat.id.toString();

    console.log(`👋 Member left: ${username} (${telegramId}) from group ${groupId}`);

    try {
      await apiService.removeGroupMember(telegramId, groupId);
      console.log(`✅ ${username} removed from group in DB`);
    } catch (error: any) {
      console.error(`❌ Failed to remove ${username}:`, error.message);
    }
  });
}
