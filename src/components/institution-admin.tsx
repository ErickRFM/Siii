'use client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {NativeSelect} from '@/components/ui/native-select';

import {useInstitutionConfirmation} from './sii-confirmation';

import Link from 'next/link';
import type {Route} from 'next';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import type {InstitutionAdminDTO} from '@/shared/institution-admin/policy';
import {hasInstitutionCapability, SecurityActionLink, useInstitutionCapabilities} from './institution-capabilities';
import './institution-admin.css';

type Actions = {updateSettings: boolean; changeStatus: boolean; readAudit: boolean};
type PageResult<T> = {data: T[]; page: {nextCursor: string | null}};
type Editable = Pick<InstitutionAdminDTO, 'name' | 'shortName' | 'code' | 'timezone'>;
type AuditEntry = {id: string; action: string; target: {kind: string; id: string} | null; actor: {membershipId: string; label: string} | null; reason: string | null; changes: {before?: Record<string, unknown>; after?: Record<string, unknown>}; createdAt: string};
type AuditFilter = {action: string; targetKind: string; from: string; to: string};
const emptyFilters: AuditFilter = {action: '', targetKind: '', from: '', to: ''};
const statusLabels: Record<string, string> = {active: 'Activa', inactive: 'Inactiva', suspended: 'Suspendida', archived: 'Archivada'};
const actionLabels: Record<string, string> = {'institution.settings.update': 'Configuración institucional actualizada', 'institution.status.change': 'Cambio de estado institucional', 'membership.profile': 'Edición de perfil institucional', 'membership.suspend': 'Suspensión de membresía', 'membership.activate': 'Activación de membresía', 'membership.delete': 'Baja de membresía', 'membership.rehabilitate': 'Rehabilitación de membresía', 'membership.password-reset-request': 'Solicitud de recuperación', 'invitation.create': 'Invitación creada', 'invitation.resend': 'Reenvío de invitación', 'invitation.revoke': 'Invitación revocada', 'invitation.accept': 'Invitación aceptada', 'invitation.reject': 'Invitación rechazada'};
const targetLabels: Record<string, string> = {institution: 'Institución', membership: 'Membresía', grant: 'Concesión', invitation: 'Invitación', delivery: 'Entrega', programs: 'Programa', curricula: 'Plan de estudio', courses: 'Materia', campuses: 'Campus', terms: 'Periodo'};
const changeLabels: Record<string, string> = {name: 'Nombre', shortName: 'Nombre corto', code: 'Clave', timezone: 'Zona horaria', status: 'Estado', version: 'Versión', role: 'Perfil', scopeType: 'Ámbito', scopeId: 'Recurso del ámbito', revokedGrants: 'Concesiones revocadas', revokedInvitations: 'Invitaciones revocadas', cancelledDeliveries: 'Entregas canceladas', state: 'Estado de operación'};
class AdministrationError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
function errorText(cause: unknown) {
  if (!(cause instanceof AdministrationError)) return 'Sin conexión. Comprueba tu conexión y vuelve a intentar.';
  const messages: Record<string, string> = {
    UNAUTHENTICATED: 'Tu sesión venció. Vuelve a iniciar sesión.',
    FORBIDDEN: 'Tu autorización cambió. Recarga la configuración para verificar tu acceso vigente.',
    MFA_REQUIRED: 'Configura o verifica tu autenticador en seguridad y vuelve a intentar.',
    STEP_UP_REQUIRED: 'Confirma tu identidad en seguridad antes de guardar esta operación.',
    PASSWORD_CHANGE_REQUIRED: 'Actualiza tu contraseña en seguridad antes de continuar.',
    STALE_RESOURCE: 'Otra persona modificó esta institución. Conservamos tu borrador. Recarga la configuración vigente antes de volver a guardar.',
    INSTITUTION_CODE_EXISTS: 'Esa clave institucional ya está registrada. Escribe una clave diferente.',
    INSTITUTION_ARCHIVED: 'La institución está archivada. Puedes consultar su información e historial.',
    INVALID_STATUS_TRANSITION: 'Este cambio de estado ya no está permitido. Recarga la configuración vigente.',
    VERSION_LIMIT_REACHED: 'No se pueden registrar más versiones. Contacta al responsable de la plataforma.',
    VALIDATION_ERROR: 'Revisa los campos y el motivo. Usa una zona horaria válida y un motivo de entre 3 y 500 caracteres.',
    INVALID_PAGE: 'La página consultada ya no está disponible. Vuelve a la primera página.',
    INVALID_ID: 'La institución solicitada no es válida.',
    INVALID_RESPONSE: 'La respuesta no corresponde a esta institución. Recarga la configuración vigente.',
    INVALID_ORIGIN: 'No se pudo verificar el origen de la solicitud. Recarga esta página.',
  };
  return messages[cause.code] ?? 'No se pudo completar la consulta. Vuelve a intentar.';
}
async function request<T>(url: string, signal?: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {credentials: 'same-origin', cache: 'no-store', signal, method,
    ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})});
  const result = await response.json();
  if (!response.ok) throw new AdministrationError(result.error?.code ?? result.error ?? 'REQUEST_FAILED', response.status);
  return result as T;
}
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}
function editable(institution: InstitutionAdminDTO): Editable { return {name: institution.name, shortName: institution.shortName, code: institution.code, timezone: institution.timezone}; }
function formatDate(value: string) { return new Date(value).toLocaleString('es-MX'); }

