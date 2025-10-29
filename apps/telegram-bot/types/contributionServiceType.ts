// types/contributionServiceType.ts
export type CreateContributionType = {
    groupId: string;
    telegramId: string;
    amountSol: number;
  };
  
  export type GetContributionType = {
    groupId: string;
    page?: number;
    limit?: number;
  };
  
  export type GetUserFundContributionType = {
    groupId: string;
    telegramId: string;
  };
  
  // ✅ Updated type to match the backend controller
  export type updateMemberType = {
    groupId: string;
    memberTelegramId: string;
    newRole: string;  // Changed from roleCapitalized
    authorityTelegramId: string;  // Changed from authorizedUser
  };
  