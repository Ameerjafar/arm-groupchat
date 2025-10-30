use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer as SystemTransfer};
use crate::contexts::*;
use crate::errors::ErrorCode as CustomError;  // ✅ Add this import

pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
    require!(ctx.accounts.fund.is_active, CustomError::FundNotActive);
    require!(ctx.accounts.member.is_active, CustomError::MemberNotActive);
    require!(
        amount >= ctx.accounts.fund.min_contribution,
        CustomError::BelowMinContribution
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

pub fn withdraw(ctx: Context<Withdraw>, shares_to_burn: u64) -> Result<()> {
    require!(
        ctx.accounts.member.shares >= shares_to_burn,
        CustomError::InsufficientShares
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
