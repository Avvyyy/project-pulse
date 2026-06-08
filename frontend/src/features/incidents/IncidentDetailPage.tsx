import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useIncidentStore } from '../../store/incidentStore';
import { incidentsApi } from '../../api/incidents';
import { NavBar }            from '../../components/NavBar';
import { Card, CardTitle }   from '../../components/Card';
import { StatusBadge }       from '../../components/StatusBadge';
import { SeverityBadge }     from '../../components/SeverityBadge';
import { IncidentTimeline }  from '../../components/IncidentTimeline';
import { RelatedErrors }     from '../../components/RelatedErrors';
import { FrequencyChart }    from '../../components/FrequencyChart';
import { AffectedServices }  from '../../components/AffectedServices';
import { Spinner, ErrorState } from '../../components/PageState';
import { formatDateTime, formatDuration } from '../../utils/time';
import type { IncidentStatus, IncidentSeverity } from '../../types';

const INPUT    = 'bg-canvas border border-edge rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent outline-none';
const LABEL_SM = 'text-xs font-bold uppercase tracking-wider text-slate-500 mb-2';
const BTN      = 'bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50';

export default function IncidentDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const { current, frequency, detailLoading, error, fetchOne, fetchFrequency, clearCurrent } =
    useIncidentStore();

  const [comment,        setComment]        = useState('');
  const [actor,          setActor]          = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [statusChange,   setStatusChange]   = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (id) { fetchOne(id); fetchFrequency(id); }
    return clearCurrent;
  }, [id]);

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !comment.trim()) return;
    setPostingComment(true);
    try {
      await incidentsApi.addTimeline(id, comment.trim(), actor.trim() || undefined);
      setComment('');
      fetchOne(id);
    } finally { setPostingComment(false); }
  }

  async function handleStatusChange(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !statusChange) return;
    setUpdatingStatus(true);
    try {
      await incidentsApi.update(id, { status: statusChange, actor: actor || undefined });
      setStatusChange('');
      fetchOne(id);
    } finally { setUpdatingStatus(false); }
  }

  const crumbs = [
    { label: 'Incidents', href: '/incidents' },
    { label: current?.title ?? '…' },
  ];

  if (detailLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-canvas">
        <NavBar breadcrumbs={crumbs} />
        <Spinner />
      </div>
    );
  }

  if (error || !current) {
    return (
      <div className="min-h-screen flex flex-col bg-canvas">
        <NavBar breadcrumbs={crumbs} />
        <ErrorState message={error ?? 'Incident not found'} backTo="/incidents" />
      </div>
    );
  }

  const inc      = current;
  const timeline = inc.timeline   ?? [];
  const groups   = inc.errorGroups ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <NavBar breadcrumbs={crumbs} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
        {/* ── Incident header ── */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            <SeverityBadge severity={inc.severity as IncidentSeverity} />
            <StatusBadge   status={inc.status as IncidentStatus} />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2 leading-tight">{inc.title}</h1>
          {inc.description && (
            <p className="text-slate-400 text-sm leading-relaxed mb-3">{inc.description}</p>
          )}
          <div className="flex flex-wrap gap-5 text-sm text-slate-500">
            {inc.service     && <span>📦 <b className="text-slate-300">{inc.service}</b></span>}
            {inc.environment && <span>🌍 <b className="text-slate-300">{inc.environment}</b></span>}
            <span>🕐 Opened <b className="text-slate-300">{formatDateTime(inc.openedAt)}</b></span>
            {inc.resolvedAt && (
              <span>✅ Resolved <b className="text-slate-300">{formatDateTime(inc.resolvedAt)}</b>
                {' '}· <b className="text-slate-300">{formatDuration(inc.openedAt, inc.resolvedAt)}</b>
              </span>
            )}
          </div>
        </div>

        {/* ── Main grid: timeline + sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

          {/* timeline + action forms */}
          <Card>
            <CardTitle>Timeline</CardTitle>
            <IncidentTimeline entries={timeline} />

            <div className="mt-6 pt-5 border-t border-edge space-y-4">
              {/* add comment */}
              <div>
                <p className={LABEL_SM}>Add Comment</p>
                <form onSubmit={handleAddComment} className="flex flex-col gap-2">
                  <textarea value={comment} rows={3}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a note or update…"
                    className={`${INPUT} w-full resize-y`} />
                  <div className="flex gap-2">
                    <input value={actor}
                      onChange={(e) => setActor(e.target.value)}
                      placeholder="Your name (optional)"
                      className={`${INPUT} flex-1`} />
                    <button type="submit" disabled={postingComment || !comment.trim()} className={BTN}>
                      {postingComment ? '…' : 'Post'}
                    </button>
                  </div>
                </form>
              </div>

              {/* update status */}
              <div>
                <p className={LABEL_SM}>Update Status</p>
                <form onSubmit={handleStatusChange} className="flex gap-2">
                  <select value={statusChange}
                    onChange={(e) => setStatusChange(e.target.value)}
                    className={`${INPUT} flex-1`}>
                    <option value="">Choose status…</option>
                    {(['open', 'investigating', 'resolved'] as const).map((s) => (
                      <option key={s} value={s} disabled={s === inc.status}>{s}</option>
                    ))}
                  </select>
                  <button type="submit" disabled={updatingStatus || !statusChange} className={BTN}>
                    {updatingStatus ? '…' : 'Update'}
                  </button>
                </form>
              </div>
            </div>
          </Card>

          {/* sidebar */}
          <div className="flex flex-col gap-5">
            <Card>
              <CardTitle>Metadata</CardTitle>
              <dl className="flex flex-col gap-3">
                {([
                  ['Status',         inc.status],
                  ['Severity',       inc.severity],
                  ['Service',        inc.service ?? '—'],
                  ['Environment',    inc.environment ?? '—'],
                  ['Error Groups',   groups.length],
                  ['Timeline Events', timeline.length],
                ] as [string, string | number][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center">
                    <dt className="text-xs uppercase tracking-wider text-slate-500">{k}</dt>
                    <dd className="text-sm text-slate-300 font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card>
              <CardTitle>Affected Services</CardTitle>
              <AffectedServices groups={groups} />
            </Card>
          </div>
        </div>

        {/* ── Frequency chart ── */}
        <Card>
          <CardTitle>Error Frequency — Last 7 Days</CardTitle>
          <FrequencyChart points={frequency} />
        </Card>

        {/* ── Related errors ── */}
        <Card>
          <CardTitle>
            Related Errors <span className="text-slate-500 font-normal text-sm">({groups.length})</span>
          </CardTitle>
          <RelatedErrors groups={groups} />
        </Card>
      </main>
    </div>
  );
}
