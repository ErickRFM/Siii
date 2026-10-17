import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { ROLE_LABELS, hasPermission } from '@/shared/auth/roles';
import SiiAppShell from '@/components/sii-app-shell';
import PasswordChange from './password-change';
import {ManageableInstitutions} from '@/components/institution-admin';

export const dynamic = 'force-dynamic';

const modules = [
  { symbol: '▣', title: 'Estudiantes y docentes', description: 'Expedientes académicos de alumnos y profesores.', route: 'registry' },
  { symbol: '▤', title: 'Grupos e inscripciones', description: 'Grupos, secciones e inscripciones institucionales.', route: 'operations' },
  { symbol: '◷', title: 'Horarios y aulas', description: 'Aulas, horarios e instancias de clase.', route: 'scheduling' },
  { symbol: '▦', title: 'Calificaciones', description: 'Evaluación académica y actas autorizadas.', route: 'grading' },
  { symbol: '✉', title: 'Servicios universitarios', description: 'Avisos, solicitudes, tutorías y talleres.', route: 'services' },
] as const;

export default async function Dashboard() {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const institutions = await getInstitutionAccess(user.id);
  const roleNames = [...new Set(institutions.flatMap(item => item.roles))].map(role => ROLE_LABELS[role]);

  return (
    <SiiAppShell firstName={user.firstName} fullName={`${user.firstName} ${user.lastName}`} active="overview" institutionId={institutions.length === 1 ? institutions[0].institutionId : undefined}>
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
        {institutions.length === 0 ? (
          <p className="sii-empty">Aún no tienes una institución asignada.</p>
        ) : institutions.map(inst => (
          <section key={inst.institutionId} aria-label={`Módulos de ${inst.institutionName}`}>
            <h3>{inst.institutionName}</h3>
            <div className="sii-module-grid">
              {modules.map(module => (
                <Link key={module.route}
                  href={`/dashboard/institutions/${inst.institutionId}/${module.route}` as Route}
                  className="sii-module-card">
                  <span className="sii-module-glyph" aria-hidden="true">{module.symbol}</span>
                  <h3>{module.title}</h3>
                  <p>{module.description}</p>
                  <div className="sii-module-bottom"><span>Acceder al módulo (según permisos)</span><span aria-hidden="true">↗</span></div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </section>
      <footer className="sii-footer">SII · Sistema Institucional Integral <span>Administración académica segura · Experiencia móvil en Compañero</span></footer>
    </SiiAppShell>
  );
}
