// src/components/admin/RequestKanbanCard.tsx
import { memo, useState } from "react";
import {
  MessageSquare,
  Paperclip,
  MoreVertical,
  Pencil,
  Eye,
  Truck,
  FileText,
} from "lucide-react";
import type { DispatchRequest, RequestStatus } from "../../types/requests";
import { regionTagClass, senderInitials, timeAgo } from "./requestFormat";

/* Progress + tag styling per status */
const STATUS_META: Record<
  RequestStatus,
  { tag: string; bar: string; progress: number }
> = {
  Pending: { tag: "bg-sky-100 text-sky-700", bar: "bg-sky-500", progress: 35 },
  Approved: {
    tag: "bg-emerald-100 text-emerald-700",
    bar: "bg-emerald-500",
    progress: 100,
  },
  Declined: {
    tag: "bg-rose-100 text-rose-700",
    bar: "bg-rose-500",
    progress: 100,
  },
};

export default memo(function RequestKanbanCard({
  request,
  onOpen,
  onApprove,
  onDecline,
}: {
  request: DispatchRequest;
  onOpen: () => void;
  onApprove?: () => void;
  onDecline?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = STATUS_META[request.status];
  const itemCount = request.items.length;
  const attachmentCount = request.items.length;

  return (
    <article className="group relative flex flex-col gap-2.5 rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgba(11,35,65,0.05),0_6px_16px_-12px_rgba(11,35,65,0.14)] ring-1 ring-slate-900/[0.04] transition hover:shadow-[0_2px_4px_rgba(11,35,65,0.06),0_10px_24px_-14px_rgba(11,35,65,0.2)]">
      {/* Tag row + options */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${regionTagClass(
              request.region,
            )}`}
          >
            {request.region}
          </span>
          {itemCount > 0 && (
            <span className="rounded-md bg-[#f2f6fa] px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Request options"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
          >
            <MoreVertical aria-hidden="true" className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <div
                role="menu"
                className="absolute right-0 top-6 z-20 min-w-36 overflow-hidden rounded-xl border border-slate-100 bg-white p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpen();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-slate-700 hover:bg-slate-50"
                >
                  <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                  Review
                </button>
                {request.status === "Pending" && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onApprove?.();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-emerald-700 hover:bg-emerald-50"
                    >
                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onDecline?.();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-rose-700 hover:bg-rose-50"
                    >
                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      Decline
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Title + description */}
      <button
        type="button"
        onClick={onOpen}
        className="block min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] focus-visible:ring-offset-2"
      >
        <h3
          className="truncate text-[13.5px] font-bold leading-snug tracking-tight text-[#0b2341]"
          title={request.reference}
        >
          {request.reference}
        </h3>
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-slate-500">
          {request.courier
            ? `${request.courier} · ${request.warehouse || "warehouse not set"}`
            : `Dispatch request from ${request.fromName || request.fromEmail}`}
        </p>
      </button>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span>Progress</span>
          <span className="tabular-nums text-[#0b2341]">{meta.progress}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${meta.bar} transition-[width] duration-500`}
            style={{ width: `${meta.progress}%` }}
          />
        </div>
      </div>

      {/* Footer: avatar + counters */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0b2341] text-[9px] font-bold text-white ring-2 ring-white"
          title={request.fromEmail}
        >
          {senderInitials(request.fromEmail)}
        </span>

        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1" title={`${itemCount} items`}>
            <Truck aria-hidden="true" className="h-3.5 w-3.5" />
            {itemCount}
          </span>
          <span className="inline-flex items-center gap-1" title="Messages">
            <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
            {request.messageThread.length}
          </span>
          <span className="inline-flex items-center gap-1" title="Attachments">
            <Paperclip aria-hidden="true" className="h-3.5 w-3.5" />
            {attachmentCount}
          </span>
        </div>
      </div>
    </article>
  );
});