import {ApiError} from "../utils/api-response.js";
const fail=():never=>{throw new ApiError("Invalid shared table design. Use supported colors, fonts, row heights and column settings.",400,"INVALID_TABLE_DESIGN");};
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))return fail();return value as Record<string,unknown>;}
const color=(v:unknown)=>v===null||typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);
export function validateFormat(value:unknown){
 const v=object(value);
 for(const [key,item] of Object.entries(v)){
  if(["bold","italic","underline"].includes(key)){if(typeof item!=="boolean")fail();}
  else if(["color","backgroundColor"].includes(key)){if(!color(item))fail();}
  else if(key==="fontSize"){if(item!==null&&(!Number.isInteger(item)||Number(item)<9||Number(item)>32))fail();}
  else if(key==="alignment"){if(item!==null&&!["left","center","right"].includes(String(item)))fail();}
  else if(key==="fontFamily"){if(item!==null&&!["Inter","Arial","Calibri","Verdana","Georgia","monospace"].includes(String(item)))fail();}
  else fail();
 }
 return v;
}
export function validateDesignPatch(value:unknown){
 const v=object(value);if(Buffer.byteLength(JSON.stringify(v))>250000)fail();
 for(const [key,item] of Object.entries(v)){
  if(key==="headerHeight"){if(item!==null&&(!Number.isInteger(item)||Number(item)<24||Number(item)>1200))fail();}
  else if(key==="rowHeights"){
   const heights=object(item);
   for(const [row,height] of Object.entries(heights)){
    if(!row||row.length>512||/[\x00-\x1f]/.test(row)||["__proto__","constructor","prototype"].includes(row))fail();
    if(height!==null&&(!Number.isInteger(height)||Number(height)<24||Number(height)>1200))fail();
   }
  }
  else if(key==="alias"){if(item!==null&&(typeof item!=="string"||!item.trim()||item.length>100||/[\x00-\x1f]/.test(item)))fail();}
  else if(key==="combined"){if(typeof item!=="boolean")fail();}
  else if(key==="input"){
   const config=object(item);if(Object.keys(config).some(key=>!["type","options"].includes(key))||!["TEXT","NUMBER","DATE","DROPDOWN"].includes(String(config.type)))fail();
   if(config.options!==undefined){if(!Array.isArray(config.options)||config.options.length>100)fail();const seen=new Set<string>();for(const raw of config.options as unknown[]){const option=object(raw);if(Object.keys(option).some(key=>!["value","label","color","active"].includes(key))||typeof option.value!=="string"||!option.value.trim()||option.value.length>500||typeof option.label!=="string"||!option.label.trim()||option.label.length>100||!color(option.color)||typeof option.active!=="boolean"||seen.has(option.value))fail();seen.add(option.value as string);}}
  }
  else if(key==="hidden"){if(typeof item!=="boolean")fail();}
  else if(key==="position"){if(!Number.isInteger(item)||Number(item)<0||Number(item)>1000)fail();}
  else if(key==="pin"){if(item!==null&&item!=="left"&&item!=="right")fail();}
  else if(key==="alignment"){if(item!==null&&!["left","center","right"].includes(String(item)))fail();}
  else if(key==="color"){if(!color(item))fail();}
  else if(key==="header")validateFormat(item);
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
 if(patch.rowHeights){const heights={...object(current.rowHeights??{}),...object(patch.rowHeights)};for(const [key,height] of Object.entries(heights))if(height===null)delete heights[key];next.rowHeights=heights;}
 if(patch.header)next.header={...object(current.header??{}),...object(patch.header)};
 if(patch.format)next.format={...object(current.format??{}),...object(patch.format)};
 if(patch.cells){const cells={...object(current.cells??{}),...object(patch.cells)};for(const [key,value] of Object.entries(object(patch.cells)))if(value===null)delete cells[key];else cells[key]={...object(object(current.cells??{})[key]??{}),...object(value)};if(Object.keys(cells).length>1000)fail();next.cells=cells;}
 if(Buffer.byteLength(JSON.stringify(next))>250000)fail();return next;
}
