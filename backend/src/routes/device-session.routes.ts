import {Router} from 'express';
import {authMiddleware} from '../middleware/auth.middleware.js';
import {requireAdmin} from '../middleware/role.middleware.js';
import {supabaseAdmin as db} from '../config/supabase.js';
import {activeDeviceSessions,manageDeviceSecurity,checkDeviceSession} from '../services/device-session.service.js';
import {sha256SessionIdentifier} from '../utils/session-rules.js';
import {ApiError} from '../utils/api-response.js';
import {withDeletionPassword} from '../services/deletion-password.service.js';
import {isValidUuid} from '../utils/validation.js';
const router=Router();
router.post('/me/forget-device',authMiddleware,async(req,res,next)=>{try{const session=await db.from('device_sessions').select('id').eq('profile_id',req.user!.id).eq('session_hash',sha256SessionIdentifier(req.appSession?.sessionId??'')).single();if(session.error)throw new ApiError('Current device unavailable.',409);const r=await db.rpc('forget_login_device_v1',{p_actor:req.user!.id,p_subject:req.user!.id,p_session:session.data.id});if(r.error)throw new ApiError('Device could not be forgotten.',503);res.json({success:true});}catch(e){next(e);}});
router.use(authMiddleware,requireAdmin);
router.get('/device-sessions/summary',async(_req,res,next)=>{try{
 const profiles=await db.from('profiles').select('id,locked_at').is('deactivated_at',null);if(profiles.error)throw new ApiError('Session counts unavailable.',503);
 const sessions=await activeDeviceSessions((profiles.data??[]).map(p=>p.id));
 res.json({success:true,data:(profiles.data??[]).map(p=>({id:p.id,locked_at:p.locked_at,active_sessions:p.locked_at?0:sessions.filter(s=>s.profile_id===p.id).length}))});
}catch(e){next(e);}});
router.get('/:id/device-sessions',async(req,res,next)=>{try{
 const id=String(req.params.id);if(!isValidUuid(id))throw new ApiError('Invalid account.',400);
 const p=await db.from('profiles').select('id,locked_at').eq('id',id).single();if(p.error)throw new ApiError('Account not found.',404);
 const sessions=await activeDeviceSessions([id]),hash=sha256SessionIdentifier(req.appSession?.sessionId??'');
 res.json({success:true,data:{locked_at:p.data.locked_at,sessions:p.data.locked_at?[]:sessions.map(({session_hash,...s})=>({...s,current_device:id===req.user!.id&&session_hash===hash}))}});
}catch(e){next(e);}});
router.post('/:id/device-security',async(req,res,next)=>{try{
 const id=String(req.params.id),action=req.body?.action,session=req.body?.session_id??null;
 if(!isValidUuid(id)||!['revoke','forget','lock','unlock'].includes(action)||(['revoke','forget'].includes(action)&&!isValidUuid(session))||req.body?.confirmed!==true)throw new ApiError('Confirm a valid security action.',400);
 if(action==='forget'){const r=await db.rpc('forget_login_device_v1',{p_actor:req.user!.id,p_subject:id,p_session:session});if(r.error)throw new ApiError('Device could not be forgotten.',409);res.json({success:true});}else res.json({success:true,data:await manageDeviceSecurity(req.user!.id,id,action,session)});
}catch(e){next(e);}});
router.post('/:id/security/password',async(req,res,next)=>{let password=req.body?.new_password;const current=req.body?.current_password;if(req.body){delete req.body.current_password;delete req.body.new_password;}try{
 const id=String(req.params.id);if(!isValidUuid(id)||typeof password!=='string'||password.length<8||password.length>1024||password!==password.trim()||req.body?.confirmed!==true)throw new ApiError('Confirm a new password of at least 8 characters without leading or trailing spaces.',400);
 const actor={id:req.user!.id,role:req.user!.role!},token=req.headers.authorization?.replace(/^Bearer\s+/i,'').trim()??'';
 const result=await withDeletionPassword(actor,{password:current,accessToken:token,appSessionId:req.appSession!.sessionId},async()=>{
  await checkDeviceSession(actor.id,req.appSession!.sessionId,token,req.get('user-agent')??'');
  // Revoke application access first; a failed Auth update cannot leave an old session usable.
  await manageDeviceSecurity(actor.id,id,'revoke_all');
  const changed=await db.auth.admin.updateUserById(id,{password});password='';
  if(changed.error)throw new ApiError('Sessions were logged out, but the password change was not confirmed. Retry the password change.',400);
  return {changed:true};
 });res.json({success:true,data:result});
}catch(e){next(e);}finally{password='';}});
export default router;
