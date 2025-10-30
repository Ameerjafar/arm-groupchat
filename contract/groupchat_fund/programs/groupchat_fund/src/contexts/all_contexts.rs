use anchor_lang::prelude::*;
use crate::state::{Fund, Member};

#[derive(Accounts)]
#[instruction(group_id: String)]
pub struct InitializeFund<'info> {
    #[account(
        init,
        payer = authority,
        space = Fund::SPACE,
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
        space = Member::SPACE,
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
