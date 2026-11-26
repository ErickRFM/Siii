'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {SiiDateTimeField} from '@/components/ui/sii-date-time-field';
import {PROFILE_LABELS,type InstitutionCapabilities,type InstitutionGrant} from '../institution-capabilities';
import {formatDateTime,toLocalInputValue} from '@/shared/format/date-time';
import {LINK_MAX_DAYS,invitationErrorMessage,type InvitationDraft,type Scope} from './invitation-model';

const GRANT_PRESETS=[{label:'1 mes',hours:24*30},{label:'6 meses',hours:24*182},{label:'1 año',hours:24*365}] as const;
const LINK_PRESETS=[{label:'24 horas',hours:24},{label:'3 días',hours:72},{label:'7 días',hours:24*LINK_MAX_DAYS}] as const;

/**
 * Invitation form: scope → profile → deadlines. Authority for program/campus scopes is
 * re-read from the server; the API remains the only gate.
 */
export function InvitationForm({base,access,programs,campuses,saving,disabled,errorId,onError,onCreate}:{
 base:string;access:InstitutionCapabilities|null;programs:Scope[];campuses:Scope[];saving:boolean;disabled:boolean;errorId?:string;
 onError:(message:string)=>void;onCreate:(draft:InvitationDraft)=>Promise<boolean>;
}){
 const [scopeType,setScopeType]=useState<InstitutionGrant['scopeType']>('institution'),[scopeId,setScopeId]=useState(''),[role,setRole]=useState('');
 const [authority,setAuthority]=useState<InstitutionCapabilities['scopedCapabilities'][number]|null>(null),[scopeLoading,setScopeLoading]=useState(false);
 const [grantExpiry,setGrantExpiry]=useState(''),[linkExpiry,setLinkExpiry]=useState('');
 useEffect(()=>{
  setAuthority(null);if(scopeType==='institution'||!scopeId){setScopeLoading(false);return;}
  const controller=new AbortController();setScopeLoading(true);
  void(async()=>{try{
   const response=await fetch(`${base}/capabilities?${new URLSearchParams({scopeType,scopeId})}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error('INVALID_SCOPE');
   const body=await response.json() as {data:InstitutionCapabilities};
   if(!controller.signal.aborted&&!body.data.restricted)setAuthority(body.data.scopedCapabilities.find(scope=>scope.scopeType===scopeType&&scope.scopeId===scopeId)??null);
  }catch(cause){if(!controller.signal.aborted)onError(cause instanceof TypeError?'Sin conexión. No se pudo verificar tu autoridad para este ámbito.':invitationErrorMessage(cause instanceof Error?cause.message:undefined));}
  finally{if(!controller.signal.aborted)setScopeLoading(false);}})();
  return()=>controller.abort();
 },[scopeType,scopeId,base,access,onError]);

 const selected=scopeType==='institution'?access:authority?.scopeType===scopeType&&authority.scopeId===scopeId?authority:null;
 const grantable=selected?.grantableRoles??[],limit=role?selected?.grantExpiryLimits[role]:undefined;
 const nowMs=Date.now(),limitMs=limit?new Date(limit).getTime():Infinity;
 const linkMaxMs=Math.min(nowMs+LINK_MAX_DAYS*86400000,limitMs,grantExpiry?new Date(grantExpiry).getTime():Infinity);
 const minimum=toLocalInputValue(nowMs+60000);
 const busy=disabled||saving;

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!grantable.includes(role))return;
  const form=event.currentTarget,now=Date.now();
  const grantTime=grantExpiry?new Date(grantExpiry).getTime():null,linkTime=linkExpiry?new Date(linkExpiry).getTime():null;
  if(grantTime!==null&&(!Number.isFinite(grantTime)||grantTime<=now||grantTime>limitMs)){onError('La vigencia del perfil debe ser futura y no superar el límite de tu autorización.');return;}
  if(limit&&grantTime===null){onError('Indica la vigencia del perfil según tu autorización.');return;}
  if(linkTime!==null&&(!Number.isFinite(linkTime)||linkTime<=now||linkTime>Math.min(now+LINK_MAX_DAYS*86400000,limitMs,grantTime??Infinity))){onError('El enlace debe vencer en el futuro, dentro de siete días y antes de la vigencia del perfil y tu autorización.');return;}
  const created=await onCreate({email:String(new FormData(form).get('email')??'').trim(),role,scopeType,scopeId:scopeType==='institution'?null:scopeId,
   ...(linkExpiry?{expiresAt:new Date(linkExpiry).toISOString()}:{}),grantExpiresAt:grantExpiry?new Date(grantExpiry).toISOString():null});
  if(created){form.reset();setRole('');setGrantExpiry('');setLinkExpiry('');}
 }

 const scopes=scopeType==='program'?programs:campuses;
 return <form className="sii-catalog-form" onSubmit={event=>void submit(event)} aria-describedby={errorId}>
  <label>Correo del destinatario<Input id="invitation-email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} placeholder="nombre@institucion.edu.mx"/></label>
  <label>Ámbito<NativeSelect aria-label="Ámbito" value={scopeType} disabled={busy}
   onChange={event=>{setScopeType(event.target.value as InstitutionGrant['scopeType']);setScopeId('');setRole('');setGrantExpiry('');}}>
   <option value="institution">Institución</option><option value="program">Programa</option><option value="campus">Campus</option></NativeSelect></label>
  {scopeType!=='institution'&&<label>{scopeType==='program'?'Programa':'Campus'}<NativeSelect aria-label={scopeType==='program'?'Programa':'Campus'} value={scopeId} required disabled={busy}
   onChange={event=>{setScopeId(event.target.value);setRole('');setGrantExpiry('');}}>
   <option value="">Seleccionar {scopeType==='program'?'programa':'campus'}</option>{scopes.map(scope=><option key={scope.id} value={scope.id}>{scope.code?`${scope.code} · `:''}{scope.name}</option>)}</NativeSelect></label>}
  {scopeLoading&&<p role="status" className="text-xs text-muted-foreground">Comprobando autoridad del ámbito…</p>}
  <label>Perfil<NativeSelect aria-label="Perfil" value={role} required disabled={busy||scopeLoading} onChange={event=>{setRole(event.target.value);setGrantExpiry('');setLinkExpiry('');}}>
   <option value="">Seleccionar perfil</option>
   {Object.entries(PROFILE_LABELS).map(([value,label])=><option key={value} value={value} disabled={!grantable.includes(value)}>{label}{grantable.includes(value)?'':' (sin autoridad)'}</option>)}
  </NativeSelect></label>
  <SiiDateTimeField id="invitation-grant-expiry" label="Vigencia del perfil" value={grantExpiry} onChange={value=>{setGrantExpiry(value);setLinkExpiry('');}}
   min={minimum} max={limit?toLocalInputValue(new Date(limit)):undefined} required={Boolean(limit)} disabled={busy||!role} presets={GRANT_PRESETS}
   empty={{label:'Sin vencimiento',summary:'El perfil no vence; puedes revocarlo cuando sea necesario.'}}
   hint={limit?`Tu autorización permite hasta el ${formatDateTime(limit)}.`:undefined}/>
  <SiiDateTimeField id="invitation-link-expiry" name="expiresAt" label="Caducidad del enlace" value={linkExpiry} onChange={setLinkExpiry}
   min={minimum} max={Number.isFinite(linkMaxMs)?toLocalInputValue(linkMaxMs):undefined} disabled={busy||Boolean(limit&&!grantExpiry)} presets={LINK_PRESETS}
   empty={{label:'Máximo permitido',summary:`El enlace vence en ${LINK_MAX_DAYS} días o antes, según tu autorización.`}}/>
  <Button variant="default" className="sii-submit" type="submit" disabled={busy||scopeLoading||!grantable.includes(role)}>{saving?'Guardando…':'Crear invitación'}</Button>
 </form>;
}
