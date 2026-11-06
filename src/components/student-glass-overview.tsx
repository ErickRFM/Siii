'use client';

import React from 'react';
import type { PersonalProfile } from '@/modules/portal/contracts';
import {
  academicStatus,
  financeStatus,
  formatMoney,
  requestStatusLabel,
  requestTypeLabel,
} from '@/modules/portal/contracts';
import type { PersonalSnapshot, PersonalView } from './use-personal-snapshot';
import { institutionalStudentSummary } from './student-dashboard-metrics';
import SiiiGlassCalendar from './siii-glass-calendar';
import { SiiiDashboardActions } from './ui/siii-dashboard-actions';
import { SiiiProgressRing } from './siii-glass-progress';
import {
  SiiiGlassMetric,
  SiiiGlassPanel,
  SiiiGlassPanelHeading,
  SiiiGlassMetricsRow,
} from './ui/siii-glass-kit';
import {
  BookOpen,
  BellRing,
  BadgeCheck,
  Sparkles,
  Database,
  ChartNoAxesCombined,
  Mail,
  Contact,
  ChevronRight,
  FileText,
  GraduationCap,
  RefreshCw,
  Wallet,
  Code2,
  Network,
  SquareRadical,
  Receipt,
  LibraryBig,
  User,
} from 'lucide-react';

type Destination = (section: string, academicView?: PersonalView) => void;

function publishedAge(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  const now = Date.now();
  if (!Number.isFinite(timestamp) || timestamp > now) return null;
  const minutes = Math.floor((now - timestamp) / 60000);
  return minutes < 1
    ? 'ahora'
    : minutes < 60
    ? `hace ${minutes} min`
    : minutes < 1440
    ? `hace ${Math.floor(minutes / 60)} h`
    : `hace ${Math.floor(minutes / 1440)} día${minutes >= 2880 ? 's' : ''}`;
}

