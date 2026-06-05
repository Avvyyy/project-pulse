import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIncidentStore } from '../../store/incidentStore';
import { incidentsApi, type CreateIncidentPayload } from '../../api/incidents';
import { NavBar }        from '../../components/NavBar';
import { StatusBadge }   from '../../components/StatusBadge';
import { SeverityBadge } from '../../components/SeverityBadge';
import { EmptyState, Spinner } from '../../components/PageState';
import { relativeTime } from '../../utils/time';
import type { IncidentStatus, IncidentSeverity } from '../../types';

const STATUS_FILTERS = ['', 'open', 'investigating', 'resolved'] as const;
const EMPTY_FORM: CreateIncidentPayload = {
  title: '', severity: 'high', description: '', service: '', environment: '',
};

const INPUT = 'w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent outline-none';
const LABEL = 'flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500';

export default function IncidentListPage() {
  const navigate = useNavigate();
  const { list, listLoading, error, fetchList } = useIncidentStore();

  const [statusFilter,   setStatusFilter]   = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [showCreate,     setShowCreate]     = useState(false);
  const [form,           setForm]           = useState<CreateIncidentPayload>(EMPTY_FORM);
  const [creating,       setCreating]       = useState(false);

  useEffect(() => {
    fetchList({ status: statusFilter || undefined, severity: severityFilter || undefined });
  }, [statusFilter, severityFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await incidentsApi.create(form);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      fetchList();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <NavBar breadcrumbs={[{ label: 'Incidents' }]} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        {/* header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Incidents</h1>
            <p className="text-sm text-slate-500 mt-0.5">{list ? `${list.total} total` : '—'}</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + Create Incident
          </button>
        </div>

        {/* filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          {STATUS_FILTERS.map((s) => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-1.5 rounded-md border text-sm transition-colors ${
                statusFilter === s
                  ? 'border-accent text-slate-200 bg-accent/10'
                  : 'border-edge text-slate-500 hover:border-slate-500'
              }`}>
              {s || 'All Status'}
            </button>
          ))}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="ml-auto bg-surface border border-edge text-slate-400 text-sm px-3 py-1.5 rounded-md outline-none">
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* list */}
        {listLoading && <Spinner />}
        {error && (
          <div className="bg-red-950 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
        )}
        {!listLoading && list?.results.length === 0 && (
          <EmptyState message="No incidents found." detail="Create one to start tracking outages." />
        )}

        <div className="flex flex-col gap-2">
          {list?.results.map((inc) => (
            <div
              key={inc.id}
              onClick={() => navigate(`/incidents/${inc.id}`)}
              className="bg-surface border border-edge rounded-xl px-5 py-4 cursor-pointer hover:border-accent transition-colors">
              <div className="flex items-start gap-2.5 mb-2.5 flex-wrap">
                <SeverityBadge severity={inc.severity as IncidentSeverity} />
                <StatusBadge   status={inc.status as IncidentStatus} />
                <h2 className="text-slate-100 font-semibold text-sm flex-1 min-w-0">{inc.title}</h2>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                {inc.service     && <span>📦 {inc.service}</span>}
                {inc.environment && <span>🌍 {inc.environment}</span>}
                <span>🕐 {relativeTime(inc.openedAt)}</span>
                {inc._count && (
                  <>
                    <span>🔗 {inc._count.errorGroups} errors</span>
                    <span>📝 {inc._count.timeline} events</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="bg-surface border border-edge rounded-xl p-7 w-[480px] max-w-[95vw]">
            <h2 className="text-lg font-bold text-slate-100 mb-5">Create Incident</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <label className={LABEL}>
                Title *
                <input required value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Database connection pool exhausted"
                  className={INPUT} />
              </label>
              <label className={LABEL}>
                Severity *
                <select value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  className={INPUT}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className={LABEL}>
                Description
                <textarea value={form.description} rows={3}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What happened?"
                  className={`${INPUT} resize-y`} />
              </label>
              <div className="flex gap-3">
                <label className={`${LABEL} flex-1`}>
                  Service
                  <input value={form.service}
                    onChange={(e) => setForm({ ...form, service: e.target.value })}
                    placeholder="auth-service" className={INPUT} />
                </label>
                <label className={`${LABEL} flex-1`}>
                  Environment
                  <input value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value })}
                    placeholder="production" className={INPUT} />
                </label>
              </div>
              <div className="flex gap-2.5 mt-1">
                <button type="submit" disabled={creating}
                  className="flex-1 bg-accent hover:bg-accent-hover text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create Incident'}
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
