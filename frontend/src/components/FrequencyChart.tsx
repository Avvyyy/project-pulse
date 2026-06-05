import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { FrequencyPoint } from '../types';
import { LEVEL_HEX } from '../utils/colors';
import { formatDateTimeShort } from '../utils/time';

function pivot(points: FrequencyPoint[]) {
  const map    = new Map<string, Record<string, number>>();
  const levels = new Set<string>();

  for (const { bucket, level, count } of points) {
    levels.add(level);
    if (!map.has(bucket)) map.set(bucket, { bucket });
    map.get(bucket)![level] = (map.get(bucket)![level] ?? 0) + count;
  }

  return { rows: Array.from(map.values()), levels: Array.from(levels) };
}

export function FrequencyChart({ points }: { points: FrequencyPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-surface rounded-lg border border-edge text-slate-500 text-sm">
        No events in the last 7 days.
      </div>
    );
  }

  const { rows, levels } = pivot(points);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <defs>
          {levels.map((l) => (
            <linearGradient key={l} id={`grad-${l}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={LEVEL_HEX[l] ?? '#6366f1'} stopOpacity={0.3} />
              <stop offset="95%" stopColor={LEVEL_HEX[l] ?? '#6366f1'} stopOpacity={0}   />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2d3139" />
        <XAxis
          dataKey="bucket"
          tickFormatter={formatDateTimeShort}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#2d3139' }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{ background: '#1a1d23', border: '1px solid #2d3139', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ fontSize: 13 }}
          labelFormatter={formatDateTimeShort}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }} />
        {levels.map((l) => (
          <Area
            key={l}
            type="monotone"
            dataKey={l}
            name={l.charAt(0).toUpperCase() + l.slice(1)}
            stroke={LEVEL_HEX[l] ?? '#6366f1'}
            fill={`url(#grad-${l})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
