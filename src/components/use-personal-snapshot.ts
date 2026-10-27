'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {CollectionReadError,readCollection} from '@/shared/client/read-collection';
import {ASSURANCE_CHANGED_EVENT} from '@/shared/auth/assurance-events';
import {hasAnyCapability,useInstitutionCapabilities} from './institution-capabilities';
import type {PersonalProfile,PersonalCourse,PersonalTeachingGroup,PersonalTeacher,PersonalSchedule,PersonalGrade,PersonalOrder,PersonalPayment,PersonalAnnouncement} from '@/modules/portal/contracts';

export type PersonalView='home'|'courses'|'teachers'|'grades'|'orders'|'services'|'profile'|'groups'|'schedule';
export type PersonalSnapshot={profile:PersonalProfile|null;courses:PersonalCourse[];teachers:PersonalTeacher[];schedule:PersonalSchedule[];grades:PersonalGrade[];orders:PersonalOrder[];payments:PersonalPayment[];groups:PersonalTeachingGroup[];announcements:PersonalAnnouncement[]};
const empty:PersonalSnapshot={profile:null,courses:[],teachers:[],schedule:[],grades:[],orders:[],payments:[],groups:[],announcements:[]};
const resources:Record<PersonalView,readonly Exclude<keyof PersonalSnapshot,'profile'>[]>={home:['orders','announcements'],courses:['courses','teachers'],teachers:['teachers'],grades:['grades'],orders:['orders','payments'],services:[],profile:[],groups:['groups'],schedule:['schedule']};
type State={scope:string;view:PersonalView;snapshot:PersonalSnapshot|null;context:string;loading:boolean;error:string;updatedAt:string};
const initial=(scope:string,view:PersonalView):State=>({scope,view,snapshot:null,context:'',loading:true,error:'',updatedAt:''});

/** Per-mounted-view memory only. Every refresh checks the profile and every
 * collection page must carry the same server context before it can be committed. */
export function usePersonalSnapshot(institutionId:string,kind:'student'|'teacher',actorId:string,view:PersonalView){
 const permissions=useInstitutionCapabilities();
 const allowed=hasAnyCapability(permissions.data,kind==='student'?'student.self.read':'teacher.self.read');
 const permissionContext=JSON.stringify(permissions.data&&{membership:permissions.data.membershipId,grants:permissions.data.grants,capabilities:permissions.data.capabilities,scoped:permissions.data.scopedCapabilities,restricted:permissions.data.restricted,assurance:permissions.data.assurance});
 const scope=`${actorId}:${institutionId}:${kind}:${permissionContext}`;
 const [state,setState]=useState<State>(()=>initial(scope,view));
 const active=useRef<AbortController|null>(null);
 const refresh=useCallback(async(background=false)=>{
  // Coalesce focus + visibility while a request is active. Returning to a page
  // always revalidates: a record link can change without changing capabilities.
  if(background&&active.current)return;
  active.current?.abort();const controller=new AbortController();active.current=controller;
  setState(previous=>previous.scope===scope&&previous.view===view?{...previous,loading:true,error:''}:initial(scope,view));
  try{
   if(!allowed){setState({...initial(scope,view),loading:permissions.loading,error:permissions.loading?'':'Tu acceso cambió. Actualiza los permisos o inicia sesión nuevamente.'});return}
   if(!navigator.onLine)throw new Error('OFFLINE');
   const base=`/api/v1/institutions/${institutionId}/portal/${kind}`;
   const response=await fetch(base+'/profile',{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw new CollectionReadError(response.status);
   const context=response.headers.get('x-siii-portal-context');
   if(response.headers.get('x-siii-portal-actor')!==actorId||!context)throw new Error('CONTEXT_CHANGED');
   const profile=(await response.json()).data as PersonalProfile|null;
   if(controller.signal.aborted)return;
   setState(previous=>previous.scope===scope&&previous.view===view&&previous.context===context?{...previous,snapshot:previous.snapshot?{...previous.snapshot,profile}:null}:{...initial(scope,view),context});
   const check=(page:Response)=>{if(page.headers.get('x-siii-portal-context')!==context||page.headers.get('x-siii-portal-actor')!==actorId)throw new Error('CONTEXT_CHANGED')};
   const entries=profile?await Promise.all(resources[view].map(async resource=>[resource,(await readCollection(base+'/'+resource,{signal:controller.signal},check)).data] as const)):[];
   if(!controller.signal.aborted)setState({scope,view,context,snapshot:{...empty,...Object.fromEntries(entries),profile},loading:false,error:'',updatedAt:new Date().toLocaleString('es-MX')});
  }catch(cause){
   if(!controller.signal.aborted){controller.abort();setState({...initial(scope,view),loading:false,error:!navigator.onLine?'Sin conexión. Reconecta para consultar información vigente.':cause instanceof CollectionReadError&&[401,403].includes(cause.status)||cause instanceof Error&&cause.message==='CONTEXT_CHANGED'?'Tu acceso o expediente cambió. Actualiza o inicia sesión nuevamente.':'No se pudo consultar esta sección. Reintenta para obtener información vigente.'})}
  }finally{if(active.current===controller)active.current=null}
 },[actorId,institutionId,kind,scope,view,allowed,permissions.loading]);
 useEffect(()=>{
  let hidden=document.visibilityState==='hidden';
  const depart=()=>{hidden=true;active.current?.abort();active.current=null};
  const visible=()=>{
   if(document.visibilityState!=='visible'){depart();return}
   // A pre-departure request cannot suppress the fresh check on return.
   const returning=hidden;hidden=false;void refresh(!returning);
  };
  const online=()=>{void refresh()};
  const invalidate=()=>{active.current?.abort();active.current=null;setState({...initial(scope,view),loading:false,error:navigator.onLine?'Tu acceso cambió. Actualiza para consultar tus datos.':'Sin conexión. Reconecta para consultar información vigente.'})};
  void refresh();window.addEventListener('focus',visible);window.addEventListener('blur',depart);document.addEventListener('visibilitychange',visible);window.addEventListener('online',online);window.addEventListener('offline',invalidate);window.addEventListener(ASSURANCE_CHANGED_EVENT,invalidate);
  return()=>{active.current?.abort();active.current=null;window.removeEventListener('focus',visible);window.removeEventListener('blur',depart);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',online);window.removeEventListener('offline',invalidate);window.removeEventListener(ASSURANCE_CHANGED_EVENT,invalidate)};
 },[refresh,scope,view]);
 // Props can change before effects run. Never paint the preceding actor/view's rows.
 const reload=()=>{if(!allowed)permissions.refresh();else void refresh()};
 return {...(state.scope===scope&&state.view===view?state:initial(scope,view)),refresh:reload};
}
