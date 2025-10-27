import express from "express";
import {
  createFund,
  checkFundExists,
  getFundByGroupId,
  updateFundBalance,
  updateFundStatus,
  deleteFund,
} from "../controllers/fundController";

const fundRoute = express.Router();

fundRoute.post("/", createFund);
fundRoute.post("/exists", checkFundExists);
fundRoute.get('/info', getFundByGroupId);
fundRoute.patch("/updateFundBalance", updateFundBalance);
fundRoute.put("/updateFundStatus", updateFundStatus);
fundRoute.post("/closefund", deleteFund);
// fundRoute.get("/", getAllFunds);  
fundRoute.get("/:groupId", getFundByGroupId);  

export default fundRoute;
