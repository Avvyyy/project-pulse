import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAlertStore } from '../../store/alertStore';
import { alertsApi, type UpdateAlertPayload } from '../../api/alerts';
import { NavBar }            from '../../components/NavBar';
import { Card, CardTitle }   from '../../components/Card';
import { AlertStateBadge }   from '../../components/AlertStateBadge';
import { ConditionDetail }   from '../../components/ConditionSummary';
import { ConditionBuilder }  from '../../components/ConditionBuilder';
import { TriggerHistory }    from '../../components/TriggerHistory';
import { Spinner, ErrorState } from '../../components/PageState';
import { formatDateTime }    from '../../utils/time';
import { alertState }        from '../../types';
import type { AlertCondition, AlertState } from '../../types';

const INPUT = 'bg-canvas border border-edge rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent outline-none';
const LABEL = 'flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500';

export default function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { current, triggers, detailLoading, error, fetchOne, fetchTriggers, clearCurrent } = useAlertStore();

  const [editing,    setEditing]    = useState(false);
  const [editForm,   setEditForm]   = useState<UpdateAlertPayload>({});
  const [saving,     setSaving]     = useState(false);
  const [toggling,   setToggling]   = useState(false);

  useEffect(() => {
    if (id) { fetchOne(id); fetchTriggers(id); }
    return clearCurrent;
  }, [id]);

  async function handleResolve(triggerId: string) {
    if (!id) return;
    await alertsApi.resolveTrigger(id, triggerId);
    fetchOne(id);
    fetchTriggers(id);
  }

  async function handleToggle() {
    if (!id) return;
    setToggling(true);
    try { await alertsApi.toggle(id); fetchOne(id); }
    finally { setToggling(false); }
  }

  function startEdit() {
    if (!current) return;
    setEditForm({
      name:        current.name,
      description: current.description ?? '',
      service:     current.service     ?? '',
      environment: current.environment ?? '',
      level:       current.level       ?? '',
      condition:   current.condition,
    });
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      await alertsApi.update(id, {
        ...editForm,
        service:     editForm.service     || undefined,
        environment: editForm.environment || undefined,
        level:       editForm.level       || undefined,
        description: editForm.description || undefined,
      });
      setEditing(false);
      fetchOne(id);
    } finally { setSaving(false); }
  }

  const crumbs = [
    { label: 'Alerts', href: '/alerts' },
    { label: current?.name ?? '…' },
  ];

  if (detailLoading) return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <NavBar breadcrumbs={crumbs} />
      <Spinner />
    </div>
  );

  if (error || !current) return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <NavBar breadcrumbs={crumbs} />
      <ErrorState message={error ?? 'Alert not found'} backTo="/alerts" />
    </div>
  );

  const state        = alertState(current) as AlertState;
  const activeTrigger = current.triggers?.find((t) => !t.resolvedAt);

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <NavBar breadcrumbs={crumbs} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8 space-y-6">
        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-2.5 mb-3 flex-wrap">
            <AlertStateBadge state={state} />
            {!current.isActive && (
              <span className="text-xs text-slate-500 border border-edge px-2 py-0.5 rounded">paused</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-1">{current.name}</h1>
          {current.description && (
            <p className="text-slate-400 text-sm leading-relaxed mb-3">{current.description}</p>
          )}
          <div className="flex flex-wrap gap-5 text-sm text-slate-500">
            {current.service     && <span>📦 <b className="text-slate-300">{current.service}</b></span>}
            {current.environment && <span>🌍 <b className="text-slate-300">{current.environment}</b></span>}
            {current.level       && <span>🔖 <b className="text-slate-300">{current.level}</b></span>}
            <span>created {formatDateTime(current.createdAt)}</span>
          </div>
        </div>

        {/* ── Active trigger banner ── */}
        {activeTrigger && (
          <div className="flex items-center justify-between gap-4 bg-red-950/50 border border-red-800 rounded-xl px-5 py-4">
            <div>
              <p className="text-red-400 font-semibold text-sm">🔔 This alert is currently firing</p>
              <p className="text-slate-400 text-xs mt-0.5">since {formatDateTime(activeTrigger.triggeredAt)}</p>
            </div>
            <button
              onClick={() => handleResolve(activeTrigger.id)}
              className="shrink-0 text-sm text-white bg-emerald-700 hover:bg-emerald-600 px-4 py-2 rounded-lg transition-colors font-semibold">
              Resolve
            </button>
          </div>
        )}

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">

          {/* Condition + metadata sidebar */}
          <div className="flex flex-col gap-5">
            <Card>
              <CardTitle>Condition</CardTitle>
              <ConditionDetail condition={current.condition} />
            </Card>

            <Card>
              <CardTitle>Metadata</CardTitle>
              <dl className="flex flex-col gap-3">
                {([
                  ['Status',   current.isActive ? 'Active' : 'Paused'],
                  ['Triggers', current._count?.triggers ?? 0],
                  ['Updated',  formatDateTime(current.updatedAt)],
                ] as [string, string | number][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center">
                    <dt className="text-xs uppercase tracking-wider text-slate-500">{k}</dt>
                    <dd className="text-sm text-slate-300 font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-edge">
                <button
                  onClick={startEdit}
                  className="w-full text-sm text-slate-300 border border-edge rounded-lg py-2 hover:border-accent hover:text-accent transition-colors">
                  Edit Rule
                </button>
                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className="w-full text-sm text-slate-400 border border-edge rounded-lg py-2 hover:border-slate-400 transition-colors disabled:opacity-50">
                  {toggling ? '…' : current.isActive ? 'Pause Rule' : 'Resume Rule'}
                </button>
              </div>
            </Card>
          </div>

          {/* Trigger history */}
          <Card>
            <CardTitle>
              Trigger History
              <span className="text-slate-500 font-normal text-sm ml-2">({current._count?.triggers ?? 0})</span>
            </CardTitle>
            <TriggerHistory
              triggers={triggers?.results ?? []}
              onResolve={handleResolve}
            />
          </Card>
        </div>
      </main>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 overflow-y-auto p-4"
          onClick={(e) => e.target === e.currentTarget && setEditing(false)}>
          <div className="bg-surface border border-edge rounded-xl p-7 w-[560px] max-w-full my-auto">
            <h2 className="text-lg font-bold text-slate-100 mb-5">Edit Alert Rule</h2>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <label className={LABEL}>
                Name
                <input value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={INPUT} />
              </label>
              <label className={LABEL}>
                Description
                <textarea value={editForm.description ?? ''} rows={2}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className={`${INPUT} resize-y`} />
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['service', 'environment'] as const).map((f) => (
                  <label key={f} className={LABEL}>
                    {f}
                    <input value={(editForm[f] as string) ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, [f]: e.target.value })}
                      placeholder="all" className={INPUT} />
                  </label>
                ))}
                <label className={LABEL}>
                  Level
                  <select value={editForm.level ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, level: e.target.value })}
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
                  value={editForm.condition ?? current.condition}
                  onChange={(c) => setEditForm({ ...editForm, condition: c })}
                />
              </div>
              <div className="flex gap-2.5 mt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-accent hover:bg-accent-hover text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditing(false)}
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
