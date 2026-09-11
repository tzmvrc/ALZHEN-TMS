import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.routes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);

app.get("/", (_req, res) => {
  res.json({ message: "ALZHEN TMS backend is running" });
});

export default app;
