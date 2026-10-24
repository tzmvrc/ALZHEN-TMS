import { Router } from "express";
import {authMiddleware} from '../middleware/auth.middleware.js';
import {requireRole} from '../middleware/role.middleware.js';
import {userMaintenanceMetrics} from '../services/user-maintenance.service.js';
import {masterImageCleanupMetrics} from '../services/master-image-cleanup.service.js';

const router = Router();
const instanceStartedAt=new Date(Date.now()-process.uptime()*1000).toISOString();

// Counters only: no job payloads, user identities, Storage paths or credentials.
router.get('/health/workers',authMiddleware,requireRole('ADMIN'),(_req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.json({success:true,data:{sampled_at:new Date().toISOString(),instance_started_at:instanceStartedAt,user_maintenance:userMaintenanceMetrics()??null,master_image_cleanup:masterImageCleanupMetrics()??null}});
});

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "alzhen-tms-backend",
    timestamp: new Date().toISOString(),
  });
});

export default router;
