'use client';
import {type FormEvent,useRef,useState,useEffect} from 'react';
import {useRouter} from 'next/navigation';
export default function PasswordChange(){
 const router=useRouter(),feedback=useRef<HTMLParagraphElement>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(false),[invalid,setInvalid]=useState<'current'|'new'|null>(null);
 useEffect(()=>{if(error)feedback.current?.focus();},[error,notice]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setNotice('');setError(false);setInvalid(null);
  const form=new FormData(event.currentTarget);
  try{
   const result=await fetch('/api/v1/auth/password/change',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({currentPassword:form.get('currentPassword'),newPassword:form.get('newPassword')})});
   if(!result.ok){
    const body=await result.json().catch(()=>({error:{code:'INTERNAL_ERROR'}})) as {error:{code:string}};
    setError(true);
    if(body.error.code==='INVALID_CREDENTIALS'){setInvalid('current');setNotice('La contraseña actual no es correcta. Compruébala e inténtalo de nuevo.');}
    else if(body.error.code==='INVALID_PASSWORD_POLICY'){setInvalid('new');setNotice('Usa entre 12 y 128 caracteres y una contraseña diferente a la actual.');}
    else if(body.error.code==='RATE_LIMITED')setNotice('Se alcanzó el límite de intentos. Espera unos minutos antes de volver a intentar.');
    else if(body.error.code==='UNAUTHENTICATED')setNotice('Tu sesión venció. Vuelve a iniciar sesión para cambiar la contraseña.');
    else setNotice('No se pudo actualizar la contraseña. Inténtalo nuevamente.');
    return;
   }
   setNotice('Contraseña actualizada.');router.refresh();
  }catch{setError(true);setNotice('No hay conexión con el servidor.');}
  finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="password-form" aria-describedby={notice?'password-feedback':undefined}>
  <label htmlFor="current-password">Contraseña actual</label><input id="current-password" required type="password" autoComplete="current-password" name="currentPassword" maxLength={512} disabled={busy} aria-invalid={invalid==='current'} aria-describedby={invalid==='current'?'password-feedback':undefined}/>
  <label htmlFor="new-password">Nueva contraseña</label><input id="new-password" required type="password" autoComplete="new-password" minLength={12} maxLength={128} name="newPassword" disabled={busy} aria-invalid={invalid==='new'} aria-describedby="password-help"/>
  <p id="password-help">Usa entre 12 y 128 caracteres y una contraseña diferente a la actual.</p>
  <button type="submit" disabled={busy} className="primary-button" aria-busy={busy}>{busy?'Actualizando…':'Actualizar contraseña'}</button>
  {notice&&<p id="password-feedback" ref={feedback} tabIndex={-1} role={error?'alert':'status'}>{notice}</p>}
 </form>;
}
