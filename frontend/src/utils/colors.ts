/** Hex values for recharts SVG elements (cannot use CSS classes). */
export const LEVEL_HEX: Record<string, string> = {
  error: '#ef4444',
  warn:  '#f59e0b',
  info:  '#3b82f6',
  debug: '#8b5cf6',
  trace: '#64748b',
};

/** Full Tailwind class strings for log level text — must be complete strings for JIT. */
export const LEVEL_TEXT_CLASS: Record<string, string> = {
  error: 'text-red-500',
  warn:  'text-amber-500',
  info:  'text-blue-500',
  debug: 'text-violet-500',
  trace: 'text-slate-500',
};
