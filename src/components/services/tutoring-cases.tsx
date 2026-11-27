'use client';
import Link from 'next/link';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {NativeSelect} from '@/components/ui/native-select';
import {SiiSectionHeader} from '@/components/ui/sii-kit';
import {SiiStatusBadge} from '@/components/ui/sii-institutional';
import {SiiFeedback} from '@/components/ui/sii-feedback';
import {useInstitutionConfirmation} from '../sii-confirmation';
import {useOnlineStatus} from '@/shared/client/use-online-status';
import {readCollection} from '@/shared/client/read-collection';
import {userFacingError} from '@/shared/client/user-facing-error';
import {formatDateTime} from '@/shared/format/date-time';

type TutoringCase={id:string;studentId:string;teacherId:string;subject:string;privateNotes:string|null;status:'OPEN'|'RESOLVED'|'CLOSED';createdAt:string};
type Person={id:string;firstName:string;lastName:string;status:string;enrollmentNumber?:string;employeeNumber?:string};

const STATUS={OPEN:{label:'Abierto',variant:'pending'},RESOLVED:{label:'Resuelto',variant:'active'},CLOSED:{label:'Cerrado',variant:'archived'}} as const;
const NEXT:Partial<Record<TutoringCase['status'],{status:'RESOLVED'|'CLOSED';label:string}>>={OPEN:{status:'RESOLVED',label:'Marcar resuelto'},RESOLVED:{status:'CLOSED',label:'Cerrar caso'}};
const TUTORING_MESSAGES:Readonly<Record<string,string>>={
 STUDENT_OR_TUTOR_UNAVAILABLE:'El alumno o el tutor ya no están activos.',
 INVALID_CASE_TRANSITION:'El caso cambió de estado. Actualiza la lista.',
 FORBIDDEN:'Tu sesión no tiene permiso para tutorías o requiere confirmar identidad en Seguridad.',
};
const fullName=(row:{firstName:string;lastName:string})=>`${row.firstName} ${row.lastName}`.trim();

/**
 * Tutoring cases hold private notes: every list read is audited by the API, so the
 * panel loads only with users.manage and fresh assurance, and never on its own.
 */
