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
import {SecurityActionLink} from './institution-capabilities';
import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import {gradebookCell,gradebookScope,useGradebookDrafts} from './teacher-gradebook-drafts';
type Section={id:string;code:string;courseName:string;status:string};
type Component={id:string;code:string;title:string;weight:number};
type Score={id:string;componentId:string;studentId:string;scoreHundredths:number};
type Student={studentId:string;enrollmentNumber:string;firstName:string;lastName:string};
type Publication={id:string;version:number;publishedAt:string};
type Snapshot={components:Component[];scores:Score[];publications:Publication[];roster:Student[]};

export default function TeacherGradebook({institutionId}:{institutionId:string}){
 const {ask,confirmation}=useInstitutionConfirmation();
 const base=`/api/v1/institutions/${institutionId}/grading`;
 const {drafts,writeDraft,readDraft,confirmDraft,clearDrafts,hasDrafts}=useGradebookDrafts(institutionId,ask);
 const [sections,setSections]=useState<Section[]>([]);
 const [sectionQuery,setSectionQuery]=useState(0);
 const [sectionId,setSectionId]=useState('');
 const scope=gradebookScope(institutionId,sectionId);
 const [loaded,setLoaded]=useState<{scope:string;value:Snapshot}|null>(null);
 const snapshot=loaded?.scope===scope?loaded.value:null;
 const loadedScope=useRef(''),activeScope=useRef(''),generation=useRef(0),request=useRef<AbortController|null>(null);
 const operation=useRef<'save'|'publish'|null>(null);
 const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[saving,setSaving]=useState(false),[publishing,setPublishing]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const retirePrivate=useCallback(()=>{
  generation.current++;request.current?.abort();loadedScope.current='';activeScope.current='';
  setLoaded(null);setSections([]);clearDrafts();setLoading(false);setRefreshing(false);
 },[clearDrafts]);
 useEffect(()=>{
  function logout(event:SubmitEvent){
   const form=event.target;
   if(form instanceof HTMLFormElement&&new URL(form.action,location.href).origin===location.origin&&new URL(form.action,location.href).pathname==='/api/v1/auth/logout')retirePrivate();
  }
  document.addEventListener('submit',logout,true);
  return ()=>document.removeEventListener('submit',logout,true);
 },[retirePrivate]);
 useEffect(()=>{
  const controller=new AbortController();
  setSections([]);setSectionId('');setLoaded(null);loadedScope.current='';setLoading(true);setError('');setNotice('');
  void fetch(`${base}/sections`,{signal:controller.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok){if((r.status===401||r.status===403)&&!controller.signal.aborted)retirePrivate();throw Error('NO_SECTION_ACCESS')}return r.json() as Promise<{data:Section[]}>})
   .then(v=>{if(controller.signal.aborted)return;setSections(v.data);setSectionId(s=>s||v.data[0]?.id||'')})
   .catch(()=>{if(!controller.signal.aborted)setError('No fue posible consultar tus grupos docentes.')})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return ()=>controller.abort();
 },[base,retirePrivate,sectionQuery]);
 const refresh=useCallback(async(id:string)=>{
  const target=gradebookScope(institutionId,id);
  if(!id||activeScope.current!==target)return false;
  request.current?.abort();const controller=new AbortController();request.current=controller;
  const version=++generation.current;
  const current=()=>!controller.signal.aborted&&generation.current===version&&activeScope.current===target;
  if(loadedScope.current!==target)setLoading(true);
  setRefreshing(true);setError('');
  try{
   const r=await fetch(`${base}?sectionId=${encodeURIComponent(id)}`,{signal:controller.signal,cache:'no-store'});
   if(!current())return false;
   if(!r.ok){
    if(r.status===401||r.status===403){retirePrivate();setError(userFacingError(r.status===401?'UNAUTHENTICATED':'FORBIDDEN'));return false;}
    throw Error('GRADEBOOK_FAILED');
   }
   const value=await r.json() as Snapshot;
   if(!current())return false;
   loadedScope.current=target;setLoaded({scope:target,value});return true;
  }catch{if(current())setError('No se pudo obtener el libro de calificaciones de esta sección.');return false;}
  finally{if(current()){setLoading(false);setRefreshing(false);}}
 },[base,institutionId,retirePrivate]);
 useEffect(()=>{
  activeScope.current=scope;void refresh(sectionId);
  return ()=>{request.current?.abort();};
 },[scope,sectionId,refresh]);
 async function changeSection(id:string){
  const previous=activeScope.current;
  if(operation.current||id===sectionId)return;
  if(hasDrafts(previous)&&!await ask({title:'Cambiar de grupo con notas sin guardar',description:'Las capturas se conservarán en esta página, separadas por grupo. Aún no están guardadas en el servidor.',confirmLabel:'Cambiar de grupo'}))return;
  if(activeScope.current!==previous||operation.current)return;
  generation.current++;request.current?.abort();activeScope.current=gradebookScope(institutionId,id);
  setSectionId(id);setError('');setNotice('');
 }
 async function command(payload:Record<string,unknown>,confirmed?:()=>void){
  if(operation.current)return false;
  const target=scope;
  operation.current=payload.kind==='publish'?'publish':'save';
  setSaving(true);setPublishing(operation.current==='publish');setError('');setNotice('');
  try{
   const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(activeScope.current!==target)return false;
   if(!r.ok){
    const info=await r.json().catch(()=>({error:{code:'REQUEST_FAILED'}})) as {error?:{code?:string}};
    if(activeScope.current!==target)return false;
    if(r.status===401||r.status===403){retirePrivate();setError(userFacingError(info.error?.code??(r.status===401?'UNAUTHENTICATED':'FORBIDDEN')));return false;}
    throw Error(info.error?.code??'REQUEST_FAILED');
   }
   // Refresh first: keep the sent value visible until the authoritative snapshot arrives.
   const refreshed=await refresh(sectionId);
   if(activeScope.current!==target)return false;
   if(refreshed){confirmed?.();setNotice('Operación guardada correctamente.');}
   return true;
  }catch(e){if(activeScope.current===target)setError(userFacingError(e instanceof Error?e.message:'ERROR'));return false}
  finally{operation.current=null;setSaving(false);setPublishing(false)}
 }
 async function addComponent(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!sectionId||saving)return;
  const form=event.currentTarget,values=new FormData(form);
  const ok=await command({kind:'component',sectionId,code:String(values.get('code')??''),title:String(values.get('title')??''),weight:Number(values.get('weight'))});
  if(ok)form.reset();
 }
 async function saveScore(componentId:string,studentId:string,raw:string){
  if(operation.current||!snapshot||snapshot.publications.length)return;
  const n=Number(raw);
  if(!Number.isFinite(n)||n<0||n>10||!/^\d{1,2}(\.\d{1,2})?$/.test(raw.trim())){
   setError('La calificación debe estar entre 0 y 10, con máximo dos decimales.');return;
  }
  const key=gradebookCell(scope,studentId,componentId),sent=readDraft(key);
  await command({kind:'score',componentId,studentId,scoreHundredths:Math.round(n*100)},()=>confirmDraft(key,sent?.revision));
 }
 async function publish(){
  if(!snapshot||!sectionId||snapshot.publications.length||operation.current||hasDrafts(scope))return;
  const target=scope;
  if(!await ask({title:'Publicar acta oficial',description:'La publicación es definitiva. No podrás modificar notas sin una rectificación autorizada.',confirmLabel:'Publicar acta',destructive:true}))return;
  if(activeScope.current!==target||operation.current)return;
  if(hasDrafts(target)){setError('Hay notas sin guardar. Guarda las capturas antes de publicar el acta.');return;}
  await command({kind:'publish',sectionId,operationId:crypto.randomUUID()});
 }
 const published=!!snapshot?.publications.length;
 const pending=Array.from(drafts.values()).filter(d=>d.scope===scope);
 const excluded=pending.filter(d=>published||!snapshot?.roster.some(s=>s.studentId===d.studentId)||!snapshot.components.some(c=>c.id===d.componentId));
 async function discardDraft(key:string,revision:number){
  const target=scope;
  if(await ask({title:'Descartar captura local',description:'Esta nota no se guardará ni cambiará el acta oficial. El descarte sólo elimina esta captura de la página.',confirmLabel:'Descartar captura',destructive:true})&&activeScope.current===target)confirmDraft(key,revision);
 }
 const weight=snapshot?.components.reduce((sum,c)=>sum+c.weight,0)??0;
 return <div className="sii-academic">
 {confirmation}
  <SiiSectionHeader workspace eyebrow="DOCENCIA · EVALUACIÓN" title="Libro de calificaciones"
    description="Escala 0–10. Los componentes deben completar 100 % para emitir un acta."/>
  {error&&<div className="sii-catalog-error" role="alert"><p>{error}</p><button type="button" className="sii-outline-button" onClick={()=>{if(sections.length)void refresh(sectionId);else setSectionQuery(v=>v+1);}}>Reintentar consulta</button></div>}
  {notice&&<p className="sii-catalog-notice" role="status">{notice}</p>}
  <section className="sii-panel sii-catalog-create">
   <label>Materia y grupo asignado<select value={sectionId} onChange={e=>void changeSection(e.target.value)} disabled={saving||loading}>
    {!sections.length&&<option value="">Sin secciones asignadas</option>}
    {sections.map(s=><option key={s.id} value={s.id}>{s.courseName} · {s.code}</option>)}
   </select></label>
  </section>
  {loading?<p role="status">Consultando calificaciones…</p>:snapshot&&<>
   {refreshing&&<p role="status">Actualizando calificaciones…</p>}
   <div className="sii-catalog-layout">
    <section className="sii-panel sii-catalog-table-panel"><h3>Evaluaciones · {weight} % / 100 %</h3>
     <SiiScrollRegion label="Tabla de evaluación, desplazamiento horizontal"><table className="sii-catalog-table">
      <thead><tr><th scope="col">Clave</th><th scope="col">Evaluación</th><th scope="col">Ponderación</th></tr></thead>
      <tbody>{snapshot.components.map(c=><tr key={c.id}><td>{c.code}</td><td>{c.title}</td><td>{c.weight} %</td></tr>)}</tbody></table></SiiScrollRegion>
     {published?<p role="status">Acta publicada. Los cambios requieren una rectificación autorizada.</p>:null}
    </section>
    {!published&&<aside className="sii-panel sii-catalog-create"><h3>Agregar evaluación</h3>
     <form className="sii-catalog-form" onSubmit={e=>void addComponent(e)}>
      <label>Clave<input name="code" minLength={2} maxLength={30} required placeholder="P1"/></label>
      <label>Descripción<input name="title" minLength={3} required placeholder="Primer parcial"/></label>
      <label>Ponderación (%)<input type="number" min={1} max={100-weight} name="weight" required/></label>
      <button type="submit" className="sii-submit" disabled={saving||weight===100}>Guardar evaluación</button>
     </form></aside>}
   </div>
   <section className="sii-panel sii-catalog-table-panel"><h3>Captura por estudiante</h3>
    {!snapshot.roster.length?<p>No hay estudiantes inscritos en esta sección.</p>:
    <SiiScrollRegion label="Tabla de calificaciones, desplazamiento horizontal"><table className="sii-catalog-table"><thead><tr><th scope="col">Matrícula / alumno</th>
     {snapshot.components.map(c=><th key={c.id} scope="col">{c.code} ({c.weight} %)</th>)}</tr></thead>
     <tbody>{snapshot.roster.map(student=><tr key={student.studentId}><td><strong>{student.enrollmentNumber}</strong><small>{student.firstName} {student.lastName}</small></td>
      {snapshot.components.map(c=>{const score=snapshot.scores.find(s=>s.studentId===student.studentId&&s.componentId===c.id);
       return <td key={c.id}>{published?<span>{score?(score.scoreHundredths/100).toFixed(2):'—'}</span>:
        <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const v=new FormData(form);void saveScore(c.id,student.studentId,String(v.get('grade')??''))}}>
         <label>Nota<input aria-label={`${student.enrollmentNumber} · ${c.title}`} type="number" name="grade" min="0" max="10" step="0.01"
          value={drafts.get(gradebookCell(scope,student.studentId,c.id))?.raw??(score?(score.scoreHundredths/100).toFixed(2):'')}
          onChange={e=>{if(operation.current!=='publish')writeDraft(scope,student.studentId,c.id,`${student.enrollmentNumber} · ${c.title}`,e.target.value);}} disabled={publishing} required/></label>
         <button type="submit" disabled={saving}>Guardar</button></form>}</td>})}</tr>)}</tbody></table></SiiScrollRegion>}
   </section>
   {excluded.length>0&&<section aria-label={published?'Captura local no incluida en el acta':'Captura local fuera del listado'} className="sii-panel">
    <h3>{published?'Captura local no incluida en el acta':'Captura local fuera del listado'}</h3>
    <p>Estas capturas locales no son notas oficiales. El listado o el acta cambió; se conservan para consulta o descarte explícito. No se pueden guardar desde aquí.</p>
    <ul>{excluded.map(d=>{const key=gradebookCell(scope,d.studentId,d.componentId);return <li key={key}>{d.label}: {d.raw||'(vacío)'}{' '}
     <button type="button" className="sii-outline-button" aria-label={`Descartar captura ${d.label}`} onClick={()=>void discardDraft(key,d.revision)}>Descartar captura local</button></li>;})}</ul>
   </section>}
   <section className="sii-panel sii-catalog-create"><h3>Publicación oficial</h3><p>La publicación requiere verificación reciente de tu autenticador.</p><SecurityActionLink returnTo={`/dashboard/institutions/${institutionId}/grading`}/>
    <p>{published?'Acta emitida y registrada.':'Revisa ponderaciones, notas faltantes y listado de estudiantes antes de publicar.'}</p>
    {!published&&pending.length>0&&<p role="status">Hay {pending.length} notas sin guardar en este grupo. Guárdalas antes de publicar.</p>}
    {published?<p role="status">Publicada el {new Date(snapshot.publications[0].publishedAt).toLocaleString('es-MX')}</p>:
    <button className="sii-submit" type="button" disabled={saving||refreshing||pending.length>0||weight!==100||!snapshot.roster.length}
     onClick={()=>void publish()}>Publicar acta oficial</button>}
   </section>
  </>}
 </div>;
}
