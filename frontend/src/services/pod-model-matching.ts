/** Only trip-provided choices may become selected models. No fuzzy numeric edits. */
const canonical=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
const confusable=(a:string,b:string)=>['0O','1IL','5S','8B'].some(group=>group.includes(a)&&group.includes(b));
export function matchPodModels(detected:string[],assigned:string[],aliases:Record<string,string[]>={}){
 const options=[...new Set(assigned.map(v=>v.trim()).filter(Boolean))],matched:string[]=[],unmatched:string[]=[];
 for(const raw of [...new Set(detected.map(v=>v.trim()).filter(Boolean))]){
  const key=canonical(raw),exact=options.filter(option=>[option,...(aliases[option]??[])].some(alias=>canonical(alias)===key));
  if(!key){unmatched.push(raw);continue;}
  let candidates=exact;
  if(!candidates.length&&key.length>=6){candidates=options.filter(option=>{const candidate=canonical(option);if(candidate.length!==key.length)return false;let changed=0,digits=0;for(let i=0;i<key.length;i++){if(key[i]===candidate[i]){if(/\d/.test(key[i]))digits++;continue;}if(!confusable(key[i],candidate[i]))return false;changed++;}return changed===1&&digits>=3;});}
  if(candidates.length===1){if(!matched.includes(candidates[0]))matched.push(candidates[0]);}else unmatched.push(raw);
 }
 return {matched,unmatched};
}

/** Quantities here describe the POD only; never update allocations or unloaded cargo. */
export function podModelCatalog(cargo:Array<{quantity?:number|string;line:{customer_model?:string;product?:{model_code?:string;sku?:string}}}>){
 const aliases:Record<string,string[]>={},quantities:Record<string,string>={},options:string[]=[];
 for(const row of cargo){const code=row.line.product?.model_code?.trim(),customer=row.line.customer_model?.trim(),model=code||customer;if(!model)continue;
  if(!options.includes(model))options.push(model);
  aliases[model]=[...new Set([...(aliases[model]??[]),model,customer,row.line.product?.sku].filter((value):value is string=>!!value))];
  const amount=row.quantity!==undefined&&String(row.quantity).trim()!==''?Number(row.quantity):NaN;
  const total=Number(quantities[model]??0)+(Number.isSafeInteger(amount)&&amount>=0?amount:1);quantities[model]=String(Number.isSafeInteger(total)?total:1);
 }
 return {options,aliases,quantities};
}
