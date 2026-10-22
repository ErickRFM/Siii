'use client';

import { useEffect, useState } from 'react';

type Applicant = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  curp?: string;
};

export default function AdmissionsPortal({
  institutionId,
  institutionName,
  programs = [],
  cycles = [],
}: {
  institutionId: string;
  institutionName: string;
  programs?: { id: string; name: string; code: string }[];
  cycles?: { id: string; name: string; code: string; status: string }[];
}) {
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [mode, setMode] = useState<'register' | 'login' | 'application'>('register');

  const [sessionReady,setSessionReady]=useState(false);
  useEffect(()=>{let active=true;const controller=new AbortController();fetch('/api/v1/admissions/session',{cache:'no-store',signal:controller.signal}).then(async response=>response.ok?response.json():null).then(body=>{if(active&&body?.data?.applicant){setApplicant(body.data.applicant);setMode('application');}}).catch(()=>{if(active)setError('No se pudo comprobar la sesión. Revisa tu conexión e inicia sesión de nuevo.');}).finally(()=>{if(active)setSessionReady(true);});return()=>{active=false;controller.abort();};},[]);
  async function resend(){setLoading(true);setError('');try{const response=await fetch('/api/v1/admissions/resend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});if(!response.ok)throw Error('No se pudo solicitar el correo. Vuelve a intentar.');setPassword('');setSuccess('Si falta verificar tu correo, recibirás un enlace para elegir tu contraseña.');}catch(cause){setError(cause instanceof Error?cause.message:'Sin conexión.');}finally{setLoading(false);}}
  async function logout(){setLoading(true);setError('');try{const response=await fetch('/api/v1/admissions/logout',{method:'POST'});if(!response.ok)throw Error('No se pudo cerrar la sesión. Vuelve a intentar.');setApplicant(null);setPassword('');setMode('login');setSubmittedApplicationNumber(null);setSuccess('Sesión cerrada.');}catch(cause){setError(cause instanceof Error?cause.message:'Sin conexión.');}finally{setLoading(false);}}
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [curp, setCurp] = useState('');

  // Application states
  const [selectedCycleId, setSelectedCycleId] = useState(cycles[0]?.id ?? '');
  const [selectedProgramId, setSelectedProgramId] = useState(programs[0]?.id ?? '');
  const [notes, setNotes] = useState('');

  // Status and feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittedApplicationNumber, setSubmittedApplicationNumber] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/v1/admissions/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName, lastName, phone, curp }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Error en el registro');

      setPassword('');
      setSuccess('Si la cuenta puede verificarse, recibirás un correo. Abre el enlace para verificar tu correo y elegir tu contraseña. Si no llega, usa Reenviar verificación.');
      setMode('login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error en el registro');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/v1/admissions/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Credenciales incorrectas');

      setPassword('');
      setApplicant(body.data.applicant);
      setSuccess(`Bienvenido(a), ${body.data.applicant.firstName}`);
      setMode('application');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de acceso');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicant) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/v1/institutions/${institutionId}/admissions/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId: selectedCycleId,
          programId: selectedProgramId,
          notes,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Error al enviar la solicitud');

      setSubmittedApplicationNumber(body.data.applicationNumber);
      setSuccess(`Solicitud enviada exitosamente con el folio: ${body.data.applicationNumber}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  if(!sessionReady)return <section className="sii-panel" aria-label="Portal de admisiones"><p role="status">Comprobando sesión de aspirante…</p></section>;
  return (
    <div className="sii-panel" aria-label="Portal de admisiones">
      <div className="sii-panel-top">
        <div>
          <span className="sii-section-kicker">ADMISIONES E INGRESO</span>
          <h2>Portal de Aspirantes · {institutionName}</h2>
          <p>Envía tu solicitud de ingreso y consulta el estatus de tu proceso de admisión.</p>
        </div>
      </div>

      {error && <div className="sii-notice sii-notice--error" role="alert">{error}</div>}
      {success && <div className="sii-notice sii-notice--success" role="status">{success}</div>}

      {!applicant && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap:'wrap', gap: '0.5rem' }}>
          <button
            type="button"
            className={mode === 'register' ? 'sii-primary-button' : 'sii-outline-button'}
            onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
          >
            Crear cuenta de aspirante
          </button>
          <button
            type="button"
            className={mode === 'login' ? 'sii-primary-button' : 'sii-outline-button'}
            onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
          >
            Iniciar sesión de aspirante
          </button>
        </div>
      )}

      {mode === 'register' && !applicant && (
        <form onSubmit={handleRegister} className="sii-form-grid">
          <div className="sii-field">
            <label htmlFor="reg-email">Correo electrónico *</label>
            <input id="reg-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="sii-field">
            <label htmlFor="reg-first-name">Nombre(s) *</label>
            <input id="reg-first-name" type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>
          <div className="sii-field">
            <label htmlFor="reg-last-name">Apellido(s) *</label>
            <input id="reg-last-name" type="text" required value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
          <div className="sii-field">
            <label htmlFor="reg-phone">Teléfono de contacto</label>
            <input id="reg-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="sii-field">
            <label htmlFor="reg-curp">CURP / Identificación oficial</label>
            <input id="reg-curp" type="text" value={curp} onChange={e => setCurp(e.target.value)} />
          </div>
          <button type="submit" disabled={loading} className="sii-primary-button">
            {loading ? 'Registrando...' : 'Registrarme como aspirante'}
          </button>
        </form>
      )}

      {mode === 'login' && !applicant && (
        <form onSubmit={handleLogin} className="sii-form-grid">
          <div className="sii-field">
            <label htmlFor="login-email">Correo electrónico *</label>
            <input id="login-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="sii-field">
            <label htmlFor="login-password">Contraseña *</label>
            <input id="login-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={loading} className="sii-primary-button">
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
          <button type="button" className="sii-outline-button" disabled={loading||!email} onClick={resend}>Reenviar verificación</button>
        </form>
      )}

      {cycles.length===0&&<p role="status">No hay convocatorias abiertas en este momento.</p>}
      {applicant && (
        <div>
          <button type="button" className="sii-outline-button" onClick={logout} disabled={loading}>Cerrar sesión de aspirante</button>
          <div className="sii-info-banner" style={{ marginBottom: '1rem' }}>
            Aspirante autenticado(a): <strong>{applicant.firstName} {applicant.lastName}</strong> ({applicant.email})
          </div>

          {submittedApplicationNumber ? (
            <div className="sii-card">
              <h3>Solicitud de Admisión Registrada</h3>
              <p>Tu folio de seguimiento es: <strong>{submittedApplicationNumber}</strong></p>
              <p>Control Escolar revisará tu información y dictaminará tu solicitud.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmitApplication} className="sii-form-grid">
              <div className="sii-field">
                <label htmlFor="app-cycle">Convocatoria de admisión *</label>
                <select id="app-cycle" required value={selectedCycleId} onChange={e => setSelectedCycleId(e.target.value)}>
                  {cycles.map(cycle => (
                    <option key={cycle.id} value={cycle.id}>{cycle.name} ({cycle.code})</option>
                  ))}
                </select>
              </div>

              <div className="sii-field">
                <label htmlFor="app-program">Carrera / Programa académico *</label>
                <select id="app-program" required value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)}>
                  {programs.map(prog => (
                    <option key={prog.id} value={prog.id}>{prog.name} ({prog.code})</option>
                  ))}
                </select>
              </div>

              <div className="sii-field">
                <label htmlFor="app-notes">Comentarios o información adicional</label>
                <textarea id="app-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              <button type="submit" disabled={loading||!selectedCycleId||!selectedProgramId} className="sii-primary-button">
                {loading ? 'Enviando...' : 'Enviar solicitud de admisión'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
