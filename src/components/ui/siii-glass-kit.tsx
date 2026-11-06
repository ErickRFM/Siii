import React, { type HTMLAttributes, type ReactNode } from 'react';

/** Elevated glass/card panel. Legacy class names preserved for CSS/test compatibility. */
export function SiiiGlassPanel({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      {...props}
      className={['siii-overview-panel', className].filter(Boolean).join(' ')}
    >
      {children}
    </section>
  );
}

/** Responsive grid layout for metrics and KPIs. */
export function SiiiGlassMetricsRow({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={['siii-glass-metrics-grid', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

/** Heading with title and optional action link or trigger. */
export function SiiiGlassPanelHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="siii-overview-heading flex items-center justify-between gap-3 mb-3 pb-2 border-b border-border/30">
      <h3 className="font-bold text-base tracking-tight text-foreground">{title}</h3>
      {action}
    </div>
  );
}

export type MetricTone = 'amber' | 'blue' | 'green' | 'terracotta' | 'violet';

const toneMap: Record<MetricTone, { bg: string; text: string; ring: string }> = {
  amber: { bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', ring: 'border-amber-500/30' },
  blue: { bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', ring: 'border-blue-500/30' },
  green: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', ring: 'border-emerald-500/30' },
  terracotta: { bg: 'bg-rose-500/10 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400', ring: 'border-rose-500/30' },
  violet: { bg: 'bg-purple-500/10 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', ring: 'border-purple-500/30' },
};

/** Shared solid institutional metric. */
export function SiiiGlassMetric({
  label,
  value,
  description,
  icon,
  accessory,
  tone = 'amber',
  className = '',
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
  className?: string;
  accessory?: ReactNode;
}) {
  const styles = toneMap[tone];

  return (
    <SiiiGlassPanel
      className={[
        'siii-overview-metric',
        'siii-shared-glass-metric',
        accessory ? 'siii-metric-with-accessory' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-tone={tone}
      data-long-value={typeof value === 'string' && value.length >= 17 ? 'true' : undefined}
      aria-label={label}
      title={typeof description === 'string' ? description : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        {icon && (
          <span
            className={`siii-overview-metric-icon size-11 rounded-xl flex items-center justify-center ${styles.bg} ${styles.text}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        {accessory && <div className="siii-metric-accessory shrink-0">{accessory}</div>}
      </div>

      <div className="siii-shared-metric-copy mt-3 space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
          {label}
        </span>
        <strong className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground block tabular-nums">
          {value}
        </strong>
        {description != null && (
          <small className="text-xs text-muted-foreground block leading-normal">{description}</small>
        )}
      </div>
    </SiiiGlassPanel>
  );
}
