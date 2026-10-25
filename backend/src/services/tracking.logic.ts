import {createHash} from "node:crypto";
import {ApiError} from "../utils/api-response.js";
export type RoutePoint={id:string;latitude:number;longitude:number};
const coordinate=(latitude:unknown,longitude:unknown)=>typeof latitude==="number"&&Number.isFinite(latitude)&&latitude>=-90&&latitude<=90&&typeof longitude==="number"&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180;

export function validateTrackingCapture(input:Record<string,unknown>,now=Date.now()){
 const captured=typeof input.captured_at==="string"&&/(?:Z|[+-]\d{2}:\d{2})$/.test(input.captured_at)?Date.parse(input.captured_at):NaN;
 if(!coordinate(input.latitude,input.longitude)||typeof input.accuracy_meters!=="number"||!Number.isFinite(input.accuracy_meters)||input.accuracy_meters<0||input.accuracy_meters>200||!Number.isFinite(captured)||captured>now+120000||captured<now-120000)throw new ApiError("A recent GPS capture with valid coordinates, accuracy and timezone is required.",400,"TRACKING_CAPTURE_INVALID");
 return {latitude:input.latitude as number,longitude:input.longitude as number,accuracy_meters:input.accuracy_meters,captured_at:new Date(captured).toISOString()};
}
export function captureIsNewer(capturedAt:string,previousAt:string|null){return previousAt===null||Date.parse(capturedAt)>Date.parse(previousAt);}
export function destinationFingerprint(assignmentId:string,points:RoutePoint[],assignmentRevision=""){
 if(!assignmentId||!points.length||points.length>24||new Set(points.map(p=>p.id)).size!==points.length||points.some(p=>!p.id||!coordinate(p.latitude,p.longitude)))throw new ApiError("An exact assignment and ordered remaining destinations are required.",400,"ROUTE_DESTINATIONS_INVALID");
 // Current truck position is intentionally excluded: moving a pin is not a
 // material destination/sequence change and must not trigger Directions calls.
 return createHash("sha256").update(JSON.stringify([assignmentId,assignmentRevision,points.map(p=>[p.id,p.latitude,p.longitude])])).digest("hex");
}
export function planRoadRoute(input:{active:boolean;hasPosition:boolean;fingerprint:string;cachedFingerprint:string|null;calculatedAt:number|null;leaseUntil:number|null;retryAfter:number|null},now=Date.now()){
 if(!input.active)return {fetch:false,reason:"INACTIVE"};
 if(!input.hasPosition)return {fetch:false,reason:"NO_POSITION"};
 if(input.leaseUntil!==null&&input.leaseUntil>now)return {fetch:false,reason:"LEASED"};
 if(input.retryAfter!==null&&input.retryAfter>now)return {fetch:false,reason:"RETRY_DELAY"};
 if(input.cachedFingerprint!==input.fingerprint)return {fetch:true,reason:"DESTINATION_CHANGED"};
 if(input.calculatedAt===null||now-input.calculatedAt>=3600000)return {fetch:true,reason:"HOURLY_REFRESH"};
 return {fetch:false,reason:"CACHED"};
}
