'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import type {CompanionAttendanceHistory} from '@/integrations/companion/attendance-history';
import {ASSURANCE_CHANGED_EVENT} from '@/shared/auth/assurance-events';
import {hasAnyCapability,useInstitutionCapabilities} from './institution-capabilities';
import {Button} from './ui/button';
import {SiiEmptyView,SiiSkeleton} from './ui/sii-kit';
import {PersonalTable} from './personal-table';

const statuses={verified:'Verificada',likely:'Probable',review_required:'Revisión pendiente',rejected:'Rechazada'};
const dispositions={present:'Presente',late:'Retardo',absent:'Ausente'};
type State={scope:string;loading:boolean;error:string;history:CompanionAttendanceHistory|null};
export default function PersonalAttendance({institutionId,session}:{institutionId:string;session:string}){
 const permissions=useInstitutionCapabilities();
 const allowed=hasAnyCapability(permissions.data,'student.self.read');
 const scope=JSON.stringify({institutionId,session,permissions:permissions.data});
 const [state,setState]=useState<State>({scope,loading:true,error:'',history:null});
 const active=useRef<AbortController|null>(null);
 const clear=useCallback(()=>{active.current?.abort();active.current=null;setState({scope,loading:false,error:'Actualiza la consulta para comprobar tu acceso vigente.',history:null})},[scope]);
 const refresh=useCallback(async()=>{
  active.current?.abort();const controller=new AbortController();active.current=controller;
  setState({scope,loading:true,error:'',history:null});
  try{
   if(permissions.loading)return;
   if(!allowed)throw Error('Tu acceso cambió. Inicia sesión nuevamente.');
   if(!navigator.onLine)throw Error('Sin conexión. Reconecta para consultar tu historial.');
   const response=await fetch(`/api/v1/institutions/${institutionId}/companion-attendance/mine`,{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error(response.status===404?'No hay un vínculo e inscripción vigentes para consultar asistencia.':response.status===401||response.status===403?'Tu acceso cambió. Inicia sesión nuevamente.':'El historial de Compañero no está disponible. Reintenta más tarde.');
   if(response.headers.get('x-siii-attendance-session')!==session)throw Error('Tu sesión cambió. Vuelve a abrir esta página.');
   const history=(await response.json()).data as CompanionAttendanceHistory;
   if(!controller.signal.aborted)setState({scope,loading:false,error:'',history});
  }catch(cause){if(!controller.signal.aborted)setState({scope,loading:false,error:cause instanceof Error?cause.message:'No se pudo consultar el historial.',history:null})}
  finally{if(active.current===controller)active.current=null}
 },[scope,institutionId,session,allowed,permissions.loading]);
 useEffect(()=>{
  const visible=()=>{if(document.visibilityState==='visible')void refresh();else clear()};
  const focus=()=>void refresh();
  const logout=(event:SubmitEvent)=>{const form=event.target;if(form instanceof HTMLFormElement){const target=new URL(form.action,location.href);if(target.origin===location.origin&&target.pathname==='/api/v1/auth/logout')clear()}};
  void refresh();window.addEventListener('focus',focus);window.addEventListener('blur',clear);window.addEventListener('online',focus);window.addEventListener('offline',clear);window.addEventListener(ASSURANCE_CHANGED_EVENT,clear);document.addEventListener('visibilitychange',visible);
  document.addEventListener('submit',logout,true);window.addEventListener('beforeunload',clear);
  return()=>{active.current?.abort();window.removeEventListener('focus',focus);window.removeEventListener('blur',clear);window.removeEventListener('online',focus);window.removeEventListener('offline',clear);window.removeEventListener(ASSURANCE_CHANGED_EVENT,clear);document.removeEventListener('visibilitychange',visible);document.removeEventListener('submit',logout,true);window.removeEventListener('beforeunload',clear)};
 },[refresh,clear]);
 const current=state.scope===scope?state:{scope,loading:true,error:'',history:null};
 return <section className="space-y-4" aria-label="Consulta personal de asistencia">
  <p className="text-sm text-muted-foreground">Consulta informativa desde Compañero, limitada a 100 registros y tus inscripciones vigentes. Una revisión pendiente no acredita presencia validada por el docente.</p>
  <Button variant="outline" disabled={current.loading} onClick={()=>void refresh()}>Actualizar asistencia</Button>
  {current.loading&&<SiiSkeleton label="Consultando mi asistencia"/>}
  {current.error&&<p role="alert" className="sii-catalog-error">{current.error}</p>}
  {current.history&&(current.history.records.length?<>
   <p className="text-sm text-muted-foreground">Observado: {new Date(current.history.observedAtEpochSeconds*1000).toLocaleString('es-MX')} · Máximo {current.history.sampleLimit} registros.</p>
   <PersonalTable label="Mi asistencia registrada" rows={current.history.records.map(row=>({...row,id:row.auditRecordId}))} searchText={row=>row.occurrenceDate+' '+statuses[row.status]} columns={[{label:'Fecha de clase',render:row=>row.occurrenceDate},{label:'Estado de revisión',render:row=>statuses[row.status]},{label:'Decisión docente',render:row=>row.disposition?dispositions[row.disposition]:'Sin decisión'},{label:'Grupo académico',render:row=><span className="break-all">{row.sectionId}</span>}]}/>
  </>:<SiiEmptyView icon="registry" title="No hay asistencias disponibles" description="Compañero respondió sin registros para tus inscripciones vigentes. Esta consulta no acredita ausencia ni presencia."/>)}
 </section>;
}
