use anchor_lang::prelude::*;
use crate::constants::*;

#[account]
pub struct Member {
    pub wallet: Pubkey,              
    pub telegram_id: String,
    pub shares: u64,                 
    pub total_contributed: u64,
    pub is_active: bool,
}

impl Member {
    pub const SPACE: usize = DISCRIMINATOR 
        + 32                                    
        + (4 + MAX_STRING_LENGTH)
        + 8                                     
        + 8                                     
        + 1;
}
