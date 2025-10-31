use anchor_lang::prelude::*;
use crate::constants::*;

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
}

impl Fund {
    pub const SPACE: usize = DISCRIMINATOR 
        + 32
        + (4 + MAX_STRING_LENGTH)
        + (4 + MAX_STRING_LENGTH)
        + 8
        + 8
        + 8
        + 2
        + 1
        + 1;
}