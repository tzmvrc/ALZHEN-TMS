import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import {
  searchRelationshipOptions,
  type RelationshipKind,
  type RelationshipOption,
} from "../../services/lookup.service";

type SearchableRelationshipEditorProps = {
  token: string;
  kind: RelationshipKind;
  value: string;
  storeId?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  customerId?: string;
  onSelect: (option: RelationshipOption) => void;
  onCommitSelection?: (option: RelationshipOption) => void;
  onCommitBlur: () => void;
  onCancel: () => void;
};

export default function SearchableRelationshipEditor({
  token,
  kind,
  value,
  storeId,
  disabled = false,
  autoFocus = true,
  customerId,
  onSelect,
  onCommitSelection,
  onCommitBlur,
  onCancel,
}: SearchableRelationshipEditorProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<RelationshipOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, width: 240 });

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void searchRelationshipOptions(token, kind, query, {
        storeId,
        customerId,
      })
        .then((result) => {
          if (!active) return;
          setOptions(result);
          const selectedIndex = result.findIndex((option) => option.label === value);
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
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [customerId, isOpen, kind, query, storeId, token, value]);

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.max(
          8,
          Math.min(rect.left, window.innerWidth - rect.width - 8),
        ),
        top: Math.min(rect.bottom + 4, window.innerHeight - 220),
        width: Math.max(rect.width, 220),
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
    if (!option) return;
    setIsOpen(false);
    setQuery("");
    onSelect(option);
    if (commit) onCommitSelection?.(option);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, options.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (isOpen && options.length > 0) {
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

  const popover = isOpen ? (
    <div
      id={listId}
      role="listbox"
      aria-label="Matching records"
      className="fixed z-[100] max-h-56 overflow-y-auto rounded-xl border border-amber-200 bg-white py-1 shadow-xl"
      style={position}>
      {value && <p className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500">Current: <span className="font-semibold text-slate-700">{value}</span></p>}
      {loading ? (
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
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectOption(option)}
            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${index === activeIndex ? "bg-amber-50" : "hover:bg-amber-50/60"}`}>
            <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">
              {option.label}
            </span>
            {option.secondary && (
              <span className="block truncate text-[10px] text-slate-500">
                {option.secondary}
              </span>
            )}
            </span>
            {option.label === value && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700" />}
          </button>
        ))
      )}
    </div>
  ) : null;

  return (
    <>
      <div className="relative inline-flex max-w-full">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={isOpen && options.length ? `${listId}-${activeIndex}` : undefined}
        value={query}
        placeholder={value ? `Current: ${value}` : "Search records"}
        onFocus={() => {
          if (!disabled) {
            setQuery("");
            setIsOpen(true);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onBlur={() => {
          setIsOpen(false);
          setQuery("");
          onCommitBlur();
        }}
        onKeyDown={handleKeyDown}
        className="min-w-[170px] max-w-[min(22rem,70vw)] rounded-lg border border-amber-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-800 shadow-sm outline-none transition hover:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-wait disabled:opacity-60"
      />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-700"
        />
      </div>
      {popover && createPortal(popover, document.body)}
    </>
  );
}
