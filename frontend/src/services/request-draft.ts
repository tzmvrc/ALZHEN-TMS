import type {DispatchRequest} from "../types/requests";

/** Demo review validation only; production relationship/eligibility validation is not connected. */
export function validateRequestDraft(request:DispatchRequest):string[] {
  const errors:string[]=[];
  if(!request.reference.trim())errors.push("Request reference is required.");
  if(!request.warehouse.trim())errors.push("Warehouse is required.");
  if(!request.fromName.trim())errors.push("Customer / sender is required.");
  if(!request.dispatchDate||!Number.isFinite(Date.parse(request.dispatchDate)))errors.push("A valid requested loading date is required.");
  if(request.deliveryDate&&(!Number.isFinite(Date.parse(request.deliveryDate))||request.dispatchDate&&request.deliveryDate.slice(0,10)<request.dispatchDate.slice(0,10)))errors.push("Estimated delivery must be on or after loading.");
  if(!request.items.length)errors.push("Add at least one cargo row.");
  request.items.forEach((item,index)=>{
    const prefix=`Row ${index+1}: `;
    if(!item.customerName.trim())errors.push(prefix+"customer is required.");
    if(!item.shipTo.trim())errors.push(prefix+"delivery store is required.");
    if(!item.customerModel.trim())errors.push(prefix+"product / model is required.");
    if(!Number.isFinite(item.qty)||item.qty<=0)errors.push(prefix+"quantity must be greater than zero.");
    if(item.unitCbm!==undefined&&(!Number.isFinite(item.unitCbm)||item.unitCbm<=0))errors.push(prefix+"unit CBM must be greater than zero.");
    if(!Number.isFinite(item.totalCbm)||Number(item.totalCbm)<=0)errors.push(prefix+"total CBM must be greater than zero.");
  });
  return errors;
}

export function editableRequestFields(request:DispatchRequest) {
  const {reference,fromName,warehouse,dispatchDate,deliveryDate,region,priority,courier,truckAssignment,remarks,items}=request;
  return {reference,fromName,warehouse,dispatchDate,deliveryDate,region,priority,courier,truckAssignment,remarks,items:structuredClone(items)};
}
