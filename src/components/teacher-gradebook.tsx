'use client';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import {PersonalTable} from './personal-table';
import {calculateWeightedGrade} from '@/modules/grading/validation';
import {Input} from '@/components/ui/input';

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
  GRADE_PERIOD_CLOSED:'El periodo o grupo está cerrado. Puedes consultar las notas, pero la captura y publicación están bloqueadas.',
  GRADE_ALREADY_PUBLISHED:'Las notas ya fueron publicadas. Los cambios requieren una rectificación autorizada.',
  ACTA_ALREADY_PUBLISHED_CORRECTION_REQUIRED:'Ya existe una publicación. Consulta los resultados oficiales.',
  INCOMPLETE_GRADES:'Faltan notas guardadas. Completa la captura antes de publicar.',
  INVALID_WEIGHT_SUM:'Las ponderaciones deben sumar 100 %.',
  GRADE_SCORE_CONFLICT:'Otra captura cambió esta nota. Actualiza el libro y compara el último valor guardado con tu captura antes de volver a guardar.',
 };
 return messages[code]??'No se pudo completar la operación. Conservamos tus datos; actualiza y vuelve a intentar.';
}

import {useInstitutionConfirmation} from './sii-confirmation';
import {SecurityActionLink} from './institution-capabilities';
import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import {gradebookCell,gradebookScope,useGradebookDrafts} from './teacher-gradebook-drafts';
import {readCollection,CollectionReadError} from '@/shared/client/read-collection';
type Section={id:string;code:string;courseName:string;status:string};
type Component={id:string;code:string;title:string;weight:number};
type Score={id:string;componentId:string;studentId:string;scoreHundredths:number;updatedAt:string};
type Student={studentId:string;enrollmentNumber:string;firstName:string;lastName:string};
type Publication={id:string;version:number;publishedAt:string;publishedBy?:string};
type Result=Student&{id:string;publicationId:string;scoreHundredths:number};
type Snapshot={components:Component[];scores:Score[];publications:Publication[];roster:Student[];section?:{id:string;code:string;courseName:string;status:string;termName:string;termStatus:string};results?:Result[]};

