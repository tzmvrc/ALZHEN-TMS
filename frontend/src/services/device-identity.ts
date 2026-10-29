/** Random browser-profile label, never an authentication credential or fingerprint. */
let transient:string|undefined;
const valid=(id:string|null):id is string=>!!id&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function browserDeviceIdentifier(email?:string){
 const overrideKey=email?'alzhen.device-override:'+email.trim().toLowerCase():null;
 for(const storage of [()=>localStorage,()=>sessionStorage])try{const store=storage(),override=overrideKey?store.getItem(overrideKey):null;if(valid(override))return override.toLowerCase();let id=store.getItem('alzhen.device-id.v1');if(!valid(id)){id=crypto.randomUUID();store.setItem('alzhen.device-id.v1',id);}return id.toLowerCase();}catch{/* Try tab storage when persistent storage is unavailable. */}
 return transient??=crypto.randomUUID();
}
/** Signed-out forgetting rotates only this account's local identity. */
export function forgetBrowserDevice(email?:string){if(!email)return;const key='alzhen.device-override:'+email.trim().toLowerCase(),id=crypto.randomUUID();for(const storage of [()=>localStorage,()=>sessionStorage])try{storage().setItem(key,id);return;}catch{}transient=id;}
