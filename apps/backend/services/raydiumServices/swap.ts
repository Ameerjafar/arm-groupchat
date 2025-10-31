import {
    ApiV3PoolInfoStandardItemCpmm,
    CpmmKeys,
    CpmmParsedRpcData,
    CurveCalculator,
    FeeOn,
    printSimulate,
    TxVersion,
  } from "@raydium-io/raydium-sdk-v2";
  import { initSdk, owner } from "./config";
  import BN from "bn.js";
  import { NATIVE_MINT } from "@solana/spl-token";2
  import dotenv from "dotenv";
  
  dotenv.config();
  
  const isValidCpmm = (programId: string): boolean => {
    return programId === "CPMMoo8L3F4z6SVgZvZkwj6zG4Kws3KiCsVU2WA9w5z";
  };
  export const performSwap = async () => {
    try {
      console.log("🚀 Starting swap...");
      const raydium = await initSdk({ loadToken: true });
      const poolId = "9etAscoVddk1MjNWpCc9CsK3TSZgh3hrfS1FjqEBBDC2";
      const inputAmount = new BN(1000000); 
      const inputMint = NATIVE_MINT.toBase58(); 
  
      console.log(`Pool ID: ${poolId}`);
      console.log(`Input Amount: ${inputAmount.toString()} lamports`);
      console.log(`Input Mint: ${inputMint}`);
  
      let poolInfo: ApiV3PoolInfoStandardItemCpmm;
      let poolKeys: CpmmKeys | undefined;
      let rpcData: CpmmParsedRpcData;
  
      console.log("\n--- Fetching Pool Info ---");
  
      if (raydium.cluster === "mainnet") {
        const data = await raydium.api.fetchPoolById({ ids: poolId });
        poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
  
        if (!isValidCpmm(poolInfo.programId))
          throw new Error("target pool is not CPMM pool");
  
        rpcData = await raydium.cpmm.getRpcPoolInfo(poolInfo.id, true);
      } else {
        console.log("Fetching pool from RPC (devnet)...");
        const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;
        rpcData = data.rpcData;
      }
  
      console.log(`✅ Pool found: ${poolInfo.id}`);
      console.log(`Mint A: ${poolInfo.mintA.symbol} (${poolInfo.mintA.address})`);
      console.log(`Mint B: ${poolInfo.mintB.symbol} (${poolInfo.mintB.address})`);
      console.log(`Base Reserve: ${rpcData.baseReserve.toString()}`);
      console.log(`Quote Reserve: ${rpcData.quoteReserve.toString()}`);

      if (
        inputMint !== poolInfo.mintA.address &&
        inputMint !== poolInfo.mintB.address
      ) {
        throw new Error("input mint does not match pool");
      }
  
      const baseIn = inputMint === poolInfo.mintA.address;
      console.log(`\nBase In: ${baseIn}`);
      console.log(
        `Swapping ${baseIn ? poolInfo.mintA.symbol : poolInfo.mintB.symbol} for ${
          baseIn ? poolInfo.mintB.symbol : poolInfo.mintA.symbol
        }`
      );
      console.log("\n--- Calculating Swap ---");
      const swapResult = CurveCalculator.swapBaseInput(
        inputAmount,
        baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
        baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
        rpcData.configInfo!.tradeFeeRate,
        rpcData.configInfo!.creatorFeeRate,
        rpcData.configInfo!.protocolFeeRate,
        rpcData.configInfo!.fundFeeRate,
        rpcData.feeOn === FeeOn.BothToken || rpcData.feeOn === FeeOn.OnlyTokenB
      );
  
      console.log("Swap Result:");
      console.log(
        Object.keys(swapResult).reduce(
          (acc, cur) => ({
            ...acc,
            [cur]: swapResult[cur as keyof typeof swapResult].toString(),
          }),
          {}
        )
      );
  
      console.log("\n--- Swap Details ---");
      console.log(`Input Amount: ${swapResult.inputAmount.toString()}`);
      console.log(`Output Amount: ${swapResult.outputAmount.toString()}`);
      console.log(`Trade Fee: ${swapResult.tradeFee.toString()}`);
  
      // Calculate price impact manually
      const inputAmountNum = inputAmount.toNumber();
      const outputAmountNum = swapResult.outputAmount.toNumber();
      const spotPrice = rpcData.quoteReserve.toNumber() / rpcData.baseReserve.toNumber();
      const executionPrice = outputAmountNum / inputAmountNum;
      const priceImpact =
        ((spotPrice - executionPrice) / spotPrice) * 100;
  
      console.log(`Spot Price: ${spotPrice.toFixed(6)}`);
      console.log(`Execution Price: ${executionPrice.toFixed(6)}`);
      console.log(`Price Impact: ${priceImpact.toFixed(4)}%`);
  
      // Build swap transaction
      console.log("\n--- Building Swap Transaction ---");
      const { execute, transaction } = await raydium.cpmm.swap({
        poolInfo,
        poolKeys,
        inputAmount,
        swapResult,
        slippage: 0.001, // 0.1% slippage
        baseIn,
        txVersion: TxVersion.V0,
        // Optional: set priority fees
        // computeBudgetConfig: {
        //   units: 600000,
        //   microLamports: 100000,
        // },
      });
  
      console.log("Simulating transaction...");
      printSimulate([transaction]);
  
      // Execute swap
      console.log("\n--- Executing Swap ---");
      const { txId } = await execute({ sendAndConfirm: true });
  
      console.log("\n✅ Swap executed successfully!");
      console.log(
        `Swapped: ${poolInfo.mintA.symbol} to ${poolInfo.mintB.symbol}`
      );
      console.log(
        `Transaction: https://explorer.solana.com/tx/${txId}?cluster=devnet`
      );
  
      return {
        txId,
        inputAmount: swapResult.inputAmount.toString(),
        outputAmount: swapResult.outputAmount.toString(),
        tradeFee: swapResult.tradeFee.toString(),
        priceImpact: priceImpact.toFixed(4),
      };
    } catch (error: any) {
      console.error("❌ Swap failed:", error.message || error);
      if (error.logs) {
        console.error("Logs:", error.logs);
      }
      throw error;
    }
  };
  
  // Main execution
  performSwap()
    .then((result) => {
      console.log("\n✅ Swap completed!");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Swap failed:", error.message || error);
      process.exit(1);
    });
  