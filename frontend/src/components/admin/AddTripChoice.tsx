import { useState } from "react";
import { ArrowRight, FileSpreadsheet, Route, Truck, X } from "lucide-react";
import { tripModalBackdrop, tripPrimaryAction } from "./shared/TripModalUI";
import { useTripModal } from "./shared/useTripModal";

export default function AddTripChoice({ onManual, onImport, onClose }: {
  onManual: () => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<"manual" | "import" | null>(null);
  const { ref, close } = useTripModal<HTMLElement>({ onClose });
  return <div className={`${tripModalBackdrop} z-[2200]`}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="add-trip-choice-title" aria-describedby="add-trip-choice-description" className="trip-choice-dialog">
      <header className="trip-choice-header">
        <span className="trip-choice-header-icon" aria-hidden="true"><Route size={21} /></span>
        <div className="trip-choice-heading">
          <h2 id="add-trip-choice-title" tabIndex={-1} data-trip-initial-focus>Add trip</h2>
          <p id="add-trip-choice-description">Choose how you want to add a new trip.</p>
        </div>
        <button type="button" className="trip-choice-close" aria-label="Close Add Trip" onClick={close}><X size={18} aria-hidden="true" /></button>
      </header>
      <fieldset className="trip-choice-options">
        <legend className="sr-only">How to add a trip</legend>
        <label className="trip-choice-card" data-selected={selected === "manual"}>
          <span className="trip-choice-card-top"><span className="trip-choice-icon" aria-hidden="true"><Truck size={20} /></span><span className="trip-choice-badge">Single trip</span></span>
          <strong>Manual add</strong>
          <span className="trip-choice-description">Enter trip details yourself.</span>
          <span className="trip-choice-card-bottom"><span className="trip-choice-tags"><span>Route</span><span>Vehicle</span><span>Driver</span></span><input type="radio" name="add-trip-method" value="manual" checked={selected === "manual"} onChange={() => setSelected("manual")} aria-label="Manual add" /></span>
        </label>
        <label className="trip-choice-card" data-selected={selected === "import"}>
          <span className="trip-choice-card-top"><span className="trip-choice-icon" aria-hidden="true"><FileSpreadsheet size={20} /></span><span className="trip-choice-badge">Bulk</span></span>
          <strong>Import CSV/Excel</strong>
          <span className="trip-choice-description">Upload CSV or XLSX files.</span>
          <span className="trip-choice-card-bottom"><span className="trip-choice-tags"><span>.csv</span><span>.xlsx</span></span><input type="radio" name="add-trip-method" value="import" checked={selected === "import"} onChange={() => setSelected("import")} aria-label="Import CSV or Excel" /></span>
        </label>
      </fieldset>
      <footer className="trip-choice-footer"><button type="button" className={tripPrimaryAction} disabled={!selected} onClick={() => { if (selected === "manual") onManual(); else if (selected === "import") onImport(); }}>Continue <ArrowRight size={16} aria-hidden="true" /></button></footer>
    </section>
  </div>;
}
