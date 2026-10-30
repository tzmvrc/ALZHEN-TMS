/** Collect bounded identity pages only after an explicit Select All gesture. */
export async function collectSelectionPages<R>(load:(page:number)=>Promise<{rows:R[];pagination:{total:number;totalPages:number}}>,identity:(row:R)=>string|null,current:()=>boolean=()=>true,progressiveCount=false){
 const records=new Map<string,R>();let total:number|undefined;
 for(let page=1;;page++){
  if(!current())throw new DOMException("Selection cancelled","AbortError");
  const result=await load(page);
  if(!current())throw new DOMException("Selection cancelled","AbortError");
  if(!progressiveCount&&total!==undefined&&result.pagination.total!==total)throw Error("Records changed while selecting. Please retry Select All.");
  total=result.pagination.total;
  for(const row of result.rows){const id=identity(row);if(!id||records.has(id))throw Error("Row identities changed while selecting. Please retry.");records.set(id,row);}
  if(page>=result.pagination.totalPages)break;
  if(!result.rows.length)throw Error("Selection is incomplete. Please retry.");
 }
 if(records.size!==total)throw Error("Selection is incomplete. Please retry.");
 return [...records.values()];
}
