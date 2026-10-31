type GalleryRecord={id:string;trip_id:string;kind?:string;assignment_id?:string|null;trip_stop_id?:string|null;delivery_event_id?:string|null;pod_review_status?:string|null;replaces_receipt_id?:string|null;storage_path:string;created_at?:string|null;delivery_upload_state?:string|null;delivery_upload_key?:string|null};
/** Explicit submission/replacement identities, never a shared DR or product label. */
export function currentGalleryImages<T extends GalleryRecord>(records:T[],trip:string):T[]{
 const unique=new Map<string,T>();
 for(const row of records)if(row.trip_id===trip&&row.delivery_upload_state!=='PENDING'&&(!row.delivery_upload_key||row.delivery_event_id)&&!unique.has(row.id))unique.set(row.id,row);
 const rows=[...unique.values()],submissions=new Map<string,T[]>(),byPage=new Map<string,string>();
 for(const row of rows.filter(row=>row.kind==='receipt')){
  const key=row.delivery_event_id||row.id;
  submissions.set(key,[...(submissions.get(key)??[]),row]);byPage.set(row.id,key);
 }
 const superseded=new Set<string>(),invalid=new Set<string>();
 for(const [key,pages] of submissions){
  const first=pages[0];
  if(pages.some(page=>page.assignment_id!==first.assignment_id||page.trip_stop_id!==first.trip_stop_id)){invalid.add(key);continue;}
  for(const page of pages){
   if(!page.replaces_receipt_id)continue;
   const previousKey=byPage.get(page.replaces_receipt_id),previous=previousKey&&submissions.get(previousKey)?.[0];
   if(!previous)continue; // Legacy originals may be unavailable; never guess a parent by DR.
   if(previous.trip_id!==page.trip_id||previous.assignment_id!==page.assignment_id||previous.trip_stop_id!==page.trip_stop_id){invalid.add(key);continue;}
   superseded.add(previousKey!);
  }
 }
 const eligible=new Set([...submissions].filter(([key,pages])=>!superseded.has(key)&&!invalid.has(key)&&pages.every(page=>page.pod_review_status==='APPROVED')).flatMap(([,pages])=>pages.map(page=>page.id)));
 const paths=new Set<string>();
 return rows.filter(row=>row.kind==='photo'||eligible.has(row.id)).sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??'')||a.id.localeCompare(b.id)).filter(row=>{
  const key=JSON.stringify([row.assignment_id,row.trip_stop_id,row.storage_path]);if(paths.has(key))return false;paths.add(key);return true;
 }).sort((a,b)=>(a.created_at??'').localeCompare(b.created_at??'')||a.id.localeCompare(b.id));
}
