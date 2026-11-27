'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Card,CardContent,CardHeader,CardTitle} from './ui/card';
import {SiiStatusBadge} from './ui/sii-institutional';
import {SiiFeedback} from './ui/sii-feedback';
import {useOnlineStatus} from '@/shared/client/use-online-status';
import {formatDateTime} from '@/shared/format/date-time';

type Claim={id:string;enrollmentNumber:string;status:'pending'|'approved'|'rejected';rejectionReason:string|null;createdAt:string};
type LinkState={studentRecord:unknown|null;claim:Claim|null};

const MESSAGES:Record<string,string>={
 STUDENT_NOT_FOUND:'No encontramos esa matrícula en tu institución. Revísala e inténtalo de nuevo.',
 ALREADY_LINKED:'Ese expediente o tu cuenta ya tienen una vinculación activa. Si no es correcto, acude a Control Escolar.',
 INVALID_INPUT:'Escribe tu matrícula completa (al menos 3 caracteres).',
 FORBIDDEN:'Tu sesión ya no tiene acceso a esta institución. Vuelve a iniciar sesión.',
 UNAUTHORIZED:'Tu sesión venció. Vuelve a iniciar sesión.',
};

/**
 * Student self-service link: claim an enrollment number, then follow the review.
 * Auto-approval happens server-side only with verified mailbox evidence.
 */
export default function StudentRecordClaim({institutionId,onLinked}:{institutionId:string;onLinked:()=>void}){
 const online=useOnlineStatus();
 const [state,setState]=useState<LinkState|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(false);
 const feedback=useRef<HTMLParagraphElement>(null);
 const base=`/api/v1/institutions/${institutionId}/student-links`;
 useEffect(()=>{if(error)feedback.current?.focus();},[error]);

 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);
  try{
   const response=await fetch(`${base}/me`,{cache:'no-store',credentials:'same-origin',signal});
   const body=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(body?.error?.code??'FETCH_FAILED');
   setState(body.data);
  }catch(cause){if(!signal?.aborted)setError(cause instanceof TypeError?'Sin conexión. No se pudo consultar tu vinculación.':MESSAGES[(cause as Error).message]??'No se pudo consultar tu vinculación. Actualiza e inténtalo de nuevo.');}
  finally{if(!signal?.aborted)setLoading(false);}
 },[base]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving||!online)return;
  const enrollmentNumber=String(new FormData(event.currentTarget).get('enrollmentNumber')??'').trim();
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(`${base}/claim`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({enrollmentNumber})});
   const body=await response.json().catch(()=>null);
   if(!response.ok){setError(MESSAGES[body?.error?.code]??'No se pudo enviar la solicitud. Inténtalo de nuevo.');return;}
   setRetry(false);
   if(body?.data?.autoApproved){setNotice('Tu expediente quedó vinculado. Cargando tu información…');onLinked();return;}
   setNotice('Solicitud enviada. Control Escolar la revisará.');await load();
  }catch{setError('Sin conexión. La solicitud no se envió; inténtalo cuando vuelvas a estar en línea.');}
  finally{setSaving(false);}
 }

 if(loading&&!state)return <p role="status" className="sr-only">Consultando la vinculación de tu expediente…</p>;
 if(state?.studentRecord)return null;
 const claim=state?.claim;
 const showForm=!claim||claim.status==='approved'||(claim.status==='rejected'&&retry)||(claim.status==='rejected'&&!claim.rejectionReason);
 return <Card className="siii-record-claim" aria-labelledby="record-claim-title">
  <CardHeader className="pb-2"><CardTitle id="record-claim-title" className="text-base">Vincula tu expediente</CardTitle></CardHeader>
  <CardContent className="grid gap-3 text-sm">
   <SiiFeedback online={online} offlineMessage="Sin conexión. Podrás enviar la solicitud cuando vuelvas a estar en línea." error={error} errorRef={feedback} notice={notice}/>
   {claim?.status==='pending'&&<div className="grid gap-1">
    <p className="flex flex-wrap items-center gap-2"><SiiStatusBadge variant="pending">En revisión</SiiStatusBadge><span>Matrícula <strong>{claim.enrollmentNumber}</strong></span></p>
    <p className="text-muted-foreground">Control Escolar revisa tu solicitud desde el {formatDateTime(claim.createdAt)}. Te avisaremos aquí cuando se resuelva.</p>
   </div>}
   {claim?.status==='rejected'&&!showForm&&<div className="grid gap-2">
    <p className="flex flex-wrap items-center gap-2"><SiiStatusBadge variant="cancelled">No aprobada</SiiStatusBadge><span>Matrícula <strong>{claim.enrollmentNumber}</strong></span></p>
    <p><span className="text-muted-foreground">Motivo: </span>{claim.rejectionReason}</p>
    <div><Button type="button" variant="outline" onClick={()=>{setRetry(true);setNotice('');}}>Enviar una nueva solicitud</Button></div>
   </div>}
   {showForm&&<form className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={event=>void submit(event)}>
    <label className="grid gap-1" htmlFor="record-claim-number">Matrícula
     <Input id="record-claim-number" name="enrollmentNumber" required minLength={3} maxLength={32} autoComplete="off" inputMode="text"
      defaultValue={claim?.status==='rejected'?claim.enrollmentNumber:undefined} disabled={saving||!online} aria-describedby="record-claim-help"/></label>
    <Button type="submit" disabled={saving||!online}>{saving?'Enviando…':'Solicitar vinculación'}</Button>
    <p id="record-claim-help" className="text-xs text-muted-foreground sm:col-span-2">Si tu correo verificado coincide con el de tu expediente, se vincula al instante; si no, lo revisa Control Escolar.</p>
   </form>}
  </CardContent>
 </Card>;
}
