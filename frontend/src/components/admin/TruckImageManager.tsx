import {useTruckImages,refreshTruckImages,invalidateTruckImages} from "../../services/truck-image-cache";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Replace, Trash2, X } from "lucide-react";
import { uploadTruckImage, deleteTruckImage, type TruckImage } from "../../services/master-data.service";

type Props = { token: string; truckId: string; truckLabel: string; onClose: () => void };

export default function TruckImageManager({ token, truckId, truckLabel, onClose }: Props) {
  const gallery=useTruckImages(token,truckId),images=gallery.images,loading=gallery.loading;
  const mutationLock=useRef(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<TruckImage | null>(null);

  const refresh=()=>refreshTruckImages(token,truckId,true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || mutationLock.current) return;
      if (preview) setPreview(null);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, preview]);

  const upload = async (files: FileList | null) => {
    if (!files?.length || mutationLock.current) return;
    const selected = Array.from(files);
    const invalid = selected.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024);
    if (invalid) { setError(`${invalid.name}: choose a JPEG, PNG, or WebP image up to 5 MB.`); return; }
    mutationLock.current=true;setBusy(true); setError(""); setNotice("");
    let uploaded = 0;
    try {
      for (let index = 0; index < selected.length; index += 1) {
        setUploadProgress(`Uploading ${index + 1} of ${selected.length}…`);
        await uploadTruckImage(token, truckId, selected[index]);
        uploaded += 1;
      }
      setNotice(`${uploaded} image${uploaded === 1 ? "" : "s"} uploaded.`);
      await refresh();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Upload failed."}${uploaded ? ` ${uploaded} image${uploaded === 1 ? " was" : "s were"} uploaded successfully.` : ""}`);
      if (uploaded) await refresh();
    } finally { mutationLock.current=false;setUploadProgress(""); setBusy(false); }
  };

  const remove = async (image: TruckImage) => {
    if (mutationLock.current || !window.confirm(`Delete ${image.file_name}? This removes the image from this truck.`)) return;
    mutationLock.current=true;setBusy(true); setError(""); setNotice("");
    try {
      await deleteTruckImage(token, truckId, image.id);
      invalidateTruckImages(token,truckId);
      setNotice("Image deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete image."); }
    finally { mutationLock.current=false;setBusy(false); }
  };

  const replace=async(image:TruckImage,file:File|undefined)=>{
    if(!file||mutationLock.current)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024){setError("Choose a JPEG, PNG or WebP image up to 5 MB.");return;}
    if(!window.confirm(`Replace ${image.file_name}? The new image uploads before the old image is removed.`))return;
    mutationLock.current=true;setBusy(true);setError("");setNotice("");let uploaded=false;
    try{await uploadTruckImage(token,truckId,file);uploaded=true;await deleteTruckImage(token,truckId,image.id);setNotice("Image replaced.");}
    catch{setError(uploaded?"The new image was uploaded. Removal of the previous image was not confirmed; refresh and review the gallery.":"Unable to upload the replacement. The original image is retained.");}
    finally{invalidateTruckImages(token,truckId);await refresh();mutationLock.current=false;setBusy(false);}
  };

  return <>
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !mutationLock.current) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="truck-images-title" className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 id="truck-images-title" className="font-semibold text-[#0b2341]">Truck images</h2><p className="mt-0.5 text-xs text-slate-500">{truckLabel} · {images.length} image{images.length === 1 ? "" : "s"}</p></div><button type="button" disabled={busy} onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close truck images"><X className="h-4 w-4" /></button></header>
        <div className="max-h-[calc(90vh-75px)] overflow-y-auto p-5">
          <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[#ffd43b] px-4 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200] ${busy ? "pointer-events-none opacity-60" : ""}`}><ImagePlus className="h-4 w-4" />{busy ? uploadProgress || "Working…" : "Upload pictures"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} /></label>
          <p className="mt-2 text-xs text-slate-500">JPEG, PNG, or WebP · up to 5 MB each. Pictures are stored privately.</p>
          {(error||gallery.error) && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error||gallery.error}</p>}{gallery.error&&<button type="button" disabled={busy} onClick={()=>void refresh()} className="mt-2 text-xs text-[#2678b9] underline">Retry images</button>}{notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
          {loading&&!images.length ? <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading pictures…</div> : images.length ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{images.map((image) => <article key={image.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><button type="button" className="block aspect-square w-full bg-slate-100" onClick={() => setPreview(image)} aria-label={`Preview ${image.file_name}`}><img src={image.signed_url} alt={image.file_name} className="h-full w-full object-cover" loading="lazy" /></button><div className="flex items-center gap-2 p-2"><span className="min-w-0 flex-1 truncate text-xs text-slate-600" title={image.file_name}>{image.file_name}</span><label title="Replace image" className={`cursor-pointer rounded-md p-1.5 text-slate-500 hover:bg-slate-100 ${busy?"pointer-events-none opacity-50":""}`}><Replace className="h-4 w-4"/><input type="file" className="sr-only" aria-label={`Replace ${image.file_name}`} accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{void replace(image,event.target.files?.[0]);event.target.value="";}}/></label><button type="button" disabled={busy} onClick={() => void remove(image)} aria-label={`Delete ${image.file_name}`} title="Delete picture" className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div></article>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500">No pictures for this truck yet.</div>}
        </div>
      </section>
    </div>
    {preview && <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><div role="dialog" aria-label={`Preview ${preview.file_name}`} className="relative max-h-full max-w-full"><button type="button" onClick={() => setPreview(null)} className="absolute -right-3 -top-3 rounded-full bg-white p-2 text-slate-700 shadow" aria-label="Close image preview"><X className="h-4 w-4" /></button><img src={preview.signed_url} alt={preview.file_name} className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain" /><p className="mt-2 text-center text-sm text-white">{preview.file_name}</p></div></div>}
  </>;
}
