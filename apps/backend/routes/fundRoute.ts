// routes/fundRoutes.ts
import express from "express";
import {
  createFund,
  checkFundExists,
  getFundByGroupId,
  updateFundBalance,
  updateFundStatus,
  getAllFunds,
  deleteFund,
} from "../controllers/fundController";

const fundRoute = express.Router();

fundRoute.post("/", createFund);
fundRoute.post("/exists", checkFundExists);
fundRoute.patch("/:fundPdaAddress/balance", updateFundBalance);
fundRoute.patch("/:groupId/status", updateFundStatus);
fundRoute.delete("/:groupId", deleteFund);
fundRoute.get("/", getAllFunds);  
fundRoute.get("/:groupId", getFundByGroupId);  

export default fundRoute;
