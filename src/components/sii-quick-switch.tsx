'use client';

import Link from 'next/link';
import type {Route} from 'next';
import {useRouter} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {SiiNavIcon} from './sii-nav-icon';

/** Client-only navigation projection, not an authorization boundary. */
export type SiiQuickLink={id:string;label:string;href:string;group:'Plataforma'|'Gestión académica'};
export default function SiiQuickSwitch({links}:{links:readonly SiiQuickLink[]}){
 const [open,setOpen]=useState(false);
 const [query,setQuery]=useState('');
 const router=useRouter();
 const input=useRef<HTMLInputElement>(null);
 const dialog=useRef<HTMLDivElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();setOpen(value=>!value);
   }
   if(event.key==='Escape')setOpen(false);
  };
  document.addEventListener('keydown',onKey);
  return ()=>document.removeEventListener('keydown',onKey);
 },[]);
 useEffect(()=>{
  if(!open){setQuery('');return;}
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const returnFocus=trigger.current;
  const oldBodyOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  input.current?.focus();
  return ()=>{
   document.body.style.overflow=oldBodyOverflow;
   if(previous?.isConnected)previous.focus();else returnFocus?.focus();
  };
 },[open]);
 const filtered=links.filter(link=>link.label.toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX')));
 useEffect(()=>{
  if(!open)return;
  const onTab=(event:KeyboardEvent)=>{
   if(event.key!=='Tab')return;
   const focusable=Array.from(dialog.current?.querySelectorAll<HTMLElement>('input,button:not([disabled]),a[href]')??[]);
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',onTab);
  return ()=>document.removeEventListener('keydown',onTab);
 },[open]);
 return <>
  <button ref={trigger} type="button" className="sii-command-trigger" onClick={()=>setOpen(true)}
   aria-label="Buscar módulos" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?"sii-quick-switch":undefined}>
   <SiiNavIcon name="search"/><span className="sii-command-trigger-label">Buscar módulo…</span><kbd>Ctrl K</kbd>
  </button>
  {open&&<div className="sii-command-overlay">
   <button type="button" className="sii-command-backdrop" onClick={()=>setOpen(false)} aria-label="Cerrar búsqueda"/>
   <div ref={dialog} id="sii-quick-switch" className="sii-command-dialog" role="dialog" aria-modal="true" aria-labelledby="sii-command-heading">
    <h2 id="sii-command-heading">Ir a un módulo</h2>
    <div className="sii-command-search"><SiiNavIcon name="search"/><input ref={input} type="search" aria-label="Buscar secciones" placeholder="Busca una sección disponible…" value={query} onChange={e=>setQuery(e.target.value)}
       onKeyDown={e=>{
        if(e.key==='ArrowDown'){e.preventDefault();dialog.current?.querySelector<HTMLAnchorElement>('.sii-command-link')?.focus();}
        if(e.key==='Enter'&&filtered[0]){e.preventDefault();setOpen(false);router.push(filtered[0].href as Route);}
       }}/><button type="button" aria-label="Cerrar buscador" onClick={()=>setOpen(false)}>Esc</button></div>
    <div className="sii-command-results">
     {filtered.length===0?<p className="sii-command-empty" role="status">No hay módulos disponibles con ese nombre.</p>:
      (['Plataforma','Gestión académica'] as const).map(group=>{
       const matches=filtered.filter(link=>link.group===group);
       return matches.length?<section key={group}><h3>{group}</h3><div className="sii-command-list">{matches.map(link=><Link key={link.id} href={link.href as Route} className="sii-command-link" onClick={()=>setOpen(false)}>{link.label}<span aria-hidden="true">↗</span></Link>)}</div></section>:null;
      })}
    </div>
    <div className="sii-command-footer">Solo aparecen secciones habilitadas para tu acceso.</div>
   </div>
  </div>}
 </>;
}
