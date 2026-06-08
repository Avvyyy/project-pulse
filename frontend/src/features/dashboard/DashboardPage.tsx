import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type DashboardData, type Period, type ServiceHealth } from '../../api/dashboard';
import { NavBar }       from '../../components/NavBar';
import { KpiCard }      from '../../components/KpiCard';
import { VolumeChart }  from '../../components/VolumeChart';
import { Spinner }      from '../../components/PageState';
import { relativeTime } from '../../utils/time';

const PERIODS: Period[] = ['24h', '7d', '30d'];

const SERVICE_STATUS: Record<ServiceHealth['status'], { label: string; cls: string }> = {
  healthy:  { label: '✓',  cls: 'text-emerald-400' },
  degraded: { label: '!',  cls: 'text-amber-400'   },
  critical: { label: '✗',  cls: 'text-red-400'     },
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-yellow-400',
  low:      'text-emerald-400',
};

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-red-500',
  warn:  'text-amber-500',
  info:  'text-blue-500',
  debug: 'text-violet-500',
};

const TH = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-edge';
const TD = 'px-3 py-2.5 text-sm text-slate-300 border-b border-surface-2';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [period,  setPeriod]  = useState<Period>('24h');
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load(p: Period) {
    setLoading(true);
    setError(null);
    try {
      const d = await dashboardApi.get(p);
      setData(d);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(period);
    timerRef.current = setInterval(() => load(period), 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [period]);

  const ov = data?.overview;

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <NavBar breadcrumbs={[{ label: 'Dashboard' }]} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 space-y-6">

        {/* ── Header + controls ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
            {lastRefresh && (
              <p className="text-xs text-slate-500 mt-0.5">
                Refreshes every 60s · last {relativeTime(lastRefresh.toISOString())}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {PERIODS.map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3.5 py-1.5 rounded-md border text-sm transition-colors ${
                  period === p
                    ? 'border-accent text-slate-200 bg-accent/10 font-semibold'
                    : 'border-edge text-slate-400 hover:border-slate-500'
                }`}>
                {p}
              </button>
            ))}
            <button
              onClick={() => load(period)}
              disabled={loading}
              className="border border-edge text-slate-400 text-sm px-3 py-1.5 rounded-md hover:border-slate-500 transition-colors disabled:opacity-40">
              ↻
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        {loading && !data && <Spinner />}

        {data && (
          <>
            {/* ── KPI cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard
                label="Events"
                value={ov!.eventsThisPeriod}
                delta={ov!.eventsThisPeriod - ov!.eventsPrevPeriod}
                subtext={`${ov!.eventsPrevPeriod.toLocaleString()} prev`}
              />
              <KpiCard
                label="Errors"
                value={ov!.errorsThisPeriod}
                delta={ov!.errorsThisPeriod - ov!.errorsPrevPeriod}
                badWhenPositive
                subtext={`${ov!.errorsPrevPeriod.toLocaleString()} prev`}
                alert={ov!.errorsThisPeriod > ov!.errorsPrevPeriod * 1.5}
              />
              <KpiCard
                label="Error rate"
                value={`${(ov!.errorRate * 100).toFixed(1)}%`}
                subtext={`${ov!.errorsThisPeriod.toLocaleString()} / ${ov!.eventsThisPeriod.toLocaleString()}`}
                alert={ov!.errorRate > 0.15}
              />
              <KpiCard
                label="Open incidents"
                value={ov!.activeIncidents}
                subtext="open + investigating"
                alert={ov!.activeIncidents > 0}
              />
              <KpiCard
                label="Firing alerts"
                value={ov!.firingAlerts}
                alert={ov!.firingAlerts > 0}
              />
              <KpiCard
                label="Open groups"
                value={ov!.openErrorGroups}
                subtext="unresolved error groups"
              />
            </div>

            {/* ── Volume trend ── */}
            <section className="bg-surface border border-edge rounded-xl p-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
                Event Volume · {period}
              </h2>
              <VolumeChart data={data.volumeTrend} period={period} />
            </section>

            {/* ── Service health + top error groups ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              <section className="bg-surface border border-edge rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Service Health
                </h2>
                {data.serviceHealth.length === 0 ? (
                  <p className="text-slate-500 text-sm">No events in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className={TH}>Service</th>
                          <th className={`${TH} text-right`}>Events</th>
                          <th className={`${TH} text-right`}>Errors</th>
                          <th className={`${TH} text-right`}>Rate</th>
                          <th className={TH}>Groups</th>
                          <th className={TH}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.serviceHealth.map((s) => {
                          const st = SERVICE_STATUS[s.status];
                          return (
                            <tr key={s.service} className="hover:bg-surface-2 transition-colors">
                              <td className={`${TD} font-medium text-slate-200`}>{s.service}</td>
                              <td className={`${TD} text-right tabular-nums`}>{s.eventsTotal.toLocaleString()}</td>
                              <td className={`${TD} text-right tabular-nums text-red-400`}>{s.errorsTotal.toLocaleString()}</td>
                              <td className={`${TD} text-right tabular-nums font-semibold ${
                                s.errorRate > 0.15 ? 'text-red-400' : s.errorRate > 0.05 ? 'text-amber-400' : 'text-slate-400'
                              }`}>
                                {(s.errorRate * 100).toFixed(1)}%
                              </td>
                              <td className={`${TD} tabular-nums ${s.openErrorGroups > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                {s.openErrorGroups}
                              </td>
                              <td className={`${TD} font-bold ${st.cls}`}>{st.label}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="bg-surface border border-edge rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Top Recurring Errors
                </h2>
                {data.topErrorGroups.length === 0 ? (
                  <p className="text-slate-500 text-sm">No open error groups.</p>
                ) : (
                  <ol className="flex flex-col divide-y divide-edge">
                    {data.topErrorGroups.map((g, i) => (
                      <li
                        key={g.id}
                        className="flex items-start gap-3 py-2.5 cursor-pointer hover:bg-surface-2 -mx-2 px-2 rounded transition-colors"
                        onClick={() => navigate(`/incidents`)}>
                        <span className="text-slate-600 text-xs font-bold w-4 shrink-0 mt-0.5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-200 text-sm truncate leading-tight">{g.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            <span className={LEVEL_COLOR[g.level] ?? 'text-slate-500'}>{g.level}</span>
                            {' · '}{g.service}
                            {' · '}{relativeTime(g.lastSeenAt)}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-slate-300 tabular-nums shrink-0">
                          {g.occurrenceCount.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>

            {/* ── Incident summary + top error types ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              <section className="bg-surface border border-edge rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
                  Incident Summary
                </h2>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {([
                    ['Open',          data.incidentSummary.open,             true ],
                    ['Investigating', data.incidentSummary.investigating,     data.incidentSummary.investigating > 0],
                    [`Resolved (${period})`, data.incidentSummary.resolvedInPeriod, false],
                  ] as [string, number, boolean][]).map(([label, val, bad]) => (
                    <div key={label} className="bg-canvas border border-edge rounded-lg px-3 py-2.5">
                      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
                      <p className={`text-xl font-bold mt-0.5 ${bad && val > 0 ? 'text-red-400' : 'text-slate-200'}`}>
                        {val}
                      </p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Active by severity</p>
                  <div className="flex flex-col gap-1.5">
                    {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
                      const n = data.incidentSummary.bySeverity[sev] ?? 0;
                      return (
                        <div key={sev} className="flex items-center gap-2">
                          <span className={`text-xs font-bold uppercase w-16 ${SEVERITY_COLOR[sev]}`}>{sev}</span>
                          <div className="flex-1 h-1.5 bg-canvas rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-current"
                              style={{
                                width: n > 0
                                  ? `${Math.min(100, (n / Math.max(1, data.incidentSummary.open + data.incidentSummary.investigating)) * 100)}%`
                                  : '0',
                                color: SEVERITY_COLOR[sev]?.replace('text-', '') ?? '#64748b',
                                backgroundColor: sev === 'critical' ? '#ef4444' : sev === 'high' ? '#f97316' : sev === 'medium' ? '#eab308' : '#22c55e',
                              }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-4 text-right tabular-nums">{n}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="bg-surface border border-edge rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Top Error Types · {period}
                </h2>
                {data.topErrorTypes.length === 0 ? (
                  <p className="text-slate-500 text-sm">No typed errors in this period.</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {data.topErrorTypes.map((et, i) => {
                      const max   = data.topErrorTypes[0]?.count ?? 1;
                      const width = `${(et.count / max) * 100}%`;
                      return (
                        <li key={et.errorType} className="flex items-center gap-2.5">
                          <span className="text-slate-600 text-xs font-bold w-4 shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-slate-200 text-xs font-medium truncate">{et.errorType}</span>
                              <span className="text-slate-400 text-xs tabular-nums ml-2 shrink-0">{et.count.toLocaleString()}</span>
                            </div>
                            <div className="h-1 bg-canvas rounded-full overflow-hidden">
                              <div className="h-full bg-red-500/60 rounded-full" style={{ width }} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
