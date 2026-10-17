'use client';
import {readCollection} from '@/shared/client/read-collection';
import { useCallback,useEffect,useState,type FormEvent } from 'react';
type Module='announcements'|'requests'|'workshops';
type RecordRow={id:string;title?:string;body?:string;description?:string;summary?:string;requestType?:string;studentId?:string;teacherId?:string;status:string;startsAt?:string};
type Person={id:string;firstName:string;lastName:string;enrollmentNumber?:string;employeeNumber?:string;status:string};
const tabs:{id:Module;label:string}[]=[
 {id:'announcements',label:'Avisos institucionales'},
 {id:'requests',label:'Trámites estudiantiles'},
 {id:'workshops',label:'Talleres'},
];
export default function UniversityServices({institutionId}:{institutionId:string}){
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
  }catch(e){setError('Operación rechazada: '+(e instanceof Error?e.message:'ERROR'));return false}
  finally{setSaving(false)}
 }
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(saving)return;
  const form=e.currentTarget,v=new FormData(form);
  const payload=tab==='announcements'?{title:String(v.get('title')??''),body:String(v.get('body')??'')}
  :tab==='requests'?{studentId:String(v.get('studentId')??''),requestType:String(v.get('requestType')??''),summary:String(v.get('summary')??'')}
  :{title:String(v.get('title')??''),description:String(v.get('description')??''),
   teacherId:String(v.get('teacherId')??''),startsAt:new Date(String(v.get('startsAt')??'')).toISOString(),
   endsAt:new Date(String(v.get('endsAt')??'')).toISOString(),capacity:Number(v.get('capacity'))};
  if(await execute(payload))form.reset();
 }
 async function advance(row:RecordRow,status:string){
  let payload:Record<string,unknown>={id:row.id,status};
  if(tab==='requests'){
   const reason=window.prompt(`Motivo para ${status} (obligatorio):`);
   if(!reason||reason.trim().length<6)return;
   payload={...payload,decisionReason:reason.trim()};
  }else if(!window.confirm(`¿Confirmas cambiar el estado a ${status}?`))return;
  await execute(payload,'PATCH');
 }
 return <div className="sii-academic">
  <div className="sii-catalog-tabs" role="tablist" aria-label="Servicios universitarios">
   {tabs.map(t=><button key={t.id} role="tab" type="button" aria-selected={tab===t.id}
    className={tab===t.id?'sii-catalog-tab sii-catalog-tab--active':'sii-catalog-tab'}
    onClick={()=>{setTab(t.id);setNotice('');setError('')}}>{t.label}</button>)}
  </div>
  {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
  {error&&<p role="alert" className="sii-catalog-error">{error}</p>}
  {peopleError&&<div role="alert"><p>{peopleError}</p><button type="button" className="sii-outline-button" onClick={()=>setPeopleRevision(value=>value+1)}>Reintentar personas</button></div>}
  <div className="sii-catalog-layout">
   <section className="sii-panel sii-catalog-table-panel">
    <h2>{tabs.find(t=>t.id===tab)?.label}</h2>
    {loading?<p role="status">Cargando datos institucionales…</p>:rows.length===0?<p>No hay registros en esta sección.</p>:
    <div className="sii-catalog-scroll"><table className="sii-catalog-table">
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
     </tr>)}</tbody></table></div>}
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
     <button type="submit" className="sii-submit" disabled={saving||(tab==='requests'&&!students.length)||(tab==='workshops'&&!teachers.length)}>Crear borrador / solicitud</button>
    </form></aside>
  </div>
 </div>;
}
