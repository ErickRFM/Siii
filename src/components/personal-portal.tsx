'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from './ui/table';
import {SiiPageIntro,SiiEmptyView,SiiSkeleton,SiiMetricTile} from './ui/sii-kit';
import {Card,CardHeader,CardContent,CardTitle} from './ui/card';
import SiiScrollRegion from './sii-scroll-region';
import {AcademicWeek,weekDates,academicClock} from './academic-week';
import {readCollection} from '@/shared/client/read-collection';
import type {PersonalProfile,PersonalCourse,PersonalTeacher,PersonalSchedule,PersonalGrade,PersonalOrder,PersonalPayment,PersonalAnnouncement} from '@/modules/portal/contracts';
import {academicStatus,financeStatus,formatMoney} from '@/modules/portal/contracts';

type Snapshot={profile:PersonalProfile|null;courses:PersonalCourse[];teachers:PersonalTeacher[];schedule:PersonalSchedule[];grades:PersonalGrade[];orders:PersonalOrder[];payments:PersonalPayment[];groups:PersonalCourse[];announcements:PersonalAnnouncement[]};
const empty:Snapshot={profile:null,courses:[],teachers:[],schedule:[],grades:[],orders:[],payments:[],groups:[],announcements:[]};
function calendarNow(timeZone:string){
 try{const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return {date:`${values.year}-${values.month}-${values.day}`,minute:Number(values.hour)*60+Number(values.minute)}}catch{return null}
}

function usePersonalSnapshot(institutionId:string,kind:'student'|'teacher'){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[updatedAt,setUpdatedAt]=useState('');
 const active=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  active.current?.abort();const controller=new AbortController();active.current=controller;
  setSnapshot(null);setLoading(true);setError('');setUpdatedAt('');
  try{
   if(!navigator.onLine)throw new Error('OFFLINE');
   const base=`/api/v1/institutions/${institutionId}/portal/${kind}`;
   const response=await fetch(base+'/profile',{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw new Error('ACCESS');
   const profile=(await response.json()).data as PersonalProfile|null;
   const resources=kind==='student'?['courses','teachers','schedule','grades','orders','payments','announcements'] as const:['groups','schedule'] as const;
   const entries=await Promise.all(resources.map(async resource=>[resource,(await readCollection(base+'/'+resource,{signal:controller.signal})).data] as const));
   if(!controller.signal.aborted){setSnapshot({...empty,...Object.fromEntries(entries),profile});setUpdatedAt(new Date().toLocaleString('es-MX'))}
  }catch{if(!controller.signal.aborted)setError(navigator.onLine?'No se pudo consultar tu información. Tu acceso pudo cambiar; actualiza o inicia sesión nuevamente.':'Sin conexión. Reconecta para consultar información vigente.')}
  finally{if(!controller.signal.aborted)setLoading(false)}
 },[institutionId,kind]);
 useEffect(()=>{
  const focus=()=>{if(document.visibilityState==='visible')void refresh()};
  const offline=()=>{active.current?.abort();setSnapshot(null);setUpdatedAt('');setLoading(false);setError('Sin conexión. Reconecta para consultar información vigente.')};
  void refresh();window.addEventListener('focus',focus);window.addEventListener('online',focus);window.addEventListener('offline',offline);
  return ()=>{active.current?.abort();window.removeEventListener('focus',focus);window.removeEventListener('online',focus);window.removeEventListener('offline',offline)};
 },[refresh]);
 return {snapshot,loading,error,updatedAt,refresh};
}

