import type {CorsOptions} from "cors";
export function productionHttpConfig(env:NodeJS.ProcessEnv=process.env){
 const production=env.NODE_ENV==="production";
 const origins=(env.CORS_ORIGINS??"http://localhost:5173,http://127.0.0.1:5173").split(",").map(x=>x.trim()).filter(Boolean);
 if(production&&(!env.CORS_ORIGINS||!origins.length||origins.some(origin=>{try{const url=new URL(origin);return url.origin!==origin||url.protocol!=="https:";}catch{return true;}})))throw Error("Production requires exact HTTPS CORS_ORIGINS");
 const hops=Number(env.TRUST_PROXY_HOPS??0);if(!Number.isInteger(hops)||hops<0||hops>2)throw Error("Invalid TRUST_PROXY_HOPS");
 const restricted=production||Boolean(env.CORS_ORIGINS);
 const cors:CorsOptions={exposedHeaders:["Server-Timing"],origin:(origin,done)=>done(null,!restricted||!origin||origins.includes(origin))};
 return {cors,trustProxy:hops};
}
