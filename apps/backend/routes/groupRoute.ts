import express from "express";
import {
  addMember,
  createGroup,
  getGroupById,
  removeMember,
} from "../controllers/groupController";

export const groupRoute = express.Router();

groupRoute.post("/creategroup", createGroup);
groupRoute.post("/addMember", addMember);
groupRoute.post("/removeMember", removeMember);
groupRoute.get("/getGroupById/:groupId", getGroupById);

export default groupRoute;
