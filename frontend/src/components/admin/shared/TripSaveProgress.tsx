import {Truck} from "lucide-react";

type Props = { value: number | null; operation: string };

/** Progress reflects completed work only. A pending server request stays at its last confirmed value. */
export default function TripSaveProgress({ value, operation }: Props) {
  const percent = value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return <div className="trip-save-progress" role="status" aria-live="polite" aria-label={`${operation}. ${percent === null ? "Saving" : `${percent}% complete`}`}>
    <div className="trip-save-progress-label"><strong>{operation}</strong><span>{percent === null ? "Saving" : `${percent}%`}</span></div>
    <div className={`trip-save-road${percent === null ? " trip-save-road-indeterminate" : ""}`} aria-hidden="true">
      <span className="trip-save-route" style={percent === null ? undefined : {width:`${percent}%`}}>
        <Truck className="trip-save-truck" size={29} strokeWidth={2.1}/>
      </span>
    </div>
    <progress className="trip-save-native-progress" max={100} value={percent === null ? undefined : percent} aria-label="Saving progress" />
  </div>;
}
