import type {Metadata} from 'next';
import Script from 'next/script';
import {headers} from 'next/headers';
import {invitationFragmentBootstrap} from '@/shared/invitations/fragment-bootstrap';
import {passwordResetFragmentBootstrap} from '@/shared/password-reset/fragment-bootstrap';
import {applicantFragmentBootstrap} from '@/shared/admissions-fragment';
import './globals.css';
import './sii-v2.css';
import './academic-v2.css';
import './sii-ux-refinement.css';
import './sii-motion-polish.css';
import './sii-system-coherence.css';
import './sii-premium-kit.css';
import './sii-kit-components.css';
import './sii-interactions.css';
import './sii-tailwind.css';
import './sii-workspaces.css';
// Final scoped paint layer: shared glass tokens override legacy visual skins without altering their behavior.
import './sii-glass.css';
import './sii-personal-fidelity.css';
import './sii-v5-theme.css';
import './sii-admin-coherence.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'SII · Sistema Institucional Integral',description:'Plataforma institucional de gestión académica'};
const siiThemeBootstrap="(function(){var personal=/^\\/dashboard\\/institutions\\/[^/]+\\/(student|teacher)(\\/|$)/.test(window.location.pathname),stored=null;try{stored=window.localStorage.getItem('sii-theme')}catch(_){}document.documentElement.dataset.siiTheme=stored==='light'?'light':stored==='dark'||personal?'dark':'light'})();";
export default async function RootLayout({children}:{children:React.ReactNode}){
 const nonce=(await headers()).get('x-nonce')??undefined;
 return <html lang="es-MX" data-sii-theme="light" suppressHydrationWarning><body className="sii-ui"><Script id="siii-theme-bootstrap" nonce={nonce} strategy="beforeInteractive">{siiThemeBootstrap}</Script><Script id="siii-invitation-fragment" strategy="beforeInteractive" nonce={nonce}>{invitationFragmentBootstrap}</Script><Script id="siii-password-reset-fragment" strategy="beforeInteractive" nonce={nonce}>{passwordResetFragmentBootstrap}</Script><Script id="siii-applicant-fragment" strategy="beforeInteractive" nonce={nonce}>{applicantFragmentBootstrap}</Script><a className="sii-skip-link" href="#main-content">Saltar al contenido principal</a>{children}</body></html>;
}
