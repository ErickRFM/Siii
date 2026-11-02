'use client';
import Link from 'next/link';
import type {Route} from 'next';
import {useEffect,useState,type ReactNode} from 'react';
import {BookOpen,ChevronDown,FileText,GraduationCap,Heart,HelpCircle,Home,Layers,Settings,Users,Wallet,ClipboardCheck,UserRound,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import {SidebarContent,SidebarFooter,SidebarHeader,useSidebar} from './ui/sidebar';
import {STUDENT_NAV_ITEMS,TEACHER_NAV_ITEMS,type PersonalNavDestination} from '@/shared/navigation/personal-navigation-registry';

type Role='student'|'teacher'|'context';

function iconMap(name: PersonalNavDestination['iconName']): ReactNode {
  switch(name){
    case 'home': return <Home size={18}/>;
    case 'book': return <BookOpen size={18}/>;
    case 'grades': return <FileText size={18}/>;
    case 'wallet': return <Wallet size={18}/>;
    case 'layers': return <Layers size={18}/>;
    case 'users': return <Users size={18}/>;
    case 'clipboard': return <ClipboardCheck size={18}/>;
    case 'file': return <FileText size={18}/>;
    case 'user': return <UserRound size={18}/>;
    default: return <Settings size={18}/>;
  }
}

/** URL navigation only; the server and existing portal capabilities remain authoritative. */
export default function SiiiPersonalNavigation({role,institutionId,institutionName,allowed}:{role:Role;institutionId?:string;institutionName?:string;allowed:boolean}){
 const [selected,setSelected]=useState('inicio');
 const [expandedGroups,setExpandedGroups]=useState<Record<string,boolean>>({});
 const {open,setOpen,setOpenMobile,isMobile}=useSidebar();
 useEffect(()=>{
  const sync=(event:Event)=>setSelected((event as CustomEvent<string>).detail||'inicio');
  const hash=()=>setSelected(window.location.hash.slice(1)||'inicio');
  hash();
  window.addEventListener(`siii:${role}-active-section`,sync);
  window.addEventListener('hashchange',hash);
  return()=>{
    window.removeEventListener(`siii:${role}-active-section`,sync);
    window.removeEventListener('hashchange',hash);
  };
 },[role]);
 const base=institutionId&&role!=='context'?`/dashboard/institutions/${institutionId}/${role}`:'/dashboard';

 function item(dest: PersonalNavDestination){
  if(!dest.available)return <span key={dest.hash} className="siii-personal-nav-link text-muted-foreground opacity-60" aria-disabled="true" title={dest.description||"El plan oficial aún no está disponible"}>{iconMap(dest.iconName)}<span className="group-data-[collapsible=icon]:hidden">{dest.label}</span><small className="ml-auto text-[9px] uppercase tracking-wider opacity-60 group-data-[collapsible=icon]:hidden">Próximamente</small></span>;
  const href=(base+'#'+dest.hash) as Route;
  const isCurrent=selected===dest.hash;
  return <Link key={dest.hash} href={href} className={'siii-personal-nav-link'+(isCurrent?' is-current':'')} aria-current={isCurrent?'page':undefined}
   aria-disabled={!allowed||undefined} tabIndex={allowed?undefined:-1} title={dest.label} onClick={event=>{
    if(!allowed){event.preventDefault();return}
    window.dispatchEvent(new CustomEvent(`siii:${role}-navigation`,{detail:dest.hash}));
    setSelected(dest.hash);
    if(isMobile)setOpenMobile(false);
   }}>{iconMap(dest.iconName)}<span className="group-data-[collapsible=icon]:hidden">{dest.label}</span></Link>;
 }

 const group=(label:string,icon:ReactNode,children:ReactNode,hasActive=false)=>(
  <details key={label} className="siii-personal-nav-group" open={hasActive||Boolean(expandedGroups[label])}>
    <summary title={label} onClick={event=>{event.preventDefault();setExpandedGroups(previous=>({...previous,[label]:!(previous[label]??hasActive)}))}}> {icon}<span className="group-data-[collapsible=icon]:hidden">{label}</span><ChevronDown size={13} className="group-data-[collapsible=icon]:hidden"/></summary>
    <div>{children}</div>
  </details>
 );

 const studentGroups=[
  {label:'Académico',icon:<GraduationCap size={18}/>,hashes:['calificaciones','historial','plan','inscripciones']},
  {label:'Financiero',icon:<Wallet size={18}/>,hashes:['finanzas','ordenes','comprobantes']},
  {label:'Trámites',icon:<Layers size={18}/>,hashes:['tramites','solicitudes','documentos']},
  {label:'Comunidad',icon:<Heart size={18}/>,hashes:['docentes','avisos']},
 ];

 return <>
  <SidebarHeader className="siii-personal-brand">
   <div className="siii-personal-brand-inner">
    <Link href={(role==='context'?base:base+'#inicio') as Route} aria-label="SIII, ir al inicio institucional" className="siii-personal-brand-link" onClick={()=>{
     if(role!=='context'){window.dispatchEvent(new CustomEvent(`siii:${role}-navigation`,{detail:'inicio'}));setSelected('inicio');if(isMobile)setOpenMobile(false)}
    }}>
     <span className="siii-personal-mark" aria-hidden="true"><svg viewBox="0 0 34 40" fill="none"><path d="M22 5 10 13c-2 1.4-2 3.7.2 5.2l5.8 4-7.3 5.4c-2.2 1.7-2.3 4.1-.3 5.8l2.7 2.1c1.3 1.1 3 1.1 4.4.1l11.8-8.3c2.1-1.5 2.1-3.9 0-5.4l-5.7-4 7.4-5.5c2-1.6 2-4 .1-5.5L26 5c-1.2-.9-2.7-.9-4 0Z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round"/></svg></span>
     <span className="group-data-[collapsible=icon]:hidden"><strong>SIII</strong><small>{institutionName??'Sistema Institucional Integral'}</small></span>
    </Link>
    {!isMobile&&<button type="button" onClick={()=>setOpen(!open)}
      aria-label={open?'Contraer menú lateral':'Expandir menú lateral'}
      title={open?'Contraer menú lateral':'Expandir menú lateral'}
      aria-expanded={open}
      className="siii-personal-collapse-btn">
      {open?<PanelLeftClose size={17} aria-hidden="true"/>:<PanelLeftOpen size={17} aria-hidden="true"/>}
    </button>}
   </div>
  </SidebarHeader>
  <SidebarContent className="siii-personal-nav-content">
   {role==='context'?<Link href="/dashboard" className="siii-personal-nav-link is-current" title="Mis contextos"><Home size={18}/><span className="group-data-[collapsible=icon]:hidden">Mis contextos</span></Link>:item(STUDENT_NAV_ITEMS[0])}
   {role==='student'&&studentGroups.map(g=>(
    group(g.label,g.icon,<>{STUDENT_NAV_ITEMS.filter(it=>g.hashes.includes(it.hash)).map(item)}</>,g.hashes.includes(selected))
   ))}
   {role==='student'&&institutionId&&<Link className="siii-personal-nav-link" href={(`/dashboard/institutions/${institutionId}/student/attendance`) as Route} title="Mi historial de asistencia"><ClipboardCheck size={18}/><span className="group-data-[collapsible=icon]:hidden">Mi historial de asistencia</span></Link>}
   {role==='teacher'&&<>
    {group('Docencia',<GraduationCap size={18}/>,<>{TEACHER_NAV_ITEMS.map(item)}</>,['grupos','evaluaciones','perfil'].includes(selected))}
    <Link className="siii-personal-nav-link" href={(`/dashboard/institutions/${institutionId}/grading/corrections`) as Route} title="Mis rectificaciones"><FileText size={18}/><span className="group-data-[collapsible=icon]:hidden">Mis rectificaciones</span></Link>
   </>}
  </SidebarContent>
  <SidebarFooter className="siii-personal-nav-footer">
   <Link className="siii-personal-nav-link" href="/dashboard/security" title="Ayuda y seguridad"><HelpCircle size={18}/><span className="group-data-[collapsible=icon]:hidden">Ayuda y seguridad</span></Link>
   <Link className="siii-personal-nav-link" href="/dashboard/security" title="Configuración"><Settings size={18}/><span className="group-data-[collapsible=icon]:hidden">Configuración</span></Link>
  </SidebarFooter>
 </>;
}
