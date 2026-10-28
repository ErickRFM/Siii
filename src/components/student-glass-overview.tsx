'use client';

import type {PersonalProfile} from '@/modules/portal/contracts';
import {academicStatus,financeStatus,formatMoney,requestStatusLabel,requestTypeLabel} from '@/modules/portal/contracts';
import type {PersonalSnapshot,PersonalView} from './use-personal-snapshot';
import {institutionalStudentSummary} from './student-dashboard-metrics';
import SiiiHeroRibbon from './siii-hero-ribbon';
import SiiiGlassCalendar from './siii-glass-calendar';
import {SiiiProgressRing} from './siii-glass-progress';
import {SiiiGlassMetric,SiiiGlassPanel,SiiiGlassPanelHeading,SiiiGlassMetricsRow} from './ui/siii-glass-kit';
import {BookOpen,BellRing,BadgeCheck,Sparkles,Database,ChartNoAxesCombined,Mail,Contact,ChevronRight,FileText,GraduationCap,RefreshCw,Wallet,Code2,Network,SquareRadical,Receipt,LibraryBig} from 'lucide-react';

type Destination=(section:string,academicView?:PersonalView)=>void;
function publishedAge(value:string|null){
 if(!value)return null;const timestamp=Date.parse(value),now=Date.now();if(!Number.isFinite(timestamp)||timestamp>now)return null;
 const minutes=Math.floor((now-timestamp)/60000);
 return minutes<1?'ahora':minutes<60?`hace ${minutes} min`:minutes<1440?`hace ${Math.floor(minutes/60)} h`:`hace ${Math.floor(minutes/1440)} día${minutes>=2880?'s':''}`;
}
export default function StudentGlassOverview({snapshot,profile,institutionName,onNavigate,onRefresh,refreshing,unlinked=false}:{
 snapshot:PersonalSnapshot;profile:PersonalProfile|null;institutionName:string;onNavigate:Destination;onRefresh:()=>void;refreshing:boolean;unlinked?:boolean;
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
    <h2>{profile?.firstName??'Mi vida universitaria'}<span className="sr-only"> {profile?.lastName}</span></h2>
    <p>{profile?.programName||institutionName}</p>
    <div className="siii-overview-tags">
     {profile?.enrollmentNumber&&<span>{profile.enrollmentNumber}</span>}
     <span>{profile?(academicStatus[profile.status]||profile.status):unlinked?'Expediente aún sin vincular':refreshing?'Consultando tu expediente':'Información no disponible'}</span>
    </div>
    <SiiiHeroRibbon/>
    <p className="siii-overview-motto">“Formando<br/>profesionales<br/>para el futuro”<small>— {institutionName}</small></p>
   </header>
   {partial&&<p role="status" className="siii-overview-empty">Parte de tu expediente supera los límites de consulta. Los indicadores afectados se ocultan para evitar cifras engañosas.</p>}
   <SiiiGlassMetricsRow className="siii-overview-metrics" aria-label="Resumen institucional">
    <SiiiGlassMetric label="Promedio publicado" value={m.incomplete.grades||m.gradeMean===null||!profile?'—':m.gradeMean.toFixed(2)} description={m.incomplete.grades?'Consulta parcial de calificaciones':'No es el promedio oficial'} icon={<BookOpen size={21}/>} tone="amber"/>
    <SiiiGlassMetric label="Créditos publicados" value={m.incomplete.grades||!profile?'—':m.creditsWithPublishedGrade} description={m.incomplete.grades?'Consulta parcial de créditos':'El plan oficial no está disponible'} accessory={<SiiiProgressRing size={54} value={!m.incomplete.courses&&!m.incomplete.grades&&profile?m.publicationRatio:null} label="Inscripciones consultadas con nota publicada; no representa créditos del plan oficial"/>} icon={<GraduationCap size={21}/>} tone="blue"/>
    <SiiiGlassMetric label="Cargos por liquidar" value={profile?outstandingLabel:'—'} description={snapshot.orders.length?'Según el registro de Caja':'Sin movimientos registrados'} icon={<Wallet size={21}/>} tone="green"/>
    <SiiiGlassMetric label="Trámites activos" value={m.incomplete.pendingRequests||!profile?'—':m.pendingCount} description={m.incomplete.pendingRequests?'Consulta parcial de trámites':'Solicitudes en seguimiento'} icon={<FileText size={21}/>} tone="terracotta"/>
   </SiiiGlassMetricsRow>
   <div className="siii-overview-detail-grid">
    <SiiiGlassPanel >
     <SiiiGlassPanelHeading title="Calificaciones recientes" action={quick('Ver todas','academic','grades')}/>
     {m.published.slice(0,4).map((grade,index)=>{const Icon=/datos/i.test(grade.courseName)?Database:[BookOpen,Code2,Network,SquareRadical][index];return <div key={grade.sectionId} className="siii-overview-listrow">
      <span className="siii-reference-row-icon" data-tone={['blue','terracotta','amber','violet'][index]} aria-hidden="true"><Icon size={23}/></span>
      <div><strong>{grade.courseName}</strong><small>Publicado · {new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(grade.publishedAt))}</small></div>
      <b className="siii-overview-grade">{(grade.scoreHundredths/100).toFixed(2)}</b>
      <ChevronRight size={13} aria-hidden="true"/>
     </div>})}
     {m.published.length===0&&<p className="siii-overview-empty">{profile?'Aún no hay calificaciones publicadas.':'Las calificaciones estarán disponibles al vincular tu expediente.'}</p>}
    </SiiiGlassPanel>
    <SiiiGlassPanel >
     <SiiiGlassPanelHeading title="Estado de cuenta" action={quick('Ver más','orders')}/>
     <span className="siii-overview-eyebrow">Saldo por liquidar</span>
     <div className="siii-overview-balance">{profile?outstandingLabel:'—'}</div>
     <p className="siii-overview-subtle">{!profile?'Consulta disponible con tu expediente vinculado.':snapshot.orders.length?'Cargos y abonos institucionales registrados':'Sin órdenes financieras registradas'}</p>
     {snapshot.orders.filter(o=>o.status==='pending'||o.status==='partially_paid').slice(0,2).map(o=><div key={o.id} className="siii-overview-listrow"><div><strong>{o.feeTypeName}</strong><small>{financeStatus[o.status]||o.status}</small></div><b>{formatMoney(Math.max(0,o.totalAmountCents-o.paidAmountCents),o.currency)}</b></div>)}
     <button type="button" className="siii-overview-primary" onClick={()=>onNavigate('orders')}>Consultar estado de cuenta<ChevronRight size={16}/></button>
    </SiiiGlassPanel>
    <SiiiGlassPanel >
     <SiiiGlassPanelHeading title="Mis trámites" action={quick('Ver todos','services')}/>
     {snapshot.pendingRequests.slice(0,4).map((request,index)=>{const Icon=/historial/i.test(request.summary)?ChartNoAxesCombined:/kárdex|kardex/i.test(request.summary)?Mail:/inscripci[oó]n/i.test(request.summary)?Contact:FileText;return <div key={request.id} className="siii-overview-listrow"><span className="siii-reference-row-icon" data-tone={['green','blue','violet','terracotta'][index]} aria-hidden="true"><Icon size={23}/></span><div><strong title={request.summary}>{request.summary}</strong><small>{requestTypeLabel[request.requestType]||request.requestType}</small></div><span className="siii-overview-status">{requestStatusLabel[request.status]||request.status}</span></div>})}
     {!snapshot.pendingRequests.length&&<p className="siii-overview-empty">{profile?'No hay trámites pendientes.':'Vincula tu expediente para consultar tus trámites.'}</p>}
    </SiiiGlassPanel>
   </div>
   <SiiiGlassPanel className="siii-overview-progress">
    <SiiiGlassPanelHeading title="Mi progreso académico registrado" action={quick('Historial','academic','grades')}/>
    <div className="siii-overview-progress-body">
     <div className="siii-overview-progress-summary">
      <SiiiProgressRing value={!m.incomplete.courses&&!m.incomplete.grades&&profile?m.publicationRatio:null} label="Proporción de inscripciones consultadas con calificación publicada" size={140}/>
      <div><small>Créditos con nota publicada</small><strong>{!profile?'—':m.incomplete.courses||m.incomplete.grades?'—':m.creditsWithPublishedGrade}</strong><small>{!profile?'Sin datos vinculados':m.incomplete.courses||m.incomplete.grades?'Datos incompletos':`${m.publishedEnrolledSections} de ${m.enrolledSections} inscripciones consultadas`}</small></div>
     </div>
     <div className="siii-overview-term-bars">
      <p>Resultados publicados · escala de 0 a 10</p>
      {!m.incomplete.grades&&m.published.slice(0,4).map((grade,index)=><div className="siii-overview-term" key={grade.sectionId}>
       <span title={grade.courseName}>{grade.courseName}</span>
       <div className="siii-overview-track"><svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width={Math.max(0,Math.min(100,grade.scoreHundredths/10))} height="8" rx="4" fill={['#79a1ef','#c28cde','#eeb171','#85c9ad'][index]}/></svg></div>
       <b>{(grade.scoreHundredths/100).toFixed(1)}</b>
      </div>)}
      {(!m.terms.length||m.incomplete.grades)&&<p className="siii-overview-empty">{m.incomplete.grades?'La consulta de calificaciones está incompleta.':'No existen resultados publicados para graficar.'}</p>}
      <small className="sr-only">Estos indicadores describen los registros disponibles; no sustituyen el avance oficial del plan de estudios.</small>
     </div>
    </div>
   </SiiiGlassPanel>
  </div>
  <aside className="siii-student-aside" aria-label="Información complementaria">
   <SiiiGlassPanel className="siii-overview-calendar">
    <h3 className="sr-only">Calendario</h3>
    <SiiiGlassCalendar timeZone={profile?.timeZone??'America/Mexico_City'}/>
   </SiiiGlassPanel>
   <SiiiGlassPanel id="avisos" aria-label="Avisos institucionales">
    <SiiiGlassPanelHeading title="Avisos institucionales"/>
    {snapshot.announcements.map(notice=>{const Icon=/reinscrip|inscripci[oó]n/i.test(notice.title)?BadgeCheck:/convocatoria/i.test(notice.title)?Sparkles:BellRing;const age=publishedAge(notice.publishedAt);return <article key={notice.id} className="siii-overview-listrow"><Icon size={17} aria-hidden="true"/><div><strong>{notice.title}</strong><small>{notice.body}</small></div>{age&&<time dateTime={notice.publishedAt!}>{age}</time>}</article>})}
    {!snapshot.announcements.length&&<p className="siii-overview-empty">{profile?'No hay avisos vigentes.':'Los avisos estarán disponibles después de validar tu acceso.'}</p>}
   </SiiiGlassPanel>
   <SiiiGlassPanel >
    <h3>Accesos rápidos</h3>
    <div className="siii-overview-shortcuts">
     <button type="button" onClick={()=>onNavigate('orders')}><Receipt aria-hidden="true"/>Estado de cuenta</button>
     <button type="button" onClick={()=>onNavigate('services')}><FileText aria-hidden="true"/>Mis trámites</button>
     <button type="button" onClick={()=>onNavigate('academic','teachers')}><GraduationCap aria-hidden="true"/>Mis docentes</button>
     <button type="button" onClick={()=>onNavigate('academic','courses')}><LibraryBig aria-hidden="true"/>Mis inscripciones</button>
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
