import express from "express";
import { groupRoute } from "./groupRoute";
import { userRoute } from "./userRoute";
import fundRoute from "./fundRoute";
import contributionRoute from "./contributionRoute";
import transactionRoute from "./transactionRoute";
export const routes = express.Router();

routes.use("/group", groupRoute);

routes.use("/user", userRoute);

routes.use("/fund", fundRoute);

routes.use("/contribtion", contributionRoute);

routes.use("/trasaction", transactionRoute);
