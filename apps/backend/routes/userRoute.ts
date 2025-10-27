import express, { Request, response, Response } from "express";
import { prisma } from "@repo/db";
import { validateSolanaAddress } from "../services/utlis";
import { Connection, clusterApiUrl, PublicKey, Keypair } from "@solana/web3.js";
import { encrypt } from "../utils";
import bs58 from 'bs58'
export const userRoute = express.Router();

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

userRoute.post("/connectwallet", async (req: Request, res: Response) => {

  const { telegramId, username, walletAddress, groupId } = req.body;

  if (!telegramId || !username || !walletAddress || !groupId) {
    return res.status(400).json({
      message: "telegramId, username, walletAddress, and groupId are required",
    });
  }

  if (!validateSolanaAddress(walletAddress).isValidFormat) {
    return res.status(400).json({ message: "invalid public key format" });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (existingUser) {
      const updatedUser = await prisma.user.update({
        where: { telegramId },
        data: { walletAddress },
      });
      return res.status(200).json({
        message: "updated the wallet address",
        user: updatedUser,
      });
    }
    const newUser = await prisma.user.create({
      data: {
        telegramId,
        username,
        walletAddress,
        groupId,
      },
    });

    return res.status(200).json({
      message: "User created and wallet linked successfully",
      user: newUser,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
userRoute.post("/createuser", async (req: Request, res: Response) => {
  console.log("inside the create user");
  const { telegramId, username, groupId } = req.body;

  if (!telegramId || !username) {
    return res.status(400).json({
      message: "telegramId and username are required",
    });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (existingUser) {
      return res.status(409).json({ 
        message: "User already exists",
        user: {
          telegramId: existingUser.telegramId,
          username: existingUser.username,
          walletAddress: existingUser.walletAddress,
        }
      });
    }

    console.log("Creating new user with wallet...");

    // ✅ Generate a new Solana wallet (keypair)
    const keypair = Keypair.generate();
    const walletAddress = keypair.publicKey.toBase58();
    const privateKeyArray = keypair.secretKey;

    // ✅ Convert private key to base58 string
    const privateKeyBase58 = bs58.encode(privateKeyArray);

    // ✅ Encrypt the private key
    const encryptedPrivateKey = encrypt(privateKeyBase58);

    console.log("Wallet created:", walletAddress);

    // ✅ Create user with encrypted private key
    const newUser = await prisma.user.create({
      data: {
        telegramId,
        username,
        walletAddress,
        privateKey: encryptedPrivateKey, // Store encrypted private key
        groupId: groupId || null, // Optional groupId
      },
    });

    return res.status(201).json({ 
      message: "User and wallet created successfully", 
      user: {
        id: newUser.id,
        telegramId: newUser.telegramId,
        username: newUser.username,
        walletAddress: newUser.walletAddress,
        createdAt: newUser.createdAt,
      }
    });
  } catch (error: any) {
    console.error("Error creating user:", error);
    
    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        message: "User with this telegramId or wallet already exists" 
      });
    }

    return res.status(500).json({ 
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


userRoute.get("/getUserGroups/:telegramId",
  async (req: Request, res: Response) => {
    const { telegramId } = req.params;
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId },
        include: { group: true },
      });
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json(user.group);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

userRoute.post("/userBalance", async (req: Request, res: Response) => {
  const { telegramId } = req.body;
  try {
    if (!telegramId) {
      return res.status(409).json({ message: "telegramId does not exist" });
    }
    const existingUser = await prisma.user.findUnique({
      where: {
        telegramId,
      },
    });
    console.log("response from the backend", response);
    if (!existingUser) {
      return res.status(409).json({ message: "user not found in db" });
    }
    const walletAddress = existingUser.walletAddress;
    if (!walletAddress) {
      return res
        .status(400)
        .json({ message: "we cannot find your wallet address" });
    }
    const userBalance = await connection.getBalance(
      new PublicKey(walletAddress)
    );
    return res.status(200).json({ userBalance });
  } catch (error: unknown) {
    return res.status(400).json({ message: error });
  }
});
