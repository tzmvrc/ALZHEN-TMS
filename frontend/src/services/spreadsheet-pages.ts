/** Stable page merging never overwrites an already loaded/confirmed edit with
 * an overlapping older network page. Reconciliation replaces snapshots explicitly. */
export function appendSpreadsheetRows<T>(current:readonly T[],incoming:readonly T[],identity:(row:T)=>string):T[]{
 const rows=new Map(current.map(row=>[identity(row),row]));
 for(const row of incoming){const key=identity(row);if(!key)throw Error("Spreadsheet row identity is missing.");if(!rows.has(key))rows.set(key,row);}
 return [...rows.values()];
}

/** Operations responses contain bounded related arrays as well as physical rows. */
export function appendSpreadsheetSnapshot<T extends object>(current:T,next:T,fields:readonly string[]):T{
 const result={...next} as Record<string,unknown>;
 for(const field of fields){const a=(current as Record<string,unknown>)[field],b=(next as Record<string,unknown>)[field];if(Array.isArray(a)&&Array.isArray(b))result[field]=appendSpreadsheetRows(a,b,row=>typeof row==="object"&&row?String(row.id??(row.source_type&&row.source_record_id?`${row.source_type}:${row.source_record_id}`:row.trip_id??row.value??JSON.stringify(row))):String(row));}
 return result as T;
}
