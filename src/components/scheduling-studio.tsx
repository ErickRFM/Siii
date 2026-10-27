'use client';
import {CapabilityState,hasInstitutionCapability,useInstitutionCapabilities} from './institution-capabilities';
import {SiiDrawer} from './ui/sii-workspace';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import {AcademicWeek,weekDates} from './academic-week';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {Input} from '@/components/ui/input';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';

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
import {readCollection} from '@/shared/client/read-collection';
import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
type Row={id:string;code?:string;name?:string;campusId?:string;building?:string;capacity?:number;sectionId?:string;roomId?:string;weekday?:number;startMinute?:number;endMinute?:number;status?:string;isActive?:boolean};
type Occ={id:string;date:string;state:string;sectionCode:string;courseName:string;roomCode:string;roomBuilding:string;startMinute:number;endMinute:number;reason?:string|null};
const days=['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const minutes=(x:string)=>{const [h,m]=x.split(':').map(Number);return h*60+m};
const clock=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const initialWeek=()=>{const d=new Date(),day=d.getDay()||7;d.setDate(d.getDate()-(day-1));return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export default function SchedulingStudio({institutionId}:{institutionId:string}){
 const {ask,confirmation,cancel:cancelConfirmation}=useInstitutionConfirmation();
 const {data:capabilities}=useInstitutionCapabilities();
 const allowed=['programs','courses','curricula','terms','campuses'].every(resource=>hasInstitutionCapability(capabilities,resource+'.manage'));
 const base=`/api/v1/institutions/${institutionId}`;
 const [campuses,setCampuses]=useState<Row[]>([]),[rooms,setRooms]=useState<Row[]>([]),[sections,setSections]=useState<Row[]>([]),[patterns,setPatterns]=useState<Row[]>([]);
 const [week,setWeek]=useState(initialWeek),[occurrences,setOccurrences]=useState<Occ[]>([]);
 const [panel,setPanel]=useState<'room'|'pattern'|null>(null),[dirty,setDirty]=useState(false);
 const [weekLoading,setWeekLoading]=useState(true),[weekError,setWeekError]=useState('');
 const [weekTruncated,setWeekTruncated]=useState(false),[patternsTruncated,setPatternsTruncated]=useState(false);
 const catalogRequest=useRef<AbortController|null>(null),weekLoader=useRef<(()=>Promise<void>)|null>(null);
 const weekRequest=useRef<AbortController|null>(null),savingRef=useRef(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const read=useCallback((path:string,signal?:AbortSignal)=>readCollection<Row>(`${base}/${path}`,{signal}),[base]);
 const refresh=useCallback(async()=>{
  catalogRequest.current?.abort();const request=new AbortController();catalogRequest.current=request;setLoading(true);
  try{
   const results=await Promise.all([read('academic/campuses',request.signal),read('rooms',request.signal),read('sections',request.signal),read('schedule-patterns',request.signal)]);
   if(request.signal.aborted)return;setPatternsTruncated(Boolean(results[3].truncated));
   setCampuses(results[0].data);setRooms(results[1].data);setSections(results[2].data);setPatterns(results[3].data);setError('');
  }catch{if(!request.signal.aborted){setCampuses([]);setRooms([]);setSections([]);setPatterns([]);setError('No se pudieron consultar los catálogos. Revisa tu conexión y permisos.')}}
  finally{if(!request.signal.aborted)setLoading(false)}
 },[read]);
 useEffect(()=>{void refresh();return ()=>catalogRequest.current?.abort()},[refresh]);
 const loadWeek=useCallback(async()=>{
  weekRequest.current?.abort();const request=new AbortController();weekRequest.current=request;setWeekLoading(true);setWeekError('');setOccurrences([]);setWeekTruncated(false);
  if(!week){setWeekLoading(false);return;}
  try{const result=await readCollection<Occ>(base+'/occurrences?weekOf='+encodeURIComponent(weekDates(week)[0]??week),{signal:request.signal});if(!request.signal.aborted){setOccurrences(result.data);setWeekTruncated(Boolean(result.truncated))}}
  catch{if(!request.signal.aborted)setWeekError('No fue posible consultar la semana. Reintenta la consulta.')}
  finally{if(!request.signal.aborted)setWeekLoading(false)}
 },[base,week]);
 useEffect(()=>{weekLoader.current=loadWeek;void loadWeek();return ()=>weekRequest.current?.abort()},[loadWeek]);
 const hadAuthority=useRef(false);
 useEffect(()=>{
  if(allowed){if(hadAuthority.current)void Promise.all([refresh(),weekLoader.current?.()]);hadAuthority.current=true;return;}
  if(!hadAuthority.current)return;
  catalogRequest.current?.abort();weekRequest.current?.abort();cancelConfirmation();setPanel(null);setDirty(false);setNotice('');
  setOccurrences([]);setCampuses([]);setRooms([]);setSections([]);setPatterns([]);
 },[allowed,refresh,cancelConfirmation]);
 async function closePanel(){
  if(saving)return;
  if(dirty&&!await ask({title:'Descartar cambios sin guardar',description:'El formulario contiene datos que todavía no se guardaron.',confirmLabel:'Descartar cambios',destructive:true}))return;
  setPanel(null);setDirty(false);
 }
 function changeWeek(offset:number){const dates=weekDates(week);if(!dates.length)return;const date=new Date(dates[0]+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);setWeek(date.toISOString().slice(0,10))}
 async function send(path:string,payload:Record<string,unknown>,method:'POST'|'PATCH'='POST'){
  if(savingRef.current)return false;savingRef.current=true;
  setSaving(true);setError('');setNotice('');
  try{
   const r=await fetch(`${base}/${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!r.ok){const v=await r.json().catch(()=>({error:{code:'REQUEST_FAILED'}})) as {error?:{code?:string}};throw Error(v.error?.code??'REQUEST_FAILED')}
   setNotice('La operación quedó registrada.');await Promise.all([refresh(),weekLoader.current?.()]);return true;
  }catch(e){setError(userFacingError(e instanceof Error?e.message:'ERROR'));return false}
  finally{savingRef.current=false;setSaving(false)}
 }
 async function addRoom(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,v=new FormData(form);
  const ok=await send('rooms',{campusId:String(v.get('campusId')??''),code:String(v.get('code')??''),building:String(v.get('building')??''),capacity:Number(v.get('capacity')??0)});
  if(ok){form.reset();setPanel(null);setDirty(false)}
 }
 async function addPattern(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,v=new FormData(form);
  if(minutes(String(v.get('end')))<=minutes(String(v.get('start')))){setError('La hora de fin debe ser posterior al inicio.');return;}
  const ok=await send('schedule-patterns',{sectionId:String(v.get('sectionId')??''),roomId:String(v.get('roomId')??''),weekday:Number(v.get('weekday')),startMinute:minutes(String(v.get('start')??'')),endMinute:minutes(String(v.get('end')??''))});
  if(ok){form.reset();setPanel(null);setDirty(false)}
 }
 async function cancel(occ:Occ){
  const reason=await ask({title:'Cancelar clase programada',description:'La cancelación se registrará en el historial. Indica el motivo para continuar.',reasonLabel:'Motivo de cancelación',minReasonLength:6,confirmLabel:'Cancelar ocurrencia',destructive:true});
  if(!reason)return;
  await send('occurrences',{id:occ.id,state:'CANCELLED',reason:reason.trim()},'PATCH');
 }
 if(!allowed)return <CapabilityState returnTo={`/dashboard/institutions/${institutionId}/scheduling`}/>;
 return <div className="sii-academic sii-workspace sii-workspace--scheduling siii-glass-workspace">
 {!panel&&confirmation}
 <SiiSectionHeader workspace eyebrow="COORDINACIÓN ACADÉMICA" title="Planificador semanal" description="Consulta la semana completa y prepara aulas o clases sin perder el contexto del calendario."
 right={<div className="sii-row-actions"><Button variant="outline" disabled={loading||saving} onClick={()=>{setDirty(false);setError('');setPanel('room')}}>Añadir aula</Button><Button disabled={loading||saving} onClick={()=>{setDirty(false);setError('');setPanel('pattern')}}>Programar clase recurrente</Button></div>}/>
 {!panel&&error&&<p role="alert" className="sii-catalog-error">{error}</p>}
 {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
 <Tabs defaultValue="week">
  <TabsList aria-label="Vistas del planificador" className="sii-workspace-tabs"><TabsTrigger value="week">Semana</TabsTrigger><TabsTrigger value="patterns">Clases recurrentes <span className="sii-tab-count">{patterns.length}</span></TabsTrigger></TabsList>
  <TabsContent value="week"><section className="sii-panel sii-calendar-panel">
   <div className="sii-workspace-toolbar"><h3>Agenda semanal</h3><div className="sii-row-actions"><Button variant="outline" disabled={!week||weekLoading||saving} onClick={()=>changeWeek(-7)}>Semana anterior</Button><Button variant="outline" disabled={!week||weekLoading||saving} onClick={()=>changeWeek(7)}>Semana siguiente</Button></div></div>
   <div className="sii-week-controls"><label>Inicio de semana<Input type="date" disabled={saving} value={week} onChange={event=>setWeek(event.target.value)}/></label><Button variant="outline" disabled={weekLoading||loading} onClick={()=>void Promise.all([refresh(),loadWeek()])}>Actualizar agenda</Button></div>
   {weekError?<div role="alert" className="sii-catalog-error"><p>{weekError}</p><Button variant="outline" onClick={()=>void loadWeek()}>Reintentar semana</Button></div>:weekLoading?<p role="status">Consultando semana…</p>:!week?<p role="status">Selecciona una fecha para consultar la semana.</p>:<><p className="sii-result-count" role="status">{occurrences.length} clases consultadas{weekTruncated?' · Se alcanzó el límite de 500 clases consultadas; esta semana está incompleta.':''}</p><AcademicWeek week={week} occurrences={occurrences} busy={saving} onCancel={occurrence=>void cancel(occurrence)}/></>}
  </section></TabsContent>
  <TabsContent value="patterns">  <section className="sii-panel sii-catalog-table-panel"><h3>Patrones programados · {patterns.length}</h3>{patternsTruncated&&<p role="status">Se alcanzó el límite de 200 patrones consultados. La consulta está incompleta.</p>}
   <SiiScrollRegion label="Tabla de horarios, desplazamiento horizontal"><Table scrollable={false} className="sii-catalog-table"><TableHeader><TableRow><TableHead>Sección</TableHead><TableHead>Día</TableHead><TableHead>Horario</TableHead><TableHead>Aula</TableHead></TableRow></TableHeader>
    <TableBody>{patterns.map(p=><TableRow key={p.id}><TableCell>{sections.find(s=>s.id===p.sectionId)?.code??p.sectionId}</TableCell>
     <TableCell>{days[p.weekday??0]??'—'}</TableCell><TableCell>{clock(p.startMinute??0)}–{clock(p.endMinute??0)}</TableCell>
     <TableCell>{rooms.find(r=>r.id===p.roomId)?.code??p.roomId}</TableCell></TableRow>)}</TableBody></Table></SiiScrollRegion>
  </section>
</TabsContent>
 </Tabs>
 <SiiDrawer open={panel!==null} busy={saving} onOpenChange={open=>{if(!open)void closePanel()}} title={panel==='room'?'Añadir aula':'Programar clase recurrente'} description="Revisa los datos antes de guardar. Se comprobarán el cupo y los conflictos de aula, docente y estudiantes.">
  {confirmation}{error&&<p role="alert" id="schedule-form-error" className="sii-catalog-error">{error}</p>}
  <div onChange={()=>setDirty(true)}><fieldset className="sii-form-fields" disabled={saving||loading} aria-describedby={error?'schedule-form-error':undefined}>
  {panel==='room'?<>
    <form className="sii-catalog-form" onSubmit={e=>void addRoom(e)}>
     <div className="sii-form-fields"><label htmlFor="schedule-campus">Campus</label><NativeSelect id="schedule-campus" name="campusId" required defaultValue=""><option value="" disabled>Seleccionar campus</option>
      {campuses.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</NativeSelect></div>
     <label>Clave del aula<Input name="code" placeholder="A101" required/></label>
     <label>Edificio<Input name="building" placeholder="Edificio A" required/></label>
     <label>Capacidad<Input type="number" name="capacity" min={1} max={5000} required defaultValue={30}/></label>
     <Button variant="default" type="submit" disabled={saving||loading||!campuses.length} className="sii-submit">{saving?'Guardando…':'Guardar aula'}</Button>
    </form>
</>:<>
    <form className="sii-catalog-form" onSubmit={e=>void addPattern(e)}>
     <div className="sii-form-fields"><label htmlFor="schedule-section">Sección</label><NativeSelect id="schedule-section" name="sectionId" required defaultValue=""><option value="" disabled>Seleccionar sección</option>
      {sections.filter(x=>x.status==='open').map(x=><option value={x.id} key={x.id}>{x.code}</option>)}</NativeSelect></div>
     <div className="sii-form-fields"><label htmlFor="schedule-room">Aula</label><NativeSelect id="schedule-room" name="roomId" required defaultValue=""><option value="" disabled>Seleccionar aula</option>
      {rooms.filter(x=>x.isActive).map(x=><option value={x.id} key={x.id}>{x.building} · {x.code} ({x.capacity})</option>)}</NativeSelect></div>
     <div className="sii-form-fields"><label htmlFor="schedule-day">Día</label><NativeSelect id="schedule-day" name="weekday" defaultValue="1">{days.slice(1).map((day,i)=><option value={i+1} key={day}>{day}</option>)}</NativeSelect></div>
     <label>Inicio<Input name="start" type="time" defaultValue="07:00" required/></label>
     <label>Fin<Input name="end" type="time" defaultValue="09:00" required/></label>
     <Button variant="default" type="submit" disabled={saving||loading||!rooms.length||!sections.length} className="sii-submit">{saving?'Guardando…':'Comprobar y programar'}</Button>
    </form></>}
  </fieldset></div>
 </SiiDrawer>
 </div>;
}
