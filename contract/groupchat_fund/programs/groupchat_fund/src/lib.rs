use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("5bDEAfuk7KFuQFdfZUaieL5YtMt3nxUSTGJwcvQuRyu3");

#[program]
pub mod groupchat_fund {
    use super::*;

    pub fn initialize_fund(
        ctx: Context<InitializeFund>,
        fund_name: String,
        min_contribution: u64,
        trading_fee_bps: u16,
    ) -> Result<()> {
        let fund = &mut ctx.accounts.fund;

        fund.authority = ctx.accounts.authority.key();
        fund.fund_name = fund_name;
        fund.total_shares = 0;
        fund.total_value = 0;
        fund.min_contribution = min_contribution;
        fund.trading_fee_bps = trading_fee_bps;
        fund.is_active = true;
        fund.bump = ctx.bumps.fund;

        msg!("Fund initialized: {}", fund.fund_name);
        Ok(())
    }

    pub fn add_member(
        ctx: Context<AddMember>,
        telegram_id: String,
        role: MemberRole,
    ) -> Result<()> {
        let member = &mut ctx.accounts.member;

        member.wallet = ctx.accounts.member_wallet.key();
        member.telegram_id = telegram_id;
        member.role = role;
        member.shares = 0;
        member.total_contributed = 0;
        member.successful_trades = 0;
        member.failed_trades = 0;
        member.reputation_score = 0;
        member.is_active = true;

        msg!("Member added with role: {:?}", role); // Now works because of Copy
        Ok(())
    }

    /// Update a member's role (only fund authority)
    pub fn update_member_role(ctx: Context<UpdateMemberRole>, new_role: MemberRole) -> Result<()> {
        let member = &mut ctx.accounts.member;

        require!(member.is_active, ErrorCode::MemberNotActive);

        member.role = new_role;

        msg!("Member role updated to: {:?}", new_role); // Now works because of Copy
        Ok(())
    }

    /// Contribute funds to the vault
    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        let fund = &mut ctx.accounts.fund;
        let member = &mut ctx.accounts.member;

        require!(fund.is_active, ErrorCode::FundNotActive);
        require!(member.is_active, ErrorCode::MemberNotActive);
        require!(
            amount >= fund.min_contribution,
            ErrorCode::BelowMinContribution
        );

        // Transfer tokens from member to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.member_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.member_wallet.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Calculate shares to mint (simplified: 1:1 ratio if first deposit)
        let shares_to_mint = if fund.total_shares == 0 {
            amount
        } else {
            // shares = (amount * total_shares) / total_value
            (amount as u128)
                .checked_mul(fund.total_shares as u128)
                .unwrap()
                .checked_div(fund.total_value as u128)
                .unwrap() as u64
        };

        // Update state
        member.shares += shares_to_mint;
        member.total_contributed += amount;
        fund.total_shares += shares_to_mint;
        fund.total_value += amount;

        msg!(
            "Contributed {} tokens, minted {} shares",
            amount,
            shares_to_mint
        );
        Ok(())
    }

    /// Execute a trade (only traders and managers)
    pub fn execute_trade(
        ctx: Context<ExecuteTrade>,
        trade_description: String,
        amount: u64,
        expected_outcome: i64,
    ) -> Result<()> {
        let fund = &ctx.accounts.fund;
        let member = &ctx.accounts.member;

        require!(fund.is_active, ErrorCode::FundNotActive);
        require!(member.is_active, ErrorCode::MemberNotActive);
        require!(
            member.role == MemberRole::Trader || member.role == MemberRole::Manager,
            ErrorCode::UnauthorizedTrader
        );
        require!(amount <= fund.total_value, ErrorCode::InsufficientFunds);

        // Store trade record
        let trade = &mut ctx.accounts.trade;
        trade.trader = member.wallet;
        trade.description = trade_description;
        trade.amount = amount;
        trade.expected_outcome = expected_outcome;
        trade.timestamp = Clock::get()?.unix_timestamp;
        trade.is_settled = false;

        msg!("Trade executed by {:?} for {} tokens", member.role, amount);
        Ok(())
    }

    /// Settle a trade and update reputation
    pub fn settle_trade(ctx: Context<SettleTrade>, actual_pnl: i64) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let member = &mut ctx.accounts.member;
        let fund = &mut ctx.accounts.fund;

        require!(!trade.is_settled, ErrorCode::TradeAlreadySettled);

        // Update fund value
        let pnl_amount = (trade.amount as i128 * actual_pnl as i128 / 10000) as i64;
        fund.total_value = (fund.total_value as i64 + pnl_amount) as u64;

        // Update trader stats and reputation
        if actual_pnl > 0 {
            member.successful_trades += 1;
            member.reputation_score += calculate_reputation_gain(actual_pnl);
        } else {
            member.failed_trades += 1;
            member.reputation_score = member
                .reputation_score
                .saturating_sub(calculate_reputation_loss(actual_pnl));
        }

        trade.actual_pnl = actual_pnl;
        trade.is_settled = true;

        msg!("Trade settled with PnL: {} bps", actual_pnl);
        Ok(())
    }

    /// Withdraw shares from the fund
    /// Withdraw shares from the fund
    pub fn withdraw(ctx: Context<Withdraw>, shares_to_burn: u64) -> Result<()> {
        require!(
            ctx.accounts.member.shares >= shares_to_burn,
            ErrorCode::InsufficientShares
        );

        // Calculate withdrawal amount
        let withdrawal_amount = (shares_to_burn as u128)
            .checked_mul(ctx.accounts.fund.total_value as u128)
            .unwrap()
            .checked_div(ctx.accounts.fund.total_shares as u128)
            .unwrap() as u64;

        // Create PDA seeds
        let seeds = &[
            b"fund".as_ref(),
            ctx.accounts.fund.authority.as_ref(),
            &[ctx.accounts.fund.bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer tokens from vault to member
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.member_token_account.to_account_info(),
            authority: ctx.accounts.fund.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, withdrawal_amount)?;

        // Update state
        ctx.accounts.member.shares -= shares_to_burn;
        ctx.accounts.fund.total_shares -= shares_to_burn;
        ctx.accounts.fund.total_value -= withdrawal_amount;

        msg!(
            "Withdrew {} tokens by burning {} shares",
            withdrawal_amount,
            shares_to_burn
        );
        Ok(())
    }

    /// Emergency pause (only authority)
    pub fn pause_fund(ctx: Context<PauseFund>) -> Result<()> {
        let fund = &mut ctx.accounts.fund;
        fund.is_active = false;
        msg!("Fund paused");
        Ok(())
    }

    /// Resume fund (only authority)
    pub fn resume_fund(ctx: Context<ResumeFund>) -> Result<()> {
        let fund = &mut ctx.accounts.fund;
        fund.is_active = true;
        msg!("Fund resumed");
        Ok(())
    }
}

