export interface CreateFundType {
    telegramId: string,
    fundName: string,
    minContribution: number,
    tradingFeeBps: number,
    groupId: string
}

export interface UpdateObjectType {
    telegramId: string,
    groupId: string,
    status: " CLOSED" | "PAUSED" | "ACTIVE"
}

export interface closeFundObject {
    telegramId: string,
    groupId: string
}