'use client';

import Link from 'next/link';
import type {Route} from 'next';
import {useRouter} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {Search} from 'lucide-react';
import {SiiNavIcon} from './sii-nav-icon';
import {Button} from '@/components/ui/button';
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList} from '@/components/ui/command';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';

/** Client-only navigation projection, not an authorization boundary. */
export type SiiQuickLink={id:string;label:string;href:string;group:'Plataforma'|'Gestión académica'};
export default function SiiQuickSwitch({links}:{links:readonly SiiQuickLink[]}){
 const [open,setOpen]=useState(false);
 const router=useRouter();
 const trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();setOpen(value=>!value);
   }
  };
  document.addEventListener('keydown',onKey);
  return ()=>document.removeEventListener('keydown',onKey);
 },[]);
 useEffect(()=>{
  if(!open)return;
  const frame=requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('[cmdk-input]')?.focus());
  return ()=>cancelAnimationFrame(frame);
 },[open]);
 const go=(href:string)=>{setOpen(false);router.push(href as Route);};
 return <>
  <Button ref={trigger} type="button" variant="outline" onClick={()=>setOpen(true)}
   aria-label="Buscar módulos" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?'sii-quick-switch':undefined}
   className="sii-command-trigger h-9 gap-2 border-border bg-card px-3 text-muted-foreground shadow-none">
   <Search className="size-4"/><span className="sii-command-trigger-label hidden lg:inline">Buscar módulo…</span><kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] lg:inline">Ctrl K</kbd>
  </Button>
  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent id="sii-quick-switch" onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus();}} className="sii-ui gap-0 overflow-hidden p-0 sm:max-w-xl">
    <DialogHeader className="border-b px-4 py-3">
     <DialogTitle className="text-base">Ir a un módulo</DialogTitle>
     <DialogDescription>Solo aparecen secciones habilitadas para tu acceso.</DialogDescription>
    </DialogHeader>
    <Command label="Buscar secciones" loop>
     <CommandInput aria-label="Buscar secciones" placeholder="Busca una sección disponible…"/>
     <CommandList className="max-h-[min(60vh,420px)]">
      <CommandEmpty>No hay módulos disponibles con ese nombre.</CommandEmpty>
      {(['Plataforma','Gestión académica'] as const).map(group=>{
       const matches=links.filter(link=>link.group===group);
       return matches.length?<CommandGroup key={group} heading={group}>
        {matches.map(link=><CommandItem key={link.id} value={link.label} onSelect={()=>go(link.href)} className="gap-3 py-2.5">
         <SiiNavIcon name={link.id==='overview'?'home':link.id==='security'?'shield':link.id==='users'?'users':link.id==='roles'?'roles':link.id==='invitations'?'mail':link.id==='academic'?'book':link.id==='administration'?'institution':'services'}/>
         <Link href={link.href as Route} onClick={()=>setOpen(false)} className="flex-1">{link.label}</Link>
         <span aria-hidden="true" className="text-muted-foreground">↗</span>
        </CommandItem>)}
       </CommandGroup>:null;
      })}
     </CommandList>
    </Command>
   </DialogContent>
  </Dialog>
 </>;
}
