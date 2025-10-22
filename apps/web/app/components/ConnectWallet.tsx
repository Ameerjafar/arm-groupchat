"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import axios from "axios";
import { WalletDisconnectButton } from "@solana/wallet-adapter-react-ui";

const ConnectWallet = () => {
  const { publicKey, connected, select, wallets, connect } = useWallet();
  const [status, setStatus] = useState("");
  const [isPhantomAvailable, setIsPhantomAvailable] = useState(false);
  const [isInTelegram, setIsInTelegram] = useState(false);

  // ✅ Check if running in Telegram and if Phantom is available
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    setIsInTelegram(!!tg);

    const checkPhantom = () => {
      if (typeof window !== "undefined" && "solana" in window) {
        const solana = (window as any).solana;
        if (solana?.isPhantom) {
          setIsPhantomAvailable(true);
          console.log("✅ Phantom detected!");
        }
      }
    };

    checkPhantom();
    const timer = setTimeout(checkPhantom, 1000);
    return () => clearTimeout(timer);
  }, []);

  // ✅ Auto-select Telegram wallet if available
  useEffect(() => {
    const telegramWallet = wallets.find(
      (wallet) => wallet.adapter.name === "Telegram Wallet"
    );

    if (telegramWallet && !connected) {
      select(telegramWallet.adapter.name);
    }
  }, [wallets, select, connected]);

  // ✅ Deep link to open in Phantom browser
  const handlePhantomDeepLink = () => {
    const currentUrl = window.location.href;
    const phantomUrl = `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}`;
    setStatus("🔄 Opening in Phantom browser...");
    window.location.href = phantomUrl;
  };

  const handleConnect = async () => {
    try {
      // If Phantom is not available in Telegram, redirect to Phantom browser
      if (isInTelegram && !isPhantomAvailable) {
        setStatus("⚠️ Phantom not detected. Opening in Phantom browser...");
        setTimeout(handlePhantomDeepLink, 1500);
        return;
      }

      await connect();
      setStatus("🔄 Connecting...");
    } catch (error) {
      console.error("Connection failed:", error);
      setStatus("❌ Failed to connect wallet");

      if (isInTelegram) {
        setTimeout(() => {
          setStatus("💡 Try opening in Phantom browser for better experience");
        }, 2000);
      }
    }
  };

  useEffect(() => {
    const sendWalletToBackend = async () => {
      if (!connected || !publicKey) return;

      const pubKeyString = publicKey.toBase58();
      setStatus(`✅ Wallet connected: ${pubKeyString.slice(0, 8)}...${pubKeyString.slice(-8)}`);

      const params = new URLSearchParams(window.location.search);
      let telegramId = params.get("telegramId");
      let username = params.get("username");

      // Fallback for testing
      if (!telegramId) {
        const randomInt = Math.floor(Math.random() * 9000 + 1000).toString();
        telegramId = randomInt;
        username = randomInt;
      }

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

        console.log("Sending to backend:", { walletAddress: pubKeyString, telegramId, username });

        await axios.post(`${apiUrl}/connectWallet`, {
          walletAddress: pubKeyString,
          telegramId,
          username,
        });

        setStatus("✅ Wallet registered! Redirecting to bot...");

        const botUsername = "ameerjafarBot";
        setTimeout(() => {
          window.location.href = `https://t.me/${botUsername}`;
        }, 2000);
      } catch (err) {
        console.error("Failed to send wallet to backend:", err);
        setStatus("❌ Failed to connect to backend");
      }
    };

    sendWalletToBackend();
  }, [connected, publicKey]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Connect Wallet
          </h1>
          <p className="text-gray-600 text-sm">
            Connect your Solana wallet to continue
          </p>
        </div>

        {/* ⚠️ Telegram Warning */}
        {isInTelegram && !isPhantomAvailable && !connected && (
          <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
            <div className="flex items-start">
              <span className="text-2xl mr-3">💡</span>
              <div>
                <p className="text-sm font-semibold text-yellow-800 mb-1">
                  Running in Telegram
                </p>
                <p className="text-xs text-yellow-700">
                  For best experience, we'll open this in Phantom browser
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ✅ Phantom Available Indicator */}
        {isPhantomAvailable && (
          <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center">
            <span className="text-green-600 mr-2">✅</span>
            <p className="text-sm text-green-700 font-medium">
              Phantom wallet detected
            </p>
          </div>
        )}

        {!connected ? (
          <div className="space-y-3">
            <button
              onClick={handleConnect}
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              {isInTelegram && !isPhantomAvailable
                ? "Open in Phantom"
                : "Connect Phantom Wallet"}
            </button>

            {/* 📱 Alternative deep link button */}
            {isInTelegram && (
              <button
                onClick={handlePhantomDeepLink}
                className="w-full px-6 py-4 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all duration-200 border border-gray-300"
              >
                📱 Open in Phantom Browser
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <span className="text-4xl">✅</span>
              </div>
              <p className="text-green-600 font-bold text-lg">
                Wallet Connected!
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Processing your wallet...
              </p>
            </div>
            <WalletDisconnectButton className="!w-full !bg-red-500 hover:!bg-red-600 !rounded-xl" />
          </div>
        )}

        {/* 🧾 Status Messages */}
        {status && (
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm text-center text-gray-700 break-all leading-relaxed">
              {status}
            </p>
          </div>
        )}

        {/* 📎 Help Text */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Don't have Phantom?{" "}
            <a
              href="https://phantom.app/download"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:text-purple-700 font-medium underline"
            >
              Download here
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConnectWallet;
