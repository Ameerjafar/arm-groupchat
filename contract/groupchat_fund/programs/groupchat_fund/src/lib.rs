use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer as SystemTransfer};
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, SyncNative};

declare_id!("9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy");

#[program]
pub mod groupchat_fund {
    use super::*;

    pub fn initialize_fund(
        ctx: Context<InitializeFund>,
        group_id: String,
        fund_name: String,
        min_contribution: u64,
        trading_fee_bps: u16,
        required_approvals: u8,
    ) -> Result<()> {
        let fund = &mut ctx.accounts.fund;
        fund.authority = ctx.accounts.authority.key();
        fund.group_id = group_id.clone();
        fund.fund_name = fund_name;
        fund.total_shares = 0;
        fund.total_value = 0;
        fund.min_contribution = min_contribution;
        fund.trading_fee_bps = trading_fee_bps;
        fund.is_active = true;
        fund.bump = ctx.bumps.fund;
        fund.approved_traders = vec![];
        fund.required_approvals = required_approvals;
        fund.next_proposal_id = 0;
        msg!("Fund initialized for group: {}", group_id);
        Ok(())
    }

    pub fn close_fund(ctx: Context<CloseFund>) -> Result<()> {
        let fund = &ctx.accounts.fund;

        require!(
            ctx.accounts.authority.key() == fund.authority,
            ErrorCode::UnauthorizedClose
        );

        require!(fund.total_value == 0, ErrorCode::FundNotEmpty);
        require!(fund.total_shares == 0, ErrorCode::SharesRemaining);

        msg!("Fund closed for group: {}", fund.group_id);
        Ok(())
    }

    pub fn add_member(ctx: Context<AddMember>, telegram_id: String) -> Result<()> {
        let member = &mut ctx.accounts.member;
        member.wallet = ctx.accounts.member_wallet.key();
        member.telegram_id = telegram_id;
        member.role = MemberRole::Contributor;
        member.shares = 0;
        member.total_contributed = 0;
        member.successful_trades = 0;
        member.failed_trades = 0;
        member.reputation_score = 0;
        member.is_active = true;
        msg!("Member registered");
        Ok(())
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        require!(ctx.accounts.fund.is_active, ErrorCode::FundNotActive);
        require!(ctx.accounts.member.is_active, ErrorCode::MemberNotActive);
        require!(
            amount >= ctx.accounts.fund.min_contribution,
            ErrorCode::BelowMinContribution
        );

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            SystemTransfer {
                from: ctx.accounts.member_wallet.to_account_info(),
                to: ctx.accounts.fund.to_account_info(),
            },
        );
        transfer(cpi_context, amount)?;

        let fund = &mut ctx.accounts.fund;
        let member = &mut ctx.accounts.member;

        let shares_to_mint = if fund.total_shares == 0 {
            amount
        } else {
            (amount as u128)
                .checked_mul(fund.total_shares as u128)
                .unwrap()
                .checked_div(fund.total_value as u128)
                .unwrap() as u64
        };

        member.shares += shares_to_mint;
        member.total_contributed += amount;
        fund.total_shares += shares_to_mint;
        fund.total_value += amount;

