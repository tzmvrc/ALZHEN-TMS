/** Keep authentication gates independent of chart/report bundles. */
export default function RouteLoading(){
 return <div role="status" aria-label="Restoring session" className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-5xl space-y-4"><div className="h-12 animate-pulse rounded bg-slate-200"/><div className="h-72 animate-pulse rounded border border-slate-200 bg-white"/></div></div>;
}
