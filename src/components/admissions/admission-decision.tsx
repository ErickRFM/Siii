'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {SiiFeedback} from '@/components/ui/sii-feedback';
import {useInstitutionConfirmation} from '../sii-confirmation';
import {useOnlineStatus} from '@/shared/client/use-online-status';

export const DECISIONS={admitted:'Admitir',waitlisted:'Lista de espera',rejected:'Rechazar'} as const;
type Decision=keyof typeof DECISIONS;
/** Final outcomes stay read-only in the UI; open or waitlisted applications can still be decided. */
export const DECIDABLE=new Set(['submitted','under_review','waitlisted']);

const MESSAGES:Record<string,string>={
 INVALID_INPUT:'Elige un dictamen y escribe un motivo de al menos 5 caracteres.',
 FORBIDDEN:'Tu acceso a Admisiones cambió. Actualiza la página.',
 UNAUTHORIZED:'Tu sesión venció. Vuelve a iniciar sesión.',
 NOT_FOUND:'La solicitud ya no está disponible. Actualiza el listado.',
};

/** Records an admission decision through the audited decision endpoint, then refreshes the server list. */
export function AdmissionDecision({institutionId,applicationId,applicationNumber,status}:{institutionId:string;applicationId:string;applicationNumber:string;status:string}){
 const router=useRouter(),online=useOnlineStatus(),{ask,confirmation}=useInstitutionConfirmation();
 const [decision,setDecision]=useState<Decision|''>(''),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
 if(!DECIDABLE.has(status))return null;

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!decision||saving||!online)return;
  if(reason.trim().length<5){setError(MESSAGES.INVALID_INPUT);return;}
  if(!await ask({title:`${DECISIONS[decision]} · ${applicationNumber}`,description:'El dictamen queda registrado en la auditoría de admisiones y cambia el estado de la solicitud.',
   confirmLabel:DECISIONS[decision],destructive:decision==='rejected'}))return;
  setSaving(true);setError('');
  try{
   const response=await fetch(`/api/v1/institutions/${institutionId}/admissions/applications/${applicationId}/decision`,{method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},body:JSON.stringify({decision,reason:reason.trim()})});
   const body=await response.json().catch(()=>null);
   if(!response.ok){setError(MESSAGES[body?.error?.code]??'No se pudo registrar el dictamen. Inténtalo de nuevo.');return;}
   setDecision('');setReason('');router.refresh();
  }catch{setError('Sin conexión. El dictamen no se registró.');}
  finally{setSaving(false);}
 }

 return <form className="sii-catalog-form" onSubmit={event=>void submit(event)} aria-label={'Dictamen de '+applicationNumber}>{confirmation}
  <SiiFeedback online={online} offlineMessage="Sin conexión. Podrás dictaminar al reconectarte." error={error}/>
  <fieldset className="grid gap-2" disabled={saving||!online}>
   <legend className="text-sm font-semibold">Dictamen</legend>
   <div className="flex flex-wrap gap-2">{(Object.keys(DECISIONS) as Decision[]).map(value=><label key={value} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
    <input type="radio" name="decision" value={value} checked={decision===value} onChange={()=>setDecision(value)} required/>{DECISIONS[value]}</label>)}</div>
  </fieldset>
  <label>Motivo del dictamen<Textarea name="reason" value={reason} onChange={event=>setReason(event.target.value)} minLength={5} maxLength={1000} rows={3} required disabled={saving||!online}
   placeholder="Resultado de la evaluación, documentos o cupo"/></label>
  <Button type="submit" className="sii-submit" disabled={!decision||saving||!online}>{saving?'Registrando…':'Registrar dictamen'}</Button>
 </form>;
}
