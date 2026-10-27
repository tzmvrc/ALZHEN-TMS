import operationalEmailRoutes from './routes/operational-email.routes.js';
import {reportReadTiming} from "./utils/report-read-timing.js";
import express from "express";
import { collaborationResponseMiddleware } from "./services/collaboration-events.js";
import tableLayoutRoutes from "./routes/table-layout.routes.js";
import realtimeRoutes from "./routes/realtime.routes.js";
import cors from "cors";
import dotenv from "dotenv";
import {productionHttpConfig} from "./config/http.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import reportRoutes from "./routes/report.routes.js";
import tripRoutes from "./routes/trip.routes.js";
import truckerRoutes from "./routes/trucker.routes.js";
import lookupRoutes from "./routes/lookup.routes.js";
import documentRoutes from "./routes/document.routes.js";
import storeCallRoutes from "./routes/store-call.routes.js";
import dropdownOptionRoutes from "./routes/dropdown-option.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import trackingRoutes from "./routes/tracking.routes.js";
import deliveryRoutes from "./routes/delivery.routes.js";
import masterDataRoutes from "./routes/master-data.routes.js";
import calendarRoutes from "./routes/calendar.routes.js";
import flexibleTableRoutes from "./routes/flexible-table.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

import websiteContentRoutes from "./routes/clientwebsite.routes.js";

dotenv.config();

const app = express();

const httpConfig=productionHttpConfig();
app.disable("x-powered-by");
app.set("trust proxy",httpConfig.trustProxy);
app.use(cors(httpConfig.cors));
// The import routes parse their bounded payloads themselves; normal API limits stay unchanged.
app.use((req, res, next) => req.path.startsWith("/api/trips/import/") || req.path.startsWith("/api/trips/whole-delete/bulk") ? next() : express.json()(req, res, next));
app.use(reportReadTiming);
app.use(collaborationResponseMiddleware);
app.use("/api/website", websiteContentRoutes);
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/table-layouts", tableLayoutRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/lookups", lookupRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/truckers", truckerRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/store-calls", storeCallRoutes);
app.use("/api/dropdown-options", dropdownOptionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/operational-emails", operationalEmailRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/master-data", masterDataRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/flexible-tables", flexibleTableRoutes);

app.get("/", (_req, res) => {
  res.json({ message: "ALZHEN TMS backend is running" });
});

app.use(errorMiddleware);

export default app;
