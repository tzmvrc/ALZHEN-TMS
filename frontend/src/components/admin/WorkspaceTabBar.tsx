import {useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowRight,BriefcaseBusiness,CalendarDays,Database,Inbox,LayoutDashboard,Megaphone,Monitor,Plus,Truck,UserCircle2,Users,WalletCards,X,Settings,Bell} from "lucide-react";
import {tabPlace,type WorkspaceTab} from "./workspace-tabs";
import "./workspace-tabs.css";

const icons:Record<string,typeof LayoutDashboard>={overview:LayoutDashboard,requests:Inbox,trips:Truck,truckers:Users,billing:WalletCards,database:Database,calendar:CalendarDays,settings:Settings,notifications:Bell,"website-preview":Monitor,announcements:Megaphone,careers:BriefcaseBusiness};
const reports:Record<string,string>={combined:"Master List","dispatch-monitoring":"Dispatch Monitoring",dispatch:"Dispatch Report","trip-booking":"Trip Booking","store-calling":"Store Calling"};
function label(tab:WorkspaceTab){const place=tabPlace(tab);if(place.area==="Client Website")return ({"website-preview":"Website Preview",trucks:"Website Trucks",announcements:"Announcements",careers:"Careers"} as Record<string,string>)[place.clientPage];if(place.page==="trips")return reports[place.report]??"Trips";if(place.page.startsWith("trip-detail:"))return place.tripNumber&&place.tripLabelId===place.page.split(":")[1]?`Trip ${place.tripNumber}`:"Trip details";if(place.page.startsWith("profile"))return "Profile";return ({overview:"Home",requests:"Requests",truckers:"Users",billing:"Billing",database:"Database",calendar:"Calendar",pod:"POD & Documents",notifications:"Notifications",settings:"Settings",reports:"Reports"} as Record<string,string>)[place.page]??place.page;}
export default function WorkspaceTabBar({tabs,activeId,onActivate,onCreate,onClose,onCloseOthers,onCloseRight,onMove,onStep,maxTabs}:{tabs:WorkspaceTab[];activeId:string;onActivate:(id:string)=>void;onCreate:()=>void;onClose:(id:string)=>void;onCloseOthers:(id:string)=>void;onCloseRight:(id:string)=>void;onMove:(source:string,target:string)=>void;onStep:(delta:number)=>void;maxTabs:number}){
  const [menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null);
  const dragSource=useRef<string|null>(null);
  const active=tabs.find(tab=>tab.id===activeId)??tabs[0];
  const strip=useRef<HTMLDivElement>(null);
  useEffect(()=>{strip.current?.querySelector<HTMLElement>(`[data-workspace-tab-id="${CSS.escape(activeId)}"]`)?.scrollIntoView({block:"nearest",inline:"nearest"});},[activeId]);
  useEffect(()=>{if(!menu)return;const close=()=>setMenu(null);const key=(event:KeyboardEvent)=>{if(event.key==="Escape")close();};document.addEventListener("pointerdown",close);document.addEventListener("keydown",key);return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",key);};},[menu]);
  return <div className="al-workspace-tabs" aria-label="Workspace tabs">
    <div className="al-workspace-tab-history" role="group" aria-label="Tab history"><button type="button" title="Back in this tab" aria-label="Back in this tab" disabled={!active||active.cursor===0} onClick={()=>onStep(-1)}><ArrowLeft size={14}/></button><button type="button" title="Forward in this tab" aria-label="Forward in this tab" disabled={!active||active.cursor>=active.trail.length-1} onClick={()=>onStep(1)}><ArrowRight size={14}/></button></div>
    <div ref={strip} className="al-workspace-tab-strip" role="tablist" aria-label="Open pages">
      {tabs.map((tab,index)=>{const place=tabPlace(tab),Icon=icons[place.area==="Client Website"?place.clientPage:place.page]??(place.page.startsWith("profile")?UserCircle2:place.page.startsWith("trip-detail:")?Truck:LayoutDashboard);return <div key={tab.id} className="al-workspace-tab-shell" draggable onDragStart={event=>{dragSource.current=tab.id;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",tab.id);}} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect="move";}} onDrop={event=>{event.preventDefault();const source=dragSource.current;if(source)onMove(source,tab.id);dragSource.current=null;}} onDragEnd={()=>{dragSource.current=null;}} onContextMenu={event=>{event.preventDefault();setMenu({id:tab.id,x:event.clientX,y:event.clientY});}}>
        <button type="button" role="tab" data-workspace-tab-id={tab.id} aria-selected={tab.id===activeId} aria-controls={`al-workspace-panel-${tab.id}`} tabIndex={tab.id===activeId?0:-1} className="al-workspace-tab" title={label(tab)} onClick={()=>onActivate(tab.id)} onKeyDown={event=>{if(!event.altKey&&(event.key==="ArrowRight"||event.key==="ArrowLeft")){event.preventDefault();const next=tabs[(index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length];onActivate(next.id);}if(event.altKey&&event.shiftKey&&(event.key==="ArrowRight"||event.key==="ArrowLeft")){event.preventDefault();const next=tabs[Math.max(0,Math.min(tabs.length-1,index+(event.key==="ArrowRight"?1:-1)))];onMove(tab.id,next.id);}}}><Icon aria-hidden="true" size={14}/><span>{label(tab)}</span></button>
        <button type="button" className="al-workspace-tab-close" aria-label={`Close ${label(tab)}`} title={`Close ${label(tab)}`} onClick={()=>onClose(tab.id)}><X aria-hidden="true" size={13}/></button>
      </div>;})}
    </div>
    <button type="button" className="al-workspace-tab-add" aria-label="New workspace tab" title={tabs.length>=maxTabs?`Up to ${maxTabs} tabs can be open`:"New workspace tab"} disabled={tabs.length>=maxTabs} onClick={onCreate}><Plus aria-hidden="true" size={15}/></button>
    {menu&&<div role="menu" aria-label="Tab options" className="al-workspace-tab-menu" style={{left:Math.min(menu.x,window.innerWidth-190),top:Math.min(menu.y,window.innerHeight-150)}} onPointerDown={event=>event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={()=>{onClose(menu.id);setMenu(null);}}>Close</button>
      <button type="button" role="menuitem" disabled={tabs.length<2} onClick={()=>{onCloseOthers(menu.id);setMenu(null);}}>Close others</button>
      <button type="button" role="menuitem" disabled={tabs.findIndex(tab=>tab.id===menu.id)===tabs.length-1} onClick={()=>{onCloseRight(menu.id);setMenu(null);}}>Close tabs to the right</button>
      <div className="al-workspace-tab-menu-divider"/>
      <button type="button" role="menuitem" disabled={tabs.findIndex(tab=>tab.id===menu.id)===0} onClick={()=>{onMove(menu.id,tabs[Math.max(0,tabs.findIndex(tab=>tab.id===menu.id)-1)].id);setMenu(null);}}>Move left</button>
      <button type="button" role="menuitem" disabled={tabs.findIndex(tab=>tab.id===menu.id)===tabs.length-1} onClick={()=>{onMove(menu.id,tabs[Math.min(tabs.length-1,tabs.findIndex(tab=>tab.id===menu.id)+1)].id);setMenu(null);}}>Move right</button>
    </div>}
  </div>;
}
