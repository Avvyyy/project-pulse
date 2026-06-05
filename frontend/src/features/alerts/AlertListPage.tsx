import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlertStore } from '../../store/alertStore';
import { alertsApi, type CreateAlertPayload } from '../../api/alerts';
import { NavBar }           from '../../components/NavBar';
import { Card }             from '../../components/Card';
import { AlertStateBadge }  from '../../components/AlertStateBadge';
import { ConditionSummary } from '../../components/ConditionSummary';
import { ConditionBuilder } from '../../components/ConditionBuilder';
import { Spinner, EmptyState } from '../../components/PageState';
import { relativeTime } from '../../utils/time';
import type { AlertCondition, AlertState } from '../../types';
import { alertState } from '../../types';

const EMPTY_FORM: CreateAlertPayload = {
  name: '', description: '', service: '', environment: '', level: '',
  condition: { type: 'threshold', metric: 'error_count', threshold: 100, windowSeconds: 300 },
  isActive: true,
};

const INPUT = 'w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent outline-none';
const LABEL = 'flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500';

export default function AlertListPage() {
  const navigate = useNavigate();
  const { list, listLoading, error, fetchList } = useAlertStore();

  const [showCreate, setShowCreate] = useState(false);
  const [form,       setForm]       = useState<CreateAlertPayload>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [stateFilter, setStateFilter] = useState<'' | 'firing' | 'ok' | 'paused'>('');

  useEffect(() => { fetchList(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await alertsApi.create({
        ...form,
        service:     form.service     || undefined,
        environment: form.environment || undefined,
        level:       form.level       || undefined,
        description: form.description || undefined,
      });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      fetchList();
    } finally { setSubmitting(false); }
  }

  async function handleToggle(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await alertsApi.toggle(id);
    fetchList();
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('Delete this alert rule?')) return;
    await alertsApi.remove(id);
    fetchList();
  }

  const filtered = list?.results.filter((a) => {
    if (!stateFilter) return true;
    return alertState(a) === stateFilter;
  }) ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <NavBar breadcrumbs={[{ label: 'Alerts' }]} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        {/* header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Alert Rules</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {list ? `${list.total} rule${list.total !== 1 ? 's' : ''}` : '—'}
              {' · '}evaluates every minute
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + New Rule
          </button>
        </div>

        {/* state filter chips */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {(['', 'firing', 'ok', 'paused'] as const).map((s) => (
            <button key={s}
              onClick={() => setStateFilter(s)}
              className={`px-3.5 py-1.5 rounded-md border text-sm transition-colors ${
                stateFilter === s
                  ? 'border-accent text-slate-200 bg-accent/10'
                  : 'border-edge text-slate-500 hover:border-slate-500'
              }`}>
              {s || 'All'}
            </button>
          ))}
        </div>

        {listLoading && <Spinner />}
        {error && <div className="bg-red-950 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
        {!listLoading && filtered.length === 0 && (
          <EmptyState icon="🔔" message="No alert rules yet." detail="Create a rule to start monitoring." />
        )}

        <div className="flex flex-col gap-3">
          {filtered.map((alert) => {
            const state      = alertState(alert);
            const latest     = alert.triggers?.[0];
            const lastFired  = latest?.triggeredAt;

            return (
              <Card
                key={alert.id}
                className={`cursor-pointer hover:border-accent transition-colors ${state === 'firing' ? 'border-red-800' : ''}`}
              >
                <div onClick={() => navigate(`/alerts/${alert.id}`)}>
                  <div className="flex items-start gap-2.5 mb-2 flex-wrap">
                    <AlertStateBadge state={state as AlertState} />
                    {!alert.isActive && (
                      <span className="text-xs text-slate-500 border border-edge px-2 py-0.5 rounded">paused</span>
                    )}
                    <h2 className="text-slate-100 font-semibold text-sm flex-1">{alert.name}</h2>
                  </div>

                  <p className="text-slate-400 text-sm mb-2.5">
                    <ConditionSummary condition={alert.condition} />
                  </p>

                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    {alert.service     && <span>📦 {alert.service}</span>}
                    {alert.environment && <span>🌍 {alert.environment}</span>}
                    {alert.level       && <span>🔖 {alert.level}</span>}
                    {lastFired
                      ? <span>🔔 last fired {relativeTime(lastFired)}</span>
                      : <span className="text-slate-600">never fired</span>}
                    {alert._count && <span>{alert._count.triggers} triggers total</span>}
                  </div>
                </div>

                {/* row actions */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-edge">
                  <button
                    onClick={(e) => handleToggle(e, alert.id)}
                    className="text-xs text-slate-400 hover:text-slate-200 border border-edge px-3 py-1 rounded transition-colors">
                    {alert.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, alert.id)}
                    className="text-xs text-red-500 hover:text-red-400 border border-edge px-3 py-1 rounded transition-colors ml-auto">
                    Delete
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      </main>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 overflow-y-auto p-4"
          onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="bg-surface border border-edge rounded-xl p-7 w-[560px] max-w-full my-auto">
            <h2 className="text-lg font-bold text-slate-100 mb-5">New Alert Rule</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <label className={LABEL}>
                Name *
                <input required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. High error rate on auth-service"
                  className={INPUT} />
              </label>

              <label className={LABEL}>
                Description
                <textarea value={form.description} rows={2}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="When should this alert fire and why?"
                  className={`${INPUT} resize-y`} />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className={LABEL}>
                  Service
                  <input value={form.service}
                    onChange={(e) => setForm({ ...form, service: e.target.value })}
                    placeholder="all" className={INPUT} />
                </label>
                <label className={LABEL}>
                  Environment
                  <input value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value })}
                    placeholder="all" className={INPUT} />
                </label>
                <label className={LABEL}>
                  Level
                  <select value={form.level}
                    onChange={(e) => setForm({ ...form, level: e.target.value })}
                    className={INPUT}>
                    <option value="">all</option>
                    <option value="error">error</option>
                    <option value="warn">warn</option>
                    <option value="info">info</option>
                  </select>
                </label>
              </div>

              <div className="border border-edge rounded-lg p-4 bg-canvas">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Condition</p>
                <ConditionBuilder
                  value={form.condition}
                  onChange={(c) => setForm({ ...form, condition: c })}
                />
              </div>

              <div className="flex gap-2.5 mt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-accent hover:bg-accent-hover text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
                  {submitting ? 'Creating…' : 'Create Rule'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-5 text-sm text-slate-400 border border-edge rounded-lg hover:border-slate-500 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
