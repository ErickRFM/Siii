'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type MfaStatus = { configured: boolean; pending: boolean; recoveryCodesRemaining: number; stepUpExpiresAt: string | null; requiredByRole:boolean };
type Enrollment = { enrollmentId: string; secret: string; uri: string; expiresAt: string };
class MfaRequestError extends Error {
  constructor(readonly code: string) { super(code); }
}

async function request<T>(path = '', body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/auth/mfa${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new MfaRequestError(result?.error?.code ?? 'SERVICE_UNAVAILABLE');
  if (!result || typeof result !== 'object') throw new MfaRequestError('SERVICE_UNAVAILABLE');
  return result as T;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof MfaRequestError)) return 'No hay conexión con el servidor. Comprueba tu conexión y vuelve a intentar.';
  switch (error.code) {
    case 'INVALID_CREDENTIALS': return 'La contraseña actual no es correcta. Compruébala y vuelve a intentar.';
    case 'INVALID_MFA_CODE': return 'El código no es válido o ya se utilizó. Espera el siguiente código del autenticador o usa un código de recuperación disponible.';
    case 'RATE_LIMITED': return 'Se alcanzó el límite de intentos. Espera unos minutos antes de volver a intentar.';
    case 'UNAUTHENTICATED': return 'Tu sesión venció. Vuelve a iniciar sesión.';
    case 'STEP_UP_REQUIRED': return 'Confirma nuevamente tu identidad para continuar; la verificación dura cinco minutos.';
    case 'MFA_ENROLLMENT_EXPIRED': return 'La activación venció. Confirma nuevamente tu contraseña para obtener una nueva clave.';
    case 'PASSWORD_CHANGE_REQUIRED': return 'Actualiza primero tu contraseña en esta misma pantalla para gestionar el autenticador.';
    case 'MFA_KEY_UNAVAILABLE': return 'La configuración de seguridad no está disponible. Contacta a la administración de tu institución.';
    case 'MFA_ALREADY_CONFIGURED': return 'Tu cuenta ya tiene un autenticador activo. Actualiza el estado de seguridad.';
    case 'MFA_REQUIRED_BY_ROLE': return 'No puedes desactivar el autenticador mientras mantengas perfiles privilegiados vigentes.';
    default: return 'No se pudo completar la operación de seguridad. Vuelve a intentar o contacta a soporte.';
  }
}

