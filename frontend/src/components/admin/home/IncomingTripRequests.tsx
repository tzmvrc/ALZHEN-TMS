import { ArrowUpRight, Mail } from "lucide-react";
import { useRequests } from "../requestsStore";
import { HOME_DEMO_REQUEST_ID } from "../../../pages/Admin/data/homeDemoRequest";
import { SectionHeading } from "./HomePrimitives";
import { shortDay } from "./home-dashboard-data";

export default function IncomingTripRequests({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const { requests, pending, source, select } = useRequests();
  const rows = source === "live" ? pending.slice(0, 3) : requests.filter(request => request.id === HOME_DEMO_REQUEST_ID && request.status === "Pending");
  const pendingCount = source === "live" ? pending.length : rows.filter(request => request.status === "Pending").length;
  return <section id="home-incoming-requests" className="home-panel home-incoming-requests" aria-label="Incoming Trip Requests">
    <SectionHeading title="Incoming Trip Requests" description={source === "live" ? "Email requests awaiting operational review." : "Frontend email preview. No mailbox, n8n or production automation is connected."}><span className="home-count-badge">{pendingCount} pending{source !== "live" ? " demo" : ""}</span></SectionHeading>
    {rows.map(request => <article key={request.id} className="home-incoming-row"><span className="home-mail-icon"><Mail size={21} aria-hidden="true"/></span><div><div className="home-incoming-title"><strong>{request.items[0]?.customerName || request.fromName}</strong>{request.demo && <span className="home-demo-label">Frontend demo</span>}</div><p>{request.emailSubject || request.reference}</p><small>{request.fromName} &lt;{request.fromEmail}&gt;</small><p><strong>Loading {shortDay(request.dispatchDate ?? null)}</strong> / {request.warehouse} to {[...new Set(request.items.map(item => item.shipTo))].join(" and ")}</p><small>{request.items.reduce((sum, item) => sum + item.qty, 0)} units / {request.items.reduce((sum, item) => sum + (item.totalCbm ?? 0), 0).toFixed(2)} CBM</small></div><div className="home-incoming-actions"><span className="home-status">{request.status === "Pending" ? "Pending Review" : request.status}</span><button type="button" className="home-button home-button-outline" onClick={() => { select(request.id); onNavigate?.("requests"); }}>Review request <ArrowUpRight size={15} aria-hidden="true"/></button></div></article>)}
    {!rows.length && <p className="home-data-note">No pending requests.</p>}
  </section>;
}
