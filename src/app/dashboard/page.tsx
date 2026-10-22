import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { ROLE_LABELS, hasPermission } from '@/shared/auth/roles';

import PasswordChange from './password-change';
import {ManageableInstitutions} from '@/components/institution-admin';
import InstitutionModuleDirectory from '@/components/institution-module-directory';
import {SiiPageIntro,SiiSectionHeader,SiiMetricTile,SiiStatusPill,SiiEmptyView} from '@/components/ui/sii-kit';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const institutions = await getInstitutionAccess(user.id);
  const roleNames = [...new Set(institutions.flatMap(item => item.roles))].map(role => ROLE_LABELS[role]);

  return (
    <>
      <SiiPageIntro eyebrow="CENTRO DE OPERACIONES" title={`Bienvenido, ${user.firstName}`}
        description="Este es tu espacio institucional. Consulta tus accesos y las áreas disponibles."
        actions={<SiiStatusPill live>Cuenta activa</SiiStatusPill>}/>

      {user.mustChangePassword && (
        <section className="sii-security-notice" role="alert" aria-label="Actualización obligatoria de contraseña">
          <div className="sii-notice-header"><span aria-hidden="true">⚠</span><div><strong>Actualiza tu contraseña para continuar</strong><p>Por seguridad, las operaciones administrativas están restringidas hasta completar este cambio.</p></div></div>
          <PasswordChange/>
        </section>
      )}

      <section className="sii-summary-grid" aria-label="Resumen de tu acceso">
        <SiiMetricTile label="Instituciones asignadas" value={institutions.length} caption="Membresías con acceso vigente" icon="institution" tone="rose"/>
        <SiiMetricTile label="Perfiles autorizados" value={roleNames.length} caption="Roles distintos entre tus instituciones" icon="users" tone="amber"/>
        <SiiMetricTile label="Seguridad de cuenta" value={user.mustChangePassword ? 'Acción requerida' : 'Al día'} icon="shield" tone="blue"
          href="/dashboard/security" actionLabel="Gestionar seguridad"/>
      </section>

      <ManageableInstitutions/>

      <div className="sii-content-grid">
        <section className="sii-panel sii-institutions-panel">
          <SiiSectionHeader eyebrow="TU RED UNIVERSITARIA" title="Mis instituciones" description="Accesos concedidos y permisos vigentes."
            right={<span className="sii-small-count">{institutions.length} {institutions.length === 1 ? 'institución' : 'instituciones'}</span>}/>
          {institutions.length ? (
            <div className="sii-institution-list">
              {institutions.map(inst => (
                <Link key={inst.institutionId} className="sii-institution-item"
                  href={`/dashboard/institutions/${inst.institutionId}` as Route}>
                  <span className="sii-institution-monogram">{inst.institutionCode.slice(0,2).toUpperCase()}</span>
                  <span className="sii-institution-info"><strong>{inst.institutionName}</strong><small>{inst.institutionCode} · {inst.roles.map(role => ROLE_LABELS[role]).join(', ')}</small></span>
                  <span className="sii-institution-tag">{hasPermission(inst.roles, 'users.manage') ? 'Administración' : 'Acceso vigente'}</span>
                  <span className="sii-institution-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          ) : (
            <SiiEmptyView icon="institution" title="No tienes instituciones asignadas" description="Un administrador debe concederte una membresía para poder acceder a los recursos académicos."/>
          )}
        </section>

        <aside className="sii-panel sii-access-panel">
          <span className="sii-section-kicker">CENTRO PERSONAL</span>
          <h2>Tu cuenta está en control.</h2>
          <p>La plataforma utiliza permisos específicos de cada institución para proteger la información académica.</p>
          <div className="sii-access-feature"><span aria-hidden="true">✓</span><div><strong>Sesión institucional</strong><small>Acceso verificado por el servidor</small></div></div>
          <div className="sii-access-feature"><span aria-hidden="true">✓</span><div><strong>Permisos por institución</strong><small>Vigentes según tus membresías</small></div></div>
          <Link href="/dashboard/security" className="sii-outline-button">Ir a seguridad <span aria-hidden="true">→</span></Link>
        </aside>
      </div>

      <section className="sii-modules-section">
        <SiiSectionHeader outside eyebrow="ECOSISTEMA SII" title="Módulos institucionales"
          description="Selecciona tu institución para trabajar. Cada módulo verifica permisos y seguridad en el servidor."
          right={<SiiStatusPill>Acceso por institución</SiiStatusPill>}/>
        {institutions.length === 0 ? <p className="sii-empty">Aún no tienes una institución asignada.</p> : institutions.map(inst => (
          <InstitutionModuleDirectory key={inst.institutionId} institutionId={inst.institutionId} institutionName={inst.institutionName}/>
        ))}
      </section>
      <footer className="sii-footer">SII · Sistema Institucional Integral <span>Administración académica segura · Experiencia móvil en Compañero</span></footer>
    </>
  );
}
