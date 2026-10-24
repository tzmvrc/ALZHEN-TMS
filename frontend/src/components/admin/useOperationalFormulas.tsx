import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type MouseEvent,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent,type ClipboardEvent as ReactClipboardEvent,type ReactNode,type RefObject } from "react";
import { SpreadsheetFormulaBar } from "./SpreadsheetFormulaBar";
import { bindFormula,shiftBoundFormula,addressParts,createFormulaEvaluator,FormulaError,formulaDraftReferenceAddresses,type CellFormula } from "../../services/spreadsheet-formula";
import { invalidateOperationalFormulaReads, readOperationalFormulas,saveOperationalFormulas,type FormulaSnapshot } from "../../services/operational-formula.service";
import { subscribeToAdminRealtime } from "../../services/realtime.service";
import { useSpreadsheetFeedback } from "./SpreadsheetPresentation";
type Row=Record<string,any>;type Column={key:string;title?:string;type?:string};
export type FormulaSourceEditor={value:string;writable:boolean;allowExpression?:boolean;reason?:string;save:(value:string)=>Promise<boolean>;cancel?:()=>void};
const cellKey=(row:string,column:string)=>`${row}\0${column}`;
const EMPTY_FORMULAS:FormulaSnapshot={formulas:[],sources:[]};
const NO_VIRTUAL_ROWS:Array<{id:string}>=[];
const text=(value:unknown)=>value===null||value===undefined?"":typeof value==="object"?JSON.stringify(value):String(value);
/** Expressions use separate overlays; ordinary values use the view's existing source editor. */
export function useOperationalFormulas<R extends Row>({token,table,rows,columns,identity,canEdit,paused=false,rowOffset=0,enabled=true,viewport,sourceEditor,virtualRows=NO_VIRTUAL_ROWS,onSelect}:{token:string|null;table:string;rows:R[];columns:Column[];identity:(row:R)=>string|null;canEdit:boolean;paused?:boolean;rowOffset?:number;enabled?:boolean;viewport?:RefObject<HTMLDivElement|null>;sourceEditor?:(row:R,column:string)=>FormulaSourceEditor|undefined;virtualRows?:Array<{id:string}>;onSelect?:(row:string,column:string,extend:boolean)=>void}) {
 const owner=`${token??""}:${table}:${enabled?"view":"disabled"}`;
 const rowIds=useMemo(()=>rows.flatMap(row=>{const id=identity(row);return id?[id]:[];}),[rows,identity]);
 const [visibleFormulaRows,setVisibleFormulaRows]=useState<{owner:string;ids:string[]}>({owner:"",ids:[]});
 const signature=useMemo(()=>[...new Set((viewport&&visibleFormulaRows.owner===owner?visibleFormulaRows.ids:viewport?rowIds.slice(0,80):rowIds))].sort().join("|"),[viewport,visibleFormulaRows,owner,rowIds]);
 useLayoutEffect(()=>{const element=viewport?.current;if(!element)return;let frame=0;
   const check=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const ids=[...new Set([...element.querySelectorAll<HTMLElement>("td[data-formula-row]")].map(cell=>cell.dataset.formulaRow!).filter(Boolean))].sort();if(!ids.length)return;setVisibleFormulaRows(current=>current.owner===owner&&current.ids.join("|")===ids.join("|")?current:{owner,ids});});};
   const observer=new MutationObserver(check);observer.observe(element,{childList:true,subtree:true});element.addEventListener("scroll",check,{passive:true});check();return()=>{cancelAnimationFrame(frame);observer.disconnect();element.removeEventListener("scroll",check);};
 },[viewport,owner,rowIds]);
 const allRowIds=useMemo(()=>[...rowIds,...virtualRows.map(row=>row.id)],[rowIds,virtualRows]);
 const rowIndex=useMemo(()=>new Map(allRowIds.map((id,index)=>[id,index])),[allRowIds]);
 const rowById=useMemo(()=>new Map(rows.flatMap(row=>{const id=identity(row);return id?[[id,row] as const]:[];})),[rows,identity]);
 const rowCounts=useMemo(()=>{const counts=new Map<string,number>();for(const id of rowIds)counts.set(id,(counts.get(id)??0)+1);return counts;},[rowIds]);
 const columnIndex=useMemo(()=>new Map(columns.map((column,index)=>[column.key,index])),[columns]);
 const [state,setState]=useState<{owner:string;snapshot:FormulaSnapshot}>({owner:"",snapshot:{formulas:[],sources:[]}}),[selection,setSelection]=useState<{owner:string;row:string;column:string}|null>(null),[draft,setDraft]=useState<{owner:string;key:string;value:string}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[range,setRange]=useState<{column:string;from:number;to:number}|null>(null);
 const [inlineKey,setInlineKey]=useState<string|null>(null);
 const focusIntent=useRef<{row:string;column:string;extend:boolean}|null>(null);
 const activeInput=useRef<HTMLInputElement|null>(null);
 const inlineFocus=useRef(true);
 const sourceSession=useRef<{key:string;editor:FormulaSourceEditor}|null>(null);
 const input=useRef<HTMLInputElement|null>(null),composing=useRef(false),cancelled=useRef(false),picked=useRef<Record<string,{rowId:string;columnId:string}>>({}),lock=useRef(false),generation=useRef(0),cleanupFill=useRef<(()=>void)|null>(null);
 const liveOwner=useRef(owner);liveOwner.current=owner;
 const snapshot=state.owner===owner?state.snapshot:EMPTY_FORMULAS,selected=selection?.owner===owner&&(draft?.owner===owner||rowIndex.has(selection.row))?selection:null;
 const chooseCell=(row:string,column:string,extend=false)=>{if(selection?.row!==row||selection.column!==column)inlineFocus.current=true;focusIntent.current={row,column,extend};setSelection(current=>current?.owner===owner&&current.row===row&&current.column===column?current:{owner,row,column});if(extend||selection?.owner!==owner||selection.row!==row||selection.column!==column)onSelect?.(row,column,extend);};
 const selectedKey=selected?cellKey(selected.row,selected.column):"",dirty=draft?.owner===owner&&draft.key===selectedKey;
 const draftPending=Boolean(draft?.owner===owner),pausedRef=useRef(false),pendingRefresh=useRef(false);pausedRef.current=paused||draftPending||busy||Boolean(range);
 const refresh=useCallback(async()=>{if(!enabled||!token||!signature)return;const request=++generation.current;const result=await readOperationalFormulas(token,table,signature.split("|"));if(request===generation.current){setState({owner,snapshot:result});setError("");}},[token,table,signature,owner,enabled]);
 const refreshRef=useRef(refresh);refreshRef.current=refresh;
 useEffect(()=>{void refresh().catch(()=>setError("Unable to load calculated cells. Formula editing is unavailable until refreshed."));return()=>{generation.current++;};},[refresh]);
 useEffect(()=>{if(!enabled)return;let timer:ReturnType<typeof setTimeout>|undefined;const stop=subscribeToAdminRealtime(event=>{const changed=event.kind==="batch"?event.tables:event.kind==="change"?[event.payload.table]:null;if(changed&&!changed.some(table=>["trip_cargo_allocations","trip_assignment_stops","spreadsheet_cell_formulas","trips","trip_stops","trip_line_items","trip_truck_assignments","store_calls","pod_records","flex_cells","offloads","backloads","loading_reports","unloading_reports","incidents","demurrages"].includes(table)))return;if(timer)return;timer=setTimeout(()=>{timer=undefined;invalidateOperationalFormulaReads(table);if(pausedRef.current){pendingRefresh.current=true;return;}void refreshRef.current().catch(()=>setError("Unable to refresh calculated cells."));},160);});return()=>{clearTimeout(timer);stop();};},[owner,enabled]);
 useEffect(()=>{if(!pausedRef.current&&pendingRefresh.current){pendingRefresh.current=false;void refresh().catch(()=>setError("Unable to refresh calculated cells."));}},[paused,draftPending,busy,range,refresh]);
 useEffect(()=>()=>{cleanupFill.current?.();composing.current=false;if(liveOwner.current!==owner){picked.current={};sourceSession.current=null;activeInput.current=null;}},[owner]);
 const bindingRows=useMemo(()=>{const axis:Array<{id:string}>=[];axis.length=rowOffset;for(const row of rows)axis.push({id:identity(row)??""});return axis;},[rows,identity,rowOffset]);
 const overlays=useMemo(()=>new Map(snapshot.formulas.map(formula=>[cellKey(formula.row_identity,formula.column_key),formula])),[snapshot.formulas]);
 const source=useMemo(()=>{const map=new Map(snapshot.sources.map(row=>[row.id,row.values]));for(const row of rows){const id=identity(row);if(id)map.set(id,row);}return map;},[snapshot.sources,rows,identity]);
 const evaluationColumns=useMemo(()=>[...new Set([...columns.map(column=>column.key),...snapshot.sources.flatMap(row=>Object.keys(row.values))])].map(key=>({key})),[columns,snapshot.sources]);
 const evaluator=useMemo(()=>{
  const neededRows=new Set<string>(),neededColumns=new Set<string>();
  for(const formula of snapshot.formulas){if(formula.is_deleted)continue;neededRows.add(formula.row_identity);neededColumns.add(formula.column_key);for(const reference of Object.values(formula.reference_bindings)){neededRows.add(reference.rowId);neededColumns.add(reference.columnId);}}
  const relevantColumns=evaluationColumns.filter(column=>neededColumns.has(column.key));
  return createFormulaEvaluator([...source].filter(([id])=>neededRows.has(id)).map(([id,values])=>({id,cells:relevantColumns.map(column=>{const formula=overlays.get(cellKey(id,column.key));return {column_id:column.key,value:values[column.key]??null,formula:formula&&!formula.is_deleted?{expression:formula.formula_expression!,references:formula.reference_bindings}:null};})})),relevantColumns.map(column=>({id:column.key})));
 },[source,overlays,evaluationColumns,snapshot.formulas]);
 const chosen=selected?overlays.get(selectedKey):undefined,active=chosen&&!chosen.is_deleted?chosen:null;
 const selectedRow=selected?rowById.get(selected.row):undefined;
 const editor=selectedRow&&selected?sourceEditor?.(selectedRow,selected.column):undefined;
 const value=dirty?draft!.value:active?.formula_expression??(editor?.value??(selected?text(source.get(selected.row)?.[selected.column]):""));
 const writable=Boolean(enabled&&token&&canEdit&&selected&&columns.find(column=>column.key===selected.column)?.type!=="action"&&!busy&&(state.owner===owner||editor?.writable)&&source.has(selected.row)&&rowCounts.get(selected.row)===1),readResult=(row:string,column:string)=>{try{return evaluator(row,column);}catch(cause){return cause instanceof FormulaError?cause.code:"#VALUE!";}};
 const merge=(saved:FormulaSnapshot["formulas"])=>setState(current=>{if(current.owner!==owner)return current;const map=new Map(current.snapshot.formulas.map(f=>[cellKey(f.row_identity,f.column_key),f]));for(const f of saved){const key=cellKey(f.row_identity,f.column_key);if((map.get(key)?.version??0)<=f.version)map.set(key,f);}return {...current,snapshot:{...current.snapshot,formulas:[...map.values()]}};});
 const commit=async(remove=false)=>{
  if(!selected||lock.current)return;
  const sameBindings=Object.entries(picked.current).every(([address,reference])=>active?.reference_bindings[address]?.rowId===reference.rowId&&active?.reference_bindings[address]?.columnId===reference.columnId);
  if(!remove&&(!dirty||active&&value===active.formula_expression&&sameBindings)){
   setInlineKey(null);setDraft(null);picked.current={};sourceSession.current=null;composing.current=false;return true;
  }
  if(!writable)return;
  const target={...selected},key=selectedKey;let sourceCommitted=false;
  try{
   if (editor?.allowExpression === false && (remove || value.startsWith("="))) throw new Error("Save the new product row before adding a formula expression. Plain cell values can be edited now.");
   if(!remove&&!value.startsWith("=")){
    const sourceTarget=sourceSession.current?.key===key?sourceSession.current.editor:editor;
    if(!sourceTarget?.writable)throw new Error(sourceTarget?.reason??"This is a calculated-only cell. Enter a formula or remove its overlay; its source value has no authorized editor.");
    if(active&&state.owner!==owner)throw new Error("Load formula metadata before replacing a calculated cell.");
    lock.current=true;setBusy(true);setError("");
    if(!await sourceTarget.save(value)){setError("The cell value was not saved. Review its validation or conflict message.");return;}
    sourceCommitted=true;
    if(active){const saved=await saveOperationalFormulas(token!,table,[{row_identity:target.row,column_key:target.column,expression:null,references:{},expected_version:chosen?.version??0}]);merge(saved);}
   }else{
    if(state.owner!==owner)throw new Error("Formula metadata is unavailable. Refresh formulas before saving an expression.");
    let formula:CellFormula|null=null;
    if(!remove){formula=bindFormula(value,bindingRows,columns.map(c=>({id:c.key})),{...active?.reference_bindings,...picked.current});
     const preview=[...source].map(([id,values])=>({id,cells:evaluationColumns.map(c=>{const f=overlays.get(cellKey(id,c.key));return {column_id:c.key,value:values[c.key]??null,formula:id===target.row&&c.key===target.column?formula:f&&!f.is_deleted?{expression:f.formula_expression!,references:f.reference_bindings}:null};})}));
     createFormulaEvaluator(preview,evaluationColumns.map(c=>({id:c.key})))(target.row,target.column);
    }
    lock.current=true;setBusy(true);setError("");
    const saved=await saveOperationalFormulas(token!,table,[{row_identity:target.row,column_key:target.column,expression:formula?.expression??null,references:formula?.references??{},expected_version:chosen?.version??0}]);merge(saved);
    // End the source editor without submitting a calculated result to it.
    editor?.cancel?.();
   }
   setInlineKey(null);setDraft(current=>current?.owner===owner&&current.key===key?null:current);picked.current={};sourceSession.current=null;composing.current=false;pendingRefresh.current=true;return true;
  }catch(cause){setError(sourceCommitted?"The source value was saved, but its formula overlay could not be removed. Refresh and review before retrying.":cause instanceof FormulaError?`Invalid formula: ${cause.code}`:cause instanceof Error?cause.message:"Unable to save the cell.");pendingRefresh.current=true;}
  finally{lock.current=false;setBusy(false);}
 };

 const startFill=(event:ReactPointerEvent,rowId:string,column:string)=>{const origin=overlays.get(cellKey(rowId,column));if(event.button!==0||!origin||origin.is_deleted||!token||!canEdit||lock.current||paused)return;event.preventDefault();event.stopPropagation();cleanupFill.current?.();const from=rowIds.indexOf(rowId);let to=from;setRange({column,from,to});const move=(event:PointerEvent)=>{const el=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("td[data-formula-row]");if(el?.dataset.formulaColumn!==column)return;const index=rowIds.indexOf(el.dataset.formulaRow??"");if(index>=0){to=index;setRange({column,from,to});}};const cleanup=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",finish);window.removeEventListener("pointercancel",cancel);window.removeEventListener("keydown",escape);cleanupFill.current=null;setRange(null);};const cancel=()=>cleanup();const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")cancel();};const finish=()=>{cleanup();const targets=rowIds.slice(Math.min(from,to),Math.max(from,to)+1).filter(id=>id!==rowId);if(!targets.length)return;if(targets.length>50){setError("Fill at most 50 formula cells per batch.");return;}const axes=columns.map(c=>({id:c.key}));for(const [address,ref] of Object.entries(origin.reference_bindings))axes[addressParts(address).column]={id:ref.columnId};try{const changes=targets.map(id=>{const formula=shiftBoundFormula({expression:origin.formula_expression!,references:origin.reference_bindings},(rowIndex.get(id)??-1)-from,bindingRows,axes);return {row_identity:id,column_key:column,expression:formula.expression,references:formula.references,expected_version:overlays.get(cellKey(id,column))?.version??0};});lock.current=true;setBusy(true);void saveOperationalFormulas(token,table,changes).then(merge).catch(cause=>{setError(cause instanceof Error?cause.message:"The formula batch was not confirmed. Refresh before retrying.");pendingRefresh.current=true;}).finally(()=>{lock.current=false;setBusy(false);});}catch(cause){setError(cause instanceof Error?cause.message:"Invalid fill references.");}};cleanupFill.current=cleanup;window.addEventListener("pointermove",move);window.addEventListener("pointerup",finish);window.addEventListener("pointercancel",cancel);window.addEventListener("keydown",escape);};
 const cancelEdit=()=>{cancelled.current=true;composing.current=false;setDraft(null);setInlineKey(null);picked.current={};sourceSession.current?.editor.cancel?.();sourceSession.current=null;};
 const openInline=(row:R,column:string,initial?:string)=>{
  const id=identity(row);if(!id||!enabled||!canEdit||columns.find(item=>item.key===column)?.type==="action"||busy||rowIds.filter(item=>item===id).length!==1)return;
  const key=cellKey(id,column),existing=overlays.get(key),adapter=sourceEditor?.(row,column);
  if(state.owner!==owner&&!adapter?.writable)return;
  if(dirty&&key!==selectedKey)return;
  sourceSession.current=adapter?{key,editor:adapter}:null;
  adapter?.cancel?.();
  chooseCell(id,column);inlineFocus.current=true;setInlineKey(key);cancelled.current=false;composing.current=initial!==undefined;
  setDraft({owner,key,value:initial??(existing&&!existing.is_deleted?existing.formula_expression??"":adapter?.value??text(row[column]))});
 };
 const navigateCell=(row:string,column:string,key:string,shift=false)=>{
  let r=(rowIndex.get(row)??-1),c=(columnIndex.get(column)??-1);
  if(key==="ArrowLeft")c--;if(key==="ArrowRight")c++;if(key==="ArrowUp")r--;if(key==="ArrowDown"||key==="Enter")r++;
  if(key==="Tab"){c+=shift?-1:1;if(c>=columns.length){c=0;r++;}if(c<0){c=columns.length-1;r--;}}
  const nextRow=allRowIds[r],nextColumn=columns[c]?.key;if(!nextRow||!nextColumn)return;
  chooseCell(nextRow,nextColumn,shift);picked.current={};sourceSession.current=null;
  requestAnimationFrame(()=>{const tableElement=(activeInput.current??input.current)?.closest('[data-spreadsheet-workspace-grid]')??document;
   Array.from(tableElement.querySelectorAll<HTMLElement>('td[data-formula-row]')).find(cell=>cell.dataset.formulaRow===nextRow&&cell.dataset.formulaColumn===nextColumn&&cell.getClientRects().length)?.focus();});
 };
 const referenceKeys=new Set<string>();
 if(dirty&&value.startsWith("=")){try{for(const address of formulaDraftReferenceAddresses(value)){const ref=picked.current[address]??active?.reference_bindings[address]??bindFormula(`=${address}`,bindingRows,columns.map(column=>({id:column.key}))).references[address];if(ref)referenceKeys.add(cellKey(ref.rowId,ref.columnId));}}catch{/* Incomplete expressions remain editable. */}}
 const buildCellProps=(id:string,column:string,row?:R)=>{
  if(!id||!columnIndex.has(column))return {};
  const selectedHere=selected?.row===id&&selected.column===column,index=(rowIndex.get(id)??-1);
  return {tabIndex:selectedHere?0:-1,"data-formula-row":id,"data-formula-column":column,"data-formula-selected":selectedHere?"true":undefined,
   "data-formula-reference":referenceKeys.has(cellKey(id,column))?"true":undefined,
   "data-formula-fill":range?.column===column&&index>=Math.min(range.from,range.to)&&index<=Math.max(range.from,range.to)?"true":undefined,
   onPointerDownCapture:(event:ReactPointerEvent<HTMLElement>)=>{
    if(event.button===0)focusIntent.current={row:id,column,extend:event.shiftKey};
    if(event.button!==0||!composing.current||!value.startsWith("=")||selectedHere||!writable)return;
    if(!row||columns.find(item=>item.key===column)?.type==="action"){event.preventDefault();event.stopPropagation();setError("Invalid formula: #REF!");return;}
    event.preventDefault();event.stopPropagation();const address=`${columnAddress(column)}${rowOffset+index+1}`;
    picked.current[address]={rowId:id,columnId:column};const field=activeInput.current??input.current,at=field?.selectionStart??value.length,end=field?.selectionEnd??at;
    setDraft({owner,key:selectedKey,value:value.slice(0,at)+address+value.slice(end)});
    requestAnimationFrame(()=>{field?.focus();field?.setSelectionRange(at+address.length,at+address.length);});
   },
   onDoubleClickCapture:(event:MouseEvent<HTMLElement>)=>{if(!row||!canEdit||busy||!has(row,column))return;event.preventDefault();event.stopPropagation();openInline(row,column);},
   onKeyDownCapture:(event:ReactKeyboardEvent<HTMLElement>)=>{
    if(event.target instanceof Element&&event.target.closest('[data-formula-inline]'))return;
    const control=event.target instanceof Element?event.target.closest('input,textarea,select,[role="combobox"],button,a'):null;
    const textControl=event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement?event.target:null;
    if(event.key==="="&&textControl&&(textControl.selectionStart??0)>0)return;
    if(row&&event.key==="="&&!event.ctrlKey&&!event.metaKey&&!(control?.matches('select,button,a'))&&!(event.target instanceof Element&&event.target.closest('[role="combobox"],.spreadsheet-dropdown-editor,.spreadsheet-relationship-editor'))&&canEdit){event.preventDefault();event.stopPropagation();openInline(row,column,"=");return;}
    if(control)return;
    if(row&&event.key==="Enter"&&canEdit){event.preventDefault();event.stopPropagation();openInline(row,column);return;}
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Tab"].includes(event.key)){event.preventDefault();event.stopPropagation();navigateCell(id,column,event.key,event.shiftKey);}
   },
   onPasteCapture:(event:ReactClipboardEvent<HTMLElement>)=>{if((event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)&&(event.target.selectionStart??0)>0)return;const pasted=event.clipboardData.getData("text/plain");if(row&&pasted.startsWith("=")&&canEdit&&!(event.target instanceof Element&&event.target.closest('[data-formula-inline],[role="combobox"],.spreadsheet-dropdown-editor,.spreadsheet-relationship-editor'))){event.preventDefault();event.stopPropagation();openInline(row,column,pasted);}},
   onFocusCapture:()=>{if(!composing.current&&!dirty&&!selectedHere){const intent=focusIntent.current;chooseCell(id,column,intent?.row===id&&intent.column===column?intent.extend:false);sourceSession.current=null;picked.current={};}focusIntent.current=null;},
   onClickCapture:(event:MouseEvent<HTMLElement>)=>{
    if(event.target instanceof Element&&event.target.closest('[data-formula-inline]'))return;
    if(composing.current&&value.startsWith("=")&&!selectedHere){event.preventDefault();event.stopPropagation();return;}
    if(event.target instanceof Element&&event.target.closest("[data-formula-fill-handle]"))return;
    if(dirty&&!selectedHere){event.preventDefault();event.stopPropagation();const table=event.currentTarget.closest("table");table?.removeAttribute("data-fast-selection");table?.querySelector("[data-fast-selected]")?.removeAttribute("data-fast-selected");return;}
    chooseCell(id,column,event.shiftKey);if(!selectedHere){picked.current={};sourceSession.current=null;}
    if(row&&has(row,column)){event.preventDefault();event.stopPropagation();}
   }
  };
 };
 const cellProps=(row:R,column:string)=>{const id=identity(row);return id?buildCellProps(id,column,row):{};};
 const virtualCellProps=(id:string,column:string)=>virtualRows.some(row=>row.id===id)?buildCellProps(id,column):{};
 const columnAddress=(column:string)=>{let n=(columnIndex.get(column)??-1)+1,result="";for(;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;};
 const has=(row:R,column:string)=>{const id=identity(row),f=id?overlays.get(cellKey(id,column)):null;return Boolean(f&&!f.is_deleted);};
 const render=(row:R,column:string,original:ReactNode)=>{const id=identity(row);
  if(id&&selectedKey===cellKey(id,column)&&(inlineKey===selectedKey||has(row,column)))return <span className="relative block min-w-0"><input data-formula-inline aria-label={`Edit ${columnAddress(column)}${rowOffset+(rowIndex.get(id)??-1)+1}`} autoFocus={writable&&inlineFocus.current} value={value} readOnly={!writable}
    onFocus={event=>{activeInput.current=event.currentTarget;cancelled.current=false;}} onPointerDown={()=>{if(writable)composing.current=true;}}
    onChange={event=>{composing.current=true;setDraft({owner,key:selectedKey,value:event.target.value});}}
    onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancelEdit();}else if(event.key==="Enter"||event.key==="Tab"){event.preventDefault();event.stopPropagation();const key=event.key,shift=event.shiftKey;void commit().then(saved=>{if(saved)navigateCell(id,column,key,shift);});}}}
    onBlur={event=>{if((event.relatedTarget as Element|null)?.closest('[data-formula-bar],[data-formula-help],[data-spreadsheet-context-menu]'))return;composing.current=false;if(!cancelled.current)void commit().then(saved=>{if(saved)setSelection(current=>current?.owner===owner&&cellKey(current.row,current.column)===selectedKey?null:current);});}}
    className="spreadsheet-cell-editor block w-full min-w-0 border-0 bg-transparent p-0 text-inherit outline-none"/>
    {canEdit&&has(row,column)&&!dirty&&<button type="button" data-formula-fill-handle aria-label="Fill calculated formula down" onPointerDown={event=>startFill(event,id,column)} onClick={event=>event.stopPropagation()} className="absolute bottom-0 right-0 z-40 h-2 w-2 cursor-crosshair border border-white bg-blue-600"/>}
   </span>;
  if(!id||!has(row,column))return original;
  return <span className="block min-w-0">{text(readResult(id,column))}</span>;
 };


 useSpreadsheetFeedback(error,"error");
 const bar=<div className="flex w-full min-w-0 flex-wrap items-center gap-1"><div className="min-w-0 flex-[1_1_12rem]"><SpreadsheetFormulaBar address={selected?`${columnAddress(selected.column)}${rowOffset+(rowIndex.get(selected.row)??-1)+1}`:undefined} inputRef={input} value={value} readOnly={!writable} readOnlyReason={selected&&!rowIds.includes(selected.row)?"This is a visual-only blank cell. Select and format it; values require an existing operational record.":!selected?"Select a data cell first. Ordinary values use its source editor; expressions remain calculated overlays.":busy?"Wait for the formula request to finish.":"Select a supported data cell. Editing requires its existing permissions and mapping."} onFocus={()=>{inlineFocus.current=false;activeInput.current=input.current;cancelled.current=false;composing.current=true;if(selectedRow&&selected&&!dirty){const fresh=sourceEditor?.(selectedRow,selected.column);if(fresh){sourceSession.current={key:selectedKey,editor:fresh};if(!active&&fresh.value!==value)setDraft({owner,key:selectedKey,value:fresh.value});}}}} onChange={value=>{if(selected){inlineFocus.current=false;setInlineKey(selectedKey);composing.current=true;setDraft({owner,key:selectedKey,value});}}} onCommit={()=>void commit()} onCancel={cancelEdit} onBlur={event=>{if((event.relatedTarget as Element|null)?.closest("[data-formula-bar],[data-formula-help],[data-formula-inline],[data-spreadsheet-context-menu]"))return;composing.current=false;if(cancelled.current){cancelled.current=false;return;}void commit().then(saved=>{if(saved)setSelection(current=>current?.owner===owner&&cellKey(current.row,current.column)===selectedKey?null:current);});}}/></div>{active&&<details className="relative shrink-0 text-[10px] text-slate-600"><summary className="cursor-pointer list-none px-1" onMouseDown={event=>event.preventDefault()}>Source</summary><div className="absolute right-0 top-full z-[130] mt-1 max-h-40 w-56 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 shadow-lg">{selected?text(source.get(selected.row)?.[selected.column]):""}</div></details>}{active&&<button type="button" disabled={!writable} onMouseDown={event=>event.preventDefault()} onClick={()=>void commit(true)} className="shrink-0 rounded px-1 text-[10px] text-blue-700 disabled:opacity-40" title={`Original source: ${text(source.get(active.row_identity)?.[active.column_key])}`}>Remove formula</button>}{error&&<button type="button" disabled={busy} onMouseDown={event=>event.preventDefault()} onClick={()=>{void refresh().then(()=>setError("")).catch(()=>setError("Unable to refresh calculated cells."));}} className="shrink-0 px-1 text-[10px] text-blue-700">Refresh formulas</button>}</div>;
 return {commitDraft:commit,cancelDraft:cancelEdit,bar,cellProps,virtualCellProps,selectedIdentity:selected?.row??null,selectCell:(row:string,column:string,extend=false)=>{if(!dirty&&!composing.current)chooseCell(row,column,extend);},render,has,busy,draftPending,refresh,notifySourceDraft:()=>{
  // Mirror the source editor's existing local buffer without rerendering the whole grid per key.
  if(!dirty&&!active&&selectedRow&&selected&&input.current&&document.activeElement!==input.current)
   input.current.value=sourceEditor?.(selectedRow,selected.column)?.value??value;
 }};
}
