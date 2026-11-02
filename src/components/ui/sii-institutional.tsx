'use client';

import React, {
  forwardRef,
  type ReactNode,
  type HTMLAttributes,
} from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { cn } from '@/lib/utils';
import { SiiNavIcon, type SiiNavIconName } from '@/components/sii-nav-icon';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SiiSkeleton } from '@/components/ui/sii-kit';

export { default as SiiAppShell } from '@/components/sii-app-shell';

/**
 * 1. SiiPageLayout
 * Estructura y espaciado uniforme para las páginas institucionales de SIII.
 */
export interface SiiPageLayoutProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export const SiiPageLayout = forwardRef<HTMLElement, SiiPageLayoutProps>(
  ({ children, maxWidth = 'xl', className, ...props }, ref) => {
    const maxWidthClasses = {
      sm: 'max-w-3xl',
      md: 'max-w-4xl',
      lg: 'max-w-5xl',
      xl: 'max-w-7xl',
      full: 'max-w-full',
    };

    return (
      <main
        ref={ref}
        className={cn(
          'sii-page sii-institutional-page min-w-0 w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6',
          maxWidthClasses[maxWidth],
          className
        )}
        {...props}
      >
        {children}
      </main>
    );
  }
);
SiiPageLayout.displayName = 'SiiPageLayout';

/**
 * 2. SiiPageHeader
 * Título semántico, descripción breve, kicker y acciones institucionales.
 */
export interface SiiPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  hero?: boolean;
  className?: string;
}

export function SiiPageHeader({
  eyebrow,
  title,
  description,
  actions,
  hero = false,
  className,
}: SiiPageHeaderProps) {
  return (
    <header className={cn('sii-page-header space-y-2', className)}>
      {eyebrow && (
        <div className="sii-page-eyebrow">
          {eyebrow}
          <span className="sii-page-eyebrow-line" />
        </div>
      )}
      <div
        className={cn(
          'sii-page-heading sii-kit-page-heading flex flex-wrap items-start justify-between gap-4',
          hero && 'sii-kit-page-heading--hero'
        )}
      >
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {title}
            <span className="sii-welcome-period">.</span>
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5 pt-1">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * 3. SiiPanel
 * Superficie glass ahumado mate con variantes visuales explícitas.
 */
export interface SiiPanelProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  variant?: 'default' | 'compact' | 'interactive' | 'hero';
}

export const SiiPanel = forwardRef<HTMLElement, SiiPanelProps>(
  ({ children, variant = 'default', className, ...props }, ref) => {
    return (
      <section
        ref={ref}
        className={cn(
          'sii-panel siii-overview-panel siii-glass-surface rounded-xl border p-5 transition-colors',
          variant === 'compact' && 'p-3 sm:p-4',
          variant === 'interactive' && 'hover:border-primary/40 hover:shadow-sm cursor-pointer',
          variant === 'hero' && 'p-6 sm:p-8 border-primary/20 bg-primary-soft/10',
          className
        )}
        {...props}
      >
        {children}
      </section>
    );
  }
);
SiiPanel.displayName = 'SiiPanel';

/**
 * 4. SiiFilterBar
 * Búsqueda, filtros, ordenamiento y acciones en barra unificada.
 */
export interface SiiFilterBarProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  actions?: ReactNode;
}

