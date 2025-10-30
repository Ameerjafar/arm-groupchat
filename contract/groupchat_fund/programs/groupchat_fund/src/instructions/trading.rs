use anchor_lang::prelude::*;
use crate::contexts::*;
use crate::errors::ErrorCode as CustomError;  // ✅ THIS LINE


pub fn record_swap(
    ctx: Context<RecordSwap>,
    amount_in: u64,
    amount_out: u64,
    from_token: Pubkey,
    to_token: Pubkey,
) -> Result<()> {
    let fund = &mut ctx.accounts.fund;

    require!(fund.is_active, CustomError::FundNotActive);
    require!(
        ctx.accounts.authority.key() == fund.authority,
        CustomError::UnauthorizedTrader
    );

    let old_value = fund.total_value;

    fund.total_value = fund.total_value
        .checked_sub(amount_in)
        .ok_or(CustomError::InsufficientFunds)?;
    
    fund.total_value = fund.total_value
        .checked_add(amount_out)
        .ok_or(CustomError::ArithmeticOverflow)?;

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


pub fn execute_trade_mock(
    ctx: Context<ExecuteTrade>,
    from_token: Pubkey,
    to_token: Pubkey,
    amount: u64,
    minimum_out: u64,
) -> Result<()> {
    let fund = &mut ctx.accounts.fund;

    require!(fund.is_active, CustomError::FundNotActive);
    require!(
        ctx.accounts.authority.key() == fund.authority,
        CustomError::UnauthorizedTrader
    );
    require!(amount <= fund.total_value, CustomError::InsufficientFunds);

    let old_value = fund.total_value;
    
    fund.total_value = fund.total_value
        .checked_sub(amount)
        .ok_or(CustomError::InsufficientFunds)?;
    
    fund.total_value = fund.total_value
        .checked_add(minimum_out)
        .ok_or(CustomError::ArithmeticOverflow)?;

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


pub fn execute_jupiter_swap(
    ctx: Context<ExecuteJupiterSwap>,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    let fund = &ctx.accounts.fund;

    require!(fund.is_active, CustomError::FundNotActive);
    require!(
        ctx.accounts.authority.key() == fund.authority,
        CustomError::UnauthorizedTrader
    );

    let fund_sol_balance = fund.to_account_info().lamports();
    require!(amount_in <= fund_sol_balance, CustomError::InsufficientFunds);

    msg!("========================================");
    msg!("EXECUTING JUPITER SWAP VIA CPI");
    msg!("========================================");
    msg!("Amount In: {} lamports", amount_in);
    msg!("Minimum Out: {} tokens", minimum_amount_out);
    msg!("⚠️ Jupiter CPI integration required");
    msg!("⚠️ Use off-chain Jupiter SDK + record_swap instead");
    msg!("========================================");

    Ok(())
}