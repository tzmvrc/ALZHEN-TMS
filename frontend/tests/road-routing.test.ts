import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {roadView,validPoint,validRoadGeometry,roadEndpoint,type RoadTrip,type RoadGeometry} from "../src/services/road-routing.ts";
import {createRoadLayers} from "../src/components/admin/road-map-layer.ts";
import type {Map as GLMap} from "mapbox-gl";
const geometry=JSON.parse(readFileSync(new URL("./fixtures/road-geometry.json",import.meta.url),"utf8")) as RoadGeometry;
const now=Date.parse("2026-10-17T10:00:00Z");
const point=(index:number)=>({longitude:geometry.coordinates[index][0],latitude:geometry.coordinates[index][1]});
const row=():RoadTrip=>({key:"assignment-a",assignmentId:"assignment-a",tripId:"trip-a",dispatchNumber:"Fixture",plateNumber:"Test",driverName:"Driver",warehouse:{id:"w",name:"Warehouse",point:point(0)},stops:[{id:"b",sequence:2,stopSequence:2,status:"PENDING",name:"Second",point:point(8)},{id:"a",sequence:1,stopSequence:1,status:"COMPLETED",name:"First",point:point(3)}],position:{...point(3),capturedAt:new Date(now).toISOString(),accuracyMeters:5},cache:{mode:"remaining",matchesContext:true,geometry,calculatedAt:new Date(now).toISOString(),distanceMeters:176.7,durationSeconds:26.2,error:null}});
test("planned/remaining route modes preserve physical stop order, completion and exact cached geometry",()=>{
 const data=row();assert.deepEqual(roadView(data,"planned",now).stops.map(s=>s.id),["a","b"]);assert.equal(roadView(data,"planned",now).geometry,null);
 const remaining=roadView(data,"remaining",now);assert.deepEqual(remaining.stops.map(s=>s.id),["b"]);assert.equal(remaining.geometry,geometry);assert.equal(remaining.stale,false);
 data.cache!.mode="planned";assert.equal(roadView(data,"planned",now).geometry,geometry);data.position=null;assert.equal(roadView(data,"planned",now).geometry,geometry);assert.match(roadView(data,"remaining",now).status,/No authorized truck/);
 data.stops=[data.stops[0]];assert.equal(roadView(data,"planned",now).stops.length,1);
});
test("missing, invalid, duplicate and changed route inputs withhold geometry; stale/error cache remains available",()=>{
 const data=row();data.warehouse.point=null;assert.match(roadView(data,"planned",now).status,/Warehouse/);
 data.stops[0].point=null;assert.equal(roadView(data,"remaining",now).geometry,null);data.stops[0].point=point(8);
 data.cache!.matchesContext=false;assert.equal(roadView(data,"remaining",now).geometry,null);data.cache!.matchesContext=true;
 assert.equal(roadView(data,"remaining",now+3600000).stale,true);data.cache!.error="Refresh failed";assert.equal(roadView(data,"remaining",now).geometry,geometry);
 data.stops.push(data.stops[0]);assert.match(roadView(data,"remaining",now).status,/Duplicate/);data.stops=[];assert.match(roadView(data,"remaining",now).status,/No remaining/);
 assert.equal(validPoint({latitude:91,longitude:123}),false);assert.equal(validPoint({latitude:10,longitude:181}),false);assert.equal(validRoadGeometry({...geometry,coordinates:[[NaN,10],[123,10]]}),false);
 assert.equal(roadEndpoint(["b","a","a"]),roadEndpoint(["a","b"]));
});
test("planned and remaining variants coexist and retain independent expiry, metadata and context",()=>{
 const data=row();data.plannedCache={...data.cache!,mode:"planned",distanceMeters:500,expiresAt:new Date(now+1000).toISOString()};
 assert.equal(roadView(data,"planned",now).cache?.distanceMeters,500);assert.equal(roadView(data,"remaining",now).cache?.distanceMeters,176.7);
 assert.equal(roadView(data,"planned",now+1000).stale,true);assert.equal(roadView(data,"remaining",now+1000).stale,false);
 data.plannedCache.matchesContext=false;assert.equal(roadView(data,"planned",now).geometry,null);assert.equal(roadView(data,"remaining",now).geometry,geometry);
});
test("ten GL routes reuse one source/layer, marker movement never replaces geometry, selection and cleanup are independent",()=>{
 let writes=0,removed=0,off=0;const sources=new Set<string>(),layers=new Set<string>(),paint:unknown[]=[];
 const map={addSource:(id:string)=>sources.add(id),addLayer:({id}:{id:string})=>layers.add(id),on:()=>{},off:()=>{off++;},getCanvas:()=>({style:{cursor:""}}),getSource:()=>({setData:()=>{writes++;}}),getLayer:(id:string)=>layers.has(id),setPaintProperty:(...args:unknown[])=>paint.push(args),removeLayer:(id:string)=>{layers.delete(id);removed++;},removeSource:(id:string)=>sources.delete(id)} as unknown as GLMap;
 const controller=createRoadLayers(map,()=>{}),rows=Array.from({length:10},(_,i)=>({...row(),key:`assignment-${i}`,tripId:`trip-${i}`}));
 controller.update(rows,"remaining",rows[0].key,now);assert.equal(sources.size,1);assert.equal(layers.size,1);assert.equal(writes,1);
 rows[0]={...rows[0],position:{...point(4),capturedAt:new Date(now).toISOString(),accuracyMeters:5}};controller.update(rows,"remaining",rows[0].key,now);assert.equal(writes,1);
 controller.update(rows,"remaining",rows[1].key,now);assert.equal(writes,1);assert.equal(paint.length,4);
 rows[1]={...rows[1],cache:{...rows[1].cache!,matchesContext:false}};controller.update(rows,"remaining",rows[1].key,now);assert.equal(writes,2);
 controller.dispose();assert.equal(sources.size,0);assert.equal(layers.size,0);assert.equal(removed,1);assert.equal(off,3);
});
