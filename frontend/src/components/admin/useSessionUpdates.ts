import {useEffect,useRef} from 'react';
import {collaborationSnapshot,subscribeCollaborationEvents} from '../../services/collaboration.service';
/** Push updates normally; bounded recovery reads only when the bridge is down. */
export function useSessionUpdates(refresh:()=>unknown,enabled=true,activityClock=false){
 const current=useRef(refresh);current.current=refresh;
 useEffect(()=>{if(!enabled)return;let timer:ReturnType<typeof setTimeout>|undefined;
  const update=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(document.visibilityState==='visible')void current.current();},200);};
  const off=subscribeCollaborationEvents(e=>{if(e.kind==='connected'||e.kind==='security'||e.kind==='signal'&&['device_sessions','profiles'].includes(e.topic))update();});
  const visible=()=>{if(document.visibilityState==='visible')update();};
  const fallback=setInterval(()=>{const s=collaborationSnapshot();if(activityClock||!s.connected||!s.bridgeHealthy)update();},60000);
  window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{off();clearTimeout(timer);clearInterval(fallback);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[enabled,activityClock]);
}