export function ManageableInstitutions() {
  const online = useOnline();
  const [rows, setRows] = useState<InstitutionAdminDTO[]>([]);
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const cursor = pages[pages.length - 1];
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setRows([]); setNextCursor(null);
    const query = new URLSearchParams({limit: '10'});
    if (cursor) query.set('cursor', cursor);
    void request<PageResult<InstitutionAdminDTO>>(`/api/v1/institutions/manageable?${query}`, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setRows(result.data); setNextCursor(result.page.nextCursor); } })
      .catch(cause => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cursor, revision]);
  return <section className="sii-panel sii-administration-discovery" aria-label="Instituciones administrables" aria-busy={loading}>
    <div className="sii-panel-top"><div><span className="sii-section-kicker">ADMINISTRACIÓN AUTORIZADA</span><h2>Gestión institucional</h2><p>Configuración e historial de las instituciones que puedes administrar.</p></div></div>
    {!online && <p role="status">Sin conexión. Las operaciones están deshabilitadas.</p>}
    {loading ? <p role="status">Consultando instituciones administrables…</p> : error ? <div className="sii-catalog-error" role="alert"><p>{error}</p><Button variant="outline" type="button" className="sii-outline-button" disabled={!online} onClick={() => setRevision(value => value + 1)}>Reintentar consulta</Button></div> : !rows.length ? <p role="status">No hay instituciones administrables para esta consulta.</p> : <ul className="sii-administration-list">{rows.map(institution => <li key={institution.id}>
      <span className="sii-admin-institution-glyph" aria-hidden="true">▥</span><div><strong>{institution.name}</strong><small>{institution.code} · {statusLabels[institution.status]}</small></div>
      <Link href={`/dashboard/institutions/${institution.id}/admin` as Route} className="sii-outline-button" aria-label={`Administrar ${institution.name}`}>Administrar <span aria-hidden="true">→</span></Link>
    </li>)}</ul>}
    <nav className="sii-catalog-pagination" aria-label="Paginación de instituciones administrables">
      <Button variant="outline" type="button" className="sii-outline-button" disabled={pages.length === 1 || loading || !online} onClick={() => setPages(value => value.slice(0, -1))}>Instituciones: página anterior</Button><span aria-live="polite">Página {pages.length}</span>
      <Button variant="outline" type="button" className="sii-outline-button" disabled={!nextCursor || loading || !online} onClick={() => setPages(value => [...value, nextCursor])}>Instituciones: siguiente página</Button>
      <Button variant="outline" type="button" className="sii-outline-button" disabled={loading || !online} onClick={() => { setPages([null]); setRevision(value => value + 1); }}>Actualizar instituciones</Button>
    </nav>
  </section>;
}

