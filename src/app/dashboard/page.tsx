import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getIdentity,getInstitutionAccess } from '@/shared/auth/session';
import { hasPermission,ROLE_LABELS } from '@/shared/auth/roles';
import PasswordChange from './password-change';
export const dynamic='force-dynamic';
const modules=[
 {title:'Control escolar',description:'Expedientes, estudiantes, docentes e inscripciones.',kind:'F3 · Preparación'},
 {title:'Planeación académica',description:'Ofertas, aulas, secciones y conflictos de horarios.',kind:'F4 · Preparación'},
 {title:'Calificaciones',description:'Evaluaciones, actas y publicación oficial.',kind:'F6 · Preparación'},
 {title:'Integraciones',description:'Contratos, sincronización y estado de Compañero.',kind:'F5 · Preparación'},
];
export default async function Dashboard(){
 const user=await getIdentity();if(!user)redirect('/login');
 const institutions=await getInstitutionAccess(user.id);
 return <div className="dashboard-shell">
  <aside className="sidebar"><Link href="/dashboard" className="wordmark">Siii<span>.</span></Link><div className="side-caption">CENTRO INSTITUCIONAL</div><nav aria-label="Navegación principal"><Link className="side-item active" href="/dashboard">◫ <span>Resumen general</span></Link><span className="side-item disabled">◎ <span>Operaciones académicas</span></span><span className="side-item disabled">▤ <span>Calificaciones</span></span><span className="side-item disabled">⇄ <span>Integraciones</span></span></nav><div className="sidebar-foot">Sistema Universitario<br/>Versión inicial · F2</div></aside>
  <div className="dashboard-main"><header className="topbar"><span>Plataforma / Resumen</span><div className="header-actions"><span className="user-pill">{user.firstName} {user.lastName}</span><form action="/api/v1/auth/logout" method="post"><button className="text-button" type="submit">Cerrar sesión</button></form></div></header>
  <main className="dashboard-content"><p className="eyebrow">CENTRO DE OPERACIONES</p><div className="heading-row"><div><h1>Bienvenido, {user.firstName}</h1><p className="muted">Consulta tu contexto institucional y los módulos del sistema.</p></div><span className="status-tag"><span className="status-dot"/> Sesión autenticada</span></div>
  {user.mustChangePassword&&<div className="notice" role="alert"><strong>Cambio de contraseña requerido.</strong> Las operaciones administrativas permanecen restringidas hasta completar el flujo de actualización de contraseña.<PasswordChange/></div>}
  <section aria-labelledby="inst-title" className="panel"><div className="panel-header"><div><h2 id="inst-title">Tus instituciones</h2><p className="muted">Accesos concedidos y perfiles vigentes en cada institución.</p></div><span className="count-chip">{institutions.length} disponibles</span></div>
  {institutions.length? <div className="institution-list">{institutions.map(i=><div className="institution-row" key={i.institutionId}><div className="institution-badge">{i.institutionCode.slice(0,2).toUpperCase()}</div><div className="institution-details"><strong>{i.institutionName}</strong><small>{i.institutionCode} · {i.roles.map(role=>ROLE_LABELS[role]).join(', ')}</small></div><div className="institution-state">{hasPermission(i.roles,'users.manage')?'Administración habilitada':'Acceso vigente'}</div></div>)}</div>:<div className="empty-state"><strong>No hay instituciones asignadas</strong><p>Solicita a tu administrador que agregue una membresía y los permisos correspondientes.</p></div>}
  </section>
  <section aria-labelledby="modules-title"><div className="panel-header plain"><div><h2 id="modules-title">Áreas de trabajo</h2><p className="muted">Se habilitarán al implementar sus operaciones reales y sus políticas de seguridad.</p></div></div><div className="module-grid">{modules.map((m,i)=><article key={m.title} className="module-card"><div className="module-icon">{['◉','▦','▤','⇄'][i]}</div><h3>{m.title}</h3><p>{m.description}</p><span className="module-stage">{m.kind}</span></article>)}</div></section>
  <footer className="footer-note">Siii mantiene sus registros institucionales separados de Compañero de Escuela.</footer>
  </main></div>
 </div>
}
