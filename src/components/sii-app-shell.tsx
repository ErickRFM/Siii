'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { SiiBrand } from './sii-brand';
import SiiThemeToggle from './sii-theme-toggle';
import { InstitutionCapabilitiesProvider, useInstitutionCapabilities, hasAnyCapability, hasInstitutionCapability } from './institution-capabilities';

type Active = 'overview' | 'security' | 'institution' | 'academic' | 'roles' | 'invitations' | 'users';

export default function SiiAppShell({
  firstName, fullName, active, institutionId, children,
}: {
  firstName: string; fullName: string; active: Active; institutionId?: string; children: ReactNode;
}) {
  return <InstitutionCapabilitiesProvider institutionId={institutionId}><Shell firstName={firstName} fullName={fullName} active={active} institutionId={institutionId}>{children}</Shell></InstitutionCapabilitiesProvider>;
}
function Shell({firstName,fullName,active,institutionId,children}:{firstName:string;fullName:string;active:Active;institutionId?:string;children:ReactNode}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { data } = useInstitutionCapabilities();
  const academicAvailable = ['programs','courses','curricula','terms','campuses'].some(resource => hasAnyCapability(data,`${resource}.read`));
  return (
    <div className="sii-app">
      {menuOpen && <button type="button" className="sii-scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
      <aside id="sii-sidebar-mobile" className={menuOpen ? 'sii-sidebar sii-sidebar--open' : 'sii-sidebar'} aria-label="Menú del sistema">
        <div className="sii-sidebar-brand"><SiiBrand light /></div>
        <div className="sii-sidebar-heading">PLATAFORMA</div>
        <nav className="sii-nav" aria-label="Navegación institucional">
          <Link href="/dashboard" onClick={() => setMenuOpen(false)}
            aria-current={active === 'overview' ? 'page' : undefined}
            className={active === 'overview' ? 'sii-nav-item sii-nav-item--active' : 'sii-nav-item'}>
            <span className="sii-nav-glyph" aria-hidden="true">⌂</span> Inicio
          </Link>
          {institutionId && hasInstitutionCapability(data,'users.read') && <Link href={`/dashboard/institutions/${institutionId}/users`} onClick={()=>setMenuOpen(false)} className={active==='users'?'sii-nav-item sii-nav-item--active':'sii-nav-item'} aria-current={active==='users'?'page':undefined}><span className="sii-nav-glyph" aria-hidden="true">♙</span>Usuarios</Link>}
          {institutionId && hasInstitutionCapability(data,'roles.assign') && <Link href={`/dashboard/institutions/${institutionId}/roles`} onClick={()=>setMenuOpen(false)} className={active==='roles'?'sii-nav-item sii-nav-item--active':'sii-nav-item'} aria-current={active==='roles'?'page':undefined}><span className="sii-nav-glyph" aria-hidden="true">♙</span>Roles y ámbitos</Link>}
          {institutionId && hasInstitutionCapability(data,'invitations.manage') && <Link href={`/dashboard/institutions/${institutionId}/invitations`} onClick={()=>setMenuOpen(false)} className={active==='invitations'?'sii-nav-item sii-nav-item--active':'sii-nav-item'} aria-current={active==='invitations'?'page':undefined}><span className="sii-nav-glyph" aria-hidden="true">✉</span>Invitaciones</Link>}
          <Link href="/dashboard/security" onClick={() => setMenuOpen(false)}
            aria-current={active === 'security' ? 'page' : undefined}
            className={active === 'security' ? 'sii-nav-item sii-nav-item--active' : 'sii-nav-item'}>
            <span className="sii-nav-glyph" aria-hidden="true">♢</span> Cuenta y seguridad
          </Link>
        </nav>
        <div className="sii-sidebar-heading sii-sidebar-heading--secondary">GESTIÓN ACADÉMICA</div>
        <div className="sii-nav" aria-label="Gestión académica">
          {institutionId && academicAvailable ? <Link href={`/dashboard/institutions/${institutionId}/academic`}
            className={active === 'academic' ? 'sii-nav-item sii-nav-item--active' : 'sii-nav-item'}
            aria-current={active === 'academic' ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}>
              <span className="sii-nav-glyph" aria-hidden="true">▦</span> Catálogo académico
          </Link> : !institutionId ? <span className="sii-nav-item sii-nav-item--muted"><span className="sii-nav-glyph" aria-hidden="true">▦</span> Catálogo académico <span className="sii-nav-soon">Selecciona institución</span></span> : null}
          <span className="sii-nav-item sii-nav-item--muted"><span className="sii-nav-glyph" aria-hidden="true">▣</span> Control escolar <span className="sii-nav-soon">Pronto</span></span>
          <span className="sii-nav-item sii-nav-item--muted"><span className="sii-nav-glyph" aria-hidden="true">▤</span> Calificaciones <span className="sii-nav-soon">Pronto</span></span>
          <span className="sii-nav-item sii-nav-item--muted"><span className="sii-nav-glyph" aria-hidden="true">⇄</span> Integraciones <span className="sii-nav-soon">Pronto</span></span>
        </div>
        <div className="sii-sidebar-spacer"/>
        <div className="sii-sidebar-status"><span className="sii-sidebar-status-dot"/> Núcleo institucional · F2</div>
        <div className="sii-sidebar-user">
          <span className="sii-avatar sii-avatar--sidebar">{firstName.substring(0, 1).toLocaleUpperCase('es-MX')}</span>
          <span className="sii-sidebar-user-details"><strong>{fullName}</strong><small>Sesión institucional</small></span>
        </div>
      </aside>
      <div className="sii-main">
        <header className="sii-topbar">
          <div className="sii-topbar-start">
            <button className="sii-menu-button" onClick={() => setMenuOpen(x => !x)} type="button" aria-expanded={menuOpen} aria-controls="sii-sidebar-mobile" aria-label={menuOpen ? 'Cerrar navegación' : 'Abrir navegación'}>☰</button>
            <span className="sii-breadcrumb">SII <span aria-hidden="true">/</span> {active === 'overview' ? 'Inicio' : active === 'security' ? 'Seguridad' : active === 'academic' ? 'Catálogo académico' : active==='roles'?'Roles y ámbitos':active==='invitations'?'Invitaciones':active==='users'?'Usuarios':'Institución'}</span>
          </div>
          <div className="sii-topbar-actions">
            <span className="sii-connection-label"><span className="sii-online-dot" /> Sesión autenticada</span>
            <SiiThemeToggle/>
            <span className="sii-avatar">{firstName.substring(0, 1).toLocaleUpperCase('es-MX')}</span>
            <form action="/api/v1/auth/logout" method="post">
              <button className="sii-logout" type="submit">Salir <span aria-hidden="true">↗</span></button>
            </form>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="sii-page">{children}</main>
      </div>
    </div>
  );
}
