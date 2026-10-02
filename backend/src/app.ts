import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import reportRoutes from "./routes/report.routes.js";
import tripRoutes from "./routes/trip.routes.js";
import truckerRoutes from "./routes/trucker.routes.js";
import lookupRoutes from "./routes/lookup.routes.js";
import databaseBrowserRoutes from "./routes/database-browser.routes.js";
import documentRoutes from "./routes/document.routes.js";
import storeCallRoutes from "./routes/store-call.routes.js";
import dropdownOptionRoutes from "./routes/dropdown-option.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

import websiteContentRoutes from "./routes/clientwebsite.routes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/website", websiteContentRoutes);
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/lookups", lookupRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/truckers", truckerRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/store-calls", storeCallRoutes);
app.use("/api/dropdown-options", dropdownOptionRoutes);
app.use("/api/database", databaseBrowserRoutes);

app.get("/", (_req, res) => {
  res.json({ message: "ALZHEN TMS backend is running" });
});

app.use(errorMiddleware);

export default app;