export default function MfaSecurity() {
  const router = useRouter();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const [restartEnrollment, setRestartEnrollment] = useState(false);
  const [notice, setNotice] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const enrollmentPassword = useRef<HTMLInputElement>(null);
  const savedCodes = useRef<HTMLDivElement>(null);
  const ready = !busy && !loading && !offline;
  const fresh = status?.stepUpExpiresAt ? new Date(status.stepUpExpiresAt).getTime() > Date.now() : false;

  useEffect(() => {
    const controller = new AbortController();
    request<{ data: MfaStatus }>('', undefined, controller.signal)
      .then(result => { if (!result.data) throw new MfaRequestError('SERVICE_UNAVAILABLE'); setStatus(result.data); })
      .catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);
  useEffect(() => { if (enrollment && !busy) codeInput.current?.focus(); }, [enrollment, busy]);
  useEffect(() => { if (restartEnrollment && !enrollment && !busy) enrollmentPassword.current?.focus(); }, [restartEnrollment, enrollment, busy]);
  useEffect(() => { if (codes.length) savedCodes.current?.focus(); }, [codes]);
  useEffect(() => {
    if (!status?.stepUpExpiresAt) return;
    const delay = new Date(status.stepUpExpiresAt).getTime() - Date.now();
    if (delay <= 0) return;
    const timer = window.setTimeout(() => setStatus(previous => previous ? { ...previous, stepUpExpiresAt: null } : null), delay);
    return () => window.clearTimeout(timer);
  }, [status?.stepUpExpiresAt]);

  async function refresh() {
    const result = await request<{ data: MfaStatus }>();
    if (!result.data) throw new MfaRequestError('SERVICE_UNAVAILABLE');
    setStatus(result.data);
  }
  async function perform(operation: () => Promise<void>, fields?: { password?: string; factor?: string }) {
    if (busy || offline) return;
    setBusy(true); setError(''); setNotice(''); setInvalidField(null); setRestartEnrollment(false);
    try { await operation(); } catch (cause) {
      if (cause instanceof MfaRequestError) {
        if (cause.code === 'INVALID_CREDENTIALS') setInvalidField(fields?.password ?? null);
        if (cause.code === 'INVALID_MFA_CODE') setInvalidField(fields?.factor ?? null);
        if (cause.code === 'MFA_ENROLLMENT_EXPIRED') { setEnrollment(null); setRestartEnrollment(true); }
      }
      setError(errorMessage(cause));
    }
    finally { setBusy(false); setLoading(false); }
  }
  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const currentPassword = String(new FormData(form).get('currentPassword') ?? '');
    await perform(async () => {
      const result = await request<{ data: Enrollment }>('/enroll', { currentPassword });
      if (!result.data?.secret || !result.data.enrollmentId || !result.data.expiresAt) throw new MfaRequestError('SERVICE_UNAVAILABLE');
      form.reset(); setEnrollment(result.data);
      await refresh();
    }, { password: 'mfa-enroll-password' });
  }
  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!enrollment) return;
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code') ?? '');
    await perform(async () => {
      const result = await request<{ data: { recoveryCodes: string[] } }>('/verify', { enrollmentId: enrollment.enrollmentId, code });
      if (!Array.isArray(result.data?.recoveryCodes) || !result.data.recoveryCodes.length) throw new MfaRequestError('SERVICE_UNAVAILABLE');
      form.reset(); setCodes(result.data.recoveryCodes); setEnrollment(null);
      setNotice('Autenticador activado. Guarda tus códigos de recuperación.');
      await refresh(); router.refresh();
    }, { factor: 'mfa-enrollment-code' });
  }
  async function stepUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
    await perform(async () => {
      const result = await request<{ ok: boolean; expiresAt: string }>('/step-up', {
        currentPassword: String(fields.get('currentPassword') ?? ''),
        ...(status?.configured ? { [recovery ? 'recoveryCode' : 'code']: String(fields.get('factor') ?? '') } : {}),
      });
      if (!result.ok || !result.expiresAt) throw new MfaRequestError('SERVICE_UNAVAILABLE');
      form.reset(); setStatus(previous => previous ? { ...previous, stepUpExpiresAt: result.expiresAt } : null);
      setNotice('Identidad confirmada. Puedes gestionar tu autenticador durante cinco minutos.');
      await refresh(); router.refresh();
    }, { password: 'mfa-step-up-password', factor: 'mfa-step-up-factor' });
  }
  async function regenerate() {
    await perform(async () => {
      const result = await request<{ data: { recoveryCodes: string[] } }>('/recovery/regenerate', {});
      if (!Array.isArray(result.data?.recoveryCodes) || !result.data.recoveryCodes.length) throw new MfaRequestError('SERVICE_UNAVAILABLE');
      setCodes(result.data.recoveryCodes); setNotice('Se generaron nuevos códigos. Los anteriores dejaron de funcionar.');
      await refresh();
    });
  }
  async function revoke() {
    await perform(async () => {
      const result = await request<{ ok: boolean }>('/revoke', {});
      if (!result.ok) throw new MfaRequestError('SERVICE_UNAVAILABLE');
      setEnrollment(null); setCodes([]); setNotice('Autenticador desactivado. Se cerraron tus sesiones en los otros dispositivos.');
      await refresh(); router.refresh();
    });
  }

  return <section className="sii-panel sii-security-card" aria-labelledby="mfa-title" aria-busy={busy || loading}>
    <span className="sii-section-kicker">VERIFICACIÓN EN DOS PASOS</span>
    <h2 id="mfa-title">Autenticador y recuperación</h2>
    <p>Protege el acceso con una aplicación autenticadora. La contraseña y el código se verifican en el servidor.</p>
    {loading && <p role="status">Consultando el estado de seguridad…</p>}
    {offline && <p role="status">Sin conexión. Las operaciones se habilitarán cuando vuelvas a conectarte.</p>}
    {error && <p id="mfa-error" ref={feedback} tabIndex={-1} className="sii-auth-error" role="alert">{error} <Link href="/login">Ir al acceso</Link></p>}
    {notice && <p role="status">{notice}</p>}
    <button type="button" className="sii-outline-button" disabled={busy || offline} onClick={() => void perform(refresh)}>Actualizar estado de seguridad</button>
    {status && <>
      <p role="status">{status.configured ? `Autenticador activo · ${status.recoveryCodesRemaining} códigos de recuperación disponibles.` : status.pending ? 'Activación pendiente. Confirma el código o inicia una nueva activación.' : 'No tienes un autenticador activo.'}</p>
      {!status.configured && !enrollment && <form className="password-form" onSubmit={enroll}>
        <label htmlFor="mfa-enroll-password">Contraseña actual para activar</label>
        <input id="mfa-enroll-password" ref={enrollmentPassword} name="currentPassword" type="password" autoComplete="current-password" required maxLength={512} disabled={!ready} aria-invalid={invalidField === 'mfa-enroll-password'} aria-describedby={error ? 'mfa-error' : undefined}/>
        <button className="sii-submit" type="submit" disabled={!ready}>{busy ? 'Preparando activación…' : status.pending ? 'Iniciar nueva activación' : 'Configurar autenticador'}</button>
      </form>}
      {enrollment && <div>
        <h3>Agrega la cuenta a tu autenticador</h3>
        <p id="mfa-key-help">Selecciona una clave manual, cuenta SIII, código basado en tiempo, seis dígitos y periodo de 30 segundos. Esta clave solo aparece durante esta activación.</p>
        <div className="password-form">
        <label htmlFor="mfa-manual-key">Clave manual del autenticador</label>
        <input id="mfa-manual-key" value={enrollment.secret} readOnly aria-describedby="mfa-key-help"/>
        <button type="button" className="sii-submit" disabled={!ready} onClick={() => void perform(async () => {
          await navigator.clipboard.writeText(enrollment.secret); setNotice('Clave copiada. Pégala únicamente en tu aplicación autenticadora.');
        })}>Copiar clave manual</button>
        </div>
        <p>Activación válida hasta {new Date(enrollment.expiresAt).toLocaleTimeString('es-MX')}.</p>
        <form className="password-form" onSubmit={verifyEnrollment}>
          <label htmlFor="mfa-enrollment-code">Código para activar el autenticador</label>
          <input id="mfa-enrollment-code" ref={codeInput} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={!ready} aria-invalid={invalidField === 'mfa-enrollment-code'} aria-describedby={error ? 'mfa-error' : undefined}/>
          <button className="sii-submit" type="submit" disabled={!ready}>{busy ? 'Verificando…' : 'Activar autenticador'}</button>
        </form>
      </div>}
      <h3>Confirma tu identidad</h3>
      <p id="mfa-step-up-help">Esta confirmación dura cinco minutos y permite renovar códigos{status.requiredByRole?'':' o desactivar el autenticador'}. Un código ya utilizado requiere esperar al siguiente.</p>
      <form className="password-form" onSubmit={stepUp} aria-describedby="mfa-step-up-help">
        <label htmlFor="mfa-step-up-password">Contraseña actual para confirmar</label>
        <input id="mfa-step-up-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={512} disabled={!ready} aria-invalid={invalidField === 'mfa-step-up-password'} aria-describedby={error ? 'mfa-error' : undefined}/>
        {status.configured && <>
          <label htmlFor="mfa-step-up-factor">{recovery ? 'Código de recuperación para confirmar' : 'Código del autenticador para confirmar'}</label>
          <input key={recovery ? 'recovery' : 'totp'} id="mfa-step-up-factor" name="factor" type="text" autoComplete="one-time-code" inputMode={recovery ? 'text' : 'numeric'} autoCapitalize="characters" spellCheck={false} required minLength={recovery ? 32 : 6} maxLength={recovery ? 128 : 6} pattern={recovery ? undefined : '[0-9]{6}'} disabled={!ready} aria-invalid={invalidField === 'mfa-step-up-factor'} aria-describedby={error ? 'mfa-error' : 'mfa-step-up-help'}/>
          <button type="button" className="sii-submit" disabled={!ready} onClick={() => setRecovery(value => !value)}>{recovery ? 'Usar código del autenticador' : 'Usar código de recuperación'}</button>
        </>}
        <button className="sii-submit" type="submit" disabled={!ready}>{busy ? 'Confirmando…' : 'Confirmar identidad'}</button>
      </form>
      {fresh && <p role="status">Confirmación vigente hasta {new Date(status.stepUpExpiresAt!).toLocaleTimeString('es-MX')}.</p>}
      {status.configured && <div>
        <p>Renovar códigos invalida todos los anteriores.{!status.requiredByRole&&' Desactivar el autenticador cierra las sesiones de los otros dispositivos.'}</p>
        {status.requiredByRole&&<p id="mfa-required-by-role" className="sii-info-banner">No puedes desactivar el autenticador mientras mantengas perfiles privilegiados vigentes.</p>}
        <button type="button" className="sii-outline-button" disabled={!ready || !fresh} onClick={() => void regenerate()}>Renovar códigos de recuperación</button>{' '}
        <button type="button" className="sii-outline-button" disabled={!ready || !fresh || status.requiredByRole} aria-describedby={status.requiredByRole?'mfa-required-by-role':undefined} onClick={() => void revoke()}>Desactivar autenticador y cerrar otros dispositivos</button>
      </div>}
    </>}
    {codes.length > 0 && <div ref={savedCodes} tabIndex={-1} role="region" aria-labelledby="mfa-recovery-title">
      <h3 id="mfa-recovery-title">Guarda estos códigos de recuperación</h3>
      <p role="status">Cada código funciona una sola vez. Se muestran ahora y no podrás consultarlos después de salir de esta pantalla. Guárdalos en un lugar seguro.</p>
      <ul>{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul>
      <button type="button" className="sii-outline-button" onClick={() => setCodes([])}>Ya guardé mis códigos; ocultarlos</button>
    </div>}
  </section>;
}
