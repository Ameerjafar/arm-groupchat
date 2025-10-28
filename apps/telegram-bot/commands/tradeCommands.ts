// commands/tradeCommands.ts
import { Telegraf } from "telegraf";
import { MyContext } from "../types/context";
import { TradeService } from "../services/tradeService";
import { FundService } from "../services/fundService";

// Helper: Format token address for display
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

// Helper: Format status emoji
function getStatusEmoji(status: string): string {
  switch (status.toLowerCase()) {
    case "pending": return "⏳";
    case "approved": return "✅";
    case "rejected": return "❌";
    case "executed": return "🎯";
    case "expired": return "⏰";
    default: return "❓";
  }
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
  const tradeService = new TradeService();
  const fundService = new FundService();

  // ==================== TRADER MANAGEMENT COMMANDS ====================

  // ADD TRADER Command
  bot.command("addtrader", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ This command only works in **group chats**.", {
        parse_mode: "Markdown",
      });
    }

    try {
      // Check if user is admin
      const member = await ctx.getChatMember(parseInt(userId));
      if (member.status !== "creator" && member.status !== "administrator") {
        return ctx.reply(
          "🚫 **Admin Only**\n\n" +
            "Only group admins can add traders.",
          { parse_mode: "Markdown" }
        );
      }

      // Parse command - expecting wallet address
      const args = ctx.message.text.split(" ").slice(1);

      if (args.length === 0) {
        return ctx.reply(
          "📝 **Add Approved Trader**\n\n" +
            "Usage: `/addtrader <wallet_address>`\n\n" +
            "Example:\n" +
            "`/addtrader 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`\n\n" +
            "Or to add yourself:\n" +
            "`/addtrader me`",
          { parse_mode: "Markdown" }
        );
      }

      let traderWallet = args[0];

      // If user typed "me", use their wallet
      if (traderWallet!.toLowerCase() === "me") {
        const user = await fundService.getUserInfo(userId);
        if (!user?.walletAddress) {
          return ctx.reply("❌ You don't have a wallet connected. Use /start first.");
        }
        traderWallet = user.walletAddress;
      }

      const loadingMsg = await ctx.reply("⏳ Adding trader to approved list...");

      const result = await tradeService.addApprovedTrader({
        groupId: chatId,
        telegramId: userId,
        traderWallet: traderWallet!,
      });

      await ctx.deleteMessage(loadingMsg.message_id);

      return ctx.reply(
        "✅ **Trader Added!**\n\n" +
          `Wallet: \`${traderWallet}\`\n\n` +
          `This trader can now:\n` +
          `• Create trade proposals with /propose\n` +
          `• Approve proposals with /approve\n\n` +
          `Transaction: \`${result.data?.transactionSignature || 'N/A'}\``,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Add trader error:", error);
      const message = error.response?.data?.message || "Failed to add trader";
      ctx.reply(`❌ **Error**: ${message}`, { parse_mode: "Markdown" });
    }
  });

  // REMOVE TRADER Command
  bot.command("removetrader", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ This command only works in **group chats**.", {
        parse_mode: "Markdown",
      });
    }

    try {
      const member = await ctx.getChatMember(parseInt(userId));
      if (member.status !== "creator" && member.status !== "administrator") {
        return ctx.reply("🚫 **Admin Only**", { parse_mode: "Markdown" });
      }

      const args = ctx.message.text.split(" ").slice(1);

      if (args.length === 0) {
        return ctx.reply(
          "Usage: `/removetrader <wallet_address>`",
          { parse_mode: "Markdown" }
        );
      }

      const traderWallet = args[0];

      const loadingMsg = await ctx.reply("⏳ Removing trader...");

      const result = await tradeService.removeApprovedTrader({
        groupId: chatId,
        telegramId: userId,
        traderWallet: traderWallet!,
      });

      await ctx.deleteMessage(loadingMsg.message_id);

      return ctx.reply(
        "✅ **Trader Removed**\n\n" +
          `Wallet: \`${traderWallet}\`\n\n` +
          `Transaction: \`${result.data?.transactionSignature || 'N/A'}\``,
        { parse_mode: "Markdown" }
      );
    } catch (error: any) {
      console.error("Remove trader error:", error);
      const message = error.response?.data?.message || "Failed to remove trader";
      ctx.reply(`❌ **Error**: ${message}`, { parse_mode: "Markdown" });
    }
  });

  // LIST TRADERS Command
  bot.command("traders", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply("⚠️ This command only works in **group chats**.", {
        parse_mode: "Markdown",
      });
    }

    try {
      const loadingMsg = await ctx.reply("⏳ Fetching traders list...");

      const result = await tradeService.getApprovedTraders(chatId);

      await ctx.deleteMessage(loadingMsg.message_id);

      if (result.success) {
        const traders = result.data.approvedTraders || [];

        if (traders.length === 0) {
          return ctx.reply(
            "📋 **No Approved Traders**\n\n" +
              "Add traders with `/addtrader <wallet>`",
            { parse_mode: "Markdown" }
          );
        }

        let message = `📋 **Approved Traders** (${traders.length})\n\n`;

        traders.forEach((trader: string, i: number) => {
          message += `${i + 1}. \`${trader}\`\n`;
        });

        message += `\n*Required Approvals:* ${result.data.requiredApprovals || 2}\n`;
        message += `*Total Traders:* ${result.data.totalTraders}`;

        return ctx.reply(message, { parse_mode: "Markdown" });
      }
    } catch (error: any) {
      console.error("List traders error:", error);
      ctx.reply("❌ Failed to fetch traders list");
    }
  });

  // ==================== PROPOSAL COMMANDS ====================

  // ==================== /propose - Show How to Propose ====================
  bot.command("propose", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.split(" ").slice(1);

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.\n\n" +
          "Please use this command in your trading group.",
        { parse_mode: "Markdown" }
      );
    }

    // If no arguments, show help
    if (args.length === 0) {
      return ctx.reply(
        "📝 **Create Trade Proposal**\n\n" +
          "Use this format to propose a trade:\n" +
          "`/propose <from_token> <to_token> <amount> <min_out>`\n\n" +
          "*Examples:*\n" +
          "• `/propose SOL USDC 1.5 150`\n" +
          "  (Trade 1.5 SOL for minimum 150 USDC)\n\n" +
          "• `/propose USDC SOL 100 0.95`\n" +
          "  (Trade 100 USDC for minimum 0.95 SOL)\n\n" +
          "*Supported Tokens:*\n" +
          "• **SOL** - Native Solana token\n" +
          "• **USDC** - USD Coin\n" +
          "• **USDT** - Tether USD\n" +
          "• Or use full token mint address\n\n" +
          "⚠️ *Note:* You must be an approved trader to propose trades.",
        { parse_mode: "Markdown" }
      );
    }

    // Parse arguments
    if (args.length !== 4) {
      return ctx.reply(
        "❌ **Invalid format**\n\n" +
          "Usage: `/propose <from_token> <to_token> <amount> <min_out>`\n\n" +
          "Example: `/propose SOL USDC 1.5 150`",
        { parse_mode: "Markdown" }
      );
    }

    const [fromTokenInput, toTokenInput, amountStr, minOutStr] = args;
    const userId = ctx.from.id.toString();

    try {
      const loadingMsg = await ctx.reply("⏳ **Creating trade proposal...**", {
        parse_mode: "Markdown",
      });

      // Parse tokens
      const fromToken = parseTokenAddress(fromTokenInput!);
      const toToken = parseTokenAddress(toTokenInput!);

      // Parse amounts
      const amount = parseFloat(amountStr!);
      const minOut = parseFloat(minOutStr!);

      if (isNaN(amount) || isNaN(minOut) || amount <= 0 || minOut <= 0) {
        await ctx.deleteMessage(loadingMsg.message_id);
        return ctx.reply(
          "❌ Invalid amount format. Please use positive numbers.",
          { parse_mode: "Markdown" }
        );
      }

      // Determine decimals based on token
      const fromDecimals = fromToken === "So11111111111111111111111111111111111111112" ? 9 : 6;
      const toDecimals = toToken === "So11111111111111111111111111111111111111112" ? 9 : 6;

      // Convert to smallest units
      const amountSmallest = toSmallestUnit(amount, fromDecimals);
      const minOutSmallest = toSmallestUnit(minOut, toDecimals);

      // Call service
      const result = await tradeService.createProposal({
        groupId: chatId,
        telegramId: userId,
        fromToken,
        toToken,
        amount: amountSmallest,
        minimumOut: minOutSmallest,
      });

      await ctx.deleteMessage(loadingMsg.message_id);

      if (result.success) {
        const data = result.data;
        const fromTokenName = getTokenName(fromToken);
        const toTokenName = getTokenName(toToken);

        return ctx.reply(
          `✅ **Trade Proposal Created!**\n\n` +
            `📋 *Proposal ID:* ${data.proposalId}\n` +
            `🔄 *Trade:* ${amountStr} ${fromTokenName} → ${minOutStr} ${toTokenName} (min)\n` +
            `📍 *Address:* \`${data.proposalPdaAddress}\`\n` +
            `🔗 [View on Explorer](${data.explorerUrl})\n\n` +
            `⏳ *Status:* ${data.status.toUpperCase()}\n` +
            `👥 *Approvals:* ${data.approvalCount}/${data.requiredApprovals}\n` +
            `⏰ *Expires:* ${new Date(data.expiresAt).toLocaleString()}\n\n` +
            `Other traders can approve with:\n` +
            `/approve ${data.proposalId}`,
          {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }
        );
      }
    } catch (error: any) {
      console.error("Error creating proposal:", error);

      const errorMsg = error.response?.data?.message || error.message || "Unknown error";

      return ctx.reply(
        `❌ **Failed to create proposal**\n\n` +
          `${errorMsg}\n\n` +
          `Make sure:\n` +
          `• You are an approved trader\n` +
          `• Fund has sufficient balance\n` +
          `• Fund is active`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // ==================== /approve - Show Pending or Approve Specific ====================
  bot.command("approve", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(" ").slice(1);

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      // If no proposal ID provided, show pending proposals
      if (args.length === 0) {
        const loadingMsg = await ctx.reply("⏳ Fetching pending proposals...");

        const result = await tradeService.getPendingProposals(chatId, userId);

        await ctx.deleteMessage(loadingMsg.message_id);

        if (result.success) {
          const proposals = result.data;

          if (proposals.length === 0) {
            return ctx.reply("ℹ️ No pending proposals to approve.");
          }

          let message = `📋 **Pending Proposals** (${proposals.length})\n\n`;

          for (const proposal of proposals) {
            const fromToken = getTokenName(proposal.fromToken);
            const toToken = getTokenName(proposal.toToken);
            const amount = fromSmallestUnit(proposal.amount);
            const minOut = fromSmallestUnit(proposal.minimumOut, 6);

            message +=
              `*Proposal ${proposal.proposalId}*\n` +
              `🔄 ${amount.toFixed(4)} ${fromToken} → ${minOut.toFixed(2)} ${toToken}\n` +
              `👥 Approvals: ${proposal.approvalCount}\n` +
              `⏰ Expires: ${new Date(proposal.expiresAt).toLocaleString()}\n` +
              `✍️ /approve ${proposal.proposalId}\n\n`;
          }

          return ctx.reply(message, { parse_mode: "Markdown" });
        }
      } else {
        // Approve specific proposal
        const proposalId = parseInt(args[0]!);

        if (isNaN(proposalId)) {
          return ctx.reply("❌ Invalid proposal ID. Use a number.");
        }

        const loadingMsg = await ctx.reply(`⏳ Approving proposal ${proposalId}...`);

        const result = await tradeService.approveProposal({
          groupId: chatId,
          telegramId: userId,
          proposalId,
        });

        await ctx.deleteMessage(loadingMsg.message_id);

        if (result.success) {
          const data = result.data;
          const isApproved = data.status === "APPROVED";

          let message =
            `✅ **Approval Recorded!**\n\n` +
            `📋 *Proposal ID:* ${data.proposalId}\n` +
            `👥 *Approvals:* ${data.approvalCount}/${data.requiredApprovals}\n` +
            `📊 *Status:* ${data.status}\n` +
            `🔗 [View Transaction](${data.explorerUrl})\n\n`;

          if (isApproved) {
            message +=
              `🎉 **Proposal is now APPROVED!**\n\n` +
              `The proposal can now be executed.`;
          } else {
            const remaining = data.requiredApprovals - data.approvalCount;
            message += `⏳ Waiting for ${remaining} more approval(s)`;
          }

          return ctx.reply(message, {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          });
        }
      }
    } catch (error: any) {
      console.error("Error approving proposal:", error);
      const errorMsg = error.response?.data?.message || "Failed to approve proposal";
      return ctx.reply(`❌ ${errorMsg}`, { parse_mode: "Markdown" });
    }
  });

  // ==================== /proposals - List All Proposals ====================
  bot.command("proposals", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      const loadingMsg = await ctx.reply("⏳ Fetching proposals...");

      const result = await tradeService.getProposals(chatId, userId);

      await ctx.deleteMessage(loadingMsg.message_id);

      if (result.success) {
        const proposals = result.data;

        if (proposals.length === 0) {
          return ctx.reply("ℹ️ No proposals found for this group.");
        }

        let message = `📋 **All Proposals** (${proposals.length})\n\n`;

        // Show last 10 proposals
        for (const proposal of proposals.slice(0, 10)) {
          const fromToken = getTokenName(proposal.fromToken);
          const toToken = getTokenName(proposal.toToken);
          const amount = fromSmallestUnit(proposal.amount);
          const minOut = fromSmallestUnit(proposal.minimumOut, 6);
          const statusEmoji = getStatusEmoji(proposal.status);

          message +=
            `${statusEmoji} *Proposal ${proposal.proposalId}*\n` +
            `🔄 ${amount.toFixed(4)} ${fromToken} → ${minOut.toFixed(2)} ${toToken}\n` +
            `📊 Status: ${proposal.status}\n` +
            `👥 Approvals: ${proposal.approvalCount}\n\n`;
        }

        if (proposals.length > 10) {
          message += `_Showing 10 of ${proposals.length} proposals_\n\n`;
        }

        message +=
          `*Commands:*\n` +
          `• View details: /proposal <id>\n` +
          `• Approve: /approve <id>\n` +
          `• Pending only: /pending`;

        return ctx.reply(message, { parse_mode: "Markdown" });
      }
    } catch (error: any) {
      console.error("Error fetching proposals:", error);
      const errorMsg = error.response?.data?.message || "Failed to fetch proposals";
      return ctx.reply(`❌ ${errorMsg}`);
    }
  });

  // ==================== /proposal <id> - Get Proposal Details ====================
  bot.command("proposal", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(" ").slice(1);

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.",
        { parse_mode: "Markdown" }
      );
    }

    if (args.length === 0) {
      return ctx.reply(
        "❌ Please provide a proposal ID.\n\nUsage: `/proposal <id>`\nExample: `/proposal 0`",
        { parse_mode: "Markdown" }
      );
    }

    const proposalId = parseInt(args[0]!);

    if (isNaN(proposalId)) {
      return ctx.reply("❌ Invalid proposal ID. Use a number.");
    }

    try {
      const result = await tradeService.getProposalById({
        groupId: chatId,
        telegramId: userId,
        proposalId,
      });

      if (result.success) {
        const p = result.data;
        const fromToken = getTokenName(p.fromToken);
        const toToken = getTokenName(p.toToken);
        const amount = fromSmallestUnit(p.amount);
        const minOut = fromSmallestUnit(p.minimumOut, 6);
        const statusEmoji = getStatusEmoji(p.status);

        let message =
          `${statusEmoji} **Proposal ${p.proposalId} Details**\n\n` +
          `🔄 *Trade:*\n` +
          `   From: ${amount.toFixed(4)} ${fromToken}\n` +
          `   To: ${minOut.toFixed(2)} ${toToken} (minimum)\n\n` +
          `📊 *Status:* ${p.status.toUpperCase()}\n` +
          `👥 *Approvals:* ${p.approvalCount}\n` +
          `👤 *Proposer:* \`${formatAddress(p.proposer)}\`\n\n` +
          `📅 *Created:* ${new Date(p.createdAt).toLocaleString()}\n` +
          `⏰ *Expires:* ${new Date(p.expiresAt).toLocaleString()}\n`;

        if (p.isExpired) {
          message += `⚠️ *EXPIRED*\n`;
        }

        if (p.approvalCount > 0 && p.approvals) {
          message += `\n✅ *Approved by:*\n`;
          p.approvals.slice(0, 5).forEach((approver: string, i: number) => {
            message += `   ${i + 1}. \`${formatAddress(approver)}\`\n`;
          });
        }

        message += `\n*Actions:*\n`;

        if (p.status === "pending" && !p.isExpired) {
          message += `• Approve: /approve ${proposalId}\n`;
        }

        if (p.status === "approved") {
          message += `• ✅ Ready to execute\n`;
        }

        return ctx.reply(message, { parse_mode: "Markdown" });
      }
    } catch (error: any) {
      console.error("Error fetching proposal:", error);
      const errorMsg = error.response?.data?.message || "Proposal not found";
      return ctx.reply(`❌ ${errorMsg}`);
    }
  });

  // ==================== /pending - Show Pending Proposals ====================
  bot.command("pending", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (ctx.chat.type === "private") {
      return ctx.reply(
        "⚠️ This command only works in **group chats**.",
        { parse_mode: "Markdown" }
      );
    }

    try {
      const loadingMsg = await ctx.reply("⏳ Fetching pending proposals...");

      const result = await tradeService.getPendingProposals(chatId, userId);

      await ctx.deleteMessage(loadingMsg.message_id);

      if (result.success) {
        const proposals = result.data;

        if (proposals.length === 0) {
          return ctx.reply("ℹ️ No pending proposals.");
        }

        let message = `⏳ **Pending Proposals** (${proposals.length})\n\n`;

        for (const proposal of proposals) {
          const fromToken = getTokenName(proposal.fromToken);
          const toToken = getTokenName(proposal.toToken);
          const amount = fromSmallestUnit(proposal.amount);
          const minOut = fromSmallestUnit(proposal.minimumOut, 6);

          message +=
            `*Proposal ${proposal.proposalId}*\n` +
            `🔄 ${amount.toFixed(4)} ${fromToken} → ${minOut.toFixed(2)} ${toToken}\n` +
            `👥 Approvals: ${proposal.approvalCount}\n` +
            `⏰ Expires: ${new Date(proposal.expiresAt).toLocaleString()}\n` +
            `✍️ /approve ${proposal.proposalId}\n\n`;
        }

        return ctx.reply(message, { parse_mode: "Markdown" });
      }
    } catch (error: any) {
      console.error("Error fetching pending proposals:", error);
      const errorMsg = error.response?.data?.message || "Failed to fetch proposals";
      return ctx.reply(`❌ ${errorMsg}`);
    }
  });

  // ==================== /tradehelp - Show Trade Commands Help ====================
  bot.command("tradehelp", async (ctx) => {
    ctx.reply(
      "🔰 **Trade Commands**\n\n" +
        "*Trader Management (Admin Only):*\n" +
        "• `/addtrader <wallet>` - Add approved trader\n" +
        "  Example: `/addtrader me`\n" +
        "• `/removetrader <wallet>` - Remove trader\n" +
        "• `/traders` - List approved traders\n\n" +
        "*Proposal Commands:*\n" +
        "• `/propose <from> <to> <amount> <min>` - Create trade proposal\n" +
        "  Example: `/propose SOL USDC 1.5 150`\n" +
        "• `/approve [id]` - Approve proposal or show pending\n" +
        "• `/proposals` - List all proposals\n" +
        "• `/proposal <id>` - View proposal details\n" +
        "• `/pending` - Show pending proposals\n\n" +
        "*Supported Tokens:*\n" +
        "• **SOL** - Solana native token\n" +
        "• **USDC** - USD Coin\n" +
        "• **USDT** - Tether USD\n\n" +
        "*Requirements:*\n" +
        "• Must be an approved trader\n" +
        "• Fund must be active\n" +
        "• Sufficient fund balance\n\n" +
        "Need help? Use /tradehelp",
      { parse_mode: "Markdown" }
    );
  });
}
