'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {SiiSectionHeader} from '@/components/ui/sii-kit';
import {SiiStatusBadge} from '@/components/ui/sii-institutional';
import {SiiFeedback} from '@/components/ui/sii-feedback';
import {useInstitutionConfirmation} from '../sii-confirmation';
import {useOnlineStatus} from '@/shared/client/use-online-status';
import {formatDateTime,formatRelative} from '@/shared/format/date-time';

type Summary={pending:number;accepted:number;failed:number;retrying:number;activeLeases:number;oldestPendingAt:string|null;lastAcceptedAt:string|null};
type SyncEvent={eventId:string;sectionId:string;sourceVersion:number;state:'queued'|'accepted'|'failed';attempts:number;failureCode:string|null;nextAttemptAt:string|null;updatedAt:string};
type Version={sectionId:string;sourceVersion:number;appliedSourceVersion:number|null;difference:number|null};
type Status={enabled:false;projectionStatus:string}|{enabled:true;deliveryEnabled:boolean;projectionStatus:'observed'|'unverified';summary:Summary;sectionsWithoutSnapshot:number;events:SyncEvent[];truncated:boolean;versionComparison:Version[];observedAt:string};
type Preview={sectionId:string;expectedSourceVersion:number;activePatterns:number;existingOccurrences:number;expectedOccurrences:number;missingOccurrences:number;blockers:string[];ready:boolean};

const STATE={queued:{label:'Pendiente',variant:'pending'},accepted:{label:'Aceptado',variant:'active'},failed:{label:'Fallido',variant:'cancelled'}} as const;
const MESSAGES:Record<string,string>={
 FORBIDDEN:'Tu sesión no tiene permiso de integraciones o requiere confirmar identidad en Seguridad.',
 ACADEMIC_OUTBOX_DISABLED:'La sincronización académica no está habilitada en este entorno.',
 SECTION_NOT_FOUND:'La sección ya no existe.',
 SOURCE_VERSION_CHANGED:'La sección cambió mientras revisabas. Vuelve a consultar la vista previa.',
 VALIDATION_ERROR:'Escribe un motivo de entre 12 y 240 caracteres.',
 INVALID_SECTION:'Sección no válida.',
};
const message=(code?:string)=>MESSAGES[code??'']??'No se pudo completar la consulta. Actualiza e inténtalo de nuevo.';
const shortId=(id:string)=>id.slice(0,8);

/**
 * Operator view of the SIII → Compañero academic outbox. "Aceptado" means Compañero stored the
 * receipt; whether it applied the version is shown separately and only when it was observed.
 */
