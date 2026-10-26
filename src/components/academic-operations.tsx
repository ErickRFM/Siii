'use client';

import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {NativeSelect} from './ui/native-select';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from './ui/table';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import {SiiEmptyView,SiiSectionHeader,SiiSkeleton} from './ui/sii-kit';
import {SiiDrawer,SiiSearchSelect,type SiiChoice} from './ui/sii-workspace';
import SiiScrollRegion from './sii-scroll-region';
import {useInstitutionConfirmation} from './sii-confirmation';
import {readCollection} from '@/shared/client/read-collection';
import {registryCreate} from '@/modules/registry/validation';
import {CapabilityState,hasInstitutionCapability,useInstitutionCapabilities} from './institution-capabilities';

type Row={id:string;code?:string;name?:string;firstName?:string;lastName?:string;status?:string;capacity?:number;enrollmentNumber?:string;employeeNumber?:string;sectionId?:string;studentId?:string;teacherId?:string;termId?:string;courseId?:string};
type Part='sections'|'enrollments'|'assignments';
const tabs:{id:Part;label:string;create:string}[]=[
 {id:'sections',label:'Secciones',create:'Nueva sección'},
 {id:'enrollments',label:'Inscripciones',create:'Inscribir estudiante'},
 {id:'assignments',label:'Asignaciones',create:'Asignar docente'},
];
const states:Record<string,string>={open:'Abierta',closed:'Cerrada',archived:'Archivada',enrolled:'Inscrito',withdrawn:'Retirado',active:'Vigente'};
const messages:Record<string,string>={
 FORBIDDEN:'Tu autorización cambió. Actualiza tus permisos antes de continuar.',UNAUTHENTICATED:'Tu sesión venció. Inicia sesión de nuevo.',
 MFA_REQUIRED:'Verifica tu autenticador en Cuenta y seguridad.',STEP_UP_REQUIRED:'Confirma tu identidad en Cuenta y seguridad.',
 PASSWORD_CHANGE_REQUIRED:'Actualiza tu contraseña en Cuenta y seguridad.',VALIDATION_ERROR:'Revisa los campos del formulario.',
 DUPLICATE_SECTION:'Ya existe esa sección en el periodo. Escribe otra clave.',ALREADY_ENROLLED:'El estudiante ya está inscrito en esa sección.',
 ALREADY_ASSIGNED:'El docente ya está asignado a esa sección.',ENROLLMENT_BLOCKED:'Revisa el estado del alumno, la sección y el cupo disponible.',
 ASSIGNMENT_BLOCKED:'Revisa que el docente esté activo y la sección disponible.',COURSE_OR_TERM_UNAVAILABLE:'El periodo o materia ya no está activo.',
 SCHEDULE_CONFLICT:'El horario del alumno o docente entra en conflicto con otra sección.',
};
function feedback(code:string){return messages[code]??'No se pudo completar la operación. Conservamos tus datos; actualiza e intenta de nuevo.'}
const choice=(rows:Row[],kind:'person'|'catalog'):SiiChoice[]=>rows.map(row=>({id:row.id,label:kind==='person'?`${row.enrollmentNumber??row.employeeNumber??''} · ${row.firstName??''} ${row.lastName??''}`:`${row.code??''}${row.name?' · '+row.name:''}`}));

