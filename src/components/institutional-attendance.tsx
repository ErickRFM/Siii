'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {InstitutionalHistory} from '@/integrations/companion/institutional-history';
import {ASSURANCE_CHANGED_EVENT} from '@/shared/auth/assurance-events';
import {hasAnyCapability,useInstitutionCapabilities} from './institution-capabilities';
import {PersonalTable} from './personal-table';
import {Button} from './ui/button';
import {NativeSelect} from './ui/native-select';
import {SiiEmptyView,SiiSkeleton} from './ui/sii-kit';
const decisions={present:'Presente',late:'Retardo',absent:'Ausente'};
const classStates={performed:'Realizada · cierre docente',cancelled:'Cancelada',pending:'Pendiente de cierre confirmado',open:'Pase abierto'};
export default function InstitutionalAttendance({institutionId,session,kind}:{institutionId:string;session:string;kind:'student'|'teacher'}){
 const permissions=useInstitutionCapabilities(),allowed=hasAnyCapability(permissions.data,kind==='student'?'student.self.read':'teacher.self.read');
 const scope=JSON.stringify({institutionId,session,kind,permissions:permissions.data});
 const [view,setView]=useState<'classes'|'attendance'>(kind==='teacher'?'classes':'attendance');
 const [filter,setFilter]=useState({scope,status:'',classStatus:'',subject:'',term:''}),[page,setPage]=useState({scope,index:1});
 const selected=filter.scope===scope?filter.status:'',classStatus=filter.scope===scope?filter.classStatus:'',subject=filter.scope===scope?filter.subject:'',term=filter.scope===scope?filter.term:'',index=page.scope===scope?page.index:1;
 const requestScope=JSON.stringify({scope,view,selected,classStatus,subject,term,index});
 const [state,setState]=useState<{scope:string;loading:boolean;error:string;data:InstitutionalHistory|null}>({scope:requestScope,loading:true,error:'',data:null});
 const active=useRef<AbortController|null>(null);
 const clear=useCallback(()=>{active.current?.abort();setState({scope:requestScope,loading:false,error:'Actualiza para comprobar tu acceso vigente.',data:null})},[requestScope]);
 const refresh=useCallback(async()=>{
  active.current?.abort();const controller=new AbortController();active.current=controller;
  setState({scope:requestScope,loading:true,error:'',data:null});
  try{
   if(permissions.loading)return;
   if(!allowed)throw Error('Tu acceso cambió. Inicia sesión nuevamente.');
   const query=new URLSearchParams({page:String(index)});if(view==='attendance'&&selected)query.set('status',selected);if(view==='classes'&&classStatus)query.set('classStatus',classStatus);if(subject)query.set('subject',subject);if(term)query.set('term',term);
   const response=await fetch(`/api/v1/institutions/${institutionId}/institutional-attendance/${kind}?${query}`,{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error(response.status===503?'El archivo institucional está pendiente de activación.':response.status===401||response.status===403?'Tu acceso cambió. Inicia sesión nuevamente.':'No se pudo consultar el archivo institucional.');
   if(response.headers.get('x-siii-attendance-session')!==session)throw Error('Tu sesión cambió. Vuelve a abrir esta página.');
   const data=(await response.json()).data as InstitutionalHistory;
   if(!controller.signal.aborted)setState({scope:requestScope,loading:false,error:'',data});
  }catch(error){if(!controller.signal.aborted)setState({scope:requestScope,loading:false,error:error instanceof Error?error.message:'Consulta no disponible.',data:null})}
  finally{if(active.current===controller)active.current=null}
 },[requestScope,permissions.loading,allowed,index,view,selected,classStatus,subject,term,institutionId,kind,session]);
 useEffect(()=>{
  const visible=()=>{if(document.visibilityState==='visible')void refresh();else clear()};const focus=()=>void refresh();
  const logout=(event:SubmitEvent)=>{const form=event.target;if(form instanceof HTMLFormElement){const url=new URL(form.action,location.href);if(url.origin===location.origin&&url.pathname==='/api/v1/auth/logout')clear()}};
  void refresh();window.addEventListener('focus',focus);window.addEventListener('blur',clear);window.addEventListener('offline',clear);window.addEventListener(ASSURANCE_CHANGED_EVENT,clear);document.addEventListener('visibilitychange',visible);document.addEventListener('submit',logout,true);
  return()=>{active.current?.abort();window.removeEventListener('focus',focus);window.removeEventListener('blur',clear);window.removeEventListener('offline',clear);window.removeEventListener(ASSURANCE_CHANGED_EVENT,clear);document.removeEventListener('visibilitychange',visible);document.removeEventListener('submit',logout,true)};
 },[refresh,clear]);
 const current=state.scope===requestScope?state:{loading:true,error:'',data:null},data=current.data;
 const update=(values:Partial<typeof filter>)=>{setFilter({scope,status:selected,classStatus,subject,term,...values});setPage({scope,index:1})};
 const values=data?(view==='classes'?[['Asignadas',data.classes.metrics.scheduled],['Realizadas',data.classes.metrics.performed],['Pendientes',data.classes.metrics.pending],['Canceladas',data.classes.metrics.cancelled]]:[['Presente',data.metrics.present],['Retardo',data.metrics.late],['Ausente',data.metrics.absent],['Asistencia validada',data.metrics.attendancePercentage===null?'Sin decisiones':data.metrics.attendancePercentage+'%']]):[];
 return <section className="sii-panel space-y-4 p-5" aria-label="Archivo institucional de asistencia">
  <div className="flex flex-wrap gap-2" role="group" aria-label="Consulta institucional"><Button variant={view==='classes'?'default':'outline'} aria-pressed={view==='classes'} onClick={()=>{setView('classes');setPage({scope,index:1})}}>Clases</Button><Button variant={view==='attendance'?'default':'outline'} aria-pressed={view==='attendance'} onClick={()=>{setView('attendance');setPage({scope,index:1})}}>Asistencia</Button><Button variant="outline" onClick={()=>void refresh()} disabled={current.loading}>Actualizar</Button></div>
  <p className="text-sm text-muted-foreground">{view==='classes'?'Las clases realizadas cuentan con cierre confirmado por el docente.':'El porcentaje incluye presentes y retardos entre decisiones docentes. Las clases canceladas y las revisiones pendientes se excluyen.'}</p>
  {data&&<div className="grid gap-3 sm:grid-cols-3">
   <label className="space-y-2 text-sm font-medium">Materia<NativeSelect value={subject} onChange={event=>update({subject:event.target.value})}><option value="">Todas las materias</option>{[...new Map(data.filters.map(row=>[row.subject_id,row.subject_name])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</NativeSelect></label>
   <label className="space-y-2 text-sm font-medium">Periodo<NativeSelect value={term} onChange={event=>update({term:event.target.value})}><option value="">Todos los periodos</option>{[...new Map(data.filters.map(row=>[row.term_id,row.term_name])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</NativeSelect></label>
   <label className="space-y-2 text-sm font-medium">Estado<NativeSelect value={view==='classes'?classStatus:selected} onChange={event=>update(view==='classes'?{classStatus:event.target.value}:{status:event.target.value})}><option value="">Todos</option>{view==='classes'?Object.entries(classStates).map(([value,label])=><option key={value} value={value}>{label}</option>):<><option value="present">Presente</option><option value="late">Retardo</option><option value="absent">Ausente</option><option value="pending">Revisión pendiente</option><option value="cancelled">Clase cancelada</option></>}</NativeSelect></label>
  </div>}
  {current.loading&&<SiiSkeleton label="Consultando archivo institucional"/>}{current.error&&<p role="alert" className="sii-catalog-error">{current.error}</p>}
  {data&&<><dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">{values.map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}</dl>
   {view==='classes'?(data.classes.records.length?<PersonalTable key={requestScope} label="Historial de clases" rows={data.classes.records} columns={[
    {label:'Fecha',render:row=>row.occurrenceDate},{label:'Materia y grupo',render:row=><>{row.subjectName}<p className="text-sm text-muted-foreground">{row.groupName}</p></>},{label:'Docente',render:row=>row.teacherNames||'Asignación no disponible'},{label:'Periodo',render:row=>row.termName},{label:'Estado',render:row=>classStates[row.status]},
   ]}/>:<SiiEmptyView icon="registry" title="Sin clases disponibles" description="No hay clases oficiales en esta consulta."/>):
   (data.records.length?<PersonalTable key={requestScope} label={kind==='student'?'Mi asistencia institucional':'Asistencia de mis grupos'} rows={data.records} columns={[
    {label:'Fecha',render:row=>row.occurrenceDate},{label:'Materia y grupo',render:row=><>{row.subjectName}<p className="text-sm text-muted-foreground">{row.groupName}</p></>},...(kind==='teacher'?[{label:'Estudiante',render:(row:InstitutionalHistory['records'][number])=>row.studentName??'No disponible'}]:[]),{label:'Periodo',render:row=>row.termName},{label:'Clase',render:row=>row.occurrenceState==='CANCELLED'?'Cancelada':'Programada'},{label:'Decisión docente',render:row=>row.disposition?decisions[row.disposition]:'Revisión pendiente'},{label:'Registro',render:row=>new Date(row.receivedAtEpochSeconds*1000).toLocaleString('es-MX')},{label:'Revisión',render:row=>'recordRevision' in row?String(row.recordRevision):'Sin versión'},
   ]}/>:<SiiEmptyView icon="registry" title="Sin resultados aceptados" description="No hay resultados institucionales en esta consulta. Esto no indica ausencia ni presencia."/>)}
   <nav className="flex items-center justify-between gap-3" aria-label="Páginas del archivo"><Button variant="outline" disabled={index===1||current.loading} onClick={()=>setPage({scope,index:index-1})}>Anterior</Button><span>Página {index}</span><Button variant="outline" disabled={!(view==='classes'?data.classes.hasMore:data.hasMore)||current.loading} onClick={()=>setPage({scope,index:index+1})}>Siguiente</Button></nav>
  </>}
 </section>;
}
