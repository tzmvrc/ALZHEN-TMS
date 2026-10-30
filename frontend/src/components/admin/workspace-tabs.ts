import {useEffect,useMemo,useState} from "react";

export type WorkspaceArea="Operational Admin"|"Client Website";
export type WorkspaceReport="combined"|"dispatch-monitoring"|"dispatch"|"trip-booking"|"store-calling";
export type WorkspaceClientPage="website-preview"|"trucks"|"announcements"|"careers";
export type WorkspacePlace={page:string;route:string;area:WorkspaceArea;report:WorkspaceReport;clientPage:WorkspaceClientPage;tripNumber?:string;tripLabelId?:string};
export type WorkspaceTab={id:string;trail:WorkspacePlace[];cursor:number};
type TabState={owner:string;tabs:WorkspaceTab[];active:string};
const key=(owner:string)=>`alzhen:workspace-tabs:v1:${owner}`;
const MAX_TABS=12;
const reportKeys=new Set<WorkspaceReport>(["combined","dispatch-monitoring","dispatch","trip-booking","store-calling"]);
const clientPages=new Set<WorkspaceClientPage>(["website-preview","trucks","announcements","careers"]);
const allowedPages=new Set(["overview","requests","trips","truckers","billing","database","calendar","pod","notifications","reports","settings","profile"]);
const newId=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const defaultPlace=():WorkspacePlace=>({page:"overview",route:"/",area:"Operational Admin",report:"combined",clientPage:"website-preview"});
export const tabPlace=(tab:WorkspaceTab)=>tab.trail[tab.cursor]??defaultPlace();
export function placeFromRoute(path:string,search:string,fallback=defaultPlace()):WorkspacePlace{
  const route=path+search;
  if(path==="/settings")return {...fallback,page:"settings",route,area:"Operational Admin"};
  if(path==="/profile")return {...fallback,page:"profile",route,area:"Operational Admin"};
  const user=/^\/users\/([^/]+)$/.exec(path);
  if(user)return {...fallback,page:`profile:${decodeURIComponent(user[1])}`,route,area:"Operational Admin"};
  const trip=/^\/trips\/([^/]+)$/.exec(path);
  if(trip){const stop=new URLSearchParams(search).get("stop");return {...fallback,page:`trip-detail:${decodeURIComponent(trip[1])}:dispatches${stop?`:stop:${stop}`:""}`,route,area:"Operational Admin"};}
  if(path==="/trips"||path==="/reports"||path.startsWith("/reports/")){
    const requested=new URLSearchParams(search).get("report")??path.split("/")[2];
    return {...fallback,page:"trips",route,report:reportKeys.has(requested as WorkspaceReport)?requested as WorkspaceReport:fallback.report,area:"Operational Admin"};
  }
  return {...fallback,route};
}
export function routeForPage(page:string){
  if(page==="settings")return "/settings";
  if(page==="profile")return "/profile";
  if(page.startsWith("profile:"))return `/users/${encodeURIComponent(page.slice(8))}`;
  if(page.startsWith("trip-detail:")){const [,id,,scope,stop]=page.split(":");return `/trips/${encodeURIComponent(id)}${scope==="stop"&&stop?`?stop=${encodeURIComponent(stop)}`:""}`;}
  return "/";
}
function cleanRoute(route:string){
  const url=new URL(route,"http://workspace.local");
  if(!/^\/(?:settings|profile|users\/[^/]+|trips(?:\/[^/]+)?|reports(?:\/[^/]+)?)?$/.test(url.pathname))return "/";
  const query=new URLSearchParams();
  for(const key of ["stop","event","assignment","report","database"])if(url.searchParams.has(key))query.set(key,url.searchParams.get(key)!);
  return url.pathname+(query.size?`?${query}`:"");
}
function safePlace(value:unknown,role:string):WorkspacePlace|null{
  if(!value||typeof value!=="object")return null;
  const input=value as Partial<WorkspacePlace>;
  if(typeof input.page!=="string"||typeof input.route!=="string"||input.route.length>500||!input.route.startsWith("/")||input.route.startsWith("//"))return null;
  if(!allowedPages.has(input.page)&&!/^trip-detail:[^:]+:/.test(input.page)&&!/^profile:[^:]+$/.test(input.page))return null;
  if(input.page==="database"&&!(["ADMIN","STAFF"].includes(role)))return null;
  const area=input.area==="Client Website"?input.area:"Operational Admin";
  if(area==="Client Website"&&!(["ADMIN","STAFF"].includes(role)))return null;
  return {page:input.page,route:cleanRoute(input.route),...(typeof input.tripNumber==="string"&&typeof input.tripLabelId==="string"?{tripNumber:input.tripNumber.slice(0,120),tripLabelId:input.tripLabelId}:{}),area,report:reportKeys.has(input.report as WorkspaceReport)?input.report as WorkspaceReport:"combined",clientPage:clientPages.has(input.clientPage as WorkspaceClientPage)?input.clientPage as WorkspaceClientPage:"website-preview"};
}
function fresh(owner:string,place:WorkspacePlace):TabState{const tab={id:newId(),trail:[place],cursor:0};return {owner,tabs:[tab],active:tab.id};}
function restore(owner:string,role:string,initial:WorkspacePlace):TabState{
  if(!owner)return fresh(owner,initial);
  try{
    const raw=JSON.parse(localStorage.getItem(key(owner))??"null") as {tabs?:unknown;active?:unknown}|null;
    if(!raw||!Array.isArray(raw.tabs))return fresh(owner,initial);
    const tabs:WorkspaceTab[]=raw.tabs.slice(0,MAX_TABS).flatMap(value=>{
      if(!value||typeof value!=="object")return [];
      const item=value as Partial<WorkspaceTab>;
      if(typeof item.id!=="string"||!Array.isArray(item.trail))return [];
      const trail=item.trail.slice(-30).map(place=>safePlace(place,role)).filter((place):place is WorkspacePlace=>!!place);
      if(!trail.length)return [];
      return [{id:item.id,trail,cursor:Math.max(0,Math.min(trail.length-1,Number(item.cursor)||0))}];
    });
    if(!tabs.length)return fresh(owner,initial);
    const active=tabs.some(tab=>tab.id===raw.active)?String(raw.active):tabs[0].id;
    // A direct record link takes priority over the saved landing workspace.
    if(initial.route!=="/"){
      const tab=tabs.find(item=>item.id===active)!;
      return {owner,tabs:tabs.map(item=>item.id===active?{...tab,trail:[...tab.trail.slice(0,tab.cursor+1),initial].slice(-30),cursor:Math.min(tab.cursor+1,29)}:item),active};
    }
    return {owner,tabs,active};
  }catch{return fresh(owner,initial);}
}
export function useWorkspaceTabs(owner:string,role:string,initial:WorkspacePlace){
  const [state,setState]=useState(()=>restore(owner,role,initial));
  if(state.owner!==owner)setState(restore(owner,role,initial));
  useEffect(()=>{if(!owner||state.owner!==owner)return;try{localStorage.setItem(key(owner),JSON.stringify({tabs:state.tabs.map(tab=>({...tab,trail:tab.trail.map(place=>({...place,route:cleanRoute(place.route)}))})),active:state.active}));}catch{/* Keep tabs in memory when storage is full or disabled. */}},[owner,state]);
  const activeTab=state.tabs.find(tab=>tab.id===state.active)??state.tabs[0];
  const activePlace=tabPlace(activeTab);
  const patch=(id:string,change:Partial<WorkspacePlace>,push=false)=>setState(current=>{
    const target=current.tabs.find(tab=>tab.id===id);
    if(!target||Object.entries(change).every(([key,value])=>tabPlace(target)[key as keyof WorkspacePlace]===value))return current;
    return {...current,tabs:current.tabs.map(tab=>{
    if(tab.id!==id)return tab;
    const next={...tabPlace(tab),...change};
    if(push){const trail=[...tab.trail.slice(0,tab.cursor+1),next].slice(-30);return {...tab,trail,cursor:trail.length-1};}
    return {...tab,trail:tab.trail.map((place,index)=>index===tab.cursor?next:place)};
  })};});
  const activate=(id:string)=>setState(current=>current.tabs.some(tab=>tab.id===id)?{...current,active:id}:current);
  const create=(place:WorkspacePlace=defaultPlace())=>{const id=newId();setState(current=>current.tabs.length>=MAX_TABS?current:{...current,tabs:[...current.tabs,{id,trail:[place],cursor:0}],active:id});return id;};
  const close=(id:string)=>setState(current=>{
    const index=current.tabs.findIndex(tab=>tab.id===id);if(index<0)return current;
    const tabs=current.tabs.filter(tab=>tab.id!==id);
    if(!tabs.length)return fresh(current.owner,defaultPlace());
    return {...current,tabs,active:current.active===id?tabs[Math.max(0,index-1)].id:current.active};
  });
  const closeOthers=(id:string)=>setState(current=>({...current,tabs:current.tabs.filter(tab=>tab.id===id),active:id}));
  const closeRight=(id:string)=>setState(current=>{const index=current.tabs.findIndex(tab=>tab.id===id);if(index<0)return current;const tabs=current.tabs.slice(0,index+1);return {...current,tabs,active:tabs.some(tab=>tab.id===current.active)?current.active:id};});
  const move=(source:string,target:string)=>setState(current=>{const tabs=[...current.tabs],from=tabs.findIndex(tab=>tab.id===source),to=tabs.findIndex(tab=>tab.id===target);if(from<0||to<0||from===to)return current;tabs.splice(to,0,tabs.splice(from,1)[0]);return {...current,tabs};});
  const step=(id:string,delta:number)=>setState(current=>({...current,tabs:current.tabs.map(tab=>tab.id===id?{...tab,cursor:Math.max(0,Math.min(tab.trail.length-1,tab.cursor+delta))}:tab)}));
  const value=useMemo(()=>({tabs:state.tabs,activeId:state.active,activeTab,activePlace,patch,activate,create,close,closeOthers,closeRight,move,step,maxTabs:MAX_TABS}),[state,activeTab,activePlace]);
  return value;
}
