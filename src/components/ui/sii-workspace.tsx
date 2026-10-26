'use client';

import {useId,useRef,useState,type ReactNode} from 'react';
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from './sheet';
import {Input} from './input';
import {NativeSelect} from './native-select';

/** Radix owns focus trapping, Escape, inert background and scroll locking. */
export function SiiDrawer({open,onOpenChange,title,description,busy=false,children}:{
 open:boolean;onOpenChange:(open:boolean)=>void;title:string;description:string;busy?:boolean;children:ReactNode;
}){
 const previousFocus=useRef<HTMLElement|null>(null);
 return <Sheet open={open} onOpenChange={value=>{if(!busy)onOpenChange(value)}}>
  <SheetContent className="sii-workspace-drawer" onOpenAutoFocus={()=>{
   previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  }} onCloseAutoFocus={event=>{event.preventDefault();previousFocus.current?.focus();}}
   onEscapeKeyDown={event=>{
    event.preventDefault();
    // A nested decision owns Escape until it is resolved.
    if(document.querySelector('[role="alertdialog"]'))return;
    event.stopPropagation();
    if(!busy)window.setTimeout(()=>onOpenChange(false),0);
   }}
   onInteractOutside={event=>event.preventDefault()}>
   <SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
   <div className="sii-drawer-body" aria-busy={busy}>{children}</div>
  </SheetContent>
 </Sheet>;
}

export type SiiChoice={id:string;label:string};
/** Search is separate from selection: native validation and keyboard stay intact. */
export function SiiSearchSelect({name,label,searchLabel,options,disabled=false,error,defaultValue=''}:{
 name:string;label:string;searchLabel:string;options:SiiChoice[];disabled?:boolean;error?:string;defaultValue?:string;
}){
 const id=useId();
 const [query,setQuery]=useState(''),[selected,setSelected]=useState(defaultValue);
 const normalized=query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX');
 const visible=options.filter(option=>option.id===selected||option.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').includes(normalized));
 return <div className="sii-search-choice">
  <label htmlFor={id+'-search'}>{searchLabel}</label>
  <Input id={id+'-search'} type="search" value={query} disabled={disabled} onChange={event=>setQuery(event.target.value)} placeholder="Nombre o clave"/>
  <label htmlFor={id}>{label}</label>
  <NativeSelect id={id} name={name} required value={selected} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={id+'-hint'+(error?' '+id+'-error':'')} onChange={event=>setSelected(event.target.value)}>
   <option value="" disabled>Seleccionar {label.toLocaleLowerCase('es-MX')}</option>
   {visible.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
  </NativeSelect>
  <small id={id+'-hint'} className="sii-kit-field-hint">{visible.length} opciones disponibles{selected&&query?'; se conserva la selección actual':''}.</small>
  {error&&<small id={id+'-error'} className="sii-field-error">{error}</small>}
 </div>;
}
