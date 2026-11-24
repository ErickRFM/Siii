'use client';
import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';
import {SiiEmptyView,SiiSectionHeader} from '@/components/ui/sii-kit';
import SiiScrollRegion from './sii-scroll-region';
import {useInstitutionConfirmation} from './sii-confirmation';

type Claim={
 id:string;enrollmentNumber:string;createdAt:string;
 applicant:{userId:string;username:string;name:string;profileEmail:string|null;verifiedEmail:string|null};
 student:{id:string;name:string;institutionalEmail:string|null;status:string}|null;
 evidence:{verifiedMatchesRecord:boolean;profileMatchesRecord:boolean};
};
const MESSAGES:Record<string,string>={
 FORBIDDEN:'Tu sesión no tiene permiso para resolver vinculaciones o requiere confirmar identidad en Seguridad.',
 CLAIM_UNAVAILABLE:'La solicitud ya fue resuelta o no pertenece a esta institución.',
 SELF_REVIEW_NOT_ALLOWED:'No puedes resolver tu propia solicitud de vinculación.',
 ALREADY_LINKED:'El expediente o la cuenta ya tienen una vinculación activa.',
 STUDENT_NOT_FOUND:'No existe un expediente con esa matrícula.',
 STUDENT_NOT_ACTIVE:'El expediente no está activo; no se puede vincular.',
 APPLICANT_MEMBERSHIP_INACTIVE:'La cuenta solicitante ya no tiene membresía activa en la institución.',
};
const describe=(code:string|undefined)=>MESSAGES[code??'']??'No se pudo completar la operación. Inténtalo de nuevo.';
const evidenceLabel=(claim:Claim)=>!claim.student?'Sin expediente con esa matrícula'
 :claim.evidence.verifiedMatchesRecord?'Correo verificado coincide con el expediente'
 :claim.evidence.profileMatchesRecord?'Solo coincide el correo de perfil (no verificado)'
 :'Los correos no coinciden';

/** Control panel for enrollment claims that the auto-link rule could not approve. */
export default function StudentClaimReview({institutionId}:{institutionId:string}){
 const {ask,confirmation}=useInstitutionConfirmation();
 const [claims,setClaims]=useState<Claim[]>([]);
 const [truncated,setTruncated]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const path=`/api/v1/institutions/${institutionId}/student-links/claims`;
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const response=await fetch(path,{cache:'no-store'});const body=await response.json().catch(()=>null);
   if(!response.ok){setError(describe(body?.error?.code));setClaims([]);return;}
   setClaims(body.data);setTruncated(!!body.truncated);
  }catch{setError(describe(undefined));}
  finally{setLoading(false);}
 },[path]);
 useEffect(()=>{void refresh();},[refresh]);

 async function resolve(claim:Claim,decision:'approve'|'reject'){
  setError('');setNotice('');
  const answer=decision==='approve'
   ?await ask({title:'Aprobar vinculación',description:`La cuenta ${claim.applicant.username} quedará vinculada al expediente ${claim.enrollmentNumber}. La operación será auditada.`,confirmLabel:'Aprobar y vincular'})
   :await ask({title:'Rechazar vinculación',description:`La solicitud de ${claim.applicant.username} para ${claim.enrollmentNumber} quedará rechazada y auditada.`,confirmLabel:'Rechazar solicitud',destructive:true,reasonLabel:'Motivo del rechazo',minReasonLength:3});
  if(answer===null)return;
  setBusy(claim.id);
  try{
   const response=await fetch(`${path}/${claim.id}`,{method:'PATCH',headers:{'content-type':'application/json'},
    body:JSON.stringify(decision==='approve'?{decision}:{decision,reason:answer})});
   const body=await response.json().catch(()=>null);
   if(!response.ok){setError(describe(body?.error?.code));}
   else setNotice(decision==='approve'?`Expediente ${claim.enrollmentNumber} vinculado.`:`Solicitud de ${claim.enrollmentNumber} rechazada.`);
  }catch{setError(describe(undefined));}
  finally{setBusy(null);await refresh();}
 }

 return <section className="sii-panel sii-catalog-table-panel" aria-label="Solicitudes de vinculación pendientes" aria-busy={loading}>
  {confirmation}
  <SiiSectionHeader workspace eyebrow="VINCULACIÓN DE CUENTAS" title="Solicitudes de vinculación pendientes"
   description="Estudiantes que reclamaron una matrícula sin coincidencia verificada de correo. Revisa la evidencia antes de decidir."
   right={<span className="sii-small-count">{loading?'Cargando…':`${claims.length} pendientes${truncated?' (primeras 200)':''}`}</span>}/>
  {error&&<p role="alert" className="sii-catalog-error">{error}</p>}
  {notice&&<p role="status" className="sii-catalog-notice">{notice}</p>}
  {loading?<div className="sii-empty" role="status">Cargando solicitudes…</div>
   :claims.length===0?<SiiEmptyView icon="users" title="No hay solicitudes pendientes." description="Las vinculaciones con correo verificado se aprueban automáticamente."/>
   :<SiiScrollRegion label="Tabla de solicitudes de vinculación, desplazamiento horizontal"><Table scrollable={false} className="sii-catalog-table">
    <TableHeader><TableRow><TableHead scope="col">Matrícula</TableHead><TableHead scope="col">Cuenta solicitante</TableHead><TableHead scope="col">Expediente</TableHead><TableHead scope="col">Evidencia</TableHead><TableHead scope="col">Acciones</TableHead></TableRow></TableHeader>
    <TableBody>{claims.map(claim=><TableRow key={claim.id}>
     <TableCell className="sii-catalog-code">{claim.enrollmentNumber}</TableCell>
     <TableCell><strong>{claim.applicant.name}</strong><small>{claim.applicant.username} · {claim.applicant.verifiedEmail??claim.applicant.profileEmail??'Sin correo'}</small></TableCell>
     <TableCell>{claim.student?<><strong>{claim.student.name}</strong><small>{claim.student.institutionalEmail??'Sin correo institucional'} · {claim.student.status}</small></>:'No encontrado'}</TableCell>
     <TableCell>{evidenceLabel(claim)}</TableCell>
     <TableCell>
      <Button variant="outline" type="button" disabled={!!busy||!claim.student||claim.student.status!=='active'} onClick={()=>void resolve(claim,'approve')}
       aria-label={`Aprobar vinculación de ${claim.enrollmentNumber}`}>Aprobar</Button>{' '}
      <Button variant="outline" type="button" disabled={!!busy} onClick={()=>void resolve(claim,'reject')}
       aria-label={`Rechazar vinculación de ${claim.enrollmentNumber}`}>Rechazar</Button>
     </TableCell>
    </TableRow>)}</TableBody>
   </Table></SiiScrollRegion>}
 </section>;
}
