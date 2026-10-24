// Read-only provider preparation. No database writes. Run from backend with --import tsx.
import 'dotenv/config';
import {writeFile} from 'node:fs/promises';
import {createMapboxDirections} from '../src/services/mapbox-directions.service.ts';
const scenarios=[
 {name:'Quezon City / Marikina',origin:'Valenzuela',warehouse:[120.983014,14.701028],stops:[['North EDSA',121.028953,14.656510],['Marikina',121.0984,14.6324]],driver:'Rafael Cruz',type:'Wing Van'},
 {name:'Makati / Taguig',origin:'Valenzuela',warehouse:[120.983014,14.701028],stops:[['Makati',121.0264,14.5547],['Taguig',121.0509,14.5507]],driver:'Carlo Reyes',type:'Closed Van'},
 {name:'Antipolo / Cainta',origin:'Marikina',warehouse:[121.0984,14.6324],stops:[['Antipolo',121.1766,14.6255],['Cainta',121.1145,14.5787]],driver:'Luis Mendoza',type:'Wing Van'},
 {name:'Bulacan / Pampanga',origin:'Valenzuela',warehouse:[120.983014,14.701028],stops:[['Malolos, Bulacan',120.815,14.8587],['San Fernando, Pampanga',120.654,15.032]],driver:'Daniel Garcia',type:'Wing Van',overdue:true},
 {name:'Pasig / Mandaluyong',origin:'Valenzuela',warehouse:[120.983014,14.701028],stops:[['Pasig',121.0604,14.5853],['Mandaluyong',121.0394,14.5818]],driver:'Marco Bautista',type:'Closed Van'},
];
const directions=createMapboxDirections({token:()=>process.env.MAPBOX_DIRECTIONS_TOKEN});
const nearest=(geometry,p)=>geometry.reduce((best,q,i)=>{
 const d=(q[0]-p[0])**2*Math.cos(p[1]*Math.PI/180)**2+(q[1]-p[1])**2;
 return d<best.d?{i,d}:best;
},{i:0,d:Infinity});
const result=[];
for(const [index,scenario] of scenarios.entries()){
 const route=await directions.calculate({id:'warehouse',longitude:scenario.warehouse[0],latitude:scenario.warehouse[1]},scenario.stops.map(([name,longitude,latitude])=>({id:name,longitude,latitude})));
 const geometry=route.geometry.coordinates;
 const stopIndices=scenario.stops.map(([,lng,lat])=>nearest(geometry,[lng,lat]));
 if(stopIndices.some(point=>Math.sqrt(point.d)*111000>250))throw Error('Demo waypoint is not close enough to a routed road');
 const first=stopIndices[0].i,last=stopIndices[1].i;
 if(last<=first)throw Error('Unexpected stop order');
 const gps=geometry[Math.floor(first+(last-first)*0.32)];
 result.push({...scenario,number:index+1,warehouse:geometry[0],stops:scenario.stops.map(([name],i)=>({name,point:geometry[stopIndices[i].i]})),gps,provider:'Mapbox Directions driving',distance:route.distance_meters,duration:route.duration_seconds});
 console.log(`${index+1}: ${scenario.name}, ${Math.round(route.distance_meters/1000)} km, street GPS ${gps.join(',')}`);
}
await writeFile(new URL('../migrations/proposals/2026_10_24_fleet_demo_waypoints.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
