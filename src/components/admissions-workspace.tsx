'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useRef,useState,useTransition} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';
import {SiiEmptyView,SiiStatusPill} from '@/components/ui/sii-kit';
import SiiScrollRegion from './sii-scroll-region';

export type AdmissionListItem={
 id:string;applicationNumber:string;status:string;submittedAt:string|null;
 applicantFirstName:string;applicantLastName:string;applicantEmail:string;programId:string;programCode:string;programName:string;
};
const statuses:Record<string,string>={draft:'Borrador',submitted:'Enviada',under_review:'En revisión',admitted:'Admitida',rejected:'Rechazada',waitlisted:'En espera',cancelled:'Cancelada'};
const date=(value:string|null)=>value?new Date(value).toLocaleDateString('es-MX'):'Sin enviar';

/** Presentation of the existing server-authorized list. No admission decisions. */
export default function AdmissionsWorkspace({institutionId,applications}:{institutionId:string;applications:AdmissionListItem[]}){
 const router=useRouter(),[refreshing,startRefresh]=useTransition();
 const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[program,setProgram]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null);
 const detailHeading=useRef<HTMLHeadingElement>(null),returnFocus=useRef<HTMLButtonElement|null>(null),searchInput=useRef<HTMLInputElement>(null);
 const selected=applications.find(row=>row.id===selectedId);
 const programs=[...new Map(applications.map(row=>[row.programId,{id:row.programId,label:row.programCode+' · '+row.programName}])).values()].sort((a,b)=>a.label.localeCompare(b.label,'es'));
 const normalized=query.trim().toLocaleLowerCase('es-MX');
 const filtered=applications.filter(row=>(!status||row.status===status)&&(!program||row.programId===program)&&(!normalized||[row.applicationNumber,row.applicantFirstName,row.applicantLastName,row.applicantEmail].join(' ').toLocaleLowerCase('es-MX').includes(normalized)));
 function clearFilters(){setQuery('');setStatus('');setProgram('');setSelectedId(null);}
 function close(){setSelectedId(null);window.requestAnimationFrame(()=>returnFocus.current?.focus());}
 return <div className="sii-workspace sii-workspace--admissions">
  <div className="sii-catalog-toolbar">
   <h2>Solicitudes de ingreso</h2>
   <span className="sii-small-count" role="status">{filtered.length} de {applications.length} solicitudes</span>
   <Button variant="outline" className="sii-outline-button" type="button" disabled={refreshing} onClick={()=>startRefresh(()=>router.refresh())}>{refreshing?'Actualizando…':'Actualizar solicitudes'}</Button>
  </div>
  <div className="sii-catalog-form sii-workspace-filters" role="search" aria-label="Filtros de admisiones">
   <label>Buscar solicitudes<Input ref={searchInput} type="search" value={query} placeholder="Folio, nombre o correo" onChange={event=>{setQuery(event.target.value);setSelectedId(null);}}/></label>
   <label>Estado de solicitud<NativeSelect value={status} onChange={event=>{setStatus(event.target.value);setSelectedId(null);}}><option value="">Todos los estados</option>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</NativeSelect></label>
   <label>Programa solicitado<NativeSelect value={program} onChange={event=>{setProgram(event.target.value);setSelectedId(null);}}><option value="">Todos los programas</option>{programs.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</NativeSelect></label>
   <Button variant="outline" type="button" className="sii-outline-button" disabled={!query&&!status&&!program} onClick={clearFilters}>Limpiar filtros</Button>
  </div>
  <div className={'sii-workspace-grid'+(selected?' sii-workspace-grid--detail':'')}>
   <section className="sii-panel sii-catalog-table-panel" aria-label="Solicitudes de admisión" aria-busy={refreshing}>
    {!filtered.length?<SiiEmptyView icon="registry" title={applications.length?'No hay solicitudes coincidentes':'No hay solicitudes de admisión registradas'} description={applications.length?'Ajusta el nombre, estado o programa para ampliar la consulta.':'El portal de aspirantes permite registrar y consultar solicitudes de ingreso.'} action={applications.length?<Button variant="outline" type="button" onClick={()=>{clearFilters();searchInput.current?.focus();}}>Limpiar filtros</Button>:<Link className="sii-outline-button" href={{pathname:`/admissions/${institutionId}`}}>Abrir portal de aspirantes</Link>}/>:<SiiScrollRegion label="Tabla de solicitudes, desplazamiento horizontal">
     <Table scrollable={false} className="sii-catalog-table">
      <TableHeader><TableRow><TableHead scope="col">Folio</TableHead><TableHead scope="col">Aspirante</TableHead><TableHead scope="col">Programa</TableHead><TableHead scope="col">Estado</TableHead><TableHead scope="col">Enviada</TableHead><TableHead scope="col">Detalle</TableHead></TableRow></TableHeader>
      <TableBody>{filtered.map(row=><TableRow key={row.id} data-selected={row.id===selectedId?'true':undefined}>
       <TableCell className="sii-catalog-code">{row.applicationNumber}</TableCell>
       <TableCell><strong>{row.applicantFirstName} {row.applicantLastName}</strong><small>{row.applicantEmail}</small></TableCell>
       <TableCell><strong>{row.programName}</strong><small>{row.programCode}</small></TableCell>
       <TableCell><SiiStatusPill live={row.status==='admitted'}>{statuses[row.status]??row.status}</SiiStatusPill></TableCell>
       <TableCell>{date(row.submittedAt)}</TableCell>
       <TableCell><Button variant="outline" type="button" aria-label={'Ver solicitud '+row.applicationNumber} aria-expanded={row.id===selectedId} onClick={event=>{returnFocus.current=event.currentTarget;setSelectedId(row.id);window.requestAnimationFrame(()=>detailHeading.current?.focus());}}>Ver solicitud</Button></TableCell>
      </TableRow>)}</TableBody>
     </Table>
    </SiiScrollRegion>}
   </section>
   {selected&&<section className="sii-panel sii-admission-detail sii-workspace-aside--short" aria-label="Detalle de solicitud">
    <div className="sii-catalog-toolbar"><h2 ref={detailHeading} tabIndex={-1}>{selected.applicationNumber}</h2><Button variant="outline" type="button" onClick={close}>Cerrar detalle</Button></div>
    <SiiStatusPill live={selected.status==='admitted'}>{statuses[selected.status]??selected.status}</SiiStatusPill>
    <dl>{[
     ['Aspirante',selected.applicantFirstName+' '+selected.applicantLastName],
     ['Correo de contacto',selected.applicantEmail],['Programa',selected.programCode+' · '+selected.programName],['Fecha de envío',date(selected.submittedAt)],
    ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p>Consulta de la solicitud registrada. El estado corresponde al expediente de admisión.</p>
   </section>}
  </div>
 </div>;
}
