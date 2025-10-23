import express, { Request, response, Response } from "express";
import { prisma } from "@repo/db";
import { validateSolanaAddress } from "../services/utlis";
import { Connection, clusterApiUrl, PublicKey } from "@solana/web3.js";

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

  if (!telegramId || !username || !groupId) {
    return res.status(401).json({
      message: "telegramId, username, and groupId are required",
    });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }
    console.log("outside the existing user");
    const newUser = await prisma.user.create({
      data: {
        telegramId,
        username,
        groupId,
      },
    });

    return res
      .status(200)
      .json({ message: "User created successfully", user: newUser });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

userRoute.get(
  "/getUserGroups/:telegramId",
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
