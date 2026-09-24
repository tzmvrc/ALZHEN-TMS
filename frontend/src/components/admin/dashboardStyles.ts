export const toneClasses = {
  blue: "bg-[#eaf2ff] text-[#2456c7]",
  emerald: "bg-[#eafaf2] text-[#1d8b5d]",
  amber: "bg-[#fff3dc] text-[#a45d0c]",
  violet: "bg-[#efeafc] text-[#5a3aa6]",
  rose: "bg-[#fce8ec] text-[#ac2d4d]",
} as const;

export const toneHex = {
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  rose: "#ef4444",
} as const;

export const statusColor = (status: string) => {
  switch (status) {
    case "Completed": return "#3b82f6";
    case "In Progress": return "#10b981";
    case "Delayed": return "#f59e0b";
    default: return "#94a3b8";
  }
};