import type { CellDesign, HeaderDesign } from "./shared-table-design";
/** Flex definitions already have versioned settings and manage authorization. */
export function flexColumnAppearance(settings:Record<string,unknown>){
 const raw=settings.appearance;
 const value=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
 const format=value.format&&typeof value.format==="object"&&!Array.isArray(value.format)?value.format as CellDesign:undefined;
 const header=value.header&&typeof value.header==="object"&&!Array.isArray(value.header)?Object.fromEntries(Object.entries(value.header).filter(([key,color])=>(["color","backgroundColor"].includes(key)&&(color===null||typeof color==="string"&&/^#[0-9a-f]{6}$/i.test(color))||key==="fontSize"&&(color===null||Number.isInteger(color)&&Number(color)>=9&&Number(color)<=32)))) as HeaderDesign:undefined;
 return {format,header,color:typeof value.color==="string"&&/^#[0-9a-f]{6}$/i.test(value.color)?value.color:undefined,pin:value.pin==="left"||value.pin==="right"?value.pin:undefined};
}
export function patchFlexColumnAppearance(settings:Record<string,unknown>,patch:{color?:string|null;pin?:"left"|"right"|null;header?:HeaderDesign}){
 const raw=settings.appearance;
 return {...settings,appearance:{...(raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{}),...patch}};
}
