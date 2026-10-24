'use client';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';


import {useRef,useState,type FormEvent} from 'react';

type StepUpReply={ok?:boolean;expiresAt?:string;error?:{code?:string}};
type Props={onConfirmed:(expiresAt:string)=>void};

function message(code?:string){
 switch(code){
  case 'INVALID_CREDENTIALS':return 'La contraseña no es correcta. Intenta nuevamente.';
  case 'INVALID_MFA_CODE':return 'El código no es válido o ya se utilizó. Espera el siguiente código o usa uno de recuperación.';
  case 'RATE_LIMITED':return 'Demasiados intentos. Espera unos minutos antes de intentarlo de nuevo.';
  case 'UNAUTHENTICATED':return 'Tu sesión terminó. Vuelve a iniciar sesión.';
  case 'PASSWORD_CHANGE_REQUIRED':return 'Actualiza tu contraseña en Cuenta y seguridad antes de continuar.';
  case 'MFA_REQUIRED':return 'Primero activa el autenticador en Cuenta y seguridad.';
  default:return 'No se pudo confirmar tu identidad. Revisa la conexión y vuelve a intentar.';
 }
}

/** A critical invitation requires a fresh password + MFA proof, never an emailed code.
 * The server rotates the session and enforces its own five-minute assurance window. */
export default function InstitutionStepUp({onConfirmed}:Props){
 const [busy,setBusy]=useState(false),[recovery,setRecovery]=useState(false),[error,setError]=useState('');
 const feedback=useRef<HTMLParagraphElement>(null);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  const form=event.currentTarget,fields=new FormData(form);
  setError('');setBusy(true);
  try{
   const response=await fetch('/api/v1/auth/mfa/step-up',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
     currentPassword:String(fields.get('currentPassword')??''),
     [recovery?'recoveryCode':'code']:String(fields.get('factor')??''),
    }),
   });
   const result=await response.json().catch(()=>null) as StepUpReply|null;
   if(!response.ok||result?.ok!==true||!result.expiresAt){
    setError(message(result?.error?.code));return;
   }
   form.reset();onConfirmed(result.expiresAt);
  }catch{setError('No se pudo contactar al servidor. Revisa tu conexión y vuelve a intentar.');}
  finally{setBusy(false);}
 }
 return <section className="sii-panel sii-security-card" aria-labelledby="invite-step-up-title" aria-busy={busy}>
  <span className="sii-section-kicker">VERIFICACIÓN DE SEGURIDAD</span>
  <h2 id="invite-step-up-title">Confirma tu identidad para invitar</h2>
  <p>Tu autenticador ya está configurado. Para crear, reenviar o revocar una invitación, confirma tu contraseña y el código nuevo de tu aplicación. La autorización dura cinco minutos.</p>
  {error&&<p ref={feedback} tabIndex={-1} className="sii-catalog-error" role="alert">{error}</p>}
  <form className="password-form" onSubmit={event=>void submit(event)}>
   <label htmlFor="invite-step-up-password">Contraseña actual</label>
   <Input id="invite-step-up-password" type="password" name="currentPassword" autoComplete="current-password" maxLength={512} required disabled={busy}/>
   <label htmlFor="invite-step-up-factor">{recovery?'Código de recuperación':'Código de seis dígitos del autenticador'}</label>
   <Input key={recovery?'recovery':'totp'} id="invite-step-up-factor" name="factor" type="text" inputMode={recovery?'text':'numeric'}
    autoComplete="one-time-code" autoCapitalize="off" spellCheck={false}
    pattern={recovery?undefined:'[0-9]{6}'} minLength={recovery?32:6} maxLength={recovery?128:6} required disabled={busy}/>
   <Button variant="outline" type="button" className="sii-outline-button" disabled={busy} onClick={()=>{setRecovery(value=>!value);setError('');}}>
    {recovery?'Usar código del autenticador':'Usar código de recuperación'}
   </Button>
   <Button variant="default" type="submit" className="sii-submit" disabled={busy}>{busy?'Confirmando…':'Confirmar identidad y continuar'}</Button>
  </form>
  <p className="sii-catalog-hint">Nunca compartas estos códigos por correo ni por chat. Después de confirmar, pulsa «Crear invitación» nuevamente.</p>
 </section>;
}
