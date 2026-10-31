import {useEffect,useRef,useState} from 'react';
import {Search} from 'lucide-react';
import RoadProgress from '../../ui/RoadProgress';
import {accent} from '../dashboardStyles';
import TripWorkspaceDialog from '../TripWorkspaceDialog';
import {fetchActiveHomeTrips,type ActiveTripsPage} from '../../../services/home-active-trips.service';
import './active-trips-modal.css';

export default function ActiveTripsModal({token,total,revision,onTotal,onClose,onOpenTrip}:{token:string;total:number;revision:number;onTotal:(value:number)=>void;onClose:()=>void;onOpenTrip:(id:string)=>void}){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[snapshot,setSnapshot]=useState<{scope:string;data:ActiveTripsPage}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const scope=`${token}:${query}:${page}`,onTotalRef=useRef(onTotal),refresh=useRef(()=>{}),lastRevision=useRef(revision);onTotalRef.current=onTotal;
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},250);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{
  let active=true,inFlight=false,again=false;
  const load=async()=>{if(inFlight){again=true;return;}inFlight=true;setBusy(true);setError('');try{const data=await fetchActiveHomeTrips(token,page,query);if(!active)return;if(page>1&&page>data.pagination.totalPages){setPage(Math.max(1,data.pagination.totalPages));return;}setSnapshot({scope,data});onTotalRef.current(data.active_total);}catch(failure){if(active)setError(failure instanceof Error?failure.message:'Active trips could not refresh. Retry to reconnect.');}finally{inFlight=false;if(active){setBusy(false);if(again){again=false;void load();}}}};
  refresh.current=()=>void load();void load();return()=>{active=false;refresh.current=()=>{};};
 },[token,page,query,scope]);
 useEffect(()=>{if(lastRevision.current===revision)return;lastRevision.current=revision;refresh.current();},[revision]);
 const data=snapshot?.scope===scope?snapshot.data:null;
 const open=(id:string)=>{onClose();onOpenTrip(id);};
 return <TripWorkspaceDialog title="Active Trips" className="active-trips-dialog" eyebrow="Home / Operations" onClose={onClose} actions={<span className="active-trip-total">{total} active trips</span>} headerContent={<label className="active-trip-search"><Search size={17} aria-hidden/><input type="search" aria-label="Search active trips" maxLength={100} placeholder="Search active trips" value={search} onChange={event=>setSearch(event.target.value)}/></label>}>
  <div className="active-trips-list" aria-label="Active trip results">
   <div className="active-trips-feedback" role="status">{busy?'Refreshing active trips...':data?`${data.pagination.total} ${query?'matching':'active'} trips · Page ${data.pagination.page} of ${Math.max(1,data.pagination.totalPages)}`:''}</div>
   {data?.warning&&<p className="active-trips-feedback" role="status">{data.warning}</p>}
   {error&&<p className="active-trips-error" role="alert">{error} <button type="button" onClick={()=>refresh.current()}>Retry</button></p>}
   {!busy&&data&&!data.rows.length&&<p className="active-trips-empty">{query?'No active trips match your search.':'No active trips right now.'}</p>}
   {!data&&busy&&<div className="active-trips-skeleton" aria-label="Loading active trips"/>}
   {data?.rows.map(trip=><article key={trip.id} className="active-trip-row" style={{backgroundColor:accent.navy}} role="button" tabIndex={0} aria-label={`Open ${trip.reference||`Trip ${trip.trip_number??trip.id}`}`} onClick={()=>open(trip.id)} onKeyDown={event=>{if(event.target===event.currentTarget&&['Enter',' '].includes(event.key)){event.preventDefault();open(trip.id);}}}>
    <div className="active-trip-heading"><h3>{trip.reference||`Trip ${trip.trip_number??'reference unavailable'}`}</h3><strong className="active-trip-percent">{trip.progress.percent===null?'Unavailable':`${trip.progress.percent}%`}</strong></div>
    <p className="active-trip-route" title={[trip.origin||'Origin not recorded',...trip.destinations.map(stop=>stop.name||'Destination not recorded')].join(' → ')}>{trip.origin||'Origin not recorded'} &rarr; {trip.destinations.map(stop=>stop.name||'Destination not recorded').join(' → ')||'Destination not recorded'}</p>
    <RoadProgress percent={trip.progress.percent} label={`Trip ${trip.reference||trip.id} delivery progress`}/>
   </article>)}
   {data&&data.pagination.totalPages>1&&<nav className="active-trips-pagination" aria-label="Active trips pages"><button type="button" disabled={!data||page<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><span>{page} / {data.pagination.totalPages}</span><button type="button" disabled={!data||page>=data.pagination.totalPages} onClick={()=>setPage(value=>value+1)}>Next</button></nav>}
  </div>
 </TripWorkspaceDialog>;
}
