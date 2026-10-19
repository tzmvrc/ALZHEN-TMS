import {useEffect,useState} from "react";
import {apiGetCached,type ApiResponse} from "../../services/api.service";
export function useDraftTrackerColumns(token:string|null,enabled:boolean){
 const [result,setResult]=useState<{token:string;columns:Record<string,string>}|null>(null);
 useEffect(()=>{let live=true;if(token&&enabled)void apiGetCached<ApiResponse<Record<string,string>>>("/realtime/draft-tracker-columns",token,60000).then(value=>{if(live&&value.success&&value.data)setResult({token,columns:value.data});}).catch(()=>{});return()=>{live=false;};},[token,enabled]);
 return result?.token===token?result.columns:{};
}