export function TutoringCases({institutionId,assured}:{institutionId:string;assured:boolean}){
 const online=useOnlineStatus(),{ask,confirmation}=useInstitutionConfirmation();
 const [cases,setCases]=useState<TutoringCase[]>([]),[students,setStudents]=useState<Person[]>([]),[teachers,setTeachers]=useState<Person[]>([]);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [opened,setOpened]=useState(false),[revision,setRevision]=useState(0),[creating,setCreating]=useState(false);
 const base=`/api/v1/institutions/${institutionId}`;

 const load=useCallback(async(signal:AbortSignal)=>{
  setLoading(true);
  try{
   const [c,s,t]=await Promise.all([readCollection<TutoringCase>(`${base}/tutoring-cases`,{signal}),
    readCollection<Person>(`${base}/registry/students?limit=100`,{signal}),readCollection<Person>(`${base}/registry/teachers?limit=100`,{signal})]);
   if(signal.aborted)return;setCases(c.data);setStudents(s.data);setTeachers(t.data);setError('');
  }catch(cause){if(!signal.aborted)setError(userFacingError(cause,TUTORING_MESSAGES));}
  finally{if(!signal.aborted)setLoading(false);}
 },[base]);
 // Opening is an explicit action because each read leaves an audit entry over private notes.
 useEffect(()=>{if(!assured||!opened)return;const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[assured,opened,load,revision]);

 const studentById=useMemo(()=>new Map(students.map(row=>[row.id,row])),[students]);
 const teacherById=useMemo(()=>new Map(teachers.map(row=>[row.id,row])),[teachers]);

 async function send(method:'POST'|'PATCH',payload:Record<string,string>,success:string){
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(`${base}/tutoring-cases`,{method,credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   const body=await response.json().catch(()=>null);
   if(!response.ok){setError(userFacingError(body?.error?.code??'ERROR',TUTORING_MESSAGES));return false;}
   setNotice(success);setRevision(value=>value+1);return true;
  }catch(cause){setError(userFacingError(cause));return false;}
  finally{setSaving(false);}
 }
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving||!online)return;const form=event.currentTarget,fields=new FormData(form);
  const notes=String(fields.get('privateNotes')??'').trim();
  const payload={studentId:String(fields.get('studentId')??''),teacherId:String(fields.get('teacherId')??''),subject:String(fields.get('subject')??'').trim(),...(notes?{privateNotes:notes}:{})};
  if(await send('POST',payload,'Caso de tutoría registrado.')){form.reset();setCreating(false);}
 }
 async function advance(row:TutoringCase){
  const next=NEXT[row.status];if(!next)return;
  if(!await ask({title:next.label,description:`«${row.subject}». El cambio queda auditado.`,confirmLabel:next.label}))return;
  await send('PATCH',{id:row.id,status:next.status},next.status==='RESOLVED'?'Caso marcado como resuelto.':'Caso cerrado.');
 }

 return <section className="sii-panel sii-catalog-table-panel" aria-label="Tutorías" aria-busy={loading}>{confirmation}
  <SiiSectionHeader workspace eyebrow="ACOMPAÑAMIENTO" title="Tutorías" description="Casos de tutoría con notas privadas. Cada consulta queda registrada en la auditoría."/>
  {!assured?<p className="sii-empty" role="status">Confirma tu identidad en <Link href="/dashboard/security" className="underline underline-offset-2">Seguridad</Link> para consultar las tutorías.</p>
   :!opened?<div><Button type="button" variant="outline" onClick={()=>setOpened(true)}>Consultar tutorías</Button></div>:<>
   <SiiFeedback online={online} offlineMessage="Sin conexión. Las tutorías pueden estar desactualizadas." error={error} notice={notice}/>
   <div><Button type="button" variant="outline" aria-expanded={creating} disabled={!online||loading} onClick={()=>setCreating(value=>!value)}>{creating?'Cancelar':'Nuevo caso'}</Button></div>
   {creating&&<form className="sii-catalog-form" onSubmit={event=>void create(event)} aria-label="Nuevo caso de tutoría">
    <div className="grid gap-3 md:grid-cols-2">
     <label>Alumno<NativeSelect name="studentId" required defaultValue="" disabled={saving}><option value="" disabled>Seleccionar alumno</option>
      {students.filter(row=>row.status==='active').map(row=><option key={row.id} value={row.id}>{row.enrollmentNumber} · {fullName(row)}</option>)}</NativeSelect></label>
     <label>Tutor<NativeSelect name="teacherId" required defaultValue="" disabled={saving}><option value="" disabled>Seleccionar docente</option>
      {teachers.filter(row=>row.status==='active').map(row=><option key={row.id} value={row.id}>{row.employeeNumber} · {fullName(row)}</option>)}</NativeSelect></label>
    </div>
    <label>Tema<Input name="subject" required minLength={3} maxLength={160} placeholder="Ej. Seguimiento de desempeño en Cálculo" disabled={saving}/></label>
    <label>Notas privadas (opcional)<Textarea name="privateNotes" maxLength={3000} rows={3} disabled={saving}/></label>
    <Button type="submit" className="sii-submit" disabled={saving||!online}>{saving?'Guardando…':'Registrar caso'}</Button>
   </form>}
   {loading?<p className="sii-empty" role="status">Consultando tutorías…</p>
    :!cases.length?<p className="sii-empty">No hay casos de tutoría registrados.</p>
    :<ul className="grid gap-2" aria-label="Casos de tutoría">{cases.map(row=>{const student=studentById.get(row.studentId),teacher=teacherById.get(row.teacherId),next=NEXT[row.status];
     return <li key={row.id} className="grid gap-2 rounded-lg border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{row.subject}</strong><SiiStatusBadge variant={STATUS[row.status].variant}>{STATUS[row.status].label}</SiiStatusBadge></div>
      <small className="text-muted-foreground">{student?fullName(student):'Alumno no disponible'} · Tutor: {teacher?fullName(teacher):'no disponible'} · {formatDateTime(row.createdAt)}</small>
      {row.privateNotes&&<details><summary className="cursor-pointer text-sm">Notas privadas</summary><p className="mt-1 whitespace-pre-wrap text-sm">{row.privateNotes}</p></details>}
      {next&&<div><Button type="button" variant="outline" disabled={saving||!online} onClick={()=>void advance(row)}>{next.label}</Button></div>}
     </li>;})}</ul>}
  </>}
 </section>;
}
