'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ConfirmationOptions} from './sii-confirmation';

type Draft={scope:string;studentId:string;componentId:string;label:string;raw:string;revision:number};
export const gradebookScope=(institutionId:string,sectionId:string)=>JSON.stringify([institutionId,sectionId]);
export const gradebookCell=(scope:string,studentId:string,componentId:string)=>JSON.stringify([scope,studentId,componentId]);

/** Private, component-lifetime capture. A server snapshot never owns unsent revisions. */
export function useGradebookDrafts(institutionId:string,ask:(options:ConfirmationOptions)=>Promise<string|null>){
 const [drafts,setDrafts]=useState<Map<string,Draft>>(()=>new Map());
 const current=useRef(drafts),sequence=useRef(0);
 const clearDrafts=useCallback(()=>{current.current=new Map();setDrafts(current.current);},[]);
 useEffect(()=>{clearDrafts();},[institutionId,clearDrafts]);
 const writeDraft=useCallback((scope:string,studentId:string,componentId:string,label:string,raw:string)=>{
  const next=new Map(current.current);
  next.set(gradebookCell(scope,studentId,componentId),{scope,studentId,componentId,label,raw,revision:++sequence.current});
  current.current=next;setDrafts(next);
 },[]);
 const readDraft=useCallback((key:string)=>current.current.get(key),[]);
 const confirmDraft=useCallback((key:string,revision:number|undefined)=>{
  if(revision===undefined||current.current.get(key)?.revision!==revision)return;
  const next=new Map(current.current);next.delete(key);current.current=next;setDrafts(next);
 },[]);
 const hasDrafts=useCallback((scope?:string)=>Array.from(current.current.values()).some(d=>scope===undefined||d.scope===scope),[]);
 useEffect(()=>{
  let approved:HTMLAnchorElement|null=null,leaving=false,prompting=false;
  function beforeUnload(event:BeforeUnloadEvent){
   if(!hasDrafts()||leaving)return;
   event.preventDefault();event.returnValue='';
  }
  function click(event:MouseEvent){
   const anchor=event.target instanceof Element?event.target.closest('a'):null;
   if(!anchor||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||anchor.download||(anchor.target&&anchor.target!=='_self'))return;
   if(anchor===approved){approved=null;return;}
   const destination=new URL(anchor.href,location.href);
   if(destination.origin!==location.origin||(destination.pathname===location.pathname&&destination.search===location.search)||!hasDrafts())return;
   event.preventDefault();event.stopImmediatePropagation();
   if(prompting)return;
   prompting=true;
   void ask({title:'Salir con notas sin guardar',description:'Hay capturas locales sin guardar. Si sales de esta página se perderán.',confirmLabel:'Salir sin guardar',destructive:true}).then(answer=>{
    prompting=false;
    if(answer&&anchor.isConnected){approved=anchor;leaving=true;anchor.click();}
   });
  }
  document.addEventListener('click',click,true);window.addEventListener('beforeunload',beforeUnload);
  return ()=>{document.removeEventListener('click',click,true);window.removeEventListener('beforeunload',beforeUnload);};
 },[ask,hasDrafts]);
 return {drafts,writeDraft,readDraft,confirmDraft,clearDrafts,hasDrafts};
}
