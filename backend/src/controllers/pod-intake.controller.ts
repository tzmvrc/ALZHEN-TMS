import type {Request,Response} from "express";
import {preparePdfPages,savedPdfPages,pdfEnabled} from "../services/pod-pages.service.js";
import {ApiError,sendError,sendSuccess} from "../utils/api-response.js";
const value=(req:Request,key:string)=>String(req.params[key]??"");
const actor=(req:Request)=>({id:req.user!.id,role:req.user!.role!});
export const intakeCapabilities=(_req:Request,res:Response)=>sendSuccess(res,200,"POD intake availability",{pdf:pdfEnabled(),max_bytes:5242880});
export async function prepareDriverPdf(req:Request,res:Response){
 try{
  if(!Buffer.isBuffer(req.body))throw new ApiError("Select a document up to 5 MB.",400,"POD_INVALID");
  const result=await preparePdfPages(actor(req),value(req,"id"),String(req.headers["x-trip-stop-id"]??""),req.body,String(req.headers["content-type"]),decodeURIComponent(String(req.headers["x-file-name"]??"")));
  res.setHeader("Cache-Control","private, no-store");return sendSuccess(res,200,"PDF pages prepared",result);
 }catch(error){return sendError(res,error instanceof ApiError?error.statusCode:400,error instanceof Error?error.message:"PDF could not be processed.",error instanceof ApiError?error.code:"POD_INVALID");}
}
export async function getReceiptPages(req:Request,res:Response){
 try{const result=await savedPdfPages(actor(req),value(req,"id"),value(req,"receiptId"));res.setHeader("Cache-Control","private, no-store");return sendSuccess(res,200,"Receipt pages",result);}
 catch(error){return sendError(res,error instanceof ApiError?error.statusCode:400,error instanceof Error?error.message:"PDF could not be loaded.",error instanceof ApiError?error.code:"POD_INVALID");}
}
