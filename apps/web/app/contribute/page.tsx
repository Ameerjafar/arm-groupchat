'use client'

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import idl from "../../../../packages/idl.json";

const PROGRAM_ID = new PublicKey(
  "9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy"
);
const USDC_MINT = new PublicKey("CP7ZpQGYfTxsVzbdDvyo4ic8DiTNVP2pLEN2n1NMaJkx");

export default function ContributePage() {
  const { publicKey, signTransaction } = useWallet();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setGroupId(params.get("groupId") || "");
    setUserId(params.get("userId") || "");

    if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
      const WebApp = (window as any).Telegram.WebApp;
      WebApp.ready();
      WebApp.expand();
    }
  }, []);

  const handleContribute = async () => {
    if (!publicKey || !signTransaction || !amount || !groupId || !userId) {
      alert("Please fill all fields and connect wallet");
      return;
    }

    setLoading(true);

    try {
      const connection = new Connection(
        "https://api.devnet.solana.com",
        "confirmed"
      );

      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey, signTransaction } as any,
        { commitment: "confirmed" }
      );

      const program = new anchor.Program(idl as anchor.Idl, provider);

      const [fundPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("fund"), Buffer.from(groupId)],
        program.programId
      );

      const [memberPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("member"), fundPda.toBuffer(), publicKey.toBuffer()],
        program.programId
      );

      const memberTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        publicKey
      );

      const vaultTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        fundPda,
        true
      );

      const amountLamports = parseFloat(amount) * 1_000_000;
      if (!program.methods.contribute) {
        console.log("we cannot find your program.methods.contribute");
        return;
      }
      const tx = await program.methods
        .contribute(userId, new anchor.BN(amountLamports))
        .accounts({
          fund: fundPda,
          member: memberPda,
          memberTokenAccount,
          vaultTokenAccount,
          memberWallet: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      alert(`✅ Contribution successful!\n\nSignature: ${signature}`);

      if ((window as any).Telegram?.WebApp) {
        (window as any).Telegram.WebApp.close();
      }
    } catch (error: any) {
      console.error("Error:", error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-purple-600 to-indigo-700">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          💰 Contribute to Fund
        </h1>

        {!publicKey ? (
          <div className="text-center space-y-6">
            <p className="text-gray-600 text-lg">
              Connect your Solana wallet to continue
            </p>
            <div className="flex justify-center">
              <WalletMultiButton />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Wallet Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Connected Wallet:
              </p>
              <p className="text-purple-600 font-mono text-sm break-all">
                {publicKey.toBase58().slice(0, 8)}...
                {publicKey.toBase58().slice(-8)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Amount (tokens):
              </label>
              <input
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Contribute Button */}
            <button
              onClick={handleContribute}
              disabled={loading || !amount}
              className="w-full py-4 text-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-700 rounded-lg hover:from-purple-700 hover:to-indigo-800 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? "Processing..." : "Contribute"}
            </button>

            {/* Hint */}
            <p className="text-sm text-gray-500 text-center">
              💡 This transaction will be signed in your wallet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
