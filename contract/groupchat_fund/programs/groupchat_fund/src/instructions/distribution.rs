use anchor_lang::prelude::*;
use crate::contexts::*;
use crate::errors::ErrorCode as CustomError;  // ✅ THIS LINE
use crate::constants::BPS_DENOMINATOR;


pub fn distribute_value(ctx: Context<DistributeValue>) -> Result<()> {
    let fund = &ctx.accounts.fund;
    let member = &ctx.accounts.member;

    require!(fund.is_active, CustomError::FundNotActive);
    require!(member.is_active, CustomError::MemberNotActive);
    require!(member.shares > 0, CustomError::InsufficientShares);
    require!(fund.total_shares > 0, CustomError::SharesRemaining);

    let member_current_value = (member.shares as u128)
        .checked_mul(fund.total_value as u128)
        .ok_or(CustomError::ArithmeticOverflow)?
        .checked_div(fund.total_shares as u128)
        .ok_or(CustomError::ArithmeticOverflow)? as u64;

    require!(member_current_value > 0, CustomError::InsufficientFunds);

    let member_initial_value = member.total_contributed;
    
    let distribution_amount = if member_current_value > member_initial_value {
        let profit = member_current_value
            .checked_sub(member_initial_value)
            .ok_or(CustomError::ArithmeticOverflow)?;
        
        let fee_amount = (profit as u128)
            .checked_mul(fund.trading_fee_bps as u128)
            .ok_or(CustomError::ArithmeticOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(CustomError::ArithmeticOverflow)? as u64;
        
        member_current_value
            .checked_sub(fee_amount)
            .ok_or(CustomError::ArithmeticOverflow)?
    } else {
        member_current_value
    };

    let fund_balance = ctx.accounts.fund.to_account_info().lamports();
    require!(fund_balance >= distribution_amount, CustomError::InsufficientFunds);

    **ctx.accounts.fund.to_account_info().try_borrow_mut_lamports()? -= distribution_amount;
    **ctx.accounts.member_wallet.to_account_info().try_borrow_mut_lamports()? += distribution_amount;

    let fund = &mut ctx.accounts.fund;
    let member = &mut ctx.accounts.member;
    
    fund.total_value = fund.total_value
        .checked_sub(distribution_amount)
        .ok_or(CustomError::ArithmeticOverflow)?;
    
    fund.total_shares = fund.total_shares
        .checked_sub(member.shares)
        .ok_or(CustomError::ArithmeticOverflow)?;
    
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
    msg!("Initial Contribution: {} lamports", member_initial_value);
    msg!("Current Value: {} lamports", member_current_value);
    msg!("Trading Fee: {} lamports", fee_charged);
    msg!("Amount Distributed: {} lamports", distribution_amount);
    msg!("Result: {} ({} lamports)", status, profit_or_loss.abs());
    msg!("========================================");

    Ok(())
}


pub fn distribute_profits(ctx: Context<DistributeProfits>) -> Result<()> {
    let fund = &ctx.accounts.fund;
    let member = &ctx.accounts.member;

    require!(fund.is_active, CustomError::FundNotActive);
    require!(member.is_active, CustomError::MemberNotActive);
    require!(member.shares > 0, CustomError::InsufficientShares);
    require!(fund.total_shares > 0, CustomError::SharesRemaining);

    let member_current_value = (member.shares as u128)
        .checked_mul(fund.total_value as u128)
        .ok_or(CustomError::ArithmeticOverflow)?
        .checked_div(fund.total_shares as u128)
        .ok_or(CustomError::ArithmeticOverflow)? as u64;

    let member_initial_value = member.total_contributed;
    
    require!(
        member_current_value > member_initial_value,
        CustomError::NoProfit
    );

    let profit_amount = member_current_value
        .checked_sub(member_initial_value)
        .ok_or(CustomError::ArithmeticOverflow)?;

    let fee_amount = (profit_amount as u128)
        .checked_mul(fund.trading_fee_bps as u128)
        .ok_or(CustomError::ArithmeticOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(CustomError::ArithmeticOverflow)? as u64;

    let net_profit = profit_amount
        .checked_sub(fee_amount)
        .ok_or(CustomError::ArithmeticOverflow)?;

    let fund_balance = ctx.accounts.fund.to_account_info().lamports();
    require!(fund_balance >= net_profit, CustomError::InsufficientFunds);

    **ctx.accounts.fund.to_account_info().try_borrow_mut_lamports()? -= net_profit;
    **ctx.accounts.member_wallet.to_account_info().try_borrow_mut_lamports()? += net_profit;

    msg!("========================================");
    msg!("PROFIT DISTRIBUTED (Shares Retained)");
    msg!("========================================");
    msg!("Member: {}", member.telegram_id);
    msg!("Shares: {}", member.shares);
    msg!("Member Current Value: {} lamports", member_current_value);
    msg!("Initial Contribution: {} lamports", member_initial_value);
    msg!("Gross Profit: {} lamports", profit_amount);
    msg!("Trading Fee ({} bps): {} lamports", fund.trading_fee_bps, fee_amount);
    msg!("Net Profit Distributed: {} lamports", net_profit);
    msg!("========================================");

    Ok(())
}
