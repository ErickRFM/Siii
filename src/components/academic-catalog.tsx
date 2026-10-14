'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
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
    case 'PROGRAM_NOT_ACTIVE': return 'El programa del plan está inactivo o archivado. No se puede reactivar este plan.';
    case 'PROGRAM_NOT_FOUND': return 'El programa seleccionado no existe, está inactivo o pertenece a otra institución.';
    case 'FORBIDDEN': return 'No tienes permisos para realizar esta operación.';
    case 'ACTIVE_DEPENDENCIES': return 'Este programa tiene planes activos. Resuelve sus dependencias antes de archivarlo.';
    case 'INVALID_TRANSITION': return 'Este cambio de estado no está permitido.';
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
  const [loadError,setLoadError] = useState('');
  const [mutationError,setMutationError]=useState('');
  const [nameError,setNameError]=useState(false);
  const [programsReload,setProgramsReload]=useState(0);
  const mutationErrorRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(mutationError){if(nameError)document.getElementById('catalog-edit-name')?.focus();else mutationErrorRef.current?.focus();}},[mutationError,nameError]);
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [editing,setEditing] = useState<string | null>(null);
  const [editName,setEditName] = useState('');
  const base = `/api/v1/institutions/${institutionId}/academic`;

  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [history,setHistory]=useState<Array<string|null>>([null]);
  const [online,setOnline]=useState(true);
  const [programsError,setProgramsError]=useState('');
  const activeRequest=useRef<AbortController|null>(null);
  const currentCursor=history[history.length-1];
  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine);
    update();window.addEventListener('online',update);window.addEventListener('offline',update);
    return ()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  const load=useCallback(async(resource:CatalogResource,signal?:AbortSignal,cursor:string|null=null)=>{
    activeRequest.current?.abort();
    const controller=new AbortController();activeRequest.current=controller;
    const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,20000);
    setLoading(true);setLoadError('');
    try{
      const query=new URLSearchParams({limit:'50'});if(cursor)query.set('cursor',cursor);
      const response=await fetch(`${base}/${resource}?${query}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      if(!response.ok)throw new Error(response.status===403?'FORBIDDEN':'SERVER_ERROR');
      const body=await response.json() as {data:RecordRow[];page:{nextCursor:string|null}};
      if(!Array.isArray(body.data)||!body.page)throw new Error('SERVER_ERROR');
      if(activeRequest.current!==controller||signal?.aborted)return false;
      setRows(body.data);setNextCursor(body.page.nextCursor);return true;
    }catch(e){
      if(activeRequest.current===controller&&!signal?.aborted){
        setRows([]);setNextCursor(null);
        setLoadError(e instanceof TypeError?'No se pudo conectar con el servidor. Comprueba tu conexión.':getError(e instanceof Error?e.message:undefined));
      }
      return false;
    }finally{
      clearTimeout(timer);signal?.removeEventListener('abort',cancel);
      if(activeRequest.current===controller&&!signal?.aborted)setLoading(false);
    }
  },[base]);
  useEffect(()=>{
    const controller=new AbortController();setHistory([null]);setNextCursor(null);
    void load(tab,controller.signal);return ()=>controller.abort();
  },[tab,load]);
  useEffect(()=>{
    if(tab!=='curricula')return;
    const controller=new AbortController();setPrograms([]);setProgramsError('');
    void (async()=>{
      const all:RecordRow[]=[];let cursor:string|null=null;
      do{
        const query=new URLSearchParams({limit:'100'});if(cursor)query.set('cursor',cursor);
        const response=await fetch(`${base}/programs?${query}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
        if(!response.ok)throw new Error('PROGRAMS_LOAD_FAILED');
        const body=await response.json() as {data:RecordRow[];page:{nextCursor:string|null}};
        all.push(...body.data);cursor=body.page.nextCursor;
      }while(cursor&&!controller.signal.aborted);
      if(!controller.signal.aborted)setPrograms(all.filter(p=>p.status==='active'));
    })().catch(()=>{if(!controller.signal.aborted)setProgramsError('No se pudieron cargar los programas para crear un plan. Actualiza el catálogo.');});
    return ()=>controller.abort();
  },[base,tab,programsReload]);
  async function page(direction:'previous'|'next'){
    const destination=direction==='next'?nextCursor:history[history.length-2];
    if(destination===undefined)return;
    if(await load(tab,undefined,destination)){
      setHistory(previous=>direction==='next'?[...previous,destination]:previous.slice(0,-1));
    }
  }
  function moveTab(event:KeyboardEvent<HTMLButtonElement>,resource:CatalogResource){
    const index=tabs.findIndex(item=>item.id===resource);
    const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
    if(next<0)return;
    event.preventDefault();choose(tabs[next].id);
    requestAnimationFrame(()=>document.getElementById('catalog-tab-'+tabs[next].id)?.focus());
  }

  function choose(next:CatalogResource) {
    setTab(next);setNotice('');setLoadError('');setMutationError('');setNameError(false);setSearch('');setEditing(null);
  }

  async function mutate(method:'POST'|'PATCH', payload:Record<string,unknown>) {
    setSaving(true);setNotice('');setMutationError('');setNameError(false);
    try {
      const response=await fetch(`${base}/${tab}`,{
        method, credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
      });
      if(!response.ok) {
        const body=await response.json().catch(()=>({error:{code:'SERVER_ERROR'}})) as {error?:{code?:string}};
        setNameError(body.error?.code==='VALIDATION_ERROR'&&method==='PATCH'&&typeof payload.name==='string');setMutationError(getError(body.error?.code));return false;
      }
      setNotice(method==='POST'?'Registro creado correctamente.':'Cambios guardados correctamente.');
      setHistory([null]);await load(tab);return true;
    } catch {setMutationError('No se pudo conectar con el servidor. Comprueba tu conexión.');return false;}
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
    if(editName.trim().length<3||editName.trim().length>160){setNameError(true);setMutationError('El nombre debe tener entre 3 y 160 caracteres. Corrígelo y vuelve a guardar.');return;}
    if(await mutate('PATCH',{id,name:editName.trim()}))setEditing(null);
  }

  async function setStatus(row:RecordRow) {
    if(row.status==='archived')return;
    const next=row.status==='active'?'archived':'active';
    if(!window.confirm(`¿Confirmas cambiar este registro a ${statusLabels[next].toLowerCase()}? Los registros archivados no se reactivan.`))return;
    await mutate('PATCH',{id:row.id,status:next});
  }

  const selected=tabs.find(t=>t.id===tab)!;
  const filtered=rows.filter(row=>[row.name??'',row.code??'',row.version??'']
    .some(v=>v.toLocaleLowerCase('es-MX').includes(search.trim().toLocaleLowerCase('es-MX'))));
  return (
    <div className="sii-academic">
      <div className="sii-catalog-tabs" role="tablist" aria-label="Áreas del catálogo académico">
        {tabs.map(t=><button type="button" role="tab" key={t.id} aria-selected={tab===t.id} id={'catalog-tab-'+t.id} aria-controls="catalog-panel" tabIndex={tab===t.id?0:-1} onKeyDown={e=>moveTab(e,t.id)} disabled={saving}
          className={tab===t.id?'sii-catalog-tab sii-catalog-tab--active':'sii-catalog-tab'}
          onClick={()=>choose(t.id)}><span aria-hidden="true">{t.icon}</span>{t.label}</button>)}
      </div>
      <div className="sii-catalog-summary">
        <div><span className="sii-section-kicker">CATÁLOGO INSTITUCIONAL</span><h2>{selected.label}</h2><p>{selected.description}</p></div>
        <span className="sii-small-count">{loading?'Cargando…':`${rows.length} registros en esta página`}</span>
      </div>
      {notice&&<p className="sii-catalog-notice" role="status">{notice}</p>}
      {loadError&&<p className="sii-catalog-error" role="alert">{loadError}</p>}
      {mutationError&&<p className="sii-catalog-error" role="alert" id="catalog-mutation-error" tabIndex={-1} ref={mutationErrorRef}>{mutationError}</p>}
      {!online&&<p className="sii-catalog-error" role="status">Sin conexión. Los datos mostrados pueden estar desactualizados. Las operaciones estarán disponibles al reconectar.</p>}
      {programsError&&<p className="sii-catalog-error" role="alert">{programsError}</p>}
      <div id="catalog-panel" className="sii-catalog-layout" role="tabpanel" aria-labelledby={'catalog-tab-'+tab} aria-busy={loading}>
        <section className="sii-panel sii-catalog-table-panel" aria-label={`Listado de ${selected.label.toLowerCase()}`}>
          <div className="sii-catalog-toolbar">
            <label htmlFor="catalog-search">Buscar en esta página de {selected.label.toLowerCase()}</label>
            <input id="catalog-search" type="search" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Nombre, clave o versión…"/>
            <button type="button" className="sii-outline-button" onClick={()=>{setMutationError('');setNameError(false);if(tab==='curricula')setProgramsReload(value=>value+1);void load(tab,undefined,currentCursor);}} disabled={loading||saving||!online}>Actualizar</button>
          </div>
          {loading?<div className="sii-empty" role="status">Cargando datos académicos…</div>
          :loadError?<div className="sii-empty"><strong>Datos no disponibles.</strong><p>Corrige el problema indicado y vuelve a actualizar.</p></div>
          :filtered.length===0?<div className="sii-empty" role="status"><strong>{search?'No encontramos coincidencias.':'Aún no hay registros.'}</strong><p>{search?'Prueba con otra búsqueda.':canManage?'Utiliza el formulario para agregar el primero.':'Tu institución aún no ha publicado datos en este catálogo.'}</p></div>
          :<div className="sii-catalog-scroll"><table className="sii-catalog-table">
            <thead><tr><th scope="col">Clave / Versión</th><th scope="col">Nombre / Detalle</th><th scope="col">Estado</th>{canManage&&<th scope="col">Acciones</th>}</tr></thead>
            <tbody>{filtered.map(row=><tr key={row.id}>
              <td><span className="sii-catalog-code">{row.code??row.version??'—'}</span></td>
              <td>
                {editing===row.id?<div className="sii-catalog-edit"><label htmlFor="catalog-edit-name">Nombre</label><input id="catalog-edit-name" aria-invalid={nameError||undefined} aria-describedby={nameError?'catalog-mutation-error':undefined} value={editName} onChange={e=>setEditName(e.target.value)} maxLength={160} minLength={3}/><button type="button" disabled={saving||!online} onClick={()=>void saveName(row.id)}>Guardar</button><button type="button" onClick={()=>setEditing(null)}>Cancelar</button></div>
                :<><strong>{row.name??(programs.find(p=>p.id===row.programId)?.name??'Plan de estudios')}</strong>
                  <small>{row.level?typeLabels[row.level]+' · '+typeLabels[row.modality??'']:row.credits!==undefined?`${row.credits} créditos`:row.startDate?`${String(row.startDate).slice(0,10)} — ${String(row.endDate).slice(0,10)}`:''}</small></>}
              </td>
              <td><span className={row.status==='active'?'sii-catalog-status sii-catalog-status--active':'sii-catalog-status'}>{statusLabels[row.status]??row.status}</span></td>
              {canManage&&<td><div className="sii-catalog-actions">
                {tab!=='curricula'&&<button type="button" disabled={saving||!online} onClick={()=>{setEditing(row.id);setEditName(row.name??'');setNameError(false);setMutationError('');}}>Editar</button>}
                <button type="button" disabled={saving||!online||row.status==='archived'} onClick={()=>void setStatus(row)}>{row.status==='archived'?'Archivado':row.status==='active'?'Archivar':'Reactivar'}</button>
              </div></td>}
            </tr>)}</tbody>
          </table></div>}
          <nav className="sii-catalog-pagination" aria-label="Paginación del catálogo">
            <button type="button" className="sii-outline-button" disabled={history.length===1||loading||saving||!online} onClick={()=>void page('previous')}>Página anterior</button>
            <span aria-live="polite">Página {history.length}</span>
            <button type="button" className="sii-outline-button" disabled={!nextCursor||loading||saving||!online} onClick={()=>void page('next')}>Siguiente página</button>
          </nav>
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
            <button className="sii-submit" type="submit" disabled={saving||!online||(tab==='curricula'&&programs.length===0)}>{saving?'Guardando…':'Guardar registro'} <span aria-hidden="true">→</span></button>
          </form>
        </aside>}
      </div>
      <p className="sii-catalog-footnote">SII guarda datos oficiales por institución. Inscripciones, grupos, horarios y actas se integrarán sobre este catálogo sin simular operaciones.</p>
    </div>
  );
}
