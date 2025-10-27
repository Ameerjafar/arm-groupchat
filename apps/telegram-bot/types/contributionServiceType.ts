export interface GetContributionType {
    groupId: string,
    page: number,
    limit: number
}

export interface CreateContributionType {
    groupId: string,
    telegramId: String,
    amountSol: number
}

export interface GetUserFundContributionType {
    groupId: string,
    telegramId: string
}