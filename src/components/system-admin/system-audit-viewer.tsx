'use client';

import React, { useState, useEffect, useRef, type FormEvent } from 'react';
import {
  Filter,
  RefreshCw,
  Clock,
  User,
  ShieldCheck,
  ChevronRight,
  ArrowLeftRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SiiDrawer } from '@/components/ui/sii-workspace';

export type AuditEntry = {
  id: string;
  action: string;
  target: { kind: string; id: string } | null;
  actor: { membershipId: string; label: string } | null;
  reason: string | null;
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  createdAt: string;
};

export type AuditFilter = {
  action: string;
  targetKind: string;
  from: string;
  to: string;
};

const emptyFilters: AuditFilter = { action: '', targetKind: '', from: '', to: '' };

const targetLabels: Record<string, string> = {
  institution: 'Institución',
  membership: 'Membresía',
  grant: 'Concesión',
  invitation: 'Invitación',
  delivery: 'Entrega',
  programs: 'Programa',
  curricula: 'Plan de estudio',
  courses: 'Materia',
  campuses: 'Campus',
  terms: 'Periodo',
};

const actionLabels: Record<string, string> = {
  'institution.settings.update': 'Configuración institucional actualizada',
  'institution.status.change': 'Cambio de estado institucional',
  'membership.profile': 'Edición de perfil institucional',
  'membership.suspend': 'Suspensión de membresía',
  'membership.activate': 'Activación de membresía',
  'membership.delete': 'Baja de membresía',
  'membership.rehabilitate': 'Rehabilitación de membresía',
  'membership.password-reset-request': 'Solicitud de recuperación',
  'invitation.create': 'Invitación creada',
  'invitation.resend': 'Reenvío de invitación',
  'invitation.revoke': 'Invitación revocada',
  'invitation.accept': 'Invitación aceptada',
  'invitation.reject': 'Rechazo de invitación',
};

