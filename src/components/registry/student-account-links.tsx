'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {SiiSectionHeader} from '@/components/ui/sii-kit';
import {SiiFeedback} from '@/components/ui/sii-feedback';
import {useInstitutionConfirmation} from '../sii-confirmation';
import {useOnlineStatus} from '@/shared/client/use-online-status';
import {userFacingError} from '@/shared/client/user-facing-error';
import {formatDateTime} from '@/shared/format/date-time';

type StudentLink={id:string;createdAt:string;studentId:string;enrollmentNumber:string;firstName:string;lastName:string;membershipId:string;username:string};
const LINK_MESSAGES:Readonly<Record<string,string>>={
 LINK_NOT_ACTIVE:'El vínculo ya no estaba activo. Actualiza la lista.',
 VALIDATION_ERROR:'Escribe un motivo de entre 3 y 500 caracteres.',
 FORBIDDEN:'Tu sesión no tiene permiso para revisar vinculaciones o requiere confirmar identidad en Seguridad.',
};

/**
 * Active student ↔ account links with revocation (audit A3). A wrong link used to be permanent;
 * revoking frees the record for the right account and stops Compañero authority on its next check.
 */
export default function StudentAccountLinks({institutionId,assured}:{institutionId:string;assured:boolean}){
 const online=useOnlineStatus(),{ask,confirmation}=useInstitutionConfirmation();
 const [links,setLinks]=useState<StudentLink[]>([]),[truncated,setTruncated]=useState(false),[loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 const path=`/api/v1/institutions/${institutionId}/student-links`;
 const load=useCallback(async(signal:AbortSignal)=>{
  setLoading(true);
  try{const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal});const body=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(body?.error?.code??'ERROR');setLinks(body.data??[]);setTruncated(Boolean(body.truncated));setError('');}
  catch(cause){if(!signal.aborted)setError(userFacingError(cause,LINK_MESSAGES));}
  finally{if(!signal.aborted)setLoading(false);}
 },[path]);
 useEffect(()=>{if(!assured)return;const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[assured,load,revision]);

 async function revoke(link:StudentLink){
  const reason=await ask({title:'Revocar vinculación de expediente',description:`La cuenta ${link.username} dejará de estar vinculada al expediente ${link.enrollmentNumber}. El estudiante podrá volver a solicitarla y su acceso académico en Compañero se retira en la siguiente consulta.`,
   confirmLabel:'Revocar vínculo',destructive:true,reasonLabel:'Motivo de la revocación',minReasonLength:3});
  if(reason===null)return;
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(path,{method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({id:link.id,reason})});
   const body=await response.json().catch(()=>null);
   if(!response.ok){setError(userFacingError(body?.error?.code??'ERROR',LINK_MESSAGES));return;}
   setNotice(`Vínculo de ${link.enrollmentNumber} revocado.`);setRevision(value=>value+1);
  }catch(cause){setError(userFacingError(cause));}
  finally{setSaving(false);}
 }

 return <section className="sii-panel sii-catalog-table-panel" aria-label="Expedientes vinculados" aria-busy={loading}>{confirmation}
  <SiiSectionHeader workspace eyebrow="VINCULACIÓN DE CUENTAS" title="Expedientes vinculados"
   description="Cuentas de estudiantes vinculadas a su expediente. Revoca un vínculo equivocado para que la persona correcta pueda reclamarlo."
   right={assured&&!loading?<span className="sii-small-count">{links.length}{truncated?'+':''} activos</span>:undefined}/>
  {!assured?<p className="sii-empty" role="status">Confirma tu identidad en <Link href="/dashboard/security" className="underline underline-offset-2">Seguridad</Link> para administrar los vínculos.</p>:<>
   <SiiFeedback online={online} offlineMessage="Sin conexión. La lista puede estar desactualizada." error={error} notice={notice}/>
   {loading?<p className="sii-empty" role="status">Consultando vínculos…</p>
    :!links.length?<p className="sii-empty">No hay expedientes vinculados todavía.</p>
    :<ul className="grid gap-2" aria-label="Vínculos de expediente activos">{links.map(link=><li key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-2">
     <span className="min-w-0"><strong>{link.enrollmentNumber} · {link.firstName} {link.lastName}</strong>
      <small className="block text-muted-foreground">Cuenta {link.username} · desde {formatDateTime(link.createdAt)}</small></span>
     <Button type="button" variant="outline" disabled={saving||!online} onClick={()=>void revoke(link)} aria-label={`Revocar vínculo de ${link.enrollmentNumber}`}>Revocar</Button>
    </li>)}</ul>}
  </>}
 </section>;
}
