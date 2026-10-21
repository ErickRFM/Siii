'use client';
import SiiScrollRegion from './sii-scroll-region';
import {useInstitutionConfirmation} from './sii-confirmation';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CapabilityState, hasInstitutionCapability, PROFILE_LABELS, SecurityActionLink, useInstitutionCapabilities, type InstitutionGrant, type InstitutionCapabilities } from './institution-capabilities';

type Member = { id: string; username: string; firstName: string; lastName: string; status: string; grants: InstitutionGrant[] };
type ScopeRow = { id: string; name: string; code: string; status: string };
type ScopeType = InstitutionGrant['scopeType'];
const scopeLabels = { institution: 'Institución', program: 'Programa', campus: 'Campus' };
const date = (value: string) => new Date(value).toLocaleString('es-MX');
function errorText(code?: string) {
  switch (code) {
    case 'MFA_REQUIRED': return 'Configura o verifica tu autenticador en seguridad y vuelve a intentar.';
    case 'STEP_UP_REQUIRED': return 'Confirma tu identidad en seguridad y vuelve a intentar. La verificación debe tener menos de cinco minutos.';
    case 'PASSWORD_CHANGE_REQUIRED': return 'Actualiza tu contraseña en seguridad y vuelve a intentar.';
    case 'ROLE_GRANT_DENIED': case 'ROLE_REVOKE_DENIED': return 'No tienes autoridad para conceder o revocar este perfil en el ámbito seleccionado.';
    case 'TARGET_ROLE_PROTECTED': return 'Esta membresía tiene un perfil protegido que no puedes modificar.';
    case 'INVALID_TARGET': case 'SELF_CHANGE_DENIED': return 'No puedes modificar tus propias concesiones desde esta pantalla.';
    case 'GRANT_EXPIRY_DENIED': return 'La vigencia solicitada supera tu autorización. Selecciona una fecha dentro del límite indicado.';
    case 'INVALID_SCOPE': return 'El ámbito ya no está disponible o no corresponde a esta institución.';
    case 'LAST_ADMIN_REQUIRED': return 'La institución debe conservar al menos un administrador vigente.';
    case 'ROLE_ALREADY_ASSIGNED': case 'ALREADY_ASSIGNED': return 'Ese perfil ya tiene una concesión vigente en este ámbito.';
    case 'VALIDATION_ERROR': return 'Revisa el perfil, el ámbito y la fecha de vencimiento.';
    case 'FORBIDDEN': return 'Tu acceso cambió. Actualiza los permisos antes de volver a intentar.';
    case 'NOT_FOUND': case 'MEMBERSHIP_NOT_FOUND': case 'ROLE_NOT_ASSIGNED': return 'La membresía o concesión ya no está disponible. Actualiza el listado.';
    default: return 'No se pudo completar la operación. Vuelve a intentar.';
  }
}
export default function InstitutionRoles({ institutionId }: { institutionId: string }) {
 const {ask,confirmation}=useInstitutionConfirmation();
  const { data: access, loading: accessLoading, error: accessError, refresh } = useInstitutionCapabilities();
  const allowed = hasInstitutionCapability(access, 'roles.assign');
  const [members, setMembers] = useState<Member[]>([]);
  const [programs, setPrograms] = useState<ScopeRow[]>([]);
  const [campuses, setCampuses] = useState<ScopeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [securityRequired, setSecurityRequired] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [membershipId, setMembershipId] = useState('');
  const [role, setRole] = useState('');
  const [scopeType, setScopeType] = useState<ScopeType>('institution');
  const [scopeId, setScopeId] = useState('');
  const [scopeAuthority,setScopeAuthority]=useState<InstitutionCapabilities['scopedCapabilities'][number]|null>(null);
  const [scopeLoading,setScopeLoading]=useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [revision, setRevision] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const base = `/api/v1/institutions/${institutionId}`;
  const returnTo = `/dashboard/institutions/${institutionId}/roles`;
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const readPages = useCallback(async <T,>(path: string, signal: AbortSignal): Promise<T[]> => {
    const rows: T[] = []; let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ limit: '100' }); if (cursor) query.set('cursor', cursor);
      const response = await fetch(`${base}/${path}?${query}`, { credentials: 'same-origin', cache: 'no-store', signal });
      if (!response.ok) { const failure = await response.json().catch(() => ({})) as { error?: { code?: string } }; throw new Error(failure.error?.code ?? 'SERVER_ERROR'); }
      const body = await response.json() as { data: T[]; page: { nextCursor: string | null } };
      if (!Array.isArray(body.data) || !body.page) throw new Error('SERVER_ERROR');
      rows.push(...body.data); cursor = body.page.nextCursor;
    } while (cursor && !signal.aborted);
    return rows;
  }, [base]);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController(); setLoading(true); setLoadError('');
    void Promise.all([readPages<Member>('memberships', controller.signal), readPages<ScopeRow>('academic/programs', controller.signal), readPages<ScopeRow>('academic/campuses', controller.signal)]).then(([people, programRows, campusRows]) => {
      if (!controller.signal.aborted) { setMembers(people); setPrograms(programRows); setCampuses(campusRows); }
    }).catch(cause => {
      if (!controller.signal.aborted) { const code = cause instanceof Error ? cause.message : ''; setLoadError(cause instanceof TypeError ? 'Sin conexión. No se pudieron consultar las concesiones.' : errorText(code)); setSecurityRequired(['MFA_REQUIRED', 'STEP_UP_REQUIRED', 'PASSWORD_CHANGE_REQUIRED'].includes(code)); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowed, revision, readPages]);

  useEffect(()=>{
    setScopeAuthority(null);
    if(scopeType==='institution'||!scopeId||!allowed){setScopeLoading(false);return;}
    const controller=new AbortController();setScopeLoading(true);
    void(async()=>{
      try{
        const query=new URLSearchParams({scopeType,scopeId});
        const response=await fetch(`${base}/capabilities?${query}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
        if(!response.ok){const failure=await response.json().catch(()=>({})) as {error?:{code?:string}};throw new Error(failure.error?.code??'SERVER_ERROR');}
        const body=await response.json() as {data:InstitutionCapabilities};
        const authority=body.data.scopedCapabilities.find(scope=>scope.scopeType===scopeType&&scope.scopeId===scopeId);
        if(!controller.signal.aborted&&!body.data.restricted)setScopeAuthority(authority??null);
      }catch(cause){if(!controller.signal.aborted)setError(cause instanceof TypeError?'Sin conexión. No se pudo comprobar el ámbito.':errorText(cause instanceof Error?cause.message:undefined));}
      finally{if(!controller.signal.aborted)setScopeLoading(false);}
    })();
    return()=>controller.abort();
  },[base,scopeType,scopeId,allowed,access]);
  const authority = scopeType === 'institution' ? access : scopeAuthority?.scopeType===scopeType&&scopeAuthority.scopeId===scopeId?scopeAuthority:null;
  const grantableRoles = authority?.grantableRoles ?? [];
  const expiryLimit = role ? authority?.grantExpiryLimits[role] : undefined;
  const grantRows = members.flatMap(member => (member.grants ?? []).map(grant => ({ member, grant })));
  function changeScope(type: ScopeType) { setScopeType(type); setScopeId(''); setRole(''); setExpiresAt(''); setError(''); }
  async function mutate(action: 'assign' | 'revoke', payload: Record<string, unknown>) {
    if (saving || !online) return false;
    setSaving(true); setError(''); setNotice(''); setSecurityRequired(false);
    try {
      const response = await fetch(`${base}/roles/${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) { const failure = await response.json().catch(() => ({})) as { error?: { code?: string } }; setError(errorText(failure.error?.code)); setSecurityRequired(['MFA_REQUIRED', 'STEP_UP_REQUIRED', 'PASSWORD_CHANGE_REQUIRED'].includes(failure.error?.code ?? '')); return false; }
      setNotice(action === 'assign' ? 'Perfil concedido. La operación quedó auditada.' : 'Concesión revocada. La operación quedó auditada.');
      setRevision(value => value + 1); refresh(); return true;
    } catch { setError('Sin conexión. No se confirmó la operación. Comprueba tu conexión y actualiza el listado antes de reintentar.'); return false; }
    finally { setSaving(false); }
  }
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!grantableRoles.includes(role)) { setError('Selecciona un perfil permitido para este ámbito.'); return; }
    const expiry = expiresAt ? new Date(expiresAt).toISOString() : null;
    if (expiryLimit && (!expiry || new Date(expiry) > new Date(expiryLimit))) { setError('La concesión debe vencer dentro del límite de tu autorización.'); return; }
    if (await mutate('assign', { membershipId, role, scopeType, scopeId: scopeType === 'institution' ? null : scopeId, expiresAt: expiry })) { setRole(''); setExpiresAt(''); }
  }
  async function revoke(grant: InstitutionGrant,member:Member) {
    const parent=grant.scopeType==='institution'?'esta institución':(grant.scopeType==='program'?programs:campuses).find(row=>row.id===grant.scopeId)?.name??'el ámbito seleccionado';
    if (!await ask({title:'Revocar perfil institucional',description:`Se revocará ${PROFILE_LABELS[grant.role]??grant.role} de ${member.username} en ${parent}. La autorización se validará en el servidor.`,confirmLabel:'Revocar perfil',destructive:true})) return;
    await mutate('revoke', { grantId: grant.id });
  }
  if (accessLoading || accessError || access?.restricted) return <CapabilityState returnTo={returnTo}/>;
  if (!allowed) return <p className="sii-info-banner">No tienes permiso para administrar roles y ámbitos.</p>;
  return <>{confirmation}
    {!online && <p className="sii-catalog-error" role="status">Sin conexión. Las concesiones pueden estar desactualizadas; las operaciones están deshabilitadas.</p>}
    {notice && <p className="sii-catalog-notice" role="status">{notice}</p>}
    {error && <p id="roles-error" className="sii-catalog-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    {loadError && <p className="sii-catalog-error" role="alert">{loadError}</p>}
    {securityRequired && <SecurityActionLink returnTo={returnTo}/>}
    <div className="sii-catalog-layout">
      <section className="sii-panel sii-catalog-table-panel" aria-label="Concesiones vigentes" aria-busy={loading}>
        <div className="sii-catalog-toolbar"><h2>Concesiones vigentes</h2><button type="button" className="sii-outline-button" disabled={loading || saving || !online} onClick={() => { setRevision(value => value + 1); refresh(); }}>Actualizar concesiones</button></div>
        {loading ? <p className="sii-empty" role="status">Consultando membresías y concesiones…</p> : loadError ? <p className="sii-empty">No se pudieron consultar las concesiones. Actualiza el listado para reintentar.</p> : grantRows.length === 0 ? <p className="sii-empty" role="status">No hay concesiones vigentes.</p> : <SiiScrollRegion label="Tabla de concesiones, desplazamiento horizontal"><table className="sii-catalog-table"><thead><tr><th scope="col">Membresía</th><th scope="col">Perfil</th><th scope="col">Ámbito</th><th scope="col">Vigencia</th><th scope="col">Acciones</th></tr></thead><tbody>{grantRows.map(({ member, grant }) => <tr key={grant.id}><td><strong>{member.firstName} {member.lastName}</strong><small>{member.username} · {member.status === 'active' ? 'Activa' : 'Suspendida'}</small></td><td>{PROFILE_LABELS[grant.role] ?? grant.role}</td><td>{scopeLabels[grant.scopeType]}{grant.scopeId && <small>{(grant.scopeType === 'program' ? programs : campuses).find(row => row.id === grant.scopeId)?.name ?? 'Ámbito no disponible'}</small>}</td><td>{grant.expiresAt ? date(grant.expiresAt) : 'Sin vencimiento'}</td><td>{member.id===access?.membershipId?<span>Concesión propia</span>:<button type="button" className="sii-outline-button" disabled={saving || !online} onClick={() => void revoke(grant,member)}>Revocar concesión</button>}</td></tr>)}</tbody></table></SiiScrollRegion>}
      </section>
      <aside className="sii-panel sii-catalog-create"><span className="sii-section-kicker">CONCESIÓN DE ACCESO</span><h2>Conceder perfil</h2><p>El servidor comprueba tu autoridad, el ámbito y la vigencia. Las concesiones no pueden ampliar tu propia autorización.</p>
        <form className="sii-catalog-form" onSubmit={event => void assign(event)} aria-describedby={error ? 'roles-error' : undefined}>
          <label>Membresía<select aria-label="Membresía" value={membershipId} onChange={event => setMembershipId(event.target.value)} required disabled={loading || saving || !online}><option value="">Seleccionar membresía activa</option>{members.filter(member => member.status === 'active'&&member.id!==access?.membershipId).map(member => <option key={member.id} value={member.id}>{member.username} · {member.firstName} {member.lastName}</option>)}</select></label>
          <label>Ámbito<select aria-label="Ámbito" value={scopeType} onChange={event => changeScope(event.target.value as ScopeType)} disabled={saving || !online}>{Object.entries(scopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {scopeType !== 'institution' && <label>{scopeType === 'program' ? 'Programa' : 'Campus'}<select aria-label={scopeType==='program'?'Programa':'Campus'} value={scopeId} onChange={event => { setScopeId(event.target.value); setRole(''); setExpiresAt(''); }} required disabled={loading || saving || !online}><option value="">Seleccionar ámbito</option>{(scopeType === 'program' ? programs : campuses).filter(row => row.status === 'active').map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>}
          {scopeLoading&&<p role="status">Comprobando autoridad para el ámbito…</p>}
          <label>Perfil<select aria-label="Perfil" value={role} onChange={event => { setRole(event.target.value); setExpiresAt(''); }} required disabled={saving || scopeLoading || !online}><option value="">Seleccionar perfil permitido</option>{Object.entries(PROFILE_LABELS).map(([value, label]) => <option key={value} value={value} disabled={!grantableRoles.includes(value)}>{label}{!grantableRoles.includes(value) ? ' · No concedible en este ámbito' : ''}</option>)}</select></label>
          {expiryLimit && <p id="grant-expiry-limit">Vencimiento obligatorio: como máximo {date(expiryLimit)}.</p>}
          <label>Vence el<input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} required={Boolean(expiryLimit)} aria-describedby={expiryLimit ? 'grant-expiry-limit' : undefined} disabled={saving || !online}/></label>
          <p>La hora se interpreta en la zona de tu dispositivo. Sin fecha, la concesión es permanente si tu autorización lo permite.</p>
          <button type="submit" className="sii-submit" disabled={loading || scopeLoading || saving || !online || !grantableRoles.includes(role)}>{saving ? 'Guardando…' : 'Conceder perfil'}</button>
        </form>
      </aside>
    </div>
  </>;
}
