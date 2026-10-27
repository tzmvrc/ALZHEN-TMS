import {useEffect,type RefObject} from 'react';
/** Fit the native dialog to the visual viewport while an on-screen keyboard is open. */
export function useDialogViewport(ref:RefObject<HTMLDialogElement|null>,enabled=true){
 useEffect(()=>{const node=ref.current,v=window.visualViewport;if(!enabled||!node||!v)return;
  const update=()=>{node.style.maxHeight=`${Math.max(120,v.height-20)}px`;node.style.top=`${v.offsetTop}px`;node.style.bottom=`${Math.max(0,window.innerHeight-v.height-v.offsetTop)}px`;};
  update();v.addEventListener('resize',update);v.addEventListener('scroll',update);
  return()=>{v.removeEventListener('resize',update);v.removeEventListener('scroll',update);};
 },[ref,enabled]);
}
