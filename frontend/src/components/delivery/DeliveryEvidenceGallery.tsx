import {useState} from 'react';
import ImagePreview,{type PreviewFile} from '../ui/ImagePreview';
export type EvidencePreview=PreviewFile;
export default function DeliveryEvidenceGallery({files,onRetry,labelPrefix="View"}:{files:EvidencePreview[];onRetry?:()=>void;labelPrefix?:string}){
 const [selectedId,setSelectedId]=useState<string|null>(null),[failed,setFailed]=useState<Record<string,string>>({});
 const selected=files.find(f=>f.id===selectedId&&f.url);
 return <><div className="trip-evidence-gallery">{files.map(file=>file.url&&failed[file.id]!==file.url?<button key={file.id} type="button" onClick={()=>setSelectedId(file.id)} aria-label={`${labelPrefix} ${file.file_name}`}>{file.mime_type==='application/pdf'?<span>PDF document</span>:<img loading="lazy" src={file.url} alt={file.file_name} onError={()=>setFailed(current=>({...current,[file.id]:file.url!}))}/>}<small>{file.file_name}</small></button>:<small key={file.id}>Image unavailable. {onRetry&&<button type="button" className="delivery-inline" onClick={()=>{setFailed({});onRetry();}}>Retry image</button>}</small>)}</div>{selected&&<ImagePreview key={selected.id} file={selected} onClose={()=>setSelectedId(null)} onPrevious={files.length>1?()=>setSelectedId(files[(files.findIndex(f=>f.id===selectedId)-1+files.length)%files.length].id):undefined} onNext={files.length>1?()=>setSelectedId(files[(files.findIndex(f=>f.id===selectedId)+1)%files.length].id):undefined}/>}</>;
}
