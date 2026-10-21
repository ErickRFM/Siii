'use client';
import SiiScrollRegion from './sii-scroll-region';
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
import { useCallback,useEffect,useState,type FormEvent } from 'react';
type Row={id:string;institutionId:string;code?:string;name?:string;firstName?:string;lastName?:string;status:string;capacity?:number;enrollmentNumber?:string;employeeNumber?:string;sectionId?:string;studentId?:string;teacherId?:string};
type Part='sections'|'enrollments'|'assignments';
export default function AcademicOperations({institutionId}:{institutionId:string}){
 const {ask,confirmation}=useInstitutionConfirmation();
 const base=`/api/v1/institutions/${institutionId}`;
 const [sections,setSections]=useState<Row[]>([]),[students,setStudents]=useState<Row[]>([]),[teachers,setTeachers]=useState<Row[]>([]);
 const [terms,setTerms]=useState<Row[]>([]),[courses,setCourses]=useState<Row[]>([]),[enrollments,setEnrollments]=useState<Row[]>([]),[assignments,setAssignments]=useState<Row[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);
  const paths=['sections','registry/students','registry/teachers','academic/terms','academic/courses','enrollments','assignments'];
  try {
   const response=await Promise.all(paths.map(path=>readCollection<Row>(`${base}/${path}`)));
   const [a,b,c,d,e,f,g]=response.map(r=>r.data);
   setSections(a);setStudents(b);setTeachers(c);setTerms(d);setCourses(e);setEnrollments(f);setAssignments(g);setError('');
  }catch{setError('No se pudieron cargar todos los datos; verifica permisos y migraciones.')}
  finally{setLoading(false)}
 },[base]);
 useEffect(()=>{void refresh()},[refresh]);
 async function submit(event:FormEvent<HTMLFormElement>,part:Part){
  event.preventDefault();if(busy)return;
  const form=event.currentTarget,values=new FormData(form);
  const payload=part==='sections'?{termId:String(values.get('termId')??''),courseId:String(values.get('courseId')??''),code:String(values.get('code')??''),capacity:Number(values.get('capacity')??0)}
   :part==='enrollments'?{studentId:String(values.get('studentId')??''),sectionId:String(values.get('sectionId')??'')}
   :{teacherId:String(values.get('teacherId')??''),sectionId:String(values.get('sectionId')??'')};
  setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch(`${base}/${part}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!r.ok){const json=await r.json().catch(()=>({error:{code:'SERVER_ERROR'}})) as {error?:{code?:string}};throw Error(json.error?.code??'SERVER_ERROR')}
   form.reset();setNotice('Operación realizada y auditada.');await refresh();
  }catch(e){setError(userFacingError(e instanceof Error?e.message:'ERROR'))}
  finally{setBusy(false)}
 }
 async function revoke(part:Part,row:Row){
  if(!await ask({title:'Confirmar cambio académico',description:part==='sections'?'La sección se cerrará y quedará auditada.':'La inscripción o asignación se revocará y quedará auditada.',confirmLabel:'Aplicar cambio',destructive:true}))return;
  setBusy(true);setError('');
  const payload={id:row.id,status:part==='sections'?'closed':'withdrawn'};
  try{
   const r=await fetch(`${base}/${part}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!r.ok)throw Error('No autorizado o registro ya modificado');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Error inesperado')}finally{setBusy(false)}
 }
 const activeSections=sections.filter(x=>x.status==='open');
 const option=(records:Row[],type:'student'|'teacher'|'section'|'term'|'course')=>
  records.map(x=><option value={x.id} key={x.id}>{type==='student'?x.enrollmentNumber:type==='teacher'?x.employeeNumber:x.code} · {x.firstName?x.firstName+' '+x.lastName:x.name??'Sección'}</option>);
 return <div className="sii-academic">
 {confirmation}
  <div className="sii-catalog-summary"><div><span className="sii-section-kicker">OPERACIÓN ACADÉMICA</span><h2>Oferta, grupos e inscripciones</h2>
   <p>Operaciones reales con validación de institución, cupos y asignaciones.</p></div>
   <button type="button" className="sii-outline-button" disabled={loading||busy} onClick={()=>void refresh()}>Actualizar</button></div>
  {error&&<div role="alert" className="sii-catalog-error"><p>{error}</p><button type="button" className="sii-outline-button" disabled={loading||busy} onClick={()=>void refresh()}>Actualizar datos</button></div>}
  {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
  {loading?<div role="status" className="sii-panel">Consultando operaciones institucionales…</div>:<>
   <div className="sii-catalog-layout">
    <section className="sii-panel sii-catalog-table-panel">
     <h3>Secciones abiertas y cerradas</h3><SiiScrollRegion label="Tabla de secciones, desplazamiento horizontal">
      <table className="sii-catalog-table"><thead><tr><th>Sección</th><th>Periodo / materia</th><th>Cupo</th><th>Estado</th><th>Acción</th></tr></thead>
       <tbody>{sections.map(row=><tr key={row.id}><td>{row.code}</td>
        <td>{terms.find(t=>t.id===(row as Row & {termId?:string}).termId)?.name??'—'} · {courses.find(c=>c.id===(row as Row & {courseId?:string}).courseId)?.name??'—'}</td>
        <td>{row.capacity}</td><td>{row.status}</td><td><button disabled={busy||row.status!=='open'} type="button" onClick={()=>void revoke('sections',row)}>Cerrar</button></td>
       </tr>)}</tbody></table></SiiScrollRegion>
     {!sections.length&&<p>No hay secciones. Registra la primera con periodo y materia activos.</p>}
    </section>
    <aside className="sii-panel sii-catalog-create"><h3>Nueva sección</h3><form className="sii-catalog-form" onSubmit={e=>void submit(e,'sections')}>
     <label>Periodo<select name="termId" required defaultValue=""><option value="" disabled>Selecciona periodo</option>{option(terms.filter(x=>x.status==='active'),'term')}</select></label>
     <label>Materia<select name="courseId" required defaultValue=""><option value="" disabled>Selecciona materia</option>{option(courses.filter(x=>x.status==='active'),'course')}</select></label>
     <label>Grupo / sección<input name="code" required minLength={2} maxLength={32} placeholder="9A"/></label>
     <label>Cupo<input name="capacity" type="number" min="1" max="500" required defaultValue="30"/></label>
     <button type="submit" className="sii-submit" disabled={busy||!terms.length||!courses.length}>Crear sección</button></form></aside>
   </div>
   <div className="sii-catalog-layout">
    <section className="sii-panel sii-catalog-create"><h3>Inscribir estudiante</h3>
     <form className="sii-catalog-form" onSubmit={e=>void submit(e,'enrollments')}>
      <label>Estudiante<select name="studentId" required defaultValue=""><option value="" disabled>Selecciona alumno activo</option>{option(students.filter(x=>x.status==='active'),'student')}</select></label>
      <label>Sección<select name="sectionId" required defaultValue=""><option value="" disabled>Selecciona sección</option>{option(activeSections,'section')}</select></label>
      <button type="submit" className="sii-submit" disabled={busy||!students.length||!activeSections.length}>Confirmar inscripción</button>
     </form><h4>Inscripciones</h4>{enrollments.map(x=><div key={x.id}><span>{students.find(s=>s.id===x.studentId)?.enrollmentNumber??'Alumno'} · {sections.find(s=>s.id===x.sectionId)?.code??'Sección'} — {x.status}</span>
      {x.status==='enrolled'&&<button type="button" disabled={busy} onClick={()=>void revoke('enrollments',x)}>Retirar</button>}</div>)}</section>
    <section className="sii-panel sii-catalog-create"><h3>Asignar docente</h3>
     <form className="sii-catalog-form" onSubmit={e=>void submit(e,'assignments')}>
      <label>Docente<select name="teacherId" required defaultValue=""><option value="" disabled>Selecciona docente activo</option>{option(teachers.filter(x=>x.status==='active'),'teacher')}</select></label>
      <label>Sección<select name="sectionId" required defaultValue=""><option value="" disabled>Selecciona sección</option>{option(sections.filter(x=>x.status!=='archived'),'section')}</select></label>
      <button type="submit" className="sii-submit" disabled={busy||!teachers.length||!sections.length}>Asignar</button>
     </form><h4>Asignaciones vigentes</h4>{assignments.map(x=><div key={x.id}><span>{teachers.find(t=>t.id===x.teacherId)?.employeeNumber??'Docente'} · {sections.find(s=>s.id===x.sectionId)?.code??'Sección'}</span>
      <button type="button" disabled={busy} onClick={()=>void revoke('assignments',x)}>Revocar</button></div>)}</section>
   </div>
  </>}
 </div>;
}
