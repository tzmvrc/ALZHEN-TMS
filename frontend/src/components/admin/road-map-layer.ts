import type {Map as GLMap,GeoJSONSource,MapLayerMouseEvent} from "mapbox-gl";
import {roadView,type RoadTrip,type RoadMode} from "../../services/road-routing";
const colors=["#2563eb","#dc2626","#059669","#9333ea","#d97706","#0891b2","#db2777","#4f46e5","#65a30d","#c2410c","#0f766e","#7c3aed"];
const color=(key:string)=>{let value=0;for(const c of key)value=(value*31+c.charCodeAt(0))|0;return colors[Math.abs(value)%colors.length];};
/** Owns a single GL source/layer. Marker-only refreshes do not replace road data. */
export function createRoadLayers(map:GLMap,onSelect:(key:string)=>void){
 const source="alzhen-road-cache",layer="alzhen-road-lines";let signature="",lastSelection="";
 const click=(e:MapLayerMouseEvent)=>{const key=e.features?.[0]?.properties?.key;if(typeof key==="string")onSelect(key);};
 const enter=()=>{map.getCanvas().style.cursor="pointer";},leave=()=>{map.getCanvas().style.cursor="";};
 map.addSource(source,{type:"geojson",data:{type:"FeatureCollection",features:[]}});
 map.addLayer({id:layer,type:"line",source,layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":["get","color"],"line-width":4,"line-opacity":0.65,"line-dasharray":["case",["get","stale"],["literal",[2,2]],["literal",[1,0]]]}});
 map.on("click",layer,click);map.on("mouseenter",layer,enter);map.on("mouseleave",layer,leave);
 return {
  update(rows:RoadTrip[],mode:RoadMode,selected:string,now:number){
   const features=rows.flatMap(row=>{const view=roadView(row,mode,now);return view.geometry?[{type:"Feature" as const,properties:{key:row.key,color:color(row.key),stale:view.stale},geometry:view.geometry}]:[];});
   const next=JSON.stringify(features);if(next!==signature){(map.getSource(source) as GeoJSONSource)?.setData({type:"FeatureCollection",features});signature=next;}
   if(lastSelection!==selected){map.setPaintProperty(layer,"line-width",["case",["==",["get","key"],selected],7,3]);map.setPaintProperty(layer,"line-opacity",["case",["==",["get","key"],selected],1,0.45]);lastSelection=selected;}
  },
  dispose(){map.off("click",layer,click);map.off("mouseenter",layer,enter);map.off("mouseleave",layer,leave);if(map.getLayer(layer))map.removeLayer(layer);if(map.getSource(source))map.removeSource(source);leave();},
 };
}
