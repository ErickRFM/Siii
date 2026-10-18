'use client';

import Link from 'next/link';
import type {Route} from 'next';
import {usePathname} from 'next/navigation';
import {resolveDashboardLocation,type DashboardActive} from '@/shared/navigation/dashboard-location';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SiiBrand } from './sii-brand';
import SiiThemeToggle from './sii-theme-toggle';
import { InstitutionCapabilitiesProvider, useInstitutionCapabilities, hasAnyCapability, hasInstitutionCapability } from './institution-capabilities';

import {academicModuleLinks,allAcademicModuleLinks} from '@/shared/navigation/academic-modules';

export default function SiiAppShell({firstName,fullName,defaultInstitutionId,children}:{
  firstName:string; fullName:string; defaultInstitutionId?:string; children:ReactNode;
}){
  // Shared dashboard layout keeps this sidebar mounted across module navigation.
  const pathname=usePathname();
  const {active,institutionId}=resolveDashboardLocation(pathname,defaultInstitutionId);
  return <InstitutionCapabilitiesProvider key={institutionId??'personal'} institutionId={institutionId}>
    <Shell firstName={firstName} fullName={fullName} active={active} institutionId={institutionId}
      institutionAdministrationAvailable={active==='administration'}>{children}</Shell>
  </InstitutionCapabilitiesProvider>;
}
function Shell({firstName,fullName,active,institutionId,institutionAdministrationAvailable,children}:{firstName:string;fullName:string;active:DashboardActive;institutionId?:string;institutionAdministrationAvailable:boolean;children:ReactNode}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = document.getElementById('sii-sidebar-mobile');
    const trigger = menuTrigger.current;
    // On small screens, keep keyboard focus in the open navigation.
    if (window.matchMedia('(max-width: 840px)').matches) {
      sidebar?.querySelector<HTMLAnchorElement>('a[href]')?.focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !window.matchMedia('(max-width: 840px)').matches) return;
      const links = Array.from(sidebar?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []);
      const first = links[0], last = links[links.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !sidebar?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [menuOpen]);
  const {data,loading,error}=useInstitutionCapabilities();
  const verifying=Boolean(institutionId && loading && !data);
  const unavailableLabel=!institutionId?'Selecciona institución':verifying?'Verificando…':error?'No disponible':'Restringido';
  const modules=academicModuleLinks(data&&!data.restricted?data.capabilities:[]);
  const activeModule=allAcademicModuleLinks.find(module=>module.id===active);
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
          {institutionId && (institutionAdministrationAvailable || hasInstitutionCapability(data,'institutions.manage')) && <Link href={`/dashboard/institutions/${institutionId}/admin` as Route} onClick={() => setMenuOpen(false)} className={active === 'administration' ? 'sii-nav-item sii-nav-item--active' : 'sii-nav-item'} aria-current={active === 'administration' ? 'page' : undefined}><span className="sii-nav-glyph" aria-hidden="true">⚙</span>Administración institucional</Link>}
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
        <nav className="sii-nav" aria-label="Gestión académica" aria-busy={verifying}>
          {institutionId && academicAvailable ? <Link href={`/dashboard/institutions/${institutionId}/academic`}
            className={active === 'academic' ? 'sii-nav-item sii-nav-item--active' : 'sii-nav-item'}
            aria-current={active === 'academic' ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}>
              <span className="sii-nav-glyph" aria-hidden="true">▦</span> Catálogo académico
          </Link> : <span className={verifying?"sii-nav-item sii-nav-item--muted sii-nav-item--loading":"sii-nav-item sii-nav-item--muted"}>
            <span className="sii-nav-glyph" aria-hidden="true">▦</span> Catálogo académico
            <span className="sii-nav-soon">{unavailableLabel}</span>
          </span>}
          {allAcademicModuleLinks.map(module => {
            const allowed=Boolean(institutionId && modules.some(item=>item.id===module.id));
            return allowed ? <Link key={module.id} href={`/dashboard/institutions/${institutionId}/${module.id}` as Route}
              className={active===module.id?'sii-nav-item sii-nav-item--active':'sii-nav-item'}
              aria-current={active===module.id?'page':undefined} onClick={()=>setMenuOpen(false)}>
              <span className="sii-nav-glyph" aria-hidden="true">{module.glyph}</span>{module.label}
            </Link> : <span key={module.id} className={verifying?"sii-nav-item sii-nav-item--muted sii-nav-item--loading":"sii-nav-item sii-nav-item--muted"}>
              <span className="sii-nav-glyph" aria-hidden="true">{module.glyph}</span>{module.label}
              <span className="sii-nav-soon">{unavailableLabel}</span>
            </span>;
          })}
        </nav>
        <div className="sii-sidebar-spacer"/>
        <div className="sii-sidebar-status"><span className="sii-sidebar-status-dot"/> Plataforma institucional · Acceso protegido</div>
        <div className="sii-sidebar-user">
          <span className="sii-avatar sii-avatar--sidebar">{firstName.substring(0, 1).toLocaleUpperCase('es-MX')}</span>
          <span className="sii-sidebar-user-details"><strong>{fullName}</strong><small>Sesión institucional</small></span>
        </div>
      </aside>
      <div className="sii-main">
        <header className="sii-topbar">
          <div className="sii-topbar-start">
            <button ref={menuTrigger} className="sii-menu-button" onClick={() => setMenuOpen(x => !x)} type="button" aria-expanded={menuOpen} aria-controls="sii-sidebar-mobile" aria-label={menuOpen ? 'Cerrar navegación' : 'Abrir navegación'}>☰</button>
            <span className="sii-breadcrumb">SII <span aria-hidden="true">/</span> {activeModule?activeModule.label:active === 'overview' ? 'Inicio' : active === 'security' ? 'Seguridad' : active === 'academic' ? 'Catálogo académico' : active==='roles'?'Roles y ámbitos':active==='invitations'?'Invitaciones':active==='users'?'Usuarios':active==='administration'?'Administración institucional':'Institución'}</span>
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
