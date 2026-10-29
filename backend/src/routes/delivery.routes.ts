import {Router,raw,type Request,type Response} from 'express';
import {authMiddleware} from '../middleware/auth.middleware.js';
import {requireRole} from '../middleware/role.middleware.js';
import {ApiError,sendError,sendSuccess} from '../utils/api-response.js';
import {deliveryAssignments,deliveryWorkspace,deliveryEvents,deliveryEventDetails,submitDelivery,reviewDelivery,uploadDeliveryEvidence,deliveryLocation,setDeliveryGeofence} from '../services/delivery-workspace.service.js';
import {readPodAutomatically} from '../services/pod-auto-read.service.js';
import {deliveryNotification} from '../services/delivery-workspace.service.js';
import {currentDeliveryWorkspace} from '../services/delivery-workspace.service.js';
import {deliveryReceipts} from '../services/delivery-workspace.service.js';
import {deliverySubmission} from '../services/delivery-workspace.service.js';
import {withSupabaseDeadline} from '../utils/supabase-request-scope.js';
const router=Router();
// Bound authentication, validation, Storage and RPC work for saved submissions.
// AI reading retains its separate streaming/extraction deadline.
router.use((req,_res,next)=>{if(req.method==='POST'&&/\/(events|evidence)$/.test(req.path)||req.method==='GET'&&/\/submissions\//.test(req.path))void withSupabaseDeadline(20000,async()=>next());else next();},authMiddleware,requireRole('ADMIN','STAFF','TRUCKER'));
const actor=(req:Request)=>({id:req.user!.id,role:req.user!.role!});
const wrap=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response)=>{try{return sendSuccess(res,200,'Delivery workspace',await fn(req));}catch(e){return sendError(res,e instanceof ApiError?e.statusCode:503,e instanceof ApiError?e.message:'Delivery service is unavailable. Your draft is preserved.',e instanceof ApiError?e.code:'DELIVERY_UNAVAILABLE');}};
router.get('/assignments',wrap(req=>deliveryAssignments(actor(req),typeof req.query.after==='string'?req.query.after:undefined)));
router.get('/current',wrap(req=>currentDeliveryWorkspace(actor(req))));
router.get('/events/:event/notification',requireRole('ADMIN','STAFF'),wrap(req=>deliveryNotification(actor(req),String(req.params.event))));
router.patch('/locations/:kind/:id/geofence',requireRole('ADMIN'),wrap(req=>setDeliveryGeofence(actor(req),String(req.params.kind),String(req.params.id),req.body?.radius)));
router.get('/assignments/:id',wrap(req=>deliveryWorkspace(actor(req),String(req.params.id))));
router.get('/assignments/:id/receipts',wrap(req=>deliveryReceipts(actor(req),String(req.params.id))));
router.get('/assignments/:id/location',wrap(req=>deliveryLocation(actor(req),String(req.params.id),typeof req.query.before==='string'?req.query.before:undefined)));
router.get('/assignments/:id/events',wrap(req=>deliveryEvents(actor(req),String(req.params.id),typeof req.query.cursor==='string'?req.query.cursor:undefined,req.query.scope==='reports',req.query.evidence==='1')));
router.get('/assignments/:id/submissions/:key',requireRole('TRUCKER'),wrap(req=>deliverySubmission(actor(req),String(req.params.id),String(req.params.key))));
router.get('/assignments/:id/events/:event',wrap(req=>deliveryEventDetails(actor(req),String(req.params.id),String(req.params.event))));
router.post('/assignments/:id/events',wrap(req=>submitDelivery(actor(req),String(req.params.id),String(req.headers['idempotency-key']??''),req.body)));
router.patch('/assignments/:id/events/:event',wrap(req=>reviewDelivery(actor(req),String(req.params.id),String(req.params.event),req.body??{})));
router.post('/assignments/:id/pod/read',raw({type:['image/jpeg','image/png','image/webp','application/pdf'],limit:'5mb'}),async(req,res)=>{
 const streaming=req.headers.accept==='application/x-ndjson';
 const write=(payload:unknown)=>{if(res.destroyed||res.writableEnded)return;if(!res.headersSent){res.setHeader('Content-Type','application/x-ndjson');res.setHeader('Cache-Control','no-store');res.setHeader('X-Accel-Buffering','no');}res.write(JSON.stringify(payload)+'\n');};
 try{
  const result=await readPodAutomatically(actor(req),String(req.params.id),String(req.headers['x-trip-stop-id']??''),req.body,String(req.headers['content-type']??''),decodeURIComponent(String(req.headers['x-file-name']??'Receipt')),streaming?data=>write({progress:true,data}):undefined);
  if(streaming){write({success:true,data:result});res.end();}else sendSuccess(res,200,'Receipt reading',result);
 }catch(e){
  const message=e instanceof ApiError?e.message:'Receipt reading is unavailable. Retry or review manually.',code=e instanceof ApiError?e.code:'POD_READING_UNAVAILABLE';
  if(res.headersSent){write({success:false,message,error:{code}});res.end();}else sendError(res,e instanceof ApiError?e.statusCode:503,message,code);
 }
});
router.post('/assignments/:id/evidence',raw({type:['image/jpeg','image/png','image/webp','application/pdf'],limit:'5mb'}),wrap(req=>uploadDeliveryEvidence(actor(req),String(req.params.id),String(req.headers['idempotency-key']??''),typeof req.headers['x-trip-stop-id']==='string'?req.headers['x-trip-stop-id']:null,req.body,decodeURIComponent(String(req.headers['x-file-name']??'Photo')),String(req.headers['content-type']??''))));
export default router;