        msg!(
            "Contributed {} lamports, minted {} shares",
            amount,
            shares_to_mint
        );
        Ok(())
    }

    pub fn update_member_role(ctx: Context<UpdateMemberRole>, new_role: MemberRole) -> Result<()> {
        let member = &mut ctx.accounts.member;
        require!(member.is_active, ErrorCode::MemberNotActive);
        member.role = new_role;
        msg!("Member role updated to: {:?}", new_role);
        Ok(())
    }

    // Trade proposal system
    pub fn propose_trade(
        ctx: Context<ProposeTradeCtx>,
        from_token: Pubkey,
        to_token: Pubkey,
        amount: u64,
        minimum_out: u64,
    ) -> Result<()> {
        let fund = &mut ctx.accounts.fund;
        let member = &ctx.accounts.member;

        require!(
            member.role == MemberRole::Trader || member.role == MemberRole::Manager,
            ErrorCode::UnauthorizedTrader
        );

        require!(
            fund.approved_traders.contains(&member.wallet),
            ErrorCode::NotApprovedTrader
        );

        require!(amount <= fund.total_value, ErrorCode::InsufficientFunds);

        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;

        proposal.fund = fund.key();
        proposal.proposer = member.wallet;
        proposal.proposal_id = fund.next_proposal_id;
        proposal.from_token = from_token;
        proposal.to_token = to_token;
        proposal.amount = amount;
        proposal.minimum_out = minimum_out;
        proposal.approvals = vec![];
        proposal.status = ProposalStatus::Pending;
        proposal.created_at = clock.unix_timestamp;
        proposal.expires_at = clock.unix_timestamp + 86400;
        proposal.bump = ctx.bumps.proposal;

        fund.next_proposal_id += 1;

        msg!(
            "Trade proposal {} created: swap {} from {:?} to {:?}",
            proposal.proposal_id,
            amount,
            from_token,
            to_token
        );
        Ok(())
    }

    pub fn approve_proposal(ctx: Context<ApproveProposalCtx>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let member = &ctx.accounts.member;
        let fund = &ctx.accounts.fund;
        let clock = Clock::get()?;

        require!(
            member.role == MemberRole::Trader || member.role == MemberRole::Manager,
            ErrorCode::UnauthorizedTrader
        );

        require!(
            fund.approved_traders.contains(&member.wallet),
            ErrorCode::NotApprovedTrader
        );

        require!(
            proposal.status == ProposalStatus::Pending,
            ErrorCode::ProposalNotPending
        );

        require!(
            clock.unix_timestamp < proposal.expires_at,
            ErrorCode::ProposalExpired
        );

        require!(
            proposal.proposer != member.wallet,
            ErrorCode::CannotApproveSelf
        );

        require!(
            !proposal.approvals.contains(&member.wallet),
            ErrorCode::AlreadyApproved
        );

        proposal.approvals.push(member.wallet);

        if proposal.approvals.len() >= fund.required_approvals as usize {
            proposal.status = ProposalStatus::Approved;
            msg!(
                "Proposal {} approved! Ready to execute ({} approvals)",
                proposal.proposal_id,
                proposal.approvals.len()
            );
        } else {
            msg!(
                "Proposal {} approval: {}/{}",
                proposal.proposal_id,
                proposal.approvals.len(),
                fund.required_approvals
            );
        }

        Ok(())
    }

    pub fn reject_proposal(ctx: Context<RejectProposalCtx>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;

        require!(
            proposal.status == ProposalStatus::Pending,
            ErrorCode::ProposalNotPending
        );

        proposal.status = ProposalStatus::Rejected;
        msg!("Proposal {} rejected", proposal.proposal_id);
        Ok(())
    }

    pub fn manage_trader(ctx: Context<ManageTrader>, trader: Pubkey, add: bool) -> Result<()> {
        let fund = &mut ctx.accounts.fund;

        if add {
            require!(
                fund.approved_traders.len() < 10,
                ErrorCode::TooManyTraders
            );
            require!(
                !fund.approved_traders.contains(&trader),
                ErrorCode::TraderAlreadyAdded
            );
            fund.approved_traders.push(trader);
            msg!("Trader added: {}", trader);
        } else {
            fund.approved_traders.retain(|&x| x != trader);
            msg!("Trader removed: {}", trader);
        }

        Ok(())
    }

    pub fn set_approval_threshold(ctx: Context<SetThreshold>, threshold: u8) -> Result<()> {
        let fund = &mut ctx.accounts.fund;

        require!(
            threshold > 0 && threshold <= fund.approved_traders.len() as u8,
            ErrorCode::InvalidThreshold
        );

        fund.required_approvals = threshold;
        msg!("Approval threshold set to: {}", threshold);
        Ok(())
    }

    // Simple swap for devnet testing
    pub fn execute_simple_swap(ctx: Context<ExecuteSimpleSwap>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let fund = &ctx.accounts.fund;

        require!(
            proposal.status == ProposalStatus::Approved,
            ErrorCode::ProposalNotApproved
        );

        require!(fund.is_active, ErrorCode::FundNotActive);

        // Simple 1:1 swap for testing
        // In production, this would integrate with Jupiter or your custom AMM
        
        // Transfer from_token to pool (simplified)
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.fund_from_token.to_account_info(),
                    to: ctx.accounts.pool_from_token.to_account_info(),
                    authority: ctx.accounts.fund.to_account_info(),
                },
                &[&[
                    b"fund",
                    fund.group_id.as_bytes(),
                    &[fund.bump],
                ]],
            ),
            proposal.amount,
        )?;

        // Transfer to_token from pool to fund
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_to_token.to_account_info(),
                    to: ctx.accounts.fund_to_token.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
            ),
            proposal.minimum_out,
        )?;

        proposal.status = ProposalStatus::Executed;
        
        msg!(
            "Swap executed for proposal {}: {} tokens swapped",
            proposal.proposal_id,
            proposal.amount
        );
        Ok(())
    }

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

    pub fn settle_trade(ctx: Context<SettleTrade>, actual_pnl: i64) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let member = &mut ctx.accounts.member;
        let fund = &mut ctx.accounts.fund;

        require!(!trade.is_settled, ErrorCode::TradeAlreadySettled);

        let pnl_amount = (trade.amount as i128 * actual_pnl as i128 / 10000) as i64;
        fund.total_value = (fund.total_value as i64 + pnl_amount) as u64;

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

    pub fn withdraw(ctx: Context<Withdraw>, shares_to_burn: u64) -> Result<()> {
        require!(
            ctx.accounts.member.shares >= shares_to_burn,
            ErrorCode::InsufficientShares
        );

        let withdrawal_amount = (shares_to_burn as u128)
            .checked_mul(ctx.accounts.fund.total_value as u128)
            .unwrap()
            .checked_div(ctx.accounts.fund.total_shares as u128)
            .unwrap() as u64;

        **ctx
            .accounts
            .fund
            .to_account_info()
            .try_borrow_mut_lamports()? -= withdrawal_amount;
        **ctx
            .accounts
            .member_wallet
            .to_account_info()
            .try_borrow_mut_lamports()? += withdrawal_amount;

        ctx.accounts.member.shares -= shares_to_burn;
        ctx.accounts.fund.total_shares -= shares_to_burn;
        ctx.accounts.fund.total_value -= withdrawal_amount;

        msg!(
            "Withdrew {} lamports by burning {} shares",
            withdrawal_amount,
            shares_to_burn
        );
        Ok(())
    }

    pub fn pause_fund(ctx: Context<PauseFund>) -> Result<()> {
        ctx.accounts.fund.is_active = false;
        msg!("Fund paused");
        Ok(())
    }

    pub fn resume_fund(ctx: Context<ResumeFund>) -> Result<()> {
        ctx.accounts.fund.is_active = true;
        msg!("Fund resumed");
        Ok(())
    }
}

