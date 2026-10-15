export type LocationSearchResult = {
  display_name: string;
  latitude: number;
  longitude: number;
};

export class LocationSearchError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
    this.name = "LocationSearchError";
  }
}

let searchQueue: Promise<void> = Promise.resolve();
let lastSearchAt = 0;

async function waitForSearchSlot() {
  let release!: () => void;
  const currentSearch = new Promise<void>((resolve) => { release = resolve; });
  const previousSearch = searchQueue;
  searchQueue = currentSearch;
  await previousSearch;

  const waitMs = Math.max(0, 1_000 - (Date.now() - lastSearchAt));
  if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  lastSearchAt = Date.now();
  release();
}

export async function searchLocations(query: string): Promise<LocationSearchResult[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3) {
    throw new LocationSearchError("Enter at least 3 characters to search.", 400);
  }
  if (normalizedQuery.length > 200) {
    throw new LocationSearchError("Location search must be 200 characters or fewer.", 400);
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    format: "jsonv2",
    limit: "5",
    q: normalizedQuery,
  }).toString();

  let response: Response;
  try {
    await waitForSearchSlot();
    response = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "ALZHEN-TMS/1.0 (warehouse location search)",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("Warehouse location search request failed:", error);
    throw new LocationSearchError("Unable to search map locations right now.");
  }

  if (!response.ok) {
    console.error("Warehouse location search provider returned an error:", { status: response.status });
    throw new LocationSearchError("Unable to search map locations right now.");
  }

  let results: unknown;
  try {
    results = await response.json();
  } catch (error) {
    console.error("Warehouse location search returned invalid JSON:", error);
    throw new LocationSearchError("Unable to read map search results.");
  }
  if (!Array.isArray(results)) {
    throw new LocationSearchError("Map search returned an unexpected response.");
  }

  return results.flatMap((result): LocationSearchResult[] => {
    if (!result || typeof result !== "object") return [];
    const item = result as Record<string, unknown>;
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (
      typeof item.display_name !== "string" ||
      !item.display_name ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) return [];
    return [{ display_name: item.display_name, latitude, longitude }];
  });
}
