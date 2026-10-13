import type { Metadata } from 'next';
import './globals.css';
import './sii-v2.css';
export const metadata:Metadata={title:'SII · Sistema Institucional Integral',description:'Plataforma institucional de gestión académica'};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="es-MX"><body>{children}</body></html>;
}
