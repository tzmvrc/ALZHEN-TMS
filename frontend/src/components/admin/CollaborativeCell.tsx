import {useCallback,useMemo,useSyncExternalStore,type ReactNode} from "react";
import {cellDraftConflict,cellDraftSnapshot,draftCellKey,localCellDraft,subscribeCellDraft,type DraftTarget} from "../../services/cell-draft.service";
import { CellDraftContext as Context } from "./cell-draft-context";
const noop=()=>()=>{};
const empty:readonly never[]=[];
type SelectionPresence={userId:string;name:string;color:string;status?:string};
/** One subscription per physical cell; incoming text never changes table rows. */
export function CollaborativeCell({target,children,selectionPresence=[]}:{target:DraftTarget|null;children:ReactNode;selectionPresence?:readonly SelectionPresence[]}){
 const identity=JSON.stringify(target),stable=useMemo(()=>JSON.parse(identity) as DraftTarget|null,[identity]);
 const subscribe=useCallback((fn:()=>void)=>stable?subscribeCellDraft(stable,fn):noop(),[stable]);
 const snapshot=useCallback(()=>stable?cellDraftSnapshot(stable):empty,[stable]);
 const peers=useSyncExternalStore(subscribe,snapshot,snapshot),local=stable?localCellDraft(stable):false;
 const conflict=stable?cellDraftConflict(stable):undefined,peer=peers.at(-1);
 // Reuse the selection label for drafts; other tabs/sessions are not new users.
 const users=[...new Map([...peers.map(p=>({...p,status:"editing"})),...selectionPresence].map(p=>[p.userId,p])).values()];
 const primary=selectionPresence[0]??users[0];
 return <Context.Provider value={stable}><div className={`${selectionPresence.length?"":"relative "}min-w-0 overflow-visible`} data-draft-cell={stable?draftCellKey(stable):undefined}>
  <div className="relative min-w-0 overflow-visible">
  {children}
  {peer&&<span role="note" data-live-draft="true" data-live-draft-phase={peer.phase} data-live-draft-value={peer.value} title={`Unsaved ${peer.phase}: ${peer.value}`} className={local?"pointer-events-none absolute bottom-0 right-1 z-20 max-w-[90%] truncate rounded bg-white/95 px-1 text-[9px] leading-3":"pointer-events-none absolute inset-0 z-10 flex min-w-0 items-center rounded-sm bg-white px-1 text-left text-sm"} style={{color:peer.color,...(!local&&!selectionPresence.length?{boxShadow:`inset 0 0 0 2px ${peer.color}`}:{})}}>
    <span className="truncate">{local?`Unsaved: ${peer.value}`:peer.value||"(blank draft)"}</span>
  </span>}
  </div>
  {primary&&<span data-cell-presence="true" className="pointer-events-none absolute right-1 -top-1.5 z-30 max-w-[90%] truncate rounded-sm bg-white/95 px-1 text-[9px] leading-3" style={{color:primary.color}} title={users.map(user=>`${user.name} (${user.status??"selected"}${user.userId===peer?.userId?"; draft shown":""})`).join(", ")}>{primary.name}{primary.status==="editing"?" · editing":""}{users.length>1?` +${users.length-1}`:""}</span>}
  {conflict&&<span role="status" className="block text-[10px] text-amber-800">{conflict}</span>}
 </div></Context.Provider>;
}