fn calculate_reputation_gain(pnl_bps: i64) -> u32 {
    (pnl_bps.max(0) / 10) as u32
}

fn calculate_reputation_loss(pnl_bps: i64) -> u32 {
    (pnl_bps.abs() / 5) as u32
}


#[account]
pub struct Fund {
    pub authority: Pubkey,
    pub group_id: String,
    pub fund_name: String,
    pub total_shares: u64,
    pub total_value: u64,
    pub min_contribution: u64,
    pub trading_fee_bps: u16,
    pub is_active: bool,
    pub bump: u8,
    pub approved_traders: Vec<Pubkey>,
    pub required_approvals: u8,
    pub next_proposal_id: u64,
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

#[account]
pub struct TradeProposal {
    pub fund: Pubkey,
    pub proposer: Pubkey,
    pub proposal_id: u64,
    pub from_token: Pubkey,
    pub to_token: Pubkey,
    pub amount: u64,
    pub minimum_out: u64,
    pub approvals: Vec<Pubkey>,
    pub status: ProposalStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

// ==================== ENUMS ====================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MemberRole {
    Contributor,
    Trader,
    Manager,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProposalStatus {
    Pending,
    Approved,
    Rejected,
    Executed,
    Expired,
}

// ==================== CONTEXTS ====================

#[derive(Accounts)]
#[instruction(group_id: String)]
pub struct InitializeFund<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 50) + (4 + 50) + 8 + 8 + 8 + 2 + 1 + 1 + (4 + 32 * 10) + 1 + 8,
        seeds = [b"fund", group_id.as_bytes()],
        bump
    )]
    pub fund: Account<'info, Fund>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseFund<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"fund", fund.group_id.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(telegram_id: String)]
