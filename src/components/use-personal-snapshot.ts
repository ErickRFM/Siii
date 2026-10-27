'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {CollectionReadError,readCollection} from '@/shared/client/read-collection';
import {ASSURANCE_CHANGED_EVENT} from '@/shared/auth/assurance-events';
import {hasAnyCapability,useInstitutionCapabilities} from './institution-capabilities';
import type {PersonalProfile,PersonalCourse,PersonalTeachingGroup,PersonalTeacher,PersonalSchedule,PersonalGrade,PersonalOrder,PersonalPayment,PersonalAnnouncement,PersonalServiceRequest,PersonalRequestEvent} from '@/modules/portal/contracts';

export type PersonalView='home'|'courses'|'teachers'|'grades'|'orders'|'services'|'profile'|'groups'|'schedule';
export type PersonalSnapshot={profile:PersonalProfile|null;courses:PersonalCourse[];teachers:PersonalTeacher[];schedule:PersonalSchedule[];grades:PersonalGrade[];orders:PersonalOrder[];payments:PersonalPayment[];groups:PersonalTeachingGroup[];announcements:PersonalAnnouncement[];requests:PersonalServiceRequest[];pendingRequests:PersonalServiceRequest[];requestHistory:PersonalRequestEvent[]};
const empty:PersonalSnapshot={profile:null,courses:[],teachers:[],schedule:[],grades:[],orders:[],payments:[],groups:[],announcements:[],requests:[],pendingRequests:[],requestHistory:[]};
const resources:Record<PersonalView,readonly Exclude<keyof PersonalSnapshot,'profile'>[]>={home:['courses','teachers','grades','orders','payments','announcements','pendingRequests'],courses:['courses','teachers'],teachers:['teachers'],grades:['grades'],orders:['orders','payments'],services:['requests','requestHistory'],profile:[],groups:['groups'],schedule:['schedule']};
type State={scope:string;view:PersonalView;snapshot:PersonalSnapshot|null;context:string;authority:string;accessChanged:boolean;loading:boolean;error:string;updatedAt:string};
const initial=(scope:string,view:PersonalView):State=>({scope,view,snapshot:null,context:'',authority:'',accessChanged:false,loading:true,error:'',updatedAt:''});

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
   if(!allowed){setState({...initial(scope,view),accessChanged:!permissions.loading&&Boolean(permissions.data),loading:permissions.loading,error:permissions.loading?'':'Tu acceso cambió. Actualiza los permisos o inicia sesión nuevamente.'});return}
   if(!navigator.onLine)throw new Error('OFFLINE');
   const base=`/api/v1/institutions/${institutionId}/portal/${kind}`;
   const response=await fetch(base+'/profile',{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw new CollectionReadError(response.status);
   const context=response.headers.get('x-siii-portal-context');
   const authority=response.headers.get('x-siii-portal-authority');
   if(response.headers.get('x-siii-portal-actor')!==actorId)throw new Error('CONTEXT_CHANGED');
   if(!context||!authority)throw new Error('PROFILE_CONTEXT_UNAVAILABLE');
   const profile=(await response.json()).data as PersonalProfile|null;
   if(controller.signal.aborted)return;
   setState(previous=>previous.scope===scope&&previous.view===view&&previous.context===context?{...previous,authority,accessChanged:false,snapshot:previous.snapshot?{...previous.snapshot,profile}:null}:{...initial(scope,view),context,authority});
   const check=(page:Response)=>{if(page.headers.get('x-siii-portal-authority')!==authority||page.headers.get('x-siii-portal-actor')!==actorId)throw new Error('CONTEXT_CHANGED');if(page.headers.get('x-siii-portal-context')!==context)throw new Error('PROFILE_CHANGED')};
   const entries=profile?await Promise.all(resources[view].map(async resource=>[resource,(await readCollection(base+'/'+(resource==='requestHistory'?'request-history':resource==='pendingRequests'?'pending-requests':resource),{signal:controller.signal},check)).data] as const)):[];
   if(!controller.signal.aborted)setState({scope,view,context,authority,accessChanged:false,snapshot:{...empty,...Object.fromEntries(entries),profile},loading:false,error:'',updatedAt:new Date().toLocaleString('es-MX')});
  }catch(cause){
   if(!controller.signal.aborted){const accessChanged=cause instanceof CollectionReadError&&[401,403].includes(cause.status)||cause instanceof Error&&cause.message==='CONTEXT_CHANGED';controller.abort();setState({...initial(scope,view),accessChanged,loading:false,error:!navigator.onLine?'Sin conexión. Reconecta para consultar información vigente.':accessChanged?'Tu acceso o expediente cambió. Actualiza o inicia sesión nuevamente.':cause instanceof Error&&cause.message==='PROFILE_CHANGED'?'La información cambió durante la consulta. Actualiza para comprobar tu acceso.':'No se pudo consultar esta sección. Reintenta para obtener información vigente.'})}
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
 const retire=()=>{active.current?.abort();active.current=null;setState({...initial(scope,view),loading:false,accessChanged:true,error:'Tu acceso cambió. Actualiza para consultar información vigente.'})};
 return {...(state.scope===scope&&state.view===view?state:initial(scope,view)),refresh:reload,retire};
}
