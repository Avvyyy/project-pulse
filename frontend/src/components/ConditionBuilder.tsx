import type { AlertCondition, AlertConditionType } from '../types';

interface ConditionBuilderProps {
  value:    AlertCondition;
  onChange: (c: AlertCondition) => void;
}

const TYPE_LABELS: Record<AlertConditionType, string> = {
  threshold:       'Threshold — count exceeds a number',
  spike:           'Spike — sudden rate increase',
  recurrence:      'Recurrence — error seen again',
  new_error_group: 'New error group',
};

const SEL = 'bg-canvas border border-edge rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent w-full';
const NUM = `${SEL} [appearance:textfield]`;
const LBL = 'flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500';
const ROW = 'grid grid-cols-2 gap-3';

export function ConditionBuilder({ value, onChange }: ConditionBuilderProps) {
  function setType(type: AlertConditionType) {
    const defaults: Record<AlertConditionType, AlertCondition> = {
      threshold:       { type: 'threshold',       metric: 'error_count', threshold: 100, windowSeconds: 300 },
      spike:           { type: 'spike',            multiplier: 3, windowSeconds: 300, baselineWindowSeconds: 3600 },
      recurrence:      { type: 'recurrence',       minutes: 60 },
      new_error_group: { type: 'new_error_group' },
    };
    onChange(defaults[type]);
  }

  function patch(partial: Partial<AlertCondition>) {
    onChange({ ...value, ...partial } as AlertCondition);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className={LBL}>
        Condition type
        <select className={SEL} value={value.type} onChange={(e) => setType(e.target.value as AlertConditionType)}>
          {(Object.entries(TYPE_LABELS) as [AlertConditionType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>

      {value.type === 'threshold' && (
        <>
          <label className={LBL}>
            Metric
            <select className={SEL} value={value.metric} onChange={(e) => patch({ metric: e.target.value as any })}>
              <option value="error_count">Error count (events with error groups)</option>
              <option value="event_count">Event count (all events)</option>
            </select>
          </label>
          <div className={ROW}>
            <label className={LBL}>
              Threshold
              <input type="number" min={1} className={NUM} value={value.threshold}
                onChange={(e) => patch({ threshold: +e.target.value })} />
            </label>
            <label className={LBL}>
              Window (seconds)
              <input type="number" min={1} className={NUM} value={value.windowSeconds}
                onChange={(e) => patch({ windowSeconds: +e.target.value })} />
              <span className="text-slate-600 font-normal normal-case">
                {value.windowSeconds >= 60 ? `${value.windowSeconds / 60}m` : `${value.windowSeconds}s`}
              </span>
            </label>
          </div>
        </>
      )}

      {value.type === 'spike' && (
        <>
          <div className={ROW}>
            <label className={LBL}>
              Multiplier
              <input type="number" min={1.1} step={0.5} className={NUM} value={value.multiplier}
                onChange={(e) => patch({ multiplier: +e.target.value })} />
              <span className="text-slate-600 font-normal normal-case">×{value.multiplier} normal rate</span>
            </label>
            <label className={LBL}>
              Current window (s)
              <input type="number" min={60} className={NUM} value={value.windowSeconds}
                onChange={(e) => patch({ windowSeconds: +e.target.value })} />
            </label>
          </div>
          <label className={LBL}>
            Baseline window (s)
            <input type="number" min={60} className={NUM} value={value.baselineWindowSeconds}
              onChange={(e) => patch({ baselineWindowSeconds: +e.target.value })} />
            <span className="text-slate-600 font-normal normal-case">
              {value.baselineWindowSeconds >= 3600 ? `${value.baselineWindowSeconds / 3600}h` : `${value.baselineWindowSeconds / 60}m`} comparison window
            </span>
          </label>
        </>
      )}

      {value.type === 'recurrence' && (
        <label className={LBL}>
          Recurrence window (minutes)
          <input type="number" min={1} className={NUM} value={value.minutes}
            onChange={(e) => patch({ minutes: +e.target.value })} />
          <span className="text-slate-600 font-normal normal-case">
            Fire if an error group reappears within this window
          </span>
        </label>
      )}

      {value.type === 'new_error_group' && (
        <p className="text-sm text-slate-500 bg-surface-2 border border-edge rounded-lg px-4 py-3">
          Fires once per evaluation cycle (≈ 1 min) when a new error group matching the filters above is detected.
        </p>
      )}
    </div>
  );
}
