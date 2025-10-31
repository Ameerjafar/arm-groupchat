import {
  Raydium,
  TxVersion,
  parseTokenAccountResp,
} from "@raydium-io/raydium-sdk-v2";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

import dotenv from "dotenv";

dotenv.config();
// Replace with your wallet's secret key (base58 encoded)
export const owner: Keypair = Keypair.fromSecretKey(
  Uint8Array.from([
    185, 0, 171, 152, 242, 215, 99, 240, 163, 195, 48, 88, 90, 189, 38, 33, 150,
    70, 111, 44, 56, 122, 190, 133, 35, 124, 65, 127, 234, 88, 35, 104, 162, 45,
    167, 138, 17, 213, 214, 143, 115, 254, 204, 81, 143, 8, 250, 227, 67, 72,
    120, 84, 143, 217, 5, 169, 128, 95, 200, 248, 17, 1, 13, 10,
  ])
);
// For devnet testing
export const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
// For mainnet (uncomment to use):
// export const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed')

export const txVersion = TxVersion.V0; // Use V0 for versioned transactions, LEGACY for older format
const cluster = "devnet"; // Change to 'mainnet' for production

let raydium: Raydium | undefined;

export const initSdk = async (params?: { loadToken?: boolean }) => {
  if (raydium) return raydium;

  if (connection.rpcEndpoint === clusterApiUrl("devnet")) {
    console.warn(
      "Using free RPC node might cause unexpected errors. Recommend using a paid RPC node."
    );
  }

  console.log(`Connecting to RPC ${connection.rpcEndpoint} in ${cluster}`);

  raydium = await Raydium.load({
    owner,
    connection,
    cluster: cluster as "mainnet" | "devnet",
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: "finalized",
    // Uncomment below if using custom API host for devnet
    // urlConfigs: {
    //   BASE_HOST: 'https://api-v3-devnet.raydium.io', // devnet API endpoint
    // },
  });

  return raydium;
};

export const fetchTokenAccountData = async () => {
  const solAccountResp = await connection.getAccountInfo(owner.publicKey);
  const tokenAccountResp = await connection.getTokenAccountsByOwner(
    owner.publicKey,
    {
      programId: TOKEN_PROGRAM_ID,
    }
  );
  const token2022Req = await connection.getTokenAccountsByOwner(
    owner.publicKey,
    {
      programId: TOKEN_2022_PROGRAM_ID,
    }
  );

  const tokenAccountData = parseTokenAccountResp({
    owner: owner.publicKey,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Req.value],
    },
  });

  return tokenAccountData;
};

// Optional: GRPC configuration (for advanced use cases)
export const grpcUrl = "YOUR_GRPC_URL_HERE";
export const grpcToken = "YOUR_GRPC_TOKEN_HERE";
