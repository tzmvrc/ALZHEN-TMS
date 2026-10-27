import {useState} from "react";
import {ArrowUpRight, UserRound} from "lucide-react";
import type {ReportColumn, ReportKey, ReportRow} from "../../services/report.service";

const summarizedKeys = new Set([
  "dispatch_number","trip_reference","store_call_id","trip_id","trip_status","status","delivery_status","confirmation_status","letter_status",
  "warehouse_name","ship_from","warehouse_code","wh_code","store_name","ship_to","customer_name","estimated_delivery_date","delivery_date",
  "loading_date","date_assigned","plate_number","driver_name","assigned_to_name","assigned_to","trucking_company","dr_number","transaction_dr_number",
  "product_name","product_model","model_code","sku",
]);
const cardDateFormatter = new Intl.DateTimeFormat("en-PH", {month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
const CARD_BATCH_SKELETON_COUNT = 3;

function text(row: ReportRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function first(rows: ReportRow[], ...keys: string[]) {
  for (const row of rows) {
    const value = text(row, ...keys);
    if (value) return value;
  }
  return "";
}

function unique(rows: ReportRow[], ...keys: string[]) {
  return [...new Set(rows.map(row => text(row, ...keys)).filter(Boolean))];
}

function cardValues(rows:ReportRow[],field:string,...fallback:string[]) {
  const saved=rows.flatMap(row=>Array.isArray(row[field])?row[field].filter((value):value is string=>typeof value==="string"&&Boolean(value.trim())):[]);
  return [...new Set([...saved,...unique(rows,...fallback)])];
}

function groupsFor(rows: ReportRow[], byDispatch: boolean, byTrip: boolean) {
  const groups = new Map<string, ReportRow[]>();
  rows.forEach((row, index) => {
    const dispatchNumber = text(row, "dispatch_number");
    const tripId = text(row, "_trip_id", "trip_id");
    const key = byDispatch ? dispatchNumber ? `dispatch:${dispatchNumber}` : `row:${index}` : byTrip && tripId ? `trip:${tripId}` : `row:${index}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  });
  return [...groups.values()];
}

function dateLabel(value: string) {
  if (!value) return "Not recorded";
  const day = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (!day) return value;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : cardDateFormatter.format(parsed);
}

function DriverAvatar({url, name}: {url:string;name:string}) {
  const [failedUrl,setFailedUrl] = useState("");
  return <span className="relative z-10 -mt-7 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#e9eef5] text-[#0b2343] shadow-sm">
    {url && url !== failedUrl ? <img src={url} alt={`${name || "Driver"}'s profile`} loading="lazy" onError={() => setFailedUrl(url)} className="h-full w-full object-cover" /> : <UserRound aria-hidden="true" size={24} />}
  </span>;
}

function Detail({label,value}: {label:string;value:string}) {
  return <div className="min-w-0 border-b border-[#edf0f4] py-2 last:border-b-0">
    <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-0.5 truncate text-[12px] font-semibold text-[#0b2343]" title={value}>{value}</dd>
  </div>;
}

function DispatchCardSkeleton() {
  return <article aria-hidden="true" className="min-w-0 overflow-hidden rounded-[22px] border border-[#e4e9f0] bg-white p-4 shadow-[0_8px_24px_-18px_rgba(11,35,67,.28)] motion-safe:animate-pulse">
    <div className="rounded-2xl bg-[#e9eef5] px-4 pb-8 pt-4">
      <div className="flex items-center justify-between"><div className="h-3 w-24 rounded-full bg-[#d4dfeb]"/><div className="h-5 w-20 rounded-full bg-[#d4dfeb]"/></div>
      <div className="mt-5 h-7 w-16 rounded bg-[#d4dfeb]"/>
      <div className="mt-4 h-1.5 w-full rounded-full bg-[#d4dfeb]"/>
    </div>
    <div className="relative px-1 pb-1">
      <div className="-mt-7 h-14 w-14 rounded-full border-4 border-white bg-[#e9eef5]"/>
      <div className="mt-3 h-5 w-2/5 rounded bg-slate-200"/>
      <div className="mt-2 h-3 w-3/5 rounded bg-slate-100"/>
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-[#edf0f4] py-4">
        {Array.from({length:6},(_,index)=><div key={index} className="space-y-2"><div className="h-2 w-16 rounded bg-slate-100"/><div className="h-3 w-4/5 rounded bg-slate-200"/></div>)}
      </div>
      <div className="mt-5 h-10 w-full rounded-full bg-slate-200"/>
    </div>
  </article>;
}

export function DispatchCardsSkeleton({count=3}: {count?:number}) {
  return <div role="status" aria-label="Loading dispatch cards" className="grid grid-cols-1 items-start gap-4 py-2 lg:grid-cols-2 2xl:grid-cols-3">
    {Array.from({length:count},(_,index)=><DispatchCardSkeleton key={index}/>)}
  </div>;
}

export default function DispatchVisualCards({rows,columns,reportKey,onOpenTrip,groupByDispatch=false,loadingMore=false}: {
  rows:ReportRow[];
  columns:ReportColumn[];
  reportKey:ReportKey;
  onOpenTrip?: (tripId:string,stopId?:string|null)=>void;
  groupByDispatch?:boolean;
  loadingMore?:boolean;
}) {
  const groups = groupsFor(rows,groupByDispatch,reportKey!=="store-calling");
  const extraColumns = columns.filter(column => !summarizedKeys.has(column.key));
  return <div className="grid grid-cols-1 items-start gap-4 py-2 lg:grid-cols-2 2xl:grid-cols-3">
    {groups.map((group,index) => {
      const identity = first(group,"dispatch_number","trip_reference","store_call_id","trip_id") || `Record ${index+1}`;
      const dispatchNumber = text(group[0],"dispatch_number");
      const tripId = first(group,"_trip_id","trip_id");
      const cardKey = groupByDispatch ? dispatchNumber ? `dispatch:${dispatchNumber}` : `row:${index}` : `${tripId || identity}-${index}`;
      const driver = first(group,"driver_name","assigned_to_name","assigned_to");
      const carrier = first(group,"trucking_company");
      const photo = group.find(row => text(row,"driver_name","assigned_to_name","assigned_to") === driver)?.driver_photo_url;
      const photoUrl = typeof photo === "string" ? photo : "";
      const tripStatus = first(group,"trip_status","status");
      const deliveryStatus = first(group,"delivery_status","confirmation_status");
      const letterStatus = first(group,"letter_status");
      const status = tripStatus || deliveryStatus || "Status not recorded";
      const meta = group.find(row => typeof row.card_stop_total === "number" && typeof row.card_stop_completed === "number");
      const total = typeof meta?.card_stop_total === "number" ? meta.card_stop_total : null;
      const completed = typeof meta?.card_stop_completed === "number" ? meta.card_stop_completed : null;
      const progress = total && completed !== null ? Math.round(completed / total * 100) : null;
      const destinations = cardValues(group,"card_destinations","store_name","ship_to","customer_name");
      const destination = destinations.length > 1 ? `${destinations[0]} +${destinations.length-1} more` : destinations[0] || "Not recorded";
      const origin = first(group,"warehouse_name","ship_from","warehouse_code","wh_code") || "Not recorded";
      const plate = first(group,"plate_number") || "Not assigned";
      const deliveryDate = dateLabel(first(group,"estimated_delivery_date","card_delivery_date","delivery_date"));
      const loadingDate = dateLabel(first(group,"loading_date","date_assigned"));
      const dr = cardValues(group,"card_dr_numbers","dr_number","transaction_dr_number");
      const products = cardValues(group,"card_products","product_name","product_model","model_code","sku");
      return <article key={cardKey} className="flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-[#e4e9f0] bg-white shadow-[0_8px_24px_-18px_rgba(11,35,67,.28)] motion-safe:[animation:fadeInUp_200ms_ease-out_both]">
        <div className="mx-4 mt-4 rounded-2xl bg-[#0b2343] px-4 pb-8 pt-4 text-white">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-white/75">Delivery progress</span>
            <span className="max-w-[55%] truncate rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold" title={status}>{status.replaceAll("_"," ")}</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <strong className="text-[25px] font-semibold leading-none tabular-nums">{progress === null ? "—" : `${progress}%`}</strong>
            <span className="text-right text-[11px] text-white/75">{total === null ? "Progress unavailable" : total === 0 ? "No stops recorded" : `${completed} of ${total} stops completed`}</span>
          </div>
          <div role={progress === null ? undefined : "progressbar"} aria-label={progress === null ? undefined : `Delivery progress for ${identity}`} aria-valuemin={progress === null ? undefined : 0} aria-valuemax={progress === null ? undefined : 100} aria-valuenow={progress ?? undefined} className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-[#ffd43b] transition-[width] duration-200 motion-reduce:transition-none" style={{width:`${progress ?? 0}%`}} />
          </div>
        </div>
        <div className="flex flex-1 flex-col px-5 pb-5">
          <DriverAvatar url={photoUrl} name={driver} />
          <div className="mt-2 min-w-0">
            <h3 className="truncate text-[17px] font-semibold text-[#0b2343]" title={identity}>{identity}</h3>
            <p className="mt-0.5 truncate text-[12px] text-[#718096]" title={[driver,carrier].filter(Boolean).join(" · ")}>{driver || "Driver not assigned"}{carrier ? ` · ${carrier}` : ""}</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 border-y border-[#edf0f4]">
            <Detail label="Origin" value={origin} />
            <Detail label="Destination" value={destination} />
            <Detail label="Delivery date" value={deliveryDate} />
            <Detail label="Plate number" value={plate} />
            <Detail label="Trip status" value={tripStatus ? tripStatus.replaceAll("_"," ") : "Not recorded"} />
            <Detail label="Loading date" value={loadingDate} />
            {deliveryStatus && <Detail label="Delivery status" value={deliveryStatus.replaceAll("_"," ")} />}
            {letterStatus && <Detail label="Letter status" value={letterStatus.replaceAll("_"," ")} />}
          </dl>
          {dr.length > 0 && <p className="mt-3 truncate text-[11px] text-slate-500" title={dr.join(", ")}>DR {dr.slice(0,2).join(", ")}{dr.length > 2 ? ` +${dr.length-2} more` : ""}</p>}
          {products.length > 0 && <p className="mt-1 truncate text-[11px] text-slate-500" title={products.join(", ")}>Products shown: {products.slice(0,2).join(", ")}{products.length > 2 ? ` +${products.length-2} more` : ""}</p>}
          {group.length === 1 && group[0]._card_summary !== true && extraColumns.length > 0 && <details className="mt-3 rounded-xl border border-[#e4e9f0] px-3 py-1.5">
            <summary className="cursor-pointer text-[11px] font-medium text-[#0b2343]">More record information ({extraColumns.length})</summary>
            <dl className="grid gap-x-3 gap-y-2 py-2 sm:grid-cols-2">{extraColumns.map(column => {
              const value = group[0][column.key];
              return <div key={column.key} className="min-w-0"><dt className="text-[10px] text-slate-400">{column.title}</dt><dd className="break-words text-[11px] text-[#0b2343]">{value === null || value === undefined || value === "" ? "Not recorded" : column.type === "date" ? dateLabel(String(value)) : String(value)}</dd></div>;
            })}</dl>
          </details>}
          <div className="mt-auto pt-4">
            <button type="button" disabled={!tripId || !onOpenTrip} onClick={() => onOpenTrip?.(tripId)} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0b2343] px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#17385f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b2343] disabled:cursor-not-allowed disabled:opacity-50" title={!tripId || !onOpenTrip ? "Trip details unavailable" : undefined}>
              View Details <ArrowUpRight aria-hidden="true" size={15} />
            </button>
          </div>
        </div>
      </article>;
    })}
    {loadingMore && <><span className="sr-only" role="status">Loading more dispatch cards</span>{Array.from({length:CARD_BATCH_SKELETON_COUNT},(_,index)=><DispatchCardSkeleton key={index}/>)}</>}
  </div>;
}
