import express from "express";
import cors from "cors";
import { routes } from "./routes/routes";
import dotenv from 'dotenv';

dotenv.config();
console.log(process.env.BOT_TOKEN!);
const app = express();

app.use(express.json());

app.use(cors());

app.use("/", routes);

app.listen(5000, () => console.log("Server running on port 5000"));
