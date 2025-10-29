// services/solanaServices/distributionService.ts
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

export interface DistributionInfo {
  shares: string;
  totalShares: string;
  sharePercentage: number;
  initialContribution: string;
  currentValue: string;
  distributionAmount: string;
  profitOrLoss: string;
  isProfitable: boolean;
  tradingFee: string;
  tradingFeeBps: number;
  status: "PROFIT" | "LOSS" | "BREAK-EVEN";
}

export interface ProfitOnlyInfo {
  shares: string;
  totalShares: string;
  sharePercentage: number;
  initialContribution: string;
  currentValue: string;
  grossProfit: string;
  fee: string;
  netProfit: string;
  tradingFeeBps: number;
}

export interface MemberDistributionResult {
  telegramId?: string;
  wallet: string;
  shares: string;
  distributionAmount?: string;
  profitOrLoss?: string;
  status?: string;
  tx?: string;
  success: boolean;
  error?: string;
}

/**
 * Calculate what a member would receive if they distributed their full value now
 * This works for both profit and loss scenarios
 */
export async function calculateDistributionAmount({
  program,
  groupId,
  memberWallet,
}: {
  program: Program;
  groupId: string;
  memberWallet: PublicKey;
}): Promise<DistributionInfo> {
  try {
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), fundPda.toBuffer(), memberWallet.toBuffer()],
      program.programId
    );

    const fund = await program.account.fund.fetch(fundPda);
    const member = await program.account.member.fetch(memberPda);

    // Calculate member's proportional current value
    const memberCurrentValue =
      (BigInt(member.shares.toString()) * BigInt(fund.totalValue.toString())) /
      BigInt(fund.totalShares.toString());

    const memberInitialValue = BigInt(member.totalContributed.toString());
    const profitOrLoss = memberCurrentValue - memberInitialValue;
    const isProfitable = profitOrLoss > BigInt(0);

    // Calculate trading fee (only on profit)
    let tradingFee = BigInt(0);
    let distributionAmount = memberCurrentValue;

    if (isProfitable) {
      tradingFee =
        (profitOrLoss * BigInt(fund.tradingFeeBps)) / BigInt(10000);
      distributionAmount = memberCurrentValue - tradingFee;
    }

    const sharePercentage =
      fund.totalShares.toString() === "0"
        ? 0
        : (Number(member.shares.toString()) /
            Number(fund.totalShares.toString())) *
          100;

    let status: "PROFIT" | "LOSS" | "BREAK-EVEN";
    if (profitOrLoss > BigInt(0)) {
      status = "PROFIT";
    } else if (profitOrLoss < BigInt(0)) {
      status = "LOSS";
    } else {
      status = "BREAK-EVEN";
    }

    return {
      shares: member.shares.toString(),
      totalShares: fund.totalShares.toString(),
      sharePercentage,
      initialContribution: memberInitialValue.toString(),
      currentValue: memberCurrentValue.toString(),
      distributionAmount: distributionAmount.toString(),
      profitOrLoss: profitOrLoss.toString(),
      isProfitable,
      tradingFee: tradingFee.toString(),
      tradingFeeBps: fund.tradingFeeBps,
      status,
    };
  } catch (error: any) {
    console.error("Error calculating distribution amount:", error);
    throw new Error(`Failed to calculate distribution: ${error.message}`);
  }
}

/**
 * Calculate profit-only distribution (without burning shares)
 */
