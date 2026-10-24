import {ArrowUpRight,CalendarClock} from "lucide-react";
import {manilaDay,shortDay,type HomeTrip} from "./home-dashboard-data";
import {SectionHeading} from "./HomePrimitives";

/** Estimated dates from the bounded operational snapshot; never implied appointment times. */
export default function UpcomingDeliveries({trips,loading,onOpenTrip}:{trips:HomeTrip[];loading:boolean;onOpenTrip?:(id:string)=>void}){
  const today=manilaDay(new Date().toISOString())!;
  const upcoming=trips.filter(trip=>trip.dueDay&&trip.dueDay>=today&&["In progress","Planned","Delayed"].includes(trip.status)).sort((a,b)=>a.dueDay!.localeCompare(b.dueDay!)||a.reference.localeCompare(b.reference));
  return <section className="home-panel home-upcoming-deliveries" aria-label="Upcoming delivery estimates"><SectionHeading title="Next delivery windows"><CalendarClock size={18} aria-hidden="true"/></SectionHeading><ul>{upcoming.slice(0,3).map(trip=><li key={trip.id}><button type="button" className="home-request-item" onClick={()=>onOpenTrip?.(trip.id)}><span className="home-delivery-day">{trip.dueDay===today?"Today":shortDay(trip.dueDay)}</span><span><strong>{trip.destination}</strong><small>{trip.reference} / {trip.origin}{trip.demonstration?" / Demo":""}</small></span><ArrowUpRight size={14} aria-hidden="true"/></button></li>)}</ul>{!upcoming.length&&<p className="home-data-note">{loading?"Loading delivery estimates…":"No upcoming delivery estimates in the loaded trips."}</p>}<p className="home-delivery-note">Estimated dates, not appointment times · latest loaded trips</p></section>;
}
