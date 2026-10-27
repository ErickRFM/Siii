'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {GraduationCap,ShieldCheck,Smartphone,ArrowRight,Eye,EyeOff,AlertTriangle} from 'lucide-react';
import {SiiBrand} from '@/components/sii-brand';
import SiiThemeToggle from '@/components/sii-theme-toggle';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';

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
   const response=await fetch('/api/v1/auth/login',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({username:String(form.get('username')??'').trim(),password:String(form.get('password')??'')}),
   });
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
   router.refresh();
  }catch{
   setError('No pudimos conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.');
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
   const response=await fetch('/api/v1/auth/mfa/challenge',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({[useRecovery?'recoveryCode':'code']:factor}),
   });
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
   form.reset();router.replace('/dashboard');router.refresh();
  }catch{
   setError('No pudimos conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.');
  }finally{
   setLoading(false);
  }
 }

 const errorBox=error?(
  <div id="sii-login-error" ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive/40">
   <AlertTriangle className="mt-0.5 size-4 shrink-0"/><span>{error}</span>
  </div>
 ):null;

 return <main id="main-content" tabIndex={-1} className="sii-auth sii-ui bg-background">
  <section className="sii-auth-story bg-[#2b0e1b]" aria-label="Presentación de SII">
   <div className="sii-auth-story-top"><SiiBrand light/><Badge variant="outline" className="border-white/25 bg-white/5 text-[10px] tracking-[.18em] text-white">UNIVERSITY OS</Badge></div>
   <div className="sii-auth-story-content">
    <span className="sii-auth-eyebrow"><span className="sii-eyebrow-line"/>UNA UNIVERSIDAD MÁS CONECTADA</span>
    <h1>Todo tu mundo <em>universitario,</em> en un solo lugar.</h1>
    <p>Una plataforma institucional para organizar personas, periodos y procesos académicos con claridad, seguridad y continuidad.</p>
    <div className="sii-story-features" aria-label="Áreas del sistema">
     <div><span className="sii-story-feature-icon"><GraduationCap/></span><span>Gestión académica<strong>Información centralizada</strong></span></div>
     <div><span className="sii-story-feature-icon"><ShieldCheck/></span><span>Control institucional<strong>Accesos según tu perfil</strong></span></div>
     <div><span className="sii-story-feature-icon"><Smartphone/></span><span>Experiencia integrada<strong>Conectada con Compañero</strong></span></div>
    </div>
   </div>
   <div className="sii-auth-story-bottom"><span>© {new Date().getFullYear()} SII · Sistema Institucional Integral</span><span>Diseñado para educación superior</span></div>
  </section>

  <section className="sii-auth-access bg-background" aria-label="Acceso institucional">
   <div className="sii-auth-access-top"><span>PORTAL INSTITUCIONAL</span><SiiThemeToggle/></div>
   <div className="sii-auth-form-wrap w-full">
    <Card className="sii-auth-card border-border shadow-xl">
     <CardContent className="p-6 sm:p-8">
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary" aria-hidden="true"><ShieldCheck className="size-6"/></div>
      <span className="sii-auth-form-kicker"><span className="sii-auth-form-dot"/>ACCESO SEGURO</span>
      <h2 className="mt-3 text-3xl font-bold tracking-tight">{challenge?'Verifica tu identidad.':'Bienvenido de nuevo.'}</h2>
      <p className="sii-auth-form-subtitle mt-2 text-sm text-muted-foreground">{challenge?'Completa la verificación para acceder a tu cuenta.':'Ingresa tus credenciales institucionales para continuar.'}</p>
      {offline&&<p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">Sin conexión. Reconéctate para continuar.</p>}
      {challenge?<form className="space-y-5" onSubmit={completeChallenge}>
       <p id="sii-factor-help" className="text-sm leading-relaxed text-muted-foreground">{useRecovery?'Ingresa un código de recuperación guardado. Cada código funciona una sola vez.':'Ingresa los seis dígitos de tu aplicación autenticadora. Puedes pegar el código.'} La verificación vence a las {new Date(challenge.expiresAt).toLocaleTimeString('es-MX')}.</p>
       <div className="space-y-2">
        <Label htmlFor="sii-login-factor">{useRecovery?'Código de recuperación':'Código del autenticador'}</Label>
        <Input key={useRecovery?'recovery':'totp'} id="sii-login-factor" ref={factorRef} name="factor" type="text" required autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false}
         inputMode={useRecovery?'text':'numeric'} minLength={useRecovery?32:6} maxLength={useRecovery?128:6} pattern={useRecovery?undefined:'[0-9]{6}'}
         aria-invalid={factorInvalid} aria-describedby={error?'sii-factor-help sii-login-error':'sii-factor-help'} disabled={loading||offline} className="h-11 font-mono text-base tracking-widest"/>
       </div>
       {errorBox}
       <Button type="submit" className="w-full" disabled={loading||offline} aria-busy={loading}>{loading?'Verificando…':'Verificar y entrar'}<ArrowRight/></Button>
       <div className="grid gap-2">
        <Button type="button" variant="outline" disabled={loading} onClick={()=>{setUseRecovery(value=>!value);setError('');setFactorInvalid(false);}}>{useRecovery?'Usar código del autenticador':'Usar código de recuperación'}</Button>
        <Button type="button" variant="ghost" disabled={loading} onClick={()=>{setChallenge(null);setError('');setFactorInvalid(false);}}>Volver al acceso</Button>
       </div>
      </form>:<form className="space-y-5" onSubmit={submit}>
       <div className="space-y-2">
        <Label htmlFor="sii-login-username">Usuario institucional o correo verificado</Label>
        <Input id="sii-login-username" name="username" type="text" autoComplete="username" aria-invalid={credentialsInvalid} aria-describedby={error?'sii-login-error':undefined} autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={120} placeholder="Tu usuario o correo verificado" disabled={loading||offline} className="h-11"/>
       </div>
       <div className="space-y-2">
        <Label htmlFor="sii-login-password">Contraseña</Label>
        <div className="relative">
         <Input id="sii-login-password" name="password" type={showPassword?'text':'password'} aria-invalid={credentialsInvalid} aria-describedby={error?'sii-login-error':undefined} maxLength={512} autoComplete="current-password" required placeholder="Ingresa tu contraseña" disabled={loading||offline} className="h-11 pr-11"/>
         <Button className="absolute right-1 top-1/2 -translate-y-1/2" variant="ghost" size="icon" type="button" onClick={()=>setShowPassword(p=>!p)} aria-label={showPassword?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={showPassword} disabled={loading}>
          {showPassword?<EyeOff/>:<Eye/>}
         </Button>
        </div>
       </div>
       {errorBox}
       <Button type="submit" className="w-full" disabled={loading||offline} aria-busy={loading}>{loading?'Validando acceso…':'Entrar al sistema'}<ArrowRight/></Button>
      </form>}
      <p className="sii-auth-help mt-5 text-sm text-muted-foreground"><Link href="/password/forgot" className="font-semibold text-primary underline underline-offset-4">Recuperar mi contraseña</Link><br/><strong className="text-foreground">¿Problemas para acceder?</strong> Solicita ayuda a la administración de tu institución.</p>
      <div className="my-5 flex items-center gap-3 text-[10px] font-bold tracking-[.18em] text-muted-foreground"><span className="h-px flex-1 bg-border"/>ACCESO PERSONALIZADO<span className="h-px flex-1 bg-border"/></div>
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
       <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true"/>
       <p className="text-xs leading-relaxed text-muted-foreground"><strong className="block text-sm text-foreground">Tu espacio, tu perfil.</strong>Alumnos, docentes, coordinación y administración acceden según los permisos asignados.</p>
      </div>
     </CardContent>
    </Card>
   </div>
   <p className="sii-auth-access-footer">Acceso autorizado · Tu información se protege mediante controles institucionales.</p>
  </section>
 </main>;
}
