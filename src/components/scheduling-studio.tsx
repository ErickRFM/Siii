'use client';
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
import { useCallback,useEffect,useState,type FormEvent } from 'react';
type Row={id:string;code?:string;name?:string;campusId?:string;building?:string;capacity?:number;sectionId?:string;roomId?:string;weekday?:number;startMinute?:number;endMinute?:number;status?:string;isActive?:boolean};
type Occ={id:string;date:string;state:string;sectionCode:string;courseName:string;roomCode:string;roomBuilding:string;startMinute:number;endMinute:number;reason?:string|null};
const days=['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const minutes=(x:string)=>{const [h,m]=x.split(':').map(Number);return h*60+m};
const clock=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const initialWeek=()=>{const d=new Date(),day=d.getDay()||7;d.setDate(d.getDate()-(day-1));return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export default function SchedulingStudio({institutionId}:{institutionId:string}){
 const {ask,confirmation}=useInstitutionConfirmation();
 const base=`/api/v1/institutions/${institutionId}`;
 const [campuses,setCampuses]=useState<Row[]>([]),[rooms,setRooms]=useState<Row[]>([]),[sections,setSections]=useState<Row[]>([]),[patterns,setPatterns]=useState<Row[]>([]);
 const [week,setWeek]=useState(initialWeek),[occurrences,setOccurrences]=useState<Occ[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const read=useCallback((path:string)=>readCollection<Row>(`${base}/${path}`),[base]);
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const results=await Promise.all([read('academic/campuses'),read('rooms'),read('sections'),read('schedule-patterns')]);
   setCampuses(results[0].data);setRooms(results[1].data);setSections(results[2].data);setPatterns(results[3].data);setError('');
  }catch{setError('No se pudieron consultar todos los catálogos; revisa permisos y migraciones.')}
  finally{setLoading(false)}
 },[read]);
 useEffect(()=>{void refresh()},[refresh]);
 const loadWeek=useCallback(async()=>{
  try{
   const r=await read(`occurrences?weekOf=${encodeURIComponent(week)}`);
   setOccurrences(r.data as unknown as Occ[]);
  }catch{setOccurrences([]);setError('No fue posible consultar las ocurrencias de la semana.')}
 },[read,week]);
 useEffect(()=>{void loadWeek()},[loadWeek]);
 async function send(path:string,payload:Record<string,unknown>,method:'POST'|'PATCH'='POST'){
  setSaving(true);setError('');setNotice('');
  try{
   const r=await fetch(`${base}/${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!r.ok){const v=await r.json().catch(()=>({error:{code:'REQUEST_FAILED'}})) as {error?:{code?:string}};throw Error(v.error?.code??'REQUEST_FAILED')}
   setNotice('La operación quedó registrada.');await Promise.all([refresh(),loadWeek()]);return true;
  }catch(e){setError(userFacingError(e instanceof Error?e.message:'ERROR'));return false}
  finally{setSaving(false)}
 }
 async function addRoom(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,v=new FormData(form);
  const ok=await send('rooms',{campusId:String(v.get('campusId')??''),code:String(v.get('code')??''),building:String(v.get('building')??''),capacity:Number(v.get('capacity')??0)});
  if(ok)form.reset();
 }
 async function addPattern(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,v=new FormData(form);
  const ok=await send('schedule-patterns',{sectionId:String(v.get('sectionId')??''),roomId:String(v.get('roomId')??''),weekday:Number(v.get('weekday')),startMinute:minutes(String(v.get('start')??'')),endMinute:minutes(String(v.get('end')??''))});
  if(ok)form.reset();
 }
 async function cancel(occ:Occ){
  const reason=await ask({title:'Cancelar clase programada',description:'La cancelación se registrará en el historial. Indica el motivo para continuar.',reasonLabel:'Motivo de cancelación',minReasonLength:6,confirmLabel:'Cancelar ocurrencia',destructive:true});
  if(!reason)return;
  await send('occurrences',{id:occ.id,state:'CANCELLED',reason:reason.trim()},'PATCH');
 }
 return <div className="sii-academic">
 {confirmation}
  <SiiSectionHeader workspace eyebrow="COORDINACIÓN ACADÉMICA" title="Planificador semanal"
    description="Conflictos de aula, docente y alumnos verificados antes de crear las ocurrencias."/>
  {error&&<div className="sii-catalog-error" role="alert"><p>{error}</p><Button variant="outline" type="button" className="sii-outline-button" disabled={loading} onClick={()=>void Promise.all([refresh(),loadWeek()])}>Reintentar consulta</Button></div>}
  {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
  <div className="sii-catalog-layout">
   <section className="sii-panel sii-catalog-create"><h3>Añadir aula</h3>
    <form className="sii-catalog-form" onSubmit={e=>void addRoom(e)}>
     <label>Campus<NativeSelect name="campusId" required defaultValue=""><option value="" disabled>Seleccionar campus</option>
      {campuses.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</NativeSelect></label>
     <label>Clave del aula<Input name="code" placeholder="A101" required/></label>
     <label>Edificio<Input name="building" placeholder="Edificio A" required/></label>
     <label>Capacidad<Input type="number" name="capacity" min={1} max={5000} required defaultValue={30}/></label>
     <Button variant="default" type="submit" disabled={saving||loading||!campuses.length} className="sii-submit">Guardar aula</Button>
    </form></section>
   <section className="sii-panel sii-catalog-create"><h3>Programar clase recurrente</h3>
    <form className="sii-catalog-form" onSubmit={e=>void addPattern(e)}>
     <label>Sección<NativeSelect name="sectionId" required defaultValue=""><option value="" disabled>Seleccionar sección</option>
      {sections.filter(x=>x.status==='open').map(x=><option value={x.id} key={x.id}>{x.code}</option>)}</NativeSelect></label>
     <label>Aula<NativeSelect name="roomId" required defaultValue=""><option value="" disabled>Seleccionar aula</option>
      {rooms.filter(x=>x.isActive).map(x=><option value={x.id} key={x.id}>{x.building} · {x.code} ({x.capacity})</option>)}</NativeSelect></label>
     <label>Día<NativeSelect name="weekday" defaultValue="1">{days.slice(1).map((day,i)=><option value={i+1} key={day}>{day}</option>)}</NativeSelect></label>
     <label>Inicio<Input name="start" type="time" defaultValue="07:00" required/></label>
     <label>Fin<Input name="end" type="time" defaultValue="09:00" required/></label>
     <Button variant="default" type="submit" disabled={saving||loading||!rooms.length||!sections.length} className="sii-submit">Comprobar y programar</Button>
    </form></section>
  </div>
  <section className="sii-panel sii-catalog-table-panel"><h3>Patrones programados · {patterns.length}</h3>
   <SiiScrollRegion label="Tabla de horarios, desplazamiento horizontal"><Table scrollable={false} className="sii-catalog-table"><TableHeader><TableRow><TableHead>Sección</TableHead><TableHead>Día</TableHead><TableHead>Horario</TableHead><TableHead>Aula</TableHead></TableRow></TableHeader>
    <TableBody>{patterns.map(p=><TableRow key={p.id}><TableCell>{sections.find(s=>s.id===p.sectionId)?.code??p.sectionId}</TableCell>
     <TableCell>{days[p.weekday??0]??'—'}</TableCell><TableCell>{clock(p.startMinute??0)}–{clock(p.endMinute??0)}</TableCell>
     <TableCell>{rooms.find(r=>r.id===p.roomId)?.code??p.roomId}</TableCell></TableRow>)}</TableBody></Table></SiiScrollRegion>
  </section>
  <section className="sii-panel sii-catalog-table-panel"><h3>Ocurrencias de una semana</h3>
   <label>Inicio de semana <Input type="date" value={week} onChange={e=>setWeek(e.target.value)}/></label>
   <SiiScrollRegion label="Tabla de sesiones, desplazamiento horizontal"><Table scrollable={false} className="sii-catalog-table"><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Materia / sección</TableHead><TableHead>Hora</TableHead><TableHead>Aula</TableHead><TableHead>Estado / acción</TableHead></TableRow></TableHeader>
    <TableBody>{occurrences.map(o=><TableRow key={o.id}><TableCell>{o.date}</TableCell><TableCell>{o.courseName} · {o.sectionCode}</TableCell>
     <TableCell>{clock(o.startMinute)}–{clock(o.endMinute)}</TableCell><TableCell>{o.roomBuilding} · {o.roomCode}</TableCell>
     <TableCell>{o.state} {o.state!=='CANCELLED'&&<Button variant="outline" type="button" disabled={saving} onClick={()=>void cancel(o)}>Cancelar</Button>}</TableCell>
    </TableRow>)}</TableBody></Table></SiiScrollRegion>
   {!occurrences.length&&<p>Aún no hay clases programadas en este intervalo.</p>}
  </section>
 </div>;
}
