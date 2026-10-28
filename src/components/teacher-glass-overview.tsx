'use client';
import Link from 'next/link';
import {BookOpen,ClipboardCheck,FileText,GraduationCap,RefreshCw,Users} from 'lucide-react';
import type {PersonalProfile,PersonalTeachingGroup} from '@/modules/portal/contracts';
import SiiiHeroRibbon from './siii-hero-ribbon';
import SiiiGlassCalendar from './siii-glass-calendar';
import {SiiiProgressRing} from './siii-glass-progress';
import {SiiiGlassMetric,SiiiGlassMetricsRow,SiiiGlassPanel,SiiiGlassPanelHeading} from './ui/siii-glass-kit';

export default function TeacherGlassOverview({profile,groups,institutionId,institutionName,incomplete,loading,canEvaluate,unlinked=false,onGroups,onOpen,onRefresh}:{
 profile:PersonalProfile|null;groups:PersonalTeachingGroup[];institutionId:string;institutionName:string;incomplete:boolean;loading:boolean;canEvaluate:boolean;unlinked?:boolean;
 onGroups:()=>void;onOpen:(id:string,mode:'capture'|'results')=>void;onRefresh:()=>void;
}){
 const known=Boolean(profile)&&!incomplete;
 const published=groups.filter(group=>group.published);
 const editable=groups.filter(group=>canEvaluate&&!group.published&&group.componentCount>0&&group.sectionStatus==='open'&&group.termStatus==='active');
 const terms=[...new Map(groups.map(group=>[group.termId,group])).values()];
 const consult=<button type="button" className="siii-overview-quick" onClick={onGroups}>Ver todos ›</button>;
 return <div className="siii-student-dashboard siii-teacher-dashboard">
  <div className="siii-student-main">
   <header className="siii-overview-hero">
    <button type="button" className="siii-overview-refresh" aria-label="Actualizar mi información" disabled={loading} onClick={onRefresh}><RefreshCw size={16}/></button>
    <span className="siii-overview-eyebrow">Buen día,</span><h2>{profile?.firstName??'Mi docencia'}<span className="sr-only"> {profile?.lastName}</span></h2><p>{institutionName}</p>
    <div className="siii-overview-tags"><span>Docente</span><span>{profile?profile.employeeNumber??'Vínculo institucional vigente':loading?'Consultando perfil':unlinked?'Perfil docente aún sin vincular':'Información no disponible'}</span></div>
    <SiiiHeroRibbon/><p className="siii-overview-motto">“Formando<br/>profesionales<br/>para el futuro”<small>— {institutionName}</small></p>
   </header>
   <SiiiGlassMetricsRow className="siii-overview-metrics siii-teacher-metrics">
    <SiiiGlassMetric label="Grupos asignados" value={known?groups.length:'—'} icon={<Users/>} tone="amber"/>
    <SiiiGlassMetric label="Captura habilitada" value={known?editable.length:'—'} icon={<ClipboardCheck/>} tone="blue"/>
    <SiiiGlassMetric label="Resultados publicados" value={known?published.length:'—'} icon={<GraduationCap/>} tone="green"/>
    <SiiiGlassMetric label="Notas guardadas" value={known?groups.reduce((sum,group)=>sum+group.savedScoreCount,0):'—'} icon={<FileText/>} tone="terracotta"/>
   </SiiiGlassMetricsRow>
   <div className="siii-overview-detail-grid">
    <SiiiGlassPanel><SiiiGlassPanelHeading title="Mis grupos" action={consult}/>{groups.slice(0,4).map(group=><div className="siii-overview-listrow" key={group.id}><span className="siii-reference-row-icon" data-tone="blue" aria-hidden="true"><BookOpen size={23}/></span><div><strong>{group.courseName}</strong><small>{group.sectionCode} · {group.termName}</small></div></div>)}{!groups.length&&<p className="siii-overview-empty">{profile?'No tienes grupos oficialmente asignados en este periodo.':unlinked?'Los grupos se consultarán con tu perfil institucional vinculado.':'Actualiza la consulta para recuperar tus grupos.'}</p>}</SiiiGlassPanel>
    <SiiiGlassPanel><SiiiGlassPanelHeading title="Evaluaciones"/><span className="siii-overview-eyebrow">Grupos con captura abierta</span><div className="siii-overview-balance">{known?editable.length:'—'}</div><p className="siii-overview-subtle">Las capturas son borradores privados hasta su publicación.</p>{editable.slice(0,2).map(group=><div className="siii-overview-listrow" key={group.id}><div><strong>{group.sectionCode}</strong><small>{group.courseName}</small></div><button className="siii-overview-quick" type="button" disabled={!canEvaluate} onClick={()=>onOpen(group.id,'capture')}>Capturar ›</button></div>)}<button type="button" className="siii-overview-primary" onClick={onGroups}>Consultar mis grupos ›</button></SiiiGlassPanel>
    <SiiiGlassPanel><SiiiGlassPanelHeading title="Resultados publicados" action={consult}/>{published.slice(0,4).map(group=><div className="siii-overview-listrow" key={group.id}><span className="siii-reference-row-icon" data-tone="green" aria-hidden="true"><FileText size={23}/></span><div><strong>{group.courseName}</strong><small>{group.sectionCode}</small></div><button type="button" className="siii-overview-quick" disabled={!canEvaluate} onClick={()=>onOpen(group.id,'results')}>Consultar ›</button></div>)}{!published.length&&<p className="siii-overview-empty">No hay resultados publicados disponibles en esta consulta.</p>}</SiiiGlassPanel>
   </div>
   <SiiiGlassPanel className="siii-overview-progress"><SiiiGlassPanelHeading title="Trabajo académico" action={consult}/><div className="siii-overview-progress-body"><div className="siii-overview-progress-summary"><SiiiProgressRing size={140} value={known&&groups.length?100*published.length/groups.length:null} label="Proporción de grupos consultados con resultados publicados"/><div><strong>{known?`${published.length} de ${groups.length}`:'Datos no disponibles'}</strong><small>Grupos consultados con resultados publicados</small></div></div><div className="siii-overview-term-bars"><p>{incomplete?'Consulta de grupos incompleta':'Periodos con asignaciones'}</p>{(incomplete?[]:terms).slice(0,4).map(term=><div className="siii-overview-term" key={term.termId}><span>{term.termName}</span><div className="siii-overview-track"><svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width={100*groups.filter(group=>group.termId===term.termId).length/groups.length} height="8" rx="4" fill="#85c9ad"/></svg></div><b>{groups.filter(group=>group.termId===term.termId).length}</b></div>)}<small>Las notas guardadas en captura son borradores privados hasta la publicación.</small></div></div></SiiiGlassPanel>
  </div>
  <aside className="siii-student-aside" aria-label="Información docente complementaria">
   <SiiiGlassPanel className="siii-overview-calendar"><h3 className="sr-only">Calendario</h3><SiiiGlassCalendar timeZone={profile?.timeZone??'America/Mexico_City'}/></SiiiGlassPanel>
   <SiiiGlassPanel className="siii-teacher-context"><SiiiGlassPanelHeading title="Contexto institucional"/><p className="siii-overview-subtle">{institutionName}</p><div className="siii-overview-listrow"><div><strong>{profile?'Perfil docente vigente':unlinked?'Vinculación pendiente':'Información no disponible'}</strong><small>{profile?.employeeNumber??(unlinked?'Solicita a la institución vincular tu registro oficial.':'Actualiza la consulta para validar tu perfil.')}</small></div></div><p className="siii-overview-empty">Las solicitudes de rectificación requieren un procedimiento autorizado por la institución.</p></SiiiGlassPanel>
   <SiiiGlassPanel><h3>Accesos rápidos</h3><div className="siii-overview-shortcuts"><button type="button" onClick={onGroups}><Users/>Mis grupos</button><button type="button" disabled={!canEvaluate} onClick={()=>editable[0]?onOpen(editable[0].id,'capture'):onGroups()}><ClipboardCheck/>Evaluaciones</button><Link onClick={()=>window.dispatchEvent(new CustomEvent('siii:teacher-navigation',{detail:'perfil'}))} href={`/dashboard/institutions/${institutionId}/teacher#perfil`}><Users/>Mi perfil</Link><Link href={`/dashboard/institutions/${institutionId}/grading/corrections`}><FileText/>Rectificaciones</Link></div></SiiiGlassPanel>
   <SiiiGlassPanel className="siii-overview-dates"><h3>Periodos asignados</h3>{terms.slice(0,3).map(term=><div className="siii-overview-date" key={term.termId}><span className="siii-overview-date-dot"/><div><strong>{term.termName}</strong><small>{term.termStart} · {term.termEnd}</small></div></div>)}{!terms.length&&<p className="siii-overview-empty">Sin periodos asignados disponibles.</p>}</SiiiGlassPanel>
  </aside>
 </div>;
}
