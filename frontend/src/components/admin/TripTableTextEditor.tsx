import {useEffect,useLayoutEffect,useRef,useState,type ChangeEvent,type FocusEvent,type KeyboardEvent as ReactKeyboardEvent} from "react";
import {useLiveCellEditor} from "./useLiveCellEditor";
import {tripTableEditorKey} from "./TripTableShared";

export function TripTableTextEditor({
  value, type = "text", multiline = false, label, disabled, className, placeholder, maxLength, step,
  commitOnBlur = true, onChange, onCommit, onCancel, onNavigate, saveState, buffered = false,
}: {
  value: string;
  type?: "text" | "number" | "date" | "time" | "datetime-local";
  multiline?: boolean;
  label: string;
  disabled?: boolean;
  className: string;
  placeholder?: string;
  maxLength?: number;
  step?: number | "any";
  commitOnBlur?: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => boolean | void | Promise<boolean | void>;
  onCancel: () => void;
  onNavigate?: (backward:boolean)=>void;
  saveState?: string;
  buffered?: boolean;
}) {
  // Optional local buffer keeps large report owners out of the typing path.
  // Parent-driven edits (mentions, canonical saves) still replace the base.
  const [draft,setDraft]=useState({base:value,text:value});
  if(draft.base!==value)setDraft({base:value,text:value});
  const displayed=buffered&&draft.base===value?draft.text:value;
  const live=useLiveCellEditor(displayed,saveState);
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const element = editorRef.current;
    if (!(element instanceof HTMLTextAreaElement)) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(20, element.scrollHeight)}px`;
  });
  useEffect(()=>{
    const element=editorRef.current;if(type!=="number"||!element)return;
    const preventStep=(event:Event)=>{if(document.activeElement===element)event.preventDefault();};
    element.addEventListener("wheel",preventStep,{passive:false});return()=>element.removeEventListener("wheel",preventStep);
  },[type]);
  const skipBlurCommit = useRef(false);
  const keyHandlers = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => tripTableEditorKey(event,
    ()=>{const tab=event.key==="Tab",backward=event.shiftKey;if(tab){skipBlurCommit.current=true;if(onNavigate)event.preventDefault();}live.commit(async()=>{const saved=await onCommit(displayed);if(tab&&saved!==false)onNavigate?.(backward);return saved;});},
    ()=>{skipBlurCommit.current=true;live.cancel();onCancel();},multiline);
  const common = {
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => { editorRef.current = element; },
    autoFocus: true,
    "aria-label": label,
    disabled,
    value:displayed,
    placeholder,
    maxLength,
    ...(!multiline && type === "number" ? { step } : {}),
    onFocus: live.focus,

    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { const next=event.target.value; if(buffered)setDraft({base:value,text:next}); live.change(next); onChange(next); },
    onBlur: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Formula editing is a focus handoff, not a formatting click or a source save.
      if ((event.relatedTarget as Element | null)?.closest("[data-formula-bar],[data-spreadsheet-context-menu]")) return;
      if ((event.relatedTarget as Element | null)?.closest("[data-spreadsheet-formatting]")) {
        requestAnimationFrame(() => editorRef.current?.focus());
        return;
      }
      live.blur();
      if (skipBlurCommit.current) { skipBlurCommit.current = false; return; }
      if (commitOnBlur) live.commit(async()=>onCommit(displayed));
    },
    onKeyDown: keyHandlers,
    className: `spreadsheet-cell-editor ${className}`,
  };
  return multiline ? <textarea {...common} rows={1} /> : <input {...common} type={type} />;
}
