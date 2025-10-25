import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../../../../packages/idl.json";

const PROGRAM_ID = new PublicKey(
  "9js3iSazWV97SrExQ9YEeTm2JozqccMetm9vSfouoUqy"
);

export default function InitFundPage() {
  const { publicKey, signTransaction } = useWallet();
  const [fundName, setFundName] = useState("");
  const [minContribution, setMinContribution] = useState("");
  const [tradingFee, setTradingFee] = useState("");
  const [loading, setLoading] = useState(false);
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setGroupId(params.get("groupId") || "");
  }, []);

  const handleInitialize = async () => {
    if (
      !publicKey ||
      !signTransaction ||
      !fundName ||
      !minContribution ||
      !tradingFee
    ) {
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
      if (!program.methods.initializeFund) {
        console.log("we cannot find the intialize fund method in the frontend");
        return;
      }
      const tx = await program.methods
        .initializeFund(
          groupId,
          fundName,
          new anchor.BN(parseFloat(minContribution) * 1_000_000),
          parseInt(tradingFee)
        )
        .accounts({
          fund: fundPda,
          authority: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      alert(`✅ Fund initialized successfully!\n\nSignature: ${signature}`);

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
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-blue-600 to-cyan-700">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          🏦 Initialize Fund
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
          <div className="space-y-5">
            {/* Fund Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Fund Name:
              </label>
              <input
                type="text"
                placeholder="Alpha Trading Group"
                value={fundName}
                onChange={(e) => setFundName(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition disabled:opacity-50"
              />
            </div>

            {/* Min Contribution */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Minimum Contribution (tokens):
              </label>
              <input
                type="number"
                placeholder="1.0"
                value={minContribution}
                onChange={(e) => setMinContribution(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition disabled:opacity-50"
              />
            </div>

            {/* Trading Fee */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Trading Fee (basis points):
              </label>
              <input
                type="number"
                placeholder="50 (0.5%)"
                value={tradingFee}
                onChange={(e) => setTradingFee(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-1">
                100 basis points = 1%
              </p>
            </div>

            {/* Initialize Button */}
            <button
              onClick={handleInitialize}
              disabled={loading || !fundName || !minContribution || !tradingFee}
              className="w-full py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-700 rounded-lg hover:from-blue-700 hover:to-cyan-800 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? "Initializing..." : "Initialize Fund"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
