import {startTransactionImageCleanupWorker} from './services/transaction-deletion.service.js';
import {startMasterImageCleanupWorker} from "./services/master-image-cleanup.service.js";
import {startUserMaintenanceWorker} from "./services/user-maintenance.service.js";
import app from "./app.js";
import { createServer } from "node:http";
import { attachCollaborationServer } from "./services/collaboration-server.js";
import {startTrackingWorker} from "./services/tracking-runtime.service.js";

const PORT = Number(process.env.PORT ?? 5000);
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw new Error("PORT must be an integer from 1 to 65535.");
const server=createServer(app);
void attachCollaborationServer(server).then(collaboration=>{
  let stopTracking=()=>{};let stopUsers=()=>{};let stopMasterImages=()=>{};let stopTripImages=()=>{};
  let closing=false;
  const shutdown=(exitCode=0)=>{
    if(closing)return;closing=true;stopTracking();stopUsers();stopMasterImages();stopTripImages();
    const deadline=setTimeout(()=>process.exit(exitCode),5000);deadline.unref();
    void collaboration.close().catch(()=>{console.error("Backend shutdown could not finish cleanly.");}).finally(()=>process.exit(exitCode));
  };
  server.once("error",(error:NodeJS.ErrnoException)=>{
    console.error(error.code==="EADDRINUSE"
      ? `Port ${PORT} is already in use. Keep one ALZHEN backend running; stop the duplicate startup or choose an explicitly configured port.`
      : "Backend could not listen. Check the configured port and local permissions.");
    shutdown(1);
  });
  server.listen(PORT, () => {
    // Start workers only after the listener successfully binds.
    stopTracking=startTrackingWorker();stopUsers=startUserMaintenanceWorker();stopMasterImages=startMasterImageCleanupWorker();stopTripImages=startTransactionImageCleanupWorker();
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(JSON.stringify({whole_trip_delete_enabled:process.env.WHOLE_TRIP_DELETE_ENABLED==="true",workers:Number(process.env.WEB_CONCURRENCY??1),shared_confirmation_configured:Boolean(process.env.SOCKET_REDIS_URL)}));
  });
  process.once("SIGTERM",()=>shutdown());process.once("SIGINT",()=>shutdown());
}).catch(()=>{console.error("Collaboration startup failed. Check Socket origins and Redis configuration.");process.exit(1);});