export default function TeacherGradebook({institutionId,initialSectionId,initialView='capture'}:{institutionId:string;initialSectionId?:string;initialView?:'roster'|'capture'|'results'}){
 const {ask,confirmation}=useInstitutionConfirmation();
 const [view,setView]=useState(initialView),[publicationId,setPublicationId]=useState('');
 const base=`/api/v1/institutions/${institutionId}/grading`;
 const {drafts,writeDraft,readDraft,confirmDraft,clearDrafts,hasDrafts,retireActor,identityReady,identityChecking,identityError,revalidateIdentity,isCurrent,authorityEpoch,rememberSection,selectedSection,reconcileSections,restoreFocus}=useGradebookDrafts(institutionId,ask);
 const [sections,setSections]=useState<Section[]>([]);
 const [sectionQuery,setSectionQuery]=useState(0);
 const [sectionId,setSectionId]=useState('');
 const requestedSelection=useRef(initialSectionId);
 const scope=gradebookScope(institutionId,sectionId);
 const [loaded,setLoaded]=useState<{scope:string;epoch:number;value:Snapshot}|null>(null);
 const snapshot=identityReady&&loaded?.scope===scope&&loaded.epoch===authorityEpoch?loaded.value:null;
 useEffect(()=>{if(snapshot)restoreFocus(scope,authorityEpoch);},[snapshot,scope,authorityEpoch,restoreFocus]);
 const loadedScope=useRef(''),activeScope=useRef(''),generation=useRef(0),request=useRef<AbortController|null>(null);
 const operation=useRef<'save'|'publish'|null>(null);
 const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[saving,setSaving]=useState(false),[publishing,setPublishing]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const retirePrivate=useCallback((status=403)=>{
  generation.current++;request.current?.abort();loadedScope.current='';activeScope.current='';
  setLoaded(null);setSections([]);if(status===401)retireActor();else clearDrafts();setLoading(false);setRefreshing(false);
 },[clearDrafts,retireActor]);
 useEffect(()=>{
  if(!identityReady){setSections([]);setLoaded(null);setLoading(identityChecking);return;}
  const controller=new AbortController();
  setSections([]);setSectionId('');setLoaded(null);loadedScope.current='';setLoading(true);setError('');setNotice('');
  void readCollection<Section>(`${base}/sections`,{signal:controller.signal})
   .then(v=>{if(controller.signal.aborted||!isCurrent(authorityEpoch))return;reconcileSections(institutionId,v.data.map(section=>section.id));setSections(v.data);const requested=requestedSelection.current;if(!requested||v.data.some(section=>section.id===requested))requestedSelection.current=undefined;else setError('El grupo solicitado ya no está disponible o no tienes autorización. Selecciona otro grupo.');if(requested&&v.data.some(section=>section.id===requested))rememberSection(institutionId,requested);setSectionId(s=>{const remembered=requested||s||selectedSection(institutionId);return requested&&!v.data.some(section=>section.id===requested)?'':v.data.some(section=>section.id===remembered)?remembered!:v.data[0]?.id||''})})
   .catch(cause=>{if(!controller.signal.aborted){if(cause instanceof CollectionReadError&&[401,403].includes(cause.status))retirePrivate(cause.status);setError('No fue posible consultar tus grupos docentes.')}})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return ()=>controller.abort();
 },[base,retirePrivate,sectionQuery,identityReady,identityChecking,authorityEpoch,isCurrent,institutionId,reconcileSections,selectedSection,rememberSection]);
 const refresh=useCallback(async(id:string)=>{
  const target=gradebookScope(institutionId,id);
  if(!identityReady||!isCurrent(authorityEpoch)||!id||activeScope.current!==target)return false;
  request.current?.abort();const controller=new AbortController();request.current=controller;
  const version=++generation.current;
  const current=()=>!controller.signal.aborted&&generation.current===version&&activeScope.current===target&&isCurrent(authorityEpoch);
  if(loadedScope.current!==target)setLoading(true);
  setRefreshing(true);setError('');
  try{
   const r=await fetch(`${base}?sectionId=${encodeURIComponent(id)}`,{signal:controller.signal,cache:'no-store'});
   if(!current())return false;
   if(!r.ok){
    if(r.status===401||r.status===403){retirePrivate(r.status);setError(userFacingError(r.status===401?'UNAUTHENTICATED':'FORBIDDEN'));return false;}
    throw Error('GRADEBOOK_FAILED');
   }
   const value=await r.json() as Snapshot;
   if(!current())return false;
   loadedScope.current=target;setLoaded({scope:target,epoch:authorityEpoch,value});return true;
  }catch{if(current())setError('No se pudo obtener el libro de calificaciones de esta sección.');return false;}
  finally{if(current()){setLoading(false);setRefreshing(false);}}
 },[base,institutionId,retirePrivate,identityReady,isCurrent,authorityEpoch]);
 useEffect(()=>{
  activeScope.current=scope;void refresh(sectionId);
  return ()=>{request.current?.abort();activeScope.current='';};
 },[scope,sectionId,refresh]);
 async function changeSection(id:string){
  const previous=activeScope.current;
  if(operation.current||id===sectionId)return;
  if(hasDrafts(previous)&&!await ask({title:'Cambiar de grupo con notas sin guardar',description:'Las capturas se conservarán en esta página, separadas por grupo. Aún no están guardadas en el servidor.',confirmLabel:'Cambiar de grupo'}))return;
  if(activeScope.current!==previous||operation.current)return;
  generation.current++;request.current?.abort();activeScope.current=gradebookScope(institutionId,id);
  requestedSelection.current=undefined;rememberSection(institutionId,id);setSectionId(id);setError('');setNotice('');
 }
 async function command(payload:Record<string,unknown>,confirmed?:()=>void){
  if(operation.current||!identityReady||!isCurrent(authorityEpoch))return false;
  const target=scope;
  operation.current=payload.kind==='publish'?'publish':'save';
  setSaving(true);setPublishing(operation.current==='publish');setError('');setNotice('');
  try{
   const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(r.ok){
    const refreshed=activeScope.current===target&&isCurrent(authorityEpoch)?await refresh(sectionId):false;
    const current=activeScope.current===target&&isCurrent(authorityEpoch);
    // Recognize only the sent revision in its original provider, even if the
    // view changed during either wait. Never apply an old snapshot or notice.
    if(refreshed||!current)confirmed?.();
    if(refreshed&&current)setNotice('Operación guardada correctamente.');
    return true;
   }
   if(r.status===401||r.status===403){
    const current=activeScope.current===target&&isCurrent(authorityEpoch);
    retirePrivate(r.status);
    if(current){const info=await r.json().catch(()=>({error:{code:'REQUEST_FAILED'}})) as {error?:{code?:string}};setError(userFacingError(info.error?.code??(r.status===401?'UNAUTHENTICATED':'FORBIDDEN')));}
    return false;
   }
   if(activeScope.current!==target||!isCurrent(authorityEpoch))return false;
   const info=await r.json().catch(()=>({error:{code:'REQUEST_FAILED'}})) as {error?:{code?:string}};
   if(activeScope.current!==target||!isCurrent(authorityEpoch))return false;
   throw Error(info.error?.code??'REQUEST_FAILED');
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
  if(operation.current||!snapshot||snapshot.publications.length||snapshot.section&&(snapshot.section.status!=='open'||snapshot.section.termStatus!=='active'))return;
  const n=Number(raw);
  if(!Number.isFinite(n)||n<0||n>10||!/^\d{1,2}(\.\d{1,2})?$/.test(raw.trim())){
   setError('La calificación debe estar entre 0 y 10, con máximo dos decimales.');return;
  }
  const key=gradebookCell(scope,studentId,componentId),sent=readDraft(key);
  const expectedUpdatedAt=snapshot.scores.find(score=>score.componentId===componentId&&score.studentId===studentId)?.updatedAt??null;
  await command({kind:'score',componentId,studentId,scoreHundredths:Math.round(n*100),expectedUpdatedAt},()=>confirmDraft(key,sent?.revision));
 }
 async function publish(){
  if(!snapshot||!sectionId||snapshot.publications.length||operation.current||hasDrafts(scope)||snapshot.section&&(snapshot.section.status!=='open'||snapshot.section.termStatus!=='active'))return;
  const target=scope;
  if(!await ask({title:'Publicar acta oficial',description:'La publicación es definitiva. No podrás modificar notas sin una rectificación autorizada.',confirmLabel:'Publicar acta',destructive:true}))return;
  if(activeScope.current!==target||operation.current)return;
  if(hasDrafts(target)){setError('Hay notas sin guardar. Guarda las capturas antes de publicar el acta.');return;}
  await command({kind:'publish',sectionId,operationId:crypto.randomUUID()});
 }
 const published=!!snapshot?.publications.length;
 const closed=!!snapshot?.section&&(snapshot.section.status!=='open'||snapshot.section.termStatus!=='active');
 const pending=Array.from(drafts.values()).filter(d=>d.scope===scope);
 const excluded=pending.filter(d=>published||closed||!snapshot?.roster.some(s=>s.studentId===d.studentId)||!snapshot.components.some(c=>c.id===d.componentId));
 async function discardDraft(key:string,revision:number){
  const target=scope;
  if(await ask({title:'Descartar captura local',description:'Esta nota no se guardará ni cambiará el acta oficial. El descarte sólo elimina esta captura de la página.',confirmLabel:'Descartar captura',destructive:true})&&activeScope.current===target)confirmDraft(key,revision);
 }
 const weight=snapshot?.components.reduce((sum,c)=>sum+c.weight,0)??0;
 const lastPersisted=snapshot?.scores.map(score=>score.updatedAt).sort().at(-1);
 const review=snapshot?.roster.map(student=>{
  const parts=snapshot.components.map(component=>{const score=snapshot.scores.find(row=>row.studentId===student.studentId&&row.componentId===component.id);return score?{weight:component.weight,scoreHundredths:score.scoreHundredths}:null;});
  return {...student,id:student.studentId,score:weight===100&&parts.length&&parts.every(part=>part!==null)?calculateWeightedGrade(parts as {weight:number;scoreHundredths:number}[]):null};
 })??[];
 const incomplete=review.some(student=>student.score===null);
 const publication=snapshot?.publications.find(row=>row.id===publicationId)??snapshot?.publications[0];
 const results=snapshot?.results?.filter(result=>result.publicationId===publication?.id)??[];
 return <div className="sii-academic siii-glass-workspace min-w-0 space-y-5">
 {confirmation}
  <SiiSectionHeader workspace eyebrow="DOCENCIA · EVALUACIÓN" title="Libro de calificaciones" description="Captura privada, revisión y resultados oficiales. Escala institucional de 0 a 10."/>
  {(error||identityError)&&<div className="sii-catalog-error" role="alert"><p>{error||identityError}</p><Button variant="outline" type="button" onClick={()=>{if(!identityReady)void revalidateIdentity();else if(sections.length)void refresh(sectionId);else setSectionQuery(v=>v+1);}}>Reintentar consulta</Button></div>}
  {notice&&<p className="sii-catalog-notice" role="status">{notice}</p>}
  <label className="block space-y-2 font-medium">Materia y grupo asignado<NativeSelect value={identityReady?sectionId:''} onChange={event=>void changeSection(event.target.value)} disabled={saving||loading}>
   {!sectionId&&<option value="">{sections.length?'Selecciona un grupo autorizado':'Sin secciones asignadas'}</option>}{(identityReady?sections:[]).map(section=><option key={section.id} value={section.id}>{section.courseName} · {section.code}</option>)}
  </NativeSelect></label>
  {loading?<p role="status">Consultando calificaciones…</p>:!sections.length&&!error&&!identityError?<p>No tienes grupos autorizados para evaluación.</p>:null}
  {snapshot&&<>
   {refreshing&&<p role="status">Actualizando calificaciones…</p>}
   {snapshot.section&&<p className="text-sm text-muted-foreground">{snapshot.section.courseName} · {snapshot.section.code} · {snapshot.section.termName}</p>}
   {closed&&<p role="status" className="rounded-lg border bg-muted p-4">Periodo cerrado. Las calificaciones están disponibles para consulta; la captura y publicación están bloqueadas.</p>}
   <Tabs value={view} onValueChange={value=>setView(value as typeof view)} className="min-w-0 space-y-4">
    <TabsList aria-label="Operaciones del grupo" className="sii-grading-navigation flex h-auto w-full flex-wrap justify-start gap-1"><TabsTrigger className="min-h-11" value="roster">Lista oficial</TabsTrigger><TabsTrigger className="min-h-11" value="capture">Captura y revisión</TabsTrigger><TabsTrigger className="min-h-11 whitespace-normal" value="results">Resultados y actas</TabsTrigger></TabsList>
    <TabsContent value="roster" className="space-y-4"><h3 className="text-lg font-semibold">Lista oficial</h3><p className="text-sm text-muted-foreground">Estudiantes con inscripción vigente en este grupo. Las altas, bajas y cambios corresponden a Control Escolar.</p>
     <PersonalTable label="Lista oficial" rows={snapshot.roster.map(student=>({...student,id:student.studentId}))} searchText={student=>student.enrollmentNumber+' '+student.firstName+' '+student.lastName} columns={[{label:'Matrícula',render:student=>student.enrollmentNumber},{label:'Nombre',render:student=>student.firstName+' '+student.lastName},{label:'Estado',render:()=> 'Inscrito'},{label:'Grupo',render:()=>snapshot.section?.code??sections.find(section=>section.id===sectionId)?.code}]}/>
    </TabsContent>
    <TabsContent value="capture" className="min-w-0 space-y-5">
     <p role="status" className="text-sm text-muted-foreground">{lastPersisted?'Última persistencia confirmada: '+new Date(lastPersisted).toLocaleString('es-MX'):'Aún no hay notas guardadas en el servidor.'} Las capturas sin guardar permanecen temporalmente en esta sesión del dashboard.</p>
     {published?<div className="sii-panel space-y-3"><p>Acta publicada. Los cambios requieren una rectificación autorizada.</p><p>Consulta las notas finales en Resultados y actas.</p><Button variant="outline" onClick={()=>setView('results')}>Consultar resultados oficiales</Button></div>:<>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2"><section className="sii-panel min-w-0 space-y-4"><h3 className="text-lg font-semibold">Evaluaciones · {weight} % / 100 %</h3><PersonalTable label="Evaluaciones configuradas" rows={snapshot.components} columns={[{label:'Clave',render:component=>component.code},{label:'Evaluación',render:component=>component.title},{label:'Ponderación',render:component=>component.weight+' %'}]}/></section>
       {!closed&&<aside className="sii-panel min-w-0 space-y-4"><h3 className="text-lg font-semibold">Agregar evaluación</h3><form className="space-y-4" onSubmit={event=>void addComponent(event)}><label className="block space-y-2">Clave<Input name="code" minLength={2} maxLength={30} required placeholder="P1"/></label><label className="block space-y-2">Descripción<Input name="title" minLength={3} maxLength={160} required placeholder="Primer parcial"/></label><label className="block space-y-2">Ponderación (%)<Input type="number" min={1} max={Math.max(1,100-weight)} name="weight" required/></label><Button className="h-auto min-h-11 max-w-full whitespace-normal" type="submit" disabled={saving||weight>=100}>Guardar evaluación</Button></form></aside>}
      </div>
      <section className="min-w-0 space-y-4"><h3 className="text-lg font-semibold">Captura por estudiante</h3>{!snapshot.roster.length?<p>No hay estudiantes inscritos en esta sección.</p>:!snapshot.components.length?<p>Sin evaluaciones disponibles. Configura las ponderaciones antes de capturar notas.</p>:snapshot.roster.map(student=><article key={student.studentId} className="sii-panel min-w-0 space-y-4"><h4 className="break-words font-semibold">{student.enrollmentNumber}<span className="block text-sm font-normal text-muted-foreground">{student.firstName} {student.lastName}</span></h4><div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{snapshot.components.map(component=>{
       const key=gradebookCell(scope,student.studentId,component.id),score=snapshot.scores.find(row=>row.studentId===student.studentId&&row.componentId===component.id);
       return closed?<p key={component.id}>{component.title}: {score?(score.scoreHundredths/100).toFixed(2):'Sin captura'}</p>:<form key={component.id} className="min-w-0 space-y-2 rounded-lg border p-3" onSubmit={event=>{event.preventDefault();void saveScore(component.id,student.studentId,String(new FormData(event.currentTarget).get('grade')??''))}}>
        <label className="block space-y-2 text-sm">{component.title} · {component.weight} %<Input data-gradebook-cell={key} aria-label={`${student.enrollmentNumber} · ${component.title}`} type="number" name="grade" min="0" max="10" step="0.01" value={drafts.get(key)?.raw??(score?(score.scoreHundredths/100).toFixed(2):'')} onChange={event=>{if(operation.current!=='publish')writeDraft(scope,student.studentId,component.id,`${student.enrollmentNumber} · ${component.title}`,event.target.value);}} disabled={publishing} required/></label>
        {drafts.has(key)&&<small className="block">Último guardado: {score?(score.scoreHundredths/100).toFixed(2):'Sin captura'}</small>}<Button variant="outline" type="submit" disabled={saving}>Guardar</Button>
       </form>;
      })}</div></article>)}</section>
      <section className="sii-panel min-w-0 space-y-4"><h3 className="text-lg font-semibold">Revisión de captura guardada</h3><p className="text-sm text-muted-foreground">Cálculo ponderado sobre notas persistidas. Esta revisión es privada y todavía no constituye una publicación oficial.</p><PersonalTable label="Revisión de resultados" rows={review} columns={[{label:'Matrícula',render:student=>student.enrollmentNumber},{label:'Estudiante',render:student=>student.firstName+' '+student.lastName},{label:'Resultado ponderado',render:student=>student.score===null?'Captura incompleta':(student.score/100).toFixed(2)}]}/></section>
      <section className="sii-panel space-y-4"><h3 className="text-lg font-semibold">Publicación oficial</h3><p>La publicación requiere verificación reciente de tu autenticador y todas las notas guardadas. Los resultados publicados son inmutables.</p><SecurityActionLink returnTo={`/dashboard/institutions/${institutionId}/grading?sectionId=${sectionId}`}/>
       {pending.length>0&&<p role="status">Hay {pending.length} notas sin guardar en este grupo. Guárdalas antes de publicar.</p>}{incomplete&&<p role="status">Faltan notas persistidas para completar la revisión.</p>}
       {!closed&&<Button type="button" disabled={saving||refreshing||pending.length>0||weight!==100||!snapshot.roster.length||incomplete} onClick={()=>void publish()}>Publicar acta oficial</Button>}
      </section>
     </>}
    </TabsContent>
    <TabsContent value="results" className="min-w-0 space-y-4"><h3 className="text-lg font-semibold">Resultados y actas</h3>{publication?<>
     <label className="block space-y-2">Versión publicada<NativeSelect value={publication.id} onChange={event=>setPublicationId(event.target.value)}>{snapshot.publications.map(row=><option key={row.id} value={row.id}>Versión {row.version} · {new Date(row.publishedAt).toLocaleString('es-MX')}</option>)}</NativeSelect></label>
     <p className="break-words text-sm text-muted-foreground">Publicación: {publication.id} · Responsable: {publication.publishedBy??'Registrado por la institución'}</p>
     <PersonalTable label="Resultados oficiales publicados" rows={results} columns={[{label:'Matrícula',render:student=>student.enrollmentNumber},{label:'Estudiante',render:student=>student.firstName+' '+student.lastName},{label:'Calificación publicada',render:student=>(student.scoreHundredths/100).toFixed(2)},{label:'Rectificación',render:student=><Link className="font-medium text-primary underline" href={{pathname:`/dashboard/institutions/${institutionId}/grading/corrections`,query:{sectionId,studentId:student.studentId,publicationId:student.publicationId}}}>Solicitar rectificación<span className="sr-only"> de {student.enrollmentNumber}</span></Link>}]}/>
     <p className="text-sm text-muted-foreground">Consulta de resultados institucionales. Esta vista no emite un documento certificado. Las rectificaciones siguen el procedimiento configurado por la institución; su aprobación y aplicación requieren autoridades explícitas.</p>
    </>:<p>No hay resultados publicados para este grupo. Las notas en captura permanecen privadas.</p>}</TabsContent>
   </Tabs>
   {excluded.length>0&&<section aria-label={published?'Captura local no incluida en el acta':'Captura local fuera del listado'} className="sii-panel space-y-3"><h3>{published?'Captura local no incluida en el acta':'Captura local fuera del listado'}</h3><p>Estas capturas locales no son notas oficiales. El listado o el acta cambió; se conservan para consulta o descarte explícito. No se pueden guardar desde aquí.</p><ul>{excluded.map(draft=>{const key=gradebookCell(scope,draft.studentId,draft.componentId);return <li key={key}>{draft.label}: {draft.raw||'(vacío)'} <Button variant="outline" type="button" aria-label={`Descartar captura ${draft.label}`} onClick={()=>void discardDraft(key,draft.revision)}>Descartar captura local</Button></li>})}</ul></section>}
  </>}
 </div>;
}
