import {availableDeliveryGps,cacheDeliveryGps} from '../../services/delivery.service';
import {useCallback,useEffect,useRef,useState,type MutableRefObject} from 'react';
import {MapPin,MapPinOff} from 'lucide-react';
import {createLocationCapture} from '../../services/location-capture';
import {ownTrackingAssignments,trackingAvailable,trackingMutation} from '../../services/tracking-api.service';
import {invalidateApiCache} from '../../services/api.service';
const explanations:Record<string,string>={STOPPED:'Share your location so dispatch can follow your trip.',PERMISSION_DENIED:'Location permission was denied. Allow location access in your browser settings, then retry.',LOCATION_TIMEOUT:'The location request timed out. Check location services and try again.',LOCATION_UNAVAILABLE:'Your device cannot provide a location. Check that location services are enabled.',LOCATION_STALE:'No fresh GPS update has been saved for over two minutes. Retry location sharing.',LOCATION_NOT_SAVED:'Your GPS update could not be saved. Check your connection and retry.',REQUESTING_PERMISSION:'Waiting for a fresh location and confirmation from the server.',TRACKING_UNAVAILABLE:'Location sharing could not connect. Retry when your connection is available.',STOP_CONFIRMATION_PENDING:'Location capture has stopped. The server has not yet confirmed the stop.',BROWSER_UNAVAILABLE:'Location sharing requires a secure browser with geolocation support.',PERMISSION_OR_LOCATION_UNAVAILABLE:'Your device could not provide an accurate, fresh location. Check location services and retry.'};
export default function LocationSharing({token,tripId,assignmentId,hidden=false,startRef}:{token:string;tripId:string;assignmentId?:string;hidden?:boolean;startRef?:MutableRefObject<(()=>Promise<void>)|null>}){
 const [state,setState]=useState('STOPPED'),[busy,setBusy]=useState(false);
 const capture=useRef<ReturnType<typeof createLocationCapture>|null>(null),mounted=useRef(false),epoch=useRef(0),optedIn=useRef(false),stateRef=useRef(state);stateRef.current=state;
 const start=useCallback(async()=>{
  if(!mounted.current||stateRef.current==='REQUESTING_PERMISSION')return;
  const generation=++epoch.current;setBusy(true);setState('REQUESTING_PERMISSION');optedIn.current=true;
  try{
   if(!navigator.geolocation||!window.isSecureContext){setState('BROWSER_UNAVAILABLE');return;}
   const stopped=await capture.current?.stop();if(stopped===false){setState('STOP_CONFIRMATION_PENDING');return;}
   invalidateApiCache('/tracking/capabilities');
   if(!await trackingAvailable(token))throw Error('Tracking disabled');
   const assignments=(await ownTrackingAssignments(token)).filter(a=>a.trip_id===tripId&&(!assignmentId||a.id===assignmentId));
   const assignment=assignments.find(a=>a.id===assignmentId)??(assignments.length===1?assignments[0]:null);
   if(!assignment)throw Error('Assignment unavailable');
   if(!mounted.current||generation!==epoch.current)return;
   capture.current=createLocationCapture({geolocation:navigator.geolocation,onFix:fix=>{if(assignmentId)cacheDeliveryGps(assignmentId,fix);},onState:value=>{if(mounted.current&&generation===epoch.current)setState(value);},api:{begin:()=>trackingMutation<{session_id:string}>(token,assignment.id,'start',{consent:true}),send:async(session,fix,signal)=>{await trackingMutation(token,assignment.id,'fixes',{session_id:session,...fix},signal);},stop:async session=>{await trackingMutation(token,assignment.id,'stop',{session_id:session});}}});
   await capture.current.start(assignmentId?availableDeliveryGps(assignmentId):undefined);
  }catch{if(mounted.current&&generation===epoch.current)setState('TRACKING_UNAVAILABLE');}finally{if(mounted.current&&generation===epoch.current)setBusy(false);}
 },[token,tripId,assignmentId]);
 useEffect(()=>{mounted.current=true;const foreground=()=>{if(document.visibilityState==='visible'&&optedIn.current&&!['PERMISSION_DENIED','REQUESTING_PERMISSION'].includes(stateRef.current))void start();};const leave=()=>{++epoch.current;void capture.current?.stop();setState('STOPPED');};window.addEventListener('pagehide',leave);window.addEventListener('pageshow',foreground);window.addEventListener('focus',foreground);document.addEventListener('visibilitychange',foreground);return()=>{mounted.current=false;++epoch.current;void capture.current?.stop();window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',foreground);window.removeEventListener('focus',foreground);document.removeEventListener('visibilitychange',foreground);};},[start]);
 useEffect(()=>{if(startRef)startRef.current=start;return()=>{if(startRef)startRef.current=null;};},[start,startRef]);
 if(hidden)return null;
 if(state==='SHARING')return <section className="delivery-location-live" aria-label="Location sharing"><MapPin size={16} aria-hidden/><span role="status">Location sharing active</span><button onClick={()=>{optedIn.current=false;void capture.current?.stop();}}>Stop sharing</button></section>;
 return <section className="delivery-location-warning" role="status" aria-label="Location sharing unavailable"><MapPinOff size={21} aria-hidden/><div><strong>Location sharing unavailable</strong><p>{explanations[state]??explanations.LOCATION_UNAVAILABLE}</p><button className="delivery-secondary" disabled={busy} onClick={()=>void start()}>{busy?'Getting location...':state==='STOPPED'?'Share My Location':'Retry Location'}</button></div></section>;
}
