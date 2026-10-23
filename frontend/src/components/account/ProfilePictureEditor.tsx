import {useEffect,useRef,useState} from "react";
import {Camera,LoaderCircle,Trash2} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import {fetchPictureRecord,removeUserPicture,uploadUserPicture,type PictureRecord} from "../../services/user-workspace.service";
import {canChangeAccountPicture} from "../../services/account-picture-permissions";
import {AccountAvatar,AccountMessage} from "./AccountUi";

export default function ProfilePictureEditor({userId,onSaved,onBusyChange}:{userId:string;onSaved?:()=>void;onBusyChange?:(busy:boolean)=>void}){
 const {accessToken,profile:viewer,refreshSession}=useAuth(),lock=useRef(false);
 const [record,setRecord]=useState<PictureRecord|null>(null),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<string|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[revision,setRevision]=useState(0),[confirmRemove,setConfirmRemove]=useState(false);
 useEffect(()=>{if(!accessToken)return;let live=true;setLoading(true);void fetchPictureRecord(accessToken,userId).then(value=>{if(live){setRecord(value);setError("");}}).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:"Picture could not load.");}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[accessToken,userId,revision]);
 useEffect(()=>{if(!file){setPreview(null);return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 const update=async(remove=false)=>{
  if(!accessToken||lock.current||!record||!canChangeAccountPicture(viewer,record)||(!remove&&!file))return;
  lock.current=true;setBusy(true);onBusyChange?.(true);setError("");setNotice("");
  try{
   const result=remove?await removeUserPicture(accessToken,userId):await uploadUserPicture(accessToken,userId,file!);
   const url="signed_url" in result?result.signed_url:null;
   setRecord(current=>current?{...current,profile_picture_url:url,has_picture:!remove}:current);setFile(null);setConfirmRemove(false);
   window.dispatchEvent(new CustomEvent("alzhen:profile-updated",{detail:{id:userId,profile_picture_url:url}}));
   if(viewer?.id===userId)void refreshSession({silent:true}).catch(()=>{});
   setNotice((remove?(result.cleanup_pending?"Profile picture removed. Owned-file cleanup is queued.":"Profile picture removed."):url?"Profile picture updated.":"Picture saved. Its secure preview is temporarily unavailable; refresh to reload it.")+(result.audit_warning?" Activity confirmation is delayed.":""));onSaved?.();
  }catch(cause){setError(cause instanceof Error?cause.message:"The picture was not saved. Your selection is preserved.");}
  finally{lock.current=false;setBusy(false);onBusyChange?.(false);}
 };
 return <div className="space-y-4">
  <AccountMessage error={error} notice={notice}/>
  {loading?<p role="status" className="account-muted text-xs">Loading picture…</p>:record?<>
   <div className="flex flex-wrap items-center gap-4"><AccountAvatar url={preview??record.profile_picture_url} name={record.name} size="h-20 w-20"/><div><p className="font-semibold">{record.name}</p><p className="account-muted mt-1 text-xs">JPEG, PNG or WebP · Up to 5 MB</p><p className="account-muted mt-1 text-xs">Your full name is used as the display name.</p></div></div>
   {canChangeAccountPicture(viewer,record)&&<><label className="account-button"><Camera className="h-4 w-4"/>Choose Picture<input type="file" aria-label="Choose profile picture" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={event=>{const chosen=event.target.files?.[0];event.target.value="";if(!chosen)return;if(!["image/jpeg","image/png","image/webp"].includes(chosen.type)||!chosen.size||chosen.size>5*1024*1024){setError("Choose a JPEG, PNG or WebP image up to 5 MB.");return;}setError("");setNotice("");setFile(chosen);setConfirmRemove(false);}}/></label>
    {file&&<div className="flex flex-wrap items-center gap-2"><button type="button" className="account-button account-button-primary" disabled={busy} onClick={()=>void update()}>{busy&&<LoaderCircle className="h-3.5 w-3.5 animate-spin"/>}Save Changes</button><button type="button" className="account-button" disabled={busy} onClick={()=>setFile(null)}>Cancel</button><span className="account-muted max-w-full truncate text-xs">{file.name}</span></div>}
    {record.has_picture&&!file&&<div>{confirmRemove?<div className="space-y-2 rounded border border-rose-200 p-3"><p className="text-xs">Remove this profile picture?</p><div className="flex gap-2"><button type="button" className="account-button text-rose-600" disabled={busy} onClick={()=>void update(true)}>Remove Picture</button><button type="button" className="account-button" disabled={busy} onClick={()=>setConfirmRemove(false)}>Keep Picture</button></div></div>:<button type="button" className="account-button" disabled={busy} onClick={()=>setConfirmRemove(true)}><Trash2 className="h-3.5 w-3.5"/>Remove Picture</button>}</div>}
   </>}
  </>:<button type="button" className="account-button" onClick={()=>setRevision(value=>value+1)}>Retry Picture</button>}
 </div>;
}
