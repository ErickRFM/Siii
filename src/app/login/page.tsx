'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { SiiBrand } from '@/components/sii-brand';
import SiiThemeToggle from '@/components/sii-theme-toggle';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const errorRef=useRef<HTMLDivElement>(null);
  const [credentialsInvalid,setCredentialsInvalid]=useState(false);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError('');setCredentialsInvalid(false);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: String(form.get('username') ?? '').trim(),
          password: String(form.get('password') ?? ''),
        }),
      });
      if (!response.ok) {
        setCredentialsInvalid(response.status===401);
        if (response.status === 429) {
          setError('Se alcanzó el límite de intentos. Espera unos minutos antes de volver a entrar.');
        } else if (response.status >= 500) {
          setError('El acceso institucional no está disponible. Verifica la conexión con el servicio o contacta soporte.');
        } else {
          setError('No fue posible iniciar sesión. Comprueba tus credenciales o contacta a soporte.');
        }
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('No pudimos conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="sii-auth">
      <section className="sii-auth-story" aria-label="Presentación de SII">
        <div className="sii-auth-story-top"><SiiBrand light/><span className="sii-story-tag">UNIVERSITY OS</span></div>
        <div className="sii-auth-story-content">
          <span className="sii-auth-eyebrow"><span className="sii-eyebrow-line"/> UNA UNIVERSIDAD MÁS CONECTADA</span>
          <h1>Todo tu mundo <em>universitario,</em> en un solo lugar.</h1>
          <p>Una plataforma institucional para organizar personas, periodos y procesos académicos con claridad, seguridad y continuidad.</p>
          <div className="sii-story-features" aria-label="Áreas del sistema">
            <div><span className="sii-story-feature-icon">◇</span><span>Gestión académica<strong>Información centralizada</strong></span></div>
            <div><span className="sii-story-feature-icon">▦</span><span>Control institucional<strong>Accesos según tu perfil</strong></span></div>
            <div><span className="sii-story-feature-icon">↗</span><span>Experiencia integrada<strong>Conectada con Compañero</strong></span></div>
          </div>
        </div>
        <div className="sii-auth-story-bottom"><span>© {new Date().getFullYear()} SII · Sistema Institucional Integral</span><span>Diseñado para educación superior</span></div>
        <div className="sii-story-decor sii-story-decor--one" aria-hidden="true"/>
        <div className="sii-story-decor sii-story-decor--two" aria-hidden="true"/>
      </section>
      <section className="sii-auth-access" aria-label="Acceso institucional">
        <div className="sii-auth-access-top"><span>PORTAL INSTITUCIONAL</span><SiiThemeToggle/></div>
        <div className="sii-auth-form-wrap">
          <div className="sii-auth-form-icon" aria-hidden="true">✦</div>
          <div className="sii-auth-form-kicker"><span className="sii-auth-form-dot"/> ACCESO SEGURO</div>
          <h2>Bienvenido de nuevo.</h2>
          <p className="sii-auth-form-subtitle">Ingresa tus credenciales institucionales para continuar.</p>
          <form className="sii-auth-form" onSubmit={submit}>
            <label htmlFor="sii-login-username">Usuario institucional</label>
            <div className="sii-field-wrap">
              <span className="sii-field-symbol" aria-hidden="true">♙</span>
              <input id="sii-login-username" name="username" type="text" autoComplete="username"
                aria-invalid={credentialsInvalid} aria-describedby={error?'sii-login-error':undefined} autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={120}
                placeholder="Tu usuario" disabled={loading}/>
            </div>
            <label htmlFor="sii-login-password">Contraseña</label>
            <div className="sii-field-wrap">
              <span className="sii-field-symbol" aria-hidden="true">✧</span>
              <input id="sii-login-password" name="password" type={showPassword ? 'text' : 'password'}
                aria-invalid={credentialsInvalid} aria-describedby={error?'sii-login-error':undefined} maxLength={512} autoComplete="current-password" required placeholder="Ingresa tu contraseña" disabled={loading}/>
              <button className="sii-password-toggle" type="button" onClick={() => setShowPassword(p => !p)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword} disabled={loading}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {error && <div id="sii-login-error" ref={errorRef} tabIndex={-1} className="sii-auth-error" role="alert"><span aria-hidden="true">!</span> {error}</div>}
            <button type="submit" className="sii-submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Validando acceso…' : 'Entrar al sistema'} <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="sii-auth-help"><strong>¿Problemas para acceder?</strong> Solicita ayuda a la administración de tu institución.</p>
          <div className="sii-auth-divider"><span>ACCESO PERSONALIZADO</span></div>
          <div className="sii-auth-role-notice">
            <span className="sii-auth-role-glyph" aria-hidden="true">▣</span>
            <p><strong>Tu espacio, tu perfil.</strong><span>Alumnos, docentes, coordinación y administración acceden según los permisos asignados.</span></p>
          </div>
        </div>
        <p className="sii-auth-access-footer">Acceso autorizado · Tu información se protege mediante controles institucionales.</p>
      </section>
    </main>
  );
}
