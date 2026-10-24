// Provider-only preparation. No SQL, Supabase client, telemetry, credentials or auth writes.
import 'dotenv/config';
import {writeFile} from 'node:fs/promises';
import {createMapboxDirections} from '../src/services/mapbox-directions.service.ts';
const hubs={
 Valenzuela:[120.983014,14.701028],Marikina:[121.0984,14.6324],Cabuyao:[121.1247,14.2785],Dasmarinas:[120.9397,14.3294],
 Mandaue:[123.9222,10.3236],CDO:[124.6505,8.4858],Davao:[125.6303,7.1034],SanFernando:[120.6850,15.0467],
};
const routes=[
 ['Valenzuela','Quezon City',121.028953,14.65651,'Marikina',121.0984,14.6324],
 ['Valenzuela','Makati',121.0264,14.5547,'Taguig',121.0509,14.5507],
 ['Marikina','Antipolo',121.1766,14.6255,'Cainta',121.1145,14.5787],
 ['Valenzuela','Malolos',120.815,14.8587,'San Fernando',120.654,15.032,'Angeles',120.5897,15.145],
 ['Valenzuela','Pasig',121.0604,14.5853,'Mandaluyong',121.0394,14.5818],
 ['Cabuyao','Calamba',121.1653,14.2111,'Santa Rosa',121.1127,14.3122],
 ['Dasmarinas','Imus',120.9367,14.4297,'Bacoor',120.9645,14.4583],
 ['Mandaue','Cebu City',123.8914,10.3107,'Talisay Cebu',123.8492,10.2447,'Naga Cebu',123.7586,10.209],
 ['CDO','Opol',124.5725,8.5214,'El Salvador',124.522,8.5577],
 ['Davao','Davao Downtown',125.6131,7.0644,'Toril',125.4966,7.0127],
 ['Valenzuela','San Jose del Monte',121.0748,14.8137,'Meycauayan',120.9605,14.7351],
 ['Valenzuela','Bocaue',120.9385,14.7987,'Balagtas',120.9081,14.8142],
 ['Marikina','San Mateo',121.1194,14.6969,'Rodriguez',121.1428,14.7323],
 ['Cabuyao','San Pedro',121.0575,14.3582,'Binan',121.0817,14.3386],
 ['Dasmarinas','General Trias',120.8817,14.3861,'Tanza',120.8534,14.3941],
 ['Mandaue','Lapu-Lapu',123.9492,10.3103,'Cordova',123.9498,10.2512],
 ['CDO','Tagoloan',124.7522,8.5398,'Villanueva',124.7756,8.5853],
 ['Davao','Panabo',125.6842,7.3081,'Carmen Davao',125.6789,7.3605,'Tagum',125.8078,7.4478],
 ['SanFernando','Angeles',120.5897,15.145,'Mabalacat',120.5808,15.223],
 ['Valenzuela','Las Pinas',120.978,14.4445,'Muntinlupa',121.0446,14.4081],
 ['Valenzuela','Manila Ermita',120.983034,14.578818],
 ['Marikina','Quezon City',121.0437,14.6367],
 ['Cabuyao','Los Banos',121.2427,14.1793,'Bay Laguna',121.2853,14.1833],
 ['Dasmarinas','Silang',120.9681,14.2306,'Tagaytay',120.9621,14.1153],
 ['Mandaue','Consolacion',123.9575,10.3761,'Liloan',123.9822,10.3993,'Compostela Cebu',124.0105,10.455],
 ['CDO','Iponan',124.5981,8.5028],
 ['Davao','Buhangin',125.6131,7.1106],
 ['Valenzuela','Paranaque',121.017,14.4793,'Pasay',121.0014,14.5378],
 ['SanFernando','Guagua',120.6328,14.9753,'Lubao',120.6019,14.9375],
 ['Marikina','Taytay Rizal',121.1325,14.5583,'Angono',121.1524,14.5266],
];
const completed=new Set([6,12,16,20,23,28,29]),planned=new Set([7,13,17,22,27]),delayed=new Set([4,10,19,30]),multi=new Set([1,4,8,10,14,18,19,24,25,30]);
const nearest=(coords,[lng,lat])=>coords.reduce((best,p,i)=>{const d=(p[0]-lng)**2*Math.cos(lat*Math.PI/180)**2+(p[1]-lat)**2;return d<best.d?{i,d}:best;},{i:0,d:Infinity});
const directions=createMapboxDirections({token:()=>process.env.MAPBOX_DIRECTIONS_TOKEN});
const result=[];
for(const [index,[hub,...destinations]] of routes.entries()){
 const number=index+1,stops=[];
 for(let j=0;j<destinations.length;j+=3)stops.push({name:destinations[j],point:[destinations[j+1],destinations[j+2]]});
 const origin=hubs[hub],road=await directions.calculate({id:'origin',longitude:origin[0],latitude:origin[1]},stops.map((s,i)=>({id:`stop-${i+1}`,longitude:s.point[0],latitude:s.point[1]})));
 const geometry=road.geometry.coordinates;
 const indices=stops.map(stop=>nearest(geometry,stop.point));
 if(indices.some(p=>Math.sqrt(p.d)*111000>500))throw Error(`Route ${number}: destination is more than 500 m from a road`);
 const snappedOrigin=geometry[0];
 if(Math.hypot(snappedOrigin[0]-origin[0],snappedOrigin[1]-origin[1])*111000>500)throw Error(`Route ${number}: warehouse is not near the road`);
 const snappedStops=stops.map((stop,i)=>({...stop,point:geometry[indices[i].i]}));
 const gps=[];
 for(let a=0;a<(multi.has(number)?2:1);a++){
   const destinationIndex=indices[multi.has(number)?a:Math.min(number%3===0?1:0,indices.length-1)].i;
   const previous=multi.has(number)?0:number%3===0?indices[0].i:0;
   gps.push(geometry[Math.max(0,Math.floor(previous+(destinationIndex-previous)*(.35+(number%4)*.1)))]);
 }
 result.push({number,hub,warehouse:snappedOrigin,stops:snappedStops,gps,multi:multi.has(number),status:completed.has(number)?'COMPLETED':planned.has(number)?'PLANNED':'IN_PROGRESS',delayed:delayed.has(number),provider:'Mapbox Directions / driving',distanceMeters:road.distance_meters,durationSeconds:road.duration_seconds});
 console.log(`Prepared ${number}: ${hub} / ${stops.map(s=>s.name).join(' / ')} (${Math.round(road.distance_meters/1000)} km)`);
}
await writeFile(new URL('../migrations/proposals/2026_10_24_demo30_waypoints.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
