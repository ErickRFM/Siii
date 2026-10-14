'use client';
import { useCallback,useEffect,useState,type FormEvent } from 'react';
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
 const base=`/api/v1/institutions/${institutionId}`;
 const refresh=useCallback(async(resource:Kind)=>{
  setLoading(true);setError('');
  try{
   const response=await fetch(`${base}/registry/${resource}`,{cache:'no-store'});
   if(!response.ok)throw Error('UNAVAILABLE');
   const json=await response.json() as {data:RecordRow[]};
   setRows(json.data);
  }catch{setError('No se pudo cargar el registro. Comprueba tu sesión o vuelve a intentar.');setRows([])}
  finally{setLoading(false)}
 },[base]);
 useEffect(()=>{void refresh(kind)},[kind,refresh]);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`${base}/academic/programs`,{signal:controller.signal,cache:'no-store'})
   .then(r=>r.ok?r.json():Promise.reject(Error('CATALOG_UNAVAILABLE')))
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
   form.reset();setNotice('Registro guardado y auditado en la institución actual.');await refresh(kind);
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
   await refresh(kind);
  }catch{setError('No se pudo cambiar el estado del registro.')}finally{setSaving(false)}
 }
 const filtered=rows.filter(r=>[r.firstName,r.lastName,r.enrollmentNumber,r.employeeNumber].join(' ').toLowerCase().includes(search.toLowerCase()));
 return <div className="sii-academic">
  <div className="sii-catalog-tabs" role="tablist" aria-label="Control escolar">
   {(['students','teachers'] as Kind[]).map(k=><button type="button" role="tab" key={k} aria-selected={kind===k} className={kind===k?'sii-catalog-tab sii-catalog-tab--active':'sii-catalog-tab'} onClick={()=>{setKind(k);setSearch('');setError('');setNotice('')}}>{k==='students'?'Estudiantes':'Docentes'}</button>)}
  </div>
  <div className="sii-catalog-summary"><div><span className="sii-section-kicker">CONTROL ESCOLAR</span>
   <h2>{kind==='students'?'Expedientes de estudiantes':'Plantilla docente'}</h2><p>Registros institucionales oficiales. La creación de cuentas de acceso es independiente.</p></div>
   <span className="sii-small-count">{rows.length} registros</span></div>
  {error&&<p role="alert" className="sii-catalog-error">{error}</p>}
  {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
  <div className="sii-catalog-layout">
   <section className="sii-panel sii-catalog-table-panel" aria-label="Listado oficial">
    <div className="sii-catalog-toolbar"><label htmlFor="school-search">Buscar</label>
     <input id="school-search" value={search} onChange={e=>setSearch(e.target.value)} type="search" placeholder="Matrícula, nombre o número de empleado"/>
     <button type="button" className="sii-outline-button" onClick={()=>void refresh(kind)} disabled={loading}>Actualizar</button></div>
    {loading?<div className="sii-empty" role="status">Cargando registros…</div>:filtered.length===0?<div className="sii-empty">No hay registros coincidentes.</div>:
     <div className="sii-catalog-scroll"><table className="sii-catalog-table">
      <thead><tr><th scope="col">Identificador</th><th scope="col">Persona</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
      <tbody>{filtered.map(row=><tr key={row.id}>
       <td className="sii-catalog-code">{row.enrollmentNumber??row.employeeNumber}</td>
       <td><strong>{row.firstName} {row.lastName}</strong><small>{row.institutionalEmail??'Sin correo institucional'}</small></td>
       <td>{row.status}</td>
       <td><button type="button" disabled={saving||!['active','inactive'].includes(row.status)} onClick={()=>void changeStatus(row)}>{row.status==='active'?'Desactivar':'Reactivar'}</button></td>
      </tr>)}</tbody></table></div>}
    {rows.length>=200&&<p className="sii-catalog-limit">Máximo 200 registros. Paginación de expedientes: pendiente.</p>}
   </section>
   <aside className="sii-panel sii-catalog-create">
    <span className="sii-section-kicker">ALTA INSTITUCIONAL</span><h3>Nuevo {kind==='students'?'estudiante':'docente'}</h3>
    <form className="sii-catalog-form" onSubmit={e=>void submit(e)}>
     <label>{kind==='students'?'Matrícula':'Número de empleado'}<input name="code" required minLength={2} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]*"/></label>
     <label>Nombre(s)<input name="firstName" required minLength={2}/></label>
     <label>Apellidos<input name="lastName" required minLength={2}/></label>
     <label>Correo institucional (opcional)<input type="email" name="institutionalEmail"/></label>
     {kind==='students'&&<label>Programa académico<select name="programId" required defaultValue=""><option value="" disabled>Selecciona un programa</option>{programs.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label>}
     <button className="sii-submit" type="submit" disabled={saving||(kind==='students'&&!programs.length)}>{saving?'Guardando…':'Guardar registro'}</button>
    </form>
   </aside>
  </div>
 </div>
}
