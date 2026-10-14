'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { CatalogResource } from '@/modules/academic/catalog-validation';

type RecordRow = {
  id: string; code?: string | null; name?: string; version?: string;
  level?: string; modality?: string; credits?: number; status: string;
  startDate?: string; endDate?: string; programId?: string;
};
type CatalogTab = { id: CatalogResource; label: string; description: string; icon: string };
const tabs: CatalogTab[] = [
  {id:'programs',label:'Programas',description:'Carreras y oferta universitaria',icon:'◈'},
  {id:'courses',label:'Materias',description:'Catálogo institucional de asignaturas',icon:'▤'},
  {id:'curricula',label:'Planes',description:'Versiones curriculares por programa',icon:'▦'},
  {id:'terms',label:'Periodos',description:'Ciclos y fechas académicas',icon:'◷'},
  {id:'campuses',label:'Campus',description:'Sedes académicas y unidades',icon:'⌂'},
];
const statusLabels: Record<string, string> = {active:'Activo',inactive:'Inactivo',archived:'Archivado',suspended:'Suspendido'};
const typeLabels: Record<string,string> = {
  tecnico_superior:'Técnico Superior',licenciatura:'Licenciatura',ingenieria:'Ingeniería',
  maestria:'Maestría',doctorado:'Doctorado',otro:'Otro',
  presencial:'Presencial',mixta:'Mixta',en_linea:'En línea',
};
function getError(code?: string) {
  switch(code) {
    case 'DUPLICATE_CODE': return 'Esa clave ya está registrada en la institución.';
    case 'PROGRAM_NOT_FOUND': return 'El programa seleccionado no existe, está inactivo o pertenece a otra institución.';
    case 'FORBIDDEN': return 'No tienes permisos para realizar esta operación.';
    case 'ACADEMIC_CONSTRAINT': return 'La operación no cumple una restricción académica.';
    case 'VALIDATION_ERROR': return 'Revisa los datos ingresados y sus formatos.';
    case 'NOT_FOUND': return 'El registro ya no está disponible. Actualiza el catálogo.';
    default: return 'No se pudo completar la operación. Intenta nuevamente.';
  }
}
export default function AcademicCatalog({institutionId,canManage}:{institutionId:string;canManage:boolean}) {
  const [tab,setTab] = useState<CatalogResource>('programs');
  const [rows,setRows] = useState<RecordRow[]>([]);
  const [programs,setPrograms] = useState<RecordRow[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [editing,setEditing] = useState<string | null>(null);
  const [editName,setEditName] = useState('');
  const base = `/api/v1/institutions/${institutionId}/academic`;

  const load = useCallback(async(resource:CatalogResource, signal?:AbortSignal) => {
    setLoading(true);setError('');
    try {
      const response = await fetch(`${base}/${resource}`,{cache:'no-store',credentials:'same-origin',signal});
      if(!response.ok) throw new Error(response.status===403 ? 'FORBIDDEN':'SERVER_ERROR');
      const body = await response.json() as {data:RecordRow[]};
      if(!signal?.aborted) setRows(body.data);
    } catch(e) {
      if(!signal?.aborted) setError(getError(e instanceof Error?e.message:undefined));
    } finally { if(!signal?.aborted) setLoading(false); }
  },[base]);

  useEffect(()=>{
    const controller=new AbortController(); void load(tab,controller.signal);
    return ()=>controller.abort();
  },[tab,load]);
  useEffect(()=>{
    if(tab!=='curricula')return;
    const controller=new AbortController();
    void fetch(`${base}/programs`,{cache:'no-store',credentials:'same-origin',signal:controller.signal})
      .then(r=>r.ok?r.json():Promise.reject(new Error('PROGRAMS_LOAD_FAILED')))
      .then((j:{data:RecordRow[]})=>{if(!controller.signal.aborted)setPrograms(j.data.filter(p=>p.status==='active'));})
      .catch(()=>{if(!controller.signal.aborted)setPrograms([])});
    return ()=>controller.abort();
  },[base,tab]);

  function choose(next:CatalogResource) {
    setTab(next);setNotice('');setError('');setSearch('');setEditing(null);
  }

  async function mutate(method:'POST'|'PATCH', payload:Record<string,unknown>) {
    setSaving(true);setNotice('');setError('');
    try {
      const response=await fetch(`${base}/${tab}`,{
        method, credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
      });
      if(!response.ok) {
        const body=await response.json().catch(()=>({error:{code:'SERVER_ERROR'}})) as {error?:{code?:string}};
        setError(getError(body.error?.code));return false;
      }
      setNotice(method==='POST'?'Registro creado correctamente.':'Cambios guardados correctamente.');
      await load(tab);return true;
    } catch {setError('No se pudo conectar con el servidor. Comprueba tu conexión.');return false;}
    finally{setSaving(false);}
  }

  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(saving)return;
    const form=event.currentTarget; const data=new FormData(form);
    let payload:Record<string,unknown>={};
    if(tab==='curricula')payload={programId:String(data.get('programId')??''),version:String(data.get('version')??'')};
    else {
      payload={code:String(data.get('code')??''),name:String(data.get('name')??'')};
      if(tab==='programs')payload={...payload,level:String(data.get('level')??''),modality:String(data.get('modality')??'')};
      if(tab==='courses')payload={...payload,credits:Number(data.get('credits'))};
      if(tab==='terms')payload={...payload,startDate:String(data.get('startDate')??''),endDate:String(data.get('endDate')??'')};
    }
    if(await mutate('POST',payload)) form.reset();
  }

  async function saveName(id:string) {
    if(await mutate('PATCH',{id,name:editName.trim()}))setEditing(null);
  }

  async function setStatus(row:RecordRow) {
    const next=row.status==='active'?'archived':'active';
    if(!window.confirm(`¿Confirmas cambiar este registro a ${statusLabels[next].toLowerCase()}?`))return;
    await mutate('PATCH',{id:row.id,status:next});
  }

  const selected=tabs.find(t=>t.id===tab)!;
  const filtered=rows.filter(row=>[row.name??'',row.code??'',row.version??'']
    .some(v=>v.toLocaleLowerCase('es-MX').includes(search.trim().toLocaleLowerCase('es-MX'))));
  return (
    <div className="sii-academic">
      <div className="sii-catalog-tabs" role="tablist" aria-label="Áreas del catálogo académico">
        {tabs.map(t=><button type="button" role="tab" key={t.id} aria-selected={tab===t.id}
          className={tab===t.id?'sii-catalog-tab sii-catalog-tab--active':'sii-catalog-tab'}
          onClick={()=>choose(t.id)}><span aria-hidden="true">{t.icon}</span>{t.label}</button>)}
      </div>
      <div className="sii-catalog-summary">
        <div><span className="sii-section-kicker">CATÁLOGO INSTITUCIONAL</span><h2>{selected.label}</h2><p>{selected.description}</p></div>
        <span className="sii-small-count">{loading?'Cargando…':`${rows.length} registros`}</span>
      </div>
      {notice&&<p className="sii-catalog-notice" role="status">{notice}</p>}
      {error&&<p className="sii-catalog-error" role="alert">{error}</p>}
      <div className="sii-catalog-layout">
        <section className="sii-panel sii-catalog-table-panel" aria-label={`Listado de ${selected.label.toLowerCase()}`}>
          <div className="sii-catalog-toolbar">
            <label htmlFor="catalog-search">Buscar en {selected.label.toLowerCase()}</label>
            <input id="catalog-search" type="search" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Nombre, clave o versión…"/>
            <button type="button" className="sii-outline-button" onClick={()=>void load(tab)} disabled={loading||saving}>Actualizar</button>
          </div>
          {loading?<div className="sii-empty" role="status">Cargando datos académicos…</div>
          :filtered.length===0?<div className="sii-empty" role="status"><strong>{search?'No encontramos coincidencias.':'Aún no hay registros.'}</strong><p>{search?'Prueba con otra búsqueda.':canManage?'Utiliza el formulario para agregar el primero.':'Tu institución aún no ha publicado datos en este catálogo.'}</p></div>
          :<div className="sii-catalog-scroll"><table className="sii-catalog-table">
            <thead><tr><th scope="col">Clave / Versión</th><th scope="col">Nombre / Detalle</th><th scope="col">Estado</th>{canManage&&<th scope="col">Acciones</th>}</tr></thead>
            <tbody>{filtered.map(row=><tr key={row.id}>
              <td><span className="sii-catalog-code">{row.code??row.version??'—'}</span></td>
              <td>
                {editing===row.id?<div className="sii-catalog-edit"><label htmlFor="catalog-edit-name">Nombre</label><input id="catalog-edit-name" value={editName} onChange={e=>setEditName(e.target.value)} maxLength={160} minLength={3}/><button type="button" disabled={saving} onClick={()=>void saveName(row.id)}>Guardar</button><button type="button" onClick={()=>setEditing(null)}>Cancelar</button></div>
                :<><strong>{row.name??(programs.find(p=>p.id===row.programId)?.name??'Plan de estudios')}</strong>
                  <small>{row.level?typeLabels[row.level]+' · '+typeLabels[row.modality??'']:row.credits!==undefined?`${row.credits} créditos`:row.startDate?`${String(row.startDate).slice(0,10)} — ${String(row.endDate).slice(0,10)}`:''}</small></>}
              </td>
              <td><span className={row.status==='active'?'sii-catalog-status sii-catalog-status--active':'sii-catalog-status'}>{statusLabels[row.status]??row.status}</span></td>
              {canManage&&<td><div className="sii-catalog-actions">
                {tab!=='curricula'&&<button type="button" disabled={saving} onClick={()=>{setEditing(row.id);setEditName(row.name??'');}}>Editar</button>}
                <button type="button" disabled={saving} onClick={()=>void setStatus(row)}>{row.status==='active'?'Archivar':'Reactivar'}</button>
              </div></td>}
            </tr>)}</tbody>
          </table></div>}
          {rows.length>=200&&<p className="sii-catalog-limit">Se muestran hasta 200 registros. La paginación avanzada se incorporará en una siguiente entrega.</p>}
        </section>
        {canManage&&<aside className="sii-panel sii-catalog-create">
          <span className="sii-section-kicker">NUEVO REGISTRO</span><h3>Agregar {selected.label.toLowerCase()}</h3>
          <p>Los cambios quedarán guardados y auditados en la institución actual.</p>
          <form className="sii-catalog-form" onSubmit={e=>void create(e)}>
            {tab==='curricula'?<>
              <label>Programa académico<select name="programId" required defaultValue=""><option value="" disabled>Seleccionar programa</option>
                {programs.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </select></label>
              <label>Versión del plan<input name="version" placeholder="2026-A" minLength={2} maxLength={25} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" required/></label>
            </>:<>
              <label>Clave<input name="code" placeholder={tab==='courses'?'MAT-101':tab==='programs'?'ING-SIS':'2026-A'} minLength={2} maxLength={25}
                pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" required/></label>
              <label>Nombre<input name="name" placeholder="Nombre oficial" minLength={3} maxLength={160} required/></label>
            </>}
            {tab==='programs'&&<>
              <label>Nivel académico<select name="level" defaultValue="ingenieria" required><option value="ingenieria">Ingeniería</option><option value="licenciatura">Licenciatura</option><option value="tecnico_superior">Técnico Superior</option><option value="maestria">Maestría</option><option value="doctorado">Doctorado</option><option value="otro">Otro</option></select></label>
              <label>Modalidad<select name="modality" defaultValue="presencial" required><option value="presencial">Presencial</option><option value="mixta">Mixta</option><option value="en_linea">En línea</option></select></label>
            </>}
            {tab==='courses'&&<label>Créditos<input type="number" name="credits" min={0} max={30} step={1} required defaultValue={6}/></label>}
            {tab==='terms'&&<><label>Inicio del periodo<input name="startDate" type="date" required/></label><label>Fin del periodo<input name="endDate" type="date" required/></label></>}
            <button className="sii-submit" type="submit" disabled={saving||(tab==='curricula'&&programs.length===0)}>{saving?'Guardando…':'Guardar registro'} <span aria-hidden="true">→</span></button>
          </form>
        </aside>}
      </div>
      <p className="sii-catalog-footnote">SII guarda datos oficiales por institución. Inscripciones, grupos, horarios y actas se integrarán sobre este catálogo sin simular operaciones.</p>
    </div>
  );
}
