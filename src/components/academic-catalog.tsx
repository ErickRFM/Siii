'use client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';
import {NativeSelect} from '@/components/ui/native-select';

import SiiScrollRegion from './sii-scroll-region';
import {useInstitutionConfirmation} from './sii-confirmation';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { CatalogResource } from '@/modules/academic/catalog-validation';
import AcademicSetupChecklist from './academic-setup-checklist';
import {catalogAccessKey} from '@/modules/academic/access-key';
import { useInstitutionCapabilities, hasAnyCapability, hasInstitutionCapability, hasScopedCapability, CapabilityState, SecurityActionLink } from './institution-capabilities';

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
    case 'MFA_REQUIRED': return 'Configura o verifica tu autenticador para continuar.';
    case 'STEP_UP_REQUIRED': return 'Confirma tu identidad en seguridad y vuelve a intentar esta operación.';
    case 'PASSWORD_CHANGE_REQUIRED': return 'Actualiza tu contraseña en seguridad para continuar.';
    case 'ACTIVE_DEPENDENCIES': return 'Este programa tiene planes activos. Resuelve sus dependencias antes de archivarlo.';
    case 'INVALID_TRANSITION': return 'Este cambio de estado no está permitido.';
    case 'ACADEMIC_CONSTRAINT': return 'La operación no cumple una restricción académica.';
    case 'VALIDATION_ERROR': return 'Revisa los datos ingresados y sus formatos.';
    case 'NOT_FOUND': return 'El registro ya no está disponible. Actualiza el catálogo.';
    default: return 'No se pudo completar la operación. Intenta nuevamente.';
  }
}
export default function AcademicCatalog({institutionId}:{institutionId:string}) {
 const {ask,confirmation}=useInstitutionConfirmation();
  const {data:access,loading:permissionsLoading,error:permissionsError}=useInstitutionCapabilities();
  const availableTabs=tabs.filter(item=>hasAnyCapability(access,`${item.id}.read`));
  const accessReady=Boolean(access&&!access.restricted);
  const scopeKey=catalogAccessKey(access);
  const lastConfirmedScope=useRef<string|null>(null);
  const [tab,setTab] = useState<CatalogResource>('programs');
  const [rows,setRows] = useState<RecordRow[]>([]);
  const [programs,setPrograms] = useState<RecordRow[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [loadError,setLoadError] = useState('');
  const [mutationError,setMutationError]=useState('');
  const [securityRequired,setSecurityRequired]=useState(false);
  const [nameError,setNameError]=useState(false);
  const [programsReload,setProgramsReload]=useState(0);
  const [setupRevision,setSetupRevision]=useState(0);
  const mutationErrorRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(mutationError){if(nameError)document.getElementById('catalog-edit-name')?.focus();else mutationErrorRef.current?.focus();}},[mutationError,nameError]);
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [includeInactive,setIncludeInactive]=useState(false);
  const [editing,setEditing] = useState<string | null>(null);
  const [editName,setEditName] = useState('');
  const base = `/api/v1/institutions/${institutionId}/academic`;
  const selectedTab=availableTabs.some(item=>item.id===tab)?tab:availableTabs[0]?.id;
  const canManage=Boolean(selectedTab&&hasAnyCapability(access,`${selectedTab}.manage`));
  const hasManagement=tabs.some(item=>hasAnyCapability(access,`${item.id}.manage`));
  const canCreate=Boolean(selectedTab&&(hasInstitutionCapability(access,`${selectedTab}.manage`)||(selectedTab==='curricula'&&hasAnyCapability(access,'curricula.manage'))));
  const canManageRow=(row:RecordRow)=>['active','inactive'].includes(row.status)&&Boolean(selectedTab&&(selectedTab==='programs'?hasScopedCapability(access,'programs.manage','program',row.id):selectedTab==='curricula'?hasScopedCapability(access,'curricula.manage','program',row.programId):selectedTab==='campuses'?hasScopedCapability(access,'campuses.manage','campus',row.id):hasInstitutionCapability(access,`${selectedTab}.manage`)));

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
      if(!response.ok){const failure=await response.json().catch(()=>({})) as {error?:{code?:string}};if(['MFA_REQUIRED','STEP_UP_REQUIRED','PASSWORD_CHANGE_REQUIRED'].includes(failure.error?.code??''))setSecurityRequired(true);throw new Error(failure.error?.code??'SERVER_ERROR');}
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
    if(!accessReady||lastConfirmedScope.current===scopeKey)return;
    lastConfirmedScope.current=scopeKey;
    activeRequest.current?.abort();
    setRows([]);setPrograms([]);setHistory([null]);setNextCursor(null);
    setEditing(null);setEditName('');setSearch('');setNotice('');setMutationError('');setNameError(false);setSecurityRequired(false);
  },[scopeKey,accessReady]);
  useEffect(()=>{
    if(!accessReady||!selectedTab)return;
    if(selectedTab!==tab){setTab(selectedTab);return;}
    const controller=new AbortController();setHistory([null]);setNextCursor(null);
    void load(tab,controller.signal);return ()=>controller.abort();
  },[tab,load,accessReady,selectedTab,scopeKey]);
  useEffect(()=>{
    if(tab!=='curricula'||!accessReady)return;
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
  },[base,tab,programsReload,accessReady,scopeKey]);
  async function page(direction:'previous'|'next'){
    const destination=direction==='next'?nextCursor:history[history.length-2];
    if(destination===undefined)return;
    if(await load(tab,undefined,destination)){
      setHistory(previous=>direction==='next'?[...previous,destination]:previous.slice(0,-1));
    }
  }
  function moveTab(event:KeyboardEvent<HTMLButtonElement>,resource:CatalogResource){
    const index=availableTabs.findIndex(item=>item.id===resource);
    const next=event.key==='ArrowRight'?(index+1)%availableTabs.length:event.key==='ArrowLeft'?(index+availableTabs.length-1)%availableTabs.length:event.key==='Home'?0:event.key==='End'?availableTabs.length-1:-1;
    if(next<0)return;
    event.preventDefault();choose(availableTabs[next].id);
    requestAnimationFrame(()=>document.getElementById('catalog-tab-'+availableTabs[next].id)?.focus());
  }

  function choose(next:CatalogResource) {
    setTab(next);setNotice('');setLoadError('');setMutationError('');setSecurityRequired(false);setNameError(false);setSearch('');setEditing(null);
  }

  async function mutate(method:'POST'|'PATCH', payload:Record<string,unknown>) {
    setSaving(true);setNotice('');setMutationError('');setSecurityRequired(false);setNameError(false);
    try {
      const response=await fetch(`${base}/${tab}`,{
        method, credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
      });
      if(!response.ok) {
        const body=await response.json().catch(()=>({error:{code:'SERVER_ERROR'}})) as {error?:{code?:string}};
        setSecurityRequired(['MFA_REQUIRED','STEP_UP_REQUIRED','PASSWORD_CHANGE_REQUIRED'].includes(body.error?.code??''));setNameError(body.error?.code==='VALIDATION_ERROR'&&method==='PATCH'&&typeof payload.name==='string');setMutationError(getError(body.error?.code));return false;
      }
      setNotice(method==='POST'?'Registro creado correctamente.':'Cambios guardados correctamente.');
      setSetupRevision(value=>value+1);
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
    if(!await ask({title:'Cambiar estado del catálogo',description:`El registro pasará a ${statusLabels[next].toLowerCase()}. Los registros archivados no pueden reactivarse.`,confirmLabel:'Confirmar cambio',destructive:next==='archived'}))return;
    await mutate('PATCH',{id:row.id,status:next});
  }

  const selected=tabs.find(t=>t.id===(selectedTab??tab))!;
  const filtered=rows.filter(row=>(hasManagement||includeInactive||row.status==='active')&&[row.name??'',row.code??'',row.version??'']
    .some(v=>v.toLocaleLowerCase('es-MX').includes(search.trim().toLocaleLowerCase('es-MX'))));
  if(permissionsLoading||permissionsError||access?.restricted)return <CapabilityState returnTo={`/dashboard/institutions/${institutionId}/academic`}/>;
  if(!access||availableTabs.length===0)return <p className="sii-info-banner">No tienes acceso a catálogos académicos.</p>;
  return (
    <div className="sii-academic siii-glass-workspace">
 {confirmation}
      {hasManagement&&<AcademicSetupChecklist institutionId={institutionId} revision={setupRevision} disabled={saving} onOpen={resource=>{choose(resource);requestAnimationFrame(()=>document.getElementById('catalog-tab-'+resource)?.focus());}}/>}
      <div className="sii-catalog-tabs" role="tablist" aria-label="Áreas del catálogo académico">
        {availableTabs.map(t=><Button variant="ghost" type="button" role="tab" key={t.id} aria-selected={tab===t.id} id={'catalog-tab-'+t.id} aria-controls="catalog-panel" tabIndex={tab===t.id?0:-1} onKeyDown={e=>moveTab(e,t.id)} disabled={saving}
          className={tab===t.id?'sii-catalog-tab sii-catalog-tab--active':'sii-catalog-tab'}
          onClick={()=>choose(t.id)}><span aria-hidden="true">{t.icon}</span>{t.label}</Button>)}
      </div>
      <div className="sii-catalog-summary">
        <div><span className="sii-section-kicker">CATÁLOGO INSTITUCIONAL</span><h2>{selected.label}</h2><p>{selected.description}</p></div>
        <span className="sii-small-count">{loading?'Cargando…':`${rows.length} registros en esta página`}</span>
      </div>
      {notice&&<p className="sii-catalog-notice" role="status">{notice}</p>}
      {loadError&&<p className="sii-catalog-error" role="alert">{loadError}</p>}
      {mutationError&&<p className="sii-catalog-error" role="alert" id="catalog-mutation-error" tabIndex={-1} ref={mutationErrorRef}>{mutationError}</p>}
      {securityRequired&&<SecurityActionLink returnTo={`/dashboard/institutions/${institutionId}/academic`}/>}
      {!online&&<p className="sii-catalog-error" role="status">Sin conexión. Los datos mostrados pueden estar desactualizados. Las operaciones estarán disponibles al reconectar.</p>}
      {programsError&&<p className="sii-catalog-error" role="alert">{programsError}</p>}
      <div id="catalog-panel" className="sii-catalog-layout" role="tabpanel" aria-labelledby={'catalog-tab-'+tab} aria-busy={loading}>
        <section className="sii-panel sii-catalog-table-panel" aria-label={`Listado de ${selected.label.toLowerCase()}`}>
          <div className="sii-catalog-toolbar">
            <label htmlFor="catalog-search">Buscar en esta página de {selected.label.toLowerCase()}</label>
            <Input id="catalog-search" type="search" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Nombre, clave o versión…"/>
            {!hasManagement&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeInactive} onChange={event=>setIncludeInactive(event.target.checked)}/>Incluir registros inactivos y archivados</label>}
            <Button variant="outline" type="button" className="sii-outline-button" onClick={()=>{setMutationError('');setNameError(false);if(tab==='curricula')setProgramsReload(value=>value+1);void load(tab,undefined,currentCursor);}} disabled={loading||saving||!online}>Actualizar</Button>
          </div>
          {loading?<div className="sii-empty" role="status">Cargando datos académicos…</div>
          :loadError?<div className="sii-empty"><strong>Datos no disponibles.</strong><p>Corrige el problema indicado y vuelve a actualizar.</p></div>
          :filtered.length===0?<div className="sii-empty" role="status"><strong>{search?'No encontramos coincidencias.':'Aún no hay registros.'}</strong><p>{search?'Prueba con otra búsqueda.':canCreate?'Utiliza el formulario para agregar el primero.':'No hay datos disponibles dentro de tu ámbito en este catálogo.'}</p></div>
          :<SiiScrollRegion label="Tabla del catálogo académico, desplazamiento horizontal"><Table scrollable={false} className="sii-catalog-table">
            <TableHeader><TableRow><TableHead scope="col">Clave / Versión</TableHead><TableHead scope="col">Nombre / Detalle</TableHead><TableHead scope="col">Estado</TableHead>{canManage&&<TableHead scope="col">Acciones</TableHead>}</TableRow></TableHeader>
            <TableBody>{filtered.map(row=><TableRow key={row.id}>
              <TableCell><span className="sii-catalog-code">{row.code??row.version??'—'}</span></TableCell>
              <TableCell>
                {editing===row.id?<div className="sii-catalog-edit"><label htmlFor="catalog-edit-name">Nombre</label><Input id="catalog-edit-name" aria-invalid={nameError||undefined} aria-describedby={nameError?'catalog-mutation-error':undefined} value={editName} onChange={e=>setEditName(e.target.value)} maxLength={160} minLength={3}/><Button variant="outline" type="button" disabled={saving||!online} onClick={()=>void saveName(row.id)}>Guardar</Button><Button variant="outline" type="button" onClick={()=>setEditing(null)}>Cancelar</Button></div>
                :<><strong>{row.name??(programs.find(p=>p.id===row.programId)?.name??'Plan de estudios')}</strong>
                  <small>{row.level?typeLabels[row.level]+' · '+typeLabels[row.modality??'']:row.credits!==undefined?`${row.credits} créditos`:row.startDate?`${String(row.startDate).slice(0,10)} — ${String(row.endDate).slice(0,10)}`:''}</small></>}
              </TableCell>
              <TableCell><span className={row.status==='active'?'sii-catalog-status sii-catalog-status--active':'sii-catalog-status'}>{statusLabels[row.status]??row.status}</span></TableCell>
              {canManage&&<TableCell>{canManageRow(row)?<div className="sii-catalog-actions">
                {tab!=='curricula'&&<Button variant="outline" type="button" disabled={saving||!online} onClick={()=>{setEditing(row.id);setEditName(row.name??'');setNameError(false);setMutationError('');}}>Editar</Button>}
                <Button variant="outline" type="button" disabled={saving||!online||row.status==='archived'} onClick={()=>void setStatus(row)}>{row.status==='archived'?'Archivado':row.status==='active'?'Archivar':'Reactivar'}</Button>
              </div>:<span>{row.status==='archived'?'Archivado':'Solo consulta'}</span>}</TableCell>}
            </TableRow>)}</TableBody>
          </Table></SiiScrollRegion>}
          <nav className="sii-catalog-pagination" aria-label="Paginación del catálogo">
            <Button variant="outline" type="button" className="sii-outline-button" disabled={history.length===1||loading||saving||!online} onClick={()=>void page('previous')}>Página anterior</Button>
            <span aria-live="polite">Página {history.length}</span>
            <Button variant="outline" type="button" className="sii-outline-button" disabled={!nextCursor||loading||saving||!online} onClick={()=>void page('next')}>Siguiente página</Button>
          </nav>
        </section>
        {canCreate&&<aside className="sii-panel sii-catalog-create">
          <span className="sii-section-kicker">NUEVO REGISTRO</span><h3>Agregar {selected.label.toLowerCase()}</h3>
          <p>Los cambios quedarán guardados y auditados en la institución actual.</p>
          <form key={scopeKey} className="sii-catalog-form" onSubmit={e=>void create(e)}>
            {tab==='curricula'?<>
              <label>Programa académico<NativeSelect name="programId" required defaultValue=""><option value="" disabled>Seleccionar programa</option>
                {programs.filter(p=>hasScopedCapability(access,'curricula.manage','program',p.id)).map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </NativeSelect></label>
              <label>Versión del plan<Input name="version" placeholder="2026-A" minLength={2} maxLength={25} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" required/></label>
            </>:<>
              <label>Clave<Input name="code" placeholder={tab==='courses'?'MAT-101':tab==='programs'?'ING-SIS':'2026-A'} minLength={2} maxLength={25}
                pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" required/></label>
              <label>Nombre<Input name="name" placeholder="Nombre oficial" minLength={3} maxLength={160} required/></label>
            </>}
            {tab==='programs'&&<>
              <label>Nivel académico<NativeSelect name="level" defaultValue="ingenieria" required><option value="ingenieria">Ingeniería</option><option value="licenciatura">Licenciatura</option><option value="tecnico_superior">Técnico Superior</option><option value="maestria">Maestría</option><option value="doctorado">Doctorado</option><option value="otro">Otro</option></NativeSelect></label>
              <label>Modalidad<NativeSelect name="modality" defaultValue="presencial" required><option value="presencial">Presencial</option><option value="mixta">Mixta</option><option value="en_linea">En línea</option></NativeSelect></label>
            </>}
            {tab==='courses'&&<label>Créditos<Input type="number" name="credits" min={0} max={30} step={1} required defaultValue={6}/></label>}
            {tab==='terms'&&<><label>Inicio del periodo<Input name="startDate" type="date" required/></label><label>Fin del periodo<Input name="endDate" type="date" required/></label></>}
            <Button variant="default" className="sii-submit" type="submit" disabled={saving||!online||(tab==='curricula'&&programs.length===0)}>{saving?'Guardando…':'Guardar registro'} <span aria-hidden="true">→</span></Button>
          </form>
        </aside>}
      </div>
      <p className="sii-catalog-footnote">SII guarda datos oficiales por institución. Inscripciones, grupos, horarios y actas se integrarán sobre este catálogo sin simular operaciones.</p>
    </div>
  );
}
