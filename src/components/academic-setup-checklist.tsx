'use client';

import {useEffect,useState} from 'react';
import type {CatalogResource} from '@/modules/academic/catalog-validation';
import {readCatalogPresence,type CatalogPresence} from '@/modules/academic/setup-presence';
import {hasAnyCapability,useInstitutionCapabilities} from './institution-capabilities';

const steps=[
 {id:'campuses',label:'Campus'},
 {id:'programs',label:'Programas'},
 {id:'courses',label:'Materias'},
 {id:'curricula',label:'Planes'},
 {id:'terms',label:'Periodos'},
] as const;
type PresenceState=Partial<Record<CatalogResource,CatalogPresence|'loading'>>;
const labels={loading:'Consultando…',empty:'Sin registros en tu ámbito',present:'Con registros',error:'No se pudo consultar'};

export default function AcademicSetupChecklist({institutionId,revision,onOpen,disabled=false}:{institutionId:string;revision:number;onOpen:(resource:CatalogResource)=>void;disabled?:boolean}){
 const {data:access}=useInstitutionCapabilities();
 const readable=steps.filter(step=>hasAnyCapability(access,`${step.id}.read`)).map(step=>step.id).join(',');
 const [presence,setPresence]=useState<PresenceState>({});
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  const resources=readable?readable.split(',') as CatalogResource[]:[];
  const controller=new AbortController();
  setPresence(Object.fromEntries(resources.map(resource=>[resource,'loading'])));
  const timer=setTimeout(()=>{
   setPresence(previous=>Object.fromEntries(Object.entries(previous).map(([resource,status])=>[resource,status==='loading'?'error':status])));
   controller.abort();
  },20000);
  void Promise.allSettled(resources.map(async resource=>{
   const status=await readCatalogPresence(institutionId,resource,controller.signal);
   if(!controller.signal.aborted)setPresence(previous=>({...previous,[resource]:status}));
  })).then(()=>clearTimeout(timer));
  return ()=>{clearTimeout(timer);controller.abort()};
 },[institutionId,readable,revision,retry]);
 return <section className="sii-panel" aria-labelledby="academic-setup-heading">
  <h2 id="academic-setup-heading">Preparación inicial de catálogos</h2>
  <p>Revisa los datos guardados dentro de tu ámbito. Tener registros no confirma que la configuración académica esté completa.</p>
  <ol style={{display:'flex',flexWrap:'wrap',gap:'16px',paddingLeft:'20px'}}>
   {steps.map(step=>{
    const canRead=hasAnyCapability(access,`${step.id}.read`),status=presence[step.id]??'loading';
    return <li key={step.id} style={{flex:'1 1 160px'}}>
     <strong>{step.label}</strong>
     <p role="status">{canRead?labels[status]:'Sin permiso de consulta'}</p>
     {canRead&&<><button type="button" className="sii-outline-button" disabled={disabled} onClick={()=>onOpen(step.id)}>Abrir {step.label}</button>
      <p>{hasAnyCapability(access,`${step.id}.manage`)?'Edición según permisos':'Solo consulta'}</p></>}
     {canRead&&status==='error'&&<button type="button" className="sii-outline-button" disabled={disabled} onClick={()=>setRetry(value=>value+1)}>Reintentar {step.label}</button>}
    </li>;
   })}
  </ol>
  <p>Para crear un plan necesitas un programa activo dentro de tu ámbito. La carga de materias del plan y otras relaciones académicas no forman parte de esta guía.</p>
 </section>;
}
