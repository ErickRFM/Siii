import type {ReactNode} from 'react';
import {SiiBrand} from './sii-brand';
import SiiThemeToggle from './sii-theme-toggle';
export default function PasswordRecoveryShell({children}:{children:ReactNode}){
 return <main id="main-content" tabIndex={-1} className="sii-auth"><section className="sii-auth-story" aria-label="Seguridad de cuenta"><div className="sii-auth-story-top"><SiiBrand light/><span className="sii-story-tag">SEGURIDAD DE CUENTA</span></div><div className="sii-auth-story-content"><h1>Tu cuenta, <em>tu contraseña.</em></h1><p>Recupera el acceso con tu correo verificado y conserva la protección de tu autenticador.</p></div></section><section className="sii-auth-access" aria-label="Recuperación de contraseña"><div className="sii-auth-access-top"><span>RECUPERACIÓN SEGURA</span><SiiThemeToggle/></div><div className="sii-auth-form-wrap">{children}</div></section></main>;
}
