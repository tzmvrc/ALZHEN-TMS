import type {OperationalMilestone} from './operational-timeline';
import type {TripChildRecord} from './trip.service';
/** Stop identity wins; sequence numbers and display names are never join keys. */
export function convoyMilestone(selected:OperationalMilestone,candidates:OperationalMilestone[],assignment:string,stops:TripChildRecord[],allStops:TripChildRecord[]):OperationalMilestone{
 let stop=selected.stopId;
 if(stop&&!stops.some(s=>s.id===stop)){
  const source=allStops.find(s=>s.id===stop);
  const matches=source?.store_id?stops.filter(s=>s.store_id===source.store_id&&s.dr_number===source.dr_number):[];
  stop=matches.length===1?String(matches[0].id):'unmatched';
 }
 const matches=candidates.filter(m=>m.type===selected.type&&m.stopId===stop&&m.event?.assignment_id===assignment&&m.scope!=='trip-wide'&&(selected.activity?m.title===selected.title:true));
 const recorded=matches.filter(m=>m.time).sort((a,b)=>Date.parse(b.time!)-Date.parse(a.time!));
 return recorded[0]??{...selected,key:`awaiting:${assignment}:${selected.key}`,event:undefined,time:null,location:'',stopId:stop==='unmatched'?null:stop,files:[],report:undefined,reportId:undefined,reportType:undefined,remarks:null,pending:true,podStatus:undefined,podReviewStatus:undefined,scope:'assignment'};
}
