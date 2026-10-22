export const WORKSPACE_SHEETS = [
  { key: "trips", title: "Master List", description: "Manage trips, truck assignments, delivery progress, and operational issues.", report: "dispatch-monitoring" },
  { key: "dispatch-monitoring", title: "Dispatch Monitoring", description: "Track truck movements, loading milestones, and delivery progress.", report: "dispatch-monitoring" },
  { key: "dispatch", title: "Dispatch Report", description: "Review dispatch details, delivery stops, cargo, and recorded exceptions.", report: "dispatch" },
  { key: "trip-booking", title: "Trip Booking", description: "Review trip bookings, destinations, product quantities, and dispatch letters.", report: "trip-booking" },
  { key: "store-calling", title: "Store Calling", description: "Manage assigned store calls, contact details, and delivery confirmations.", report: "store-calling" },
] as const;
export type WorkspaceSheet = typeof WORKSPACE_SHEETS[number]["key"];
/** Legacy Combined links open the main Trips projection, retaining the backend view. */
export function workspaceSheet(value: string): WorkspaceSheet {
  return WORKSPACE_SHEETS.find(sheet => sheet.key === value)?.key ?? "trips";
}

export function workspaceReportFromLocation(pathname:string, search="") {
  const query=new URLSearchParams(search), candidate=query.get("sheet")??query.get("report");
  if(candidate==="combined"||candidate==="trips")return "combined" as const;
  const requested=WORKSPACE_SHEETS.find(sheet=>sheet.key===candidate);
  if(requested)return requested.report;
  const match=/^\/reports(?:\/([^/]+))?\/?$/.exec(pathname);
  if(match)return WORKSPACE_SHEETS.find(sheet=>sheet.key===match[1])?.report??"combined";
  if(pathname==="/trips")return "combined" as const;
  return undefined;
}
