// src/pages/Admin/views/RequestsView.tsx
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { DispatchRequest, RequestStatus } from "../../../types/requests";
import RequestDetail from "../../../components/admin/RequestDetail";
import RequestKanbanCard from "../../../components/admin/RequestKanbanCard";
import { tableUi } from "../../../components/admin/dashboardStyles";
import { useRequests } from "../../../components/admin/requestsStore";

type Filter = RequestStatus | "All";
const filters: Filter[] = ["Pending", "Approved", "Declined", "All"];

const COLUMN_DEFS: {
  id: RequestStatus;
  label: string;
  dot: string;
  badge: string;
}[] = [
  { id: "Pending", label: "Pending", dot: "bg-sky-500", badge: "bg-sky-100 text-sky-700" },
  { id: "Approved", label: "Approved", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  { id: "Declined", label: "Declined", dot: "bg-rose-500", badge: "bg-rose-100 text-rose-700" },
];

function RequestColumn({
  label,
  dot,
  badge,
  requests,
  highlighted,
  onOpen,
  onApprove,
  onDecline,
}: {
  label: string;
  dot: string;
  badge: string;
  requests: DispatchRequest[];
  highlighted: boolean;
  onOpen: (request: DispatchRequest) => void;
  onApprove: (request: DispatchRequest) => void;
  onDecline: (request: DispatchRequest) => void;
}) {
  return (
    <section
      aria-label={label}
      className="flex w-full min-w-0 flex-1 flex-col"
    >
      {/* Column header */}
      <header className="mb-2 flex items-center justify-between gap-2 px-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${dot}`}
          />
          <h2 className="truncate text-[13px] font-semibold text-[#0b2341]">
            {label}
          </h2>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${badge}`}
          >
            {requests.length}
          </span>
        </div>
      </header>

      {/* Card lane */}
      <div
        className={`flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-2xl p-2.5 ring-1 transition ${
          highlighted
            ? "bg-[#eef5fb] ring-[#2678b9]/25"
            : "bg-[#f7f9fc] ring-slate-900/[0.04]"
        }`}
      >
        {requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 py-8 text-center text-[12px] text-slate-400">
            No {label.toLowerCase()} requests
          </p>
        ) : (
          requests.map((request) => (
            <RequestKanbanCard
              key={request.id}
              request={request}
              onOpen={() => onOpen(request)}
              onApprove={() => onApprove(request)}
              onDecline={() => onDecline(request)}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default function RequestsView() {
  const { requests, select, selectedId, setStatus, sendMessage } = useRequests();
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      Pending: 0,
      Approved: 0,
      Declined: 0,
      All: requests.length,
    };
    for (const request of requests) result[request.status] += 1;
    return result;
  }, [requests]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((request) => {
      if (!needle) return true;
      return `${request.reference} ${request.fromEmail} ${request.courier ?? ""} ${request.region}`
        .toLowerCase()
        .includes(needle);
    });
  }, [requests, query]);

  /* Always render all three columns side-by-side. The filter pill only
     highlights the active column — it never hides the others, so the board
     always keeps its horizontal alignment. */
  const isFiltered = filter !== "All";

  const selected = requests.find((request) => request.id === selectedId) ?? null;

  function openRequest(request: DispatchRequest) {
    select(request.id);
    setDetailOpen(true);
  }
  function approveRequest(request: DispatchRequest) {
    setStatus(request.id, "Approved");
  }
  function declineRequest(request: DispatchRequest) {
    setStatus(request.id, "Declined");
  }

  return (
    <div className="w-full space-y-4">
      {/* Toolbar */}
      <div className={tableUi.toolbar}>
        <label className="relative block w-full lg:w-96">
          <Search
            aria-hidden="true"
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            aria-label="Search requests"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reference, sender or courier"
            className={tableUi.search}
          />
        </label>

        <div className={tableUi.segment} role="tablist" aria-label="Request status">
          {filters.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={filter === name}
              onClick={() => setFilter(name)}
              className={`${tableUi.segmentBtn} ${
                filter === name ? tableUi.segmentOn : tableUi.segmentOff
              }`}
            >
              {name} <span className="opacity-60">{counts[name]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Kanban board — three columns always aligned horizontally */}
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMN_DEFS.map((column) => {
          /* Filter narrows cards when a specific status is picked, but the
             column stays visible so the row layout never collapses. */
          const columnRows = filtered.filter((r) => r.status === column.id);
          const rows =
            isFiltered && filter !== column.id ? [] : columnRows;
          return (
            <RequestColumn
              key={column.id}
              label={column.label}
              dot={column.dot}
              badge={column.badge}
              requests={rows}
              highlighted={isFiltered && filter === column.id}
              onOpen={openRequest}
              onApprove={approveRequest}
              onDecline={declineRequest}
            />
          );
        })}
      </div>

      {/* Detail slide-over */}
      {detailOpen && selected && (
        <div
          className="fixed inset-0 z-[1200] flex justify-end bg-[#0b2341]/40"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailOpen(false);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Request ${selected.reference}`}
            className="flex h-full w-full max-w-[720px] flex-col bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-400">
                  Request detail
                </p>
                <h2 className="truncate text-base font-semibold text-[#0b2341]">
                  {selected.reference}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                aria-label="Close request detail"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <RequestDetail
                key={selected.id}
                request={selected}
                onApprove={(note) => {
                  setStatus(selected.id, "Approved", note);
                  setDetailOpen(false);
                }}
                onDecline={(note) => {
                  setStatus(selected.id, "Declined", note);
                  setDetailOpen(false);
                }}
                onSendMessage={(body) => sendMessage(selected.id, body)}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}