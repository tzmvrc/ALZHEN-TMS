import {supabaseAdmin} from "../config/supabase.js";

import {fieldMilestones,fieldSources} from "./field-milestones.logic.js";

/** Bounded read of existing reports, independent of driver submissions and their private photos. */
export async function readFieldMilestones(tripIds:string[]){
  const results=await Promise.all(fieldSources.map(async source=>{
    const {data,error}=await supabaseAdmin.from(source.table).select(source.select).in("trip_id",tripIds).order("updated_at",{ascending:false}).order("id").limit(101);
    return {table:source.table,rows:!error&&data?fieldMilestones(source.table,data as unknown as Record<string,unknown>[]):[],limited:(data?.length??0)>100,error:!!error};
  }));
  return {milestones:results.flatMap(result=>result.rows).sort((a,b)=>Date.parse(b.event_time)-Date.parse(a.event_time)).slice(0,100),milestonesLimited:results.some(result=>result.limited)||results.reduce((sum,result)=>sum+result.rows.length,0)>100,unavailableSources:results.filter(result=>result.error).map(result=>result.table)};
}
