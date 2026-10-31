/** Names use persisted relationships only; never OCR text or display-label joins. */
export function safeFilePart(value:unknown,fallback='Record'){
 const clean=String(value??'').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/g,'').slice(0,100).replace(/[. ]+$/g,'');
 return !clean||/^\.+$/.test(clean)?fallback:/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)?`_${clean}`:clean;
}
const imageExtensions=new Set(['jpg','jpeg','png','webp','gif','avif','bmp','tif','tiff','heic','heif']);
const mimeExtensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/bmp':'bmp','image/tiff':'tif','image/heic':'heic','image/heif':'heif'};
export type MediaRow={id:string;trip_id:string;storage_path:string;file_name:string;mime_type?:string|null;assignment_id?:string|null;trip_stop_id?:string|null;dr_number?:string|null;created_at?:string|null;delivery_event_id?:string|null;kind?:string;delivery_upload_state?:string|null;delivery_upload_key?:string|null;pod_review_status?:string|null;replaces_receipt_id?:string|null;display_order?:number|null};
export type MediaStop={id:string;trip_id:string;dr_number?:string|null;delivery_location?:string|null;stop_sequence?:number|null;store?:{name?:string|null}|null};
export function imageExtension(row:MediaRow){
 if(row.mime_type&&!row.mime_type.startsWith('image/'))return null;
 const extension=(row.file_name.match(/\.([a-z0-9]+)$/i)?.[1]??row.storage_path.match(/\.([a-z0-9]+)$/i)?.[1]??'').toLowerCase();
 const actual=mimeExtensions[row.mime_type??''];
 return actual?(extension===actual||actual==='jpg'&&extension==='jpeg'||actual==='tif'&&extension==='tiff'?extension:actual):imageExtensions.has(extension)?extension:null;
}
export function nameTripImages(rows:MediaRow[],stops:MediaStop[],tripId:string){
 const stopMap=new Map(stops.filter(stop=>stop.trip_id===tripId).map(stop=>[stop.id,stop]));
 const seen=new Set<string>();
 const source=rows.filter(row=>row.trip_id===tripId&&imageExtension(row)&&!seen.has(row.id)&&Boolean(seen.add(row.id)));
 const prepared=source.map(row=>{
  const stop=stopMap.get(row.trip_stop_id??''),dr=row.dr_number?.trim()||stop?.dr_number?.trim(),destination=stop?.store?.name?.trim()||stop?.delivery_location?.trim();
  const base=dr&&destination?`${safeFilePart(dr)} - ${safeFilePart(destination)}`:`${safeFilePart(row.file_name.replace(/\.[^.]+$/,''),'Image')} - ${safeFilePart(row.id)}`;
  const folder=destination?`Stop ${safeFilePart(stop?.stop_sequence??'',safeFilePart(stop!.id))} - ${safeFilePart(destination)}/${dr?`DR ${safeFilePart(dr)}`:'Other images'}`:'Unassociated records';
  return {row,base,folder,extension:imageExtension(row)!};
 });
 const totals=new Map<string,number>(),counts=new Map<string,number>();
 for(const item of prepared)totals.set(item.base.toLowerCase(),(totals.get(item.base.toLowerCase())??0)+1);
 return prepared.map(({row,base,folder,extension})=>{
  const key=base.toLowerCase(),index=(counts.get(key)??0)+1;counts.set(key,index);
  const filename=`${base}${totals.get(key)!>1?` - ${String(index).padStart(2,'0')}`:''}.${extension}`;
  return {...row,filename,archivePath:`${folder}/${filename}`};
 });
}
