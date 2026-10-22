'use client';

import Link from 'next/link';
import type {Route} from 'next';
import {usePathname} from 'next/navigation';
import {resolveDashboardLocation,type DashboardActive} from '@/shared/navigation/dashboard-location';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SiiBrand, SiiMark } from './sii-brand';
import { SiiNavIcon, type SiiNavIconName } from './sii-nav-icon';
import SiiQuickSwitch, {type SiiQuickLink} from './sii-quick-switch';
import SiiThemeToggle from './sii-theme-toggle';
import { InstitutionCapabilitiesProvider, useInstitutionCapabilities, hasAnyCapability, hasInstitutionCapability } from './institution-capabilities';

import {academicModuleLinks,allAcademicModuleLinks} from '@/shared/navigation/academic-modules';

const COLLAPSED_KEY='siii:sidebar-collapsed';
function iconForModule(id:string):SiiNavIconName {
  switch(id){
    case 'registry': return 'registry';
    case 'operations': return 'layers';
    case 'grading': return 'grades';
    case 'scheduling': return 'calendar';
    default: return 'services';
  }
}

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
  const [sidebarCollapsed,setSidebarCollapsed] = useState(false);
  useEffect(()=>{
    try { setSidebarCollapsed(window.localStorage.getItem(COLLAPSED_KEY)==='true'); } catch { /* Browsing without storage stays usable. */ }
  },[]);
  const toggleSidebar=()=>{
    const next=!sidebarCollapsed;
    setSidebarCollapsed(next);
    try { window.localStorage.setItem(COLLAPSED_KEY,String(next)); } catch { /* Optional preference. */ }
  };
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const mobileViewport = window.matchMedia('(max-width: 840px)');
    // Never keep an off-canvas drawer open after switching to desktop.
    if (!mobileViewport.matches) {
      setMenuOpen(false);
      return;
    }
    const sidebar = document.getElementById('sii-sidebar-mobile');
    const trigger = menuTrigger.current;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const onViewportChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setMenuOpen(false);
    };
    mobileViewport.addEventListener('change', onViewportChange);
    // Include all keyboard-operable sidebar controls, not only navigation links.
    const focusableSelector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(sidebar?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !window.matchMedia('(max-width: 840px)').matches) return;
      const controls = focusables();
      const first = controls[0], last = controls[controls.length - 1];
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
      mobileViewport.removeEventListener('change', onViewportChange);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      trigger?.focus();
    };
  }, [menuOpen]);
  const {data,loading,error}=useInstitutionCapabilities();
  const verifying=Boolean(institutionId && loading && !data);
  const unavailableLabel=!institutionId?'Selecciona institución':verifying?'Verificando…':error?'No disponible':'Restringido';
  const modules=academicModuleLinks(data&&!data.restricted?data.capabilities:[]);
  const activeModule=allAcademicModuleLinks.find(module=>module.id===active);
  const academicAvailable = ['programs','courses','curricula','terms','campuses'].some(resource => hasAnyCapability(data,`${resource}.read`));
  const quickLinks:SiiQuickLink[]=[
    {id:'overview',label:'Inicio',href:'/dashboard',group:'Plataforma'},
    {id:'security',label:'Cuenta y seguridad',href:'/dashboard/security',group:'Plataforma'}
  ];
  if(institutionId){
    const base='/dashboard/institutions/'+institutionId;
    if(institutionAdministrationAvailable||hasInstitutionCapability(data,'institutions.manage'))
      quickLinks.push({id:'administration',label:'Administración institucional',href:base+'/admin',group:'Plataforma'});
    if(hasInstitutionCapability(data,'users.read'))
      quickLinks.push({id:'users',label:'Usuarios',href:base+'/users',group:'Plataforma'});
    if(hasInstitutionCapability(data,'roles.assign'))
      quickLinks.push({id:'roles',label:'Roles y ámbitos',href:base+'/roles',group:'Plataforma'});
    if(hasInstitutionCapability(data,'invitations.manage'))
      quickLinks.push({id:'invitations',label:'Invitaciones',href:base+'/invitations',group:'Plataforma'});
    if(academicAvailable)quickLinks.push({id:'academic',label:'Catálogo académico',href:base+'/academic',group:'Gestión académica'});
    for(const module of modules)quickLinks.push({id:module.id,label:module.label,href:base+'/'+module.id,group:'Gestión académica'});
  }
  return (
    <div className={sidebarCollapsed ? 'sii-app sii-app--collapsed' : 'sii-app'}>
      {menuOpen && <button type="button" className="sii-scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
      <aside id="sii-sidebar-mobile" className={menuOpen ? 'sii-sidebar sii-sidebar--open' : 'sii-sidebar'} aria-label="Menú del sistema">
        <div className="sii-sidebar-brand">
          <SiiBrand light />
          <Link href="/dashboard" className="sii-sidebar-brand-compact" aria-label="SII, ir al inicio institucional" title="Ir a inicio"><SiiMark compact /></Link>
          <button type="button" className="sii-sidebar-collapse" onClick={toggleSidebar}
            aria-label={sidebarCollapsed?'Expandir menú lateral':'Contraer menú lateral'}
            aria-expanded={!sidebarCollapsed} aria-controls="sii-sidebar-mobile"
            title={sidebarCollapsed?'Expandir menú':'Contraer menú'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m7-12-4 4 4 4"/></svg>
          </button>
        </div>
        <div className="sii-sidebar-heading">PLATAFORMA</div>
        <nav className="sii-nav" aria-label="Navegación institucional">
          <Link href="/dashboard" title="Inicio" onClick={() => setMenuOpen(false)}
            aria-current={active === 'overview' ? 'page' : undefined}
            className={active === 'overview' ? 'sii-nav-item sii-nav-item--active' : 'sii-nav-item'}>
            <SiiNavIcon name="home" /> Inicio
          </Link>
          {institutionId && (institutionAdministrationAvailable || hasInstitutionCapability(data,'institutions.manage')) && <Link href={`/dashboard/institutions/${institutionId}/admin` as Route} title="Administración institucional" onClick={() => setMenuOpen(false)} className={active === 'administration' ? 'sii-nav-item sii-nav-item--active' : 'sii-nav-item'} aria-current={active === 'administration' ? 'page' : undefined}><SiiNavIcon name="institution" />Administración institucional</Link>}
          {institutionId && hasInstitutionCapability(data,'users.read') && <Link href={`/dashboard/institutions/${institutionId}/users`} title="Usuarios" onClick={()=>setMenuOpen(false)} className={active==='users'?'sii-nav-item sii-nav-item--active':'sii-nav-item'} aria-current={active==='users'?'page':undefined}><SiiNavIcon name="users" />Usuarios</Link>}
          {institutionId && hasInstitutionCapability(data,'roles.assign') && <Link href={`/dashboard/institutions/${institutionId}/roles`} title="Roles y ámbitos" onClick={()=>setMenuOpen(false)} className={active==='roles'?'sii-nav-item sii-nav-item--active':'sii-nav-item'} aria-current={active==='roles'?'page':undefined}><SiiNavIcon name="roles" />Roles y ámbitos</Link>}
          {institutionId && hasInstitutionCapability(data,'invitations.manage') && <Link href={`/dashboard/institutions/${institutionId}/invitations`} title="Invitaciones" onClick={()=>setMenuOpen(false)} className={active==='invitations'?'sii-nav-item sii-nav-item--active':'sii-nav-item'} aria-current={active==='invitations'?'page':undefined}><SiiNavIcon name="mail" />Invitaciones</Link>}
          <Link href="/dashboard/security" title="Cuenta y seguridad" onClick={() => setMenuOpen(false)}
            aria-current={active === 'security' ? 'page' : undefined}
            className={active === 'security' ? 'sii-nav-item sii-nav-item--active' : 'sii-nav-item'}>
            <SiiNavIcon name="shield" /> Cuenta y seguridad
          </Link>
        </nav>
        <div className="sii-sidebar-heading sii-sidebar-heading--secondary">GESTIÓN ACADÉMICA</div>
        <nav className="sii-nav" aria-label="Gestión académica" aria-busy={verifying}>
          {institutionId && academicAvailable ? <Link href={`/dashboard/institutions/${institutionId}/academic`} title="Catálogo académico"
            className={active === 'academic' ? 'sii-nav-item sii-nav-item--active' : 'sii-nav-item'}
            aria-current={active === 'academic' ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}>
              <SiiNavIcon name="book" /> Catálogo académico
          </Link> : <span className={verifying?"sii-nav-item sii-nav-item--muted sii-nav-item--loading":"sii-nav-item sii-nav-item--muted"}>
            <SiiNavIcon name="book" /> Catálogo académico
            <span className="sii-nav-soon">{unavailableLabel}</span>
          </span>}
          {allAcademicModuleLinks.map(module => {
            const allowed=Boolean(institutionId && modules.some(item=>item.id===module.id));
            return allowed ? <Link key={module.id} href={`/dashboard/institutions/${institutionId}/${module.id}` as Route} title={module.label}
              className={active===module.id?'sii-nav-item sii-nav-item--active':'sii-nav-item'}
              aria-current={active===module.id?'page':undefined} onClick={()=>setMenuOpen(false)}>
              <SiiNavIcon name={iconForModule(module.id)} />{module.label}
            </Link> : <span key={module.id} className={verifying?"sii-nav-item sii-nav-item--muted sii-nav-item--loading":"sii-nav-item sii-nav-item--muted"}>
              <SiiNavIcon name={iconForModule(module.id)} />{module.label}
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
            <SiiQuickSwitch links={quickLinks}/>
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
