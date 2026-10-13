'use client';
import { FormEvent,useState } from 'react';
import { useRouter } from 'next/navigation';
export default function LoginPage(){
 const [error,setError]=useState('');const [loading,setLoading]=useState(false);
 const router=useRouter();
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');setLoading(true);
  const form=new FormData(e.currentTarget);
  try{
   const r=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:form.get('username'),password:form.get('password')})});
   if(!r.ok){setError('No fue posible iniciar sesión. Comprueba tus credenciales o consulta a soporte.');return}
   router.replace('/dashboard');router.refresh();
  }catch{setError('No hay conexión con el servicio. Intenta nuevamente.')}finally{setLoading(false)}
 }
 return <main className="login-shell">
  <section className="login-intro"><div className="brandmark">Siii<span>.</span></div><p className="eyebrow">Sistema de información universitaria</p><h1>La universidad, en un solo lugar.</h1><p>Organiza personas, periodos y procesos académicos de forma clara y segura.</p><div className="intro-footer">Plataforma institucional · Acceso autorizado</div></section>
  <section className="login-panel"><div className="login-card"><div className="login-card-icon" aria-hidden="true">▦</div><p className="eyebrow">ACCESO INSTITUCIONAL</p><h2>Iniciar sesión</h2><p className="muted">Utiliza tu cuenta institucional de Siii.</p>
  <form onSubmit={submit} className="form-stack"><label htmlFor="username">Usuario<input id="username" name="username" autoComplete="username" required minLength={3} placeholder="Tu nombre de usuario"/></label><label htmlFor="password">Contraseña<input id="password" type="password" name="password" required autoComplete="current-password" placeholder="Tu contraseña"/></label>
  {error&&<p role="alert" className="form-error">{error}</p>}<button className="primary-button" disabled={loading} type="submit">{loading?'Validando acceso…':'Entrar al sistema'} <span aria-hidden="true">→</span></button></form>
  <p className="login-note">Las cuentas de Compañero de Escuela se administran por separado.</p></div></section>
 </main>
}
