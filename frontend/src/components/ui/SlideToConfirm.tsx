import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";

const KNOB = 56;
const PAD = 4;
const CONFIRM_AT = 0.85;

type SlideToConfirmProps = {
  /** Text shown on the track, e.g. "Slide to start trip". */
  label: string;
  /** Text shown while onConfirm is running. */
  busyLabel?: string;
  disabled?: boolean;
  /** Called once the knob is released past the threshold. Throwing/rejecting resets the knob. */
  onConfirm: () => void | Promise<void>;
};

export default function SlideToConfirm({
  label,
  busyLabel = "Starting…",
  disabled = false,
  onConfirm,
}: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const dragRef = useRef({ startX: 0, startOffset: 0 });
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const locked = disabled || submitting;

  const maxOffset = () =>
    Math.max((trackRef.current?.clientWidth ?? 0) - KNOB - PAD * 2, 0);

  const move = (value: number) => {
    offsetRef.current = value;
    setOffset(value);
  };

  const confirm = async () => {
    if (locked) return;
    setSubmitting(true);
    move(maxOffset());
    try {
      await onConfirm();
    } catch {
      /* The caller shows its own error; just let the driver try again. */
    } finally {
      setSubmitting(false);
      move(0);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startOffset: offsetRef.current };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const next = dragRef.current.startOffset + event.clientX - dragRef.current.startX;
    move(Math.min(Math.max(next, 0), maxOffset()));
  };

  const onPointerEnd = () => {
    if (!dragging) return;
    setDragging(false);
    const max = maxOffset();
    if (max > 0 && offsetRef.current >= max * CONFIRM_AT) void confirm();
    else move(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void confirm();
    }
  };

  const max = maxOffset();
  const progress = max > 0 ? offset / max : 0;

  return (
    <div
      ref={trackRef}
      className={`relative h-16 select-none overflow-hidden rounded-full bg-[#0b2341] ${locked && !submitting ? "opacity-50" : ""}`}
    >
      <style>{`
        @keyframes slide-hint-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .slide-hint { background: linear-gradient(90deg, rgba(255,255,255,.45) 0%, #fff 50%, rgba(255,255,255,.45) 100%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: slide-hint-shimmer 2.8s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .slide-hint { animation: none; color: #fff; background: none; } }
      `}</style>

      {/* Filled portion that follows the knob */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 rounded-full bg-[#2678b9]"
        style={{
          width: offset + KNOB + PAD,
          transition: dragging ? "none" : "width 220ms ease-out",
        }}
      />

      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-[15px] font-semibold"
        style={{ opacity: submitting ? 1 : Math.max(1 - progress * 1.6, 0) }}
      >
        <span className={submitting ? "text-white" : "slide-hint"}>
          {submitting ? busyLabel : label}
        </span>
      </span>

      <button
        type="button"
        aria-label={`${label}. Drag to the right, or press Enter.`}
        disabled={locked}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        className="absolute flex items-center justify-center rounded-full bg-white text-[#0b2341] shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2678b9]/50 disabled:cursor-not-allowed"
        style={{
          top: PAD,
          left: PAD,
          width: KNOB,
          height: KNOB,
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 220ms ease-out",
          touchAction: "none",
          cursor: locked ? "not-allowed" : dragging ? "grabbing" : "grab",
        }}
      >
        {submitting ? (
          <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
        ) : progress >= CONFIRM_AT ? (
          <Check aria-hidden="true" className="h-5 w-5" />
        ) : (
          <ArrowRight aria-hidden="true" className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}