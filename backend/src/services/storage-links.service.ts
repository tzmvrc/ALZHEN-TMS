import {supabaseAdmin} from "../config/supabase.js";

/** Sign only paths already returned by an authorized record query. Bounded
 * chunks avoid one Storage HTTP request per image; no cross-user URL cache. */
export async function signStoragePaths(bucket:string,paths:readonly (string|null|undefined)[],expiresIn:number){
 const unique=[...new Set(paths.filter((path):path is string=>typeof path==="string"&&path.length>0))];
 const links=new Map<string,string>();
 for(let offset=0;offset<unique.length;offset+=100){
  try{
   const {data,error}=await supabaseAdmin.storage.from(bucket).createSignedUrls(unique.slice(offset,offset+100),expiresIn);
   if(error)continue;
   for(const link of data??[])if(link.path&&link.signedUrl&&!link.error)links.set(link.path,link.signedUrl);
  }catch{/* Callers decide whether an unavailable image is optional or required. */}
 }
 return links;
}