export function CompanionSyncConsole({institutionId}:{institutionId:string}){
 const online=useOnlineStatus(),{ask,confirmation}=useInstitutionConfirmation();
 const [status,setStatus]=useState<Status|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [preview,setPreview]=useState<Preview|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const base=`/api/v1/institutions/${institutionId}/companion-sync`;

 const load=useCallback(async(signal:AbortSignal)=>{
  setLoading(true);
  try{const response=await fetch(base,{credentials:'same-origin',cache:'no-store',signal});const body=await response.json().catch(()=>null);
   if(!response.ok){setError(message(body?.error?.code));return;}setStatus(body.data);setError('');}
  catch(cause){if(!signal.aborted)setError(cause instanceof TypeError?'Sin conexión. No se pudo consultar la sincronización.':message());}
  finally{if(!signal.aborted)setLoading(false);}
 },[base]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load,revision]);

 async function openPreview(sectionId:string){
  setBusy(true);setError('');setNotice('');setPreview(null);setReason('');
  try{const response=await fetch(`${base}/preflight?${new URLSearchParams({sectionId})}`,{credentials:'same-origin',cache:'no-store'});const body=await response.json().catch(()=>null);
   if(!response.ok){setError(message(body?.error?.code));return;}setPreview(body.data);}
  catch{setError('Sin conexión. No se pudo preparar la recuperación.');}
  finally{setBusy(false);}
 }
 async function recover(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!preview||busy||!online)return;
  if(reason.trim().length<12){setError(MESSAGES.VALIDATION_ERROR);return;}
  if(!await ask({title:`Recuperar sección ${shortId(preview.sectionId)}`,description:'Se genera un snapshot nuevo para Compañero. No reescribe recibos ni eventos fallidos. La operación se audita.',confirmLabel:'Recuperar'}))return;
  setBusy(true);setError('');
  try{
   const response=await fetch(base,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
    body:JSON.stringify({sectionId:preview.sectionId,expectedSourceVersion:preview.expectedSourceVersion,reason:reason.trim(),...(preview.missingOccurrences>0?{materializeOccurrences:true}:{})})});
   const body=await response.json().catch(()=>null);
   if(!response.ok){setError(message(body?.error?.code));return;}
   setPreview(null);setReason('');setNotice('Recuperación encolada. El nuevo snapshot aparecerá como pendiente hasta que Compañero lo acepte.');setRevision(value=>value+1);
  }catch{setError('Sin conexión. La recuperación no se envió.');}
  finally{setBusy(false);}
 }

 const header=<SiiSectionHeader workspace eyebrow="INTEGRACIÓN" title="Sincronización con Compañero"
  description="Entrega de secciones académicas a Compañero. «Aceptado» confirma que Compañero recibió el evento; la versión aplicada se muestra solo cuando se pudo observar."
  right={<Button variant="outline" type="button" className="sii-outline-button" disabled={loading||!online} onClick={()=>setRevision(value=>value+1)}>Actualizar</Button>}/>;
 if(loading&&!status)return <section className="sii-panel" aria-label="Sincronización con Compañero">{header}<p className="sii-empty" role="status">Consultando la sincronización…</p></section>;
 return <section className="sii-panel sii-catalog-table-panel" aria-label="Sincronización con Compañero" aria-busy={loading}>{confirmation}{header}
  <SiiFeedback online={online} offlineMessage="Sin conexión. Los datos pueden estar desactualizados." error={error} notice={notice}/>
  {status&&!status.enabled&&<p className="sii-empty">La sincronización académica con Compañero no está habilitada en este entorno.</p>}
  {status?.enabled&&<>
   <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {[['Pendientes',status.summary.pending,status.summary.oldestPendingAt?`El más antiguo ${formatRelative(status.summary.oldestPendingAt)}`:'Sin pendientes'],
      ['Aceptados',status.summary.accepted,status.summary.lastAcceptedAt?`Último ${formatRelative(status.summary.lastAcceptedAt)}`:'Aún no hay aceptados'],
      ['Fallidos',status.summary.failed,status.summary.retrying?`${status.summary.retrying} en reintento`:'Sin reintentos'],
      ['Secciones sin snapshot',status.sectionsWithoutSnapshot,'Sin versión publicada para Compañero']].map(([label,value,caption])=>
     <div key={String(label)} className="rounded-lg border border-border p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="text-2xl font-bold tabular-nums">{value}</dd><dd className="text-xs text-muted-foreground">{caption}</dd></div>)}
   </dl>
   <p className="flex flex-wrap items-center gap-2 text-sm">
    <SiiStatusBadge variant={status.deliveryEnabled?'active':'muted'}>{status.deliveryEnabled?'Entrega activa':'Entrega desactivada'}</SiiStatusBadge>
    <SiiStatusBadge variant={status.projectionStatus==='observed'?'active':'pending'}>{status.projectionStatus==='observed'?'Versión aplicada observada':'Versión aplicada sin verificar'}</SiiStatusBadge>
    <span className="text-muted-foreground">Consulta: {formatDateTime(status.observedAt)}</span>
   </p>
   {status.versionComparison.some(row=>row.difference!==null&&row.difference>0)&&<div className="grid gap-2"><h3 className="text-sm font-semibold">Secciones con versión atrasada en Compañero</h3>
    <ul className="grid gap-2">{status.versionComparison.filter(row=>row.difference!==null&&row.difference>0).map(row=><li key={row.sectionId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2 text-sm">
     <span>Sección <code>{shortId(row.sectionId)}</code> · SIII v{row.sourceVersion} · Compañero v{row.appliedSourceVersion} <SiiStatusBadge variant="pending">{row.difference} atrás</SiiStatusBadge></span>
     <Button type="button" variant="outline" disabled={busy||!online} onClick={()=>void openPreview(row.sectionId)}>Preparar recuperación</Button></li>)}</ul></div>}
   <div className="grid gap-2"><h3 className="text-sm font-semibold">Eventos recientes{status.truncated?' (últimos 100)':''}</h3>
    {!status.events.length?<p className="sii-empty">No hay eventos de sincronización registrados.</p>
     :<ul className="grid gap-2" aria-label="Eventos de sincronización">{status.events.map(row=><li key={row.eventId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2 text-sm">
      <span className="flex flex-wrap items-center gap-2"><SiiStatusBadge variant={STATE[row.state].variant}>{STATE[row.state].label}</SiiStatusBadge>
       Sección <code>{shortId(row.sectionId)}</code> · v{row.sourceVersion}{row.attempts?` · ${row.attempts} intento${row.attempts===1?'':'s'}`:''}{row.failureCode?<span className="text-muted-foreground"> · {row.failureCode}</span>:null}</span>
      <span className="flex items-center gap-2 text-muted-foreground">{formatDateTime(row.updatedAt)}
       {row.state==='failed'&&<Button type="button" variant="outline" disabled={busy||!online} onClick={()=>void openPreview(row.sectionId)}>Preparar recuperación</Button>}</span></li>)}</ul>}
   </div>
   {preview&&<form className="sii-catalog-form rounded-lg border border-border p-4" onSubmit={event=>void recover(event)} aria-label="Recuperación de sección">
    <h3 className="text-sm font-semibold">Recuperar sección <code>{shortId(preview.sectionId)}</code></h3>
    <p className="text-sm">Versión actual v{preview.expectedSourceVersion} · {preview.activePatterns} patrón(es) activo(s) · {preview.existingOccurrences} de {preview.expectedOccurrences} clases generadas{preview.missingOccurrences?` (se generarán ${preview.missingOccurrences} faltantes)`:''}.</p>
    {preview.blockers.length>0&&<p className="sii-catalog-error" role="status">No se puede recuperar todavía: {preview.blockers.join(', ')}.</p>}
    <label>Motivo de la recuperación<Textarea value={reason} onChange={event=>setReason(event.target.value)} minLength={12} maxLength={240} rows={2} required disabled={busy||!preview.ready}
     placeholder="Ej. Compañero quedó en una versión anterior tras el fallo del día 3"/></label>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy||!online||!preview.ready}>{busy?'Enviando…':'Recuperar sección'}</Button>
     <Button type="button" variant="outline" onClick={()=>setPreview(null)} disabled={busy}>Cancelar</Button></div>
   </form>}
  </>}
 </section>;
}