export function SiiFilterBar({
  children,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Escribe para buscar…',
  searchLabel = 'Buscar',
  actions,
  className,
  ...props
}: SiiFilterBarProps) {
  return (
    <div
      className={cn(
        'sii-filter-bar sii-catalog-toolbar flex flex-wrap items-end justify-between gap-3 p-1',
        className
      )}
      {...props}
    >
      <div className="flex flex-wrap items-end gap-3 flex-1 min-w-[240px]">
        {onSearchChange !== undefined && (
          <label className="block flex-1 min-w-[200px] space-y-1.5 text-sm font-medium">
            <span>{searchLabel}</span>
            <Input
              type="search"
              value={searchQuery ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
        )}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}

// Canonical implementation also backs existing personal portal tables.
export { SiiDataTable, type SiiDataTableProps, type SiiDataTableColumn } from './sii-data-table';

/**
 * 6. SiiMetric
 * Indicadores y métricas institucionales con variantes de tono explícitas.
 */
export interface SiiMetricProps {
  label: string;
  value: ReactNode;
  caption?: string;
  description?: ReactNode;
  icon?: SiiNavIconName | ReactNode;
  tone?: 'amber' | 'blue' | 'green' | 'rose' | 'terracotta';
  href?: string;
  actionLabel?: string;
  accessory?: ReactNode;
  className?: string;
}

export function SiiMetric({
  label,
  value,
  caption,
  description,
  icon,
  tone = 'rose',
  href,
  actionLabel,
  accessory,
  className,
}: SiiMetricProps) {
  const toneClasses = {
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    rose: 'bg-primary-soft text-primary',
    terracotta: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
  };

  return (
    <Card
      className={cn(
        'sii-metric sii-kit-metric sii-glass-role-metric siii-glass-surface overflow-hidden',
        className
      )}
    >
      <CardContent className="flex h-full flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
            {label}
          </span>
          {icon && (
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-xl',
                toneClasses[tone]
              )}
              aria-hidden="true"
            >
              {typeof icon === 'string' ? <SiiNavIcon name={icon as SiiNavIconName} /> : icon}
            </span>
          )}
        </div>
        <span
          className={cn(
            'sii-metric-value text-3xl font-bold tracking-tight tabular-nums',
            typeof value === 'string' && 'sii-metric-value--text'
          )}
        >
          {value}
        </span>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
        {caption && !description && (
          <span className="sii-metric-caption text-xs text-muted-foreground">{caption}</span>
        )}
        {accessory && <div className="mt-1">{accessory}</div>}
        {href && actionLabel && (
          <Link
            href={href as Route}
            className="sii-metric-link mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-primary"
          >
            {actionLabel}
            <span aria-hidden="true">↗</span>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 7. SiiStatusBadge
 * Estados académicos, operativos y financieros con variantes semánticas.
 */
export interface SiiStatusBadgeProps {
  status?: string;
  variant?: 'active' | 'pending' | 'completed' | 'cancelled' | 'live' | 'archived' | 'muted';
  children?: ReactNode;
  className?: string;
}

export function SiiStatusBadge({
  status,
  variant,
  children,
  className,
}: SiiStatusBadgeProps) {
  const resolvedVariant =
    variant ??
    (status === 'active' || status === 'paid'
      ? 'active'
      : status === 'pending' || status === 'partially_paid'
      ? 'pending'
      : status === 'archived' || status === 'cancelled'
      ? 'archived'
      : 'muted');

  const variantStyles = {
    active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
    completed: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
    cancelled: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
    live: 'sii-badge--live',
    archived: 'bg-muted text-muted-foreground border-border',
    muted: 'sii-badge--muted',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'sii-badge font-medium gap-1.5',
        variantStyles[resolvedVariant],
        className
      )}
    >
      {resolvedVariant === 'live' && <span className="sii-online-dot" />}
      {children}
    </Badge>
  );
}

/**
 * 8. SiiEmptyState
 * Presentación de ausencia de información o resultados sin fabricar datos.
 */
export interface SiiEmptyStateProps {
  title: string;
  description: string;
  icon?: SiiNavIconName;
  action?: ReactNode;
  className?: string;
}

export function SiiEmptyState({
  title,
  description,
  icon = 'book',
  action,
  className,
}: SiiEmptyStateProps) {
  return (
    <Empty className={cn('sii-empty sii-kit-empty border rounded-xl p-8', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="sii-kit-empty-icon">
          <SiiNavIcon name={icon} />
        </EmptyMedia>
        <EmptyTitle className="sii-kit-empty-title text-base font-semibold">{title}</EmptyTitle>
        <EmptyDescription className="text-sm text-muted-foreground">{description}</EmptyDescription>
      </EmptyHeader>
      {action && <div className="mt-4">{action}</div>}
    </Empty>
  );
}

/**
 * 9. SiiAsyncState
 * Gestión consistente de estados asíncronos (cargando, error con retry, acceso denegado).
 */
export interface SiiAsyncStateProps {
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  onRetry?: () => void;
  accessDenied?: boolean;
  accessDeniedMessage?: string;
  children?: ReactNode;
  className?: string;
}

export function SiiAsyncState({
  loading = false,
  loadingLabel = 'Cargando registros oficiales…',
  error,
  onRetry,
  accessDenied = false,
  accessDeniedMessage = 'No cuentas con los permisos institucionales requeridos para esta consulta.',
  children,
  className,
}: SiiAsyncStateProps) {
  if (accessDenied) {
    return (
      <div className={cn('p-6 text-center space-y-3', className)} role="alert">
        <p className="sii-catalog-error font-medium">{accessDeniedMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('sii-catalog-error flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl', className)} role="alert">
        <span className="font-medium">{error}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn('py-4 space-y-4', className)}>
        <SiiSkeleton label={loadingLabel} />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * 10. SiiMobileNavigation
 * Barra o acceso contextual móvil integrado a la experiencia institucional.
 */
export { default as SiiMobileNavigation } from '@/components/siii-personal-navigation';
