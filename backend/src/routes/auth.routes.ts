import { Router } from "express";
import {requireRole} from "../middleware/role.middleware.js";
import {withDeletionPassword} from "../services/deletion-password.service.js";
import {ApiError,sendError,sendSuccess} from "../utils/api-response.js";

import {
  bootstrapSession,
  login,
  logout,
  me,
  sessionHeartbeat,
} from "../controllers/auth.controller.js";
import {
  authMiddleware,
  authMiddlewareSkipSessionValidation,
} from "../middleware/auth.middleware.js";

const router = Router();

// Local authentication acceptance only: no mutation callback or reusable authorization.
// Never registered in production and never reachable from a remote network client.
if(process.env.NODE_ENV!=="production")router.post("/password-confirmation-check",(req,res,next)=>{
 if(!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(req.socket.remoteAddress??""))return res.sendStatus(404);
 next();
},authMiddleware,requireRole("ADMIN"),async(req,res)=>{
 const password=req.body?.current_password;if(req.body)delete req.body.current_password;
 try{
  const session=req.appSession!;
  return sendSuccess(res,200,"Authentication-only check completed",await withDeletionPassword({id:session.profileId,role:session.role},{password,accessToken:req.headers.authorization?.replace(/^Bearer\s+/i,"").trim()??"",appSessionId:session.sessionId??null},async()=>({verified:true,original_session_valid:true,destructive_operation:false})));
 }catch(error){return sendError(res,error instanceof ApiError?error.statusCode:503,error instanceof ApiError?error.message:"Authentication check unavailable.",error instanceof ApiError?error.code:undefined);}
});
router.post("/login", login);
router.post(
  "/session/bootstrap",
  authMiddleware,
  bootstrapSession,
);
router.post("/logout", authMiddlewareSkipSessionValidation, logout);
router.post("/session/heartbeat", authMiddleware, sessionHeartbeat);
router.get("/me", authMiddleware, me);

export default router;