export default function InstitutionAdministration({initialInstitution, actions}: {initialInstitution: InstitutionAdminDTO; actions: Actions}) {
 const {ask,confirmation}=useInstitutionConfirmation();
  const institutionId = initialInstitution.id;
  const base = `/api/v1/institutions/${institutionId}`;
  const returnTo = `/dashboard/institutions/${institutionId}/admin`;
  const online = useOnline();
  const {data: capabilities, refresh: refreshCapabilities} = useInstitutionCapabilities();
  const [institution, setInstitution] = useState(initialInstitution);
  const [draft, setDraft] = useState(() => editable(initialInstitution));
  const [reason, setReason] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsSecurity, setNeedsSecurity] = useState(false);
  const [auditRevision, setAuditRevision] = useState(0);
  const authorizationLost = useCallback(() => {
    setBlocked(true);
    setError('Tu autorización cambió. Recarga la configuración para verificar tu acceso vigente.');
  }, []);
  const feedback = useRef<HTMLParagraphElement>(null);
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);
  const archived = institution.status === 'archived';
  const disabled = !online || saving || loading || stale || blocked || archived;
  const dirty = reason !== '' || statusReason !== '' || nextStatus !== '' || JSON.stringify(draft) !== JSON.stringify(editable(institution));

  async function reload() {
    if (saving || loading || !online) return;
    if (dirty && !await ask({title:'Descartar borrador institucional',description:'La configuración local no guardada se perderá al recuperar la versión vigente.',confirmLabel:'Descartar cambios',destructive:true})) return;
    controller.current?.abort();
    const nextController = new AbortController(); controller.current = nextController;
    setLoading(true); setError(''); setNotice('');
    try {
      const result = await request<{data: InstitutionAdminDTO}>(`${base}/settings`, nextController.signal);
      if (nextController.signal.aborted) return;
      if (result.data?.id !== institutionId) throw new AdministrationError('INVALID_RESPONSE', 502);
      setInstitution(result.data); setDraft(editable(result.data)); setReason(''); setStatusReason(''); setNextStatus('');
      setStale(false); setBlocked(false); setNeedsSecurity(false); setAuditRevision(value => value + 1); refreshCapabilities();
      window.requestAnimationFrame(() => settingsHeading.current?.focus());
    } catch (cause) {
      if (!nextController.signal.aborted) { setError(errorText(cause)); if (cause instanceof AdministrationError && [401, 403].includes(cause.status)) setBlocked(true); }
    } finally { if (!nextController.signal.aborted) setLoading(false); }
  }
  async function mutate(kind: 'settings' | 'status', body: Record<string, unknown>) {
    if (disabled) return;
    setSaving(true); setError(''); setNotice(''); setNeedsSecurity(false);
    const mutationController = new AbortController(); controller.current = mutationController;
    try {
      const result = await request<{data: InstitutionAdminDTO}>(`${base}/${kind}`, mutationController.signal, kind === 'settings' ? 'PATCH' : 'POST', {...body, expectedVersion: institution.version});
      if (!alive.current || mutationController.signal.aborted) return;
      if (result.data?.id !== institutionId) throw new AdministrationError('INVALID_RESPONSE', 502);
      setInstitution(result.data);
      if (kind === 'settings') { setDraft(editable(result.data)); setReason(''); }
      else { setStatusReason(''); setNextStatus(''); }
      setNotice(kind === 'settings' ? 'Configuración guardada. El cambio quedó registrado en auditoría.' : 'Estado institucional actualizado. El cambio quedó registrado en auditoría.');
      setAuditRevision(value => value + 1); refreshCapabilities();
    } catch (cause) {
      if (!alive.current) return;
      setError(errorText(cause));
      if (cause instanceof AdministrationError) {
        if (['STALE_RESOURCE', 'INSTITUTION_ARCHIVED', 'INVALID_STATUS_TRANSITION'].includes(cause.code)) setStale(true);
        if (cause.code === 'FORBIDDEN' || cause.status === 401) setBlocked(true);
        if (['MFA_REQUIRED', 'STEP_UP_REQUIRED', 'PASSWORD_CHANGE_REQUIRED'].includes(cause.code)) setNeedsSecurity(true);
      }
    } finally { if (alive.current) setSaving(false); }
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actions.updateSettings || disabled) return;
    if (!await ask({title:'Guardar configuración institucional',description:`Se actualizará ${institution.name}. Motivo: ${reason.trim()}.`,confirmLabel:'Guardar configuración'})) return;
    void mutate('settings', {...draft, name: draft.name.trim(), shortName: draft.shortName?.trim() || null, code: draft.code.trim(), timezone: draft.timezone.trim(), reason: reason.trim()});
  }
  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actions.changeStatus || disabled || !nextStatus || nextStatus === institution.status) return;
    if (!await ask({title:'Cambiar estado institucional',description:`${institution.name}: ${statusLabels[institution.status]} → ${statusLabels[nextStatus]}. ${nextStatus==='active'?'Se restablecerán las operaciones según los permisos vigentes; las invitaciones revocadas no regresarán.':'Se bloquearán operaciones y se revocarán invitaciones pendientes.'} Motivo: ${statusReason.trim()}.`,confirmLabel:'Cambiar estado',destructive:nextStatus!=='active'})) return;
    void mutate('status', {status: nextStatus, reason: statusReason.trim()});
  }
  const businessAvailable = institution.status === 'active' && !blocked;
  const academicAvailable = ['programs', 'courses', 'curricula', 'terms', 'campuses'].some(resource => hasInstitutionCapability(capabilities, `${resource}.read`));
  return <div className="sii-institution-admin">{confirmation}
    {!online && <p role="status" className="sii-catalog-error">Sin conexión. Las operaciones están deshabilitadas; tu borrador se conserva.</p>}
    {error && <p id="institution-admin-error" role="alert" tabIndex={-1} ref={feedback} className="sii-catalog-error">{error}</p>}
    {notice && <p role="status" className="sii-catalog-notice">{notice}</p>}
    {(needsSecurity || blocked || (!archived && !actions.updateSettings && !actions.changeStatus)) && <div className="sii-info-banner sii-admin-security-banner"><div className="sii-admin-security-copy"><strong>Revisa tu seguridad de cuenta</strong><p>Confirma tu identidad para volver a consultar las acciones disponibles.</p></div><SecurityActionLink returnTo={returnTo}/></div>}
    <section className="sii-panel sii-administration-summary" aria-label="Contexto de administración">
      <div><span className="sii-admin-summary-label">CONTEXTO INSTITUCIONAL</span><h2>{institution.name}</h2><p className="sii-admin-summary-meta">{institution.code} · <strong data-status={institution.status}>{statusLabels[institution.status]}</strong> · Versión {institution.version}</p><p className="sii-admin-summary-date">Actualizada: <time dateTime={institution.updatedAt}>{formatDate(institution.updatedAt)}</time></p></div>
      <Button variant="outline" type="button" className="sii-outline-button" disabled={saving || loading || !online} onClick={() => void reload()}>Recargar configuración vigente</Button>
      {archived ? <p>Esta institución está archivada. Su configuración y estado son de solo lectura.</p> : !businessAvailable ? <p>La administración se limita a configuración, estado e historial. Las operaciones institucionales ordinarias permanecen bloqueadas.</p> : null}
    </section>
    {businessAvailable && <nav className="sii-panel sii-administration-links" aria-label="Áreas administrativas">
      {academicAvailable && <Link href={`/dashboard/institutions/${institutionId}/academic`}><span aria-hidden="true">▥</span>Campus, programas, periodos, planes y materias</Link>}
      {hasInstitutionCapability(capabilities, 'users.read') && <Link href={`/dashboard/institutions/${institutionId}/users`}><span aria-hidden="true">♙</span>Usuarios y membresías</Link>}
      {hasInstitutionCapability(capabilities, 'roles.assign') && <Link href={`/dashboard/institutions/${institutionId}/roles`}><span aria-hidden="true">◇</span>Roles y permisos por ámbito</Link>}
      {hasInstitutionCapability(capabilities, 'invitations.manage') && <Link href={`/dashboard/institutions/${institutionId}/invitations`}><span aria-hidden="true">✉</span>Invitaciones y altas</Link>}
    </nav>}
    <div className="sii-administration-grid" aria-busy={loading || saving}>
      <section className="sii-panel sii-administration-card"><h2 ref={settingsHeading} tabIndex={-1}>Configuración institucional</h2>
        {loading && <p role="status">Consultando configuración vigente…</p>}
        <form className="sii-catalog-form" aria-label="Configuración institucional" onSubmit={saveSettings} aria-describedby={error ? 'institution-admin-error' : undefined}>
          <label htmlFor="institution-name">Nombre de la institución</label><Input id="institution-name" required minLength={1} maxLength={200} value={draft.name} disabled={disabled || !actions.updateSettings} onChange={event => setDraft(value => ({...value, name: event.target.value}))}/>
          <label htmlFor="institution-short-name">Nombre corto</label><Input id="institution-short-name" maxLength={80} value={draft.shortName ?? ''} disabled={disabled || !actions.updateSettings} onChange={event => setDraft(value => ({...value, shortName: event.target.value}))}/>
          <label htmlFor="institution-code">Clave institucional</label><Input id="institution-code" required maxLength={80} value={draft.code} disabled={disabled || !actions.updateSettings} onChange={event => setDraft(value => ({...value, code: event.target.value}))}/>
          <label htmlFor="institution-timezone">Zona horaria</label><Input id="institution-timezone" required maxLength={100} value={draft.timezone} aria-describedby="institution-timezone-help" disabled={disabled || !actions.updateSettings} onChange={event => setDraft(value => ({...value, timezone: event.target.value}))}/><p id="institution-timezone-help">Usa el identificador de la zona, por ejemplo America/Mexico_City. Se valida al guardar.</p>
          {actions.updateSettings && !archived && <><label htmlFor="institution-settings-reason">Motivo de la configuración</label><Textarea id="institution-settings-reason" required minLength={3} maxLength={500} value={reason} disabled={disabled} onChange={event => setReason(event.target.value)}/><Button variant="default" type="submit" className="sii-submit" disabled={disabled}>{saving ? 'Guardando…' : 'Guardar configuración'}</Button></>}
        </form>
      </section>
      <section className="sii-panel sii-administration-card"><h2>Estado institucional</h2><p>Los cambios de estado requieren motivo, confirmación de identidad vigente y registro en auditoría.</p>
        {actions.changeStatus && !archived ? <form className="sii-catalog-form" onSubmit={saveStatus} aria-label="Cambiar estado institucional" aria-describedby={error ? 'institution-admin-error' : undefined}>
          <label htmlFor="institution-status">Nuevo estado institucional</label><NativeSelect id="institution-status" required value={nextStatus} disabled={disabled} onChange={event => setNextStatus(event.target.value)}><option value="">Seleccionar estado</option>{['active', 'inactive', 'suspended'].filter(status => status !== institution.status).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</NativeSelect>
          <p>{nextStatus === 'active' ? 'La institución recuperará las operaciones permitidas por sus concesiones vigentes. Las invitaciones revocadas no se restauran.' : 'Inactivar o suspender bloquea las operaciones ordinarias, revoca las invitaciones pendientes y cancela sus entregas en cola. Los administradores autorizados conservan esta gestión limitada.'}</p>
          <label htmlFor="institution-status-reason">Motivo del cambio institucional</label><Textarea id="institution-status-reason" required minLength={3} maxLength={500} value={statusReason} disabled={disabled} onChange={event => setStatusReason(event.target.value)}/><Button variant="default" type="submit" className="sii-submit" disabled={disabled || !nextStatus}>Confirmar estado institucional</Button>
        </form> : <p>No hay cambios de estado autorizados para esta institución.</p>}
      </section>
    </div>
    {actions.readAudit && !blocked && <InstitutionAudit institutionId={institutionId} online={online} revision={auditRevision} onAuthorizationLost={authorizationLost}/>}
  </div>;
}

