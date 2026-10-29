import type {ToastItem} from '../components/ui/Toast';

type AddToast=(toast:Omit<ToastItem,'id'>)=>void;
const rejectedSeen=new Map<string,Set<string>>(),failedSeen=new Set<string>();

/** Only user-facing prose belongs in feedback; never display raw server diagnostics. */
export function safePodMessage(value:unknown,fallback='Your POD could not be uploaded. Please try again.'){
 const message=(value instanceof Error?value.message:typeof value==='string'?value:'').replace(/[\u0000-\u001f]/g,' ').trim();
 if(!message||message.length>700||/SQLSTATE|\bPGRST\w*|postgres|stack trace|syntax error|permission denied|\b(?:column|table)\b.*does not exist|\b(?:constraint|schema|relation)\b|\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*\b(?:FROM|INTO|WHERE|SET)\b|\bat\s+\S+\.(?:ts|js):\d+|https?:\/\/|\b(?:bearer|jwt|api[_ -]?key|secret|password|access[_ -]?token)\b/i.test(message))return fallback;
 if(/failed to fetch|networkerror|load failed/i.test(message))return fallback;
 return message;
}

export function notifyPodFailure(addToast:AddToast,owner:string,error:unknown,draftId?:string){
 const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
 const raw=error instanceof Error?error.message:typeof error==='string'?error:'';
 const description=code==='POD_ALREADY_SUBMITTED'||/duplicate key|already (?:been )?submitted/i.test(raw)?'This POD has already been submitted.':safePodMessage(error);
 const key=`pod-failed:${owner}:${draftId??'form'}:${description}`;
 // The same failure may reach the open sheet and the background outbox listener.
 if(draftId){if(failedSeen.has(key))return;failedSeen.add(key);if(failedSeen.size>1000)failedSeen.delete(failedSeen.values().next().value!);}
 addToast({title:/network|timed? out|connection|failed to fetch|upload failed/i.test(raw)?'POD upload failed':'POD not accepted',description,variant:'error',duration:6500,notificationKey:`pod-submission:${owner}:${draftId??'form'}`});
}

export function notifyPodRejectionOnce(addToast:AddToast,owner:string,receiptId:unknown,reason:unknown){
 if(!owner||typeof receiptId!=='string'||!receiptId||receiptId.length>200)return;
 const storageKey=`alzhen:pod-rejection-toasts:${owner}`;
 let seen=rejectedSeen.get(owner);
 if(!seen){seen=new Set<string>();try{const saved:unknown=JSON.parse(localStorage.getItem(storageKey)??'[]');if(Array.isArray(saved))for(const id of saved)if(typeof id==='string')seen.add(id);}catch{/* Storage may be disabled; session deduplication still works. */}rejectedSeen.set(owner,seen);}
 if(seen.has(receiptId))return;seen.add(receiptId);
 try{localStorage.setItem(storageKey,JSON.stringify([...seen].slice(-500)));}catch{/* Keep the notification and timeline usable without storage. */}
 const explanation=safePodMessage(reason,'Please review the rejection reason in your delivery timeline.');
 addToast({title:'POD Rejected',description:`${explanation} Please upload a replacement POD.`,variant:'error',duration:8500,notificationKey:`pod-rejected:${owner}:${receiptId}`});
}
