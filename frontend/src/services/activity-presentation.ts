/** Presentation only: saved event keys and ownership tags never become user-facing copy. */
export function activityDescription(value: string, destination?: string) {
  const key=value.toUpperCase().replaceAll("_"," ").replace(/^DEMO /,"");
  const place=destination?` at ${destination}`:"";
  if(/GPS|LOCATION/.test(key))return "GPS location updated";
  if(key==="TRIP ASSIGNED")return "Trip assignment recorded";
  if(key==="ON THE WAY")return "Truck is on the way";
  if(key==="AT DELIVERY STOP")return "Arrived at delivery stop";
  if(key==="UNLOADING")return "Unloading in progress";
  if(/WAREHOUSE.*ARRIV/.test(key))return "Arrived at warehouse";
  if(/STOP DEPART/.test(key))return `Departed delivery stop${place}`;
  if(/INCIDENT/.test(key))return "Incident report recorded";
  if(/UNLOADING.*(FINISH|COMPLETE)|FIRST DELIVERY COMPLETED/.test(key))return `Delivery completed${place}`;
  if(/UNLOADING.*START|START.*UNLOAD/.test(key))return `Started unloading${place}`;
  if(/LOADING.*(FINISH|COMPLETE)/.test(key))return "Finished loading at warehouse";
  if(/LOADING.*START|START.*LOAD/.test(key))return "Started loading at warehouse";
  if(/WAREHOUSE.*DEPART|DEPART.*WAREHOUSE/.test(key))return "Departed warehouse";
  if(/ARRIV/.test(key))return destination?`Arrived at ${destination}`:"Arrived at delivery stop";
  if(/POD|RECEIPT/.test(key))return "Delivery receipt submitted";
  if(/OFFLOAD/.test(key))return "Offload report recorded";
  if(/BACKLOAD/.test(key))return "Backload report recorded";
  if(/COMPLETE|DELIVERED|TRIP FINISH/.test(key))return "Delivery completed";
  if(/DETAIL/.test(key))return "Delivery details updated";
  return "Trip update recorded";
}
export const cleanActivityNote=(value:string)=>value.replace(/\[(?:ALZHEN_[A-Z0-9_]+|assignment:[0-9a-f-]+)\]\s*/gi,"").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,"").trim();
export const assignmentTripUrl=(tripId:string,assignmentId:string)=>`/trips/${encodeURIComponent(tripId)}?assignment=${encodeURIComponent(assignmentId)}`;
