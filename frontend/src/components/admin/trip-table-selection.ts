/** Selection transitions extracted from Master List; all appearances share these rules. */
export function selectTripAxis(keys:readonly string[],selected:ReadonlySet<string>,key:string,anchor:string|null,extend=false,add=false){
 const end=keys.indexOf(key),start=extend&&anchor?keys.indexOf(anchor):end;
 if(end<0)return new Set(selected);
 const next=add?new Set(selected):new Set<string>();
 for(let index=Math.min(start<0?end:start,end);index<=Math.max(start<0?end:start,end);index++)next.add(keys[index]);
 if(add&&!extend&&selected.has(key))next.delete(key);
 return next;
}
export function selectTripCells(rows:readonly string[],columns:readonly string[],selected:ReadonlySet<string>,cell:{row:string;column:string},anchor:{row:string;column:string}|null,extend=false,add=false,encode=(row:string,column:string)=>row+"\u0000"+column){
 const origin=extend&&anchor?anchor:cell,r0=rows.indexOf(origin.row),r1=rows.indexOf(cell.row),c0=columns.indexOf(origin.column),c1=columns.indexOf(cell.column);
 if([r0,r1,c0,c1].some(index=>index<0))return new Set(selected);
 const next=add?new Set(selected):new Set<string>();
 for(let r=Math.min(r0,r1);r<=Math.max(r0,r1);r++)for(let c=Math.min(c0,c1);c<=Math.max(c0,c1);c++)next.add(encode(rows[r],columns[c]));
 if(add&&!extend&&selected.has(encode(cell.row,cell.column)))next.delete(encode(cell.row,cell.column));
 return next;
}

/** Spreadsheet clipboard retains empty holes in disjoint selections, like Master List. */
export function tripSelectionText<R>(rows:readonly R[],columns:readonly string[],selected:ReadonlySet<string>,identity:(row:R)=>string,value:(row:R,column:string)=>string,encode=(row:string,column:string)=>row+"\u0000"+column){
 const selectedRows:number[]=[],selectedColumns:number[]=[];
 rows.forEach((row,index)=>{if(columns.some(column=>selected.has(encode(identity(row),column))))selectedRows.push(index);});
 columns.forEach((column,index)=>{if(rows.some(row=>selected.has(encode(identity(row),column))))selectedColumns.push(index);});
 if(!selectedRows.length||!selectedColumns.length)return "";
 return rows.slice(selectedRows[0],selectedRows.at(-1)!+1).map(row=>columns.slice(selectedColumns[0],selectedColumns.at(-1)!+1).map(column=>selected.has(encode(identity(row),column))?value(row,column):"").join("\t")).join("\n");
}

export function tripSelectedAxes(cells:ReadonlySet<string>){
 const rows=new Set<string>(),columns=new Set<string>();
 for(const key of cells){const split=key.lastIndexOf("\u0000");if(split>=0){rows.add(key.slice(0,split));columns.add(key.slice(split+1));}}
 return {rows:[...rows],columns:[...columns]};
}
