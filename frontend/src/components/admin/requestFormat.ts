// src/components/admin/requestFormat.ts
// Small helpers shared by the Requests page and the dashboard "Requests to approve" card.

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** "tcl.dispatch@client.com" -> "TD" */
export function senderInitials(email?: string | null): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const parts = local.split(/[._\-+\s]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? parts[1][0] ?? "" : parts[0][1] ?? "";
  return (first + second).toUpperCase();
}

const regionTags: Record<string, string> = {
  Davao: "bg-blue-50 text-blue-700",
  CDO: "bg-violet-50 text-violet-700",
  Cebu: "bg-emerald-50 text-emerald-700",
  Luzon: "bg-amber-50 text-amber-700",
};

export function regionTagClass(region?: string | null): string {
  return regionTags[region ?? ""] ?? "bg-slate-100 text-slate-600";
}