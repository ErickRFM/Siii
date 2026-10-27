'use client';
import {CapabilityState,hasInstitutionCapability,useInstitutionCapabilities} from './institution-capabilities';
import {SiiDrawer} from './ui/sii-workspace';
import {SiiEmptyView} from '@/components/ui/sii-kit';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {NativeSelect} from '@/components/ui/native-select';

import SiiScrollRegion from './sii-scroll-region';
import {SiiSectionHeader} from './ui/sii-kit';
/** Convert service error codes to clear UI feedback; server decisions are authoritative. */
function userFacingError(code:string){
 const messages:Record<string,string>={
  UNAUTHENTICATED:'Tu sesión venció. Inicia sesión de nuevo.',
  FORBIDDEN:'Tu autorización cambió o no tienes permiso para esta operación. Actualiza el módulo.',
  MFA_REQUIRED:'Verifica tu autenticador desde Cuenta y seguridad y vuelve a intentar.',
  STEP_UP_REQUIRED:'Confirma tu identidad desde Cuenta y seguridad antes de continuar.',
  PASSWORD_CHANGE_REQUIRED:'Actualiza tu contraseña desde Cuenta y seguridad.',
  VALIDATION_ERROR:'Revisa los datos del formulario e intenta nuevamente.',
  INVALID_TRANSITION:'El registro cambió de estado. Actualiza el listado y vuelve a intentar.',
  NOT_FOUND:'El registro ya no existe o cambió. Actualiza el listado.',
  CONFLICT:'Los datos entran en conflicto con otros registros. Actualiza el listado.',
  SCHEDULE_CONFLICT:'El aula, horario o docente ya tiene una actividad en ese intervalo.',
 };
 return messages[code]??'No se pudo completar la operación. Conservamos tus datos; actualiza y vuelve a intentar.';
}

