use anchor_lang::prelude::*;
use crate::contexts::*;
use crate::errors::ErrorCode as CustomError;  // ✅ This imports YOUR custom ErrorCode


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
        CustomError::UnauthorizedClose
    );

    require!(fund.total_value == 0, CustomError::FundNotEmpty);      // ✅ CHANGED
    require!(fund.total_shares == 0, CustomError::SharesRemaining);  // ✅ CHANGED

    msg!("Fund closed for group: {}", fund.group_id);
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