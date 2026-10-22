export type LocationSearchResult = {
  display_name: string; latitude: number; longitude: number;
  name?: string; provinces?: string[]; cities?: string[]; country_code?: string;
  result_type?: string; provider?: "geoapify" | "nominatim";
};
export class LocationSearchError extends Error {
  constructor(message: string, readonly statusCode = 502) { super(message); this.name = "LocationSearchError"; }
}
// Provider/dashboard quotas cover all replicas; this queue limits this process.
let searchQueue: Promise<unknown> = Promise.resolve(), lastSearchAt = 0;
let budgetDay = "", usedToday = 0;
let providerRetryAfter = 0;
const cache = new Map<string, { expires: number; results: LocationSearchResult[] }>();
const pending = new Map<string, Promise<LocationSearchResult[]>>();
const strings = (...values: unknown[]) => values.filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

async function providerSearch(query: string, provider: string): Promise<LocationSearchResult[]> {
  const day = new Date().toISOString().slice(0, 10);
  if (budgetDay !== day) { budgetDay = day; usedToday = 0; }
  const limit = Number(process.env.GEOCODING_DAILY_LIMIT ?? 1000);
  if (!Number.isSafeInteger(limit) || limit < 1 || usedToday >= limit) throw new LocationSearchError("The location lookup budget has been reached. Save without coordinates and review later.", 429);
  let url: URL;
  if (provider === "geoapify") {
    if (!process.env.GEOAPIFY_API_KEY) throw new LocationSearchError("Location lookup is not configured. Set the backend GEOAPIFY_API_KEY. Destinations can still be saved without coordinates.", 503);
    url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.search = new URLSearchParams({ text: query, filter: "countrycode:ph", lang: "en", limit: "5", format: "json", apiKey: process.env.GEOAPIFY_API_KEY }).toString();
  } else if (provider === "nominatim") {
    if (!process.env.NOMINATIM_SEARCH_URL) throw new LocationSearchError("Configure a self-hosted Nominatim search URL before using this provider.", 503);
    url = new URL(process.env.NOMINATIM_SEARCH_URL);
    if (!["http:", "https:"].includes(url.protocol) || url.hostname.toLowerCase().endsWith("openstreetmap.org")) throw new LocationSearchError("Use a self-hosted Nominatim service for trip geocoding, not the public endpoint.", 503);
    url.search = new URLSearchParams({ q: query, countrycodes: "ph", format: "jsonv2", addressdetails: "1", namedetails: "1", limit: "5" }).toString();
  } else throw new LocationSearchError("Configure geoapify or a self-hosted nominatim provider.", 503);
  const configured = Number(process.env.GEOCODING_MIN_INTERVAL_MS ?? 600);
  const interval = Number.isFinite(configured) ? Math.max(provider === "nominatim" ? 1100 : 250, configured) : 1100;
  const wait = Math.max(0, interval - (Date.now() - lastSearchAt));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastSearchAt = Date.now(); usedToday++;
  let response: Response;
  try {
    response = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "ALZHEN-TMS/1.0 (delivery address review)" }, signal: AbortSignal.timeout(8000) });
  } catch { throw new LocationSearchError("The geocoding service is unavailable. Save without coordinates and review later."); }
  if (!response.ok) throw new LocationSearchError(response.status === 429 ? "Geocoding rate limit reached. Save without coordinates and retry location lookup later." : "The geocoding service could not complete this lookup.", response.status === 429 ? 429 : 502);
  let payload: any;
  try { payload = await response.json(); } catch { throw new LocationSearchError("Invalid geocoding response."); }
  const rows = provider === "geoapify" ? payload.results : payload;
  if (!Array.isArray(rows)) throw new LocationSearchError("Unexpected geocoding response.");
  return rows.flatMap((item: any): LocationSearchResult[] => {
    if (!item || typeof item !== "object") return [];
    const latitude = Number(item.lat), longitude = Number(item.lon), address = item.address ?? {};
    const display = provider === "geoapify" ? item.formatted : item.display_name;
    if (!display || typeof display !== "string" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180
      || !["number", "string"].includes(typeof item.lat) || !["number", "string"].includes(typeof item.lon) || !String(item.lat).trim() || !String(item.lon).trim()) return [];
    return [{ display_name: display, latitude, longitude, provider: provider as "geoapify" | "nominatim",
      name: item.name ?? item.namedetails?.name ?? "", country_code: item.country_code ?? address.country_code,
      provinces: provider === "geoapify" ? strings(item.state, item.county, item.state_district) : strings(address.state, address.province, address.county),
      cities: provider === "geoapify" ? strings(item.city, item.town, item.municipality) : strings(address.city, address.town, address.municipality),
      result_type: provider === "geoapify" ? item.result_type : item.addresstype ?? item.type }];
  });
}
export async function searchLocations(query: string): Promise<LocationSearchResult[]> {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 300) throw new LocationSearchError("Enter a location between 3 and 300 characters.", 400);
  const provider = process.env.GEOCODING_PROVIDER ?? "geoapify";
  const key = provider + ":" + normalized.toLocaleLowerCase();
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.results;
  const active = pending.get(key); if (active) return active;
  const request = searchQueue.catch(() => undefined).then(async () => {
    if (Date.now() < providerRetryAfter) throw new LocationSearchError("Location lookup is temporarily unavailable. Save without coordinates and review later.", 503);
    try { return await providerSearch(normalized, provider); }
    catch (error) {
      // An outage must not cost an eight-second timeout for every CSV destination.
      if (error instanceof LocationSearchError && (error.statusCode >= 500 || error.statusCode === 429)) providerRetryAfter = Date.now() + (error.statusCode === 429 ? 60000 : 30000);
      throw error;
    }
  });
  searchQueue = request; pending.set(key, request);
  try {
    const results = await request;
    cache.set(key, { expires: Date.now() + (results.length ? 3600000 : 60000), results });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return results;
  } finally { pending.delete(key); }
}
