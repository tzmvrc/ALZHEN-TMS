import {useEffect,useState,useSyncExternalStore} from "react";
type Preferences={theme:"light"|"dark"|"system";compact:boolean;date:"medium"|"short"|"iso"};
const initial:Preferences={theme:"light",compact:false,date:"medium"};
const eventName="alzhen:account-preferences";
const subscribe=(callback:()=>void)=>{window.addEventListener(eventName,callback);window.addEventListener("storage",callback);return()=>{window.removeEventListener(eventName,callback);window.removeEventListener("storage",callback);};};
const read=(key:string)=>{try{return localStorage.getItem(key)??"";}catch{return "";}};
export function useAccountPreferences(id:string){
 const key=`alzhen:account-display:${id}`,raw=useSyncExternalStore(subscribe,()=>read(key),()=>"");
 let value:Partial<Preferences>={};try{value=JSON.parse(raw||"{}");}catch{/* Ignore invalid device preferences. */}
 const preferences:Preferences={theme:["light","dark","system"].includes(value?.theme??"")?value.theme!:initial.theme,compact:value?.compact===true,date:["medium","short","iso"].includes(value?.date??"")?value.date!:initial.date};
 const [systemDark,setSystemDark]=useState(()=>window.matchMedia("(prefers-color-scheme: dark)").matches);
 useEffect(()=>{const media=window.matchMedia("(prefers-color-scheme: dark)"),update=()=>setSystemDark(media.matches);media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
 const save=(next:Preferences)=>{localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event(eventName));};
 const format=(date:string|null|undefined,time=false)=>{
  if(!date)return "Not available";const parsed=new Date(date);if(!Number.isFinite(parsed.getTime()))return "Not available";
  if(preferences.date==="iso"){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(parsed);const part=(name:string)=>parts.find(value=>value.type===name)?.value;return `${part("year")}-${part("month")}-${part("day")}${time?` · ${new Intl.DateTimeFormat("en-PH",{timeZone:"Asia/Manila",timeStyle:"short"}).format(parsed)}`:""}`;}
  return new Intl.DateTimeFormat("en-PH",{timeZone:"Asia/Manila",dateStyle:preferences.date,...(time?{timeStyle:"short" as const}:{})}).format(parsed);
 };
 return {preferences,save,format,theme:preferences.theme==="system"?(systemDark?"dark":"light"):preferences.theme};
}
