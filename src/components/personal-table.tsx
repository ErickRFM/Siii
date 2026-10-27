'use client';
import {useState,type ReactNode} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from './ui/table';
import {SiiEmptyView} from './ui/sii-kit';
import SiiScrollRegion from './sii-scroll-region';

export function PersonalTable<T extends {id:string}>({rows,columns,label,searchText}:{rows:T[];columns:{label:string;render:(row:T)=>ReactNode}[];label:string;searchText?:(row:T)=>string}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(0);
 const filtered=searchText?rows.filter(row=>searchText(row).toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX'))):rows;
 const last=Math.max(0,Math.ceil(filtered.length/20)-1),current=Math.min(page,last),visible=filtered.slice(current*20,current*20+20);
 return <div className="space-y-4">
  {searchText&&<label className="block space-y-2 text-sm font-medium">Buscar en {label.toLocaleLowerCase('es-MX')}<Input type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0)}} placeholder="Escribe para buscar"/></label>}
  {visible.length?<><div className="hidden md:block"><SiiScrollRegion label={label}><Table scrollable={false}><TableHeader><TableRow>{columns.map(column=><TableHead key={column.label}>{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(row=><TableRow key={row.id}>{columns.map(column=><TableCell key={column.label}>{column.render(row)}</TableCell>)}</TableRow>)}</TableBody></Table></SiiScrollRegion></div><div className="space-y-3 md:hidden" aria-label={label}>{visible.map(row=><dl key={row.id} className="space-y-3 rounded-xl border bg-card p-4">{columns.map(column=><div key={column.label} className="min-w-0 break-words"><dt className="text-sm text-muted-foreground">{column.label}</dt><dd className="mt-1 text-sm">{column.render(row)}</dd></div>)}</dl>)}</div>
   <nav aria-label={`Paginación de ${label}`} className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{filtered.length} registros · Página {current+1} de {last+1}</p><div className="flex gap-2"><Button variant="outline" disabled={current===0} onClick={()=>setPage(current-1)}>Anterior</Button><Button variant="outline" disabled={current===last} onClick={()=>setPage(current+1)}>Siguiente</Button></div></nav>
  </>:<SiiEmptyView icon="book" title="Sin registros para mostrar" description={query?'Prueba otra búsqueda.':'No hay registros oficiales disponibles en esta consulta.'}/>}</div>;
}