export async function calculateProfitOnly({
  program,
  groupId,
  memberWallet,
}: {
  program: Program;
  groupId: string;
  memberWallet: PublicKey;
}): Promise<ProfitOnlyInfo> {
  try {
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), fundPda.toBuffer(), memberWallet.toBuffer()],
      program.programId
    );

    const fund = await program.account.fund.fetch(fundPda);
    const member = await program.account.member.fetch(memberPda);

    const memberCurrentValue =
      (BigInt(member.shares.toString()) * BigInt(fund.totalValue.toString())) /
      BigInt(fund.totalShares.toString());

    const memberInitialValue = BigInt(member.totalContributed.toString());
    const grossProfit =
      memberCurrentValue > memberInitialValue
        ? memberCurrentValue - memberInitialValue
        : BigInt(0);

    const feeAmount =
      (grossProfit * BigInt(fund.tradingFeeBps)) / BigInt(10000);
    const netProfit = grossProfit > feeAmount ? grossProfit - feeAmount : BigInt(0);

    const sharePercentage =
      fund.totalShares.toString() === "0"
        ? 0
        : (Number(member.shares.toString()) /
            Number(fund.totalShares.toString())) *
          100;

    return {
      shares: member.shares.toString(),
      totalShares: fund.totalShares.toString(),
      sharePercentage,
      initialContribution: memberInitialValue.toString(),
      currentValue: memberCurrentValue.toString(),
      grossProfit: grossProfit.toString(),
      fee: feeAmount.toString(),
      netProfit: netProfit.toString(),
      tradingFeeBps: fund.tradingFeeBps,
    };
  } catch (error: any) {
    console.error("Error calculating profit only:", error);
    throw new Error(`Failed to calculate profit: ${error.message}`);
  }
}

/**
 * Distribute full value to member (profit or loss) - burns all shares
 */