export function PersonalTable<T extends {id:string}>({rows,columns,label,searchText}:{rows:T[];columns:{label:string;render:(row:T)=>ReactNode}[];label:string;searchText?:(row:T)=>string}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(0);
 const filtered=searchText?rows.filter(row=>searchText(row).toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX'))):rows;
 const last=Math.max(0,Math.ceil(filtered.length/20)-1),current=Math.min(page,last),visible=filtered.slice(current*20,current*20+20);
 return <div className="space-y-4">
  {searchText&&<label className="block space-y-2 text-sm font-medium">Buscar en {label.toLocaleLowerCase('es-MX')}<Input type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0)}} placeholder="Escribe para buscar"/></label>}
  {visible.length?<><SiiScrollRegion label={label}><Table scrollable={false}><TableHeader><TableRow>{columns.map(column=><TableHead key={column.label}>{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(row=><TableRow key={row.id}>{columns.map(column=><TableCell key={column.label}>{column.render(row)}</TableCell>)}</TableRow>)}</TableBody></Table></SiiScrollRegion>
   <nav aria-label={`Paginación de ${label}`} className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{filtered.length} registros · Página {current+1} de {last+1}</p><div className="flex gap-2"><Button variant="outline" disabled={current===0} onClick={()=>setPage(current-1)}>Anterior</Button><Button variant="outline" disabled={current===last} onClick={()=>setPage(current+1)}>Siguiente</Button></div></nav>
  </>:<SiiEmptyView icon="book" title="Sin registros para mostrar" description={query?'Prueba otra búsqueda.':'No hay registros oficiales disponibles en esta consulta.'}/>}</div>;
}
function Schedule({rows,teachers,timeZone}:{rows:PersonalSchedule[];teachers:PersonalTeacher[];timeZone:string}){
 const [week,setWeek]=useState(()=>calendarNow(timeZone)?.date??'');
 const dates=weekDates(week),visible=rows.filter(row=>dates.includes(row.date));
 return <div className="space-y-4"><label className="block max-w-xs space-y-2 font-medium">Semana a consultar<Input type="date" value={week} onChange={event=>setWeek(event.target.value)}/></label><p className="text-sm text-muted-foreground">Programación registrada por la institución · Zona horaria: {timeZone}. Las cancelaciones y cambios aparecen con su estado.</p>
  <AcademicWeek week={week} occurrences={visible.map(row=>({...row,teacherName:teachers.filter(teacher=>teacher.sectionId===row.sectionId).map(teacher=>teacher.firstName+' '+teacher.lastName).join(', ')}))} emptyDescription="La institución no tiene clases registradas para ti en esta semana. Consulta otra fecha o solicita a coordinación revisar tu programación."/></div>;
}
function Profile({profile}:{profile:PersonalProfile}){return <Card><CardHeader><CardTitle>Mi perfil institucional</CardTitle></CardHeader><CardContent className="space-y-4"><dl className="grid gap-4 sm:grid-cols-2">{[['Nombre',profile.firstName+' '+profile.lastName],['Matrícula / número de empleado',profile.enrollmentNumber??profile.employeeNumber],['Programa',profile.programName],['Estado académico',academicStatus[profile.status]??profile.status],['Correo institucional',profile.institutionalEmail??'No registrado'],['Correo de acceso verificado',profile.verifiedEmail??'Sin correo verificado']].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold">{value??'No registrado'}</dd></div>)}</dl><p className="text-sm text-muted-foreground">Control Escolar conserva los datos académicos oficiales. Solicita a tu institución cualquier corrección.</p><Link className="sii-outline-button" href="/dashboard/security">Contraseña, MFA y sesiones</Link></CardContent></Card>}
function Statements({orders,payments}:{orders:PersonalOrder[];payments:PersonalPayment[]}){return <div className="space-y-6"><p className="text-sm text-muted-foreground">Consulta informativa de cargos y pagos registrados en Caja. Los pagos electrónicos requieren una pasarela institucional configurada; aquí se muestran abonos externos confirmados.</p>
 <h2 className="text-lg font-semibold">Órdenes de pago</h2><PersonalTable label="Órdenes de pago" rows={orders} searchText={row=>row.orderNumber+' '+row.feeTypeName} columns={[{label:'Orden / concepto',render:row=><><strong>{row.feeTypeName}</strong><p className="break-all text-xs text-muted-foreground">{row.orderNumber}</p></>},{label:'Importe',render:row=>formatMoney(row.totalAmountCents,row.currency)},{label:'Pagado',render:row=>formatMoney(row.paidAmountCents,row.currency)},{label:'Saldo',render:row=>formatMoney(['pending','partially_paid'].includes(row.status)?row.totalAmountCents-row.paidAmountCents:0,row.currency)},{label:'Estado',render:row=>financeStatus[row.status]??row.status},{label:'Fecha límite',render:row=>row.dueDate?new Date(row.dueDate).toLocaleDateString('es-MX'):'Sin fecha registrada'}]}/>
 <h2 className="text-lg font-semibold">Movimientos registrados</h2><PersonalTable label="Pagos registrados" rows={payments} columns={[{label:'Movimiento',render:row=><span className="break-all">{row.transactionNumber}</span>},{label:'Fecha',render:row=>new Date(row.createdAt).toLocaleString('es-MX')},{label:'Importe',render:row=>formatMoney(row.amountCents,row.currency)},{label:'Medio',render:row=>row.paymentMethod==='cash'?'Efectivo':row.paymentMethod==='transfer'?'Transferencia':row.paymentMethod},{label:'Referencia',render:row=>row.reference??'Sin referencia'}]}/></div>}
function downloadHistory(rows:PersonalGrade[]){
 // Spreadsheet formula prefixes are escaped even though values originate from official catalogs.
 const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
 const lines=[['CONSULTA INFORMATIVA — NO ES UN DOCUMENTO OFICIAL'],['Periodo','Clave','Materia','Grupo','Créditos','Calificación publicada','Versión','Fecha de publicación'],...rows.map(row=>[row.termName,row.courseCode,row.courseName,row.sectionCode,row.credits,(row.scoreHundredths/100).toFixed(2),row.version,row.publishedAt])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(line=>line.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download='historial-informativo.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function PersonalPortal({institutionId,institutionName,kind}:{institutionId:string;institutionName:string;kind:'student'|'teacher'}){
 const {snapshot,loading,error,updatedAt,refresh}=usePersonalSnapshot(institutionId,kind);
 const student=kind==='student',profile=snapshot?.profile;
 const calendar=profile?calendarNow(profile.timeZone):null;
 const upcoming=snapshot?.schedule.filter(row=>calendar&&(row.date>calendar.date||row.date===calendar.date&&row.startMinute>=calendar.minute)&&row.state!=='CANCELLED').sort((a,b)=>a.date.localeCompare(b.date)||a.startMinute-b.startMinute).slice(0,5)??[];
 return <div className="sii-workspace space-y-6"><SiiPageIntro eyebrow={student?'PORTAL ESTUDIANTIL':'PORTAL DOCENTE'} title={student?'Mi vida universitaria':'Mi docencia'} description={institutionName} actions={<Button variant="outline" disabled={loading} onClick={()=>void refresh()} aria-label="Actualizar mi información">{loading?'Consultando…':'Actualizar'}</Button>}/>
  <nav aria-label="Contexto del portal" className="flex flex-wrap gap-3 text-sm"><Link className="font-semibold text-primary underline" href="/dashboard">Cambiar institución</Link><Link className="font-semibold text-primary underline" href={`/dashboard/institutions/${institutionId}`}>Mis accesos institucionales</Link><Link className="font-semibold text-primary underline" href="/dashboard/security">Cuenta y seguridad</Link></nav>
  {error&&<div role="alert" className="sii-catalog-error">{error} <Button variant="outline" onClick={()=>void refresh()}>Reintentar consulta</Button></div>}
  {loading&&<SiiSkeleton label="Consultando tu información institucional"/>}
  {snapshot&&!profile&&<SiiEmptyView icon="registry" title={student?'Expediente aún sin vincular':'Perfil docente aún sin vincular'} description="Tu acceso está vigente. La institución debe vincular tu cuenta con el registro oficial para mostrar información académica."/>}
  {snapshot&&profile&&<>
   <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{student?'Estudiante':'Docente'} · {academicStatus[profile.status]??profile.status}</p><h2 className="mt-1 text-xl font-semibold">{profile.firstName} {profile.lastName}</h2><p className="mt-1 text-sm">{profile.enrollmentNumber??profile.employeeNumber}{profile.programName?' · '+profile.programName:''}</p></div>
   <Tabs defaultValue={student?'home':'groups'} className="min-w-0 space-y-5">
    <TabsList aria-label={student?'Consultas estudiantiles':'Consultas docentes'} className="sii-workspace-tabs flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
     {(student?[['home','Mi inicio'],['courses','Mis materias'],['teachers','Mis docentes'],['grades','Calificaciones e historial'],['schedule','Mi horario'],['orders','Mi estado de cuenta'],['profile','Mi perfil']]:[['groups','Mis grupos'],['schedule','Mi horario'],['profile','Mi perfil']]).map(([value,label])=><TabsTrigger key={value} value={value} className="min-h-11">{label}</TabsTrigger>)}
    </TabsList>
    {student&&<TabsContent value="home" className="space-y-5">
     <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><SiiMetricTile label="Materias inscritas" value={snapshot.courses.filter(row=>row.enrollmentStatus==='enrolled').length} caption="Inscripciones oficiales registradas" icon="book"/><SiiMetricTile label="Calificaciones publicadas" value={snapshot.grades.length} caption="Resultados oficiales disponibles" icon="grades"/><SiiMetricTile label="Órdenes por cubrir" value={snapshot.orders.filter(row=>['pending','partially_paid'].includes(row.status)).length} caption="Consulta el detalle en Mi estado de cuenta" icon="services"/></div>
     <Card><CardHeader><CardTitle>Próximas clases registradas</CardTitle></CardHeader><CardContent>{upcoming.map(row=><div key={row.id} className="border-b py-3 last:border-0"><strong>{row.courseName}</strong><p className="text-sm text-muted-foreground">{row.date} · {academicClock(row.startMinute)}–{academicClock(row.endMinute)} · {row.roomCode} · {row.campusName}</p></div>)}{!upcoming.length&&<p>{calendar?'No tienes próximas clases registradas.':'La institución debe configurar una zona horaria válida para calcular las próximas clases.'}</p>}</CardContent></Card>
     <Card><CardHeader><CardTitle>Avisos institucionales</CardTitle></CardHeader><CardContent>{snapshot.announcements.length?snapshot.announcements.map(notice=><article key={notice.id} className="space-y-2 border-b py-3 last:border-0"><h3 className="font-semibold">{notice.title}</h3><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{notice.body}</p></article>):<p>No hay avisos publicados vigentes.</p>}</CardContent></Card>
     <p className="text-sm text-muted-foreground">El semestre y los promedios reglamentarios requieren su registro y reglas institucionales. No se deducen a partir del número de materias.</p>
    </TabsContent>}
    <TabsContent value={student?'courses':'groups'}><PersonalTable rows={student?snapshot.courses:snapshot.groups} label={student?'Materias inscritas':'Grupos asignados'} searchText={row=>row.courseName+' '+row.courseCode+' '+row.sectionCode+' '+row.termName} columns={[{label:'Materia',render:row=><><strong>{row.courseName}</strong><p className="text-sm text-muted-foreground">{row.courseCode} · {row.credits} créditos</p></>},{label:'Grupo / periodo',render:row=><>{row.sectionCode}<p className="text-sm text-muted-foreground">{row.termName}</p></>},{label:student?'Inscripción':'Lista oficial',render:row=>student?(academicStatus[row.enrollmentStatus??'']??row.enrollmentStatus):`${row.enrolledCount??0} inscritos`},{label:student?'Estado del grupo':'Evaluación',render:row=>student?(academicStatus[row.sectionStatus]??row.sectionStatus):<><p>{row.published?'Acta publicada':'Captura pendiente'}</p><Link className="font-semibold text-primary underline" aria-label={`Abrir evaluación de ${row.sectionCode}`} href={`/dashboard/institutions/${institutionId}/grading?sectionId=${row.id}`}>Abrir evaluación</Link></>} ]}/></TabsContent>
    {student&&<TabsContent value="teachers"><PersonalTable label="Docentes asignados" rows={snapshot.teachers} searchText={row=>row.firstName+' '+row.lastName+' '+row.courseName} columns={[{label:'Docente',render:row=><strong>{row.firstName} {row.lastName}</strong>},{label:'Materia',render:row=>row.courseName},{label:'Grupo',render:row=>row.sectionCode},{label:'Periodo',render:row=>row.termName}]}/></TabsContent>}
    {student&&<TabsContent value="grades" className="space-y-4"><p className="text-sm text-muted-foreground">Calificaciones finales publicadas en escala de 0 a 10. Las capturas privadas del docente no se muestran. Esta consulta no sustituye una constancia ni un kárdex certificado.</p><Button variant="outline" disabled={!snapshot.grades.length} onClick={()=>downloadHistory(snapshot.grades)}>Descargar historial informativo</Button><PersonalTable label="Historial académico" rows={snapshot.grades} searchText={row=>row.courseName+' '+row.termName+' '+row.courseCode} columns={[{label:'Periodo',render:row=>row.termName},{label:'Materia',render:row=><>{row.courseCode} · {row.courseName}</>},{label:'Créditos',render:row=>row.credits},{label:'Calificación',render:row=><strong>{(row.scoreHundredths/100).toFixed(2)}</strong>},{label:'Publicación',render:row=>`v${row.version} · ${new Date(row.publishedAt).toLocaleDateString('es-MX')}`}]}/></TabsContent>}
    <TabsContent value="schedule"><Schedule rows={snapshot.schedule} teachers={snapshot.teachers} timeZone={profile.timeZone}/></TabsContent>
    {student&&<TabsContent value="orders"><Statements orders={snapshot.orders} payments={snapshot.payments}/></TabsContent>}
    <TabsContent value="profile"><Profile profile={profile}/><div className="mt-4 rounded-lg border p-4 text-sm"><h3 className="font-semibold">Historial de asistencia de Compañero</h3><p className="mt-1 text-muted-foreground">La consulta de asistencia requiere el contrato de lectura y la autorización del servicio Compañero. Este portal todavía no dispone de esa conexión.</p></div></TabsContent>
   </Tabs>
   <p className="text-xs text-muted-foreground">Última consulta: {updatedAt}. Al actualizar se vuelven a validar tus permisos y vínculos.</p>
  </>}
 </div>;
}
