export type Region = "Luzon" | "Visayas" | "Mindanao";

/** Approximate island-group lookup from a GPS fix. */
export function regionFromPoint([lat, lng]: [number, number]): Region | null {
  if (lat < 4.5 || lat > 21.5 || lng < 116 || lng > 128) return null;
  if (lat >= 12.5) return "Luzon";
  if (lng >= 125 && lat < 10.2) return "Mindanao";
  if (lat >= 9.3 && lng >= 121.9 && lng <= 126.3) return "Visayas";
  return "Mindanao";
}

/** Fallback when a trip has no GPS: match place names in warehouse/store text. */
export function regionFromText(text: string): Region | null {
  const t = text.toLowerCase();
  if (/davao|cdo|cagayan de oro|gensan|general santos|butuan|zamboanga|cotabato|mindanao|iligan|surigao|digos/.test(t)) return "Mindanao";
  if (/cebu|iloilo|bacolod|tacloban|leyte|samar|bohol|dumaguete|visayas|roxas|negros|mandaue|lapu/.test(t)) return "Visayas";
  if (/luzon|manila|laguna|cavite|pampanga|batangas|bulacan|rizal|quezon|baguio|tarlac|cabuyao|calamba|bicol|legazpi|naga|ilocos|cagayan valley|makati|taguig|pasig/.test(t)) return "Luzon";
  return null;
}
