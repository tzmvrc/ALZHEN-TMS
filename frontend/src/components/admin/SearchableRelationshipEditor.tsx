import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
<<<<<<< Updated upstream
  disabled?: boolean;
=======
  customerId?: string;
>>>>>>> Stashed changes
  onChange: (value: string) => void;
  onSelect: (option: RelationshipOption) => void;
  onCommitBlur: () => void;
  onCancel: () => void;
};

export default function SearchableRelationshipEditor({
  token,
  kind,
  value,
  storeId,
<<<<<<< Updated upstream
  disabled = false,
=======
  customerId,
>>>>>>> Stashed changes
  onChange,
  onSelect,
  onCommitBlur,
  onCancel,
}: SearchableRelationshipEditorProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
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
      void searchRelationshipOptions(token, kind, value, {
        storeId,
        customerId,
      })
        .then((result) => {
          if (!active) return;
          setOptions(result);
          setActiveIndex(0);
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
  }, [customerId, isOpen, kind, storeId, token, value]);

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

  function selectOption(option: RelationshipOption | undefined) {
    if (!option) return;
    setIsOpen(false);
    onSelect(option);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (isOpen && options.length > 0) {
        selectOption(options[activeIndex] ?? options[0]);
      } else {
        onCommitBlur();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      onCancel();
    }
  }

  const popover = isOpen ? (
    <div
      id={listId}
      role="listbox"
      aria-label="Matching records"
      className="fixed z-[100] max-h-56 overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg"
      style={position}>
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
            className={`block w-full px-3 py-2 text-left ${index === activeIndex ? "bg-[#e6f0f9]" : "hover:bg-slate-50"}`}>
            <span className="block truncate text-sm font-medium text-slate-800">
              {option.label}
            </span>
            {option.secondary && (
              <span className="block truncate text-[10px] text-slate-500">
                {option.secondary}
              </span>
            )}
          </button>
        ))
      )}
    </div>
  ) : null;

  return (
    <>
      <input
        ref={inputRef}
        autoFocus
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={isOpen ? `${listId}-${activeIndex}` : undefined}
        value={value}
        onFocus={() => !disabled && setIsOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onBlur={() => {
          setIsOpen(false);
          onCommitBlur();
        }}
        onKeyDown={handleKeyDown}
        className="min-w-[170px] rounded-md border border-[#9cc3e3] bg-white px-2 py-1 text-sm font-medium text-slate-800 shadow-sm outline-none ring-2 ring-[#cfe1f1] disabled:cursor-wait disabled:opacity-60"
      />
      {popover && createPortal(popover, document.body)}
    </>
  );
}