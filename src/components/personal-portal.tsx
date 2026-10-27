'use client';
import Link from 'next/link';
import {useEffect,useLayoutEffect,useRef,useState,type SetStateAction} from 'react';
import dynamic from 'next/dynamic';
import {Home,GraduationCap,Wallet,FileText,UserRound} from 'lucide-react';
import {usePersonalSnapshot,type PersonalView} from './use-personal-snapshot';
import {PersonalEnrollments,PersonalHistory} from './personal-academics';
import {emptyPersonalRequestDraft,type PersonalRequestDraft} from '@/shared/client/personal-request-draft';
import {hasAnyCapability,useInstitutionCapabilities} from './institution-capabilities';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {SiiPageIntro,SiiEmptyView,SiiSkeleton} from './ui/sii-kit';
import {Card,CardHeader,CardContent,CardTitle} from './ui/card';
import {PersonalTable} from './personal-table';
import StudentGlassOverview from './student-glass-overview';
import {AcademicWeek,weekDates} from './academic-week';
import type {PersonalProfile,PersonalTeacher,PersonalSchedule,PersonalOrder,PersonalPayment} from '@/modules/portal/contracts';
import {academicStatus,financeStatus,formatMoney} from '@/modules/portal/contracts';

const PersonalRequests=dynamic(()=>import('./personal-requests'),{loading:()=> <SiiSkeleton label="Cargando el formulario de solicitudes"/>});

function calendarNow(timeZone:string){
 try{const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return {date:`${values.year}-${values.month}-${values.day}`,minute:Number(values.hour)*60+Number(values.minute)}}catch{return null}
}

