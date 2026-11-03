'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {fetchWithTimeout,RequestTimeoutError} from '@/shared/client/fetch-with-timeout';
import {GraduationCap,ShieldCheck,Layers3,LayoutDashboard,BookOpen,ClipboardList,ArrowRight,Eye,EyeOff,AlertTriangle} from 'lucide-react';
import SiiThemeToggle from '@/components/sii-theme-toggle';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import './login-v3.css';

export default function LoginPage(){
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [showPassword,setShowPassword]=useState(false);
 const [challenge,setChallenge]=useState<{expiresAt:string}|null>(null);
 const [useRecovery,setUseRecovery]=useState(false);
 const [offline,setOffline]=useState(false);
 const [factorInvalid,setFactorInvalid]=useState(false);
 const factorRef=useRef<HTMLInputElement>(null);
 const router=useRouter();
 const errorRef=useRef<HTMLDivElement>(null);
 const [credentialsInvalid,setCredentialsInvalid]=useState(false);
 useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
 useEffect(()=>{if(challenge)factorRef.current?.focus();},[challenge,useRecovery]);
 useEffect(()=>{
  const update=()=>setOffline(!navigator.onLine);
  update();window.addEventListener('online',update);window.addEventListener('offline',update);
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
 },[]);

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(loading||offline)return;
  setError('');setCredentialsInvalid(false);
  setLoading(true);
  const element=event.currentTarget;
  const form=new FormData(element);
  try{
   const response=await fetchWithTimeout('/api/v1/auth/login',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({username:String(form.get('username')??'').trim(),password:String(form.get('password')??'')}),
   },20000);
   const body=await response.json().catch(()=>null);
   if(!response.ok){
    setCredentialsInvalid(response.status===401);
    if(response.status===429){
     setError('Se alcanzó el límite de intentos. Espera unos minutos antes de volver a entrar.');
    }else if(body?.error?.code==='MFA_KEY_UNAVAILABLE'){
     setError('La configuración de seguridad no está disponible. Contacta a la administración de tu institución.');
    }else if(response.status>=500){
     setError('El acceso institucional no está disponible. Verifica la conexión con el servicio o contacta soporte.');
    }else{
     setError('No fue posible iniciar sesión. Comprueba tus credenciales o contacta a soporte.');
    }
    return;
   }
   if(body?.mfaRequired&&typeof body.expiresAt==='string'){
    element.reset();setShowPassword(false);setUseRecovery(false);setFactorInvalid(false);
    setChallenge({expiresAt:body.expiresAt});return;
   }
   if(body?.ok!==true){setError('No fue posible validar el acceso. Vuelve a intentar.');return;}
   router.replace('/dashboard');
  }catch(cause){
   setError(cause instanceof RequestTimeoutError?'El servidor tardó demasiado en responder. Revisa tu conexión e inténtalo nuevamente.':'No pudimos conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.');
  }finally{
   setLoading(false);
  }
 }

 async function completeChallenge(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(loading||offline)return;
  setLoading(true);setError('');setFactorInvalid(false);
  const form=event.currentTarget;
  const factor=String(new FormData(form).get('factor')??'');
  try{
   const response=await fetchWithTimeout('/api/v1/auth/mfa/challenge',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({[useRecovery?'recoveryCode':'code']:factor}),
   },20000);
   const body=await response.json().catch(()=>null);
   if(!response.ok){
    const code=body?.error?.code;
    setFactorInvalid(code==='INVALID_MFA_CODE');
    if(code==='MFA_CHALLENGE_EXPIRED')setError('La verificación venció. Vuelve al acceso e ingresa tus credenciales nuevamente.');
    else if(response.status===429)setError('Se alcanzó el límite de intentos. Espera unos minutos antes de volver a intentar.');
    else if(code==='INVALID_MFA_CODE')setError('El código no es válido o ya se utilizó. Espera el siguiente código del autenticador o usa un código de recuperación disponible.');
    else if(code==='MFA_KEY_UNAVAILABLE')setError('La configuración de seguridad no está disponible. Contacta a la administración de tu institución.');
    else setError('No se pudo completar la verificación. Vuelve a intentar o contacta a soporte.');
    return;
   }
   if(body?.ok!==true){setError('No fue posible validar el acceso. Vuelve a intentar.');return;}
   form.reset();router.replace('/dashboard');
  }catch(cause){
   setError(cause instanceof RequestTimeoutError?'La verificación tardó demasiado. Comprueba tu conexión e inténtalo nuevamente.':'No pudimos conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.');
  }finally{
   setLoading(false);
  }
 }

 const errorBox=error?(
  <div id="sii-login-error" ref={errorRef} tabIndex={-1} role="alert" className="siii-login-v3-error">
   <AlertTriangle aria-hidden="true"/><span>{error}</span>
  </div>
 ):null;

 return <main id="main-content" tabIndex={-1} className="siii-login-v3 sii-ui">
  <section className="siii-login-v3-access" aria-label="Acceso institucional">
   <header className="siii-login-v3-header">
    <Link href="/dashboard" className="siii-login-v3-brand" aria-label="SII, ir al inicio institucional">
     <span className="siii-login-v3-brand-mark" aria-hidden="true"><Layers3 size={24}/></span>
     <span><strong>SII</strong><small>Sistema Institucional Integral</small></span>
    </Link>
    <SiiThemeToggle/>
   </header>

   <div className="siii-login-v3-form" data-siii-login-form="v3">
    <span className="siii-login-v3-eyebrow"><ShieldCheck aria-hidden="true"/> Plataforma institucional</span>
    <h1 className="siii-login-v3-title">{challenge?'Confirma tu identidad.':'Tu espacio académico empieza aquí.'}</h1>
    <p className="siii-login-v3-subtitle">{challenge?'Completa el segundo factor para entrar de forma segura.':'Accede a tus clases, gestiones y herramientas institucionales con tu cuenta.'}</p>

    {offline&&<p role="status" className="siii-login-v3-offline">Sin conexión. Reconéctate para continuar.</p>}

    {challenge?<form className="siii-login-v3-auth-form" onSubmit={completeChallenge}>
     <p id="sii-factor-help" className="siii-login-v3-factor-help">{useRecovery?'Ingresa un código de recuperación guardado. Cada código funciona una sola vez.':'Ingresa los seis dígitos de tu aplicación autenticadora. Puedes pegar el código.'} La verificación vence a las {new Date(challenge.expiresAt).toLocaleTimeString('es-MX')}.</p>
     <div className="siii-login-v3-field">
      <Label htmlFor="sii-login-factor">{useRecovery?'Código de recuperación':'Código del autenticador'}</Label>
      <Input key={useRecovery?'recovery':'totp'} id="sii-login-factor" ref={factorRef} name="factor" type="text" required autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false}
       inputMode={useRecovery?'text':'numeric'} minLength={useRecovery?32:6} maxLength={useRecovery?128:6} pattern={useRecovery?undefined:'[0-9]{6}'}
       aria-invalid={factorInvalid} aria-describedby={error?'sii-factor-help sii-login-error':'sii-factor-help'} disabled={loading||offline} className="font-mono tracking-widest"/>
     </div>
     {errorBox}
     <Button type="submit" className="siii-login-v3-submit" disabled={loading||offline} aria-busy={loading}>{loading?'Verificando…':'Verificar y entrar'}<ArrowRight aria-hidden="true"/></Button>
     <div className="siii-login-v3-challenge-options">
      <Button type="button" variant="outline" disabled={loading} onClick={()=>{setUseRecovery(value=>!value);setError('');setFactorInvalid(false);}}>{useRecovery?'Usar código del autenticador':'Usar código de recuperación'}</Button>
      <Button type="button" variant="ghost" disabled={loading} onClick={()=>{setChallenge(null);setError('');setFactorInvalid(false);}}>Volver al acceso</Button>
     </div>
    </form>:<form className="siii-login-v3-auth-form" onSubmit={submit}>
     <div className="siii-login-v3-fields">
      <div className="siii-login-v3-field">
       <Label htmlFor="sii-login-username">Usuario institucional o correo verificado</Label>
       <Input id="sii-login-username" name="username" type="text" autoComplete="username" aria-invalid={credentialsInvalid} aria-describedby={error?'sii-login-error':undefined} autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={120} placeholder="Tu usuario o correo institucional" disabled={loading||offline}/>
      </div>
      <div className="siii-login-v3-field">
       <Label htmlFor="sii-login-password">Contraseña</Label>
       <div className="siii-login-v3-password">
        <Input id="sii-login-password" name="password" type={showPassword?'text':'password'} aria-invalid={credentialsInvalid} aria-describedby={error?'sii-login-error':undefined} maxLength={512} autoComplete="current-password" required placeholder="Ingresa tu contraseña" disabled={loading||offline}/>
        <Button variant="ghost" size="icon" type="button" onClick={()=>setShowPassword(p=>!p)} aria-label={showPassword?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={showPassword} disabled={loading}>{showPassword?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}</Button>
       </div>
      </div>
     </div>
     {errorBox}
     <Button type="submit" className="siii-login-v3-submit" disabled={loading||offline} aria-busy={loading}>{loading?'Validando acceso…':'Entrar al sistema'}<ArrowRight aria-hidden="true"/></Button>
    </form>}

    <div className="siii-login-v3-recovery"><Link href="/password/forgot">¿Olvidaste tu contraseña?</Link></div>
    <div className="siii-login-v3-context">
     <ShieldCheck aria-hidden="true"/>
     <span>Tu información está protegida. El contenido y las funciones se adaptan a los permisos de tu perfil institucional.</span>
    </div>
   </div>
   <footer className="siii-login-v3-footer">© {new Date().getFullYear()} SII · Acceso institucional autorizado.</footer>
  </section>

  <aside className="siii-login-v3-showcase" aria-label="Conoce la plataforma institucional">
   <div className="siii-login-v3-showcase-top"><span className="siii-login-v3-showcase-label">Una experiencia conectada</span><span className="siii-login-v3-showcase-version">Sistema Institucional Integral</span></div>
   <div className="siii-login-v3-narrative">
    <h2>Menos pasos.<br/><span>Más claridad.</span></h2>
    <p>Tu vida académica y los procesos de tu institución, organizados en un mismo lugar.</p>
   </div>
   <div className="siii-login-v3-preview" aria-hidden="true">
    <div className="siii-login-v3-preview-head"><strong><LayoutDashboard/> Espacio institucional</strong><span>Vista ilustrativa</span></div>
    <div className="siii-login-v3-preview-content">
     <div className="siii-login-v3-preview-nav"><span>Inicio</span><span>Académico</span><span>Trámites</span></div>
     <div className="siii-login-v3-preview-module">
      <strong>Todo lo importante, a la vista</strong>
      <div className="siii-login-v3-preview-row"><BookOpen/><span>Trayectoria académica<small>Materias y calificaciones</small></span></div>
      <div className="siii-login-v3-preview-row"><GraduationCap/><span>Vida institucional<small>Clases y seguimiento</small></span></div>
      <div className="siii-login-v3-preview-row"><ClipboardList/><span>Solicitudes<small>Trámites y estados</small></span></div>
     </div>
    </div>
   </div>
   <div className="siii-login-v3-showcase-foot"><span><ShieldCheck aria-hidden="true"/> Acceso según tu perfil</span><span>Diseñado para educación superior</span></div>
  </aside>
 </main>;
}
