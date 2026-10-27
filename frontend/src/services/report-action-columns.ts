import type {ReportColumn,ReportRow} from "./report.service";
export const TRIP_DETAILS_COLUMN:ReportColumn={key:"trip_details",title:"TRIP DETAILS",type:"action"};
export function withTripDetailsColumn(columns:ReportColumn[],enabled:boolean):ReportColumn[]{
 if(!enabled||!columns.length)return columns;
 return [...columns.filter(column=>column.key!==TRIP_DETAILS_COLUMN.key),TRIP_DETAILS_COLUMN];
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function tripDetailsTarget(row:ReportRow){
 const tripId=typeof row.trip_id==="string"&&uuid.test(row.trip_id)?row.trip_id:row._trip_id;
 if(typeof tripId!=="string"||!uuid.test(tripId))return null;
 const stop=typeof row.trip_stop_id==="string"&&uuid.test(row.trip_stop_id)?row.trip_stop_id:row._trip_stop_id;
 const stopId=typeof stop==="string"&&uuid.test(stop)?stop:null;
 return {tripId,stopId,href:`/trips/${encodeURIComponent(tripId)}${stopId?`?stop=${encodeURIComponent(stopId)}`:""}`};
}
