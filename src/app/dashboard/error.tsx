'use client';

import {useEffect} from 'react';
import Link from 'next/link';

export default function DashboardError({
 error,
 reset,
}:{
 error:Error&{digest?:string};
 reset:()=>void;
}){
 useEffect(()=>{
  // Never log user data or database connection strings in the browser.
  console.error('SIII_DASHBOARD_RENDER_FAILED', {digest:error.digest ?? 'unavailable'});
 },[error]);
 return (
  <main className="siii-glass-workspace flex min-h-[55vh] items-center justify-center px-4 py-12" role="alert">
   <section className="sii-panel w-full max-w-xl rounded-3xl p-6 text-center sm:p-10">
    <p className="sii-section-kicker">SIII · Recuperación de acceso</p>
    <h1 className="mt-3 text-2xl font-semibold tracking-tight">No pudimos cargar este espacio</h1>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
     Ocurrió un problema temporal al consultar tu información institucional.
     Tus datos no se han modificado. Puedes intentar cargar de nuevo.
    </p>
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
     <button type="button" onClick={reset} className="sii-outline-button">Volver a intentar</button>
     <Link href="/dashboard" className="sii-outline-button">Ir a mis contextos</Link>
    </div>
    {error.digest&&<p className="mt-6 text-xs text-muted-foreground">Referencia de soporte: {error.digest}</p>}
   </section>
  </main>
 );
}