// Helper functions
fn calculate_reputation_gain(pnl_bps: i64) -> u32 {
    (pnl_bps.max(0) / 10) as u32
}

fn calculate_reputation_loss(pnl_bps: i64) -> u32 {
    (pnl_bps.abs() / 5) as u32
}

// Account Structures
#[account]
pub struct Fund {
    pub authority: Pubkey,
    pub fund_name: String,
    pub total_shares: u64,
    pub total_value: u64,
    pub min_contribution: u64,
    pub trading_fee_bps: u16,
    pub is_active: bool,
    pub bump: u8,
}

#[account]
pub struct Member {
    pub wallet: Pubkey,
    pub telegram_id: String,
    pub role: MemberRole,
    pub shares: u64,
    pub total_contributed: u64,
    pub successful_trades: u32,
    pub failed_trades: u32,
    pub reputation_score: u32,
    pub is_active: bool,
}

#[account]
pub struct Trade {
    pub trader: Pubkey,
    pub description: String,
    pub amount: u64,
    pub expected_outcome: i64,
    pub actual_pnl: i64,
    pub timestamp: i64,
    pub is_settled: bool,
}

// FIXED: Added Copy trait
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MemberRole {
    Contributor,
    Trader,
    Manager,
}

// Context Structures

#[derive(Accounts)]
pub struct InitializeFund<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 50) + 8 + 8 + 8 + 2 + 1 + 1, // Added string length
        seeds = [b"fund", authority.key().as_ref()],
        bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>, // FIXED: Now properly imported
}

#[derive(Accounts)]
pub struct AddMember<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 50) + 1 + 8 + 8 + 4 + 4 + 4 + 1, // Added string length
        seeds = [b"member", fund.key().as_ref(), member_wallet.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,

    /// CHECK: The wallet that will be associated with this member
    pub member_wallet: AccountInfo<'info>,

    #[account(mut, constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMemberRole<'info> {
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub member: Account<'info, Member>,

    #[account(constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub member: Account<'info, Member>,

    #[account(mut)]
    pub member_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub member_wallet: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    pub fund: Account<'info, Fund>,

    pub member: Account<'info, Member>,

    #[account(
        init,
        payer = trader,
        space = 8 + 32 + (4 + 256) + 8 + 8 + 8 + 8 + 1 // Fixed string length
    )]
    pub trade: Account<'info, Trade>,

    #[account(mut, constraint = trader.key() == member.wallet)]
    pub trader: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleTrade<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub trade: Account<'info, Trade>,

    #[account(mut, constraint = member.wallet == trade.trader)]
    pub member: Account<'info, Member>,

    #[account(constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub member: Account<'info, Member>,

    #[account(mut)]
    pub member_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut, constraint = member_wallet.key() == member.wallet)]
    pub member_wallet: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PauseFund<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResumeFund<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,
}

// Error Codes

#[error_code]
pub enum ErrorCode {
    #[msg("Fund is not active")]
    FundNotActive,

    #[msg("Member is not active")]
    MemberNotActive,

    #[msg("Contribution below minimum required")]
    BelowMinContribution,

    #[msg("Unauthorized to execute trades")]
    UnauthorizedTrader,

    #[msg("Insufficient funds in vault")]
    InsufficientFunds,

    #[msg("Trade already settled")]
    TradeAlreadySettled,

    #[msg("Insufficient shares to withdraw")]
    InsufficientShares,
}