pub struct AddMember<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,
    #[account(
        init,
        payer = member_wallet,
        space = 8 + 32 + (4 + 50) + 1 + 8 + 8 + 4 + 4 + 4 + 1,
        seeds = [b"member", fund.key().as_ref(), member_wallet.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,
    #[account(mut)]
    pub member_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,
    #[account(
        mut,
        seeds = [b"member", fund.key().as_ref(), member_wallet.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,
    #[account(mut)]
    pub member_wallet: Signer<'info>,
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
pub struct ProposeTradeCtx<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(
        seeds = [b"member", fund.key().as_ref(), proposer.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,

    #[account(
        init,
        payer = proposer,
        space = 8 + 32 + 32 + 8 + 32 + 32 + 8 + 8 + (4 + 32 * 10) + 1 + 8 + 8 + 1,
        seeds = [b"proposal", fund.key().as_ref(), &fund.next_proposal_id.to_le_bytes()],
        bump
    )]
    pub proposal: Account<'info, TradeProposal>,

    #[account(mut)]
    pub proposer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveProposalCtx<'info> {
    pub fund: Account<'info, Fund>,

    #[account(
        seeds = [b"member", fund.key().as_ref(), approver.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,

    #[account(
        mut,
        seeds = [b"proposal", fund.key().as_ref(), &proposal.proposal_id.to_le_bytes()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, TradeProposal>,

    pub approver: Signer<'info>,
}

#[derive(Accounts)]
pub struct RejectProposalCtx<'info> {
    pub fund: Account<'info, Fund>,

    #[account(
        mut,
        seeds = [b"proposal", fund.key().as_ref(), &proposal.proposal_id.to_le_bytes()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, TradeProposal>,

    #[account(constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ManageTrader<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetThreshold<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteSimpleSwap<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,

    #[account(
        mut,
        seeds = [b"proposal", fund.key().as_ref(), &proposal.proposal_id.to_le_bytes()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, TradeProposal>,

    #[account(mut)]
    pub fund_from_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fund_to_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool_from_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool_to_token: Account<'info, TokenAccount>,

    /// CHECK: Pool authority for signing
    pub pool_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    pub fund: Account<'info, Fund>,
    pub member: Account<'info, Member>,
    #[account(init, payer = trader, space = 8 + 32 + (4 + 256) + 8 + 8 + 8 + 8 + 1)]
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
    #[account(mut, constraint = member_wallet.key() == member.wallet)]
    pub member_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
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
    #[msg("Only fund authority can close the fund")]
    UnauthorizedClose,
    #[msg("Fund must be empty (total_value = 0) before closing")]
    FundNotEmpty,
    #[msg("All shares must be withdrawn before closing")]
    SharesRemaining,
    #[msg("Not an approved trader")]
    NotApprovedTrader,
    #[msg("Proposal not in pending status")]
    ProposalNotPending,
    #[msg("Proposal has expired")]
    ProposalExpired,
    #[msg("Cannot approve your own proposal")]
    CannotApproveSelf,
    #[msg("Already approved this proposal")]
    AlreadyApproved,
    #[msg("Maximum traders reached (10)")]
    TooManyTraders,
    #[msg("Trader already in approved list")]
    TraderAlreadyAdded,
    #[msg("Invalid approval threshold")]
    InvalidThreshold,
    #[msg("Proposal not approved yet")]
    ProposalNotApproved,
}