const changeLabels: Record<string, string> = {
  name: 'Nombre',
  shortName: 'Nombre corto',
  code: 'Clave',
  timezone: 'Zona horaria',
  status: 'Estado',
  version: 'Versión',
  role: 'Perfil',
  scopeType: 'Ámbito',
  scopeId: 'Recurso del ámbito',
  revokedGrants: 'Concesiones revocadas',
  revokedInvitations: 'Invitaciones revocadas',
  cancelledDeliveries: 'Entregas canceladas',
  state: 'Estado de operación',
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function RenderDiff({ value }: { value: Record<string, unknown> | undefined }) {
  const entries = Object.entries(value ?? {}).filter(
    ([key, item]) =>
      changeLabels[key] &&
      (item === null || ['string', 'number', 'boolean'].includes(typeof item))
  );

  if (!entries.length) {
    return <p className="text-xs text-muted-foreground italic">Sin campos registrados</p>;
  }

  return (
    <dl className="space-y-1 text-xs">
      {entries.map(([key, item]) => (
        <div key={key} className="flex flex-wrap justify-between gap-1 py-1 border-b border-border/40 last:border-0">
          <dt className="text-muted-foreground font-medium">{changeLabels[key]}:</dt>
          <dd className="font-semibold text-foreground break-all">
            {item === null ? 'Sin asignar' : String(item)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface SystemAuditViewerProps {
  institutionId: string;
  online: boolean;
  revision: number;
  onAuthorizationLost: () => void;
}

export function SystemAuditViewer({
  institutionId,
  online,
  revision,
  onAuthorizationLost,
}: SystemAuditViewerProps) {
  const [draft, setDraft] = useState<AuditFilter>(emptyFilters);
  const [filters, setFilters] = useState<AuditFilter>(emptyFilters);
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const cursor = pages[pages.length - 1];
  const filterFeedback = useRef<HTMLParagraphElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (filterError) filterFeedback.current?.focus();
  }, [filterError]);

  useEffect(() => {
    setPages([null]);
  }, [revision]);

  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError('');
    setRows([]);
    setNextCursor(null);

    const query = new URLSearchParams({ limit: '10' });
    if (cursor) query.set('cursor', cursor);

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        query.set(key, key === 'from' || key === 'to' ? new Date(value).toISOString() : value);
      }
    }

    void fetch(`/api/v1/institutions/${institutionId}/audit?${query}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) onAuthorizationLost();
          throw new Error(json.error?.code ?? json.error ?? 'REQUEST_FAILED');
        }
        return json;
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.data);
          setNextCursor(result.page.nextCursor);
        }
      })
      .catch((_cause) => {
        if (!controller.signal.aborted) {
          setError('No se pudo cargar el historial de auditoría. Vuelve a intentar.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [institutionId, cursor, filters, refresh, revision, onAuthorizationLost]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.action.trim() && !/^[a-z][a-z0-9_.-]{0,99}$/.test(draft.action.trim())) {
      setFilterError('Escribe un identificador de acción válido, por ejemplo institution.settings.update.');
      return;
    }
    if (draft.from && draft.to && new Date(draft.from) > new Date(draft.to)) {
      setFilterError('La fecha inicial debe ser anterior o igual a la fecha final.');
      return;
    }
    abort.current?.abort();
    setFilterError('');
    setFilters({ ...draft, action: draft.action.trim() });
    setPages([null]);
    setRefresh((value) => value + 1);
  }

  return (
    <section
      className="sii-panel sii-administration-card space-y-5"
      aria-label="Auditoría institucional"
      aria-busy={loading}
    >
      {/* Panel Header */}
      <div className="sii-catalog-toolbar flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-500" />
            <h2 className="text-lg font-bold tracking-tight">Auditoría institucional</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Historial autorizado de esta institución. Los filtros de fechas usan tu hora local.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={loading || !online}
          onClick={() => {
            setPages([null]);
            setRefresh((v) => v + 1);
          }}
          className="sii-outline-button gap-2"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar auditoría</span>
        </Button>
      </div>

      {/* Filter Toolbar Form */}
      {filterError && (
        <p
          role="alert"
          tabIndex={-1}
          ref={filterFeedback}
          id="institution-audit-filter-error"
          className="sii-catalog-error"
        >
          {filterError}
        </p>
      )}

      <form
        onSubmit={applyFilters}
        className="sii-catalog-form sii-administration-filters p-4 rounded-xl border bg-card/40 space-y-3"
        aria-label="Filtros de auditoría"
        aria-describedby={filterError ? 'institution-audit-filter-error' : undefined}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Filter className="size-3.5" />
          <span>Filtros de consulta</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label htmlFor="institution-audit-action" className="block space-y-1 text-xs font-medium">
            <span>Acción exacta</span>
            <Input
              id="institution-audit-action"
              maxLength={100}
              value={draft.action}
              onChange={(e) => setDraft({ ...draft, action: e.target.value })}
              disabled={!online}
              placeholder="Todas las acciones"
            />
          </label>

          <label htmlFor="institution-audit-kind" className="block space-y-1 text-xs font-medium">
            <span>Tipo de recurso</span>
            <NativeSelect
              id="institution-audit-kind"
              value={draft.targetKind}
              disabled={!online}
              onChange={(e) => setDraft({ ...draft, targetKind: e.target.value })}
            >
              <option value="">Todos los recursos</option>
              {Object.entries(targetLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label htmlFor="institution-audit-from" className="block space-y-1 text-xs font-medium">
            <span>Desde</span>
            <Input
              id="institution-audit-from"
              type="datetime-local"
              value={draft.from}
              disabled={!online}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>

          <label htmlFor="institution-audit-to" className="block space-y-1 text-xs font-medium">
            <span>Hasta</span>
            <Input
              id="institution-audit-to"
              type="datetime-local"
              value={draft.to}
              disabled={!online}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!online}
            className="sii-outline-button"
            onClick={() => {
              setDraft(emptyFilters);
              setFilters(emptyFilters);
              setPages([null]);
              setRefresh((v) => v + 1);
            }}
          >
            Limpiar filtros
          </Button>
          <Button type="submit" variant="secondary" size="sm" disabled={!online} className="sii-outline-button">
            Aplicar filtros de auditoría
          </Button>
        </div>
      </form>

      {/* Events List */}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground p-6 text-center">
          Consultando auditoría…
        </p>
      ) : error ? (
        <p role="alert" className="sii-catalog-error">
          {error}
        </p>
      ) : !rows.length ? (
        <p role="status" className="text-sm text-muted-foreground p-8 text-center italic">
          No hay eventos para esta consulta.
        </p>
      ) : (
        <ol className="sii-administration-events space-y-3">
          {rows.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="w-full text-left p-4 rounded-xl border bg-card/60 hover:bg-card hover:border-primary/40 transition-all space-y-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelectedEntry(entry)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{actionLabels[entry.action] ?? entry.action}</span>
                    <span className="font-mono text-xs text-muted-foreground">({entry.action})</span>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" />
                    <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="size-3 text-primary" />
                    <span>Responsable: {entry.actor?.label ?? 'Sistema / sin actor institucional'}</span>
                  </span>
                  <span>•</span>
                  <span>
                    Recurso:{' '}
                    <strong className="text-foreground">
                      {entry.target ? `${targetLabels[entry.target.kind] ?? entry.target.kind} · ${entry.target.id}` : 'Sin recurso institucional asociado'}
                    </strong>
                  </span>
                  {entry.reason && (
                    <>
                      <span>•</span>
                      <span className="truncate max-w-[280px]">Motivo: "{entry.reason}"</span>
                    </>
                  )}
                  <span className="ml-auto text-primary font-semibold flex items-center gap-0.5">
                    Ver diff <ChevronRight className="size-3" />
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Pagination Controls */}
      <nav className="sii-catalog-pagination flex flex-wrap items-center justify-between gap-3 pt-2 text-xs" aria-label="Paginación de auditoría">
        <div className="flex gap-2">
          <Button
            variant="outline"
            type="button"
            size="sm"
            className="sii-outline-button"
            disabled={pages.length === 1 || loading || !online}
            onClick={() => setPages((v) => v.slice(0, -1))}
          >
            Auditoría: página anterior
          </Button>
          <Button
            variant="outline"
            type="button"
            size="sm"
            className="sii-outline-button"
            disabled={!nextCursor || loading || !online}
            onClick={() => setPages((v) => [...v, nextCursor])}
          >
            Auditoría: siguiente página
          </Button>
        </div>
        <span aria-live="polite" className="text-muted-foreground font-medium">Página de auditoría {pages.length}</span>
      </nav>

      {/* Side-by-side Diff Inspector Drawer */}
      <SiiDrawer
        open={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
        title={`Detalle de Auditoría — ${selectedEntry ? actionLabels[selectedEntry.action] ?? selectedEntry.action : ''}`}
        description={selectedEntry ? `Evento ID: ${selectedEntry.id} • ${formatDate(selectedEntry.createdAt)}` : ''}
      >
        {selectedEntry && (
          <div className="space-y-5 pt-2">
            <div className="p-3 rounded-xl bg-muted/60 space-y-1.5 text-xs">
              <p><strong>Responsable:</strong> {selectedEntry.actor?.label ?? 'Sistema / sin actor institucional'}</p>
              <p><strong>Recurso impactado:</strong> {selectedEntry.target ? `${targetLabels[selectedEntry.target.kind] ?? selectedEntry.target.kind} · ${selectedEntry.target.id}` : 'Sin recurso institucional asociado'}</p>
              <p><strong>Motivo declarado:</strong> {selectedEntry.reason ?? 'Sin motivo registrado'}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ArrowLeftRight className="size-4 text-primary" />
                <span>Comparación de Cambios (Diff)</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="p-3 rounded-xl border bg-destructive/5 border-destructive/20 space-y-2">
                  <h4 className="text-xs font-bold text-destructive uppercase tracking-wider">
                    Antes
                  </h4>
                  <RenderDiff value={selectedEntry.changes.before} />
                </div>

                <div className="p-3 rounded-xl border bg-emerald-500/5 border-emerald-500/20 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    Después
                  </h4>
                  <RenderDiff value={selectedEntry.changes.after} />
                </div>
              </div>
            </div>
          </div>
        )}
      </SiiDrawer>
    </section>
  );
}
