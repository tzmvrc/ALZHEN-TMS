export const fleetTruckPhotos = [
  "/images/trucks/alzhen-truck-01.jpg",
  "/images/trucks/alzhen-truck-02.jpg",
  "/images/trucks/alzhen-truck-03.jpg",
  "/images/trucks/alzhen-truck-06.jpg",
] as const;

export function getFleetTruckPhoto(
  seed?: string | null,
  index?: number,
): string {
  if (index !== undefined) {
    return fleetTruckPhotos[index % fleetTruckPhotos.length];
  }
  if (!seed) return fleetTruckPhotos[0];

  let hash = 2166136261;
  for (let position = 0; position < seed.length; position += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(position), 16777619);
  }
  return fleetTruckPhotos[(hash >>> 0) % fleetTruckPhotos.length];
}

/* Transparent truck cut-outs used by the Active fleet cards */
export const fleetTruckCutouts = [
  "/images/trucks/fleet-01.webp",
  "/images/trucks/fleet-02.webp",
  "/images/trucks/fleet-03.webp",
  "/images/trucks/fleet-04.webp",
  "/images/trucks/fleet-05.webp",
  "/images/trucks/fleet-06.webp",
  "/images/trucks/fleet-07.webp",
  "/images/trucks/fleet-08.webp",
  "/images/trucks/fleet-09.webp",
  "/images/trucks/fleet-10.webp",
  "/images/trucks/fleet-11.webp",
  "/images/trucks/fleet-12.webp",
] as const;

/* Stable pick: the same trip always gets the same truck picture */
export function getFleetTruckCutout(seed: string): string {
  let hash = 2166136261;
  for (let position = 0; position < seed.length; position += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(position), 16777619);
  }
  return fleetTruckCutouts[(hash >>> 0) % fleetTruckCutouts.length];
}

/* Alzhen brand palette (same navy + yellow as the top navigation) */
export const accent = {
  navy: "#0b2341",
  blue: "#2678b9",
  blueSoft: "#e6f0f9",
  yellow: "#ffd43b",
  yellowDeep: "#f2c200",
  canvas: "#eef3f8",
  panel: "#f2f6fa",
} as const;

export const toneClasses = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
  navy: "bg-[#e6ecf4] text-[#0b2341]",
  brand: "bg-[#e6f0f9] text-[#1d5f94]",
} as const;

export const toneHex = {
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  rose: "#ef4444",
  slate: "#64748b",
  navy: "#0b2341",
  brand: "#2678b9",
} as const;

export const statusColor = (status: string) => {
  switch (status) {
    case "Completed": return "#3b82f6";
    case "In Progress": return "#10b981";
    case "Delayed": return "#f59e0b";
    default: return "#94a3b8";
  }
};

/* Shared surface tokens for consistent card styling */
export const surface = {
  card: "rounded-[28px] bg-white ring-1 ring-slate-900/[0.04] shadow-[0_1px_2px_rgba(11,35,65,0.03)]",
  inner: "rounded-2xl bg-[#f5f7fa]",
  /* Bordered cell used inside a card (e.g. loading-status grid, tab strips) */
  cell: "rounded-2xl border border-slate-200/70 bg-white",
  pill: "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold",
  eyebrow: "text-[11px] font-medium text-slate-400",
  heading: "text-[17px] font-semibold tracking-tight text-[#0b2341]",
  /* Page canvas behind the cards (dots come from global CSS in index.css): put this on the dashboard wrapper */
  canvas: "bg-transparent",
  /* Yellow action chip (Check / View buttons) */
  chip: "inline-flex items-center justify-center rounded-full bg-[#ffd43b] px-3.5 py-1.5 text-[11px] font-semibold text-[#0b2341] transition hover:bg-[#f2c200] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40",
  chipGhost:
    "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40",
};

/* Shared table tokens: every table page (trips, reports, users, database...) uses these */
export const tableUi = {
  shell: "overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-900/[0.04] shadow-[0_1px_2px_rgba(11,35,65,0.03)]",
  toolbar: "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
  search: "h-10 w-full rounded-full border border-transparent bg-white pl-10 pr-4 text-sm text-slate-700 shadow-[0_1px_2px_rgba(11,35,65,0.06)] outline-none placeholder:text-slate-400 focus:border-[#2678b9]/40 focus:ring-2 focus:ring-[#2678b9]/15",
  select: "h-10 appearance-none rounded-full border border-transparent bg-white pl-4 pr-9 text-sm text-slate-600 shadow-[0_1px_2px_rgba(11,35,65,0.06)] outline-none transition focus:border-[#2678b9]/40 focus:ring-2 focus:ring-[#2678b9]/15",
  segment: "inline-flex items-center rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(11,35,65,0.06)]",
  segmentBtn: "rounded-full px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]",
  segmentOn: "bg-[#0b2341] text-white",
  segmentOff: "text-slate-500 hover:text-[#0b2341]",
  iconBtn: "inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-[0_1px_2px_rgba(11,35,65,0.06)] transition hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]",
  thead: "bg-white",
  th: "whitespace-nowrap border-b border-slate-100 px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600",
  td: "px-4 py-3.5 text-[13px] text-slate-700",
  tdStrong: "px-4 py-3.5 text-[13px] font-medium text-[#0b2341]",
  row: "border-b border-slate-100/80 transition-colors last:border-0 hover:bg-[#f2f6fa]/70",
  footer: "flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-400",
  pageBtn: "inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#f2f6fa] hover:text-[#0b2341] disabled:cursor-not-allowed disabled:opacity-30",
  empty: "px-4 py-16 text-center text-sm text-slate-400",
} as const;