function ChangeValues({value}: {value: Record<string, unknown> | undefined}) {
  const entries = Object.entries(value ?? {}).filter(([key, item]) => changeLabels[key] && (item === null || ['string', 'number', 'boolean'].includes(typeof item)));
  return entries.length ? <dl>{entries.map(([key, item]) => <div key={key}><dt>{changeLabels[key]}</dt><dd>{item === null ? 'Sin asignar' : key === 'status' ? statusLabels[String(item)] ?? String(item) : String(item)}</dd></div>)}</dl> : <p>Sin campos de detalle disponibles.</p>;
}
function InstitutionAudit({institutionId, online, revision, onAuthorizationLost}: {institutionId: string; online: boolean; revision: number; onAuthorizationLost: () => void}) {
  const [draft, setDraft] = useState<AuditFilter>(emptyFilters);
  const [filters, setFilters] = useState<AuditFilter>(emptyFilters);
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const cursor = pages[pages.length - 1];
  const filterFeedback = useRef<HTMLParagraphElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { if (filterError) filterFeedback.current?.focus(); }, [filterError]);
  useEffect(() => { setPages([null]); }, [revision]);
  useEffect(() => {
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError(''); setRows([]); setNextCursor(null);
    const query = new URLSearchParams({limit: '10'});
    if (cursor) query.set('cursor', cursor);
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, key === 'from' || key === 'to' ? new Date(value).toISOString() : value);
    void request<PageResult<AuditEntry>>(`/api/v1/institutions/${institutionId}/audit?${query}`, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setRows(result.data); setNextCursor(result.page.nextCursor); } })
      .catch(cause => {
        if (controller.signal.aborted) return;
        setError(errorText(cause));
        if (cause instanceof AdministrationError && [401, 403].includes(cause.status)) onAuthorizationLost();
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [institutionId, cursor, filters, refresh, revision, onAuthorizationLost]);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.action.trim() && !/^[a-z][a-z0-9_.-]{0,99}$/.test(draft.action.trim())) { setFilterError('Escribe un identificador de acción válido, por ejemplo institution.settings.update.'); return; }
    if (draft.from && draft.to && new Date(draft.from) > new Date(draft.to)) { setFilterError('La fecha inicial debe ser anterior o igual a la fecha final.'); return; }
    abort.current?.abort(); setFilterError(''); setFilters({...draft, action: draft.action.trim()}); setPages([null]); setRefresh(value => value + 1);
  }
  return <section className="sii-panel sii-administration-card" aria-label="Auditoría institucional" aria-busy={loading}>
    <div className="sii-catalog-toolbar"><h2>Auditoría institucional</h2><Button variant="outline" type="button" className="sii-outline-button" disabled={loading || !online} onClick={() => { setPages([null]); setRefresh(value => value + 1); }}>Actualizar auditoría</Button></div>
    <p>Historial autorizado de esta institución. Los filtros de fechas usan tu hora local.</p>
    {filterError && <p role="alert" tabIndex={-1} ref={filterFeedback} id="institution-audit-filter-error" className="sii-catalog-error">{filterError}</p>}
    <form className="sii-catalog-form sii-administration-filters" onSubmit={apply} aria-label="Filtros de auditoría" aria-describedby={filterError ? 'institution-audit-filter-error' : undefined}>
      <label htmlFor="institution-audit-action">Acción exacta<Input id="institution-audit-action" maxLength={100} value={draft.action} onChange={event => setDraft(value => ({...value, action: event.target.value}))} disabled={!online} placeholder="Todas las acciones"/></label>
      <label htmlFor="institution-audit-kind">Tipo de recurso<NativeSelect id="institution-audit-kind" value={draft.targetKind} disabled={!online} onChange={event => setDraft(value => ({...value, targetKind: event.target.value}))}><option value="">Todos los recursos</option>{Object.entries(targetLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></label>
      <label htmlFor="institution-audit-from">Desde<Input id="institution-audit-from" type="datetime-local" value={draft.from} disabled={!online} onChange={event => setDraft(value => ({...value, from: event.target.value}))}/></label>
      <label htmlFor="institution-audit-to">Hasta<Input id="institution-audit-to" type="datetime-local" value={draft.to} disabled={!online} onChange={event => setDraft(value => ({...value, to: event.target.value}))}/></label>
      <Button variant="outline" type="submit" className="sii-outline-button" disabled={!online}>Aplicar filtros de auditoría</Button>
    </form>
    {loading ? <p role="status">Consultando auditoría…</p> : error ? <p role="alert" className="sii-catalog-error">{error}</p> : !rows.length ? <p role="status">No hay eventos para esta consulta.</p> : <ol className="sii-administration-events">{rows.map(entry => <li key={entry.id}><article>
      <h3>{actionLabels[entry.action] ?? 'Operación institucional'}</h3><p>Acción: {entry.action} · <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time></p><p>Responsable: {entry.actor?.label ?? 'Sistema / sin actor institucional'}</p>
      <p>Recurso: {entry.target ? `${targetLabels[entry.target.kind] ?? 'Recurso institucional'} · ${entry.target.id}` : 'Sin recurso institucional asociado'}</p><p>{entry.reason ?? 'Sin motivo registrado'}</p>
      <div className="sii-administration-changes"><div><h4>Antes</h4><ChangeValues value={entry.changes.before}/></div><div><h4>Después</h4><ChangeValues value={entry.changes.after}/></div></div>
    </article></li>)}</ol>}
    <nav className="sii-catalog-pagination" aria-label="Paginación de auditoría">
      <Button variant="outline" type="button" className="sii-outline-button" disabled={pages.length === 1 || loading || !online} onClick={() => setPages(value => value.slice(0, -1))}>Auditoría: página anterior</Button><span aria-live="polite">Página de auditoría {pages.length}</span>
      <Button variant="outline" type="button" className="sii-outline-button" disabled={!nextCursor || loading || !online} onClick={() => setPages(value => [...value, nextCursor])}>Auditoría: siguiente página</Button>
      {error && <Button variant="outline" type="button" className="sii-outline-button" disabled={!online || loading} onClick={() => { setPages([null]); setRefresh(value => value + 1); }}>Reintentar auditoría</Button>}
    </nav>
  </section>;
}
