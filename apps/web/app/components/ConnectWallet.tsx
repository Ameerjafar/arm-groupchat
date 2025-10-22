"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import axios from "axios";
import { WalletModalButton } from "@solana/wallet-adapter-react-ui";

const ConnectWallet = () => {
  const { publicKey, connected } = useWallet(); // we only need publicKey and connected
  const [status, setStatus] = useState("");

  useEffect(() => {
    const sendWalletToBackend = async () => {
      if (!connected || !publicKey) return;

      const pubKeyString = publicKey.toBase58();
      setStatus(`✅ Wallet connected: ${pubKeyString}`);
      console.log("Connected wallet:", pubKeyString);

      const params = new URLSearchParams(window.location.search);
      console.log("this one is the params", params);
      console.log("telegramId", params.get("telegramId"));
      console.log("username", params.get("username"));
      let telegramId = params.get("telegramId");
      let username = params.get("username");
      const min = 1000;
      const max = 9999;
      const randomInt = Math.floor(
        Math.random() * (max - min + 1) + min
      ).toString();
      telegramId = randomInt;
      username = randomInt;
      console.log("this one is the params", params);
      console.log("telegramId", params.get("telegramId"));
      console.log("username", params.get("username"));
      console.log(randomInt);
      try {
        console.log("hello bro");
        const response = await axios.post(
          `http://localhost:5000/connectWallet`,
          {
            walletAddress: randomInt,
            telegramId,
            username,
          }
        );

        /// errror from here
        const botUsername = "ameerjafarBot"; // replace with your bot username
        const data = encodeURIComponent(pubKeyString);
        window.location.href = `https://t.me/${botUsername}`;
        console.log(response);
      } catch (err) {
        console.error("Failed to send wallet to backend:", err);
        setStatus("❌ Failed to connect to backend");
      }
    };

    sendWalletToBackend();
  }, [connected, publicKey]);

  return (
    <div className="flex flex-col items-center justify-center mt-20">
      <WalletModalButton className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 text-lg">
        {connected ? "Wallet Connected" : "Connect Wallet"}
      </WalletModalButton>
      {status && <p className="mt-4 text-center">{status}</p>}
    </div>
  );
};

export default ConnectWallet;
