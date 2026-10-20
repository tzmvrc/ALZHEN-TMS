import {ApiError} from "../utils/api-response.js";
const fail=():never=>{throw new ApiError("Invalid shared table design. Use supported colors, fonts and column settings.",400,"INVALID_TABLE_DESIGN");};
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))return fail();return value as Record<string,unknown>;}
const color=(v:unknown)=>v===null||typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);
export function validateFormat(value:unknown){
 const v=object(value);
 for(const [key,item] of Object.entries(v)){
  if(["bold","italic","underline"].includes(key)){if(typeof item!=="boolean")fail();}
  else if(["color","backgroundColor"].includes(key)){if(!color(item))fail();}
  else if(key==="fontSize"){if(item!==null&&(!Number.isInteger(item)||Number(item)<9||Number(item)>32))fail();}
  else if(key==="fontFamily"){if(item!==null&&!["Arial","Calibri","Verdana","Georgia","monospace"].includes(String(item)))fail();}
  else fail();
 }
 return v;
}
export function validateDesignPatch(value:unknown){
 const v=object(value);if(Buffer.byteLength(JSON.stringify(v))>250000)fail();
 for(const [key,item] of Object.entries(v)){
  if(key==="hidden"){if(typeof item!=="boolean")fail();}
  else if(key==="position"){if(!Number.isInteger(item)||Number(item)<0||Number(item)>1000)fail();}
  else if(key==="pin"){if(item!==null&&item!=="left"&&item!=="right")fail();}
  else if(key==="alignment"){if(item!==null&&!["left","center","right"].includes(String(item)))fail();}
  else if(key==="color"){if(!color(item))fail();}
  else if(key==="header"){
   const header=object(item);
   for(const [field,value] of Object.entries(header)){
    if(["color","backgroundColor"].includes(field)){if(!color(value))fail();}
    else if(field==="fontSize"){if(value!==null&&(!Number.isInteger(value)||Number(value)<9||Number(value)>32))fail();}
    else fail();
   }
  }
  else if(key==="format")validateFormat(item);
  else if(key==="cells"){
   const cells=object(item);if(Object.keys(cells).length>1000)fail();
   for(const [row,format] of Object.entries(cells)){if(!row||row.length>512||[...row].some(c=>c.charCodeAt(0)<32)||["__proto__","constructor","prototype"].includes(row))fail();if(format!==null)validateFormat(format);}
  }else fail();
 }
 return v;
}
export function mergeDesign(current:Record<string,unknown>,patch:Record<string,unknown>){
 const next={...current,...patch};
 if(patch.header)next.header={...object(current.header??{}),...object(patch.header)};
 if(patch.format)next.format={...object(current.format??{}),...object(patch.format)};
 if(patch.cells){const cells={...object(current.cells??{}),...object(patch.cells)};for(const [key,value] of Object.entries(cells))if(value===null)delete cells[key];if(Object.keys(cells).length>1000)fail();next.cells=cells;}
 if(Buffer.byteLength(JSON.stringify(next))>250000)fail();return next;
}
