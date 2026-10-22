'use client';

import {useId,useState,type ReactNode,type KeyboardEvent} from 'react';

export type SiiTab = {id:string;label:string;content:ReactNode;disabled?:boolean};

/** Accessible reusable tabs; presentation remains within the SIII institutional kit. */
export function SiiTabs({items,label,initialTab}:{items:SiiTab[];label:string;initialTab?:string}){
 const generatedId=useId();
 const [selected,setSelected]=useState(initialTab??items.find(item=>!item.disabled)?.id??'');
 const active=items.find(item=>item.id===selected&&!item.disabled)??items.find(item=>!item.disabled);
 function handleKeyDown(event:KeyboardEvent<HTMLDivElement>){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const available=items.filter(item=>!item.disabled);
  if(!available.length)return;
  const current=available.findIndex(item=>item.id===active?.id);
  const index=event.key==='Home'?0:event.key==='End'?available.length-1:
   (current+(event.key==='ArrowRight'?1:-1)+available.length)%available.length;
  event.preventDefault();
  const next=available[index];
  setSelected(next.id);
  document.getElementById(generatedId+'-tab-'+next.id)?.focus();
 }
 return <section className="sii-kit-tabs">
   <div className="sii-catalog-tabs" role="tablist" aria-label={label} tabIndex={0} onKeyDown={handleKeyDown}>
    {items.map(item=><button key={item.id} id={generatedId+'-tab-'+item.id}
      type="button" role="tab" aria-selected={item.id===active?.id}
      aria-controls={generatedId+'-panel-'+item.id} disabled={item.disabled}
      tabIndex={item.id===active?.id?0:-1}
      className={'sii-catalog-tab'+(item.id===active?.id?' sii-catalog-tab--active':'')}
      onClick={()=>setSelected(item.id)}>{item.label}</button>)}
   </div>
   {items.map(item=><div key={item.id} id={generatedId+'-panel-'+item.id}
    role="tabpanel" aria-labelledby={generatedId+'-tab-'+item.id}
    tabIndex={item.id===active?.id?0:-1} hidden={item.id!==active?.id}>
    {item.id===active?.id?item.content:null}
   </div>)}
 </section>;
}

export function SiiFieldError({id,children}:{id?:string;children:ReactNode}){
 return <p id={id} className="sii-catalog-error" role="alert">{children}</p>;
}

export function SiiFieldHint({id,children}:{id?:string;children:ReactNode}){
 return <small id={id} className="sii-kit-field-hint">{children}</small>;
}
