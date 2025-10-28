// types/tradeServiceType.ts

export type CreateProposalType = {
    groupId: string;
    telegramId: string;
    fromToken: string;
    toToken: string;
    amount: string;
    minimumOut: string;
  };
  
  export type ApproveProposalType = {
    groupId: string;
    telegramId: string;
    proposalId: number;
  };
  
  export type GetProposalsType = {
    groupId: string;
    telegramId: string;
    status?: string;
  };
  
  export type GetProposalByIdType = {
    groupId: string;
    telegramId: string;
    proposalId: number;
  };
  
  export type SyncProposalType = {
    groupId: string;
    telegramId: string;
    proposalId: number;
  };
  
  export type ProposalStatusType = {
    proposalId: number;
    status: string;
    approvalCount: number;
    requiredApprovals: number;
    isExpired: boolean;
  };
  
  export type ProposalDetailsType = {
    id: string;
    proposalId: number;
    proposalPdaAddress: string;
    proposerTelegramId: string;
    proposerWallet: string;
    fromToken: string;
    toToken: string;
    amount: string;
    minimumOut: string;
    status: string;
    approvalCount: number;
    requiredApprovals: number;
    approvals: string[];
    createdAt: Date;
    expiresAt: Date;
    executedAt?: Date;
    transactionSignature?: string;
    isExpired: boolean;
  };
  
  export type CreateProposalResponseType = {
    success: boolean;
    message: string;
    data: {
      id: string;
      proposalId: number;
      proposalPdaAddress: string;
      fromToken: string;
      toToken: string;
      amount: string;
      minimumOut: string;
      status: string;
      approvalCount: number;
      requiredApprovals: number;
      expiresAt: Date;
      transactionSignature: string;
      explorerUrl: string;
      createdAt: Date;
    };
  };
  
  export type ApproveProposalResponseType = {
    success: boolean;
    message: string;
    data: {
      proposalId: number;
      status: string;
      approvalCount: number;
      requiredApprovals: number;
      transactionSignature: string;
      explorerUrl: string;
      approval: {
        id: string;
        approverTelegramId: string;
        approverWallet: string;
        approvedAt: Date;
      };
    };
  };
  