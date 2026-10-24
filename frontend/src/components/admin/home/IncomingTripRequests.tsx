import { ArrowUpRight, Mail } from "lucide-react";
import { useRequests } from "../requestsStore";
import { SectionHeading } from "./HomePrimitives";
import {newestPendingRequests} from "../../../services/request-presentation";

export default function IncomingTripRequests({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const { requests, pending, source, select } = useRequests();
  const rows=newestPendingRequests(requests);
  return <section id="home-incoming-requests" className="home-panel home-incoming-requests home-request-list" aria-label="Incoming Trip Requests">
    <SectionHeading title="Incoming Trip Requests"><span className="home-request-heading-actions"><span className="home-count-badge">{pending.length} pending{source==="sample"?" / sample":""}</span><button type="button" className="home-text-button" onClick={()=>onNavigate?.("requests")}>View all requests <ArrowUpRight size={14} aria-hidden="true"/></button></span></SectionHeading>
    <ul>{rows.map(request=>{
      const cbm=request.items.reduce((sum,item)=>sum+(Number.isFinite(item.totalCbm)?item.totalCbm!:0),0);
      const known=request.items.some(item=>typeof item.totalCbm==="number"&&Number.isFinite(item.totalCbm));
      return <li key={request.id}><button type="button" className="home-request-item" onClick={()=>{select(request.id);}}><Mail size={17} aria-hidden="true"/><span><strong>{request.emailSubject||request.reference}</strong><small><time dateTime={request.receivedAt}>{Number.isFinite(Date.parse(request.receivedAt))?new Date(request.receivedAt).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Manila"}):"Date unavailable"}</time>{known?` / ${cbm.toFixed(2)} CBM`:""}{source==="sample"?" / Sample":""}</small></span><span className="home-request-status"><i/>Pending</span><ArrowUpRight size={14} aria-hidden="true"/></button></li>;
    })}</ul>
    {!rows.length&&<p className="home-data-note">No pending requests.</p>}
  </section>;
}
