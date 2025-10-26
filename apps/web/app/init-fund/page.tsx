'use client';

import { useEffect, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Keypair, Transaction } from "@solana/web3.js";
import axios, { AxiosError } from "axios";
import idl from "../../../../packages/idl.json";

const PROGRAM_ID = new PublicKey(
  "9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy"
);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000/api";

interface BackendErrorResponse {
  success: boolean;
  message: string;
  error?: string;
}

function isValidSolanaAddress(address: string): boolean {
  try {
    const pubkey = new PublicKey(address);
    return PublicKey.isOnCurve(pubkey.toBuffer());
  } catch (error) {
    return false;
  }
}

const isTelegramWebApp = typeof window !== 'undefined' && (window as any).Telegram?.WebApp;

export default function InitFundPage() {
  const [fundName, setFundName] = useState("");
  const [minContribution, setMinContribution] = useState("");
  const [tradingFee, setTradingFee] = useState("");
  const [loading, setLoading] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string>("");
  const [userWalletAddress, setUserWalletAddress] = useState<string>("");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    // Initialize Telegram Web App
    if (isTelegramWebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      tg.expand();
      
      if (tg.colorScheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    }

    const params = new URLSearchParams(window.location.search);
    const groupIdParam = params.get("groupId");
    const userIdParam = params.get("userId");
    
    if (!groupIdParam || !userIdParam) {
      setError("Missing required parameters. Please initialize fund from Telegram.");
      return;
    }
    
    setGroupId(groupIdParam);
    setUserId(userIdParam);

    // Fetch user's wallet address from backend
    fetchUserWallet(userIdParam);
  }, []);

  const fetchUserWallet = async (telegramId: string) => {
    try {
      const response = await axios.post(
        `${BACKEND_URL}/user/checkWallet`,
        { telegramId }
      );

      if (response.data.hasWallet && response.data.walletAddress) {
        setUserWalletAddress(response.data.walletAddress);
      } else {
        setError("Please connect your wallet first using /connectwallet command in the bot");
      }
    } catch (error: any) {
      console.error("Error fetching wallet:", error);
      setError("Failed to fetch your wallet information. Please use /connectwallet in the bot first.");
    }
  };

  const validateInputs = (): string | null => {
    if (!fundName.trim()) {
      return "Fund name is required";
    }
    if (fundName.length < 3 || fundName.length > 50) {
      return "Fund name must be between 3 and 50 characters";
    }
    
    const minContribNum = parseFloat(minContribution);
    if (isNaN(minContribNum) || minContribNum <= 0) {
      return "Minimum contribution must be a positive number";
    }
    if (minContribNum > 1000000) {
      return "Minimum contribution is too large";
    }
    
    const tradingFeeNum = parseInt(tradingFee);
    if (isNaN(tradingFeeNum) || tradingFeeNum < 0) {
      return "Trading fee must be a non-negative number";
    }
    if (tradingFeeNum > 10000) {
      return "Trading fee cannot exceed 10000 basis points (100%)";
    }
    
    return null;
  };

  const handleInitialize = async () => {
    setError("");

    if (!userWalletAddress) {
      setError("Please connect your wallet first using /connectwallet command");
      return;
    }

    if (!isValidSolanaAddress(userWalletAddress)) {
      setError("Invalid wallet address");
      return;
    }

    const validationError = validateInputs();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!groupId || !userId) {
      setError("Missing group or user information");
      return;
    }

    setLoading(true);

    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
        "confirmed"
      );

      const authorityPublicKey = new PublicKey(userWalletAddress);

      // Derive fund PDA
      const [fundPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("fund"), Buffer.from(groupId)],
        PROGRAM_ID
      );

      console.log("Fund PDA:", fundPda.toBase58());

      // Create the fund data in the database (without blockchain transaction for now)
      // In production, you'd need to handle the signing differently
      const fundData = {
        groupId: groupId,
        fundPdaAddress: fundPda.toBase58(),
        authority: userWalletAddress,
        initiator: userId,
        fundName: fundName,
        minContribution: parseFloat(minContribution) * 1_000_000,
        tradingFeeBps: parseInt(tradingFee),
        balance: "0",
        status: "PENDING_BLOCKCHAIN", // Mark as pending until blockchain confirmation
      };

      // Save to database
      const response = await axios.post<{ success: boolean; data: { id: string } }>(
        `${BACKEND_URL}/funds`,
        fundData,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      console.log("✅ Fund saved to database:", response.data);

      if (response.data.success) {
        if (isTelegramWebApp) {
          const tg = (window as any).Telegram.WebApp;
          
          tg.showAlert(
            `✅ Fund created successfully!\n\n` +
            `Fund: ${fundName}\n` +
            `PDA: ${fundPda.toBase58().slice(0, 8)}...\n\n` +
            `You can now ask members to contribute!`,
            () => {
              tg.sendData(
                JSON.stringify({
                  action: "fund_created",
                  fundId: response.data.data.id,
                  fundPda: fundPda.toBase58(),
                })
              );
              
              setTimeout(() => {
                tg.close();
              }, 500);
            }
          );
        } else {
          alert(
            `✅ Fund initialized successfully!\n\n` +
            `Fund Name: ${fundName}\n` +
            `PDA: ${fundPda.toBase58()}\n` +
            `Database ID: ${response.data.data.id}`
          );
        }
      }
    } catch (error: unknown) {
      console.error("Error:", error);
      
      let errorMessage = "An unexpected error occurred";
      
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<BackendErrorResponse>;
        errorMessage = axiosError.response?.data?.message || axiosError.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      
      if (isTelegramWebApp) {
        (window as any).Telegram.WebApp.showAlert(`Error: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isClient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-700">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-blue-600 to-cyan-700">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          🏦 Initialize Fund
        </h1>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>
          </div>
        )}

        {!userWalletAddress ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading wallet information...</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Wallet Info */}
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-xs text-gray-600">
                <span className="font-semibold">✅ Your Wallet:</span>{" "}
                {userWalletAddress.slice(0, 4)}...
                {userWalletAddress.slice(-4)}
              </p>
            </div>

            {/* Group ID Display */}
            {groupId && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Group ID:</span> {groupId}
                </p>
              </div>
            )}

            {/* Fund Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Fund Name: <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Alpha Trading Group"
                value={fundName}
                onChange={(e) => setFundName(e.target.value)}
                disabled={loading}
                maxLength={50}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition disabled:opacity-50"
              />
            </div>

            {/* Min Contribution */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Minimum Contribution (tokens): <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                placeholder="1.0"
                value={minContribution}
                onChange={(e) => setMinContribution(e.target.value)}
                disabled={loading}
                min="0"
                step="0.000001"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition disabled:opacity-50"
              />
            </div>

            {/* Trading Fee */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Trading Fee (basis points): <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                placeholder="50 (0.5%)"
                value={tradingFee}
                onChange={(e) => setTradingFee(e.target.value)}
                disabled={loading}
                min="0"
                max="10000"
                step="1"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-1">
                100 basis points = 1%. Max: 10000 (100%)
              </p>
            </div>

            {/* Initialize Button */}
            <button
              onClick={handleInitialize}
              disabled={loading || !fundName || !minContribution || !tradingFee || !groupId || !userWalletAddress}
              className="w-full py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-700 rounded-lg hover:from-blue-700 hover:to-cyan-800 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Fund...
                </>
              ) : (
                "Create Fund"
              )}
            </button>

            {/* Info text */}
            <p className="text-xs text-gray-500 text-center mt-4">
              This will create a fund record in the database using your connected wallet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
