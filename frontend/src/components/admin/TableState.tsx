export default function TableState({ loading = false, error, message, description }: {
  loading?: boolean;
  error?: string | null;
  message: string;
  description?: string;
}) {
  return <div role={error ? "alert" : "status"} className="flex min-h-56 w-full min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
    <div className="max-w-md">
      <p className={`text-sm font-semibold ${error ? "text-rose-700" : "text-slate-700"}`}>{error || (loading ? "Loading report rows…" : message)}</p>
      {!error && !loading && description && <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>}
    </div>
  </div>;
}
