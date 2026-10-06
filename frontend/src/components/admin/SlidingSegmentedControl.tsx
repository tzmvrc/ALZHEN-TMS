import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type SegmentOption<Value extends string> = {
  value: Value;
  label: ReactNode;
};

type SlidingSegmentedControlProps<Value extends string> = {
  "aria-label": string;
  options: readonly SegmentOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  role?: "group" | "tablist";
  className?: string;
};

export default function SlidingSegmentedControl<Value extends string>({
  "aria-label": ariaLabel,
  options,
  value,
  onChange,
  role = "group",
  className = "",
}: SlidingSegmentedControlProps<Value>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<Value, HTMLButtonElement>());
  const [indicator, setIndicator] = useState({ left: 4, width: 0 });
  const [positioned, setPositioned] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeButton = buttonRefs.current.get(value);
    if (!container || !activeButton) return;

    const updateIndicator = () => {
      const containerBounds = container.getBoundingClientRect();
      const buttonBounds = activeButton.getBoundingClientRect();
      setIndicator({
        left:
          buttonBounds.left -
          containerBounds.left -
          container.clientLeft +
          container.scrollLeft,
        width: buttonBounds.width,
      });
      setPositioned(true);
    };

    updateIndicator();
    const resizeObserver = new ResizeObserver(updateIndicator);
    resizeObserver.observe(container);
    options.forEach(({ value: optionValue }) => {
      const button = buttonRefs.current.get(optionValue);
      if (button) resizeObserver.observe(button);
    });

    return () => resizeObserver.disconnect();
  }, [options, value]);

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={ariaLabel}
      className={`relative isolate inline-flex min-w-0 items-center rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(11,35,65,0.06)] ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-1 top-1 rounded-full bg-[#0b2341] transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          positioned ? "opacity-100" : "opacity-0"
        }`}
        style={{
          width: indicator.width,
          transform: `translateX(${indicator.left}px)`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              if (element) buttonRefs.current.set(option.value, element);
              else buttonRefs.current.delete(option.value);
            }}
            type="button"
            role={role === "tablist" ? "tab" : undefined}
            aria-selected={role === "tablist" ? selected : undefined}
            aria-pressed={role === "group" ? selected : undefined}
            onClick={() => onChange(option.value)}
            className={`relative z-10 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${
              selected
                ? "text-white"
                : "text-slate-500 hover:text-[#0b2341]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