export default function AcademicOperations({institutionId}:{institutionId:string}){
 const {ask,confirmation,cancel:cancelConfirmation}=useInstitutionConfirmation();
 const {data:capabilities,refresh:refreshCapabilities}=useInstitutionCapabilities();
 const allowed=['programs','courses','curricula','terms','campuses'].every(resource=>hasInstitutionCapability(capabilities,resource+'.manage'));
 const base=`/api/v1/institutions/${institutionId}`;
 const [collections,setCollections]=useState<Record<string,Row[]>>({sections:[],students:[],teachers:[],terms:[],courses:[],enrollments:[],assignments:[]});
 const {sections,students,teachers,terms,courses,enrollments}=collections;
 const [part,setPart]=useState<Part>('sections'),[query,setQuery]=useState(''),[status,setStatus]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[unavailable,setUnavailable]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[formError,setFormError]=useState('');
 const [fields,setFields]=useState<Record<string,string>>({}),[drawer,setDrawer]=useState<'create'|Row|null>(null);
 const [dirty,setDirty]=useState(false);
 const controller=useRef<AbortController|null>(null),operation=useRef(false),search=useRef<HTMLInputElement>(null);
 const refresh=useCallback(async()=>{
  controller.current?.abort();const request=new AbortController();controller.current=request;setLoading(true);
  const paths={sections:'sections',students:'registry/students',teachers:'registry/teachers',terms:'academic/terms',courses:'academic/courses',enrollments:'enrollments',assignments:'assignments'};
  try{
   const response=await Promise.all(Object.entries(paths).map(async([key,path])=>[key,(await readCollection<Row>(`${base}/${path}`,{signal:request.signal})).data] as const));
   if(!request.signal.aborted){setCollections(Object.fromEntries(response));setUnavailable(false);setError('')}
  }catch{
   if(!request.signal.aborted){setCollections({sections:[],students:[],teachers:[],terms:[],courses:[],enrollments:[],assignments:[]});setUnavailable(true);setError('No se pudieron cargar las operaciones. Verifica tu conexión y permisos.');}
  }finally{if(!request.signal.aborted)setLoading(false)}
 },[base]);
 useEffect(()=>{void refresh();return ()=>controller.current?.abort()},[refresh]);
 const hadAuthority=useRef(false);
 useEffect(()=>{
  if(allowed){if(hadAuthority.current)void refresh();hadAuthority.current=true;return;}
  if(!hadAuthority.current)return;
  controller.current?.abort();cancelConfirmation();setDrawer(null);setDirty(false);setNotice('');
  setCollections({sections:[],students:[],teachers:[],terms:[],courses:[],enrollments:[],assignments:[]});
 },[allowed,refresh,cancelConfirmation]);
 const indices=useMemo(()=>Object.fromEntries(Object.entries(collections).map(([key,rows])=>[key,new Map(rows.map(row=>[row.id,row]))])),[collections]);
 const title=(row:Row)=>part==='sections'?row.code??'Sección':part==='enrollments'?choice([indices.students.get(row.studentId??'')??{} as Row],'person')[0].label:choice([indices.teachers.get(row.teacherId??'')??{} as Row],'person')[0].label;
 const detail=(row:Row)=>part==='sections'?`${indices.terms.get(row.termId??'')?.name??'—'} · ${indices.courses.get(row.courseId??'')?.name??'—'}`:indices.sections.get(row.sectionId??'')?.code??'Sección no disponible';
 const rows=collections[part],effectiveStatus=(row:Row)=>part==='assignments'?'active':row.status??'';
 const visible=rows.filter(row=>(!status||effectiveStatus(row)===status)&&`${title(row)} ${detail(row)}`.toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX')));
 const blocked=busy||loading||unavailable||!allowed;
 const current=tabs.find(tab=>tab.id===part)!;
 function openCreate(){setFormError('');setFields({});setDirty(false);setDrawer('create')}
 async function close(){
  if(busy)return;
  if(dirty&&!await ask({title:'Descartar cambios sin guardar',description:'El formulario contiene cambios que aún no se han guardado.',confirmLabel:'Descartar cambios',destructive:true}))return;
  setDrawer(null);setDirty(false);
 }
 async function write(payload:unknown,method:'POST'|'PATCH'){
  const response=await fetch(`${base}/${part}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok){
   const result=await response.json().catch(()=>({error:{code:'REQUEST_FAILED'}})) as {error?:{code?:string}};
   if([401,403].includes(response.status)){setUnavailable(true);setCollections({sections:[],students:[],teachers:[],terms:[],courses:[],enrollments:[],assignments:[]});refreshCapabilities()}
   throw Error(result.error?.code??'REQUEST_FAILED');
  }
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(blocked||operation.current)return;
  const values=new FormData(event.currentTarget);
  const payload=part==='sections'?{termId:values.get('termId'),courseId:values.get('courseId'),code:values.get('code'),capacity:Number(values.get('capacity'))}:part==='enrollments'?{studentId:values.get('studentId'),sectionId:values.get('sectionId')}:{teacherId:values.get('teacherId'),sectionId:values.get('sectionId')};
  const parsed=registryCreate[part].safeParse(payload);
  if(!parsed.success){setFields(Object.fromEntries(parsed.error.issues.map(issue=>[String(issue.path[0]),'Revisa este campo y elige un valor válido.'])));setFormError('Revisa los campos señalados.');return}
  operation.current=true;setBusy(true);setFormError('');setFields({});setNotice('');
  try{await write(parsed.data,'POST');setDrawer(null);setDirty(false);setNotice('Operación realizada y auditada.');await refresh()}
  catch(cause){setFormError(feedback(cause instanceof Error?cause.message:''))}
  finally{operation.current=false;setBusy(false)}
 }
 async function change(row:Row,next=part==='sections'?'closed':'withdrawn'){
  if(blocked||operation.current)return;
  if(!await ask({title:'Confirmar cambio académico',description:`${title(row)} · ${detail(row)}. Se aplicará el estado ${states[next]??next} y quedará auditado.`,confirmLabel:'Aplicar cambio',destructive:true}))return;
  operation.current=true;setBusy(true);setFormError('');setError('');setNotice('');
  try{await write({id:row.id,status:next},'PATCH');setDrawer(null);setNotice('Cambio aplicado y auditado.');await refresh()}
  catch(cause){const message=feedback(cause instanceof Error?cause.message:'');if(drawer)setFormError(message);else setError(message)}
  finally{operation.current=false;setBusy(false)}
 }
 const choices=part==='sections'?null:choice(sections.filter(row=>part==='enrollments'?row.status==='open':row.status!=='archived'),'catalog');
 if(!allowed)return <CapabilityState returnTo={`/dashboard/institutions/${institutionId}/operations`}/>;
 return <div className="sii-academic sii-workspace sii-workspace--operations">
  {!drawer&&confirmation}
  <SiiSectionHeader workspace eyebrow="OPERACIÓN ACADÉMICA" title="Oferta, grupos e inscripciones" description="Consulta los registros de tu institución y prepara las operaciones en un panel contextual." right={<Button variant="outline" disabled={busy||loading} onClick={()=>void refresh()}>Actualizar</Button>}/>
  {error&&<div role="alert" className="sii-catalog-error"><p>{error}</p><Button variant="outline" disabled={busy||loading} onClick={()=>void refresh()}>Actualizar datos</Button></div>}
  {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
  <Tabs value={part} onValueChange={value=>{setPart(value as Part);setQuery('');setStatus('')}}>
   <TabsList className="sii-workspace-tabs" aria-label="Operaciones académicas">{tabs.map(tab=><TabsTrigger key={tab.id} value={tab.id}>{tab.label} <span className="sii-tab-count">{loading?'…':collections[tab.id].length}</span></TabsTrigger>)}</TabsList>
   <section className="sii-panel sii-operation-table" aria-busy={loading}>
    <div className="sii-workspace-toolbar"><h3>{current.label}</h3><Button disabled={blocked} onClick={openCreate}>{current.create}</Button></div>
    <div className="sii-workspace-filters">
     <label>Buscar operaciones<Input ref={search} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nombre, clave, materia o sección"/></label>
     <label>Estado de operación<NativeSelect value={status} onChange={event=>setStatus(event.target.value)}><option value="">Todos los estados</option>{(part==='sections'?['open','closed','archived']:part==='enrollments'?['enrolled','withdrawn']:['active']).map(value=><option key={value} value={value}>{states[value]}</option>)}</NativeSelect></label>
     <Button variant="outline" onClick={()=>{setQuery('');setStatus('');search.current?.focus()}}>Limpiar filtros</Button>
    </div>
    {loading?<SiiSkeleton label="Consultando operaciones institucionales"/>:<>
     <p className="sii-result-count" role="status">{visible.length} de {rows.length} registros{part==='assignments'?' vigentes':''}</p>
     {tabs.map(tab=><TabsContent key={tab.id} value={tab.id}>
      {visible.length?<SiiScrollRegion label={`Tabla de ${current.label.toLocaleLowerCase('es-MX')}, desplazamiento horizontal`}><Table scrollable={false} className="sii-catalog-table">
       <TableHeader><TableRow><TableHead>{part==='sections'?'Sección':part==='enrollments'?'Estudiante':'Docente'}</TableHead><TableHead>{part==='sections'?'Periodo / materia':'Sección'}</TableHead>{part==='sections'&&<TableHead>Cupo</TableHead>}<TableHead>Estado</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
       <TableBody>{visible.map(row=><TableRow key={row.id}><TableCell>{title(row)}</TableCell><TableCell>{detail(row)}</TableCell>{part==='sections'&&<TableCell>{enrollments.filter(item=>item.sectionId===row.id&&item.status==='enrolled').length} / {row.capacity}</TableCell>}<TableCell>{states[effectiveStatus(row)]??effectiveStatus(row)}</TableCell>
        <TableCell><div className="sii-row-actions"><Button variant="outline" disabled={blocked} onClick={()=>{setFormError('');setDirty(false);setDrawer(row)}} aria-label={`Ver detalle de ${title(row)}`}>Ver detalle</Button>
         {(part!=='enrollments'||row.status==='enrolled')&&(part!=='sections'||row.status==='open')&&<Button variant="outline" disabled={blocked} onClick={()=>void change(row)}>{part==='sections'?'Cerrar':part==='enrollments'?'Retirar':'Revocar'}</Button>}</div></TableCell>
       </TableRow>)}</TableBody>
      </Table></SiiScrollRegion>:<SiiEmptyView icon="layers" title={query||status?'No hay operaciones coincidentes':'Sin registros en esta sección'} description={query||status?'Cambia la búsqueda o el estado para recuperar los registros.':'Prepara el primer registro con los catálogos institucionales disponibles.'} action={<Button variant="outline" disabled={blocked} onClick={openCreate}>Preparar registro</Button>}/>}
     </TabsContent>)}
    </>}
   </section>
  </Tabs>
  <SiiDrawer open={drawer!==null} onOpenChange={open=>{if(!open)void close()}} busy={busy} title={drawer==='create'?current.create:'Detalle académico'} description={drawer==='create'?'Revisa los datos antes de guardar. Se comprobarán el cupo y la disponibilidad de los registros seleccionados.':'Consulta el registro y aplica los cambios de estado autorizados.'}>
   {confirmation}
   {formError&&<p id="academic-form-error" role="alert" className="sii-catalog-error">{formError}</p>}
   {drawer==='create'?<form className="sii-catalog-form" onSubmit={event=>void submit(event)} onChange={()=>setDirty(true)} aria-describedby={formError?'academic-form-error':undefined}>
    <fieldset disabled={blocked} className="sii-form-fields">
     {part==='sections'?<>
      <SiiSearchSelect name="termId" label="Periodo" searchLabel="Buscar periodo" options={choice(terms.filter(row=>row.status==='active'),'catalog')} error={fields.termId}/>
      <SiiSearchSelect name="courseId" label="Materia" searchLabel="Buscar materia" options={choice(courses.filter(row=>row.status==='active'),'catalog')} error={fields.courseId}/>
      <div className="sii-form-fields"><label htmlFor="section-code">Grupo / sección</label><Input id="section-code" name="code" required minLength={2} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" aria-invalid={Boolean(fields.code)} aria-describedby="section-code-help" placeholder="9A"/><small id="section-code-help">De 2 a 32 letras, números, guiones o guiones bajos.</small></div>
      <label>Cupo<Input name="capacity" type="number" min={1} max={500} required defaultValue={30} aria-invalid={Boolean(fields.capacity)}/></label>
     </>:<>
      {part==='enrollments'?<SiiSearchSelect name="studentId" label="Estudiante" searchLabel="Buscar estudiante" options={choice(students.filter(row=>row.status==='active'),'person')} error={fields.studentId}/>:<SiiSearchSelect name="teacherId" label="Docente" searchLabel="Buscar docente" options={choice(teachers.filter(row=>row.status==='active'),'person')} error={fields.teacherId}/>}
      <SiiSearchSelect name="sectionId" label="Sección" searchLabel="Buscar sección" options={choices??[]} error={fields.sectionId}/>
     </>}
    </fieldset>
    <div className="sii-drawer-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>void close()}>Cancelar</Button><Button type="submit" disabled={blocked}>{busy?'Guardando…':part==='sections'?'Crear sección':part==='enrollments'?'Confirmar inscripción':'Asignar'}</Button></div>
   </form>:drawer&&<>
    <dl className="sii-detail-list"><div><dt>Registro</dt><dd>{title(drawer)}</dd></div><div><dt>{part==='sections'?'Periodo / materia':'Sección'}</dt><dd>{detail(drawer)}</dd></div><div><dt>Estado</dt><dd>{states[effectiveStatus(drawer)]??effectiveStatus(drawer)}</dd></div></dl>
    {part==='sections'?<div className="sii-drawer-actions">{['open','closed','archived'].filter(value=>value!==drawer.status).map(value=><Button key={value} variant="outline" disabled={blocked} onClick={()=>void change(drawer,value)}>{value==='open'?'Abrir sección':value==='closed'?'Cerrar sección':'Archivar sección'}</Button>)}</div>:(part==='assignments'||drawer.status==='enrolled')&&<Button disabled={blocked} onClick={()=>void change(drawer)}>{part==='enrollments'?'Retirar':'Revocar'}</Button>}
   </>}
  </SiiDrawer>
 </div>;
}
