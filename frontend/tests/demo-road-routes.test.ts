import test from "node:test";
import assert from "node:assert/strict";
import {demonstrationRoadTrips,realRoutesAvailable} from "../src/services/demo-road-routes.ts";
import {roadDisplayView} from "../src/services/road-routing.ts";
test("Philippine demo fixtures have ten independent synthetic identities and never need live routing or GPS",()=>{
 const rows=demonstrationRoadTrips(1000000);assert.equal(rows.length,10);assert.equal(new Set(rows.map(r=>r.key)).size,10);
 for(const row of rows){assert.ok(row.tripId.startsWith("demo:"));assert.equal(row.assignmentId,null);assert.ok(row.plannedCache!.geometry!.coordinates.length>2);for(const [lng,lat] of row.plannedCache!.geometry!.coordinates){assert.ok(lng>=116&&lng<=127);assert.ok(lat>=5&&lat<=20);}assert.ok(roadDisplayView(row,"auto",1000000).geometry);}
 assert.equal(realRoutesAvailable([]),false);assert.equal(realRoutesAvailable(rows),true);rows.forEach(row=>{row.plannedCache!.matchesContext=false;});assert.equal(realRoutesAvailable(rows),false);
});
