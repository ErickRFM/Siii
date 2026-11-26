'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import SiiiWorkspaceHeading from './ui/siii-workspace-heading';
import {Button} from '@/components/ui/button';
import {SiiEmptyView} from '@/components/ui/sii-kit';
import {SiiFeedback} from '@/components/ui/sii-feedback';
import {SiiPagination} from '@/components/ui/sii-pagination';
import {useInstitutionConfirmation} from './sii-confirmation';
import InstitutionStepUp from './institution-step-up';
import {CapabilityState,hasInstitutionCapability,PROFILE_LABELS,SecurityActionLink,useInstitutionCapabilities} from './institution-capabilities';
import {useOnlineStatus} from '@/shared/client/use-online-status';
import {InvitationTable} from './invitations/invitation-table';
import {InvitationForm} from './invitations/invitation-form';
import {invitationErrorMessage,type Invitation,type InvitationDraft,type Scope} from './invitations/invitation-model';

const PAGE_SIZE='10';

export default function InstitutionInvitations({institutionId}:{institutionId:string}){
 const {ask,confirmation}=useInstitutionConfirmation();
 const {data:access,loading:accessLoading,error:accessError,refresh:refreshAccess}=useInstitutionCapabilities(),allowed=hasInstitutionCapability(access,'invitations.manage');
 const online=useOnlineStatus();
 const [rows,setRows]=useState<Invitation[]>([]),[programs,setPrograms]=useState<Scope[]>([]),[campuses,setCampuses]=useState<Scope[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState('');
 const [securityRequired,setSecurityRequired]=useState(false),[stepUpRequired,setStepUpRequired]=useState(false);
 const [history,setHistory]=useState<Array<string|null>>([null]),[nextCursor,setNextCursor]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const feedback=useRef<HTMLParagraphElement>(null),activeRead=useRef<AbortController|null>(null);
 const base=`/api/v1/institutions/${institutionId}`,returnTo=`/dashboard/institutions/${institutionId}/invitations`;
 useEffect(()=>{if(error)feedback.current?.focus();},[error]);
 const reportError=useCallback((message:string)=>{setNotice('');setError(message);},[]);

 const load=useCallback(async(destination:string|null=null,signal?:AbortSignal)=>{
  activeRead.current?.abort();const controller=new AbortController();activeRead.current=controller;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});setLoading(true);setLoadError('');
  try{
   const query=new URLSearchParams({limit:PAGE_SIZE});if(destination)query.set('cursor',destination);
   const response=await fetch(`${base}/invitations?${query}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(!response.ok){const failure=await response.json().catch(()=>({})) as {error?:{code?:string}};throw new Error(failure.error?.code??'SERVER_ERROR');}
   const body=await response.json() as {data:Invitation[];page:{nextCursor:string|null}};
   if(!Array.isArray(body.data)||!body.page)throw new Error('SERVER_ERROR');
   if(activeRead.current!==controller||signal?.aborted)return false;
   setRows(body.data);setNextCursor(body.page.nextCursor);return true;
  }catch(cause){
   if(activeRead.current===controller&&!signal?.aborted){setRows([]);setNextCursor(null);
    setLoadError(cause instanceof TypeError?'Sin conexión. No se pudieron consultar las invitaciones.':invitationErrorMessage(cause instanceof Error?cause.message:undefined));}
   return false;
  }finally{signal?.removeEventListener('abort',cancel);if(activeRead.current===controller&&!signal?.aborted)setLoading(false);}
 },[base]);
 useEffect(()=>{if(!allowed)return;const controller=new AbortController();setHistory([null]);void load(null,controller.signal);return()=>controller.abort();},[allowed,load,revision]);

 // Active programs and campuses feed both the scope picker and the table's scope names.
 useEffect(()=>{
  if(!allowed)return;const controller=new AbortController();
  async function read(path:string){const all:Scope[]=[];let cursor:string|null=null;do{
   const query=new URLSearchParams({limit:'100'});if(cursor)query.set('cursor',cursor);
   const response=await fetch(`${base}/academic/${path}?${query}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error('SERVER_ERROR');
   const body=await response.json() as {data:Scope[];page:{nextCursor:string|null}};all.push(...body.data);cursor=body.page.nextCursor;
  }while(cursor&&!controller.signal.aborted);return all.filter(row=>row.status==='active');}
  void Promise.all([read('programs'),read('campuses')]).then(([programRows,campusRows])=>{if(!controller.signal.aborted){setPrograms(programRows);setCampuses(campusRows);}})
   .catch(()=>{if(!controller.signal.aborted)setError('No se pudieron consultar los ámbitos. Actualiza antes de invitar.');});
  return()=>controller.abort();
 },[allowed,base,revision]);

 const stepUpFresh=Boolean(access?.assurance.stepUpExpiresAt&&new Date(access.assurance.stepUpExpiresAt).getTime()>Date.now());
 const inlineStepUp=Boolean(access?.assurance.mfaConfigured&&access.assurance.mfaVerified&&(stepUpRequired||!stepUpFresh));

 async function mutate(path:string,payload:Record<string,unknown>){
  if(saving||!online)return false;setSaving(true);setError('');setNotice('');setSecurityRequired(false);
  try{
   const response=await fetch(`${base}/invitations${path}`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   const body=await response.json().catch(()=>null);
   if(!response.ok){const code=body?.error?.code??'';setSecurityRequired(['MFA_REQUIRED','PASSWORD_CHANGE_REQUIRED'].includes(code));setStepUpRequired(code==='STEP_UP_REQUIRED');setError(invitationErrorMessage(code));return false;}
   if(!body?.data?.id)throw new Error('INVALID_RESPONSE');
   setStepUpRequired(false);
   setNotice(path.endsWith('/revoke')?'Invitación revocada. El enlace dejó de estar disponible.':path.endsWith('/resend')?'Reenvío registrado. El enlace anterior dejó de estar disponible; la caducidad se conserva.':'Invitación creada. La entrega se comprobará en el listado.');
   setHistory([null]);await load();return true;
  }catch{setError('Sin conexión. La operación no se confirmó. Actualiza el listado antes de reintentar.');return false;}
  finally{setSaving(false);}
 }
 async function create(draft:InvitationDraft){
  if(!await ask({title:'Crear invitación institucional',description:`Se invitará a ${draft.email} con el perfil ${PROFILE_LABELS[draft.role]}. La persona debe aceptar el acceso.`,confirmLabel:'Crear invitación'}))return false;
  return mutate('',draft);
 }
 async function act(row:Invitation,name:'revoke'|'resend'){
  if(!await ask({title:name==='revoke'?'Revocar invitación':'Reenviar invitación',
   description:name==='revoke'?`El enlace de ${row.email} dejará de estar disponible.`:`Se invalidará el enlace anterior de ${row.email} y se conservará la caducidad.`,
   confirmLabel:name==='revoke'?'Revocar invitación':'Confirmar reenvío',destructive:name==='revoke'}))return;
  await mutate(`/${row.id}/${name}`,{});
 }
 async function page(direction:'next'|'previous'){
  const destination=direction==='next'?nextCursor:history[history.length-2];if(destination===undefined)return;
  if(await load(destination))setHistory(current=>direction==='next'?[...current,destination]:current.slice(0,-1));
 }

 if(accessLoading||accessError||access?.restricted)return <CapabilityState returnTo={returnTo}/>;
 if(!allowed)return <p className="sii-info-banner">No tienes permiso para administrar invitaciones.</p>;
 const busy=loading||saving||!online;
 return <div className="sii-workspace sii-workspace--invitations siii-glass-workspace">{confirmation}
  <SiiFeedback online={online} offlineMessage="Sin conexión. El listado puede estar desactualizado; las operaciones están deshabilitadas." error={error} errorId="invitations-error" errorRef={feedback} notice={notice}/>
  {securityRequired&&<SecurityActionLink returnTo={returnTo}/>}
  {inlineStepUp&&<InstitutionStepUp onConfirmed={()=>{setStepUpRequired(false);setSecurityRequired(false);setError('');setNotice('Identidad confirmada. Ya puedes crear o administrar invitaciones durante cinco minutos.');refreshAccess();}}/>}
  <div className="sii-catalog-layout">
   <section className="sii-panel sii-catalog-table-panel" aria-label="Listado de invitaciones" aria-busy={loading}>
    <div className="sii-catalog-toolbar"><SiiiWorkspaceHeading level={2} title="Invitaciones registradas"/>
     <Button variant="outline" type="button" className="sii-outline-button" disabled={busy} onClick={()=>{setRevision(value=>value+1);refreshAccess();}}>Actualizar invitaciones</Button></div>
    {loadError&&<p className="sii-catalog-error" role="alert">{loadError}</p>}
    {loading?<p className="sii-empty" role="status">Consultando invitaciones…</p>
     :loadError?<p className="sii-empty">No se pudo consultar el listado. Actualiza para reintentar.</p>
     :rows.length===0?<SiiEmptyView icon="users" title="No hay invitaciones registradas." description="Crea una invitación para dar acceso con perfil y ámbito definidos."
       action={<Button variant="outline" type="button" onClick={()=>document.getElementById('invitation-email')?.focus()}>Preparar invitación</Button>}/>
     :<InvitationTable rows={rows} programs={programs} campuses={campuses} busy={saving||!online} onAction={(row,name)=>void act(row,name)}/>}
    {(history.length>1||nextCursor)&&<SiiPagination label="Paginación de invitaciones" page={history.length} canPrevious={history.length>1} canNext={Boolean(nextCursor)} disabled={busy}
     onPrevious={()=>void page('previous')} onNext={()=>void page('next')}/>}
   </section>
   <aside className="sii-panel sii-catalog-create">
    <h2>Crear invitación</h2><p>Enlace de un solo uso: la persona debe aceptar el acceso con este correo.</p>
    <InvitationForm base={base} access={access} programs={programs} campuses={campuses} saving={saving} disabled={!online}
     errorId={error?'invitations-error':undefined} onError={reportError} onCreate={create}/>
   </aside>
  </div>
 </div>;
}
