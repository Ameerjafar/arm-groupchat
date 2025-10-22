import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
const app = express();
app.use(express.json());
app.use(cors());
const prisma = new PrismaClient();

app.post("/connectWallet", async (req: Request, res: Response) => {
  console.log("inside the connect wallet");
  const { telegramId, username, walletAddress } = req.body;

  if (!telegramId || !walletAddress) {
    return res
      .status(400)
      .json({ message: "telegramId and walletAddress are required" });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: {
        telegramId,
      },
    });
    if (existingUser) {
      return res.status(409).json({ message: "user already exists" });
    }
    const user = await prisma.user.create({
      data: {
        telegramId,
        username,
        walletAddress,
      },
    });

    return res.status(200).json({
      message: "User saved and wallet connected successfully",
      user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));
