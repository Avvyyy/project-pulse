import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { VolumePoint, Period } from '../api/dashboard';

function fmtBucket(iso: string, period: Period): string {
  const d = new Date(iso);
  if (period === '24h') {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

interface VolumeChartProps {
  data:   VolumePoint[];
  period: Period;
}

export function VolumeChart({ data, period }: VolumeChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
        No event data for this period.
      </div>
    );
  }

  // Recharts needs plain objects with the bucket as a formatted string
  const rows = data.map((p) => ({ ...p, label: fmtBucket(p.bucket, period) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2d3139" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#2d3139' }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={42}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
        />
        <Tooltip
          contentStyle={{ background: '#1a1d23', border: '1px solid #2d3139', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }} />
        <Line type="monotone" dataKey="total"  name="Total"  stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Line type="monotone" dataKey="errors" name="Errors" stroke="#ef4444" strokeWidth={2}   dot={false} />
        <Line type="monotone" dataKey="warns"  name="Warns"  stroke="#f59e0b" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
