import {useState} from "react";
import {Search} from "lucide-react";
import {searchWarehouseLocations,type LocationSearchResult} from "../../services/master-data.service";
export default function DatabaseLocationSearch({ accessToken, onSelect }: { accessToken: string | null; onSelect: (location: LocationSearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    if (!accessToken || query.trim().length < 3) return;
    setSearching(true);
    setSearched(false);
    setError("");
    try {
      setResults(await searchWarehouseLocations(accessToken, query));
      setSearched(true);
    } catch (cause) {
      setResults([]);
      setError(cause instanceof Error ? cause.message : "Unable to search map locations.");
    } finally {
      setSearching(false);
    }
  };

  return <div className="mt-4 space-y-2">
    <label htmlFor="record-location-search" className="block text-xs font-medium text-slate-600">Search location on map</label>
    <div className="flex gap-2">
      <input id="record-location-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setSearched(false); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="Search an address or place" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
      <button type="button" onClick={() => void search()} disabled={searching || query.trim().length < 3} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#0b2341] px-4 text-sm font-medium text-white disabled:opacity-50"><Search className="h-4 w-4" />{searching ? "Searching…" : "Search"}</button>
    </div>
    <p className="text-[11px] text-slate-500">Choose a proposed result, inspect its address and coordinates, then confirm verification separately. Map data © OpenStreetMap contributors.</p>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {results.length > 0 && <ul aria-label="Map search results" className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">{results.map((location, index) => <li key={`${location.latitude}:${location.longitude}:${index}`}><button type="button" onClick={() => onSelect(location)} className="w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 last:border-0 hover:bg-slate-50">{location.display_name}<span className="mt-1 block text-[10px] text-slate-400">{location.latitude}, {location.longitude}</span></button></li>)}</ul>}
    {searched && results.length === 0 && <p className="text-xs text-slate-500">No map locations found. Try a nearby address or place name.</p>}
  </div>;
}

