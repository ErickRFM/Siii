import type {Metadata, Viewport} from 'next';
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
// Legacy portal styles remain available for layout compatibility; V2 solid tokens own final paint.
import './sii-glass.css';
import './sii-personal-fidelity.css';
import './sii-admin-coherence.css';
import './sii-table-responsive.css';
// Personal interior corrective layer after legacy themes and table styles.
import './sii-personal-mobile.css';
// Canonical solid design system must be last: legacy paint layers cannot compete.
import './sii-v5-theme.css';
export const dynamic='force-dynamic';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5f8' },
    { media: '(prefers-color-scheme: dark)', color: '#101319' },
  ],
};
export const metadata:Metadata={
  title:'SII · Sistema Institucional Integral',
  description:'Plataforma institucional de gestión académica',
  applicationName:'SII Universitario',
  appleWebApp:{
    capable:true,
    statusBarStyle:'default',
    title:'SII',
  },
  formatDetection:{
    telephone:false,
  },
};
const siiThemeBootstrap="(function(){var personal=/^\\/dashboard\\/institutions\\/[^/]+\\/(student|teacher)(\\/|$)/.test(window.location.pathname),stored=null;try{stored=window.localStorage.getItem('sii-theme')}catch(_){}document.documentElement.dataset.siiTheme=stored==='light'?'light':stored==='dark'||personal?'dark':'light'})();";
export default async function RootLayout({children}:{children:React.ReactNode}){
 const nonce=(await headers()).get('x-nonce')??undefined;
 return <html lang="es-MX" data-sii-theme="light" suppressHydrationWarning><body className="sii-ui"><Script id="siii-theme-bootstrap" nonce={nonce} strategy="beforeInteractive">{siiThemeBootstrap}</Script><Script id="siii-invitation-fragment" strategy="beforeInteractive" nonce={nonce}>{invitationFragmentBootstrap}</Script><Script id="siii-password-reset-fragment" strategy="beforeInteractive" nonce={nonce}>{passwordResetFragmentBootstrap}</Script><Script id="siii-applicant-fragment" strategy="beforeInteractive" nonce={nonce}>{applicantFragmentBootstrap}</Script><a className="sii-skip-link" href="#main-content">Saltar al contenido principal</a>{children}</body></html>;
}
