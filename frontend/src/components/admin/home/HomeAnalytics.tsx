import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarRange, ChartNoAxesCombined, Clock3 } from "lucide-react";
import { EmptyState, SectionHeading } from "./HomePrimitives";
import type { homeAnalytics } from "./home-dashboard-data";

type Analytics = ReturnType<typeof homeAnalytics>;
const tooltipStyle = { borderRadius: 12, border: "1px solid #dce5ed", backgroundColor: "#fff", color: "#0b2341", fontSize: 12, boxShadow: "0 8px 28px #0b234114" };
const chartMargin = { top: 12, right: 16, left: -12, bottom: 0 };
export default function HomeAnalytics({ data, days, onDays, animate, detailsLoading, detailsUnavailable }: {
  data: Analytics; days: number; onDays: (days: number) => void; animate: boolean; detailsLoading: boolean; detailsUnavailable: boolean;
}) {
  const gradient = `home-volume-${useId().replaceAll(":", "")}`;
  const volume = data.series.reduce((sum, point) => sum + point.trips, 0);
  const completionCount = data.series.reduce((sum, point) => sum + point.completed, 0);
  const onTimePercent = data.comparable ? Math.round(data.onTime / data.comparable * 100) : null;
  const coverage = detailsUnavailable || detailsLoading && !data.assigned ? null : data.active ? Math.round(data.assigned / data.active * 100) : null;
  return <section className="home-analytics" aria-labelledby="home-analytics-title">
    <SectionHeading eyebrow="03 / Performance intelligence" title="The bigger picture" description="Trends from the latest loaded trips. Dates use Philippine time.">
      <div className="home-period-filter" role="group" aria-label="Analytics date range"><CalendarRange size={16} aria-hidden="true"/>{[7, 14, 30].map(period => <button key={period} type="button" aria-pressed={days === period} onClick={() => onDays(period)}>{period} days</button>)}</div>
    </SectionHeading>
    <div className="home-analytics-grid">
      <article className="home-panel home-volume-panel">
        <header className="home-chart-heading"><div><h3 id="home-analytics-title">Trip volume</h3><p>Trips grouped by loading date</p></div><span className="home-chart-total">{volume.toLocaleString()}<small>in this window</small></span></header>
        {volume ? <div className="home-chart" role="img" aria-label={`Trip volume over ${days} days: ${volume} trips. Values are in the data table below.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={data.series} margin={chartMargin} accessibilityLayer>
              <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2678b9" stopOpacity={0.28}/><stop offset="100%" stopColor="#2678b9" stopOpacity={0.015}/></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 5"/>
              <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={34} tick={{ fill: "#64748b", fontSize: 11 }} tickMargin={12}/>
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} width={42}/>
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#2678b9", strokeDasharray: "4 4" }}/>
              <Area name="Trips loaded" type="monotone" dataKey="trips" stroke="#2678b9" strokeWidth={2.5} fill={`url(#${gradient})`} activeDot={{ r: 5, stroke: "white", strokeWidth: 3 }} isAnimationActive={animate} animationDuration={550}/>
            </AreaChart>
          </ResponsiveContainer>
        </div> : <EmptyState title="No loading dates in this period" icon={ChartNoAxesCombined}>Choose a wider date range or open Trips to review older records.</EmptyState>}
        <div className="home-chart-footer"><span><i className="home-key-blue"/>Trips loaded</span><span>{days}-day view · recent-trip sample</span></div>
      </article>
      <article className="home-panel home-status-panel">
        <header className="home-chart-heading"><div><h3>Dispatch mix</h3><p>Current status of trips loaded in this period</p></div></header>
        {data.cohort.length ? <>
          <div className="home-donut" role="img" aria-label={data.distribution.map(slice => `${slice.name}: ${slice.value}`).join(", ")}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart accessibilityLayer><Pie data={data.distribution.filter(slice => slice.value > 0)} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="90%" startAngle={90} endAngle={-270} paddingAngle={3} stroke="none" isAnimationActive={animate} animationDuration={550}>{data.distribution.filter(slice => slice.value > 0).map(slice => <Cell key={slice.name} fill={slice.color}/>)}</Pie><Tooltip contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer>
            <div className="home-donut-center"><strong>{data.cohort.length}</strong><span>trips</span></div>
          </div>
          <ul className="home-chart-legend">{data.distribution.map(slice => <li key={slice.name}><span><i style={{ background: slice.color }} aria-hidden="true"/>{slice.name}</span><strong>{slice.value}<small>{Math.round(slice.value / data.cohort.length * 100)}%</small></strong></li>)}</ul>
        </> : <EmptyState title="No trips in this date range">Status distribution appears when trips have recorded loading dates.</EmptyState>}
      </article>
    </div>
    <div className="home-performance-grid">
      <article className="home-panel home-completion-panel">
        <header className="home-chart-heading"><div><h3>Recorded completions</h3><p>Completed trips with a recorded delivery completion date</p></div><strong className="home-inline-total">{detailsLoading && !completionCount ? "—" : completionCount}</strong></header>
        {detailsLoading && !completionCount ? <p className="home-data-note" role="status">Loading recorded delivery milestones...</p> : completionCount ? <div className="home-chart home-chart-short" role="img" aria-label={`${completionCount} recorded completed trips over ${days} days. Values are in the data table below.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={data.series} margin={chartMargin} accessibilityLayer><CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={36} tick={{ fill: "#64748b", fontSize: 11 }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} width={42} tick={{ fill: "#64748b", fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#edf6f2" }}/><Bar dataKey="completed" name="Recorded completed trips" fill="#16846c" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={animate} animationDuration={500}/></BarChart></ResponsiveContainer>
        </div> : <EmptyState title="No recorded completions in this period" icon={Clock3}>Completion dates appear after delivery milestones are recorded.</EmptyState>}
      </article>
      <article className="home-panel home-timing-panel"><header className="home-chart-heading"><div><h3>Delivery timing</h3><p>Actual completion day against the estimated delivery day</p></div></header>
        <div className="home-performance-score"><strong>{onTimePercent === null ? "—" : `${onTimePercent}%`}</strong><span>on or before estimate</span></div>
        {data.comparable > 0 ? <><div className="home-timing-track" role="img" aria-label={`${data.onTime} on time and ${data.late} late completed trips`}><span style={{ width: `${onTimePercent}%` }}/></div><div className="home-timing-labels"><span>On time <strong>{data.onTime}</strong></span><span>Late <strong>{data.late}</strong></span></div></> : <p className="home-data-note">{detailsLoading ? "Delivery details are still loading." : "No comparable completed trips in this period."}</p>}
        <p className="home-data-note">Based on {data.comparable} completed trips with both dates. {data.missingCompletion > 0 ? `${data.missingCompletion} loaded completed trips lack a completion date or estimate and are excluded.` : ""} {detailsUnavailable ? "Some operational detail is unavailable; this result may be incomplete." : ""}</p>
      </article>
      <article className="home-panel home-assignment-panel"><header className="home-chart-heading"><div><h3>Assignment coverage</h3><p>In-progress or delayed trips in the monitoring window</p></div></header>
        <div className="home-performance-score"><strong>{coverage === null ? "—" : `${coverage}%`}</strong><span>with a recorded truck</span></div>
        <div className="home-coverage-track" role="progressbar" aria-label="Active trip assignment coverage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage ?? undefined} aria-valuetext={coverage === null ? "No active trips in the monitoring window" : `${data.assigned} of ${data.active} active trips have a recorded truck`}><span style={{ transform: `scaleX(${(coverage ?? 0) / 100})` }}/></div>
        <div className="home-timing-labels"><span>Assigned <strong>{data.assigned}</strong></span><span>Active <strong>{data.active}</strong></span></div>
        <p className="home-data-note">Trip assignment coverage, not total fleet utilization. {detailsLoading ? "Truck details are still loading." : ""} {detailsUnavailable ? "Missing details can reduce the recorded coverage." : ""}</p>
      </article>
    </div>
    <details className="home-data-disclosure"><summary>View chart data and scope</summary><p>Charts use the latest loaded non-archived trips. Volume and dispatch mix use loading dates; completions and timing use recorded completion dates. Completion activity may be incomplete while details load. Estimated dates are day-level targets, not a contractual SLA.</p><div className="home-table-scroll"><table><caption className="sr-only">Operational chart values by Philippine calendar day</caption><thead><tr><th scope="col">Date</th><th scope="col">Trips loaded</th><th scope="col">Recorded completions</th><th scope="col">Recorded events</th></tr></thead><tbody>{data.series.map(point => <tr key={point.day}><th scope="row">{point.day}</th><td>{point.trips}</td><td>{point.completed}</td><td>{point.events}</td></tr>)}</tbody></table></div></details>
  </section>;
}
