'use client';
import Link from 'next/link';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {SiiSectionHeader} from '@/components/ui/sii-kit';
import {SiiFeedback} from '@/components/ui/sii-feedback';
import {useInstitutionConfirmation} from '../sii-confirmation';
import {useOnlineStatus} from '@/shared/client/use-online-status';
import {formatDateTime} from '@/shared/format/date-time';

type TeacherLink={id:string;teacherId:string;membershipId:string;createdAt?:string};
type Teacher={id:string;employeeNumber:string;firstName:string;lastName:string;status:string};
type Member={id:string;username:string;firstName:string;lastName:string};

const MESSAGES:Record<string,string>={
 TEACHER_MEMBERSHIP_NOT_VERIFIED:'La cuenta debe estar activa y tener el perfil Docente vigente, y el docente debe estar activo en la plantilla.',
 TEACHER_ALREADY_LINKED:'Ese docente o esa cuenta ya tienen una vinculación activa.',
 SELF_LINK_NOT_ALLOWED:'No puedes vincular tu propia cuenta.',
 FORBIDDEN:'Tu sesión no tiene permiso para vincular cuentas o requiere confirmar identidad en Seguridad.',
 NOT_FOUND:'La vinculación ya no existe. Actualiza la lista.',
};
const name=(row:{firstName:string;lastName:string})=>`${row.firstName} ${row.lastName}`.trim();

async function readAll<T>(url:string,signal:AbortSignal){
 const rows:T[]=[];let cursor:string|null=null;
 do{
  const query=new URLSearchParams({limit:'100'});if(cursor)query.set('cursor',cursor);
  const response=await fetch(`${url}${url.includes('?')?'&':'?'}${query}`,{credentials:'same-origin',cache:'no-store',signal});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(body?.error?.code??'LOAD_FAILED');
  rows.push(...(body.data as T[]));cursor=body.page?.nextCursor??null;
 }while(cursor&&!signal.aborted);
 return rows;
}

/**
 * Links a teacher record to the institutional account that teaches. Without this link
 * the teacher's academic authority cannot reach Compañero. The API re-checks everything.
 */
