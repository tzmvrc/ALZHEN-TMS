import express,{type RequestHandler} from "express";
const parse=express.raw({type:["image/jpeg","image/png","image/webp","application/pdf"],limit:"5mb"});
export const podUploadBody:RequestHandler=(req,res,next)=>parse(req,res,(error:unknown)=>{
 if(error&&typeof error==="object"&&"type" in error&&error.type==="entity.too.large"){
  res.status(413).json({success:false,message:"Choose a receipt up to 5 MB.",error:{code:"POD_DOCUMENT_TOO_LARGE"}});return;
 }
 next(error);
});
