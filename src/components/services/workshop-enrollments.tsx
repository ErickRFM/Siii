'use client';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {SiiSectionHeader} from '@/components/ui/sii-kit';
import {SiiStatusBadge} from '@/components/ui/sii-institutional';
import {SiiFeedback} from '@/components/ui/sii-feedback';
import {useInstitutionConfirmation} from '../sii-confirmation';
import {useOnlineStatus} from '@/shared/client/use-online-status';
import {readCollection} from '@/shared/client/read-collection';
import {userFacingError} from '@/shared/client/user-facing-error';
import {formatDateTime} from '@/shared/format/date-time';

type Workshop={id:string;title:string;status:string;startsAt:string;endsAt:string;capacity:number};
type Enrollment={id:string;workshopId:string;studentId:string;status:'ENROLLED'|'WITHDRAWN'};
type Student={id:string;enrollmentNumber:string;firstName:string;lastName:string;status:string};

const WORKSHOP_MESSAGES:Readonly<Record<string,string>>={
 WORKSHOP_FULL:'El taller ya alcanzó su cupo.',
 WORKSHOP_NOT_OPEN:'El taller no está publicado o ya comenzó; no admite inscripciones.',
 STUDENT_OR_WORKSHOP_UNAVAILABLE:'El alumno o el taller ya no están disponibles.',
 WORKSHOP_NOT_FOUND:'El taller ya no existe. Actualiza la lista.',
 NOT_ENROLLED:'El alumno ya no estaba inscrito.',
};
const fullName=(row:{firstName:string;lastName:string})=>`${row.firstName} ${row.lastName}`.trim();

/** Staff enrollment for published workshops; capacity and timing are enforced by the API. */
export function WorkshopEnrollments({institutionId}:{institutionId:string}){
 const online=useOnlineStatus(),{ask,confirmation}=useInstitutionConfirmation();
 const [workshops,setWorkshops]=useState<Workshop[]>([]),[enrollments,setEnrollments]=useState<Enrollment[]>([]),[students,setStudents]=useState<Student[]>([]);
 const [workshopId,setWorkshopId]=useState(''),[studentId,setStudentId]=useState('');
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 const base=`/api/v1/institutions/${institutionId}`;

 const load=useCallback(async(signal:AbortSignal)=>{
  setLoading(true);
  try{
   const [w,e,s]=await Promise.all([
    readCollection<Workshop>(`${base}/workshops`,{signal}),readCollection<Enrollment>(`${base}/workshop-enrollments`,{signal}),
    readCollection<Student>(`${base}/registry/students?limit=100`,{signal}),
   ]);
   if(signal.aborted)return;setWorkshops(w.data);setEnrollments(e.data);setStudents(s.data);setError('');
  }catch(cause){if(!signal.aborted)setError(userFacingError(cause));}
  finally{if(!signal.aborted)setLoading(false);}
 },[base]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load,revision]);

 const now=Date.now();
 const open=workshops.filter(row=>row.status==='PUBLISHED'&&new Date(row.startsAt).getTime()>now);
 const selected=open.find(row=>row.id===workshopId);
 const studentById=useMemo(()=>new Map(students.map(row=>[row.id,row])),[students]);
 const enrolled=enrollments.filter(row=>row.workshopId===workshopId&&row.status==='ENROLLED');
 const enrolledIds=new Set(enrolled.map(row=>row.studentId));
 const available=students.filter(row=>row.status==='active'&&!enrolledIds.has(row.id));
 const full=Boolean(selected&&enrolled.length>=selected.capacity);

 async function mutate(method:'POST'|'PATCH',payload:Record<string,string>,success:string){
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(`${base}/workshop-enrollments`,{method,credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   const body=await response.json().catch(()=>null);
   if(!response.ok){setError(userFacingError(body?.error?.code??'ERROR',WORKSHOP_MESSAGES));return false;}
   setNotice(success);setRevision(value=>value+1);return true;
  }catch(cause){setError(userFacingError(cause));return false;}
  finally{setSaving(false);}
 }
 async function enroll(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const student=studentById.get(studentId);if(!selected||!student||saving||!online)return;
  if(await mutate('POST',{workshopId:selected.id,studentId},`${fullName(student)} quedó inscrito en ${selected.title}.`))setStudentId('');
 }
 async function withdraw(row:Enrollment){
  const student=studentById.get(row.studentId);
  if(!await ask({title:'Dar de baja del taller',description:`${student?fullName(student):'El alumno'} dejará de estar inscrito en ${selected?.title??'el taller'}.`,confirmLabel:'Dar de baja',destructive:true}))return;
  await mutate('PATCH',{id:row.id,status:'WITHDRAWN'},'Baja registrada.');
 }

 return <section className="sii-panel sii-catalog-table-panel" aria-label="Inscripciones a talleres" aria-busy={loading}>{confirmation}
  <SiiSectionHeader workspace eyebrow="TALLERES" title="Inscripciones" description="Inscribe alumnos activos en talleres publicados que aún no comienzan."/>
  <SiiFeedback online={online} offlineMessage="Sin conexión. Las inscripciones pueden estar desactualizadas." error={error} notice={notice}/>
  <label className="sii-catalog-form">Taller<NativeSelect value={workshopId} onChange={event=>{setWorkshopId(event.target.value);setStudentId('');setNotice('');}} disabled={loading}>
   <option value="">{open.length?'Seleccionar taller publicado':'No hay talleres publicados por comenzar'}</option>
   {open.map(row=><option key={row.id} value={row.id}>{row.title} · {formatDateTime(row.startsAt)}</option>)}</NativeSelect></label>
  {selected&&<>
   <p className="flex flex-wrap items-center gap-2 text-sm"><SiiStatusBadge variant={full?'pending':'active'}>{enrolled.length} de {selected.capacity} lugares</SiiStatusBadge>
    <span className="text-muted-foreground">Del {formatDateTime(selected.startsAt)} al {formatDateTime(selected.endsAt)}</span></p>
   <form className="sii-catalog-form grid gap-3 md:grid-cols-[1fr_auto] md:items-end" onSubmit={event=>void enroll(event)} aria-label={'Inscribir en '+selected.title}>
    <label>Alumno<NativeSelect value={studentId} onChange={event=>setStudentId(event.target.value)} required disabled={saving||!online||full}>
     <option value="">{full?'Cupo completo':available.length?'Seleccionar alumno':'No hay alumnos activos por inscribir'}</option>
     {available.map(row=><option key={row.id} value={row.id}>{row.enrollmentNumber} · {fullName(row)}</option>)}</NativeSelect></label>
    <Button type="submit" disabled={!studentId||saving||!online||full}>{saving?'Guardando…':'Inscribir'}</Button>
   </form>
   {!enrolled.length?<p className="sii-empty">Aún no hay alumnos inscritos en este taller.</p>
    :<ul className="grid gap-2" aria-label={'Inscritos en '+selected.title}>{enrolled.map(row=>{const student=studentById.get(row.studentId);
     return <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-2">
      <span><strong>{student?fullName(student):'Alumno no disponible'}</strong> <small className="text-muted-foreground">{student?.enrollmentNumber}</small></span>
      <Button type="button" variant="outline" disabled={saving||!online} onClick={()=>void withdraw(row)} aria-label={`Dar de baja a ${student?fullName(student):'alumno'}`}>Dar de baja</Button>
     </li>;})}</ul>}
  </>}
 </section>;
}
