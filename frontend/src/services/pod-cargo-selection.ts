import type {DeliveryCargo,DeliveryWorkspace} from './delivery.service';
import type {AutomaticPodReading} from './pod-auto-read.service';
import {cargoPodReceipt} from './pod-submissions';
import {matchPodModels,podModelCatalog} from './pod-model-matching';

export function eligiblePodCargo(workspace:DeliveryWorkspace){
 const stopDrs=Object.fromEntries(workspace.stops.map(stop=>[stop.id,stop.dr_number]));
 const records=workspace.cargo.filter(cargo=>cargoPodReceipt(cargo,workspace.pod_cargo_reviews??[],workspace.assignment.id,stopDrs,workspace.cargo)?.pod_review_status!=='APPROVED').flatMap(cargo=>{
  const model=cargo.line.product?.model_code?.trim()||cargo.line.customer_model?.trim(),dr=(cargo.line.dr_number||cargo.line.stop_dr_number||stopDrs[cargo.line.trip_stop_id]||'').trim();
  return model&&dr?[{id:cargo.id,model,dr,label:`${model} - ${dr}`,cargo}]:[];
 });
 const models=podModelCatalog(records.map(record=>record.cargo));
 return {records,models,options:records.map(record=>record.id),labels:Object.fromEntries(records.map(record=>[record.id,record.label])),quantities:Object.fromEntries(records.map(record=>[record.id,String(Number.isSafeInteger(Number(record.cargo.quantity))&&Number(record.cargo.quantity)>=0?Number(record.cargo.quantity):1)]))};
}
export type PodCargoCatalog=ReturnType<typeof eligiblePodCargo>;

/** Never guess between identical model names allocated under different DRs. */
export function matchPodCargoRecords(pages:Array<{result?:AutomaticPodReading}>,catalog:PodCargoCatalog,fallbackDr:string,stopId:string|null){
 const selected=new Set<string>();
 for(const page of pages){const result=page.result;if(!result||result.state==='INVALID'||result.state==='UNREADABLE'||(result.conflicts?.dr.length??0)>1)continue;
  const detected=[...result.fields.models.split(','),...(result.serial_groups??[]).filter(group=>group.association_clear&&group.model).map(group=>group.model!)];
  const names=matchPodModels(detected,catalog.models.options,catalog.models.aliases).matched,dr=(result.fields.dr||result.detected_dr||fallbackDr).trim();
  for(const model of names){let matches=catalog.records.filter(record=>record.model===model&&(!dr||record.dr===dr));if(matches.length>1&&dr)matches=matches.filter(record=>record.cargo.line.trip_stop_id===stopId);if(matches.length===1)selected.add(matches[0].id);}
 }
 return [...selected];
}

export function cargoProductModels(records:Array<{model:string;cargo:DeliveryCargo}>,quantities:Record<string,string>){
 const totals:Record<string,string>={};for(const record of records)totals[record.model]=String(Number(totals[record.model]??0)+Number(quantities[record.cargo.id]??0));return totals;
}
