export function rememberedEmail(){try{return localStorage.getItem('alzhen.remembered-email')??'';}catch{return '';}}
export function rememberEmail(email:string,remember:boolean){try{if(remember)localStorage.setItem('alzhen.remembered-email',email);else localStorage.removeItem('alzhen.remembered-email');}catch{/* Remembering an email is optional; credentials are never persisted here. */}}
export type RememberedAccount={id:string;name:string;email:string;role:string;crew_role?:string|null;picture:string|null};
const preferenceKey='alzhen.login-preferences.v1',accountKey='alzhen.remembered-account.v1';
function preferences():Record<string,boolean>{try{const value=JSON.parse(localStorage.getItem(preferenceKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export function loginPreference(id:string):boolean|undefined{const value=preferences()[id];return typeof value==='boolean'?value:undefined;}
export function rememberedAccount():RememberedAccount|null{try{const v=JSON.parse(localStorage.getItem(accountKey)||'null');if(!v||typeof v.id!=='string'||typeof v.name!=='string'||!['ADMIN','STAFF','TRUCKER'].includes(v.role)||loginPreference(v.id)!==true)return null;return {id:v.id,name:v.name,email:typeof v.email==='string'?v.email:'',role:v.role,crew_role:v.crew_role==='HELPER'?'HELPER':v.crew_role==='DRIVER'?'DRIVER':null,picture:typeof v.picture==='string'&&/^https?:\/\//.test(v.picture)?v.picture:null};}catch{return null;}}
export function saveLoginPreference(profile:{id:string;first_name?:string|null;last_name?:string|null;role:string;crew_role?:string|null;profile_picture_url?:string|null},email:string,remember:boolean){
 // Only a display identity and consent are saved here. Supabase owns auth persistence.
 const previous=rememberedAccount()?.id;
 const next={...preferences(),[profile.id]:remember};localStorage.setItem(preferenceKey,JSON.stringify(next));
 if(remember){const record:RememberedAccount={id:profile.id,name:[profile.first_name,profile.last_name].filter(Boolean).join(' ')||'Account',email,role:profile.role,crew_role:profile.role==='TRUCKER'?profile.crew_role??'DRIVER':null,picture:profile.profile_picture_url??null};localStorage.setItem(accountKey,JSON.stringify(record));rememberEmail(email,true);}
 else if(previous===profile.id){localStorage.removeItem(accountKey);rememberEmail('',false);}
}
export function forgetLoginPreference(id?:string){const saved=rememberedAccount(),target=id||saved?.id;if(target){const next=preferences();delete next[target];localStorage.setItem(preferenceKey,JSON.stringify(next));}if(!id||saved?.id===target){localStorage.removeItem(accountKey);rememberEmail('',false);}}
