'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {SiiStatusBadge} from '@/components/ui/sii-institutional';
import {SiiFeedback} from '@/components/ui/sii-feedback';
import {SiiDateTimeField} from '@/components/ui/sii-date-time-field';
import {useInstitutionConfirmation} from '../sii-confirmation';
import {useOnlineStatus} from '@/shared/client/use-online-status';
import {formatDateTime,toLocalInputValue} from '@/shared/format/date-time';

type Cycle={id:string;code:string;name:string;startDate:string;endDate:string;status:'draft'|'open'|'closed'|'archived'};
const STATUS:Record<Cycle['status'],{label:string;variant:'pending'|'active'|'archived'|'muted'}>={
 draft:{label:'Borrador',variant:'muted'},open:{label:'Abierta',variant:'active'},closed:{label:'Cerrada',variant:'pending'},archived:{label:'Archivada',variant:'archived'},
};
const DURATIONS=[{label:'1 mes',hours:24*30},{label:'3 meses',hours:24*91},{label:'6 meses',hours:24*182}] as const;

/** Admission calls: without an open cycle the public portal cannot receive applications. */
export function AdmissionCycles({institutionId}:{institutionId:string}){
 const online=useOnlineStatus(),{ask,confirmation}=useInstitutionConfirmation();
 const [cycles,setCycles]=useState<Cycle[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[creating,setCreating]=useState(false);
 const [start,setStart]=useState(''),[end,setEnd]=useState('');
 const base=`/api/v1/institutions/${institutionId}/admissions/cycles`;
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);
  try{const response=await fetch(base,{cache:'no-store',credentials:'same-origin',signal});const body=await response.json().catch(()=>null);
   if(!response.ok)throw new Error('LOAD');setCycles(Array.isArray(body?.data)?body.data:[]);}
  catch{if(!signal?.aborted)setError('No se pudieron consultar las convocatorias. Actualiza e inténtalo de nuevo.');}
  finally{if(!signal?.aborted)setLoading(false);}
 },[base]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);

 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving||!online)return;
  const form=event.currentTarget,fields=new FormData(form);
  if(!start||!end||new Date(end)<=new Date(start)){setError('La convocatoria debe terminar después de iniciar.');return;}
  const payload={code:String(fields.get('code')??'').trim(),name:String(fields.get('name')??'').trim(),status:String(fields.get('status')??'draft'),
   startDate:new Date(start).toISOString(),endDate:new Date(end).toISOString()};
  if(!await ask({title:'Crear convocatoria',description:`${payload.code} · ${payload.name}. ${payload.status==='open'?'Quedará abierta en el portal de aspirantes.':'Podrás abrirla después.'}`,confirmLabel:'Crear convocatoria'}))return;
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch(base,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   const body=await response.json().catch(()=>null);
   if(!response.ok){setError(body?.error?.code==='INVALID_INPUT'?'Revisa el código (2–20 caracteres), el nombre y las fechas.':body?.error?.code==='FORBIDDEN'?'Tu acceso a Admisiones cambió.':'No se pudo crear la convocatoria. Verifica que el código no exista.');return;}
   form.reset();setStart('');setEnd('');setCreating(false);setNotice(`Convocatoria ${payload.code} creada.`);await load();
  }catch{setError('Sin conexión. La convocatoria no se creó.');}
  finally{setSaving(false);}
 }

 const now=Date.now();
 return <section className="sii-panel sii-catalog-table-panel" aria-label="Convocatorias de admisión" aria-busy={loading}>{confirmation}
  <div className="sii-catalog-toolbar"><h2>Convocatorias</h2>
   <Button variant="outline" type="button" className="sii-outline-button" aria-expanded={creating} disabled={!online} onClick={()=>setCreating(value=>!value)}>{creating?'Cancelar':'Nueva convocatoria'}</Button></div>
  <SiiFeedback online={online} offlineMessage="Sin conexión. Las convocatorias pueden estar desactualizadas." error={error} notice={notice}/>
  {creating&&<form className="sii-catalog-form" onSubmit={event=>void create(event)} aria-label="Nueva convocatoria">
   <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_1fr]">
    <label>Código<Input name="code" required minLength={2} maxLength={20} placeholder="ADM-2027-1" disabled={saving}/></label>
    <label>Nombre<Input name="name" required minLength={3} maxLength={160} placeholder="Admisión primavera 2027" disabled={saving}/></label>
   </div>
   <SiiDateTimeField id="cycle-start" label="Inicio" value={start} onChange={value=>{setStart(value);setEnd('');}} min={toLocalInputValue(now)} required disabled={saving}/>
   <SiiDateTimeField id="cycle-end" label="Cierre" value={end} onChange={setEnd} min={start||toLocalInputValue(now)} required disabled={saving||!start}
    presets={start?DURATIONS.map(item=>({label:item.label,hours:item.hours+(new Date(start).getTime()-now)/3600000})):[]}/>
   <label>Estado inicial<NativeSelect name="status" defaultValue="draft" disabled={saving}><option value="draft">Borrador (no visible para aspirantes)</option><option value="open">Abierta</option></NativeSelect></label>
   <Button type="submit" className="sii-submit" disabled={saving||!online}>{saving?'Creando…':'Crear convocatoria'}</Button>
  </form>}
  {loading?<p className="sii-empty" role="status">Consultando convocatorias…</p>
   :!cycles.length?<p className="sii-empty">Aún no hay convocatorias. Crea una para recibir solicitudes en el portal de aspirantes.</p>
   :<ul className="grid gap-2" aria-label="Convocatorias registradas">{cycles.map(cycle=><li key={cycle.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
    <div className="min-w-0"><strong className="block">{cycle.name}</strong><small className="text-muted-foreground">{cycle.code} · {formatDateTime(cycle.startDate)} al {formatDateTime(cycle.endDate)}</small></div>
    <SiiStatusBadge variant={STATUS[cycle.status]?.variant??'muted'}>{STATUS[cycle.status]?.label??cycle.status}</SiiStatusBadge>
   </li>)}</ul>}
 </section>;
}
