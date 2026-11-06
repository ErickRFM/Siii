import React, { type ReactNode } from 'react';

export function SiiiDashboardActions({
  children,
  title = 'Operaciones principales',
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <nav className="siii-v2-action-dock space-y-3" aria-label={title}>
      <div className="siii-v2-action-heading flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Acciones</span>
        <span>•</span>
        <strong className="text-foreground">{title}</strong>
      </div>
      <div className="siii-overview-shortcuts grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    </nav>
  );
}
