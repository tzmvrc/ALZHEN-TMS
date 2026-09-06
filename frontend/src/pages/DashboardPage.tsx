import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

const summary = [
  { label: "Active jobs", value: "128", tone: "cyan" },
  { label: "On-time rate", value: "96.4%", tone: "emerald" },
  { label: "Open alerts", value: "14", tone: "amber" },
  { label: "Avg. response", value: "2.4h", tone: "violet" },
];

const tasks = [
  { name: "Fleet check", owner: "A. Smith", status: "In progress" },
  { name: "Route optimization", owner: "M. Lee", status: "Queued" },
  { name: "Customer briefing", owner: "S. Ross", status: "Completed" },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">
              Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white">
              Operations overview
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary">Export</Button>
            <Button>New report</Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summary.map((item) => (
            <Card
              key={item.label}
              className="border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">{item.label}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-3xl font-bold text-white">
                  {item.value}
                </span>
                <span
                  className={
                    item.tone === "cyan"
                      ? "rounded-full bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-300"
                      : item.tone === "emerald"
                        ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300"
                        : item.tone === "amber"
                          ? "rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300"
                          : "rounded-full bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-300"
                  }>
                  Live
                </span>
              </div>
            </Card>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Card className="border border-slate-800 bg-slate-900 p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Recent activity
              </h2>
              <span className="text-sm text-slate-400">Updated 5 min ago</span>
            </div>

            <div className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.name}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                  <div>
                    <p className="font-medium text-white">{task.name}</p>
                    <p className="text-sm text-slate-400">
                      Owner: {task.owner}
                    </p>
                  </div>
                  <span
                    className={
                      task.status === "Completed"
                        ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300"
                        : task.status === "In progress"
                          ? "rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-300"
                          : "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300"
                    }>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-xl font-semibold text-white">Quick actions</h2>
            <div className="mt-5 space-y-3">
              <Button className="w-full justify-center">Create schedule</Button>
              <Button variant="secondary" className="w-full justify-center">
                Review incidents
              </Button>
              <Button variant="secondary" className="w-full justify-center">
                View inventory
              </Button>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
