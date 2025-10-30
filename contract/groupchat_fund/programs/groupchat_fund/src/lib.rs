use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;
pub mod contexts;

use contexts::*;
use instructions::*;

declare_id!("JDomJJbEK48FriJ5RVuTmgDGbNN8DLKAv33NdTydcWWd");

#[program]
pub mod groupchat_fund {
    use super::*;

    // ========== Fund Management ==========
    pub fn initialize_fund(
        ctx: Context<InitializeFund>,
        group_id: String,
        fund_name: String,
        min_contribution: u64,
        trading_fee_bps: u16,
    ) -> Result<()> {
        instructions::fund_management::initialize_fund(
            ctx, 
            group_id, 
            fund_name, 
            min_contribution, 
            trading_fee_bps
        )
    }

    pub fn close_fund(ctx: Context<CloseFund>) -> Result<()> {
        instructions::fund_management::close_fund(ctx)
    }

    pub fn pause_fund(ctx: Context<PauseFund>) -> Result<()> {
        instructions::fund_management::pause_fund(ctx)
    }

    pub fn resume_fund(ctx: Context<ResumeFund>) -> Result<()> {
        instructions::fund_management::resume_fund(ctx)
    }

    // ========== Membership ==========
    pub fn add_member(ctx: Context<AddMember>, telegram_id: String) -> Result<()> {
        instructions::membership::add_member(ctx, telegram_id)
    }

    // ========== Contributions & Withdrawals ==========
    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        instructions::contributions::contribute(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, shares_to_burn: u64) -> Result<()> {
        instructions::contributions::withdraw(ctx, shares_to_burn)
    }

    // ========== Trading ==========
    pub fn record_swap(
        ctx: Context<RecordSwap>,
        amount_in: u64,
        amount_out: u64,
        from_token: Pubkey,
        to_token: Pubkey,
    ) -> Result<()> {
        instructions::trading::record_swap(
            ctx, 
            amount_in, 
            amount_out, 
            from_token, 
            to_token
        )
    }

    pub fn execute_trade_mock(
        ctx: Context<ExecuteTrade>,
        from_token: Pubkey,
        to_token: Pubkey,
        amount: u64,
        minimum_out: u64,
    ) -> Result<()> {
        instructions::trading::execute_trade_mock(
            ctx, 
            from_token, 
            to_token, 
            amount, 
            minimum_out
        )
    }

    pub fn execute_jupiter_swap(
        ctx: Context<ExecuteJupiterSwap>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        instructions::trading::execute_jupiter_swap(
            ctx, 
            amount_in, 
            minimum_amount_out
        )
    }

    // ========== Distribution ==========
    pub fn distribute_value(ctx: Context<DistributeValue>) -> Result<()> {
        instructions::distribution::distribute_value(ctx)
    }

    pub fn distribute_profits(ctx: Context<DistributeProfits>) -> Result<()> {
        instructions::distribution::distribute_profits(ctx)
    }
}
