/** Only explicitly seeded graphs may supply simulated GPS; a free-text Demo remark is insufficient. */
export function isApprovedDemoTrip(trip:{id:unknown;dispatch_number:unknown;remarks?:unknown}){
 const id=String(trip.id),dispatch=String(trip.dispatch_number),notes=String(trip.remarks??"");
 const batch=id.match(/^e6301024-(00(?:0[1-9]|[12][0-9]|30))-4000-9000-000000000100$/);
 if(batch&&dispatch===`DEMO30-20261024-${String(Number(batch[1])).padStart(3,"0")}`&&notes.includes("[ALZHEN_DEMO30_V1]"))return true;
 const old=id.match(/^f1241024-(000[1-5])-4000-8000-000000000100$/);
 return !!old&&dispatch===`DEMO-FLEET-${Number(old[1])}-20261024`&&notes.includes("[ALZHEN_FLEET_DEMO_V1]")||id==="d0241024-0000-4000-8000-000000000100"&&dispatch==="DEMO-HOME-20261024"&&notes.includes("[ALZHEN_HOME_DEMO_V1]");
}
