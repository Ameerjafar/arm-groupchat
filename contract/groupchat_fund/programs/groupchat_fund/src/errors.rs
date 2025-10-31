
use anchor_lang::prelude::*;

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
