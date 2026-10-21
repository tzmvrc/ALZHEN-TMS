import type { ConfiguredInput } from "./shared-table-design";

/** Additional validation for custom input modes on otherwise editable text fields. */
export function configuredCellValue(value:string,input:ConfiguredInput|undefined,originalValue:string):string {
  if(!input || !value)return value;
  if(input.type==="NUMBER"&&!Number.isFinite(Number(value)))throw new Error("Enter a valid number.");
  if(input.type==="DATE"&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new Error("Enter a valid date.");
  if(input.type==="DROPDOWN"){
    const option=input.options?.find(option=>(option.active||option.value===originalValue)&&(option.value===value||option.label===value));
    if(!option)throw new Error("Choose an active dropdown option.");
    return option.value;
  }
  return value;
}
