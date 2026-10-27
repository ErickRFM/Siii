'use client';

import type {PersonalProfile} from '@/modules/portal/contracts';
import {academicStatus,financeStatus,formatMoney,requestStatusLabel,requestTypeLabel} from '@/modules/portal/contracts';
import type {PersonalSnapshot,PersonalView} from './use-personal-snapshot';
import {institutionalStudentSummary} from './student-dashboard-metrics';
import SiiiGlassCalendar from './siii-glass-calendar';
import {SiiiProgressRing} from './siii-glass-progress';
import {BookOpen,CheckCircle2,ChevronRight,FileText,GraduationCap,Wallet} from 'lucide-react';

type Destination=(section:string,academicView?:PersonalView)=>void;
export default function StudentGlassOverview({snapshot,profile,institutionName,onNavigate}:{
 snapshot:PersonalSnapshot;profile:PersonalProfile;institutionName:string;onNavigate:Destination;
}){
 const m=institutionalStudentSummary(snapshot);
 const outstandingLabel=m.currency?formatMoney(m.outstanding,m.currency):m.outstanding===0?'Sin cargos pendientes':'Ver desglose por moneda';
 const quick=(label:string,section:string,academicView?:PersonalView)=><button className="siii-overview-quick" key={label} type="button" onClick={()=>onNavigate(section,academicView)}>{label}<ChevronRight size={15} aria-hidden="true"/></button>;
 return <div className="siii-student-dashboard">
  <div className="siii-student-main">
   <header className="siii-overview-hero">
    <span className="siii-overview-eyebrow">Buen día,</span>
    <h2>{profile.firstName}</h2>
    <p>{profile.programName||institutionName}</p>
    <div className="siii-overview-tags">
     {profile.enrollmentNumber&&<span>{profile.enrollmentNumber}</span>}
     <span>{academicStatus[profile.status]||profile.status}</span>
    </div>
    <span className="siii-overview-watermark" aria-hidden="true"/>
   </header>
   <div className="siii-overview-metrics" aria-label="Resumen institucional">
    <section className="siii-overview-panel siii-overview-metric">
     <BookOpen size={20} aria-hidden="true"/>
     <span>Promedio de notas publicadas</span>
     <strong>{m.gradeMean===null?'—':m.gradeMean.toFixed(2)}</strong>
     <small>No es el promedio oficial</small>
    </section>
    <section className="siii-overview-panel siii-overview-metric">
     <GraduationCap size={20} aria-hidden="true"/>
     <span>Créditos con nota publicada</span>
     <strong>{m.creditsWithPublishedGrade}</strong>
     <small>El plan oficial no está disponible</small>
    </section>
    <section className="siii-overview-panel siii-overview-metric">
     <Wallet size={20} aria-hidden="true"/>
     <span>Cargos por liquidar</span>
     <strong>{outstandingLabel}</strong>
     <small>{snapshot.orders.length?'Según el registro de Caja':'Sin movimientos registrados'}</small>
    </section>
    <section className="siii-overview-panel siii-overview-metric">
     <FileText size={20} aria-hidden="true"/>
     <span>Trámites activos</span>
     <strong>{m.pendingCount}</strong>
     <small>Solicitudes en seguimiento</small>
    </section>
   </div>
   <div className="siii-overview-detail-grid">
    <section className="siii-overview-panel">
     <div className="siii-overview-heading"><h3>Calificaciones recientes</h3>{quick('Ver todas','academic','grades')}</div>
     {m.published.slice(0,4).map(grade=><div key={grade.sectionId} className="siii-overview-listrow">
      <div><strong>{grade.courseName}</strong><small>{grade.termName}</small></div>
      <b className="siii-overview-grade">{(grade.scoreHundredths/100).toFixed(2)}</b>
     </div>)}
     {m.published.length===0&&<p className="siii-overview-empty">Aún no hay calificaciones publicadas.</p>}
    </section>
    <section className="siii-overview-panel">
     <div className="siii-overview-heading"><h3>Estado de cuenta</h3>{quick('Ver más','orders')}</div>
     <span className="siii-overview-eyebrow">Saldo por liquidar</span>
     <div className="siii-overview-balance">{outstandingLabel}</div>
     <p className="siii-overview-subtle">{snapshot.orders.length?'Cargos y abonos institucionales registrados':'Sin órdenes financieras registradas'}</p>
     {snapshot.orders.filter(o=>o.status==='pending'||o.status==='partially_paid').slice(0,2).map(o=><div key={o.id} className="siii-overview-listrow"><div><strong>{o.feeTypeName}</strong><small>{financeStatus[o.status]||o.status}</small></div><b>{formatMoney(Math.max(0,o.totalAmountCents-o.paidAmountCents),o.currency)}</b></div>)}
     <button type="button" className="siii-overview-primary" onClick={()=>onNavigate('orders')}>Consultar estado de cuenta<ChevronRight size={16}/></button>
    </section>
    <section className="siii-overview-panel">
     <div className="siii-overview-heading"><h3>Mis trámites</h3>{quick('Ver todos','services')}</div>
     {snapshot.pendingRequests.slice(0,4).map(request=><div key={request.id} className="siii-overview-listrow"><div><strong>{requestTypeLabel[request.requestType]||request.requestType}</strong><small>{request.summary}</small></div><span className="siii-overview-status">{requestStatusLabel[request.status]||request.status}</span></div>)}
     {!snapshot.pendingRequests.length&&<p className="siii-overview-empty">No hay trámites pendientes.</p>}
    </section>
   </div>
   <section className="siii-overview-panel siii-overview-progress">
    <div className="siii-overview-heading"><h3>Mi progreso académico registrado</h3>{quick('Historial','academic','grades')}</div>
    <div className="siii-overview-progress-body">
     <div className="siii-overview-progress-summary">
      {m.publicationRatio!==null?<SiiiProgressRing value={m.publicationRatio} label="Proporción de inscripciones consultadas con calificación publicada" size={120}/>:<GraduationCap size={45} aria-hidden="true"/>}
      <div><strong>{m.publishedEnrolledSections} de {m.enrolledSections}</strong><small>Inscripciones consultadas con nota publicada</small></div>
     </div>
     <div className="siii-overview-term-bars">
      <p>Calificaciones publicadas por periodo</p>
      {m.terms.map(term=><div className="siii-overview-term" key={term.name}>
       <span>{term.name}</span>
       <div className="siii-overview-track"><span style={{width:String(m.published.length?100*term.count/m.published.length:0)+'%'}}/></div>
       <b>{term.count}</b>
      </div>)}
      {!m.terms.length&&<p className="siii-overview-empty">No existen resultados publicados para graficar.</p>}
      <small>Estos indicadores describen los registros disponibles; no sustituyen el avance oficial del plan de estudios.</small>
     </div>
    </div>
   </section>
  </div>
  <aside className="siii-student-aside" aria-label="Información complementaria">
   <section className="siii-overview-panel">
    <h3>Calendario</h3>
    <SiiiGlassCalendar timeZone={profile.timeZone}/>
   </section>
   <section className="siii-overview-panel">
    <div className="siii-overview-heading"><h3>Avisos institucionales</h3></div>
    {snapshot.announcements.slice(0,3).map(notice=><article key={notice.id} className="siii-overview-listrow"><CheckCircle2 size={17} aria-hidden="true"/><div><strong>{notice.title}</strong><small>{notice.body}</small></div></article>)}
    {!snapshot.announcements.length&&<p className="siii-overview-empty">No hay avisos vigentes.</p>}
   </section>
   <section className="siii-overview-panel">
    <h3>Accesos rápidos</h3>
    <div className="siii-overview-shortcuts">
     {quick('Mis docentes','academic','teachers')}
     {quick('Historial académico','academic','grades')}
     {quick('Mis inscripciones','academic','courses')}
     {quick('Mis solicitudes','services')}
    </div>
   </section>
  </aside>
 </div>;
}
