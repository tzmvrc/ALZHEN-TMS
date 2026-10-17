import type {Point} from "./road-routing";
/** Explicit latitude/longitude fields; empty input must never coerce to (0,0). */
export function coordinateDraft(latitude:string,longitude:string):Point|null{
 if(!latitude.trim()||!longitude.trim())return null;
 const lat=Number(latitude),lng=Number(longitude);
 return Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180?{latitude:lat,longitude:lng}:null;
}
