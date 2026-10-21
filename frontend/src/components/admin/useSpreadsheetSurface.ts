import { useLayoutEffect, useRef } from "react";
import type { ColumnDesign } from "../../services/shared-table-design";

/** DOM-only viewport work: scrolling never updates React cell/editor state. */
export function useSpreadsheetSurface(scope: string, columns: Record<string, ColumnDesign>) {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const design = useRef(columns); design.current = columns;
  const layout = JSON.stringify(Object.entries(columns).map(([key,value])=>[key,value.pin,value.position,value.hidden,value.header?.fontSize,value.format?.fontSize]));
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const viewport = table.parentElement;
    if (!viewport) return;
    const sheet = document.createElement("style");
    const id = `surface-${++surfaceId}`;
    table.dataset.spreadsheetSurface = id; document.head.appendChild(sheet);
    let frame = 0, lastRules = "";
    const measure = () => {
      if (!viewport.clientWidth || !table.getClientRects().length) return;
      const heads = Array.from(table.tHead?.rows[0]?.cells ?? []);
      // Read geometry once, before writing styles. Repeated read/write interleaving
      // forced synchronous layout for every pinned header after an editor mounted.
      const widths = heads.map(head => head.getBoundingClientRect().width);
      const viewportWidth = viewport.clientWidth;
      const tableLeft = table.getBoundingClientRect().left - viewport.getBoundingClientRect().left;
      const gutter = widths[0] ?? 32;
      let left = gutter, right = 0, natural = 0;
      const rules: string[] = [];
      const prefix = `table[data-spreadsheet-surface="${id}"]`;
      const entries=heads.map((head,index)=>{const start=natural;natural+=widths[index];return {head,index,start};});
      const lastData=entries.filter(entry=>entry.head.dataset.spreadsheetColumn).at(-1)?.index??heads.length-1;
      right=widths.slice(lastData+1).reduce((sum,width)=>sum+width,0);
      const active=new Map<number,{side:"left"|"right";offset:number}>();
      const naturalLeft=(start:number)=>tableLeft+start;
      for(const {head,index,start} of entries){if(!design.current[head.dataset.spreadsheetColumn??""]?.pin)continue;
        if(naturalLeft(start)<left&&left+right+widths[index]<viewportWidth-40){active.set(index,{side:"left",offset:left});left+=widths[index];}}
      for(const {head,index,start} of [...entries].reverse()){if(!design.current[head.dataset.spreadsheetColumn??""]?.pin||active.has(index))continue;
        if(naturalLeft(start)+widths[index]>viewportWidth-right&&left+right+widths[index]<viewportWidth-40){active.set(index,{side:"right",offset:right});right+=widths[index];}}
      for(const {head,index} of entries){
        const key=head.dataset.spreadsheetColumn;if(!key)continue;
        const title=head.querySelector<HTMLElement>("[data-spreadsheet-header-title]");
        if(title){const configured=design.current[key]?.header?.fontSize??design.current[key]?.format?.fontSize??12;
          // Width changes wrap the title; only an explicit shared font setting changes its size.
          const size=configured;
          const fontSize=`${size}px`, label=title.textContent?.trim()??key;
          if(title.style.fontSize!==fontSize)title.style.fontSize=fontSize;
          if(title.title!==label)title.title=label;}
        if(!design.current[key]?.pin)continue;
        const cell=`${prefix} tr > :nth-child(${index+1})`,pin=active.get(index);
        if(pin)rules.push(`${cell}{position:sticky!important;left:${pin.side==="left"?pin.offset+"px":"auto"}!important;right:${pin.side==="right"?pin.offset+"px":"auto"}!important;z-index:35}${prefix} thead tr > :nth-child(${index+1}){z-index:75}`);
        else rules.push(`${cell}{position:relative!important;left:auto!important;right:auto!important}${prefix} thead tr > :nth-child(${index+1}){position:sticky!important}`);
      }
      const css = rules.join("\n");
      if (css !== lastRules) { sheet.textContent = css; lastRules = css; }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); }); };
    const observer = new ResizeObserver(schedule); observer.observe(table); observer.observe(viewport);
    const mutations = new MutationObserver(schedule); mutations.observe(table, {childList:true,subtree:true});
    viewport.addEventListener("scroll", schedule, {passive:true}); window.addEventListener("resize", schedule);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); viewport.removeEventListener("scroll",schedule); window.removeEventListener("resize",schedule); sheet.remove(); delete table.dataset.spreadsheetSurface; };
  }, [scope, layout]);
  return tableRef;
}
let surfaceId = 0;
