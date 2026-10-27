'use client';

import {useEffect,useRef,useState,type FormEvent,type Dispatch,type SetStateAction} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {NativeSelect} from './ui/native-select';
import {Card,CardContent,CardHeader,CardTitle} from './ui/card';
import {SiiEmptyView} from './ui/sii-kit';
import {personalRequestCreate} from '@/modules/services/validation';
import {requestStatusLabel,requestTypeLabel,type PersonalServiceRequest,type PersonalRequestEvent} from '@/modules/portal/contracts';
import type {PersonalRequestDraft} from '@/shared/client/personal-request-draft';

export default function PersonalRequests({institutionId,rows,history,canCreate,draft,onDraftChange,onChanged,onDenied}:{institutionId:string;rows:PersonalServiceRequest[];history:PersonalRequestEvent[];canCreate:boolean;draft:PersonalRequestDraft;onDraftChange:Dispatch<SetStateAction<PersonalRequestDraft>>;onChanged:()=>void;onDenied:()=>void}){
 const {requestType,summary,review,attempted}=draft;
 const setRequestType=(requestType:string)=>onDraftChange(previous=>({...previous,requestType})),setSummary=(summary:string)=>onDraftChange(previous=>({...previous,summary})),setReview=(review:PersonalRequestDraft['review'])=>onDraftChange(previous=>({...previous,review})),setAttempted=(attempted:boolean)=>onDraftChange(previous=>({...previous,attempted}));
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[invalid,setInvalid]=useState(false);
 const [query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState(''),[page,setPage]=useState(0);
 const active=useRef<AbortController|null>(null),description=useRef<HTMLTextAreaElement>(null),reviewPanel=useRef<HTMLElement>(null),success=useRef<HTMLParagraphElement>(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 useEffect(()=>{if(review)reviewPanel.current?.focus()},[review]);
 useEffect(()=>{if(notice)success.current?.focus()},[notice]);
 const filtered=rows.filter(row=>(!statusFilter||row.status===statusFilter)&&[row.id,row.summary,requestTypeLabel[row.requestType]].join(' ').toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX'))),last=Math.max(0,Math.ceil(filtered.length/20)-1),current=Math.min(page,last),visible=filtered.slice(current*20,current*20+20);
 function prepare(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!canCreate)return;
  const parsed=personalRequestCreate.safeParse({operationId:crypto.randomUUID(),requestType,summary});
  if(!parsed.success){setInvalid(true);setError('Selecciona el trámite y escribe una descripción de 10 a 1200 caracteres.');description.current?.focus();return}
  setError('');setNotice('');setInvalid(false);setAttempted(false);setReview(parsed.data);
 }
 async function send(){
  if(!review||!canCreate||active.current)return;
  const controller=new AbortController();active.current=controller;setSaving(true);setAttempted(true);setError('');
  try{
   const response=await fetch(`/api/v1/institutions/${institutionId}/portal/student/requests`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(review),signal:controller.signal,cache:'no-store'});
   const body=await response.json().catch(()=>null);
   if(controller.signal.aborted)return;
   if(response.status===401||response.status===403){setError('Tu acceso cambió. Actualiza tus permisos para continuar.');onDenied();return}
   if(response.status===422){setReview(null);setAttempted(false);setInvalid(true);setError('Revisa el tipo de trámite y la descripción antes de volver a enviarla.');requestAnimationFrame(()=>description.current?.focus());return}
   if(response.status===409){setError('No se pudo confirmar este folio. Consulta tus solicitudes antes de iniciar otra.');return}
   if(!response.ok||body?.data?.id!==review.operationId||body.data.requestType!==review.requestType||body.data.summary!==review.summary)throw new Error('UNCONFIRMED_REQUEST');
   setNotice('Solicitud registrada. Folio: '+body.data.id);setSummary('');setRequestType('CERTIFICATE');setReview(null);setAttempted(false);setInvalid(false);onChanged();
  }catch{if(!controller.signal.aborted)setError('No se pudo confirmar el envío. Conservamos los datos revisados; reintenta para comprobar el mismo folio.')}
  finally{if(active.current===controller)active.current=null;if(!controller.signal.aborted)setSaving(false)}
 }
 return <div className="space-y-6">
  <Card><CardHeader><CardTitle><h2>Nueva solicitud</h2></CardTitle></CardHeader><CardContent className="space-y-4">
   <p className="text-sm text-muted-foreground">La institución revisará tu solicitud. Enviarla o recibir una aprobación no emite una constancia ni modifica por sí mismo tus inscripciones.</p>
   <p className="text-sm text-muted-foreground">Si se requieren documentos, tu institución te indicará el canal autorizado para entregarlos.</p>
   {!canCreate&&<p className="sii-info-banner">Tu acceso permite consultar solicitudes. Para iniciar una nueva necesitas un expediente activo y el permiso institucional correspondiente.</p>}
   {notice&&<p ref={success} tabIndex={-1} role="status" className="break-words rounded-lg border p-3 text-sm">{notice}</p>}
   {error&&<p id="personal-request-error" role="alert" className="sii-catalog-error">{error}</p>}
   {review?<section ref={reviewPanel} tabIndex={-1} aria-label="Revisar solicitud" className="space-y-4 rounded-xl border bg-muted p-4"><h3 className="font-semibold">Revisa los datos antes de enviar</h3><dl className="space-y-3"><div><dt className="text-sm text-muted-foreground">Trámite</dt><dd>{requestTypeLabel[review.requestType]}</dd></div><div><dt className="text-sm text-muted-foreground">Descripción</dt><dd className="whitespace-pre-wrap break-words text-sm">{review.summary}</dd></div></dl><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={saving||attempted} onClick={()=>{setReview(null);requestAnimationFrame(()=>description.current?.focus())}}>Volver a editar</Button><Button disabled={saving||!canCreate} onClick={()=>void send()}>{saving?'Enviando…':attempted?'Reintentar envío':'Enviar solicitud'}</Button></div></section>:<form onSubmit={prepare} className="space-y-4"><label className="block space-y-2 text-sm font-medium">Tipo de trámite<NativeSelect value={requestType} onChange={event=>setRequestType(event.target.value)} disabled={!canCreate} required>{Object.entries(requestTypeLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</NativeSelect></label><label className="block space-y-2 text-sm font-medium">Descripción de la solicitud<Textarea ref={description} value={summary} onChange={event=>{setSummary(event.target.value);setInvalid(false)}} rows={4} minLength={10} maxLength={1200} required disabled={!canCreate} aria-invalid={invalid||undefined} aria-describedby={invalid?'personal-request-error':'personal-request-help'}/></label><p id="personal-request-help" className="text-sm text-muted-foreground">De 10 a 1200 caracteres. Describe la gestión que necesitas y evita datos sensibles innecesarios.</p><Button type="submit" disabled={!canCreate}>Revisar solicitud</Button></form>}
  </CardContent></Card>
  <section aria-labelledby="personal-requests-heading" className="space-y-4"><h2 id="personal-requests-heading" className="text-lg font-semibold">Mis solicitudes</h2>
   <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Buscar solicitudes<Input type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0)}}/></label><label className="space-y-2 text-sm font-medium">Estado de las solicitudes<NativeSelect value={statusFilter} onChange={event=>{setStatusFilter(event.target.value);setPage(0)}}><option value="">Todos los estados</option>{Object.entries(requestStatusLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</NativeSelect></label></div>
   {visible.length?visible.map(row=><details key={row.id} className="rounded-xl border bg-card p-4"><summary className="min-h-11 cursor-pointer space-y-2"><span className="block font-semibold">{requestTypeLabel[row.requestType]??row.requestType} · {requestStatusLabel[row.status]??row.status}</span><span className="block break-all text-sm">Folio: {row.id}</span><span className="block text-sm text-muted-foreground">Recibida el {new Date(row.createdAt).toLocaleString('es-MX')}</span></summary><div className="mt-4 space-y-4"><p className="whitespace-pre-wrap break-words text-sm">{row.summary}</p>{row.decisionReason&&<div className="rounded-lg border p-3"><h3 className="font-semibold">Resolución actual</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{row.decisionReason}</p></div>}<h3 className="font-semibold">Historial de seguimiento</h3><ol className="space-y-2">{history.filter(event=>event.requestId===row.id).reverse().map(event=><li key={event.id} className="flex flex-wrap justify-between gap-2 border-l-2 pl-3 text-sm"><span>{requestStatusLabel[event.status]??event.status}{event.decisionReason&&<span className="mt-1 block whitespace-pre-wrap break-words text-muted-foreground">{event.decisionReason}</span>}</span><time className="text-muted-foreground" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('es-MX')}</time></li>)}</ol></div></details>):<SiiEmptyView icon="services" title={query||statusFilter?'Sin solicitudes para estos filtros':'Aún no has enviado solicitudes'} description={query||statusFilter?'Cambia la búsqueda o el estado.':'Cuando inicies un trámite podrás consultar aquí su folio, estado y resolución.'}/>}
   {filtered.length>0&&<nav aria-label="Paginación de solicitudes" className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{filtered.length} solicitudes · Página {current+1} de {last+1}</p><div className="flex gap-2"><Button variant="outline" disabled={current===0} onClick={()=>setPage(current-1)}>Anterior</Button><Button variant="outline" disabled={current===last} onClick={()=>setPage(current+1)}>Siguiente</Button></div></nav>}
  </section>
 </div>;
}
