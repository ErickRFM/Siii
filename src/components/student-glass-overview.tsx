'use client';

import type {PersonalProfile} from '@/modules/portal/contracts';
import {academicStatus,financeStatus,formatMoney,requestStatusLabel,requestTypeLabel} from '@/modules/portal/contracts';
import type {PersonalSnapshot,PersonalView} from './use-personal-snapshot';
import {institutionalStudentSummary} from './student-dashboard-metrics';
import SiiiGlassCalendar from './siii-glass-calendar';
import {SiiiProgressRing} from './siii-glass-progress';
import {SiiiGlassMetric,SiiiGlassPanel,SiiiGlassPanelHeading,SiiiGlassMetricsRow} from './ui/siii-glass-kit';
import {BookOpen,CheckCircle2,ChevronRight,FileText,GraduationCap,RefreshCw,Wallet} from 'lucide-react';

type Destination=(section:string,academicView?:PersonalView)=>void;
export default function StudentGlassOverview({snapshot,profile,institutionName,onNavigate,onRefresh,refreshing}:{
 snapshot:PersonalSnapshot;profile:PersonalProfile;institutionName:string;onNavigate:Destination;onRefresh:()=>void;refreshing:boolean;
}){
 const m=institutionalStudentSummary(snapshot);
 const partial=Object.values(m.incomplete).some(Boolean);
 const outstandingLabel=m.incomplete.orders?'Datos incompletos':m.currency?formatMoney(m.outstanding,m.currency):m.outstanding===0?'Sin cargos pendientes':'Ver desglose por moneda';
 const deadlines=snapshot.orders.filter(o=>['pending','partially_paid'].includes(o.status)&&o.dueDate&&Number.isFinite(Date.parse(o.dueDate))&&Date.parse(o.dueDate)>=Date.now()-86400000).sort((a,b)=>Date.parse(a.dueDate!)-Date.parse(b.dueDate!)).slice(0,3);
 const quick=(label:string,section:string,academicView?:PersonalView)=><button className="siii-overview-quick" key={label} type="button" onClick={()=>onNavigate(section,academicView)}>{label}<ChevronRight size={15} aria-hidden="true"/></button>;
 return <div className="siii-student-dashboard">
  <div className="siii-student-main">
   <header className="siii-overview-hero">
    <button type="button" className="siii-overview-refresh" aria-label="Actualizar mi información" title="Actualizar mi información" disabled={refreshing} onClick={onRefresh}><RefreshCw size={16} aria-hidden="true"/></button>
    <span className="siii-overview-eyebrow">Buen día,</span>
    <h2>{profile.firstName}</h2>
    <p>{profile.programName||institutionName}</p>
    <div className="siii-overview-tags">
     {profile.enrollmentNumber&&<span>{profile.enrollmentNumber}</span>}
     <span>{academicStatus[profile.status]||profile.status}</span>
    </div>
    <span className="siii-overview-watermark" aria-hidden="true"/>
   </header>
   {partial&&<p role="status" className="siii-overview-empty">Parte de tu expediente supera los límites de consulta. Los indicadores afectados se ocultan para evitar cifras engañosas.</p>}
   <SiiiGlassMetricsRow className="siii-overview-metrics" aria-label="Resumen institucional">
    <SiiiGlassMetric label="Promedio de notas publicadas" value={m.incomplete.grades||m.gradeMean===null?'—':m.gradeMean.toFixed(2)} description={m.incomplete.grades?'Consulta parcial de calificaciones':'No es el promedio oficial'} icon={<BookOpen size={21}/>} tone="amber"/>
    <SiiiGlassMetric label="Créditos con nota publicada" value={m.incomplete.grades?'—':m.creditsWithPublishedGrade} description={m.incomplete.grades?'Consulta parcial de créditos':'El plan oficial no está disponible'} icon={<GraduationCap size={21}/>} tone="blue"/>
    <SiiiGlassMetric label="Cargos por liquidar" value={outstandingLabel} description={snapshot.orders.length?'Según el registro de Caja':'Sin movimientos registrados'} icon={<Wallet size={21}/>} tone="green"/>
    <SiiiGlassMetric label="Trámites activos" value={m.incomplete.pendingRequests?'—':m.pendingCount} description={m.incomplete.pendingRequests?'Consulta parcial de trámites':'Solicitudes en seguimiento'} icon={<FileText size={21}/>} tone="terracotta"/>
   </SiiiGlassMetricsRow>
   <div className="siii-overview-detail-grid">
    <SiiiGlassPanel >
     <SiiiGlassPanelHeading title="Calificaciones recientes" action={quick('Ver todas','academic','grades')}/>
     {m.published.slice(0,4).map(grade=><div key={grade.sectionId} className="siii-overview-listrow">
      <div><strong>{grade.courseName}</strong><small>{grade.termName}</small></div>
      <b className="siii-overview-grade">{(grade.scoreHundredths/100).toFixed(2)}</b>
     </div>)}
     {m.published.length===0&&<p className="siii-overview-empty">Aún no hay calificaciones publicadas.</p>}
    </SiiiGlassPanel>
    <SiiiGlassPanel >
     <SiiiGlassPanelHeading title="Estado de cuenta" action={quick('Ver más','orders')}/>
     <span className="siii-overview-eyebrow">Saldo por liquidar</span>
     <div className="siii-overview-balance">{outstandingLabel}</div>
     <p className="siii-overview-subtle">{snapshot.orders.length?'Cargos y abonos institucionales registrados':'Sin órdenes financieras registradas'}</p>
     {snapshot.orders.filter(o=>o.status==='pending'||o.status==='partially_paid').slice(0,2).map(o=><div key={o.id} className="siii-overview-listrow"><div><strong>{o.feeTypeName}</strong><small>{financeStatus[o.status]||o.status}</small></div><b>{formatMoney(Math.max(0,o.totalAmountCents-o.paidAmountCents),o.currency)}</b></div>)}
     <button type="button" className="siii-overview-primary" onClick={()=>onNavigate('orders')}>Consultar estado de cuenta<ChevronRight size={16}/></button>
    </SiiiGlassPanel>
    <SiiiGlassPanel >
     <SiiiGlassPanelHeading title="Mis trámites" action={quick('Ver todos','services')}/>
     {snapshot.pendingRequests.slice(0,4).map(request=><div key={request.id} className="siii-overview-listrow"><div><strong>{requestTypeLabel[request.requestType]||request.requestType}</strong><small>{request.summary}</small></div><span className="siii-overview-status">{requestStatusLabel[request.status]||request.status}</span></div>)}
     {!snapshot.pendingRequests.length&&<p className="siii-overview-empty">No hay trámites pendientes.</p>}
    </SiiiGlassPanel>
   </div>
   <SiiiGlassPanel className="siii-overview-progress">
    <SiiiGlassPanelHeading title="Mi progreso académico registrado" action={quick('Historial','academic','grades')}/>
    <div className="siii-overview-progress-body">
     <div className="siii-overview-progress-summary">
      {!m.incomplete.courses&&!m.incomplete.grades&&m.publicationRatio!==null?<SiiiProgressRing value={m.publicationRatio} label="Proporción de inscripciones consultadas con calificación publicada" size={120}/>:<GraduationCap size={45} aria-hidden="true"/>}
      <div><strong>{m.incomplete.courses||m.incomplete.grades?'Datos incompletos':m.publishedEnrolledSections+' de '+m.enrolledSections}</strong><small>Inscripciones consultadas con nota publicada</small></div>
     </div>
     <div className="siii-overview-term-bars">
      <p>Calificaciones publicadas por periodo</p>
      {!m.incomplete.grades&&m.terms.map(term=><div className="siii-overview-term" key={term.name}>
       <span>{term.name}</span>
       <div className="siii-overview-track"><svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width={m.published.length?100*term.count/m.published.length:0} height="8" rx="4" fill="#8bc6ad"/></svg></div>
       <b>{term.count}</b>
      </div>)}
      {(!m.terms.length||m.incomplete.grades)&&<p className="siii-overview-empty">{m.incomplete.grades?'La consulta de calificaciones está incompleta.':'No existen resultados publicados para graficar.'}</p>}
      <small>Estos indicadores describen los registros disponibles; no sustituyen el avance oficial del plan de estudios.</small>
     </div>
    </div>
   </SiiiGlassPanel>
  </div>
  <aside className="siii-student-aside" aria-label="Información complementaria">
   <SiiiGlassPanel className="siii-overview-calendar">
    <h3 className="sr-only">Calendario</h3>
    <SiiiGlassCalendar timeZone={profile.timeZone}/>
   </SiiiGlassPanel>
   <SiiiGlassPanel id="avisos" aria-label="Avisos institucionales">
    <SiiiGlassPanelHeading title="Avisos institucionales"/>
    {snapshot.announcements.slice(0,3).map(notice=><article key={notice.id} className="siii-overview-listrow"><CheckCircle2 size={17} aria-hidden="true"/><div><strong>{notice.title}</strong><small>{notice.body}</small></div></article>)}
    {!snapshot.announcements.length&&<p className="siii-overview-empty">No hay avisos vigentes.</p>}
   </SiiiGlassPanel>
   <SiiiGlassPanel >
    <h3>Accesos rápidos</h3>
    <div className="siii-overview-shortcuts">
     {quick('Mis docentes','academic','teachers')}
     {quick('Historial académico','academic','grades')}
     {quick('Mis inscripciones','academic','courses')}
     {quick('Mis solicitudes','services')}
    </div>
   </SiiiGlassPanel>
   <SiiiGlassPanel className="siii-overview-dates">
    <h3>Próximas fechas</h3>
    {deadlines.map(order=><div className="siii-overview-date" key={order.id}><span className="siii-overview-date-dot" aria-hidden="true"/><div><strong>{order.feeTypeName}</strong><small>Vencimiento: {new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(order.dueDate!))}</small></div></div>)}
    {!deadlines.length&&<p className="siii-overview-empty">No se registran vencimientos próximos en tu estado de cuenta.</p>}
   </SiiiGlassPanel>

  </aside>
 </div>;
}