function Schedule({rows,teachers,timeZone}:{rows:PersonalSchedule[];teachers:PersonalTeacher[];timeZone:string}){
 const [week,setWeek]=useState(()=>calendarNow(timeZone)?.date??'');
 const dates=weekDates(week),visible=rows.filter(row=>dates.includes(row.date));
 return <div className="space-y-4"><label className="block max-w-xs space-y-2 font-medium">Semana a consultar<Input type="date" value={week} onChange={event=>setWeek(event.target.value)}/></label><p className="text-sm text-muted-foreground">Programación registrada por la institución · Zona horaria: {timeZone}. Las cancelaciones y cambios aparecen con su estado.</p>
  <AcademicWeek week={week} occurrences={visible.map(row=>({...row,teacherName:teachers.filter(teacher=>teacher.sectionId===row.sectionId).map(teacher=>teacher.firstName+' '+teacher.lastName).join(', ')}))} emptyDescription="La institución no tiene clases registradas para ti en esta semana. Consulta otra fecha o solicita a coordinación revisar tu programación."/></div>;
}
function Profile({profile}:{profile:PersonalProfile}){return <Card><CardHeader><CardTitle>Mi perfil institucional</CardTitle></CardHeader><CardContent className="space-y-4"><dl className="grid gap-4 sm:grid-cols-2">{[['Nombre',profile.firstName+' '+profile.lastName],['Matrícula',profile.enrollmentNumber],['Programa',profile.programName],['Estado académico',academicStatus[profile.status]??profile.status],['Correo institucional',profile.institutionalEmail??'No registrado'],['Correo de acceso verificado',profile.verifiedEmail??'Sin correo verificado']].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold">{value??'No registrado'}</dd></div>)}</dl><p className="text-sm text-muted-foreground">Control Escolar conserva los datos académicos oficiales. Solicita a tu institución cualquier corrección.</p><Link className="sii-outline-button" href="/dashboard/security">Contraseña, MFA y sesiones</Link></CardContent></Card>}
function Statements({orders,payments}:{orders:PersonalOrder[];payments:PersonalPayment[]}){return <div className="space-y-6"><p className="text-sm text-muted-foreground">Consulta informativa de cargos y pagos registrados en Caja. Los pagos electrónicos requieren una pasarela institucional configurada; aquí se muestran abonos externos confirmados.</p>
 <h2 className="text-lg font-semibold">Órdenes de pago</h2><PersonalTable label="Órdenes de pago" rows={orders} searchText={row=>row.orderNumber+' '+row.feeTypeName} columns={[{label:'Orden / concepto',render:row=><><strong>{row.feeTypeName}</strong><p className="break-all text-xs text-muted-foreground">{row.orderNumber}</p></>},{label:'Importe',render:row=>formatMoney(row.totalAmountCents,row.currency)},{label:'Pagado',render:row=>formatMoney(row.paidAmountCents,row.currency)},{label:'Saldo',render:row=>formatMoney(['pending','partially_paid'].includes(row.status)?row.totalAmountCents-row.paidAmountCents:0,row.currency)},{label:'Estado',render:row=>financeStatus[row.status]??row.status},{label:'Fecha límite',render:row=>row.dueDate?new Date(row.dueDate).toLocaleDateString('es-MX'):'Sin fecha registrada'}]}/>
 <h2 className="text-lg font-semibold">Movimientos registrados</h2><PersonalTable label="Pagos registrados" rows={payments} columns={[{label:'Movimiento',render:row=><span className="break-all">{row.transactionNumber}</span>},{label:'Fecha',render:row=>new Date(row.createdAt).toLocaleString('es-MX')},{label:'Importe',render:row=>formatMoney(row.amountCents,row.currency)},{label:'Medio',render:row=>row.paymentMethod==='cash'?'Efectivo':row.paymentMethod==='transfer'?'Transferencia':row.paymentMethod},{label:'Referencia',render:row=>row.reference??'Sin referencia'}]}/></div>}
const studentDestinations=[{id:'home',label:'Inicio',icon:Home},{id:'academic',label:'Académico',icon:GraduationCap},{id:'orders',label:'Finanzas',icon:Wallet},{id:'services',label:'Servicios',icon:FileText},{id:'profile',label:'Perfil',icon:UserRound}] as const;

export default function PersonalPortal({institutionId,institutionName,actorId}:{institutionId:string;institutionName:string;actorId:string}){
 const [section,setSection]=useState('home'),[academicView,setAcademicView]=useState<PersonalView>('courses');
 // The App Router may update a same-page hash through history.pushState (without hashchange).
 // Listen to our navigation event as well as real hash changes, retaining deep-link reloads.
 useEffect(()=>{
  const apply=(raw:string)=>{
   const destination=decodeURIComponent(raw.replace(/^#/,''));
   const map:Record<string,{section:string;academic?:PersonalView}>={
    inicio:{section:'home'},inscripciones:{section:'academic',academic:'courses'},
    calificaciones:{section:'academic',academic:'grades'},
    docentes:{section:'academic',academic:'teachers'},
    finanzas:{section:'orders'},tramites:{section:'services'},perfil:{section:'profile'}
   };
   const selected=map[destination];
   if(selected){if(selected.academic)setAcademicView(selected.academic);setSection(selected.section)}
  };
  const fromHash=()=>apply(window.location.hash);
  const onNavigation=(event:Event)=>apply((event as CustomEvent<string>).detail);
  fromHash();window.addEventListener('hashchange',fromHash);
  window.addEventListener('siii:student-navigation',onNavigation);
  return ()=>{window.removeEventListener('hashchange',fromHash);window.removeEventListener('siii:student-navigation',onNavigation)};
 },[]);

 const view:PersonalView=section==='academic'?academicView:section as PersonalView;
 const {snapshot,loading,error,updatedAt,refresh,authority,accessChanged,retire}=usePersonalSnapshot(institutionId,'student',actorId,view),profile=snapshot?.profile;
 const permissions=useInstitutionCapabilities();
 const [requestDraft,setRequestDraft]=useState<{authority:string;value:PersonalRequestDraft}|null>(null);
 const currentAuthority=useRef(authority);useLayoutEffect(()=>{currentAuthority.current=authority},[authority]);
 useEffect(()=>{if(accessChanged)setRequestDraft(null);else if(authority)setRequestDraft(previous=>previous&&previous.authority!==authority?null:previous)},[authority,accessChanged]);
 function updateRequestDraft(change:SetStateAction<PersonalRequestDraft>){const expected=authority;setRequestDraft(previous=>{if(!expected||currentAuthority.current!==expected)return previous;const value=previous?.authority===expected?previous.value:emptyPersonalRequestDraft();return {authority:expected,value:typeof change==='function'?change(value):change}})}
 const status=<>{error&&<div role="alert" className="sii-catalog-error">{error} <Button variant="outline" onClick={()=>void refresh()}>Reintentar consulta</Button></div>}{loading&&(snapshot?<p role="status" className="text-sm text-muted-foreground">Actualizando información…</p>:<SiiSkeleton label="Consultando tu información institucional"/>)}{snapshot&&!profile&&<SiiEmptyView icon="registry" title={'Expediente aún sin vincular'} description="Tu acceso está vigente. La institución debe vincular tu cuenta con el registro oficial para mostrar información académica."/>}</>;
 function content(){
  if(!snapshot||!profile)return null;
  if(view==='home')return <StudentGlassOverview snapshot={snapshot} profile={profile} institutionName={institutionName} onNavigate={(destination,academic)=>{if(academic)setAcademicView(academic);setSection(destination)}} onRefresh={()=>void refresh()} refreshing={loading}/>;
  if(view==='courses')return <PersonalEnrollments courses={snapshot.courses} teachers={snapshot.teachers}/>;
  if(view==='teachers')return <PersonalTable label="Docentes asignados" rows={snapshot.teachers} searchText={row=>row.firstName+' '+row.lastName+' '+row.courseName} columns={[{label:'Docente',render:row=><strong>{row.firstName} {row.lastName}</strong>},{label:'Materia',render:row=>row.courseName},{label:'Grupo',render:row=>row.sectionCode},{label:'Periodo',render:row=>row.termName}]}/>;
  if(view==='grades')return <PersonalHistory rows={snapshot.grades}/>;
  if(view==='orders')return <Statements orders={snapshot.orders} payments={snapshot.payments}/>;
  if(view==='profile')return <Profile profile={profile}/>;
  if(view==='services')return <PersonalRequests key={authority} institutionId={institutionId} rows={snapshot.requests} history={snapshot.requestHistory} canCreate={profile.status==='active'&&hasAnyCapability(permissions.data,'student.requests.create')} draft={requestDraft?.authority===authority?requestDraft.value:emptyPersonalRequestDraft()} onDraftChange={updateRequestDraft} onChanged={refresh} onDenied={()=>{setRequestDraft(null);retire()}}/>;
  if(view==='schedule')return <Schedule rows={snapshot.schedule} teachers={snapshot.teachers} timeZone={profile.timeZone}/>;
  return null;
 }
 return <div className={'sii-workspace space-y-6 sii-student-portal'+(section==='home'?' siii-student-home-shell':'')}><div className={section==='home'?'siii-home-visually-hidden':''}><SiiPageIntro eyebrow={'PORTAL ESTUDIANTIL'} title={'Mi vida universitaria'} description={institutionName} actions={section==='home'?undefined:<Button variant="outline" disabled={loading} onClick={()=>void refresh()} aria-label="Actualizar mi información">{loading?'Consultando…':'Actualizar'}</Button>}/></div>
  <nav aria-label="Contexto del portal" className="siii-student-utility-links flex flex-wrap gap-3 text-sm"><Link className="font-semibold text-primary underline" href="/dashboard">Cambiar institución</Link><Link className="font-semibold text-primary underline" href="/dashboard/security">Cuenta y seguridad</Link></nav>
  <Tabs value={section} onValueChange={setSection} className={'min-w-0 space-y-5'+(section==='home'?' siii-home-tabs':'')}>
   <TabsList aria-label={'Navegación estudiantil'} className="sii-personal-navigation">
    {studentDestinations.map(item=><TabsTrigger key={item.id} value={item.id} className="min-h-11 gap-2"><item.icon className="size-5" aria-hidden="true"/><span>{item.label}</span></TabsTrigger>)}
   </TabsList>
   {profile&&<div className="siii-student-identity-card rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{'Estudiante'} · {academicStatus[profile.status]??profile.status}</p><h2 className="mt-1 text-xl font-semibold">{profile.firstName} {profile.lastName}</h2><p className="mt-1 text-sm">{profile.enrollmentNumber}{profile.programName?' · '+profile.programName:''}</p></div>}
   {['home','academic','orders','services','profile'].map(destination=><TabsContent key={destination} value={destination} className="space-y-4">
    {destination==='academic'?<Tabs value={academicView} onValueChange={value=>setAcademicView(value as PersonalView)} className="space-y-4"><TabsList aria-label="Consultas académicas" className="sii-workspace-tabs flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">{[['courses','Mis inscripciones'],['teachers','Mis docentes'],['grades','Calificaciones e historial']].map(([value,label])=><TabsTrigger key={value} value={value} className="min-h-11">{label}</TabsTrigger>)}</TabsList>{['courses','teachers','grades'].map(value=><TabsContent key={value} value={value} className="space-y-4">{status}{content()}</TabsContent>)}<Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}/academic`}>Consultar oferta académica</Link></Tabs>:<>{status}{content()}</>}
   </TabsContent>)}
  </Tabs>
  {updatedAt&&<p className="text-sm text-muted-foreground">Última consulta: {updatedAt}. Al actualizar se vuelven a validar tus permisos y vínculos.</p>}
 </div>;
}
