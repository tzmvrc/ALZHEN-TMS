/** Retain every convoy presentation row, but emit each additive source value
 * once per physical entity so exported totals do not count repeated joins. */
export function operationalExportRows<T extends Record<string,unknown>>(rows:T[]):T[]{
 const seen=new Map<string,Set<string>>();const fields:Record<string,string[]>={
  quantity:['trip_line_item_id','_trip_line_item_id'],cbm:['trip_line_item_id','_trip_line_item_id'],
  transaction_quantity:['trip_stop_id','_trip_stop_id'],transaction_total_cbm:['trip_stop_id','_trip_stop_id'],
  trip_total_cbm:['trip_id','_trip_id'],remaining_unassigned_cbm:['trip_id','_trip_id'],subcon_rate_manual:['trip_id','_trip_id'],
  assigned_cbm:['assignment_id','_assignment_id'],truck_capacity_cbm:['assignment_id','_assignment_id'],
 };
 return rows.map(row=>{const copy={...row};for(const [field,keys] of Object.entries(fields)){if(copy[field]==null)continue;const id=keys.map(key=>row[key]).find(value=>typeof value==='string'&&value);if(typeof id!=='string')continue;let ids=seen.get(field);if(!ids){ids=new Set();seen.set(field,ids);}if(ids.has(id))(copy as Record<string,unknown>)[field]=null;else ids.add(id);}return copy;});
}
