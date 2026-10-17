const fields=new Set(["loading_start_at","loading_finished_at","start_unloading_time","finish_unloading_time"]);
export const isTripTimeField=(key:string)=>fields.has(key);
const parts=(value:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
export function manilaDateTime(value:string){
 if(!value||!Number.isFinite(Date.parse(value)))return "";
 const p=Object.fromEntries(parts(value).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function tripTimeDisplay(value:unknown){
 if(value===null||value===undefined||value==="")return "";
 const date=new Date(String(value));if(!Number.isFinite(date.getTime()))return String(value);
 return new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Manila",hour:"numeric",minute:"2-digit",hour12:true}).format(date);
}
/** Time-only edits retain the event's Manila calendar date, seconds and milliseconds.
 * A blank timestamp requires an explicit date, never today's guessed date. */
export function saveTripTime(original:string|undefined,input:string){
 if(!input.trim())return null;
 const existing=original&&manilaDateTime(original);
 if(existing&&/^\d{2}:\d{2}(:\d{2})?$/.test(input)){
  const seconds=input.length===8?input.slice(6):String(new Date(original!).getUTCSeconds()).padStart(2,"0"),millis=String(new Date(original!).getUTCMilliseconds()).padStart(3,"0");
  const iso=`${existing.slice(0,10)}T${input.slice(0,5)}:${seconds}.${millis}+08:00`,date=new Date(iso);
  if(!Number.isFinite(date.getTime())||manilaDateTime(iso).slice(11)!==input.slice(0,5))throw Error("Enter a valid time.");return date.toISOString();
 }
 if(!existing&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(input)){
  const date=new Date(`${input}+08:00`);if(Number.isFinite(date.getTime())&&manilaDateTime(date.toISOString())===input.slice(0,16))return date.toISOString();
 }
 throw Error(existing?"Enter a valid time. The existing event date is preserved.":"Select an event date and time in Manila time.");
}
