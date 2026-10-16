'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SiiBrand } from '@/components/sii-brand';
import SiiThemeToggle from '@/components/sii-theme-toggle';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<{ expiresAt: string } | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [offline, setOffline] = useState(false);
  const [factorInvalid, setFactorInvalid] = useState(false);
  const factorRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const errorRef=useRef<HTMLDivElement>(null);
  const [credentialsInvalid,setCredentialsInvalid]=useState(false);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  useEffect(() => { if (challenge) factorRef.current?.focus(); }, [challenge, useRecovery]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || offline) return;
    setError('');setCredentialsInvalid(false);
    setLoading(true);
    const element = event.currentTarget;
    const form = new FormData(element);
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
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setCredentialsInvalid(response.status===401);
        if (response.status === 429) {
          setError('Se alcanzó el límite de intentos. Espera unos minutos antes de volver a entrar.');
        } else if (body?.error?.code === 'MFA_KEY_UNAVAILABLE') {
          setError('La configuración de seguridad no está disponible. Contacta a la administración de tu institución.');
        } else if (response.status >= 500) {
          setError('El acceso institucional no está disponible. Verifica la conexión con el servicio o contacta soporte.');
        } else {
          setError('No fue posible iniciar sesión. Comprueba tus credenciales o contacta a soporte.');
        }
        return;
      }
      if (body?.mfaRequired && typeof body.expiresAt === 'string') {
        element.reset(); setShowPassword(false); setUseRecovery(false); setFactorInvalid(false);
        setChallenge({ expiresAt: body.expiresAt }); return;
      }
      if (body?.ok !== true) { setError('No fue posible validar el acceso. Vuelve a intentar.'); return; }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('No pudimos conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  async function completeChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading || offline) return;
    setLoading(true); setError(''); setFactorInvalid(false);
    const form = event.currentTarget;
    const factor = String(new FormData(form).get('factor') ?? '');
    try {
      const response = await fetch('/api/v1/auth/mfa/challenge', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [useRecovery ? 'recoveryCode' : 'code']: factor }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body?.error?.code;
        setFactorInvalid(code === 'INVALID_MFA_CODE');
        if (code === 'MFA_CHALLENGE_EXPIRED') setError('La verificación venció. Vuelve al acceso e ingresa tus credenciales nuevamente.');
        else if (response.status === 429) setError('Se alcanzó el límite de intentos. Espera unos minutos antes de volver a intentar.');
        else if (code === 'INVALID_MFA_CODE') setError('El código no es válido o ya se utilizó. Espera el siguiente código del autenticador o usa un código de recuperación disponible.');
        else if (code === 'MFA_KEY_UNAVAILABLE') setError('La configuración de seguridad no está disponible. Contacta a la administración de tu institución.');
        else setError('No se pudo completar la verificación. Vuelve a intentar o contacta a soporte.');
        return;
      }
      if (body?.ok !== true) { setError('No fue posible validar el acceso. Vuelve a intentar.'); return; }
      form.reset(); router.replace('/dashboard'); router.refresh();
    } catch { setError('No pudimos conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.'); }
    finally { setLoading(false); }
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
          <h2>{challenge ? 'Verifica tu identidad.' : 'Bienvenido de nuevo.'}</h2>
          <p className="sii-auth-form-subtitle">{challenge ? 'Completa la verificación para acceder a tu cuenta.' : 'Ingresa tus credenciales institucionales para continuar.'}</p>
          {offline && <p role="status" className="sii-auth-error">Sin conexión. Reconéctate para continuar.</p>}
          {challenge ? <form className="sii-auth-form" onSubmit={completeChallenge}>
            <p id="sii-factor-help">{useRecovery ? 'Ingresa un código de recuperación guardado. Cada código funciona una sola vez.' : 'Ingresa los seis dígitos de tu aplicación autenticadora. Puedes pegar el código.'} La verificación vence a las {new Date(challenge.expiresAt).toLocaleTimeString('es-MX')}.</p>
            <label htmlFor="sii-login-factor">{useRecovery ? 'Código de recuperación' : 'Código del autenticador'}</label>
            <div className="sii-field-wrap">
              <input key={useRecovery ? 'recovery' : 'totp'} id="sii-login-factor" ref={factorRef} name="factor" type="text" required autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false}
                inputMode={useRecovery ? 'text' : 'numeric'} minLength={useRecovery ? 32 : 6} maxLength={useRecovery ? 128 : 6} pattern={useRecovery ? undefined : '[0-9]{6}'}
                aria-invalid={factorInvalid} aria-describedby={error ? 'sii-factor-help sii-login-error' : 'sii-factor-help'} disabled={loading || offline}/>
            </div>
            {error && <div id="sii-login-error" ref={errorRef} tabIndex={-1} className="sii-auth-error" role="alert"><span aria-hidden="true">!</span> {error}</div>}
            <button type="submit" className="sii-submit" disabled={loading || offline} aria-busy={loading}>{loading ? 'Verificando…' : 'Verificar y entrar'} <span aria-hidden="true">→</span></button>
            <button type="button" className="sii-outline-button" disabled={loading} onClick={() => { setUseRecovery(value => !value); setError(''); setFactorInvalid(false); }}>{useRecovery ? 'Usar código del autenticador' : 'Usar código de recuperación'}</button>
            <button type="button" className="sii-outline-button" disabled={loading} onClick={() => { setChallenge(null); setError(''); setFactorInvalid(false); }}>Volver al acceso</button>
          </form> : <form className="sii-auth-form" onSubmit={submit}>
            <label htmlFor="sii-login-username">Usuario institucional</label>
            <div className="sii-field-wrap">
              <span className="sii-field-symbol" aria-hidden="true">♙</span>
              <input id="sii-login-username" name="username" type="text" autoComplete="username"
                aria-invalid={credentialsInvalid} aria-describedby={error?'sii-login-error':undefined} autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={120}
                placeholder="Tu usuario" disabled={loading || offline}/>
            </div>
            <label htmlFor="sii-login-password">Contraseña</label>
            <div className="sii-field-wrap">
              <span className="sii-field-symbol" aria-hidden="true">✧</span>
              <input id="sii-login-password" name="password" type={showPassword ? 'text' : 'password'}
                aria-invalid={credentialsInvalid} aria-describedby={error?'sii-login-error':undefined} maxLength={512} autoComplete="current-password" required placeholder="Ingresa tu contraseña" disabled={loading || offline}/>
              <button className="sii-password-toggle" type="button" onClick={() => setShowPassword(p => !p)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword} disabled={loading}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {error && <div id="sii-login-error" ref={errorRef} tabIndex={-1} className="sii-auth-error" role="alert"><span aria-hidden="true">!</span> {error}</div>}
            <button type="submit" className="sii-submit" disabled={loading || offline} aria-busy={loading}>
              {loading ? 'Validando acceso…' : 'Entrar al sistema'} <span aria-hidden="true">→</span>
            </button>
          </form>}
          <p className="sii-auth-help"><Link href="/password/forgot">Recuperar mi contraseña</Link><br/><strong>¿Problemas para acceder?</strong> Solicita ayuda a la administración de tu institución.</p>
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
