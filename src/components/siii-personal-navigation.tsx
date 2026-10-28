'use client';
import Link from 'next/link';
import type {Route} from 'next';
import {useEffect,useState,type ReactNode} from 'react';
import {BookOpen,ChevronDown,FileText,GraduationCap,Heart,HelpCircle,Home,Layers,Settings,Users,Wallet,ClipboardCheck,UserRound} from 'lucide-react';
import {SidebarContent,SidebarFooter,SidebarHeader,useSidebar} from './ui/sidebar';

type Role='student'|'teacher'|'context';
/** URL navigation only; the server and existing portal capabilities remain authoritative. */
export default function SiiiPersonalNavigation({role,institutionId,institutionName,allowed}:{role:Role;institutionId?:string;institutionName?:string;allowed:boolean}){
 const [selected,setSelected]=useState('inicio');
 const {setOpenMobile,isMobile}=useSidebar();
 useEffect(()=>{
  const sync=(event:Event)=>setSelected((event as CustomEvent<string>).detail||'inicio');
  const hash=()=>setSelected(window.location.hash.slice(1)||'inicio');hash();
  window.addEventListener(`siii:${role}-active-section`,sync);window.addEventListener('hashchange',hash);
  return()=>{window.removeEventListener(`siii:${role}-active-section`,sync);window.removeEventListener('hashchange',hash)};
 },[role]);
 const base=institutionId&&role!=='context'?`/dashboard/institutions/${institutionId}/${role}`:'/dashboard';
 function item(label:string,hash:string,icon:ReactNode,available=true){
  if(!available)return <span className="siii-personal-nav-link" aria-disabled="true" title="El plan oficial aún no está disponible">{icon}<span>{label}</span></span>;
  const href=(base+'#'+hash) as Route;
  return <Link key={hash} href={href} className={'siii-personal-nav-link'+(selected===hash?' is-current':'')} aria-current={selected===hash?'page':undefined}
   aria-disabled={!allowed||undefined} tabIndex={allowed?undefined:-1} onClick={event=>{
    if(!allowed){event.preventDefault();return}
    window.dispatchEvent(new CustomEvent(`siii:${role}-navigation`,{detail:hash}));setSelected(hash);if(isMobile)setOpenMobile(false);
   }}>{icon}<span>{label}</span></Link>;
 }
 const group=(label:string,icon:ReactNode,children:ReactNode)=><details className="siii-personal-nav-group" open><summary>{icon}<span>{label}</span><ChevronDown size={13}/></summary><div>{children}</div></details>;
 return <>
  <SidebarHeader className="siii-personal-brand"><Link href={(role==='context'?base:base+'#inicio') as Route} aria-label="SIII, ir al inicio institucional" onClick={()=>{
   if(role!=='context'){window.dispatchEvent(new CustomEvent(`siii:${role}-navigation`,{detail:'inicio'}));setSelected('inicio');if(isMobile)setOpenMobile(false)}
  }}>
   <span className="siii-personal-mark" aria-hidden="true"><svg viewBox="0 0 34 40" fill="none"><path d="m22 4-13 9 8 6-10 8 9 9 13-10-9-7 10-8-8-7Z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round"/></svg></span>
   <span><strong>SIII</strong><small>{institutionName??'Sistema Institucional Integral'}</small></span>
  </Link></SidebarHeader>
  <SidebarContent className="siii-personal-nav-content">
   {role==='context'?<Link href="/dashboard" className="siii-personal-nav-link is-current"><Home/><span>Mis contextos</span></Link>:item('Inicio','inicio',<Home/>)}
   {role==='student'&&<>
    {group('Académico',<GraduationCap/>,<>{item('Calificaciones','calificaciones',<FileText/>)}{item('Historial académico','historial',<BookOpen/>)}{item('Plan de estudios','plan',<FileText/>,false)}{item('Carga académica','inscripciones',<ClipboardCheck/>)}</>)}
    {group('Financiero',<Wallet/>,<>{item('Estado de cuenta','finanzas',<FileText/>)}{item('Órdenes de pago','ordenes',<Wallet/>)}{item('Comprobantes','comprobantes',<FileText/>)}</>)}
    {group('Trámites',<Layers/>,<>{item('Mis trámites','tramites',<FileText/>)}{item('Solicitudes','solicitudes',<ClipboardCheck/>)}{item('Documentos','documentos',<FileText/>)}</>)}
    {group('Comunidad',<Heart/>,<>{item('Mis docentes','docentes',<Users/>)}{item('Avisos institucionales','avisos',<Users/>)}</>)}
   </>}
   {role==='teacher'&&<>
    {group('Docencia',<GraduationCap/>,<>{item('Mis grupos','grupos',<Users/>)}{item('Evaluaciones','evaluaciones',<ClipboardCheck/>)}{item('Mi perfil','perfil',<UserRound/>)}</>)}
    <Link className="siii-personal-nav-link" href={(`/dashboard/institutions/${institutionId}/grading/corrections`) as Route}><FileText/><span>Mis rectificaciones</span></Link>
   </>}
  </SidebarContent>
  <SidebarFooter className="siii-personal-nav-footer"><Link className="siii-personal-nav-link" href="/dashboard/security"><HelpCircle/><span>Ayuda y seguridad</span></Link><Link className="siii-personal-nav-link" href="/dashboard/security"><Settings/><span>Configuración</span></Link></SidebarFooter>
 </>;
}
