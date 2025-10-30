use anchor_lang::prelude::*;
use crate::contexts::*;

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
