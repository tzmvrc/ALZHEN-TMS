import app from "./app.js";
import { createServer } from "node:http";
import { attachCollaborationServer } from "./services/collaboration-server.js";
import {startTrackingWorker} from "./services/tracking-runtime.service.js";

const PORT = Number(process.env.PORT ?? 5000);

const server=createServer(app);
void attachCollaborationServer(server).then(collaboration=>{
  const stopTracking=startTrackingWorker();
  server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  const shutdown=()=>{stopTracking();void collaboration.close().finally(()=>process.exit(0));};
  process.once("SIGTERM",shutdown);process.once("SIGINT",shutdown);
}).catch(()=>{console.error("Collaboration startup failed. Check Socket origins and Redis configuration.");process.exit(1);});
