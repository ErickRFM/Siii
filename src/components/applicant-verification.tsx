'use client';
import SiiThemeToggle from '@/components/sii-theme-toggle';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {ApplicantProof} from '@/shared/admissions-fragment';
export default function ApplicantVerification(){
 const proof=useRef<ApplicantProof|null>(null);
 const [password,setPassword]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const capture=()=>{const next=window.__siiiTakeApplicantProof?.();if(next){proof.current=next;setReady(true);setDone(false);setError('');setPassword('');}};capture();window.addEventListener('siii:applicant-fragment',capture);return()=>window.removeEventListener('siii:applicant-fragment',capture);},[]);
 async function verify(event:FormEvent){event.preventDefault();if(!proof.current)return;setBusy(true);setError('');try{
  const response=await fetch('/api/v1/admissions/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...proof.current,password})});
  if(!response.ok)throw Error(response.status===429?'Espera antes de volver a intentar.':'El enlace o la contraseña no son válidos. Puede haber vencido o ya estar utilizado. Solicita un nuevo correo desde el portal.');
  proof.current=null;setPassword('');setDone(true);
 }catch(cause){setError(cause instanceof Error?cause.message:'No hay conexión. Vuelve a intentar.');}finally{setBusy(false);}}
 return <main id="main-content" className="sii-main"><SiiThemeToggle/><section className="sii-panel"><h1>Verifica tu correo de aspirante</h1>
  {done?<p role="status">Correo verificado. Regresa al portal de tu institución e inicia sesión con tu cuenta de aspirante.</p>:ready?<form className="sii-form-grid" onSubmit={verify}><p>Confirma que registraste esta cuenta. Introduce la contraseña que elegiste; el enlace caduca a los 30 minutos.</p><div className="sii-field"><label htmlFor="applicant-proof-password">Contraseña de tu cuenta de aspirante</label><input id="applicant-proof-password" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)}/></div><button className="sii-primary-button" disabled={busy}>{busy?'Verificando…':'Verificar mi correo'}</button></form>:<p role="status">Abre el enlace original del correo. Si venció, solicita otro desde el portal de tu institución.</p>}
  {error&&<p role="alert">{error}</p>}
 </section></main>;
}
