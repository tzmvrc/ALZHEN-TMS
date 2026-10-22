import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';

export default function HiddenColumnsControl({ columns, onRestore, onRestoreAll, portalMenu=false }: { columns: readonly { key: string; title: string }[]; onRestore: (key: string) => void; onRestoreAll: () => void; portalMenu?:boolean }) {
  const anchor=useRef<HTMLDetailsElement>(null),menu=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false),[position,setPosition]=useState<CSSProperties>({});
  useEffect(()=>{if(!columns.length)setOpen(false);},[columns.length]);
  useEffect(()=>{
    if(!portalMenu||!open)return;
    const place=()=>{const rect=anchor.current?.getBoundingClientRect();if(rect)setPosition({position:'fixed',left:Math.max(8,Math.min(rect.left,window.innerWidth-240)),bottom:window.innerHeight-rect.top+4,maxHeight:Math.min(256,Math.max(40,rect.top-12)),width:232});};
    const close=(event:Event)=>{if(event instanceof KeyboardEvent&&event.key!=='Escape')return;const target=event.target as Node;if(anchor.current?.contains(target)||menu.current?.contains(target))return;if(anchor.current)anchor.current.open=false;};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);window.addEventListener('pointerdown',close);window.addEventListener('keydown',close);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',close);};
  },[portalMenu,open]);
  if (!columns.length) return null;
  const dropdown=<div ref={menu} role="menu" aria-label="Hidden columns" style={portalMenu?position:undefined} className="absolute bottom-full left-0 z-[100] mb-1 max-h-64 min-w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-xs text-slate-600 shadow-lg">
      <button type="button" className="w-full rounded px-3 py-2 text-left font-semibold hover:bg-blue-50" onClick={onRestoreAll}>Restore all</button>
      {columns.map((column) => <button type="button" key={column.key} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50" onClick={() => onRestore(column.key)}>Restore {column.title}</button>)}
    </div>;
  return <details ref={anchor} onToggle={event=>setOpen(event.currentTarget.open)} className="relative inline-block w-fit shrink-0 text-xs text-slate-600">
    <summary className="cursor-pointer whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Hidden columns ({columns.length})</summary>
    {portalMenu?(open?createPortal(dropdown,document.body):null):dropdown}
  </details>;
}
