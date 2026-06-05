import type { ReactNode } from 'react';

interface CardProps {
  children:  ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-surface border border-edge rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-slate-100 font-bold text-base mb-4">{children}</h3>;
}