export default function TeacherAccountLinks({institutionId,assured}:{institutionId:string;assured:boolean}){
 const online=useOnlineStatus(),{ask,confirmation}=useInstitutionConfirmation();
 const [links,setLinks]=useState<TeacherLink[]>([]),[teachers,setTeachers]=useState<Teacher[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [teacherId,setTeacherId]=useState(''),[membershipId,setMembershipId]=useState(''),[revision,setRevision]=useState(0);
 const base=`/api/v1/institutions/${institutionId}`;

 const load=useCallback(async(signal:AbortSignal)=>{
  setLoading(true);
  try{
   const [linkBody,teacherRows,memberRows]=await Promise.all([
    fetch(`${base}/teacher-links`,{credentials:'same-origin',cache:'no-store',signal}).then(async response=>{const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error?.code??'LOAD_FAILED');return body;}),
    readAll<Teacher>(`${base}/registry/teachers`,signal),
    readAll<Member>(`${base}/memberships?role=teacher&status=active`,signal),
   ]);
   if(signal.aborted)return;
   setLinks(linkBody.data??[]);setTeachers(teacherRows);setMembers(memberRows);setError('');
  }catch(cause){if(!signal.aborted)setError(cause instanceof TypeError?'Sin conexión. No se pudieron consultar las vinculaciones.':MESSAGES[(cause as Error).message]??'No se pudieron consultar las vinculaciones docentes.');}
  finally{if(!signal.aborted)setLoading(false);}
 },[base]);
 useEffect(()=>{if(!assured)return;const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[assured,load,revision]);

 const linkedTeachers=useMemo(()=>new Set(links.map(link=>link.teacherId)),[links]);
 const linkedMembers=useMemo(()=>new Set(links.map(link=>link.membershipId)),[links]);
 const teacherById=useMemo(()=>new Map(teachers.map(row=>[row.id,row])),[teachers]);
 const memberById=useMemo(()=>new Map(members.map(row=>[row.id,row])),[members]);
 const freeTeachers=teachers.filter(row=>row.status==='active'&&!linkedTeachers.has(row.id));
 const freeMembers=members.filter(row=>!linkedMembers.has(row.id));

 async function mutate(method:'POST'|'PATCH',payload:Record<string,string>,success:string){
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(`${base}/teacher-links`,{method,credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   const body=await response.json().catch(()=>null);
   if(!response.ok){setError(MESSAGES[body?.error?.code]??'No se pudo completar la operación. Actualiza e inténtalo de nuevo.');return false;}
   setNotice(success);setRevision(value=>value+1);return true;
  }catch{setError('Sin conexión. La operación no se confirmó.');return false;}
  finally{setSaving(false);}
 }
 async function link(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const teacher=teacherById.get(teacherId),member=memberById.get(membershipId);if(!teacher||!member||saving||!online)return;
  if(!await ask({title:'Vincular cuenta docente',description:`${name(teacher)} (${teacher.employeeNumber}) quedará vinculado a la cuenta ${member.username}. La operación se audita.`,confirmLabel:'Vincular'}))return;
  if(await mutate('POST',{teacherId,membershipId},`${name(teacher)} quedó vinculado a ${member.username}.`)){setTeacherId('');setMembershipId('');}
 }
 async function revoke(row:TeacherLink){
  const teacher=teacherById.get(row.teacherId);
  if(!await ask({title:'Desvincular cuenta docente',description:`${teacher?name(teacher):'El docente'} dejará de estar vinculado a su cuenta. Su autoridad académica en Compañero se retira en la siguiente consulta.`,confirmLabel:'Desvincular',destructive:true}))return;
  await mutate('PATCH',{id:row.id},'Vinculación retirada.');
 }

 return <section className="sii-panel sii-catalog-table-panel" aria-label="Cuentas docentes vinculadas" aria-busy={loading&&assured}>{confirmation}
  <SiiSectionHeader workspace eyebrow="VINCULACIÓN DE CUENTAS" title="Cuentas docentes"
   description="Relaciona a cada docente de la plantilla con su cuenta institucional. Es necesario para que su autoridad académica llegue a Compañero."/>
  {!assured?<p className="sii-empty" role="status">Confirma tu identidad en <Link href="/dashboard/security" className="underline underline-offset-2">Seguridad</Link> para administrar las vinculaciones docentes.</p>:<>
   <SiiFeedback online={online} offlineMessage="Sin conexión. Las vinculaciones pueden estar desactualizadas." error={error} notice={notice}/>
   <form className="sii-catalog-form" onSubmit={event=>void link(event)} aria-label="Nueva vinculación docente">
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
     <label>Docente de la plantilla<NativeSelect value={teacherId} onChange={event=>setTeacherId(event.target.value)} required disabled={saving||loading||!online}>
      <option value="">{freeTeachers.length?'Seleccionar docente':'No hay docentes activos sin vincular'}</option>
      {freeTeachers.map(row=><option key={row.id} value={row.id}>{row.employeeNumber} · {name(row)}</option>)}</NativeSelect></label>
     <label>Cuenta con perfil Docente<NativeSelect value={membershipId} onChange={event=>setMembershipId(event.target.value)} required disabled={saving||loading||!online}>
      <option value="">{freeMembers.length?'Seleccionar cuenta':'No hay cuentas docentes sin vincular'}</option>
      {freeMembers.map(row=><option key={row.id} value={row.id}>{row.username} · {name(row)}</option>)}</NativeSelect></label>
     <Button type="submit" disabled={!teacherId||!membershipId||saving||!online}>{saving?'Guardando…':'Vincular'}</Button>
    </div>
   </form>
   {loading?<p className="sii-empty" role="status">Consultando vinculaciones docentes…</p>
    :!links.length?<p className="sii-empty">Aún no hay docentes vinculados con su cuenta.</p>
    :<ul className="grid gap-2" aria-label="Vinculaciones docentes activas">{links.map(row=>{const teacher=teacherById.get(row.teacherId),member=memberById.get(row.membershipId);
     return <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <div className="min-w-0"><strong className="block">{teacher?name(teacher):'Docente no disponible'}</strong>
       <small className="text-muted-foreground">{teacher?.employeeNumber??'—'} ↔ {member?.username??'cuenta fuera de la lista activa'}{row.createdAt?` · desde ${formatDateTime(row.createdAt)}`:''}</small></div>
      <Button type="button" variant="outline" disabled={saving||!online} onClick={()=>void revoke(row)} aria-label={`Desvincular a ${teacher?name(teacher):'docente'}`}>Desvincular</Button>
     </li>;})}</ul>}
  </>}
 </section>;
}
