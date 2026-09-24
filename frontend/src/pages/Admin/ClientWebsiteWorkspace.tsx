import { useRef, useState } from "react";
import {
  Eye,
  FileImage,
  Globe2,
  LayoutTemplate,
  LogOut,
  Move,
  RefreshCw,
  Save,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import logo from "../../assets/logo.png";
import { WorkspaceSwitcher, type WorkspaceName } from "../../components/admin/SidebarNav";

export default function ClientWebsiteWorkspace({
  userName,
  onWorkspaceChange,
  onLogout,
}: {
  userName: string;
  onWorkspaceChange: (workspace: WorkspaceName) => void;
  onLogout: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 150, y: 90 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current?.getBoundingClientRect();
    if (!canvas) return;
    dragOffset.current = { x: event.clientX - canvas.left - position.x, y: event.clientY - canvas.top - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !canvasRef.current) return;
    const canvas = canvasRef.current.getBoundingClientRect();
    const nextX = Math.max(12, Math.min(canvas.width - 312, event.clientX - canvas.left - dragOffset.current.x));
    const nextY = Math.max(12, Math.min(canvas.height - 212, event.clientY - canvas.top - dragOffset.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-4 left-4 z-30 hidden h-[calc(100vh-2rem)] w-[260px] flex-col rounded-[28px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_50px_rgba(42,76,120,0.12)] backdrop-blur-xl lg:flex">
        <WorkspaceSwitcher workspace="Client Website" onChange={onWorkspaceChange} />
        <div className="mt-7 px-2"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Client website</p><p className="mt-1 text-xs text-slate-400">Workspace prototype</p></div>
        <nav className="mt-5 space-y-1">
          {[{ label: "Website", icon: Globe2 }, { label: "Pages", icon: LayoutTemplate }, { label: "Media", icon: FileImage }, { label: "Settings", icon: Settings }].map(({ label, icon: Icon }, index) => (
            <button key={label} type="button" className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${index === 0 ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-100 pt-3">
          <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-slate-200 p-2.5"><img src={logo} alt="" className="h-8 w-8 rounded-full object-contain" /><div className="min-w-0"><p className="truncate text-xs font-semibold">{userName}</p><p className="text-[10px] text-slate-400">Website admin</p></div></div>
          <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><LogOut className="h-3.5 w-3.5" /> Logout</button>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[292px]">
        <header className="sticky top-4 z-20 mx-4 flex min-h-14 items-center justify-between rounded-2xl border border-white/80 bg-white/90 px-5 shadow-[0_14px_35px_rgba(42,76,120,0.1)] backdrop-blur-xl lg:mx-6"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600">Workspace</p><h1 className="text-base font-semibold">Client Website</h1></div><div className="flex items-center gap-2"><button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" /> Preview</button><button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Save className="h-3.5 w-3.5" /> Save changes</button></div></header>
        <div className="grid gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_250px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Website preview</h2><p className="text-xs text-slate-400">Prototype canvas for the future editor</p></div><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50" aria-label="Refresh preview"><RefreshCw className="h-4 w-4" /></button></div><div ref={canvasRef} onPointerMove={handlePointerMove} onPointerUp={() => setDragging(false)} className="relative min-h-[620px] overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50"><div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)", backgroundSize: "24px 24px" }} /><div onPointerDown={handlePointerDown} style={{ left: position.x, top: position.y }} className={`absolute flex h-[200px] w-[300px] touch-none select-none flex-col items-center justify-center rounded-xl border-2 border-blue-300 bg-white shadow-lg ${dragging ? "cursor-grabbing" : "cursor-grab"}`}><Move className="mb-3 h-5 w-5 text-blue-500" /><p className="text-sm font-semibold text-slate-800">Client website</p><p className="mt-1 text-xs text-slate-400">Preview placeholder</p></div></div></section>
          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 border-b border-slate-100 pb-4"><SlidersHorizontal className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-semibold">Selected element</h2></div><p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">Placeholder</p><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-slate-400">Position X</p><p className="mt-1 text-sm font-semibold">{Math.round(position.x)}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-slate-400">Position Y</p><p className="mt-1 text-sm font-semibold">{Math.round(position.y)}</p></div></div><button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"><Move className="h-3.5 w-3.5" /> Move placeholder</button><div className="mt-6 border-t border-slate-100 pt-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Preview</p><button type="button" className="mt-3 w-full rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">Desktop</button></div><div className="mt-6 border-t border-slate-100 pt-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</p><div className="mt-3 space-y-2"><button type="button" className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"><Eye className="h-3.5 w-3.5" /> Preview</button><button type="button" className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Save className="h-3.5 w-3.5" /> Save changes</button></div></div></aside>
        </div>
      </main>
    </div>
  );
}