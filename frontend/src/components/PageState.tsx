import { useNavigate } from 'react-router-dom';

export function Spinner() {
  return (
    <div className="flex-1 flex items-center justify-center p-12 text-slate-500 text-sm">
      Loading…
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  backTo?: string;
}

export function ErrorState({ message, backTo }: ErrorStateProps) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12">
      <p className="text-red-400 text-sm">{message}</p>
      {backTo && (
        <button
          onClick={() => navigate(backTo)}
          className="text-sm text-accent border border-accent px-4 py-2 rounded-lg hover:bg-accent/10 transition-colors">
          ← Back
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: string;
  message: string;
  detail?: string;
}

export function EmptyState({ icon = '📋', message, detail }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center bg-surface border border-edge rounded-xl">
      <span className="text-4xl">{icon}</span>
      <p className="text-slate-300 text-sm font-medium">{message}</p>
      {detail && <p className="text-slate-500 text-xs">{detail}</p>}
    </div>
  );
}
