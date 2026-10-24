'use client';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';

import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
export type ConfirmationOptions={title:string;description:string;confirmLabel?:string;destructive?:boolean;reasonLabel?:string;minReasonLength?:number};
type Request=ConfirmationOptions & {id:number};
export function useInstitutionConfirmation(){
 const [request,setRequest]=useState<Request|null>(null);
 const resolver=useRef<((value:string|null)=>void)|null>(null);
 const sequence=useRef(0);
 const ask=useCallback((options:ConfirmationOptions)=>new Promise<string|null>(resolve=>{
  if(resolver.current){resolve(null);return;}
  resolver.current=resolve;setRequest({...options,id:++sequence.current});
 }),[]);
 const settle=useCallback((answer:string|null)=>{const current=resolver.current;resolver.current=null;setRequest(null);current?.(answer);},[]);
 useEffect(()=>()=>{resolver.current?.(null);resolver.current=null;},[]);
 const confirmation:ReactNode=request?<ConfirmationDialog key={request.id} request={request} onDecision={settle}/>:null;
 return {ask,confirmation};
}
function ConfirmationDialog({request,onDecision}:{request:Request;onDecision:(answer:string|null)=>void}){
 const [reason,setReason]=useState('');
 const panel=useRef<HTMLDivElement>(null),cancelButton=useRef<HTMLButtonElement>(null),reasonField=useRef<HTMLTextAreaElement>(null);
 const min=request.minReasonLength??0;
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const frame=requestAnimationFrame(()=>{(request.reasonLabel?reasonField.current:cancelButton.current)?.focus();});
  return ()=>{cancelAnimationFrame(frame);previous?.focus();};
 },[request]);
 function keyDown(event:globalThis.KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onDecision(null);return;}
  if(event.key!=='Tab')return;
  const elements=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled)')??[]);
  if(!elements.length)return;
  const first=elements[0],last=elements[elements.length-1];
  // Keep keyboard focus inside the modal even when another surface steals it.
  if(!panel.current?.contains(document.activeElement)){
   event.preventDefault();(event.shiftKey?last:first).focus();return;
  }
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 useEffect(()=>{const handle=(event:globalThis.KeyboardEvent)=>keyDown(event);
  document.addEventListener('keydown',handle);
  return ()=>document.removeEventListener('keydown',handle);
 });
 return <div className="sii-confirm-backdrop"><div ref={panel} role="alertdialog" aria-modal="true"
  aria-labelledby="sii-confirm-title" aria-describedby="sii-confirm-description" className="sii-confirm-dialog">
   <div className="sii-confirm-heading"><span className="sii-section-kicker">CONFIRMACIÓN INSTITUCIONAL</span><h2 id="sii-confirm-title">{request.title}</h2><p id="sii-confirm-description">{request.description}</p></div>
   {request.reasonLabel&&<label className="sii-confirm-reason">{request.reasonLabel}
    <Textarea ref={reasonField} value={reason} onChange={e=>setReason(e.target.value)} minLength={min} rows={3} required aria-describedby="sii-confirm-reason-help"/>
    <small id="sii-confirm-reason-help">Motivo obligatorio de al menos {min} caracteres ({reason.trim().length}/{min}).</small></label>}
   <div className="sii-confirm-actions">
    <Button variant="outline" ref={cancelButton} type="button" className="sii-outline-button" onClick={()=>onDecision(null)}>Volver sin cambios</Button>
    <Button variant="default" type="button" className={request.destructive?'sii-confirm-submit sii-confirm-submit--destructive':'sii-confirm-submit'}
     disabled={Boolean(request.reasonLabel)&&reason.trim().length<min}
     onClick={()=>onDecision(request.reasonLabel?reason.trim():'confirmed')}>{request.confirmLabel??'Confirmar operación'}</Button>
   </div>
  </div></div>;
}
