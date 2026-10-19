'use client';
import {useInstitutionConfirmation} from './sii-confirmation';

import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {SiiBrand} from './sii-brand';
import SiiThemeToggle from './sii-theme-toggle';
import {PROFILE_LABELS} from './institution-capabilities';
import type {InvitationBearer} from '@/shared/invitations/fragment-bootstrap';

type Preview={invitationId:string;institutionId:string;institutionName:string;role:string;scopeType:'institution'|'program'|'campus';scopeId:string|null;scopeName:string|null;expiresAt:string;grantExpiresAt:string|null};

class InvitationError extends Error{constructor(readonly code:string){super(code);}}
function message(error:unknown){
  if(!(error instanceof InvitationError))return 'Sin conexión. Comprueba tu conexión y vuelve a intentar.';
  switch(error.code){
    case 'UNAUTHENTICATED':case 'AUTH_REQUIRED':case 'LOGIN_REQUIRED':return 'Inicia sesión con tu cuenta en otra pestaña y vuelve aquí para confirmar el consentimiento.';
    case 'STEP_UP_REQUIRED':return 'Confirma tu identidad en seguridad en otra pestaña. Después vuelve aquí y reintenta la aceptación.';
    case 'MFA_REQUIRED':return 'Verifica tu autenticador o configura tu seguridad en otra pestaña. Después vuelve aquí.';
    case 'PASSWORD_CHANGE_REQUIRED':return 'Actualiza tu contraseña en seguridad en otra pestaña y vuelve a intentar.';
    case 'VALIDATION_ERROR':return 'Revisa el usuario, los nombres y la contraseña. La contraseña debe tener entre 12 y 128 caracteres.';
    case 'RATE_LIMITED':return 'Se alcanzó el límite de intentos. Espera unos minutos antes de volver a intentar.';
    case 'INVITATION_UNAVAILABLE':return 'La invitación no está disponible. Puede haber vencido, sido revocada o consumida. Solicita una invitación vigente a la institución.';
    default:return 'No se pudo completar la operación. Vuelve a intentar o contacta a la institución.';
  }
}
async function post<T>(action:string,body:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
  const response=await fetch(`/api/v1/invitations/${action}`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new InvitationError(result?.error?.code??'SERVICE_UNAVAILABLE');
  if(!result?.data)throw new InvitationError('SERVICE_UNAVAILABLE');
  return result as T;
}
export default function InvitationAccept(){
 const {ask,confirmation}=useInstitutionConfirmation();
  // The bearer never enters rendered state, storage, a link, or a query string.
  const bearer=useRef<InvitationBearer|null>(null),readGeneration=useRef(0),feedback=useRef<HTMLParagraphElement>(null);
  const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[offline,setOffline]=useState(false);
  const [mode,setMode]=useState<'existing'|'new'>('new'),[consent,setConsent]=useState(false),[terminal,setTerminal]=useState<'accepted'|'rejected'|null>(null),[acceptedMode,setAcceptedMode]=useState<'existing'|'new'|null>(null),[invalidPassword,setInvalidPassword]=useState(false),[notice,setNotice]=useState('');
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const context=bearer.current,generation=++readGeneration.current;
    const current=()=>bearer.current===context&&readGeneration.current===generation&&!signal?.aborted;
    if(!context){if(current()){setPreview(null);setError('Reabre el enlace original del correo para consultar la invitación. El enlace se elimina de esta página por seguridad.');setLoading(false);}return false;}
    setLoading(true);setError('');
    try{
      const result=await post<{data:Preview}>('preview',context,signal);
      if(!current())return false;
      if(result.data.invitationId!==context.invitationId)throw new InvitationError('SERVICE_UNAVAILABLE');
      setPreview(result.data);return true;
    }catch(cause){if(current()){setPreview(null);setError(message(cause));}return false;}
    finally{if(current())setLoading(false);}
  },[]);
  function refreshManually(){
    const context=bearer.current;setNotice('');
    const result=refresh(),generation=readGeneration.current;
    void result.then(updated=>{if(updated&&bearer.current===context&&readGeneration.current===generation)setNotice('La invitación y tu sesión se comprobarán nuevamente al decidir.');});
  }
  useEffect(()=>{
    let controller=new AbortController();
    const receive=()=>{
      const incoming=window.__siiiTakeInvitation?.();
      controller.abort();controller=new AbortController();
      bearer.current=incoming??null;setTerminal(null);setPreview(null);setConsent(false);setMode('new');setInvalidPassword(false);setNotice('');
      void refresh(controller.signal);
    };
    window.addEventListener('siii:invitation-fragment',receive);
    const incoming=window.__siiiTakeInvitation?.();
    if(incoming)bearer.current=incoming;
    void refresh(controller.signal);
    return()=>{controller.abort();window.removeEventListener('siii:invitation-fragment',receive);};
  },[refresh]);
  useEffect(()=>{const update=()=>setOffline(!navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  useEffect(()=>{if(error)feedback.current?.focus();},[error]);
  async function decide(action:'accept'|'reject',event?:FormEvent<HTMLFormElement>){
    event?.preventDefault();if(busy||loading||offline||!bearer.current||!preview||preview.invitationId!==bearer.current.invitationId||!consent)return;
    const form=event?.currentTarget,decisionBearer=bearer.current;
    const payload:Record<string,unknown>={...bearer.current,consent:true};
    setInvalidPassword(false);setError('');setNotice('');
    if(action==='accept'){
      payload.mode=mode;
      if(mode==='new'&&form){const fields=new FormData(form),password=String(fields.get('password')??'');if(password!==String(fields.get('confirmPassword')??'')){setInvalidPassword(true);setError('Las contraseñas no coinciden. Corrige la confirmación y vuelve a intentar.');return;}
        payload.account={username:String(fields.get('username')??'').trim(),firstName:String(fields.get('firstName')??'').trim(),lastName:String(fields.get('lastName')??'').trim(),password};}
    }else if(!await ask({title:'Rechazar invitación',description:`Se rechazará la invitación de ${preview.institutionName} y el enlace dejará de estar disponible.`,confirmLabel:'Rechazar invitación',destructive:true}))return;
    setBusy(true);
    try{
      const result=await post<{data:{state:'accepted'|'rejected';requiresLogin?:boolean}}>(action,payload);
      if(bearer.current!==decisionBearer)return;
      if(result.data.state!==(action==='accept'?'accepted':'rejected'))throw new InvitationError('SERVICE_UNAVAILABLE');
      bearer.current=null;form?.reset();setPreview(null);setAcceptedMode(action==='accept'?mode:null);setTerminal(result.data.state);setConsent(false);
    }catch(cause){if(bearer.current===decisionBearer)setError(message(cause));}
    finally{setBusy(false);}
  }
  return <main id="main-content" tabIndex={-1} className="sii-auth">{confirmation}
    <section className="sii-auth-story" aria-label="Invitación institucional"><div className="sii-auth-story-top"><SiiBrand light/><span className="sii-story-tag">ACCESO INSTITUCIONAL</span></div><div className="sii-auth-story-content"><h1>Tu acceso <em>institucional,</em> con tu consentimiento.</h1><p>Revisa la institución, el perfil, el ámbito y la duración del acceso antes de decidir.</p></div></section>
    <section className="sii-auth-access" aria-label="Consentimiento de invitación"><div className="sii-auth-access-top"><span>INVITACIÓN SEGURA</span><SiiThemeToggle/></div><div className="sii-auth-form-wrap">
      <h2>Invitación institucional.</h2>
      {loading&&<p role="status">Consultando invitación…</p>}
      {offline&&<p className="sii-auth-error" role="status">Sin conexión. Reconéctate para consultar o decidir.</p>}
      {error&&<p id="invitation-error" className="sii-auth-error" role="alert" tabIndex={-1} ref={feedback}>{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {terminal?<div role="status"><h3>{terminal==='accepted'?'Invitación aceptada.':'Invitación rechazada.'}</h3><p>{terminal==='accepted'?(acceptedMode==='new'?'Tu cuenta institucional quedó creada con el usuario y la contraseña que elegiste. Ahora inicia sesión para continuar. Tu matrícula y tu inscripción académica se gestionan por separado.':'El acceso quedó vinculado a tu cuenta existente. Inicia sesión para continuar; configura tu autenticador si el perfil lo requiere.'):'La invitación se consumió. Contacta a la institución si necesitas una nueva.'}</p><Link className="sii-outline-button" href="/login">Ir al acceso institucional</Link></div>:<>
        <button type="button" className="sii-outline-button" disabled={loading||busy||offline} onClick={refreshManually}>Actualizar invitación y sesión</button>
        {preview&&<>
          <dl><dt>Institución</dt><dd>{preview.institutionName}</dd><dt>Perfil</dt><dd>{PROFILE_LABELS[preview.role]??preview.role}</dd><dt>Ámbito</dt><dd>{preview.scopeType==='institution'?'Institución completa':`${preview.scopeType==='program'?'Programa':'Campus'}: ${preview.scopeName??'Ámbito asignado'}`}</dd><dt>Duración del acceso</dt><dd>{preview.grantExpiresAt?`Hasta ${new Date(preview.grantExpiresAt).toLocaleString('es-MX')}`:'Sin vencimiento'}</dd><dt>Caducidad de esta invitación</dt><dd>{new Date(preview.expiresAt).toLocaleString('es-MX')}</dd></dl>
          <form className="sii-catalog-form" onSubmit={event=>void decide('accept',event)} aria-describedby="invitation-session-help">
            <label htmlFor="invitation-mode">Cuenta para aceptar</label><select id="invitation-mode" value={mode} onChange={event=>{setMode(event.target.value as 'existing'|'new');setInvalidPassword(false);setError('');}} disabled={busy||offline}><option value="new">Soy nuevo: crear mi cuenta</option><option value="existing">Ya tengo cuenta: vincular el acceso</option></select>
            {mode==='new'?<p id="invitation-session-help" className="sii-info-banner">Primer acceso: Crea tu cuenta institucional y establece tu contraseña; no necesitas iniciar sesión antes. La matrícula y la inscripción académica se tramitan por separado.</p>:<div id="invitation-session-help" className="sii-info-banner"><p>Ya tienes cuenta Siii. Conserva esta invitación abierta, inicia sesión y confirma tu identidad en otra pestaña; vuelve aquí y actualiza la sesión antes de aceptar. Si recargas, reabre el enlace original del correo.</p><div><Link href="/login" target="_blank" rel="noopener noreferrer" className="sii-outline-button">Iniciar sesión en otra pestaña</Link>{' '}<Link href="/dashboard/security" target="_blank" rel="noopener noreferrer" className="sii-outline-button">Confirmar identidad en otra pestaña</Link></div></div>}
            {mode==='new'&&<><label htmlFor="invitation-first-name">Nombre</label><input id="invitation-first-name" name="firstName" autoComplete="given-name" required maxLength={120} disabled={busy||offline}/><label htmlFor="invitation-last-name">Apellidos</label><input id="invitation-last-name" name="lastName" autoComplete="family-name" required maxLength={120} disabled={busy||offline}/><label htmlFor="invitation-username">Nuevo usuario institucional</label><input id="invitation-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[A-Za-z0-9_.-]+" required minLength={3} maxLength={120} disabled={busy||offline} aria-describedby={error?'invitation-error':undefined}/><label htmlFor="invitation-password">Nueva contraseña</label><input id="invitation-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy||offline} aria-invalid={invalidPassword} aria-describedby={error?'invitation-error':undefined}/><label htmlFor="invitation-confirm-password">Confirmar nueva contraseña</label><input id="invitation-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy||offline} aria-invalid={invalidPassword} aria-describedby={error?'invitation-error':undefined}/></>}
            <label htmlFor="invitation-consent" style={{display:'flex',alignItems:'flex-start'}}><input id="invitation-consent" type="checkbox" style={{width:24,minHeight:24,height:24,padding:0,flexShrink:0}} checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy||offline} required/> Confirmo que revisé la institución, el perfil, el ámbito y la duración; autorizo registrar mi decisión.</label>
            <button type="submit" className="sii-submit" disabled={!consent||loading||busy||offline}>{busy?'Registrando decisión…':mode==='new'?'Crear cuenta y aceptar invitación':'Vincular cuenta y aceptar invitación'}</button>
            <button type="button" className="sii-outline-button" disabled={!consent||loading||busy||offline} onClick={()=>void decide('reject')}>Rechazar invitación</button>
          </form>
        </>}
      </>}
    </div></section>
  </main>;
}
