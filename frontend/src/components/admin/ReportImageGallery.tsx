import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type ReportImage = { id: string; file_name: string; signed_url: string };

/** URLs are supplied by the authorized receipt listing API, never constructed. */
export default function ReportImageGallery({ images }: { images: readonly ReportImage[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [failedThumbnails, setFailedThumbnails] = useState<Record<string, boolean>>({});
  const dialogRef = useRef<HTMLElement>(null);
  const active = images.find((image) => image.id === activeId && image.signed_url);
  const open = Boolean(active);
  const move = (direction: number) => setActiveId((current) => {
    const index = images.findIndex((image) => image.id === current);
    return images[(index + direction + images.length) % images.length]?.id ?? null;
  });

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); setActiveId(null);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); event.stopPropagation();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        setActiveId((current) => {
          const index = images.findIndex((image) => image.id === current);
          return images[(index + direction + images.length) % images.length]?.id ?? null;
        });
      } else if (event.key === "Tab") {
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open, images]);

  if (!images.length) return null;
  return <>
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Report images">
      {images.map((image) => <button key={image.id} type="button" disabled={!image.signed_url} onClick={() => setActiveId(image.id)} aria-label={`Preview ${image.file_name}`} className="block w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]">
        {!image.signed_url ? <span className="flex h-20 items-center p-2 text-xs text-amber-700">Upload incomplete. Retry the original image.</span> : failedThumbnails[image.signed_url] ? <span className="flex h-20 items-center p-2 text-xs text-rose-700">Preview unavailable</span> : <img src={image.signed_url} alt={image.file_name} loading="lazy" onError={() => setFailedThumbnails((current) => ({ ...current, [image.signed_url]: true }))} className="h-20 w-full object-cover" />}
        <span className="block truncate px-2 py-1 text-[10px] text-slate-600">{image.file_name}</span>
      </button>)}
    </div>
    {active && createPortal(<div className="fixed inset-0 z-[2400] flex items-center justify-center bg-slate-950/85 p-3 sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) setActiveId(null); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Image preview: ${active.file_name}`} tabIndex={-1} className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><h3 className="truncate text-sm font-semibold text-slate-800">{active.file_name}</h3><button type="button" aria-label="Close image preview" title="Close image preview" onClick={() => setActiveId(null)} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"><X aria-hidden="true" className="h-5 w-5" /></button></header>
        <FullSizeReportImage key={`${active.id}:${active.signed_url}`} image={active} />
        {images.length > 1 && <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-sm text-slate-600"><button type="button" aria-label="Previous image" onClick={() => move(-1)} className="rounded-full p-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"><ChevronLeft aria-hidden="true" className="h-5 w-5" /></button><span>{images.findIndex((image) => image.id === activeId) + 1} / {images.length}</span><button type="button" aria-label="Next image" onClick={() => move(1)} className="rounded-full p-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"><ChevronRight aria-hidden="true" className="h-5 w-5" /></button></footer>}
      </section>
    </div>, document.body)}
  </>;
}

function FullSizeReportImage({ image }: { image: ReportImage }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  return <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-3 text-center">
    {status === "loading" && <p role="status" className="py-4 text-sm text-slate-500">Loading image…</p>}
    {status === "error" && <p role="alert" className="py-4 text-sm text-rose-700">This image could not be loaded. Close the report and reopen it to refresh its secure links.</p>}
    <img src={image.signed_url} alt={image.file_name} onLoad={() => setStatus("ready")} onError={() => setStatus("error")} className={`mx-auto max-h-[72vh] max-w-full object-contain ${status === "error" ? "hidden" : ""}`} />
  </div>;
}
