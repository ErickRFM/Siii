import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { ROLE_LABELS, hasPermission } from '@/shared/auth/roles';

import PasswordChange from './password-change';
import {ManageableInstitutions} from '@/components/institution-admin';
import InstitutionModuleDirectory from '@/components/institution-module-directory';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const institutions = await getInstitutionAccess(user.id);
  const roleNames = [...new Set(institutions.flatMap(item => item.roles))].map(role => ROLE_LABELS[role]);

  return (
    <>
      <div className="sii-page-eyebrow">CENTRO DE OPERACIONES <span className="sii-page-eyebrow-line"/></div>
      <div className="sii-page-heading">
        <div>
          <h1>Bienvenido, {user.firstName}<span className="sii-welcome-period">.</span></h1>
          <p>Este es tu espacio institucional. Consulta tus accesos y las áreas disponibles.</p>
        </div>
        <span className="sii-badge sii-badge--live"><span className="sii-online-dot"/> Cuenta activa</span>
      </div>

      {user.mustChangePassword && (
        <section className="sii-security-notice" role="alert" aria-label="Actualización obligatoria de contraseña">
          <div className="sii-notice-header"><span aria-hidden="true">⚠</span><div><strong>Actualiza tu contraseña para continuar</strong><p>Por seguridad, las operaciones administrativas están restringidas hasta completar este cambio.</p></div></div>
          <PasswordChange/>
        </section>
      )}

      <section className="sii-summary-grid" aria-label="Resumen de tu acceso">
        <article className="sii-metric">
          <span className="sii-metric-icon sii-metric-icon--rose" aria-hidden="true">▥</span>
          <span className="sii-metric-label">Instituciones asignadas</span>
          <span className="sii-metric-value">{institutions.length}</span>
          <span className="sii-metric-caption">Membresías con acceso vigente</span>
        </article>
        <article className="sii-metric">
          <span className="sii-metric-icon sii-metric-icon--amber" aria-hidden="true">♙</span>
          <span className="sii-metric-label">Perfiles autorizados</span>
          <span className="sii-metric-value">{roleNames.length}</span>
          <span className="sii-metric-caption">Roles distintos entre tus instituciones</span>
        </article>
        <article className="sii-metric">
          <span className="sii-metric-icon sii-metric-icon--blue" aria-hidden="true">◇</span>
          <span className="sii-metric-label">Seguridad de cuenta</span>
          <span className="sii-metric-value sii-metric-value--text">{user.mustChangePassword ? 'Acción requerida' : 'Al día'}</span>
          <Link href="/dashboard/security" className="sii-metric-link">Gestionar seguridad <span aria-hidden="true">↗</span></Link>
        </article>
      </section>

      <ManageableInstitutions/>

      <div className="sii-content-grid">
        <section className="sii-panel sii-institutions-panel">
          <div className="sii-panel-top">
            <div><span className="sii-section-kicker">TU RED UNIVERSITARIA</span><h2>Mis instituciones</h2><p>Accesos concedidos y permisos vigentes.</p></div>
            <span className="sii-small-count">{institutions.length} {institutions.length === 1 ? 'institución' : 'instituciones'}</span>
          </div>
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
            <div className="sii-empty"><span aria-hidden="true">▥</span><strong>No tienes instituciones asignadas</strong><p>Un administrador debe concederte una membresía para poder acceder a los recursos académicos.</p></div>
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
        <div className="sii-panel-top sii-panel-top--outside">
          <div><span className="sii-section-kicker">ECOSISTEMA SII</span><h2>Módulos institucionales</h2><p>Selecciona tu institución para trabajar. Cada módulo verifica permisos y seguridad en el servidor.</p></div>
          <span className="sii-badge sii-badge--muted">Acceso por institución</span>
        </div>
        {institutions.length === 0 ? <p className="sii-empty">Aún no tienes una institución asignada.</p> : institutions.map(inst => (
          <InstitutionModuleDirectory key={inst.institutionId} institutionId={inst.institutionId} institutionName={inst.institutionName}/>
        ))}
      </section>
      <footer className="sii-footer">SII · Sistema Institucional Integral <span>Administración académica segura · Experiencia móvil en Compañero</span></footer>
    </>
  );
}
