import {apiGet,apiPost,apiDelete,getAppSessionHeaders,type ApiResponse} from './api.service';
const base=import.meta.env.VITE_API_URL??'http://localhost:5000/api';
const path=(trip:string)=>`/trips/${encodeURIComponent(trip)}/image-exports`;
export type ImageExport={id:string;state:'PREPARING'|'READY'|'FAILED'|'CANCELLED';total:number;completed:number;bytes:number;filename:string;failures:{id:string;filename:string;message:string}[];error?:string};
export type GalleryImage={id:string;trip_id:string;trip_stop_id:string|null;assignment_id:string|null;kind:'receipt'|'photo';dr_number:string|null;destination:string|null;stop_sequence:number|null;file_name:string;download_name:string;mime_type:string|null;created_at:string;display_order:number;delivery_event_id:string|null;pod_review_status:'APPROVED'|null;signed_url:string|null};
export type GalleryPage={rows:GalleryImage[];total:number;page:number;totalPages:number};
export async function fetchTripGallery(token:string,trip:string,page:number,search:string){return result(await apiGet<ApiResponse<GalleryPage>>(`/trips/${encodeURIComponent(trip)}/media?${new URLSearchParams({page:String(page),search})}`,token));}
function result<T>(response:ApiResponse<T>):T{if(!response.success||!response.data)throw Error(response.message||'The export could not be confirmed. Please retry.');return response.data;}
export async function startTripImageExport(token:string,trip:string){return result(await apiPost<ApiResponse<ImageExport>>(path(trip),{},token));}
export async function tripImageExportStatus(token:string,trip:string,id:string){return result(await apiGet<ApiResponse<ImageExport>>(`${path(trip)}/${id}`,token,15000));}
export async function cancelTripImageExport(token:string,trip:string,id:string){return result(await apiDelete<ApiResponse<ImageExport>>(`${path(trip)}/${id}`,token));}
export async function downloadTripArchive(token:string,trip:string,id:string){
 const {ticket}=result(await apiPost<ApiResponse<{ticket:string}>>(`${path(trip)}/${id}/ticket`,{},token));
 const link=document.createElement('a');link.href=`${base}${path(trip)}/${id}/archive?ticket=${encodeURIComponent(ticket)}`;link.rel='noreferrer';document.body.append(link);link.click();link.remove();
}
/** Individual images are bounded server-side; ZIP archives use browser-native streaming instead. */
export async function downloadTripMedia(token:string,trip:string,id:string){
 const response=await fetch(`${base}/trips/${encodeURIComponent(trip)}/media/${encodeURIComponent(id)}/download`,{headers:{Authorization:`Bearer ${token}`,...getAppSessionHeaders()},signal:AbortSignal.timeout(60000)});
 if(!response.ok){const body=await response.json().catch(()=>null);throw Error(response.status>=500?'This image could not be downloaded. Retry after refreshing the gallery.':body?.message||'This image is unavailable for this trip.');}
 const disposition=response.headers.get('Content-Disposition')??'';
 const encoded=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1],plain=disposition.match(/filename="([^"]+)"/i)?.[1];
 const filename=encoded?decodeURIComponent(encoded):plain||`Image ${id}.jpg`;
 const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
