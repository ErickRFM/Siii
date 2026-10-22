'use client';
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
import { useCallback,useEffect,useState,type FormEvent,type KeyboardEvent } from 'react';
type Module='announcements'|'requests'|'workshops';
type RecordRow={id:string;title?:string;body?:string;description?:string;summary?:string;requestType?:string;studentId?:string;teacherId?:string;status:string;startsAt?:string};
type Person={id:string;firstName:string;lastName:string;enrollmentNumber?:string;employeeNumber?:string;status:string};
const tabs:{id:Module;label:string}[]=[
 {id:'announcements',label:'Avisos institucionales'},
 {id:'requests',label:'Trámites estudiantiles'},
 {id:'workshops',label:'Talleres'},
];
export default function UniversityServices({institutionId}:{institutionId:string}){
 const {ask,confirmation}=useInstitutionConfirmation();
 const base=`/api/v1/institutions/${institutionId}`;
 const [tab,setTab]=useState<Module>('announcements'),[rows,setRows]=useState<RecordRow[]>([]);
 const [students,setStudents]=useState<Person[]>([]),[teachers,setTeachers]=useState<Person[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [peopleError,setPeopleError]=useState(''),[peopleRevision,setPeopleRevision]=useState(0),[peopleLoading,setPeopleLoading]=useState(true);
 const fetchRows=useCallback(async(t:Module)=>{
  setLoading(true);setError('');
  try{
   const r=await fetch(`${base}/${t}`,{cache:'no-store'});
   if(!r.ok)throw Error('UNAVAILABLE');
   const data=await r.json() as {data:RecordRow[]};
   setRows(data.data);
  }catch{setRows([]);setError('No fue posible cargar esta área. Comprueba tus permisos.')}
  finally{setLoading(false)}
 },[base]);
 useEffect(()=>{void fetchRows(tab)},[tab,fetchRows]);
 useEffect(()=>{
  const controller=new AbortController();setPeopleError('');setPeopleLoading(true);
  void Promise.all(['students','teachers'].map(resource=>readCollection<Person>(`${base}/registry/${resource}`,{signal:controller.signal})))
   .then(([studentsResult,teachersResult])=>{if(!controller.signal.aborted){setStudents(studentsResult.data);setTeachers(teachersResult.data)}})
   .catch(()=>{if(!controller.signal.aborted){setStudents([]);setTeachers([]);setPeopleError('No se pudieron consultar estudiantes y docentes. Vuelve a intentar.')}})
   .finally(()=>{if(!controller.signal.aborted)setPeopleLoading(false)});
  return ()=>controller.abort();
 },[base,peopleRevision]);
 async function execute(payload:Record<string,unknown>,method:'POST'|'PATCH'='POST'){
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(`${base}/${tab}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!response.ok){const info=await response.json().catch(()=>({error:{code:'UNKNOWN'}})) as {error?:{code?:string}};
    throw Error(info.error?.code??'OPERATION_DENIED')}
   setNotice('Operación guardada y auditada.');await fetchRows(tab);return true;
  }catch(e){setError(userFacingError(e instanceof Error?e.message:'ERROR'));return false}
  finally{setSaving(false)}
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
  if(await execute(payload))form.reset();
 }
 function navigateTabs(event:KeyboardEvent<HTMLButtonElement>,current:Module){
  const keys=['ArrowRight','ArrowLeft','Home','End'];if(!keys.includes(event.key))return;
  event.preventDefault();const index=tabs.findIndex(item=>item.id===current);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:(index+tabs.length-1)%tabs.length;
  const target=tabs[next].id;setTab(target);setError('');setNotice('');
  event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('#services-tab-'+target)?.focus();
 }
 async function advance(row:RecordRow,status:string){
  let payload:Record<string,unknown>={id:row.id,status};
  if(tab==='requests'){
   const reason=await ask({title:'Registrar decisión de trámite',description:`Confirma el cambio a ${status}. La decisión quedará auditada.`,reasonLabel:'Motivo de la decisión',minReasonLength:6,confirmLabel:'Registrar decisión',destructive:status==='REJECTED'});
   if(!reason)return;
   payload={...payload,decisionReason:reason.trim()};
  }else if(!await ask({title:'Cambiar estado del servicio',description:`Se aplicará el estado ${status} y quedará registrado.`,confirmLabel:'Aplicar cambio',destructive:status==='ARCHIVED'||status==='CANCELLED'}))return;
  await execute(payload,'PATCH');
 }
 return <div className="sii-academic">
 {confirmation}
  <SiiSectionHeader workspace eyebrow="SERVICIOS UNIVERSITARIOS" title="Gestión de servicios"
    description="Avisos, trámites y talleres de tu institución con acceso controlado."/>
  <div className="sii-catalog-tabs" role="tablist" aria-label="Servicios universitarios">
   {tabs.map(t=><button key={t.id} id={"services-tab-"+t.id} aria-controls="services-panel" role="tab" type="button" tabIndex={tab===t.id?0:-1} onKeyDown={e=>navigateTabs(e,t.id)} aria-selected={tab===t.id}
    className={tab===t.id?'sii-catalog-tab sii-catalog-tab--active':'sii-catalog-tab'}
    onClick={()=>{setTab(t.id);setNotice('');setError('')}}>{t.label}</button>)}
  </div>
  {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
  {error&&<div role="alert" className="sii-catalog-error"><p>{error}</p><button type="button" className="sii-outline-button" disabled={loading} onClick={()=>void fetchRows(tab)}>Reintentar consulta</button></div>}
  {peopleError&&<div role="alert"><p>{peopleError}</p><button type="button" className="sii-outline-button" onClick={()=>setPeopleRevision(value=>value+1)}>Reintentar personas</button></div>}
  <div id="services-panel" role="tabpanel" aria-labelledby={"services-tab-"+tab} tabIndex={0} aria-busy={loading} className="sii-catalog-layout">
   <section className="sii-panel sii-catalog-table-panel">
    <h2>{tabs.find(t=>t.id===tab)?.label}</h2>
    {loading?<p role="status">Cargando datos institucionales…</p>:rows.length===0?<p>No hay registros en esta sección.</p>:
    <SiiScrollRegion label="Tabla de servicios, desplazamiento horizontal"><table className="sii-catalog-table">
     <thead><tr><th>Información</th><th>Estado</th><th>Operación</th></tr></thead>
     <tbody>{rows.map(row=><tr key={row.id}>
      <td><strong>{row.title??row.summary??row.requestType}</strong><small>{row.description??row.body??''}</small></td>
      <td>{row.status}</td>
      <td>
       {tab==='announcements'&&row.status==='DRAFT'&&<button type="button" disabled={saving} onClick={()=>void advance(row,'PUBLISHED')}>Publicar</button>}
       {tab==='announcements'&&row.status==='PUBLISHED'&&<button type="button" disabled={saving} onClick={()=>void advance(row,'ARCHIVED')}>Archivar</button>}
       {tab==='workshops'&&row.status==='DRAFT'&&<button type="button" disabled={saving} onClick={()=>void advance(row,'PUBLISHED')}>Publicar</button>}
       {tab==='workshops'&&row.status==='PUBLISHED'&&<button type="button" disabled={saving} onClick={()=>void advance(row,'CANCELLED')}>Cancelar</button>}
       {tab==='requests'&&row.status==='SUBMITTED'&&<button type="button" disabled={saving} onClick={()=>void advance(row,'IN_REVIEW')}>Revisar</button>}
       {tab==='requests'&&row.status==='IN_REVIEW'&&<><button type="button" disabled={saving} onClick={()=>void advance(row,'APPROVED')}>Aprobar</button><button type="button" disabled={saving} onClick={()=>void advance(row,'REJECTED')}>Rechazar</button></>}
       {tab==='requests'&&['APPROVED','REJECTED'].includes(row.status)&&<button type="button" disabled={saving} onClick={()=>void advance(row,'CLOSED')}>Cerrar trámite</button>}
      </td>
     </tr>)}</tbody></table></SiiScrollRegion>}
    {rows.length>=200&&<p>Se muestran hasta 200 registros; la búsqueda y paginación del servidor están pendientes.</p>}
   </section>
   <aside className="sii-panel sii-catalog-create"><h3>Nuevo registro</h3>
    <form className="sii-catalog-form" onSubmit={e=>void submit(e)}>
     {tab==='announcements'&&<><label>Título<input name="title" minLength={3} required/></label><label>Mensaje<textarea name="body" minLength={10} required rows={5}/></label></>}
     {tab==='requests'&&<><label>Alumno<select disabled={peopleLoading} name="studentId" defaultValue="" required><option value="" disabled>Seleccionar matrícula</option>
      {students.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.enrollmentNumber} · {x.firstName} {x.lastName}</option>)}</select></label>
      <label>Tipo de trámite<select name="requestType" defaultValue="CERTIFICATE"><option value="CERTIFICATE">Constancia</option><option value="ENROLLMENT_CHANGE">Cambio de inscripción</option>
       <option value="JUSTIFICATION">Justificante</option><option value="OTHER">Otro</option></select></label>
      <label>Solicitud<textarea name="summary" required minLength={10}/></label></>}
     {tab==='workshops'&&<><label>Título<input name="title" minLength={3} required/></label>
      <label>Descripción<textarea name="description" minLength={10} required/></label>
      <label>Facilitador<select disabled={peopleLoading} name="teacherId" defaultValue="" required><option value="" disabled>Seleccionar docente</option>
       {teachers.filter(x=>x.status==='active').map(x=><option key={x.id} value={x.id}>{x.employeeNumber} · {x.firstName} {x.lastName}</option>)}</select></label>
      <label>Inicio<input name="startsAt" type="datetime-local" required/></label><label>Fin<input name="endsAt" type="datetime-local" required/></label>
      <label>Cupo<input name="capacity" type="number" min={1} max={1000} defaultValue={25} required/></label></>}
     <button type="submit" className="sii-submit" disabled={saving||(tab==='requests'&&!students.length)||(tab==='workshops'&&!teachers.length)}>{saving?"Guardando…":"Crear borrador / solicitud"}</button>
    </form></aside>
  </div>
 </div>;
}
