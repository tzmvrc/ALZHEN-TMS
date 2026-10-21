import { useState } from "react";
import { FileSpreadsheet, Upload, MapPin, Package, Truck, ChevronDown } from "lucide-react";
import TripTablePreview, { type TripPreviewRow } from "./TripTablePreview";
import ImportDestinationReview, { type DestinationSource, type LocationDecision } from "./ImportDestinationReview";
import TripCargoPlanner from "./TripCargoPlanner";
import type { CargoPlan, CargoLine } from "../../services/cargo-planning";

// --- TYPES ---
type TripImportLayoutProps = {
  token: string;
  lines: CargoLine[];
  plan: CargoPlan;
  onPlanChange: (plan: CargoPlan) => void;
  destinations: DestinationSource[];
  locationDecisions: Record<string, LocationDecision>;
  onLocationChange: (decisions: Record<string, LocationDecision>) => void;
  previewRows: TripPreviewRow[];
  fileName?: string;
  onFileChosen: (file: File) => void;
  onImportConfirm: () => void;
  isImporting?: boolean;
};

export default function TripImportLayout({
  token, lines, plan, onPlanChange, destinations, locationDecisions, onLocationChange,
  previewRows, fileName, onFileChosen, onImportConfirm, isImporting
}: TripImportLayoutProps) {
  const [previewOpen, setPreviewOpen] = useState(true);
  const verifiedCount = destinations.filter(d => locationDecisions[d.key]?.verified).length;

  return (
    // The main background is a soft gray, just like the reference image
    <div className="min-h-screen bg-slate-50/80 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0b2341]">Add Trip</h1>
          <p className="mt-1 text-sm text-slate-500">Import your CSV, review the data, and assign cargo.</p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          
          {/* --- LEFT COLUMN: Import & Review (Products / Destinations) --- */}
          <div className="space-y-6 lg:col-span-7 xl:col-span-8">
            
            {/* Card 1: File Upload */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold text-[#0b2341]">1. Import Data</h2>
              </div>
              
              {!fileName ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center transition hover:bg-slate-100">
                  <Upload className="mb-3 h-8 w-8 text-slate-400" />
                  <p className="text-sm text-slate-600">Drag and drop your CSV or XLSX here</p>
                  <label className="mt-4 cursor-pointer rounded-full bg-[#2678b9] px-4 py-2 text-sm font-medium text-white hover:bg-[#1f6499]">
                    Browse files
                    <input type="file" className="sr-only" accept=".csv,.xlsx" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onFileChosen(file);
                    }} />
                  </label>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-900">{fileName}</p>
                      <p className="text-xs text-emerald-700">{lines.length} product lines found</p>
                    </div>
                  </div>
                  <button onClick={onImportConfirm} disabled={isImporting} className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {isImporting ? "Processing..." : "Confirm Import"}
                  </button>
                </div>
              )}
            </section>

            {/* Card 2: CSV Preview (Collapsible) */}
            {previewRows.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <button 
                  onClick={() => setPreviewOpen(!previewOpen)}
                  className="flex w-full items-center justify-between bg-white p-5 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${previewOpen ? "" : "-rotate-90"}`} />
                    <h2 className="text-base font-semibold text-[#0b2341]">Raw CSV Preview</h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Not saved</span>
                </button>
                {previewOpen && (
                  <div className="border-t border-slate-100 p-5 pt-0">
                    <div className="mt-4">
                      {/* Using your existing TripTablePreview */}
                      <TripTablePreview rows={previewRows} title="CSV Data" description="" />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Card 3: Destinations & Locations */}
            {destinations.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <h2 className="text-base font-semibold text-[#0b2341]">2. Store & Location Review</h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span className={`rounded-full px-2.5 py-1 ${verifiedCount === destinations.length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {verifiedCount} of {destinations.length} verified
                    </span>
                  </div>
                </div>
                
                {/* Cleaner import of your destination component */}
                <div className="mt-2">
                  <ImportDestinationReview
                    token={token}
                    destinations={destinations}
                    decisions={locationDecisions}
                    onChange={onLocationChange}
                    disabled={isImporting}
                  />
                </div>
              </section>
            )}

            {/* Card 4: Product Lines Summary */}
            {lines.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                    <Package className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-semibold text-[#0b2341]">Product Lines ({lines.length})</h2>
                </div>
                
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">DR</th>
                        <th className="px-4 py-3 font-medium">Destination</th>
                        <th className="px-4 py-3 font-medium">Product</th>
                        <th className="px-4 py-3 text-right font-medium">Qty</th>
                        <th className="px-4 py-3 text-right font-medium">Total CBM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((line) => (
                        <tr key={line.key} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{line.dr || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-800">{line.stop}</td>
                          <td className="px-4 py-2.5 text-slate-800">{line.label}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{line.quantity}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{line.cbm}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>

          {/* --- RIGHT COLUMN: Assignment (Trucks, Drivers, Cargo) --- */}
          <div className="space-y-6 lg:col-span-5 xl:col-span-4">
            
            {/* If no products loaded, show a placeholder */}
            {lines.length === 0 && (
              <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
                <Truck className="mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">Awaiting Import</p>
                <p className="mt-1 text-xs text-slate-500">Upload a file to begin assigning trucks and cargo.</p>
              </div>
            )}

            {/* Truck & Cargo Planner - mapped to right panel */}
            {lines.length > 0 && (
              <div className="sticky top-6">
                <TripCargoPlanner
                  token={token}
                  lines={lines}
                  plan={plan}
                  onChange={onPlanChange}
                  disabled={isImporting}
                />
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}