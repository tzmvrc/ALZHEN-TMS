import test from "node:test";
import assert from "node:assert/strict";
import {getReportEditDefinition} from "../src/services/report-editing.config";
import {withTripDetailsColumn,tripDetailsTarget,TRIP_DETAILS_COLUMN} from "../src/services/report-action-columns";
test("Trip Details is one final ordinary configurable column with exact parent/stop routing",()=>{
 assert.equal(getReportEditDefinition("combined","trip_details"),null);assert.equal(getReportEditDefinition("dispatch-monitoring","trip_details"),null);
 const base=[{key:"dispatch_number",title:"Dispatch",type:"text"}];
 const columns=withTripDetailsColumn(base,true);assert.deepEqual(columns.at(-1),TRIP_DETAILS_COLUMN);assert.equal(withTripDetailsColumn(columns,true).length,2);assert.equal(withTripDetailsColumn(base,false),base);assert.deepEqual(withTripDetailsColumn([],true),[]);
 const trip="123e4567-e89b-42d3-a456-000000000010",stop="123e4567-e89b-42d3-a456-000000000011",sibling="123e4567-e89b-42d3-a456-000000000012";
 assert.equal(tripDetailsTarget({trip_id:trip,trip_stop_id:stop})?.href,`/trips/${trip}?stop=${stop}`);assert.equal(tripDetailsTarget({trip_id:trip,trip_stop_id:sibling})?.tripId,trip);
 for(const row of [{dispatch_number:trip},{id:trip},{trip_id:"not-a-trip",trip_stop_id:stop}])assert.equal(tripDetailsTarget(row),null);
});
