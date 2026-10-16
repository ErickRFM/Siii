import Link from 'next/link';
import type {Route} from 'next';
import { redirect } from 'next/navigation';
import { getIdentity } from '@/shared/auth/session';
import SiiAppShell from '@/components/sii-app-shell';
import PasswordChange from '../password-change';
import MfaSecurity from '@/components/mfa-security';

export const dynamic = 'force-dynamic';

export default async function SecurityPage({searchParams}:{searchParams:Promise<{returnTo?:string}>}) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const {returnTo}=await searchParams;
  const safeReturn=returnTo&&/^\/dashboard\/institutions\/[0-9a-f-]{36}(?:\/(?:academic|roles|invitations|users|admin))?$/.test(returnTo)?returnTo:null;
  return (
    <SiiAppShell firstName={user.firstName} fullName={`${user.firstName} ${user.lastName}`} active="security">
      <div className="sii-page-eyebrow">CENTRO PERSONAL <span className="sii-page-eyebrow-line"/></div>
      <div className="sii-page-heading"><div><h1>Cuenta y seguridad<span className="sii-welcome-period">.</span></h1><p>Gestiona tus credenciales y consulta el estado de tu cuenta.</p></div>
        <Link href="/dashboard" className="sii-outline-button sii-back-link">← Volver a inicio</Link>
      </div>
      {safeReturn&&<div className="sii-info-banner"><p>Configura tu autenticador o confirma tu identidad. Después vuelve a la institución y reintenta la operación; los permisos se comprobarán de nuevo.</p><Link href={safeReturn as Route} className="sii-outline-button">Volver y reintentar la operación</Link></div>}
      <div className="sii-security-layout">
        <div>
        <section className="sii-panel sii-security-card">
          <span className="sii-section-kicker">ACCESO INSTITUCIONAL</span>
          <h2>Cambiar contraseña</h2>
          <p>Para proteger tu cuenta, utiliza una contraseña distinta de la anterior y con al menos 12 caracteres.</p>
          <PasswordChange/>
        </section>
        <MfaSecurity/>
        </div>
        <aside className="sii-panel sii-security-aside">
          <span className="sii-security-shield" aria-hidden="true">◇</span>
          <h2>Información protegida</h2>
          <p>Las operaciones institucionales verifican permisos y membresías directamente en el servidor.</p>
          <div className="sii-access-feature"><span aria-hidden="true">✓</span><div><strong>Tu usuario</strong><small>{user.username}</small></div></div>
          <div className="sii-access-feature"><span aria-hidden="true">✓</span><div><strong>Sesión</strong><small>Autenticada y vigente</small></div></div>
          <p className="sii-security-coming">El restablecimiento de contraseña conserva tu verificación de identidad y requiere iniciar sesión de nuevo.</p>
        </aside>
      </div>
    </SiiAppShell>
  );
}