export async function distributeValueToMember({
  program,
  groupId,
  memberWallet,
}: {
  program: Program;
  groupId: string;
  memberWallet: PublicKey;
}): Promise<string> {
  try {
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), fundPda.toBuffer(), memberWallet.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .distributeValue()
      .accounts({
        fund: fundPda,
        member: memberPda,
        memberWallet: memberWallet,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Value distributed (full cash-out). Transaction:", tx);
    return tx;
  } catch (error: any) {
    console.error("Error distributing value:", error);
    throw new Error(`Failed to distribute value: ${error.message}`);
  }
}

/**
 * Distribute only profits to member (keeps shares intact)
 */
export async function distributeProfitToMember({
  program,
  groupId,
  memberWallet,
}: {
  program: Program;
  groupId: string;
  memberWallet: PublicKey;
}): Promise<string> {
  try {
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const [memberPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), fundPda.toBuffer(), memberWallet.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .distributeProfits()
      .accounts({
        fund: fundPda,
        member: memberPda,
        memberWallet: memberWallet,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Profit distributed (shares retained). Transaction:", tx);
    return tx;
  } catch (error: any) {
    console.error("Error distributing profit:", error);
    throw new Error(`Failed to distribute profit: ${error.message}`);
  }
}

/**
 * Distribute value to all members (full cash-out for everyone)
 */
export async function distributeValueToAllMembers({
  program,
  connection,
  groupId,
  memberKeypairs,
}: {
  program: Program;
  connection: Connection;
  groupId: string;
  memberKeypairs: Map<string, any>;
}): Promise<MemberDistributionResult[]> {
  try {
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const memberAccounts = await program.account.member.all([
      {
        memcmp: {
          offset: 8,
          bytes: fundPda.toBase58(),
        },
      },
    ]);

    console.log(`Found ${memberAccounts.length} members`);

    const results: MemberDistributionResult[] = [];

    for (const memberAccount of memberAccounts) {
      const member = memberAccount.account as any;

      if (!member.isActive || member.shares.toString() === "0") {
        console.log(`⏭️  Skipping inactive member: ${member.telegramId}`);
        results.push({
          telegramId: member.telegramId,
          wallet: member.wallet.toBase58(),
          shares: member.shares.toString(),
          success: false,
          error: "Member inactive or has no shares",
        });
        continue;
      }

      try {
        const distInfo = await calculateDistributionAmount({
          program,
          groupId,
          memberWallet: member.wallet,
        });

        if (BigInt(distInfo.distributionAmount) <= BigInt(0)) {
          console.log(`⏭️  No value to distribute for: ${member.telegramId}`);
          results.push({
            telegramId: member.telegramId,
            wallet: member.wallet.toBase58(),
            shares: member.shares.toString(),
            success: false,
            error: "No value to distribute",
          });
          continue;
        }

        const memberKeypair = memberKeypairs.get(member.wallet.toBase58());
        if (!memberKeypair) {
          console.log(`❌ No keypair found for ${member.telegramId}`);
          results.push({
            telegramId: member.telegramId,
            wallet: member.wallet.toBase58(),
            shares: member.shares.toString(),
            success: false,
            error: "No keypair available",
          });
          continue;
        }

        const tx = await program.methods
          .distributeValue()
          .accounts({
            fund: fundPda,
            member: memberAccount.publicKey,
            memberWallet: member.wallet,
            systemProgram: SystemProgram.programId,
          })
          .signers([memberKeypair])
          .rpc();

        results.push({
          telegramId: member.telegramId,
          wallet: member.wallet.toBase58(),
          shares: member.shares.toString(),
          distributionAmount: distInfo.distributionAmount,
          profitOrLoss: distInfo.profitOrLoss,
          status: distInfo.status,
          tx,
          success: true,
        });

        console.log(
          `✅ Distributed ${
            Number(distInfo.distributionAmount) / 1e9
          } SOL to ${member.telegramId} (${distInfo.status}): ${tx}`
        );
      } catch (error: any) {
        console.error(`❌ Failed for ${member.telegramId}:`, error.message);
        results.push({
          telegramId: member.telegramId,
          wallet: member.wallet.toBase58(),
          shares: member.shares.toString(),
          error: error.message,
          success: false,
        });
      }
    }

    return results;
  } catch (error: any) {
    console.error("Error distributing value to all members:", error);
    throw new Error(`Failed to distribute to all: ${error.message}`);
  }
}

/**
 * Get all members with their distribution info
 */
export async function getAllMembersDistributionInfo({
  program,
  groupId,
}: {
  program: Program;
  groupId: string;
}): Promise<
  Array<{
    telegramId: string;
    wallet: string;
    distributionInfo: DistributionInfo;
  }>
> {
  try {
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const memberAccounts = await program.account.member.all([
      {
        memcmp: {
          offset: 8,
          bytes: fundPda.toBase58(),
        },
      },
    ]);

    const results = [];

    for (const memberAccount of memberAccounts) {
      const member = memberAccount.account as any;

      if (!member.isActive) {
        continue;
      }

      const distributionInfo = await calculateDistributionAmount({
        program,
        groupId,
        memberWallet: member.wallet,
      });

      results.push({
        telegramId: member.telegramId,
        wallet: member.wallet.toBase58(),
        distributionInfo,
      });
    }

    return results;
  } catch (error: any) {
    console.error("Error getting all members distribution info:", error);
    throw new Error(`Failed to get members info: ${error.message}`);
  }
}

// Legacy function for backward compatibility
export async function calculateMemberProfit({
  program,
  groupId,
  memberWallet,
}: {
  program: Program;
  groupId: string;
  memberWallet: PublicKey;
}): Promise<ProfitOnlyInfo> {
  return calculateProfitOnly({ program, groupId, memberWallet });
}

// Legacy function for backward compatibility
export async function distributeProfitsToAllMembers({
  program,
  connection,
  groupId,
  memberKeypairs,
}: {
  program: Program;
  connection: Connection;
  groupId: string;
  memberKeypairs: Map<string, any>;
}): Promise<MemberDistributionResult[]> {
  return distributeValueToAllMembers({
    program,
    connection,
    groupId,
    memberKeypairs,
  });
}

// Legacy function for backward compatibility
export async function getAllMembersProfitInfo({
  program,
  groupId,
}: {
  program: Program;
  groupId: string;
}): Promise<
  Array<{
    telegramId: string;
    wallet: string;
    profitInfo: ProfitOnlyInfo;
  }>
> {
  try {
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fund"), Buffer.from(groupId)],
      program.programId
    );

    const memberAccounts = await program.account.member.all([
      {
        memcmp: {
          offset: 8,
          bytes: fundPda.toBase58(),
        },
      },
    ]);

    const results = [];

    for (const memberAccount of memberAccounts) {
      const member = memberAccount.account as any;

      if (!member.isActive) {
        continue;
      }

      const profitInfo = await calculateProfitOnly({
        program,
        groupId,
        memberWallet: member.wallet,
      });

      results.push({
        telegramId: member.telegramId,
        wallet: member.wallet.toBase58(),
        profitInfo,
      });
    }

    return results;
  } catch (error: any) {
    console.error("Error getting all members profit info:", error);
    throw new Error(`Failed to get members info: ${error.message}`);
  }
}
