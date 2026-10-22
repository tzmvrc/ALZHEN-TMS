import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import RelationshipCreateDialog, {creatableRelationship, normalizeRelationship} from "./RelationshipCreateDialog";
import { createPortal } from "react-dom";
import { Check, Plus } from "lucide-react";
import {
  searchRelationshipOptions,
  getCachedRelationshipOptions,
  type RelationshipKind,
  type RelationshipOption,
} from "../../services/lookup.service";

type SearchableRelationshipEditorProps = {
  optionLoader?:(query:string)=>Promise<RelationshipOption[]>;
  token: string;
  kind: RelationshipKind;
  value: string;
  storeId?: string;
  disabled?: boolean;
  unavailableIds?: readonly string[];
  autoFocus?: boolean;
  customerId?: string;
  createDefaults?:Record<string,string>;
  presentation?: "table" | "form";
  onSelect: (option: RelationshipOption) => void;
  onCommitSelection?: (option: RelationshipOption) => void;
  onCommitBlur: () => void;
  onCancel: () => void;
};

export default function SearchableRelationshipEditor({
  optionLoader,
  token,
  kind,
  value,
  storeId,
  disabled = false,
  unavailableIds,
  autoFocus = true,
  customerId,
  createDefaults,
  presentation = "table",
  onSelect,
  onCommitSelection,
  onCommitBlur,
  onCancel,
}: SearchableRelationshipEditorProps) {
  const {profile}=useAuth();
  const [creating,setCreating]=useState(false);
  const createRef=useRef(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<RelationshipOption[]>(()=>optionLoader?[]:getCachedRelationshipOptions(token,kind,"",{storeId,customerId})??[]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, width: 240, zIndex:100 });

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const cached=optionLoader?null:getCachedRelationshipOptions(token,kind,query,{storeId,customerId});
    if(cached){setOptions(cached);setLoading(false);}
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void (optionLoader?optionLoader(query):searchRelationshipOptions(token, kind, query, {
        storeId,
        customerId,
      }))
        .then((result) => {
          if (!active) return;
          setOptions(result);
          const selectedIndex = result.findIndex((option) => option.label === value || option.secondary === value || Object.values(option.values ?? {}).includes(value));
          setActiveIndex(Math.max(selectedIndex, 0));
        })
        .catch((cause) => {
          if (!active) return;
          setOptions([]);
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load matching records.",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, cached?0:query.trim()?100:0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [customerId, isOpen, kind, query, storeId, token, value,optionLoader]);

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      let layer=90;for(let ancestor:HTMLElement|null=inputRef.current;ancestor;ancestor=ancestor.parentElement){const z=Number.parseInt(getComputedStyle(ancestor).zIndex,10);if(Number.isFinite(z))layer=Math.max(layer,z);}
      const width = Math.min(Math.max(rect.width, 220), Math.max(0, window.innerWidth - 16));
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 220)),
        width,zIndex:layer+10,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  function selectOption(option: RelationshipOption | undefined, commit = false) {
    if (disabled) return;
    if (option && unavailableIds?.includes(option.id)) return;
    if (!option) return;
    setIsOpen(false);
    setQuery("");
    onSelect(option);
    if (commit) onCommitSelection?.(option);
  }

  const identityFields=kind==="warehouses"?["warehouse_code","warehouse_name"]:kind==="stores"?["store_code","store_name","ship_to"]:kind==="customers"?["customer_code","customer_name"]:["sku","model_code","product_name"];
  const canCreate=!optionLoader&&creatableRelationship(kind)&&["ADMIN","STAFF"].includes(profile?.role??"")&&Boolean(query.trim())&&!loading&&!error&&!options.some(option=>[option.id,option.label,...identityFields.map(field=>option.values?.[field]??"")].some(value=>normalizeRelationship(value)===normalizeRelationship(query)));
  const beginCreate=()=>{createRef.current=true;setCreating(true);};
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, options.length - 1 + Number(canCreate))));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if(isOpen&&canCreate&&activeIndex===options.length){beginCreate();}
      else if (isOpen && options.length > 0) {
        selectOption(options[activeIndex] ?? options[0], true);
      } else {
        onCommitBlur();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setQuery("");
      onCancel();
    }
  }

  const isCurrent=(option:RelationshipOption)=>Boolean(value)&&(option.label===value||option.secondary===value||Object.values(option.values??{}).includes(value));
  const popover = isOpen ? (
    <div
      id={listId}
      role="listbox"
      aria-label="Matching records"
      className="fixed z-[100] max-h-56 overflow-y-auto rounded-xl border border-amber-200 bg-white py-1 shadow-xl"
      style={position}>
      {value && <p className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500">Current: <span className="font-semibold text-slate-700">{value}</span></p>}
      {loading && !options.length ? (
        <p className="px-3 py-2 text-xs text-slate-500">Searching...</p>
      ) : error ? (
        <p role="alert" className="px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : options.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">No matching records</p>
      ) : (
        options.map((option, index) => (
          <button
            key={option.id}
            id={`${listId}-${index}`}
            type="button"
            role="option"
            aria-selected={isCurrent(option)}
            disabled={unavailableIds?.includes(option.id)}
            aria-disabled={unavailableIds?.includes(option.id)}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectOption(option)}
            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${index === activeIndex ? "bg-amber-50" : "hover:bg-amber-50/60"}`}>
            <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-slate-800">
              {option.label}{unavailableIds?.includes(option.id) && " (already selected)"}
            </span>
            {option.secondary && (
              <span className="block truncate text-[10px] text-slate-500">
                {option.secondary}
              </span>
            )}
            </span>
            {isCurrent(option) && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700" />}
          </button>
        ))
      )}
      {canCreate&&<button id={`${listId}-${options.length}`} type="button" role="option" aria-selected={activeIndex===options.length} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActiveIndex(options.length)} onClick={beginCreate} className="flex w-full items-center gap-1 border-t px-3 py-2 text-left text-xs text-blue-700"><Plus className="h-3 w-3"/>Add "{query.trim()}"</button>}
    </div>
  ) : null;

  return (
    <>
      <div className="spreadsheet-relationship-editor relative block min-w-0 w-full max-w-full">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={`Search ${kind}`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={isOpen && (options.length||canCreate) ? `${listId}-${activeIndex}` : undefined}
        value={isOpen?query:value}
        placeholder={value || (presentation === "form" ? `Search ${kind === "stores" ? "store or destination" : kind === "products" ? "product code or model" : kind.replaceAll("-", " ")}` : "Search records")}
        onFocus={() => {
          if (!disabled) {
            // Keep the saved value in the real input value while editing. The
            // previous placeholder-only treatment looked like existing data
            // but left the editor empty, so typing replaced an invisible value.
            setQuery("");
            const cached=optionLoader?null:getCachedRelationshipOptions(token,kind,"",{storeId,customerId});if(cached)setOptions(cached);
            setIsOpen(true);
          }
        }}
        onChange={(event) => {
          const next=event.target.value;setQuery(next);setActiveIndex(0);
          const cached=optionLoader?null:getCachedRelationshipOptions(token,kind,next,{storeId,customerId});const base=cached??(optionLoader?null:getCachedRelationshipOptions(token,kind,"",{storeId,customerId}));if(base)setOptions(cached??base.filter(option=>`${option.label} ${option.secondary??""}`.toLocaleLowerCase().includes(next.trim().toLocaleLowerCase())));
          setIsOpen(true);
        }}
        onBlur={(event) => {
          if(createRef.current||(event.relatedTarget as Element|null)?.closest("[data-relationship-create]"))return;
          if ((event.relatedTarget as Element | null)?.closest("[data-spreadsheet-formatting]")) { requestAnimationFrame(() => inputRef.current?.focus()); return; }
          setIsOpen(false);
          setQuery("");
          onCommitBlur();
        }}
        onKeyDown={handleKeyDown}
        className={presentation === "form" ? "w-full min-w-0 max-w-full border-0 bg-transparent text-sm text-slate-800 shadow-none outline-none placeholder:text-slate-400 disabled:opacity-60" : "spreadsheet-cell-editor w-full min-w-0 max-w-full rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium text-slate-800 shadow-sm outline-none transition hover:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-wait disabled:opacity-60"}
      />

      </div>
      {popover && !creating && createPortal(popover, document.body)}
      {creating&&creatableRelationship(kind)&&<RelationshipCreateDialog token={token} kind={kind} initialValue={query.trim()} customerId={customerId} defaults={createDefaults} zIndex={position.zIndex+20} onCancel={()=>{setCreating(false);createRef.current=false;inputRef.current?.focus();}} onCreated={option=>{setCreating(false);createRef.current=false;setOptions(current=>[option,...current.filter(row=>row.id!==option.id)]);selectOption(option,true);}}/>}
    </>
  );
}
