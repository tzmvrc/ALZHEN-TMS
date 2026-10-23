import { Truck } from "lucide-react";
import type { ReactNode } from "react";
import SectionCard from "./SectionCard";
import CapacityBar from "./CapacityBar";
import type { cargoCapacity } from "../../../services/cargo-planning";
export default function TruckCard({ title, description, assigned, capacity, actions, children, availability, usage }: { title: string; description?: string; assigned: string; capacity: string; actions?: ReactNode; children?: ReactNode; availability?: ReactNode; usage?: ReturnType<typeof cargoCapacity> }) {
  return <SectionCard title={title} description={description} icon={<Truck className="h-5 w-5" />} actions={actions}>{availability && <div className="mb-3">{availability}</div>}<CapacityBar assigned={assigned} capacity={capacity} usage={usage} label={`${title} capacity`} />{children && <div className="mt-4 border-t border-slate-100 pt-4">{children}</div>}</SectionCard>;
}