import {useInstitutionConfirmation} from './sii-confirmation';
import {readCollection} from '@/shared/client/read-collection';
import { useCallback,useEffect,useRef,useState,type FormEvent,type KeyboardEvent } from 'react';
type Module='announcements'|'requests'|'workshops';
type RecordRow={id:string;title?:string;body?:string;description?:string;summary?:string;requestType?:string;studentId?:string;teacherId?:string;status:string;startsAt?:string};
type Person={id:string;firstName:string;lastName:string;enrollmentNumber?:string;employeeNumber?:string;status:string};
const tabs:{id:Module;label:string}[]=[
 {id:'announcements',label:'Avisos institucionales'},
 {id:'requests',label:'Trámites estudiantiles'},
 {id:'workshops',label:'Talleres'},
];
export default function UniversityServices({institutionId}:{institutionId:string}){
 const {ask,confirmation,cancel:cancelConfirmation}=useInstitutionConfirmation();
 const {data:capabilities}=useInstitutionCapabilities();
 const allowed=['programs','courses','curricula','terms','campuses'].every(resource=>hasInstitutionCapability(capabilities,resource+'.manage'));
 const base=`/api/v1/institutions/${institutionId}`;
 const [createOpen,setCreateOpen]=useState(false),[dirty,setDirty]=useState(false);
 const [tab,setTab]=useState<Module>('announcements'),[rows,setRows]=useState<RecordRow[]>([]);
 const [students,setStudents]=useState<Person[]>([]),[teachers,setTeachers]=useState<Person[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [peopleError,setPeopleError]=useState(''),[peopleRevision,setPeopleRevision]=useState(0),[peopleLoading,setPeopleLoading]=useState(true);
 const rowsRequest=useRef<AbortController|null>(null),peopleRequest=useRef<AbortController|null>(null),writing=useRef(false);
 const fetchRows=useCallback(async(t:Module)=>{
  rowsRequest.current?.abort();const request=new AbortController();rowsRequest.current=request;setLoading(true);setError('');
  try{
   const r=await fetch(`${base}/${t}`,{cache:'no-store',signal:request.signal});
   if(!r.ok)throw Error('UNAVAILABLE');
   const data=await r.json() as {data:RecordRow[]};
   if(!request.signal.aborted)setRows(data.data);
  }catch{if(!request.signal.aborted){setRows([]);setError('No fue posible cargar esta área. Comprueba tus permisos.')}}
  finally{if(!request.signal.aborted)setLoading(false)}
 },[base]);
 useEffect(()=>{if(allowed)void fetchRows(tab);return ()=>rowsRequest.current?.abort()},[tab,fetchRows,allowed]);
 useEffect(()=>{
  if(!allowed)return;
  const controller=new AbortController();peopleRequest.current=controller;setPeopleError('');setPeopleLoading(true);
  void Promise.all(['students','teachers'].map(resource=>readCollection<Person>(`${base}/registry/${resource}`,{signal:controller.signal})))
   .then(([studentsResult,teachersResult])=>{if(!controller.signal.aborted){setStudents(studentsResult.data);setTeachers(teachersResult.data)}})
   .catch(()=>{if(!controller.signal.aborted){setStudents([]);setTeachers([]);setPeopleError('No se pudieron consultar estudiantes y docentes. Vuelve a intentar.')}})
   .finally(()=>{if(!controller.signal.aborted)setPeopleLoading(false)});
  return ()=>controller.abort();
 },[base,peopleRevision,allowed]);
 useEffect(()=>{
  if(allowed)return;
  rowsRequest.current?.abort();peopleRequest.current?.abort();cancelConfirmation();setRows([]);setStudents([]);setTeachers([]);setCreateOpen(false);setDirty(false);setNotice('');
 },[allowed,cancelConfirmation]);
 async function execute(payload:Record<string,unknown>,method:'POST'|'PATCH'='POST'){
  if(writing.current)return false;writing.current=true;setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(`${base}/${tab}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!response.ok){const info=await response.json().catch(()=>({error:{code:'UNKNOWN'}})) as {error?:{code?:string}};
    throw Error(info.error?.code??'OPERATION_DENIED')}
   setNotice('Operación guardada y auditada.');await fetchRows(tab);return true;
  }catch(e){setError(userFacingError(e instanceof Error?e.message:'ERROR'));return false}
  finally{writing.current=false;setSaving(false)}
 }
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(saving)return;
  const form=e.currentTarget,v=new FormData(form);
  if(tab==='workshops'&&new Date(String(v.get('endsAt'))).getTime()<=new Date(String(v.get('startsAt'))).getTime()){
   setError('La fecha de finalización debe ser posterior al inicio del taller.');return;
  }
  const payload=tab==='announcements'?{title:String(v.get('title')??''),body:String(v.get('body')??'')}
  :tab==='requests'?{studentId:String(v.get('studentId')??''),requestType:String(v.get('requestType')??''),summary:String(v.get('summary')??'')}
  :{title:String(v.get('title')??''),description:String(v.get('description')??''),
   teacherId:String(v.get('teacherId')??''),startsAt:new Date(String(v.get('startsAt')??'')).toISOString(),
   endsAt:new Date(String(v.get('endsAt')??'')).toISOString(),capacity:Number(v.get('capacity'))};
  if(await execute(payload)){form.reset();setCreateOpen(false);setDirty(false)}
 }
 function navigateTabs(event:KeyboardEvent<HTMLButtonElement>,current:Module){
  if(saving)return;
  const keys=['ArrowRight','ArrowLeft','Home','End'];if(!keys.includes(event.key))return;
  event.preventDefault();const index=tabs.findIndex(item=>item.id===current);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:(index+tabs.length-1)%tabs.length;
  const target=tabs[next].id;setTab(target);setError('');setNotice('');
  event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('#services-tab-'+target)?.focus();
 }
 async function advance(row:RecordRow,status:string){
  let payload:Record<string,unknown>={id:row.id,status};
  if(tab==='requests'){
   const reason=await ask({title:'Registrar decisión de trámite',description:`Confirma el cambio a ${status}. La decisión quedará auditada y el motivo será visible para el estudiante.`,reasonLabel:'Motivo de la decisión',minReasonLength:6,confirmLabel:'Registrar decisión',destructive:status==='REJECTED'});
   if(!reason)return;
   payload={...payload,decisionReason:reason.trim()};
  }else if(!await ask({title:'Cambiar estado del servicio',description:`Se aplicará el estado ${status} y quedará registrado.`,confirmLabel:'Aplicar cambio',destructive:status==='ARCHIVED'||status==='CANCELLED'}))return;
  await execute(payload,'PATCH');
 }
 async function closeCreate(){
  if(saving)return;
  if(dirty&&!await ask({title:'Descartar cambios sin guardar',description:'El formulario contiene cambios que todavía no se guardaron.',confirmLabel:'Descartar cambios',destructive:true}))return;
  setCreateOpen(false);setDirty(false);
 }
 if(!allowed)return <CapabilityState returnTo={`/dashboard/institutions/${institutionId}/services`}/>;
 return <div className="sii-academic sii-workspace sii-workspace--services siii-glass-workspace">
 {!createOpen&&confirmation}
  <SiiSectionHeader workspace eyebrow="SERVICIOS UNIVERSITARIOS" title="Gestión de servicios"
    description="Avisos, trámites y talleres de tu institución con acceso controlado." right={<Button disabled={loading||saving} onClick={()=>{setDirty(false);setError('');setCreateOpen(true)}}>Nuevo registro</Button>}/>
  <div className="sii-catalog-tabs" role="tablist" aria-label="Servicios universitarios">
   {tabs.map(t=><Button disabled={saving} variant="ghost" key={t.id} id={"services-tab-"+t.id} aria-controls="services-panel" role="tab" type="button" tabIndex={tab===t.id?0:-1} onKeyDown={e=>navigateTabs(e,t.id)} aria-selected={tab===t.id}
    className={tab===t.id?'sii-catalog-tab sii-catalog-tab--active':'sii-catalog-tab'}
    onClick={()=>{setTab(t.id);setNotice('');setError('')}}>{t.label}</Button>)}
  </div>
  {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
  {!createOpen&&error&&<div role="alert" className="sii-catalog-error"><p>{error}</p><Button variant="outline" type="button" className="sii-outline-button" disabled={loading} onClick={()=>void fetchRows(tab)}>Reintentar consulta</Button></div>}
  {peopleError&&<div role="alert"><p>{peopleError}</p><Button variant="outline" type="button" className="sii-outline-button" onClick={()=>setPeopleRevision(value=>value+1)}>Reintentar personas</Button></div>}
  <div id="services-panel" role="tabpanel" aria-labelledby={"services-tab-"+tab} tabIndex={0} aria-busy={loading} className="sii-services-list">
   <section className="sii-panel sii-catalog-table-panel">
    <div className="sii-catalog-toolbar"><h2>{tabs.find(t=>t.id===tab)?.label}</h2><Button variant="outline" type="button" disabled={loading||saving} onClick={()=>void fetchRows(tab)}>Actualizar servicios</Button></div>
    {loading?<p role="status">Cargando datos institucionales…</p>:rows.length===0?<SiiEmptyView icon="services" title="No hay registros en esta sección." description="El panel de alta permite preparar un aviso, trámite o taller según la sección elegida." action={<Button variant="outline" type="button" onClick={()=>{setDirty(false);setCreateOpen(true)}}>Ir al formulario</Button>}/>:
    <SiiScrollRegion label="Tabla de servicios, desplazamiento horizontal"><Table scrollable={false} className="sii-catalog-table">
     <TableHeader><TableRow><TableHead>Información</TableHead><TableHead>Estado</TableHead><TableHead>Operación</TableHead></TableRow></TableHeader>
     <TableBody>{rows.map(row=><TableRow key={row.id}>
      <TableCell><strong>{row.title??row.summary??row.requestType}</strong><small>{row.description??row.body??''}</small></TableCell>
      <TableCell>{row.status}</TableCell>
      <TableCell>
       {tab==='announcements'&&row.status==='DRAFT'&&<Button variant="outline" type="button" disabled={saving} onClick={()=>void advance(row,'PUBLISHED')}>Publicar</Button>}
       {tab==='announcements'&&row.status==='PUBLISHED'&&<Button variant="outline" type="button" disabled={saving} onClick={()=>void advance(row,'ARCHIVED')}>Archivar</Button>}
       {tab==='workshops'&&row.status==='DRAFT'&&<Button variant="outline" type="button" disabled={saving} onClick={()=>void advance(row,'PUBLISHED')}>Publicar</Button>}
       {tab==='workshops'&&row.status==='PUBLISHED'&&<Button variant="outline" type="button" disabled={saving} onClick={()=>void advance(row,'CANCELLED')}>Cancelar</Button>}
       {tab==='requests'&&row.status==='SUBMITTED'&&<Button variant="outline" type="button" disabled={saving} onClick={()=>void advance(row,'IN_REVIEW')}>Revisar</Button>}
       {tab==='requests'&&row.status==='IN_REVIEW'&&<><Button variant="outline" type="button" disabled={saving} onClick={()=>void advance(row,'APPROVED')}>Aprobar</Button><Button variant="outline" type="button" disabled={saving} onClick={()=>void advance(row,'REJECTED')}>Rechazar</Button></>}
       {tab==='requests'&&['APPROVED','REJECTED'].includes(row.status)&&<Button variant="outline" type="button" disabled={saving} onClick={()=>void advance(row,'CLOSED')}>Cerrar trámite</Button>}
      </TableCell>
     </TableRow>)}</TableBody></Table></SiiScrollRegion>}
    {rows.length>=200&&<p>Se muestran hasta 200 registros; la búsqueda y paginación del servidor están pendientes.</p>}
   </section>

  </div>
  <SiiDrawer open={createOpen} busy={saving} onOpenChange={open=>{if(!open)void closeCreate()}} title={tab==='announcements'?'Nuevo aviso':tab==='requests'?'Nueva solicitud':'Nuevo taller'} description="Prepara el registro y revisa los datos antes de guardar.">
   {confirmation}{error&&<p role="alert" className="sii-catalog-error">{error}</p>}
       <form className="sii-catalog-form" onSubmit={e=>void submit(e)} onChange={()=>setDirty(true)}><fieldset className="sii-form-fields" disabled={saving}>
     {tab==='announcements'&&<><label>Título<Input name="title" minLength={3} required/></label><label>Mensaje<Textarea name="body" minLength={10} required rows={5}/></label></>}
     {tab==='requests'&&<><label>Alumno<NativeSelect disabled={peopleLoading} name="studentId" defaultValue="" required><option value="" disabled>Seleccionar matrícula</option>
      {students.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.enrollmentNumber} · {x.firstName} {x.lastName}</option>)}</NativeSelect></label>
      <label>Tipo de trámite<NativeSelect name="requestType" defaultValue="CERTIFICATE"><option value="CERTIFICATE">Constancia</option><option value="ENROLLMENT_CHANGE">Cambio de inscripción</option>
       <option value="JUSTIFICATION">Justificante</option><option value="OTHER">Otro</option></NativeSelect></label>
      <label>Solicitud<Textarea name="summary" required minLength={10}/></label></>}
     {tab==='workshops'&&<><label>Título<Input name="title" minLength={3} required/></label>
      <label>Descripción<Textarea name="description" minLength={10} required/></label>
      <label>Facilitador<NativeSelect disabled={peopleLoading} name="teacherId" defaultValue="" required><option value="" disabled>Seleccionar docente</option>
       {teachers.filter(x=>x.status==='active').map(x=><option key={x.id} value={x.id}>{x.employeeNumber} · {x.firstName} {x.lastName}</option>)}</NativeSelect></label>
      <label>Inicio<Input name="startsAt" type="datetime-local" required/></label><label>Fin<Input name="endsAt" type="datetime-local" required/></label>
      <label>Cupo<Input name="capacity" type="number" min={1} max={1000} defaultValue={25} required/></label></>}
     <Button variant="default" type="submit" className="sii-submit" disabled={saving||(tab==='requests'&&!students.length)||(tab==='workshops'&&!teachers.length)}>{saving?"Guardando…":"Crear borrador / solicitud"}</Button>
    </fieldset></form>
  </SiiDrawer>
 </div>;
}
