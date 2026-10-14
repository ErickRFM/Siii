'use client';
import { useCallback,useEffect,useState,type FormEvent } from 'react';
type Section={id:string;code:string;courseName:string;status:string};
type Component={id:string;code:string;title:string;weight:number};
type Score={id:string;componentId:string;studentId:string;scoreHundredths:number};
type Student={studentId:string;enrollmentNumber:string;firstName:string;lastName:string};
type Publication={id:string;version:number;publishedAt:string};
type Snapshot={components:Component[];scores:Score[];publications:Publication[];roster:Student[]};

export default function TeacherGradebook({institutionId}:{institutionId:string}){
 const base=`/api/v1/institutions/${institutionId}/grading`;
 const [sections,setSections]=useState<Section[]>([]);
 const [sectionId,setSectionId]=useState('');
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`${base}/sections`,{signal:controller.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error('NO_SECTION_ACCESS');return r.json() as Promise<{data:Section[]}>})
   .then(v=>{if(controller.signal.aborted)return;setSections(v.data);setSectionId(s=>s||v.data[0]?.id||'')})
   .catch(()=>{if(!controller.signal.aborted)setError('No fue posible consultar tus grupos docentes.')})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return ()=>controller.abort();
 },[base]);
 const refresh=useCallback(async(id:string)=>{
  if(!id){setSnapshot(null);return}
  setLoading(true);setError('');
  try{
   const r=await fetch(`${base}?sectionId=${encodeURIComponent(id)}`,{cache:'no-store'});
   if(!r.ok)throw Error('GRADEBOOK_FORBIDDEN');
   setSnapshot(await r.json() as Snapshot);
  }catch{setError('No se pudo obtener el libro de calificaciones de esta sección.');setSnapshot(null)}
  finally{setLoading(false)}
 },[base]);
 useEffect(()=>{void refresh(sectionId)},[sectionId,refresh]);
 async function command(payload:Record<string,unknown>){
  setSaving(true);setError('');setNotice('');
  try{
   const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!r.ok){const info=await r.json().catch(()=>({error:{code:'REQUEST_FAILED'}})) as {error?:{code?:string}};throw Error(info.error?.code??'REQUEST_FAILED')}
   setNotice('Operación guardada correctamente.');await refresh(sectionId);return true;
  }catch(e){setError('No se pudo completar la operación: '+(e instanceof Error?e.message:'ERROR'));return false}
  finally{setSaving(false)}
 }
 async function addComponent(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!sectionId||saving)return;
  const form=event.currentTarget,values=new FormData(form);
  const ok=await command({kind:'component',sectionId,code:String(values.get('code')??''),title:String(values.get('title')??''),weight:Number(values.get('weight'))});
  if(ok)form.reset();
 }
 async function saveScore(componentId:string,studentId:string,raw:string){
  const n=Number(raw);
  if(!Number.isFinite(n)||n<0||n>10||!/^\d{1,2}(\.\d{1,2})?$/.test(raw.trim())){
   setError('La calificación debe estar entre 0 y 10, con máximo dos decimales.');return;
  }
  await command({kind:'score',componentId,studentId,scoreHundredths:Math.round(n*100)});
 }
 async function publish(){
  if(!snapshot||!sectionId||snapshot.publications.length||saving)return;
  if(!window.confirm('¿Publicar el acta oficial? No podrás editar las notas después de publicarla.'))return;
  await command({kind:'publish',sectionId,operationId:crypto.randomUUID()});
 }
 const published=!!snapshot?.publications.length;
 const weight=snapshot?.components.reduce((sum,c)=>sum+c.weight,0)??0;
 return <div className="sii-academic">
  <div className="sii-catalog-summary"><div><span className="sii-section-kicker">DOCENCIA · EVALUACIÓN</span>
   <h2>Libro de calificaciones</h2><p>Escala 0–10. Los componentes deben completar 100 % para emitir un acta.</p></div></div>
  {error&&<p className="sii-catalog-error" role="alert">{error}</p>}
  {notice&&<p className="sii-catalog-notice" role="status">{notice}</p>}
  <section className="sii-panel sii-catalog-create">
   <label>Materia y grupo asignado<select value={sectionId} onChange={e=>setSectionId(e.target.value)} disabled={saving||loading}>
    {!sections.length&&<option value="">Sin secciones asignadas</option>}
    {sections.map(s=><option key={s.id} value={s.id}>{s.courseName} · {s.code}</option>)}
   </select></label>
  </section>
  {loading?<p role="status">Consultando calificaciones…</p>:snapshot&&<>
   <div className="sii-catalog-layout">
    <section className="sii-panel sii-catalog-table-panel"><h3>Evaluaciones · {weight} % / 100 %</h3>
     <div className="sii-catalog-scroll"><table className="sii-catalog-table">
      <thead><tr><th scope="col">Clave</th><th scope="col">Evaluación</th><th scope="col">Ponderación</th></tr></thead>
      <tbody>{snapshot.components.map(c=><tr key={c.id}><td>{c.code}</td><td>{c.title}</td><td>{c.weight} %</td></tr>)}</tbody></table></div>
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
    <div className="sii-catalog-scroll"><table className="sii-catalog-table"><thead><tr><th scope="col">Matrícula / alumno</th>
     {snapshot.components.map(c=><th key={c.id} scope="col">{c.code} ({c.weight} %)</th>)}</tr></thead>
     <tbody>{snapshot.roster.map(student=><tr key={student.studentId}><td><strong>{student.enrollmentNumber}</strong><small>{student.firstName} {student.lastName}</small></td>
      {snapshot.components.map(c=>{const score=snapshot.scores.find(s=>s.studentId===student.studentId&&s.componentId===c.id);
       return <td key={c.id}>{published?<span>{score?(score.scoreHundredths/100).toFixed(2):'—'}</span>:
        <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const v=new FormData(form);void saveScore(c.id,student.studentId,String(v.get('grade')??''))}}>
         <label>Nota<input aria-label={`${student.enrollmentNumber} · ${c.title}`} type="number" name="grade" min="0" max="10" step="0.01" defaultValue={score?(score.scoreHundredths/100).toFixed(2):''} required/></label>
         <button type="submit" disabled={saving}>Guardar</button></form>}</td>})}</tr>)}</tbody></table></div>}
   </section>
   <section className="sii-panel sii-catalog-create"><h3>Publicación oficial</h3>
    <p>{published?'Acta emitida y registrada.':'Revisa ponderaciones, notas faltantes y listado de estudiantes antes de publicar.'}</p>
    {published?<p role="status">Publicada el {new Date(snapshot.publications[0].publishedAt).toLocaleString('es-MX')}</p>:
    <button className="sii-submit" type="button" disabled={saving||weight!==100||!snapshot.roster.length}
     onClick={()=>void publish()}>Publicar acta oficial</button>}
   </section>
  </>}
 </div>;
}
