import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Siii · Sistema Universitario',description:'Plataforma institucional de gestión académica'};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="es-MX"><body>{children}</body></html>;
}
