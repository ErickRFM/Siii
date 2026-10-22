'use client';
import {createContext,createElement,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {ASSURANCE_CHANGED_EVENT} from '@/shared/auth/assurance-events';
import type {ConfirmationOptions} from './sii-confirmation';

type Draft={scope:string;studentId:string;componentId:string;label:string;raw:string;revision:number};
export const gradebookScope=(institutionId:string,sectionId:string)=>JSON.stringify([institutionId,sectionId]);
export const gradebookCell=(scope:string,studentId:string,componentId:string)=>JSON.stringify([scope,studentId,componentId]);
type Identity={path:string;status:'checking'|'ready'|'unavailable';error:string};
function useMemory(actorId:string){
 const pathname=usePathname();
 const [drafts,setDrafts]=useState<Map<string,Draft>>(()=>new Map());
 const current=useRef(drafts),sequence=useRef(0),selection=useRef(new Map<string,string>());
 const focusToRestore=useRef<{path:string;key:string}|null>(null);
 const epoch=useRef(0),path=useRef(pathname),verifiedPath=useRef<string|null>(null),request=useRef<AbortController|null>(null);
 path.current=pathname;
 const [authorityEpoch,setAuthorityEpoch]=useState(0),[identity,setIdentity]=useState<Identity>({path:pathname,status:'checking',error:''});
 const clearAll=useCallback(()=>{current.current=new Map();selection.current.clear();focusToRestore.current=null;setDrafts(current.current);},[]);
 const clearInstitution=useCallback((institutionId:string)=>{
  const next=new Map(current.current);for(const[key,draft]of next)if((JSON.parse(draft.scope) as string[])[0]===institutionId)next.delete(key);
  selection.current.delete(institutionId);if(focusToRestore.current){const [scope]=JSON.parse(focusToRestore.current.key) as string[];if((JSON.parse(scope) as string[])[0]===institutionId)focusToRestore.current=null;}current.current=next;setDrafts(next);
 },[]);
 const isCurrent=useCallback((version:number)=>epoch.current===version&&verifiedPath.current===path.current,[]);
 const revalidateIdentity=useCallback(async()=>{
  if(focusToRestore.current?.path!==pathname)focusToRestore.current=null;
  const focused=document.activeElement;
  if(verifiedPath.current===pathname&&focused instanceof HTMLInputElement&&focused.dataset.gradebookCell)focusToRestore.current={path:pathname,key:focused.dataset.gradebookCell};
  request.current?.abort();const controller=new AbortController();request.current=controller;
  const version=++epoch.current;verifiedPath.current=null;setAuthorityEpoch(version);setIdentity({path:pathname,status:'checking',error:''});
  try{
   const response=await fetch('/api/v1/auth/me',{cache:'no-store',signal:controller.signal});
   if(controller.signal.aborted||version!==epoch.current||path.current!==pathname)return;
   if(response.status===401){clearAll();setIdentity({path:pathname,status:'unavailable',error:'Tu sesión venció. Inicia sesión de nuevo.'});return;}
   if(!response.ok)throw Error('IDENTITY_UNAVAILABLE');
   const body=await response.json() as {user?:{id?:string;mustChangePassword?:boolean}};
   if(controller.signal.aborted||version!==epoch.current||path.current!==pathname)return;
   if(body.user?.id!==actorId||body.user.mustChangePassword){clearAll();setIdentity({path:pathname,status:'unavailable',error:'Tu sesión cambió. Actualiza la página antes de continuar.'});return;}
   verifiedPath.current=pathname;setIdentity({path:pathname,status:'ready',error:''});
  }catch{if(!controller.signal.aborted&&version===epoch.current)setIdentity({path:pathname,status:'unavailable',error:'No se pudo verificar tu sesión. Las capturas permanecen ocultas hasta volver a comprobar el acceso.'});}
 },[actorId,pathname,clearAll]);
 const retireActor=useCallback(()=>{
  request.current?.abort();epoch.current++;verifiedPath.current=null;setAuthorityEpoch(epoch.current);clearAll();
  setIdentity({path:path.current,status:'unavailable',error:'Tu sesión terminó. Inicia sesión de nuevo.'});
 },[clearAll]);
 useEffect(()=>{void revalidateIdentity();return()=>request.current?.abort();},[revalidateIdentity]);
 useEffect(()=>{
  const visible=()=>{if(document.visibilityState==='visible')void revalidateIdentity();};
  const refresh=()=>{void revalidateIdentity();};
  const online=()=>{if(verifiedPath.current===null)void revalidateIdentity();};
  function logout(event:SubmitEvent){const form=event.target;if(form instanceof HTMLFormElement){const destination=new URL(form.action,location.href);if(destination.origin===location.origin&&destination.pathname==='/api/v1/auth/logout')retireActor();}}
  function beforeUnload(event:BeforeUnloadEvent){if(!current.current.size)return;event.preventDefault();event.returnValue='';}
  window.addEventListener(ASSURANCE_CHANGED_EVENT,refresh);window.addEventListener('focus',visible);window.addEventListener('online',online);document.addEventListener('visibilitychange',visible);
  document.addEventListener('submit',logout,true);window.addEventListener('beforeunload',beforeUnload);
  return()=>{window.removeEventListener(ASSURANCE_CHANGED_EVENT,refresh);window.removeEventListener('focus',visible);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);document.removeEventListener('submit',logout,true);window.removeEventListener('beforeunload',beforeUnload);};
 },[revalidateIdentity,retireActor]);
 const writeDraft=useCallback((scope:string,studentId:string,componentId:string,label:string,raw:string)=>{
  const next=new Map(current.current);next.set(gradebookCell(scope,studentId,componentId),{scope,studentId,componentId,label,raw,revision:++sequence.current});current.current=next;setDrafts(next);
 },[]);
 const readDraft=useCallback((key:string)=>current.current.get(key),[]);
 const confirmDraft=useCallback((key:string,revision:number|undefined)=>{
  if(revision===undefined||current.current.get(key)?.revision!==revision)return;
  const next=new Map(current.current);next.delete(key);current.current=next;setDrafts(next);
 },[]);
 const hasDrafts=useCallback((scope?:string)=>Array.from(current.current.values()).some(d=>scope===undefined||d.scope===scope),[]);
 const restoreFocus=useCallback((scope:string,version:number)=>{
  const candidate=focusToRestore.current;
  if(!candidate||candidate.path!==path.current||!isCurrent(version)||(JSON.parse(candidate.key) as string[])[0]!==scope)return;
  focusToRestore.current=null;
  if(document.activeElement!==document.body)return;
  Array.from(document.querySelectorAll<HTMLInputElement>('input[data-gradebook-cell]')).find(input=>input.dataset.gradebookCell===candidate.key)?.focus({preventScroll:true});
 },[isCurrent]);
 const rememberSection=useCallback((institutionId:string,id:string)=>selection.current.set(institutionId,id),[]);
 const selectedSection=useCallback((institutionId:string)=>selection.current.get(institutionId),[]);
 const reconcileSections=useCallback((institutionId:string,ids:readonly string[])=>{
  const next=new Map(current.current);let changed=false;
  for(const[key,draft]of next){const [tenant,section]=JSON.parse(draft.scope) as string[];if(tenant===institutionId&&!ids.includes(section)){next.delete(key);changed=true;}}
  if(changed){current.current=next;setDrafts(next);}
 },[]);
 return {drafts,writeDraft,readDraft,confirmDraft,clearInstitution,hasDrafts,retireActor,restoreFocus,rememberSection,selectedSection,reconcileSections,revalidateIdentity,isCurrent,authorityEpoch,
  identityReady:identity.path===pathname&&identity.status==='ready',identityChecking:identity.path!==pathname||identity.status==='checking',identityError:identity.path===pathname?identity.error:''};
}
const Context=createContext<ReturnType<typeof useMemory>|null>(null);
/** Only captures live here; private server snapshots remain in the authorized page. */
export function GradebookDraftsProvider({actorId,children}:{actorId:string;children:ReactNode}){return createElement(Context.Provider,{value:useMemory(actorId)},children);}
export function useGradebookDrafts(institutionId:string,ask:(options:ConfirmationOptions)=>Promise<string|null>){
 const memory=useContext(Context);if(!memory)throw Error('GRADEBOOK_MEMORY_PROVIDER_REQUIRED');
 const {hasDrafts,clearInstitution}=memory;
 const clearDrafts=useCallback(()=>clearInstitution(institutionId),[clearInstitution,institutionId]);
 useEffect(()=>{
  let approved:HTMLAnchorElement|null=null,prompting=false;
  function click(event:MouseEvent){
   const anchor=event.target instanceof Element?event.target.closest('a'):null;
   if(!anchor||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||anchor.download||(anchor.target&&anchor.target!=='_self'))return;
   if(anchor===approved){approved=null;return;}
   const destination=new URL(anchor.href,location.href);
   if(destination.origin!==location.origin||(destination.pathname===location.pathname&&destination.search===location.search)||!hasDrafts())return;
   event.preventDefault();event.stopImmediatePropagation();if(prompting)return;prompting=true;
   void ask({title:'Salir con notas sin guardar',description:'Las capturas seguirán temporalmente en memoria mientras permanezcas en el dashboard con acceso vigente. Aún no están guardadas en el servidor.',confirmLabel:'Salir sin guardar'}).then(answer=>{prompting=false;if(answer&&anchor.isConnected){approved=anchor;anchor.click();}});
  }
  document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true);
 },[ask,hasDrafts]);
 return {...memory,clearDrafts};
}
