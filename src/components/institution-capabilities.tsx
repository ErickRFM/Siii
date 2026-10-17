'use client';

import Link from 'next/link';
import type {Route} from 'next';
<<<<<<< HEAD
import {academicModuleLinks} from '@/shared/navigation/academic-modules';
=======
>>>>>>> integrate/sii-v1
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type InstitutionGrant = { id: string; role: string; scopeType: 'institution' | 'program' | 'campus'; scopeId: string | null; expiresAt: string | null };
export type InstitutionCapabilities = {
  institutionId: string; membershipId: string; roles: string[]; grants: InstitutionGrant[];
  capabilities: string[]; grantableRoles: string[]; grantExpiryLimits: Record<string,string|null>;
  scopedCapabilities: { scopeType: 'program' | 'campus'; scopeId: string; capabilities: string[]; grantableRoles: string[]; grantExpiryLimits: Record<string,string|null> }[];
  assurance: { mfaRequired: boolean; mfaConfigured: boolean; mfaVerified: boolean; stepUpExpiresAt: string | null };
  restricted: boolean;
};
const Context = createContext<{ data: InstitutionCapabilities | null; loading: boolean; error: string; refresh: () => void }>({ data: null, loading: false, error: '', refresh: () => {} });

export function InstitutionCapabilitiesProvider({ institutionId, children }: { institutionId?: string; children: ReactNode }) {
  const [data, setData] = useState<InstitutionCapabilities | null>(null);
  const [loading, setLoading] = useState(Boolean(institutionId));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!institutionId) return;
    const controller = new AbortController();
    setData(null); setLoading(true); setError('');
    void (async () => {
      try {
        const response = await fetch(`/api/v1/institutions/${institutionId}/capabilities`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? 'Tu sesión venció. Vuelve a iniciar sesión.' : response.status === 403 ? 'No tienes acceso vigente a esta institución.' : 'No se pudieron consultar tus permisos. Vuelve a intentar.');
        const body = await response.json() as { data: InstitutionCapabilities };
        if (body.data?.institutionId !== institutionId || !Array.isArray(body.data.capabilities) || !Array.isArray(body.data.scopedCapabilities) || !Array.isArray(body.data.grants) || !body.data.assurance) throw new Error('No se pudieron consultar tus permisos. Vuelve a intentar.');
        if (!controller.signal.aborted) setData(body.data);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof TypeError ? 'Sin conexión. Comprueba tu conexión y vuelve a consultar tus permisos.' : cause instanceof Error ? cause.message : 'No se pudieron consultar tus permisos.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [institutionId, revision]);
  return <Context.Provider value={{ data, loading, error, refresh }}>{children}</Context.Provider>;
}
export function useInstitutionCapabilities() { return useContext(Context); }

// Presentation only: the server independently authorizes every request and record.
export function hasInstitutionCapability(data: InstitutionCapabilities | null, capability: string) {
  return Boolean(data && !data.restricted && data.capabilities.includes(capability));
}
export function hasAnyCapability(data: InstitutionCapabilities | null, capability: string) {
  return hasInstitutionCapability(data, capability) || Boolean(data && !data.restricted && data.scopedCapabilities.some(scope => scope.capabilities.includes(capability)));
}
export function hasScopedCapability(data: InstitutionCapabilities | null, capability: string, scopeType: 'program' | 'campus', scopeId?: string) {
  return hasInstitutionCapability(data, capability) || Boolean(data && !data.restricted && scopeId && data.scopedCapabilities.some(scope => scope.scopeType === scopeType && scope.scopeId === scopeId && scope.capabilities.includes(capability)));
}
export function securityReturnUrl(returnTo: string) { return `/dashboard/security?returnTo=${encodeURIComponent(returnTo)}`; }
export function SecurityActionLink({ returnTo }: { returnTo: string }) {
  return <Link href={securityReturnUrl(returnTo) as Route} className="sii-outline-button">Configurar seguridad y volver</Link>;
}
export function CapabilityState({ returnTo }: { returnTo: string }) {
  const { data, loading, error, refresh } = useInstitutionCapabilities();
  if (loading) return <p role="status">Consultando permisos vigentes…</p>;
  if (error) return <div><p className="sii-catalog-error" role="alert">{error}</p><button type="button" className="sii-outline-button" onClick={refresh}>Reintentar permisos</button></div>;
  if (data?.restricted) return <div className="sii-info-banner"><p>{!data.assurance.mfaConfigured ? 'Configura un autenticador para acceder a esta institución.' : !data.assurance.mfaVerified ? 'Verifica tu autenticador para acceder a esta institución.' : 'Actualiza tu contraseña para acceder a esta institución.'}</p><SecurityActionLink returnTo={returnTo}/></div>;
  return null;
}

export const PROFILE_LABELS: Readonly<Record<string, string>> = {
  guest: 'Invitado', student: 'Estudiante', workshop_participant: 'Participante de taller', workshop_facilitator: 'Facilitador de taller',
  teacher_pending: 'Docente pendiente', teacher: 'Docente', tutor: 'Tutor', coordinator: 'Coordinación',
  control_escolar: 'Control escolar', admin: 'Administración', super_admin: 'Superadministración',
};
export function InstitutionOverview({ institutionId }: { institutionId: string }) {
  const { data } = useInstitutionCapabilities();
  return <>
    <CapabilityState returnTo={`/dashboard/institutions/${institutionId}`}/>
    {data && <><div className="sii-role-list">{data.roles.map(role => <span className="sii-role-pill" key={role}>{PROFILE_LABELS[role] ?? role}</span>)}</div>
      {data.grants.length > 0 && <ul>{data.grants.map(grant => <li key={grant.id}>{PROFILE_LABELS[grant.role] ?? grant.role} · {grant.scopeType === 'institution' ? 'Institución' : grant.scopeType === 'program' ? 'Programa asignado' : 'Campus asignado'} · {grant.expiresAt ? `Vigente hasta ${new Date(grant.expiresAt).toLocaleString('es-MX')}` : 'Sin vencimiento'}</li>)}</ul>}
<<<<<<< HEAD
      {!data.restricted && ['programs', 'courses', 'curricula', 'terms', 'campuses'].some(resource => hasAnyCapability(data, `${resource}.read`)) && <Link href={`/dashboard/institutions/${institutionId}/academic`} className="sii-outline-button">Abrir catálogo académico →</Link>}
=======
      {['programs', 'courses', 'curricula', 'terms', 'campuses'].some(resource => hasAnyCapability(data, `${resource}.read`)) && <Link href={`/dashboard/institutions/${institutionId}/academic`} className="sii-outline-button">Abrir catálogo académico →</Link>}
>>>>>>> integrate/sii-v1
      {hasInstitutionCapability(data, 'users.read') && <Link href={`/dashboard/institutions/${institutionId}/users`} className="sii-outline-button">Usuarios y membresías</Link>}
      {hasInstitutionCapability(data, 'roles.assign') && <Link href={`/dashboard/institutions/${institutionId}/roles`} className="sii-outline-button">Roles y ámbitos</Link>}
      {hasInstitutionCapability(data, 'invitations.manage') && <Link href={`/dashboard/institutions/${institutionId}/invitations`} className="sii-outline-button">Invitaciones</Link>}
    </>}
<<<<<<< HEAD
    {data && !data.restricted && ['programs','courses','curricula','terms','campuses'].some(resource => hasAnyCapability(data, `${resource}.read`)) && <Link href={`/dashboard/institutions/${institutionId}/academic`} className="sii-outline-button">Catálogo académico</Link>}
    {data&&!data.restricted&&academicModuleLinks(data.capabilities).map(module=><Link key={module.id} href={`/dashboard/institutions/${institutionId}/${module.id}` as Route} className="sii-outline-button">{module.label}</Link>)}
    <div className="sii-info-banner">Cada módulo disponible valida tus permisos vigentes en el servidor.</div>
=======
    <div className="sii-info-banner">Los catálogos disponibles dependen de tus concesiones vigentes y su ámbito. Matrículas, grupos y calificaciones siguen en desarrollo.</div>
>>>>>>> integrate/sii-v1
  </>;
}
