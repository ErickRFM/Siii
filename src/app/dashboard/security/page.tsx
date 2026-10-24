import Link from 'next/link';
import type {Route} from 'next';
import { redirect } from 'next/navigation';
import { getIdentity } from '@/shared/auth/session';

import PasswordChange from '../password-change';
import MfaSecurity from '@/components/mfa-security';
import { safeSecurityReturn } from '@/shared/auth/security-return';
import {SiiPageIntro} from '@/components/ui/sii-kit';
import {SiiNavIcon} from '@/components/sii-nav-icon';

export const dynamic = 'force-dynamic';

export default async function SecurityPage({searchParams}:{searchParams:Promise<{returnTo?:string}>}) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const {returnTo}=await searchParams;
  const safeReturn = safeSecurityReturn(returnTo);
  return (
    <div className="sii-workspace sii-security-workspace">
      <SiiPageIntro eyebrow="CENTRO PERSONAL" title="Cuenta y seguridad"
        description="Gestiona tus credenciales y consulta el estado de tu cuenta."
        actions={<Link href="/dashboard" className="sii-outline-button sii-back-link">← Volver a inicio</Link>}/>
      {safeReturn&&<div className="sii-info-banner"><p>Configura tu autenticador o confirma tu identidad. Después vuelve a la institución y reintenta la operación; los permisos se comprobarán de nuevo.</p><Link href={safeReturn as Route} className="sii-outline-button">Volver y reintentar la operación</Link></div>}
      <div className="sii-security-layout">
        <MfaSecurity/>
        <div className="sii-security-secondary">
        <section className="sii-panel sii-security-card">
          <span className="sii-section-kicker">ACCESO INSTITUCIONAL</span>
          <h2>Cambiar contraseña</h2>
          <p>Para proteger tu cuenta, utiliza una contraseña distinta de la anterior y con al menos 12 caracteres.</p>
          <PasswordChange/>
        </section>
        <aside className="sii-panel sii-security-aside">
          <span className="sii-security-shield" aria-hidden="true"><SiiNavIcon name="shield"/></span>
          <h2>Información protegida</h2>
          <p>Las operaciones institucionales verifican permisos y membresías directamente en el servidor.</p>
          <div className="sii-access-feature"><span aria-hidden="true">✓</span><div><strong>Tu usuario</strong><small>{user.username}</small></div></div>
          <div className="sii-access-feature"><span aria-hidden="true">✓</span><div><strong>Sesión</strong><small>Autenticada y vigente</small></div></div>
          <p className="sii-security-coming">El restablecimiento de contraseña conserva tu verificación de identidad y requiere iniciar sesión de nuevo.</p>
        </aside>
        </div>
      </div>
    </div>
  );
}
