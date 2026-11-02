'use client';
import Link from 'next/link';
import {useEffect,useLayoutEffect,useRef,useState,type SetStateAction} from 'react';
import dynamic from 'next/dynamic';
import {emptyPersonalSnapshot,usePersonalSnapshot,type PersonalView} from './use-personal-snapshot';
import {PersonalEnrollments,PersonalHistory} from './personal-academics';
import {emptyPersonalRequestDraft,type PersonalRequestDraft} from '@/shared/client/personal-request-draft';
import {hasAnyCapability,useInstitutionCapabilities} from './institution-capabilities';

import {RefreshCw,LoaderCircle} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {SiiEmptyView,SiiSkeleton} from './ui/sii-kit';
import {Card,CardHeader,CardContent,CardTitle} from './ui/card';
import {PersonalTable} from './personal-table';
import StudentGlassOverview from './student-glass-overview';
import {AcademicWeek,weekDates} from './academic-week';
import type {PersonalProfile,PersonalTeacher,PersonalSchedule,PersonalOrder,PersonalPayment} from '@/modules/portal/contracts';
import {academicStatus,financeStatus,formatMoney} from '@/modules/portal/contracts';
import {resolveStudentDestination} from '@/shared/navigation/personal-navigation-registry';

function PersonalInlineLoading(){return <div role="status" aria-live="polite" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm text-muted-foreground"><LoaderCircle size={16} className="animate-spin" aria-hidden="true"/> Consultando datos…</div>}
const PersonalRequests=dynamic(()=>import('./personal-requests'),{loading:()=> <SiiSkeleton label="Cargando el formulario de solicitudes"/>});

function calendarNow(timeZone:string){
 try{const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return {date:`${values.year}-${values.month}-${values.day}`,minute:Number(values.hour)*60+Number(values.minute)}}catch{return null}
}

function Schedule({rows,teachers,timeZone}:{rows:PersonalSchedule[];teachers:PersonalTeacher[];timeZone:string}){
 const [week,setWeek]=useState('');
 useEffect(()=>{setWeek(previous=>previous||calendarNow(timeZone)?.date||'')},[timeZone]);
 const dates=weekDates(week),visible=week?rows.filter(row=>dates.includes(row.date)):[];
 return <div className="space-y-4"><label className="block max-w-xs space-y-2 font-medium">Semana a consultar<Input type="date" value={week} onChange={event=>setWeek(event.target.value)}/></label><p className="text-sm text-muted-foreground">Programación registrada por la institución · Zona horaria: {timeZone}. Las cancelaciones y cambios aparecen con su estado.</p>
  <AcademicWeek week={week} occurrences={visible.map(row=>({...row,teacherName:teachers.filter(teacher=>teacher.sectionId===row.sectionId).map(teacher=>teacher.firstName+' '+teacher.lastName).join(', ')}))} emptyDescription="La institución no tiene clases registradas para ti en esta semana. Consulta otra fecha o solicita a coordinación revisar tu programación."/></div>;
}

function Profile({profile}:{profile:PersonalProfile}){return <Card><CardHeader><CardTitle>Mi perfil institucional</CardTitle></CardHeader><CardContent className="space-y-4"><dl className="grid gap-4 sm:grid-cols-2">{[['Nombre',profile.firstName+' '+profile.lastName],['Matrícula',profile.enrollmentNumber],['Programa',profile.programName],['Estado académico',academicStatus[profile.status]??profile.status],['Correo institucional',profile.institutionalEmail??'No registrado'],['Correo de acceso verificado',profile.verifiedEmail??'Sin correo verificado']].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold">{value??'No registrado'}</dd></div>)}</dl><p className="text-sm text-muted-foreground">Control Escolar conserva los datos académicos oficiales. Solicita a tu institución cualquier corrección.</p><Link className="sii-outline-button" href="/dashboard/security">Contraseña, MFA y sesiones</Link></CardContent></Card>}

function Statements({orders,payments}:{orders:PersonalOrder[];payments:PersonalPayment[]}){return <div className="space-y-6"><p className="text-sm text-muted-foreground">Consulta informativa de cargos y pagos registrados en Caja. Los pagos electrónicos requieren una pasarela institucional configurada; aquí se muestran abonos externos confirmados.</p>
 <h2 className="text-lg font-semibold">Órdenes de pago</h2><PersonalTable label="Órdenes de pago" rows={orders} searchText={row=>row.orderNumber+' '+row.feeTypeName} columns={[{label:'Orden / concepto',sortValue:row=>row.feeTypeName,render:row=><><strong>{row.feeTypeName}</strong><p className="break-all text-xs text-muted-foreground">{row.orderNumber}</p></>},{label:'Importe',sortValue:row=>row.totalAmountCents,render:row=>formatMoney(row.totalAmountCents,row.currency)},{label:'Pagado',render:row=>formatMoney(row.paidAmountCents,row.currency)},{label:'Saldo',sortValue:row=>Math.max(0,row.totalAmountCents-row.paidAmountCents),render:row=>formatMoney(['pending','partially_paid'].includes(row.status)?row.totalAmountCents-row.paidAmountCents:0,row.currency)},{label:'Estado',render:row=>financeStatus[row.status]??row.status},{label:'Fecha límite',sortValue:row=>row.dueDate,render:row=>row.dueDate?new Date(row.dueDate).toLocaleDateString('es-MX'):'Sin fecha registrada'}]}/>
 <h2 className="text-lg font-semibold">Movimientos registrados</h2><PersonalTable label="Pagos registrados" rows={payments} columns={[{label:'Movimiento',sortValue:row=>row.transactionNumber,render:row=><span className="break-all">{row.transactionNumber}</span>},{label:'Fecha',sortValue:row=>row.createdAt,render:row=>new Date(row.createdAt).toLocaleString('es-MX')},{label:'Importe',sortValue:row=>row.amountCents,render:row=>formatMoney(row.amountCents,row.currency)},{label:'Medio',render:row=>row.paymentMethod==='cash'?'Efectivo':row.paymentMethod==='transfer'?'Transferencia':row.paymentMethod},{label:'Referencia',render:row=>row.reference??'Sin referencia'}]}/></div>}


export default function PersonalPortal({institutionId,institutionName,actorId}:{institutionId:string;institutionName:string;actorId:string}){
 const [section,setSection]=useState('home'),[academicView,setAcademicView]=useState<PersonalView>('courses');
 const [activeHash,setActiveHash]=useState('inicio');

 useEffect(()=>{
  const apply=(raw:string)=>{
   const resolved=resolveStudentDestination(raw);
   setActiveHash(raw.replace(/^#/,'')||'inicio');
   if(resolved.academicView)setAcademicView(resolved.academicView);
   setSection(resolved.section);
  };
  const fromHash=()=>apply(window.location.hash);
  const onNavigation=(event:Event)=>apply((event as CustomEvent<string>).detail);
  fromHash();
  window.addEventListener('hashchange',fromHash);
  window.addEventListener('siii:student-navigation',onNavigation);
  return ()=>{
    window.removeEventListener('hashchange',fromHash);
    window.removeEventListener('siii:student-navigation',onNavigation);
  };
 },[]);

 const view:PersonalView=section==='academic'?academicView:section as PersonalView;
 useEffect(()=>{
  const map:Partial<Record<PersonalView,string>>={home:'inicio',courses:'inscripciones',grades:'calificaciones',teachers:'docentes',orders:'finanzas',services:'tramites',profile:'perfil'};
  const currentHash=window.location.hash.replace(/^#/,'');
  const resolved=resolveStudentDestination(currentHash);
  const selected=resolved.section===section&&(!resolved.academicView||resolved.academicView===academicView)&&currentHash?currentHash:(map[view]||'inicio');
  window.dispatchEvent(new CustomEvent('siii:student-active-section',{detail:selected}));
 },[view,section,academicView]);

 const {snapshot,loading,error,updatedAt,refresh,authority,accessChanged,retire}=usePersonalSnapshot(institutionId,'student',actorId,view),profile=snapshot?.profile;
 const permissions=useInstitutionCapabilities();
 const [requestDraft,setRequestDraft]=useState<{authority:string;value:PersonalRequestDraft}|null>(null);
 const currentAuthority=useRef(authority);useLayoutEffect(()=>{currentAuthority.current=authority},[authority]);
 useEffect(()=>{if(accessChanged)setRequestDraft(null);else if(authority)setRequestDraft(previous=>previous&&previous.authority!==authority?null:previous)},[authority,accessChanged]);
 function updateRequestDraft(change:SetStateAction<PersonalRequestDraft>){const expected=authority;setRequestDraft(previous=>{if(!expected||currentAuthority.current!==expected)return previous;const value=previous?.authority===expected?previous.value:emptyPersonalRequestDraft();return {authority:expected,value:typeof change==='function'?change(value):change}})}
 const status=<>{error&&<div role="alert" className="sii-catalog-error">{error} <Button variant="outline" onClick={()=>void refresh()}>Reintentar consulta</Button></div>}{loading&&(snapshot?<p role="status" className="sr-only">Actualizando información…</p>:view==='home'?<span className="sr-only" role="status">Consultando tu información institucional</span>:<PersonalInlineLoading/>)}{snapshot&&!profile&&view!=='home'&&<SiiEmptyView icon="registry" title={'Expediente aún sin vincular'} description="Tu acceso está vigente. La institución debe vincular tu cuenta con el registro oficial para mostrar información académica."/>}</>;

 function content(){
  if(view==='home'&&!snapshot)return loading?<PersonalInlineLoading/>:null;
   if(view==='home')return <StudentGlassOverview snapshot={snapshot??emptyPersonalSnapshot()} profile={profile??null} unlinked={Boolean(snapshot&&!profile&&!error)} institutionName={institutionName} onNavigate={(destination,academic)=>{if(academic)setAcademicView(academic);setSection(destination)}} onRefresh={()=>void refresh()} refreshing={loading}/>;
  if(!snapshot||!profile)return null;
  if(view==='courses')return <PersonalEnrollments courses={snapshot.courses} teachers={snapshot.teachers}/>;
  if(view==='teachers')return <PersonalTable label="Docentes asignados" rows={snapshot.teachers} searchText={row=>row.firstName+' '+row.lastName+' '+row.courseName} columns={[{label:'Docente',sortValue:row=>row.lastName+' '+row.firstName,render:row=><strong>{row.firstName} {row.lastName}</strong>},{label:'Materia',sortValue:row=>row.courseName,render:row=>row.courseName},{label:'Grupo',render:row=>row.sectionCode},{label:'Periodo',render:row=>row.termName}]}/>;
  if(view==='grades')return <PersonalHistory rows={snapshot.grades}/>;
  if(view==='orders')return <Statements orders={snapshot.orders} payments={snapshot.payments}/>;
  if(view==='profile')return <Profile profile={profile}/>;
  if(view==='services')return <PersonalRequests key={authority} institutionId={institutionId} rows={snapshot.requests} history={snapshot.requestHistory} canCreate={profile.status==='active'&&hasAnyCapability(permissions.data,'student.requests.create')} draft={requestDraft?.authority===authority?requestDraft.value:emptyPersonalRequestDraft()} onDraftChange={updateRequestDraft} onChanged={refresh} onDenied={()=>{setRequestDraft(null);retire()}}/>;
  if(view==='schedule')return <Schedule rows={snapshot.schedule} teachers={snapshot.teachers} timeZone={profile.timeZone}/>;
  return null;
 }

 return <div className="sii-workspace siii-glass-workspace sii-student-portal siii-student-home-shell min-w-0 space-y-3">
  {section!=='home'&&<header className="flex min-w-0 items-center justify-between gap-3 pb-1"><h1 className="min-w-0 text-base font-semibold tracking-tight">{section==='academic'?(academicView==='grades'?(activeHash==='historial'?'Historial académico':'Calificaciones'):academicView==='teachers'?'Mis docentes':'Carga académica'):section==='orders'?'Estado de cuenta':section==='services'?'Mis trámites':'Mi perfil'}</h1><Button size="icon" variant="ghost" aria-label="Actualizar mi información" title="Actualizar mi información" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16} aria-hidden="true"/></Button></header>}
  <div className="min-w-0 space-y-3" id="siii-student-current-view">
   {status}
   {content()}
  </div>
  {updatedAt&&<span role="status" className="sr-only">Información actualizada: {updatedAt}. Se revalidaron tus permisos y vínculos.</span>}
 </div>;
}
