'use client';

import {useEffect} from 'react';

export default function ApplicationError({
 error,
 reset,
}:{
 error:Error&{digest?:string};
 reset:()=>void;
}){
 useEffect(()=>{
  console.error('SIII_APPLICATION_RENDER_FAILED',{digest:error.digest??'unavailable'});
 },[error]);
 return (
  <main className="siii-glass-workspace flex min-h-[70vh] items-center justify-center px-4 py-12" role="alert">
   <section className="sii-panel w-full max-w-xl rounded-3xl p-6 text-center sm:p-10">
    <p className="sii-section-kicker">SIII · Conexión institucional</p>
    <h1 className="mt-3 text-2xl font-semibold tracking-tight">No se pudo cargar esta pantalla</h1>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
     Ocurrió un error al cargar la información. Intenta nuevamente; si continúa,
     comparte la referencia de soporte con el administrador.
    </p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
     <button type="button" onClick={reset} className="sii-outline-button">Reintentar</button>
     <a className="sii-outline-button" href="/login">Ir al acceso</a>
    </div>
    {error.digest&&<p className="mt-6 text-xs text-muted-foreground">Referencia: {error.digest}</p>}
   </section>
  </main>
 );
}
