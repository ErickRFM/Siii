import type {Metadata} from 'next';
import Script from 'next/script';
import {headers} from 'next/headers';
import {invitationFragmentBootstrap} from '@/shared/invitations/fragment-bootstrap';
import './globals.css';
import './sii-v2.css';
import './academic-v2.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'SII · Sistema Institucional Integral',description:'Plataforma institucional de gestión académica'};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const nonce=(await headers()).get('x-nonce')??undefined;
 return <html lang="es-MX"><body><Script id="siii-invitation-fragment" strategy="beforeInteractive" nonce={nonce}>{invitationFragmentBootstrap}</Script><a className="sii-skip-link" href="#main-content">Saltar al contenido principal</a>{children}</body></html>;
}
