/** Random browser-profile label, never an authentication credential or fingerprint. */
export function browserDeviceIdentifier(){try{let id=localStorage.getItem('alzhen.device-id.v1');if(!id){id=crypto.randomUUID();localStorage.setItem('alzhen.device-id.v1',id);}return id;}catch{return undefined;}}
