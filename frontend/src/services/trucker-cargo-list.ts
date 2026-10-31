import {cargoDeliveryState} from './cargo-delivery';
import {cargoPodReceipt} from './pod-submissions';
import type {DeliveryWorkspace} from './delivery.service';
import type {TripReceipt} from './receipt.service';

/** Stable partition within one stop; approval alone never completes delivery. */
export function truckerCargoRows(workspace:DeliveryWorkspace,receipts:TripReceipt[],stopId:string){
 const stopDrs=Object.fromEntries(workspace.stops.map(stop=>[stop.id,stop.dr_number]));
 const scoped=receipts.filter(row=>row.trip_id===workspace.assignment.trip_id&&row.assignment_id===workspace.assignment.id);
 const rows=workspace.cargo.filter(cargo=>cargo.line.trip_stop_id===stopId).map(cargo=>{
  const pod=cargoPodReceipt(cargo,scoped,workspace.assignment.id,stopDrs,workspace.cargo);
  return {cargo,pod,state:cargoDeliveryState(cargo,pod,workspace)};
 });
 return [...rows.filter(row=>row.state.delivered),...rows.filter(row=>!row.state.delivered)];
}
