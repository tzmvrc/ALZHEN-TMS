import type {DeliveryCargo} from './delivery.service';
import type {TripReceipt} from './receipt.service';
import type {ReceiptSnapshot,PodProductSelection} from './receipt-fields.service';

/** Match saved identities before considering legacy model text. Never infer receipt quantities. */
export function adminPodProducts(receipt:TripReceipt,work:ReceiptSnapshot,cargo:DeliveryCargo[],stopDrs:Record<string,string|null>={}){
 const dr=(receipt.dr_number||work.fields.dr).trim();
 const eligible=cargo.filter(item=>item.line.trip_stop_id===receipt.trip_stop_id&&(work.productSelections!==undefined||(item.line.dr_number||item.line.stop_dr_number||stopDrs[item.line.trip_stop_id]||'').trim()===dr));
 const options=eligible.map(item=>({id:item.id,item,model:item.line.product?.model_code||item.line.customer_model,dr:(item.line.dr_number||item.line.stop_dr_number||stopDrs[item.line.trip_stop_id]||'').trim()}));
 const selections:PodProductSelection[]=[],mismatches:PodProductSelection[]=[];
 if(work.productSelections!==undefined){for(const selection of work.productSelections){
  const option=options.find(option=>option.id===selection.allocation_id&&option.item.line.id===selection.line_item_id);
  if(option&&selection.assignment_id===receipt.assignment_id&&selection.trip_stop_id===receipt.trip_stop_id&&selection.dr_number.trim()===option.dr&&[option.item.line.customer_model,option.item.line.product?.model_code].includes(selection.model)&&(selection.product_id==null||selection.product_id===option.item.line.product_id))selections.push(selection);else mismatches.push(selection);
 }}else for(const model of work.fields.models.split(',').map(value=>value.trim()).filter(Boolean)){
  const matches=options.filter(option=>[option.model,option.item.line.customer_model].includes(model));
  if(matches.length===1){const option=matches[0],quantity=work.modelQuantities?.[model];if(quantity!==undefined)selections.push({allocation_id:option.id,line_item_id:option.item.line.id,assignment_id:receipt.assignment_id!,trip_stop_id:receipt.trip_stop_id!,product_id:option.item.line.product_id,model,dr_number:dr,quantity});}
 }
 return {options,selections,mismatches};
}
