import {useState} from "react";

/** A confirmation must never survive an account, role or bearer-session change. */
export function useWholeTripSelection(scope:string){
 const [snapshot,setSnapshot]=useState<{scope:string;ids:string[]}|null>(null);
 if(snapshot&&snapshot.scope!==scope)setSnapshot(null);
 return {
  tripIds:snapshot?.scope===scope?snapshot.ids:null,
  setTripIds:(ids:string[]|null)=>setSnapshot(ids?{scope,ids:[...ids]}:null),
 };
}
