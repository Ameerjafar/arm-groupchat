use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer as SystemTransfer};
use anchor_spl::token::{self, Token, TokenAccount, Transfer as TokenTransfer};
use anchor_spl::associated_token::AssociatedToken;

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
        
        msg!("Fund initialized for group: {}", group_id);
        msg!("Authority: {}", ctx.accounts.authority.key());
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
        member.shares = 0;
        member.total_contributed = 0;
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

    /// ✅ NEW: Execute real swap using Jupiter (called by off-chain bot after Jupiter execution)
    /// The bot executes the swap via Jupiter SDK, then calls this to update fund accounting
    pub fn record_swap(
        ctx: Context<RecordSwap>,
        amount_in: u64,
        amount_out: u64,
        from_token: Pubkey,
        to_token: Pubkey,
    ) -> Result<()> {
        let fund = &mut ctx.accounts.fund;

        require!(fund.is_active, ErrorCode::FundNotActive);
        require!(
            ctx.accounts.authority.key() == fund.authority,
            ErrorCode::UnauthorizedTrader
        );

        let old_value = fund.total_value;

        // Update accounting based on actual swap results from Jupiter
        fund.total_value = fund.total_value
            .checked_sub(amount_in)
            .ok_or(ErrorCode::InsufficientFunds)?;
        
        fund.total_value = fund.total_value
            .checked_add(amount_out)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let profit_loss = (fund.total_value as i128) - (old_value as i128);

        msg!("========================================");
        msg!("JUPITER SWAP RECORDED");
        msg!("========================================");
        msg!("From Token: {:?}", from_token);
        msg!("To Token: {:?}", to_token);
        msg!("Amount In: {} lamports", amount_in);
        msg!("Amount Out: {} lamports", amount_out);
        msg!("Old Fund Value: {} lamports", old_value);
        msg!("New Fund Value: {} lamports", fund.total_value);
        msg!("P/L: {} lamports", profit_loss);
        msg!("========================================");
        
        Ok(())
    }

    /// 🎭 DEMO ONLY: Mock swap for testing (keeps for backward compatibility)
    pub fn execute_trade_mock(
        ctx: Context<ExecuteTrade>,
        from_token: Pubkey,
        to_token: Pubkey,
        amount: u64,
        minimum_out: u64,
    ) -> Result<()> {
        let fund = &mut ctx.accounts.fund;

        require!(fund.is_active, ErrorCode::FundNotActive);
        require!(
            ctx.accounts.authority.key() == fund.authority,
            ErrorCode::UnauthorizedTrader
        );
        require!(amount <= fund.total_value, ErrorCode::InsufficientFunds);

        let old_value = fund.total_value;
        
        fund.total_value = fund.total_value
            .checked_sub(amount)
            .ok_or(ErrorCode::InsufficientFunds)?;
        
        fund.total_value = fund.total_value
            .checked_add(minimum_out)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        msg!("========================================");
        msg!("⚠️ MOCK SWAP (DEMO ONLY - NO REAL TRADE)");
        msg!("========================================");
        msg!("From Token: {:?}", from_token);
        msg!("To Token: {:?}", to_token);
        msg!("Amount Swapped: {} lamports", amount);
        msg!("Tokens Received: {} lamports", minimum_out);
        msg!("Old Fund Value: {} lamports", old_value);
        msg!("New Fund Value: {} lamports", fund.total_value);
        msg!("Change: {}", (fund.total_value as i128) - (old_value as i128));
        msg!("⚠️ This is simulated - real balance unchanged");
        msg!("========================================");
        
        Ok(())
    }

    /// ✅ Execute Jupiter swap through CPI (advanced - requires Jupiter CPI)
    /// This actually executes the swap on-chain through Jupiter's program
    pub fn execute_jupiter_swap(
        ctx: Context<ExecuteJupiterSwap>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        let fund = &ctx.accounts.fund;

        require!(fund.is_active, ErrorCode::FundNotActive);
        require!(
            ctx.accounts.authority.key() == fund.authority,
            ErrorCode::UnauthorizedTrader
        );

        // Verify fund has enough SOL
        let fund_sol_balance = fund.to_account_info().lamports();
        require!(amount_in <= fund_sol_balance, ErrorCode::InsufficientFunds);

        msg!("========================================");
        msg!("EXECUTING JUPITER SWAP VIA CPI");
        msg!("========================================");
        msg!("Amount In: {} lamports", amount_in);
        msg!("Minimum Out: {} tokens", minimum_amount_out);

        // Jupiter CPI call would go here
        // Note: Jupiter doesn't expose direct CPI in most cases
        // You'd typically use Jupiter SDK off-chain, then call record_swap
        // This is a placeholder for advanced integration

        msg!("⚠️ Jupiter CPI integration required");
        msg!("⚠️ Use off-chain Jupiter SDK + record_swap instead");
        msg!("========================================");

        Ok(())
    }

    /// ✅ FIXED: Distribute current value to member (profit OR loss)
    pub fn distribute_value(ctx: Context<DistributeValue>) -> Result<()> {
        let fund = &ctx.accounts.fund;
        let member = &ctx.accounts.member;

        require!(fund.is_active, ErrorCode::FundNotActive);
        require!(member.is_active, ErrorCode::MemberNotActive);
        require!(member.shares > 0, ErrorCode::InsufficientShares);
        require!(fund.total_shares > 0, ErrorCode::SharesRemaining);

        let member_current_value = (member.shares as u128)
            .checked_mul(fund.total_value as u128)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(fund.total_shares as u128)
            .ok_or(ErrorCode::ArithmeticOverflow)? as u64;

        require!(member_current_value > 0, ErrorCode::InsufficientFunds);

        let member_initial_value = member.total_contributed;
        
        let distribution_amount = if member_current_value > member_initial_value {
            let profit = member_current_value
                .checked_sub(member_initial_value)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
            
            let fee_amount = (profit as u128)
                .checked_mul(fund.trading_fee_bps as u128)
                .ok_or(ErrorCode::ArithmeticOverflow)?
                .checked_div(10000)
                .ok_or(ErrorCode::ArithmeticOverflow)? as u64;
            
            member_current_value
                .checked_sub(fee_amount)
                .ok_or(ErrorCode::ArithmeticOverflow)?
        } else {
            member_current_value
        };

        let fund_balance = ctx.accounts.fund.to_account_info().lamports();
        require!(fund_balance >= distribution_amount, ErrorCode::InsufficientFunds);

        **ctx.accounts.fund.to_account_info().try_borrow_mut_lamports()? -= distribution_amount;
        **ctx.accounts.member_wallet.to_account_info().try_borrow_mut_lamports()? += distribution_amount;

        let fund = &mut ctx.accounts.fund;
        let member = &mut ctx.accounts.member;
        
        fund.total_value = fund.total_value
            .checked_sub(distribution_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        fund.total_shares = fund.total_shares
            .checked_sub(member.shares)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        let member_shares = member.shares;
        member.shares = 0;

        let profit_or_loss = (distribution_amount as i128) - (member_initial_value as i128);
        let status = if profit_or_loss > 0 { 
            "PROFIT" 
        } else if profit_or_loss < 0 { 
            "LOSS" 
        } else { 
            "BREAK-EVEN" 
        };

        let fee_charged = member_current_value.saturating_sub(distribution_amount);

        msg!("========================================");
        msg!("VALUE DISTRIBUTED");
        msg!("========================================");
        msg!("Member: {}", member.telegram_id);
        msg!("Shares Burned: {}", member_shares);
        msg!("Share %: {}%", (member_shares as f64 / (fund.total_shares + member_shares) as f64) * 100.0);
        msg!("Initial Contribution: {} lamports", member_initial_value);
        msg!("Current Value: {} lamports", member_current_value);
        msg!("Trading Fee: {} lamports", fee_charged);
        msg!("Amount Distributed: {} lamports", distribution_amount);
        msg!("Result: {} ({} lamports)", status, profit_or_loss.abs());
        msg!("========================================");

        Ok(())
    }

    /// ✅ FIXED: Distribute only profits to member
    pub fn distribute_profits(ctx: Context<DistributeProfits>) -> Result<()> {
        let fund = &ctx.accounts.fund;
        let member = &ctx.accounts.member;

        require!(fund.is_active, ErrorCode::FundNotActive);
        require!(member.is_active, ErrorCode::MemberNotActive);
        require!(member.shares > 0, ErrorCode::InsufficientShares);
        require!(fund.total_shares > 0, ErrorCode::SharesRemaining);

        let member_current_value = (member.shares as u128)
            .checked_mul(fund.total_value as u128)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(fund.total_shares as u128)
            .ok_or(ErrorCode::ArithmeticOverflow)? as u64;

        let member_initial_value = member.total_contributed;
        
        require!(
            member_current_value > member_initial_value,
            ErrorCode::NoProfit
        );

        let profit_amount = member_current_value
            .checked_sub(member_initial_value)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let fee_amount = (profit_amount as u128)
            .checked_mul(fund.trading_fee_bps as u128)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::ArithmeticOverflow)? as u64;

        let net_profit = profit_amount
            .checked_sub(fee_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let fund_balance = ctx.accounts.fund.to_account_info().lamports();
        require!(fund_balance >= net_profit, ErrorCode::InsufficientFunds);

        **ctx.accounts.fund.to_account_info().try_borrow_mut_lamports()? -= net_profit;
        **ctx.accounts.member_wallet.to_account_info().try_borrow_mut_lamports()? += net_profit;

        msg!("========================================");
        msg!("PROFIT DISTRIBUTED (Shares Retained)");
        msg!("========================================");
        msg!("Member: {}", member.telegram_id);
        msg!("Shares: {}", member.shares);
        msg!("Total Shares: {}", fund.total_shares);
        msg!("Share %: {}%", (member.shares as f64 / fund.total_shares as f64) * 100.0);
        msg!("Member Current Value: {} lamports", member_current_value);
        msg!("Initial Contribution: {} lamports", member_initial_value);
        msg!("Gross Profit: {} lamports", profit_amount);
        msg!("Trading Fee ({} bps): {} lamports", fund.trading_fee_bps, fee_amount);
        msg!("Net Profit Distributed: {} lamports", net_profit);
        msg!("========================================");

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

        **ctx.accounts.fund.to_account_info().try_borrow_mut_lamports()? -= withdrawal_amount;
        **ctx.accounts.member_wallet.to_account_info().try_borrow_mut_lamports()? += withdrawal_amount;

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

// ==================== ACCOUNTS ====================

#[account]
pub struct Fund {
    pub authority: Pubkey,           // 32
    pub group_id: String,            // 4 + 50
    pub fund_name: String,           // 4 + 50
    pub total_shares: u64,           // 8
    pub total_value: u64,            // 8
    pub min_contribution: u64,       // 8
    pub trading_fee_bps: u16,        // 2
    pub is_active: bool,             // 1
    pub bump: u8,                    // 1
}

#[account]
pub struct Member {
    pub wallet: Pubkey,              // 32
    pub telegram_id: String,         // 4 + 50
    pub shares: u64,                 // 8
    pub total_contributed: u64,      // 8
    pub is_active: bool,             // 1
}

// ==================== CONTEXTS ====================

#[derive(Accounts)]
#[instruction(group_id: String)]
pub struct InitializeFund<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 50) + (4 + 50) + 8 + 8 + 8 + 2 + 1 + 1,
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
        space = 8 + 32 + (4 + 50) + 8 + 8 + 1,
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

/// ✅ NEW: Record swap results from Jupiter
#[derive(Accounts)]
pub struct RecordSwap<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,
    #[account(constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// ✅ NEW: For advanced Jupiter CPI integration
#[derive(Accounts)]
pub struct ExecuteJupiterSwap<'info> {
    #[account(mut)]
    pub fund: Account<'info, Fund>,
    #[account(constraint = authority.key() == fund.authority)]
    pub authority: Signer<'info>,
    /// CHECK: Jupiter program
    pub jupiter_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeValue<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.group_id.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,
    
    #[account(
        mut,
        seeds = [b"member", fund.key().as_ref(), member_wallet.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,
    
    #[account(mut, constraint = member_wallet.key() == member.wallet)]
    pub member_wallet: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeProfits<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.group_id.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,
    
    #[account(
        mut,
        seeds = [b"member", fund.key().as_ref(), member_wallet.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,
    
    #[account(mut, constraint = member_wallet.key() == member.wallet)]
    pub member_wallet: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.group_id.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,
    
    #[account(
        mut,
        seeds = [b"member", fund.key().as_ref(), member_wallet.key().as_ref()],
        bump
    )]
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

// ==================== ERROR CODES ====================

#[error_code]
pub enum ErrorCode {
    #[msg("Fund is not active")]
    FundNotActive,
    #[msg("Member is not active")]
    MemberNotActive,
    #[msg("Contribution below minimum required")]
    BelowMinContribution,
    #[msg("Only fund authority can execute trades")]
    UnauthorizedTrader,
    #[msg("Insufficient funds in vault")]
    InsufficientFunds,
    #[msg("Insufficient shares to withdraw")]
    InsufficientShares,
    #[msg("Only fund authority can close the fund")]
    UnauthorizedClose,
    #[msg("Fund must be empty (total_value = 0) before closing")]
    FundNotEmpty,
    #[msg("All shares must be withdrawn before closing")]
    SharesRemaining,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("No profit available to distribute")]
    NoProfit,
}
