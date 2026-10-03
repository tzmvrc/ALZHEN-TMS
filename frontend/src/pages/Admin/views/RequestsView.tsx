// src/pages/Admin/views/RequestsView.tsx
import { useMemo, useState } from "react";
import {
  Filter,
  Inbox,
  Mail,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import type { DispatchRequest, RequestStatus } from "../../../types/requests";
import { defaultRequests } from "../data/defaultRequests";
import RequestDetail from "../../../components/admin/RequestDetail";

/* ---------- helpers ---------- */
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const statusStyles: Record<RequestStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Declined: "bg-rose-50 text-rose-700 ring-rose-200",
};

const regionStyles: Record<string, string> = {
  Davao: "bg-blue-50 text-blue-700",
  CDO: "bg-violet-50 text-violet-700",
  Cebu: "bg-emerald-50 text-emerald-700",
  Luzon: "bg-amber-50 text-amber-700",
};

/* ---------- RequestCard ---------- */
function RequestCard({
  req,
  selected,
  onClick,
}: {
  req: DispatchRequest;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full cursor-pointer rounded-xl border bg-white p-3.5 text-left ${
        selected
          ? "border-blue-400 ring-2 ring-blue-200"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${regionStyles[req.region] ?? "bg-slate-100 text-slate-600"}`}
          >
            {req.region}
          </span>
          <span className="text-xs font-semibold text-slate-900">
            {req.reference}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusStyles[req.status]}`}
        >
          {req.status}
        </span>
      </div>

      <p className="mt-2 truncate text-[11px] text-slate-500">
        {req.fromEmail}
      </p>

      <div className="mt-2.5 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">{req.courier ?? "—"}</span>
        <span className="text-slate-400">{timeAgo(req.receivedAt)}</span>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <Truck className="h-3 w-3" />
          {req.items.length} item{req.items.length === 1 ? "" : "s"}
        </span>
        {req.amount ? (
          <span className="text-[11px] font-semibold text-slate-800">
            {req.amount}
          </span>
        ) : null}
      </div>
    </button>
  );
}

/* ---------- RequestsView ---------- */
export default function RequestsView() {
  const [requests, setRequests] = useState<DispatchRequest[]>(defaultRequests);
  const [selectedId, setSelectedId] = useState<string | null>(
    defaultRequests[0]?.id ?? null,
  );
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "All">(
    "Pending",
  );

  const filtered = useMemo(() => {
    if (statusFilter === "All") return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const handleSetStatus = (
    id: string,
    status: RequestStatus,
    note?: string,
  ) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              messageThread: note
                ? [
                    ...r.messageThread,
                    {
                      id: `msg-${Date.now()}`,
                      from: "You",
                      body: note,
                      at: new Date().toISOString(),
                      self: true,
                    },
                  ]
                : r.messageThread,
            }
          : r,
      ),
    );
  };

  const handleSendMessage = (id: string, body: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              messageThread: [
                ...r.messageThread,
                {
                  id: `msg-${Date.now()}`,
                  from: "You",
                  body,
                  at: new Date().toISOString(),
                  self: true,
                },
              ],
            }
          : r,
      ),
    );
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Inbox className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Requests</h1>
            <p className="text-xs text-slate-500">
              Dispatch requests parsed from incoming TCL emails
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter chips */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {(["Pending", "Approved", "Declined", "All"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  statusFilter === s
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filter
          </button>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Left: request list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {filtered.length} request{filtered.length === 1 ? "" : "s"}
            </span>
            <Filter className="h-3.5 w-3.5 text-slate-400" />
          </div>

          <div className="max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                <Mail className="mx-auto h-5 w-5 text-slate-300" />
                <p className="mt-2 text-xs text-slate-400">
                  No {statusFilter.toLowerCase()} requests.
                </p>
              </div>
            ) : (
              filtered.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  selected={req.id === selectedId}
                  onClick={() => setSelectedId(req.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div className="min-w-0">
          {selected ? (
            <RequestDetail
              request={selected}
              onApprove={(note: string | undefined) =>
                handleSetStatus(selected.id, "Approved", note)
              }
              onDecline={(note: string | undefined) =>
                handleSetStatus(selected.id, "Declined", note)
              }
              onSendMessage={(body: string) =>
                handleSendMessage(selected.id, body)
              }
            />
          ) : (
            <div className="flex h-full min-h-[400px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white">
              <div className="text-center">
                <Mail className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-500">
                  Select a request
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Choose a request from the list to review and action it.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}