export default function StudentGlassOverview({
  snapshot,
  profile,
  institutionName,
  onNavigate,
  onRefresh,
  refreshing,
  unlinked = false,
}: {
  snapshot: PersonalSnapshot;
  profile: PersonalProfile | null;
  institutionName: string;
  onNavigate: Destination;
  onRefresh: () => void;
  refreshing: boolean;
  unlinked?: boolean;
}) {
  const m = institutionalStudentSummary(snapshot);
  const partial = Object.values(m.incomplete).some(Boolean);
  const outstandingLabel = m.incomplete.orders
    ? 'Datos incompletos'
    : m.currency
    ? formatMoney(m.outstanding, m.currency)
    : m.outstanding === 0
    ? 'Sin cargos pendientes'
    : 'Ver desglose por moneda';

  const deadlines = snapshot.orders
    .filter(
      (o) =>
        ['pending', 'partially_paid'].includes(o.status) &&
        o.dueDate &&
        Number.isFinite(Date.parse(o.dueDate)) &&
        Date.parse(o.dueDate) >= Date.now() - 86400000
    )
    .sort((a, b) => Date.parse(a.dueDate!) - Date.parse(b.dueDate!))
    .slice(0, 3);

  const quick = (label: string, section: string, academicView?: PersonalView) => (
    <button
      className="siii-overview-quick inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      key={label}
      type="button"
      onClick={() => onNavigate(section, academicView)}
    >
      <span>{label}</span>
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  );

  return (
    <div className="siii-student-dashboard flex flex-col lg:flex-row gap-6">
      {/* Main Column */}
      <div className="siii-student-main flex-1 min-w-0 space-y-6">
        {/* Compact Hero Banner */}
        <header className="siii-overview-hero relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-r from-card/90 via-card/60 to-primary/5 p-5 sm:p-6 backdrop-blur-xl space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <User className="size-6" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <span className="siii-overview-eyebrow text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  Buen día,
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground truncate">
                  {profile?.firstName ?? 'Mi vida universitaria'}
                  <span className="sr-only"> {profile?.lastName}</span>
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {profile?.programName || institutionName}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="siii-overview-refresh inline-flex items-center gap-2 p-2 rounded-xl border border-border/50 bg-background/50 hover:bg-background/80 text-xs font-semibold transition-all disabled:opacity-50"
              aria-label="Actualizar mi información"
              title="Actualizar mi información"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
              <span className="hidden sm:inline">
                {refreshing ? 'Consultando…' : 'Actualizar'}
              </span>
            </button>
          </div>

          <div className="siii-overview-tags flex flex-wrap items-center gap-2 pt-1 border-t border-border/20 text-xs">
            {profile?.enrollmentNumber && (
              <span className="px-2.5 py-1 rounded-lg bg-muted/80 font-mono font-medium">
                Matrícula: {profile.enrollmentNumber}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold">
              {profile
                ? academicStatus[profile.status] || profile.status
                : unlinked
                ? 'Expediente aún sin vincular'
                : refreshing
                ? 'Consultando tu expediente'
                : 'Información no disponible'}
            </span>
          </div>
        </header>

        {partial && (
          <p
            role="status"
            className="siii-overview-empty p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400"
          >
            Parte de tu expediente supera los límites de consulta. Los indicadores afectados se ocultan para evitar cifras engañosas.
          </p>
        )}

        {/* Quick Action Dock */}
        <SiiiDashboardActions>
          <button
            type="button"
            className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-card/60 hover:bg-card hover:border-primary/40 transition-all group"
            onClick={() => onNavigate('orders')}
          >
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Receipt size={18} aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                Estado de cuenta
              </span>
            </div>
            <ChevronRight size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </button>

          <button
            type="button"
            className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-card/60 hover:bg-card hover:border-primary/40 transition-all group"
            onClick={() => onNavigate('services')}
          >
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <FileText size={18} aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                Mis trámites
              </span>
            </div>
            <ChevronRight size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </button>

          <button
            type="button"
            className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-card/60 hover:bg-card hover:border-primary/40 transition-all group"
            onClick={() => onNavigate('academic', 'teachers')}
          >
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <GraduationCap size={18} aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                Mis docentes
              </span>
            </div>
            <ChevronRight size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </button>

          <button
            type="button"
            className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-card/60 hover:bg-card hover:border-primary/40 transition-all group"
            onClick={() => onNavigate('academic', 'courses')}
          >
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <LibraryBig size={18} aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                Mis inscripciones
              </span>
            </div>
            <ChevronRight size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </button>
        </SiiiDashboardActions>

        {/* Key Metrics Row */}
        <SiiiGlassMetricsRow className="siii-overview-metrics grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumen institucional">
          <SiiiGlassMetric
            label="Promedio publicado"
            value={
              m.incomplete.grades || m.gradeMean === null || !profile
                ? '—'
                : m.gradeMean.toFixed(2)
            }
            description={
              m.incomplete.grades
                ? 'Consulta parcial de calificaciones'
                : 'No es el promedio oficial'
            }
            icon={<BookOpen size={21} />}
            tone="amber"
          />
          <SiiiGlassMetric
            label="Créditos publicados"
            value={m.incomplete.grades || !profile ? '—' : m.creditsWithPublishedGrade}
            description={
              m.incomplete.grades
                ? 'Consulta parcial de créditos'
                : 'El plan oficial no está disponible'
            }
            accessory={
              <SiiiProgressRing
                size={52}
                value={
                  !m.incomplete.courses && !m.incomplete.grades && profile
                    ? m.publicationRatio
                    : null
                }
                label="Inscripciones consultadas con nota publicada; no representa créditos del plan oficial"
              />
            }
            icon={<GraduationCap size={21} />}
            tone="blue"
          />
          <SiiiGlassMetric
            label="Cargos por liquidar"
            value={profile ? outstandingLabel : '—'}
            description={
              snapshot.orders.length ? 'Según el registro de Caja' : 'Sin movimientos registrados'
            }
            icon={<Wallet size={21} />}
            tone="green"
          />
          <SiiiGlassMetric
            label="Trámites activos"
            value={m.incomplete.pendingRequests || !profile ? '—' : m.pendingCount}
            description={
              m.incomplete.pendingRequests
                ? 'Consulta parcial de trámites'
                : 'Solicitudes en seguimiento'
            }
            icon={<FileText size={21} />}
            tone="terracotta"
          />
        </SiiiGlassMetricsRow>

        {/* Detail Panels Grid */}
        <div
          className={
            'siii-overview-detail-grid grid gap-4 md:grid-cols-2' +
            (m.published.length <= 1 && snapshot.pendingRequests.length <= 1
              ? ' siii-overview-detail-grid--sparse'
              : '')
          }
        >
          {/* Recent Grades */}
          <SiiiGlassPanel className="p-4 sm:p-5 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl">
            <SiiiGlassPanelHeading
              title="Calificaciones recientes"
              action={quick('Ver todas', 'academic', 'grades')}
            />
            <div className="space-y-2.5 mt-3">
              {m.published.slice(0, 4).map((grade, index) => {
                const Icon = /datos/i.test(grade.courseName)
                  ? Database
                  : [BookOpen, Code2, Network, SquareRadical][index % 4];

                return (
                  <div
                    key={grade.sectionId}
                    className="siii-overview-listrow flex items-center justify-between gap-3 p-3 rounded-xl border border-border/20 bg-background/40 hover:bg-background/70 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="siii-reference-row-icon size-9 rounded-lg flex items-center justify-center shrink-0"
                        data-tone={['blue', 'terracotta', 'amber', 'violet'][index % 4]}
                        aria-hidden="true"
                      >
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0">
                        <strong className="block text-xs font-semibold text-foreground truncate">
                          {grade.courseName}
                        </strong>
                        <small className="block text-[11px] text-muted-foreground">
                          Publicado ·{' '}
                          {new Intl.DateTimeFormat('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'UTC',
                          }).format(new Date(grade.publishedAt))}
                        </small>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <b className="siii-overview-grade text-sm font-bold font-mono px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {(grade.scoreHundredths / 100).toFixed(2)}
                      </b>
                      <ChevronRight size={14} className="text-muted-foreground" aria-hidden="true" />
                    </div>
                  </div>
                );
              })}
              {m.published.length === 0 && (
                <p className="siii-overview-empty text-xs text-muted-foreground italic text-center p-6">
                  {profile
                    ? 'Aún no hay calificaciones publicadas.'
                    : 'Las calificaciones estarán disponibles al vincular tu expediente.'}
                </p>
              )}
            </div>
          </SiiiGlassPanel>

          {/* Account Balance */}
          <SiiiGlassPanel className="p-4 sm:p-5 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl flex flex-col justify-between">
            <div>
              <SiiiGlassPanelHeading
                title="Estado de cuenta"
                action={quick('Ver más', 'orders')}
              />
              <span className="siii-overview-eyebrow text-xs font-semibold uppercase tracking-wider text-muted-foreground block mt-2">
                Saldo por liquidar
              </span>
              <div className="siii-overview-balance text-2xl sm:text-3xl font-extrabold text-foreground mt-1 mb-2">
                {profile ? outstandingLabel : '—'}
              </div>
              <p className="siii-overview-subtle text-xs text-muted-foreground mb-3">
                {!profile
                  ? 'Consulta disponible con tu expediente vinculado.'
                  : snapshot.orders.length
                  ? 'Cargos y abonos institucionales registrados'
                  : 'Sin órdenes financieras registradas'}
              </p>

              <div className="space-y-2">
                {snapshot.orders
                  .filter((o) => o.status === 'pending' || o.status === 'partially_paid')
                  .slice(0, 2)
                  .map((o) => (
                    <div
                      key={o.id}
                      className="siii-overview-listrow flex items-center justify-between p-2.5 rounded-lg border border-border/20 bg-background/30 text-xs"
                    >
                      <div className="min-w-0">
                        <strong className="block font-semibold truncate">{o.feeTypeName}</strong>
                        <small className="text-muted-foreground">
                          {financeStatus[o.status] || o.status}
                        </small>
                      </div>
                      <b className="font-mono font-bold text-foreground shrink-0">
                        {formatMoney(Math.max(0, o.totalAmountCents - o.paidAmountCents), o.currency)}
                      </b>
                    </div>
                  ))}
              </div>
            </div>

            <button
              type="button"
              className="siii-overview-primary mt-4 w-full inline-flex items-center justify-center gap-2 p-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs transition-all hover:opacity-90"
              onClick={() => onNavigate('orders')}
            >
              <span>Consultar estado de cuenta</span>
              <ChevronRight size={15} />
            </button>
          </SiiiGlassPanel>

          {/* Pending Requests */}
          <SiiiGlassPanel className="p-4 sm:p-5 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl md:col-span-2">
            <SiiiGlassPanelHeading
              title="Mis trámites"
              action={quick('Ver todos', 'services')}
            />
            <div className="grid gap-2.5 sm:grid-cols-2 mt-3">
              {snapshot.pendingRequests.slice(0, 4).map((request, index) => {
                const Icon = /historial/i.test(request.summary)
                  ? ChartNoAxesCombined
                  : /kárdex|kardex/i.test(request.summary)
                  ? Mail
                  : /inscripci[oó]n/i.test(request.summary)
                  ? Contact
                  : FileText;

                return (
                  <div
                    key={request.id}
                    className="siii-overview-listrow flex items-center justify-between gap-3 p-3 rounded-xl border border-border/20 bg-background/40 hover:bg-background/70 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="siii-reference-row-icon size-9 rounded-lg flex items-center justify-center shrink-0"
                        data-tone={['green', 'blue', 'violet', 'terracotta'][index % 4]}
                        aria-hidden="true"
                      >
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0">
                        <strong
                          className="block text-xs font-semibold text-foreground truncate"
                          title={request.summary}
                        >
                          {request.summary}
                        </strong>
                        <small className="block text-[11px] text-muted-foreground">
                          {requestTypeLabel[request.requestType] || request.requestType}
                        </small>
                      </div>
                    </div>
                    <span className="siii-overview-status text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                      {requestStatusLabel[request.status] || request.status}
                    </span>
                  </div>
                );
              })}
              {!snapshot.pendingRequests.length && (
                <p className="siii-overview-empty text-xs text-muted-foreground italic text-center p-6 sm:col-span-2">
                  {profile
                    ? 'No hay trámites pendientes.'
                    : 'Vincula tu expediente para consultar tus trámites.'}
                </p>
              )}
            </div>
          </SiiiGlassPanel>
        </div>

        {/* Progress Summary Card */}
        <SiiiGlassPanel className="siii-overview-progress p-5 sm:p-6 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl space-y-4">
          <SiiiGlassPanelHeading
            title="Mi progreso académico registrado"
            action={quick('Historial', 'academic', 'grades')}
          />
          <div className="siii-overview-progress-body flex flex-col md:flex-row items-center gap-6">
            <div className="siii-overview-progress-summary flex items-center gap-4 shrink-0">
              <SiiiProgressRing
                value={
                  !m.incomplete.courses && !m.incomplete.grades && profile
                    ? m.publicationRatio
                    : null
                }
                label="Proporción de inscripciones consultadas con calificación publicada"
                size={m.published.length <= 1 ? 112 : 140}
              />
              <div className="space-y-1">
                <small className="text-xs text-muted-foreground block">
                  Créditos con nota publicada
                </small>
                <strong className="text-2xl font-extrabold text-foreground block">
                  {!profile
                    ? '—'
                    : m.incomplete.courses || m.incomplete.grades
                    ? '—'
                    : m.creditsWithPublishedGrade}
                </strong>
                <small className="text-xs text-muted-foreground block">
                  {!profile
                    ? 'Sin datos vinculados'
                    : m.incomplete.courses || m.incomplete.grades
                    ? 'Datos incompletos'
                    : `${m.publishedEnrolledSections} de ${m.enrolledSections} inscripciones consultadas`}
                </small>
              </div>
            </div>

            <div className="siii-overview-term-bars flex-1 w-full space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">
                Resultados publicados · escala de 0 a 10
              </p>
              {!m.incomplete.grades &&
                m.published.slice(0, 4).map((grade, index) => (
                  <div
                    className="siii-overview-term flex items-center gap-3 text-xs"
                    key={grade.sectionId}
                  >
                    <span className="w-28 truncate font-medium text-foreground" title={grade.courseName}>
                      {grade.courseName}
                    </span>
                    <div className="siii-overview-track flex-1 h-2 rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(0, Math.min(100, grade.scoreHundredths / 10))}%`,
                          backgroundColor: ['#3b82f6', '#a855f7', '#f59e0b', '#10b981'][
                            index % 4
                          ],
                        }}
                      />
                    </div>
                    <b className="font-mono font-bold w-8 text-right shrink-0">
                      {(grade.scoreHundredths / 100).toFixed(1)}
                    </b>
                  </div>
                ))}
              {(!m.terms.length || m.incomplete.grades) && (
                <p className="siii-overview-empty text-xs text-muted-foreground italic">
                  {m.incomplete.grades
                    ? 'La consulta de calificaciones está incompleta.'
                    : 'No existen resultados publicados para graficar.'}
                </p>
              )}
              <small className="sr-only">
                Estos indicadores describen los registros disponibles; no sustituyen el avance oficial del plan de estudios.
              </small>
            </div>
          </div>
        </SiiiGlassPanel>
      </div>

      {/* Right Column / Sidebar */}
      <aside className="siii-student-aside w-full lg:w-80 shrink-0 space-y-5" aria-label="Información complementaria">
        {/* Calendar Widget Card */}
        <SiiiGlassPanel className="siii-overview-calendar p-4 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl">
          <h3 className="sr-only">Calendario</h3>
          <SiiiGlassCalendar timeZone={profile?.timeZone ?? 'America/Mexico_City'} />
        </SiiiGlassPanel>

        {/* Announcements */}
        <SiiiGlassPanel
          id="avisos"
          aria-label="Avisos institucionales"
          className="p-4 sm:p-5 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl space-y-3"
        >
          <SiiiGlassPanelHeading title="Avisos institucionales" />
          <div className="space-y-2.5">
            {snapshot.announcements.map((notice) => {
              const Icon = /reinscrip|inscripci[oó]n/i.test(notice.title)
                ? BadgeCheck
                : /convocatoria/i.test(notice.title)
                ? Sparkles
                : BellRing;
              const age = publishedAge(notice.publishedAt);

              return (
                <article
                  key={notice.id}
                  className="siii-overview-listrow flex items-start gap-3 p-3 rounded-xl border border-border/20 bg-background/40 space-y-1"
                >
                  <span className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-xs font-semibold text-foreground leading-snug">
                      {notice.title}
                    </strong>
                    <small className="block text-[11px] text-muted-foreground leading-normal mt-0.5 line-clamp-2">
                      {notice.body}
                    </small>
                    {age && (
                      <time dateTime={notice.publishedAt!} className="text-[10px] text-primary font-medium block mt-1">
                        {age}
                      </time>
                    )}
                  </div>
                </article>
              );
            })}
            {!snapshot.announcements.length && (
              <p className="siii-overview-empty text-xs text-muted-foreground italic text-center p-4">
                {profile
                  ? 'No hay avisos vigentes.'
                  : 'Los avisos estarán disponibles después de validar tu acceso.'}
              </p>
            )}
          </div>
        </SiiiGlassPanel>

        {/* Deadlines */}
        <SiiiGlassPanel className="siii-overview-dates p-4 sm:p-5 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl space-y-3">
          <h3 className="font-bold text-base tracking-tight text-foreground pb-2 border-b border-border/30">
            Próximas fechas
          </h3>
          <div className="space-y-2.5">
            {deadlines.map((order) => (
              <div
                className="siii-overview-date flex items-center gap-3 p-2.5 rounded-xl border border-border/20 bg-background/30 text-xs"
                key={order.id}
              >
                <span
                  className="siii-overview-date-dot size-2 rounded-full bg-rose-500 ring-4 ring-rose-500/20 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <strong className="block font-semibold text-foreground truncate">
                    {order.feeTypeName}
                  </strong>
                  <small className="text-muted-foreground block">
                    Vencimiento:{' '}
                    {new Intl.DateTimeFormat('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(order.dueDate!))}
                  </small>
                </div>
              </div>
            ))}
            {!deadlines.length && (
              <p className="siii-overview-empty text-xs text-muted-foreground italic text-center p-4">
                No se registran vencimientos próximos en tu estado de cuenta.
              </p>
            )}
          </div>
        </SiiiGlassPanel>
      </aside>
    </div>
  );
}
