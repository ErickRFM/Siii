'use client';
import {readCollection} from '@/shared/client/read-collection';
import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
type Kind='students'|'teachers';
type RecordRow={id:string;firstName:string;lastName:string;enrollmentNumber?:string;employeeNumber?:string;institutionalEmail?:string|null;status:string;programId?:string};
type Program={id:string;code:string;name:string;status:string};
export default function SchoolRegistry({institutionId}:{institutionId:string}){
 const [kind,setKind]=useState<Kind>('students');
 const [rows,setRows]=useState<RecordRow[]>([]);
 const [programs,setPrograms]=useState<Program[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [search,setSearch]=useState('');
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [history,setHistory]=useState<Array<string|null>>([null]);
 const activeRequest=useRef<AbortController|null>(null);
 const currentCursor=history[history.length-1];
 const base=`/api/v1/institutions/${institutionId}`;
 const refresh=useCallback(async(resource:Kind,cursor:string|null=null)=>{
  activeRequest.current?.abort();const controller=new AbortController();activeRequest.current=controller;
  setLoading(true);setError('');
  try{
   const query=new URLSearchParams({limit:'50'});if(cursor)query.set('cursor',cursor);
   const response=await fetch(`${base}/registry/${resource}?${query}`,{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('UNAVAILABLE');
   const json=await response.json() as {data:RecordRow[];page:{nextCursor:string|null}};
   if(!Array.isArray(json.data)||!json.page)throw Error('UNAVAILABLE');
   if(controller.signal.aborted)return false;
   setRows(json.data);setNextCursor(json.page.nextCursor);return true;
  }catch{if(!controller.signal.aborted){setError('No se pudo cargar el registro. Comprueba tu sesión o vuelve a intentar.');setRows([]);setNextCursor(null)}return false}
  finally{if(!controller.signal.aborted)setLoading(false)}
 },[base]);
 useEffect(()=>{setHistory([null]);setNextCursor(null);void refresh(kind);return()=>activeRequest.current?.abort()},[kind,refresh]);
 async function page(direction:'previous'|'next'){
  if(loading||saving)return;
  const destination=direction==='next'?nextCursor:history[history.length-2];
  if(destination===undefined||(direction==='next'&&!nextCursor))return;
  if(await refresh(kind,destination)){setHistory(previous=>direction==='next'?[...previous,destination]:previous.slice(0,-1));setSearch('')}
 }
 useEffect(()=>{
  const controller=new AbortController();
  void readCollection<Program>(`${base}/academic/programs`,{signal:controller.signal})
   .then((j:{data:Program[]})=>setPrograms(j.data.filter(x=>x.status==='active')))
   .catch(()=>{if(!controller.signal.aborted)setPrograms([])});
  return ()=>controller.abort();
 },[base]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving)return;
  const form=event.currentTarget,values=new FormData(form);
  const data={firstName:String(values.get('firstName')??'').trim(),
   lastName:String(values.get('lastName')??'').trim(),institutionalEmail:String(values.get('institutionalEmail')??'')};
  const payload=kind==='students'?{...data,enrollmentNumber:String(values.get('code')??''),programId:String(values.get('programId')??'')}:
   {...data,employeeNumber:String(values.get('code')??'')};
  setSaving(true);setError('');setNotice('');
  try{
   const r=await fetch(`${base}/registry/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!r.ok){const j=await r.json().catch(()=>({error:{code:'UNKNOWN'}})) as {error?:{code?:string}};throw Error(j.error?.code??'UNKNOWN')}
   form.reset();setNotice('Registro guardado y auditado en la institución actual.');setHistory([null]);await refresh(kind);
  }catch(e){setError('No se pudo guardar: '+(e instanceof Error?e.message:'ERROR'))}
  finally{setSaving(false)}
 }
 async function changeStatus(row:RecordRow){
  const next=row.status==='active'?'inactive':'active';
  if(!window.confirm(`¿Confirmas cambiar a ${next} este registro?`))return;
  setSaving(true);setError('');
  try{
   const r=await fetch(`${base}/registry/${kind}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,status:next})});
   if(!r.ok)throw Error('No se autorizó el cambio');
   await refresh(kind,currentCursor);
  }catch{setError('No se pudo cambiar el estado del registro.')}finally{setSaving(false)}
 }
 const filtered=rows.filter(r=>[r.firstName,r.lastName,r.enrollmentNumber,r.employeeNumber].join(' ').toLowerCase().includes(search.toLowerCase()));
 return <div className="sii-academic">
  <div className="sii-catalog-tabs" role="tablist" aria-label="Control escolar">
   {(['students','teachers'] as Kind[]).map(k=><button type="button" role="tab" key={k} aria-selected={kind===k} disabled={saving||loading} className={kind===k?'sii-catalog-tab sii-catalog-tab--active':'sii-catalog-tab'} onClick={()=>{setKind(k);setSearch('');setError('');setNotice('')}}>{k==='students'?'Estudiantes':'Docentes'}</button>)}
  </div>
  <div className="sii-catalog-summary"><div><span className="sii-section-kicker">CONTROL ESCOLAR</span>
   <h2>{kind==='students'?'Expedientes de estudiantes':'Plantilla docente'}</h2><p>Registros institucionales oficiales. La creación de cuentas de acceso es independiente.</p></div>
   <span className="sii-small-count">{loading?'Cargando…':`${rows.length} registros en esta página`}</span></div>
  {error&&<p role="alert" className="sii-catalog-error">{error}</p>}
  {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
  <div className="sii-catalog-layout">
   <section className="sii-panel sii-catalog-table-panel" aria-label="Listado oficial">
    <div className="sii-catalog-toolbar"><label htmlFor="school-search">Buscar en esta página</label>
     <input id="school-search" value={search} onChange={e=>setSearch(e.target.value)} type="search" placeholder="Matrícula, nombre o número de empleado"/>
     <button type="button" className="sii-outline-button" onClick={()=>void refresh(kind,currentCursor)} disabled={loading||saving}>Actualizar</button></div>
    {loading?<div className="sii-empty" role="status">Cargando registros…</div>:filtered.length===0?<div className="sii-empty">No hay registros coincidentes.</div>:
     <div className="sii-catalog-scroll"><table className="sii-catalog-table">
      <thead><tr><th scope="col">Identificador</th><th scope="col">Persona</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
      <tbody>{filtered.map(row=><tr key={row.id}>
       <td className="sii-catalog-code">{row.enrollmentNumber??row.employeeNumber}</td>
       <td><strong>{row.firstName} {row.lastName}</strong><small>{row.institutionalEmail??'Sin correo institucional'}</small></td>
       <td>{row.status}</td>
       <td><button type="button" disabled={saving||!['active','inactive'].includes(row.status)} onClick={()=>void changeStatus(row)}>{row.status==='active'?'Desactivar':'Reactivar'}</button></td>
      </tr>)}</tbody></table></div>}
    <nav className="sii-catalog-pagination" aria-label="Paginación del registro">
     <button type="button" className="sii-outline-button" disabled={history.length===1||loading||saving} onClick={()=>void page('previous')}>Página anterior</button>
     <span aria-live="polite">Página {history.length}</span>
     <button type="button" className="sii-outline-button" disabled={!nextCursor||loading||saving} onClick={()=>void page('next')}>Siguiente página</button>
    </nav>
   </section>
   <aside className="sii-panel sii-catalog-create">
    <span className="sii-section-kicker">ALTA INSTITUCIONAL</span><h3>Nuevo {kind==='students'?'estudiante':'docente'}</h3>
    <form className="sii-catalog-form" onSubmit={e=>void submit(e)}>
     <label>{kind==='students'?'Matrícula':'Número de empleado'}<input name="code" required minLength={2} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]*"/></label>
     <label>Nombre(s)<input name="firstName" required minLength={2}/></label>
     <label>Apellidos<input name="lastName" required minLength={2}/></label>
     <label>Correo institucional (opcional)<input type="email" name="institutionalEmail"/></label>
     {kind==='students'&&<label>Programa académico<select aria-label="Programa académico" name="programId" required defaultValue=""><option value="" disabled>Selecciona un programa</option>{programs.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label>}
     <button className="sii-submit" type="submit" disabled={saving||(kind==='students'&&!programs.length)}>{saving?'Guardando…':'Guardar registro'}</button>
    </form>
   </aside>
  </div>
 </div>
}
