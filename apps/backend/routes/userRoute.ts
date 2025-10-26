import express from "express";
import {
  connectWallet,
  createUser,
  getUserGroups,
  getUserBalance,
  checkWallet,
} from "../controllers/userController";

export const userRoute = express.Router();

userRoute.post("/connectwallet", connectWallet);
userRoute.post("/createuser", createUser);
userRoute.get("/getUserGroups/:telegramId", getUserGroups);
userRoute.post("/userBalance", getUserBalance);
userRoute.post('/checkWallet', checkWallet);