export type Group={id:string;label:string;kind:'dispatch'|'trip'|'stop'|'dr'};
const value=(row:Record<string,unknown>,...fields:string[])=>{for(const field of fields){const item=row[field];if(typeof item==='string'&&item.trim())return item; if(typeof item==='number')return String(item);}return '';};

/** Relationships come from source IDs; names are labels only. Missing IDs
 * stay isolated rather than merging unrelated deliveries with the same name. */
export function reportRowGroups(row:Record<string,unknown>,key:string,report:string):Group[]{
  const trip=value(row,'trip_id','_trip_id')||key;
  const dispatch=value(row,'dispatch_number','dispatch_reference');
  const stop=value(row,'trip_stop_id','_trip_stop_id');
  const dr=value(row,'delivery_receipt_no','dr_number','dr_no');
  const groups:Group[]=[{id:`dispatch:${dispatch||trip}`,label:dispatch||'Dispatch · '+trip,kind:'dispatch'}];
  if(report!=='store-calling'&&report!=='transmittal-tracker')groups.push({id:`trip:${trip}`,label:'Trip '+(value(row,'trip_reference','trip_number')||trip),kind:'trip'});
  if(report==='store-calling'||report==='transmittal-tracker')groups.push({id:`stop:${trip}:${stop||key}`,label:value(row,'delivered_to','store_name','customer_store_name')||dr||'Delivery stop',kind:'stop'});
  else groups.push({id:`dr:${trip}:${stop||key}:${dr}`,label:dr?'DR '+dr:'Delivery stop',kind:'dr'});
  return groups;
}

