// src/components/admin/dashboardStyles.ts
export const fleetTruckPhoto =
  "https://alzhen-website.vercel.app/images/company/hino-enhanced.png";

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
  card: "rounded-[28px] bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04),0_10px_30px_-18px_rgba(11,35,65,0.14)]",
  inner: "rounded-2xl bg-[#f2f6fa]",
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