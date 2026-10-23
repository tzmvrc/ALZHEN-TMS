import { ChevronDown } from "lucide-react";
import { cargoTotal, type CargoLine, type CargoTruck } from "../../../services/cargo-planning";
import SectionCard from "./SectionCard";
import CapacityBar from "./CapacityBar";
import StatChip from "./StatChip";
import StatusChip from "./StatusChip";
import { focusRing } from "./styles";

export function displayCargoTotal(values: string[]) {
  try { return cargoTotal(values); } catch { return "Check values"; }
}
type Props = { dispatch: string; tripNumber: string; tripType: string; status: string; loadingDate: string; etaDate: string; stops: number; lines: CargoLine[]; trucks: CargoTruck[]; mobile?: boolean };
export default function TripLiveSummary({ dispatch, tripNumber, tripType, status, loadingDate, etaDate, stops, lines, trucks, mobile = false }: Props) {
  const cbm = displayCargoTotal(lines.map(line => line.cbm));
  const capacity = trucks.every(truck => truck.capacity) ? displayCargoTotal(trucks.map(truck => truck.capacity)) : "";
  const content = <SectionCard title="Live trip summary" description="Updates as you plan your trip.">
    <StatusChip label={status} tone="info" />
    <dl className="mt-4 space-y-3 text-xs">{[["Dispatch", dispatch], ["Trip no.", tripNumber], ["Type", tripType || "Not selected"], ["Loading", loadingDate || "Not scheduled"], ["Estimated delivery", etaDate || "Not scheduled"]].map(([label, value]) => <div key={label} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2"><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium tabular-nums text-[#0b2341]">{value}</dd></div>)}</dl>
    <div className="my-4 flex flex-wrap gap-2"><StatChip label="Stops" value={stops} /><StatChip label="Qty" value={displayCargoTotal(lines.map(line => line.quantity))} /><StatChip label="Trucks" value={trucks.length} /></div>
    <CapacityBar label="Trip cargo / capacity" assigned={cbm} capacity={trucks.length ? capacity : ""} />
  </SectionCard>;
  return mobile ? <details className="mb-3 lg:hidden"><summary className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs font-medium text-[#0b2341] ${focusRing}`}><span className="min-w-0 truncate">{dispatch}</span><span className="shrink-0 tabular-nums">{stops} stops · {cbm} CBM · {trucks.length} trucks</span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="sr-only">Expand live trip summary</span></summary><div className="mt-2 max-h-[30dvh] overflow-y-auto">{content}</div></details> : content;
}
