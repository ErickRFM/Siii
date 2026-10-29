'use client';
import {useState,type ReactNode} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {NativeSelect} from './ui/native-select';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from './ui/table';
import {SiiEmptyView} from './ui/sii-kit';
import SiiScrollRegion from './sii-scroll-region';

export type PersonalTableColumn<T>={
 label:string;
 render:(row:T)=>ReactNode;
 /** Opt-in ordering: use a raw numeric value, ISO date or human-readable string, never formatted JSX. */
 sortValue?:(row:T)=>string|number|null|undefined;
};

const pageSize=20;

export function orderPersonalRows<T>(rows:readonly T[],getValue:(row:T)=>string|number|null|undefined,direction:'asc'|'desc'):T[]{
 const collator=new Intl.Collator('es-MX',{numeric:true,sensitivity:'base'});
 return rows.map((row,index)=>({row,index})).sort((a,b)=>{
  const left=getValue(a.row),right=getValue(b.row);
  // Incomplete institutional records always follow known values, in both directions.
  if(left==null&&right!=null)return 1;
  if(right==null&&left!=null)return -1;
  if(left==null&&right==null)return a.index-b.index;
  const compared=typeof left==='number'&&typeof right==='number'
   ?left-right:collator.compare(String(left),String(right));
  return (direction==='asc'?compared:-compared)||a.index-b.index;
 }).map(entry=>entry.row);
}
function searchKey(value:string){
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX');
}

export function PersonalTable<T extends {id:string}>({rows,columns,label,searchText}:{
 rows:T[];columns:PersonalTableColumn<T>[];label:string;searchText?:(row:T)=>string;
}){
 const [query,setQuery]=useState('');
 const [page,setPage]=useState(0);
 const [sortIndex,setSortIndex]=useState<number|null>(null);
 const [direction,setDirection]=useState<'asc'|'desc'>('asc');
 const filtered=searchText&&query.trim()?rows.filter(row=>searchKey(searchText(row)).includes(searchKey(query.trim()))):rows;
 const sortColumn=sortIndex===null?undefined:columns[sortIndex];
 const ordered=sortColumn?.sortValue?orderPersonalRows(filtered,sortColumn.sortValue,direction):filtered;
 const last=Math.max(0,Math.ceil(ordered.length/pageSize)-1);
 const current=Math.min(page,last);
 const visible=ordered.slice(current*pageSize,current*pageSize+pageSize);
 const sortable=columns.map((column,index)=>({...column,index})).filter(column=>column.sortValue);
 function chooseSort(index:number|null){
  if(index===null||!columns[index]?.sortValue){setSortIndex(null);setDirection('asc');}
  else if(sortIndex===index){setDirection(previous=>previous==='asc'?'desc':'asc');}
  else {setSortIndex(index);setDirection('asc');}
  setPage(0);
 }
 return <div className="min-w-0 space-y-4">
  {(searchText||sortable.length>0)&&<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
   {searchText&&<label className="block min-w-0 flex-1 space-y-2 text-sm font-medium">Buscar en {label.toLocaleLowerCase('es-MX')}
    <Input type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0)}} placeholder="Escribe para buscar"/>
   </label>}
   {sortable.length>0&&<div className="flex flex-wrap items-end gap-2 md:hidden">
    <label className="min-w-0 flex-1 space-y-2 text-sm font-medium">Ordenar por
     <NativeSelect aria-label={`Ordenar ${label}`} value={sortIndex===null?'':String(sortIndex)} onChange={event=>{setSortIndex(event.target.value===''?null:Number(event.target.value));setDirection('asc');setPage(0)}}>
      <option value="">Orden original</option>
      {sortable.map(column=><option key={column.index} value={column.index}>{column.label}</option>)}
     </NativeSelect>
    </label>
    <Button type="button" variant="outline" disabled={sortIndex===null} onClick={()=>{setDirection(previous=>previous==='asc'?'desc':'asc');setPage(0)}} aria-label={direction==='asc'?'Cambiar a orden descendente':'Cambiar a orden ascendente'}>{direction==='asc'?'Ascendente':'Descendente'}</Button>
   </div>}
  </div>}
  {visible.length?<><div className="hidden min-w-0 md:block"><SiiScrollRegion label={label}><Table scrollable={false}><TableHeader><TableRow>{columns.map((column,index)=><TableHead key={index} scope="col" aria-sort={column.sortValue?sortIndex===index?(direction==='asc'?'ascending':'descending'):'none':undefined} className="whitespace-nowrap">
   {column.sortValue?<button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md text-left font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={()=>chooseSort(index)} aria-label={`Ordenar por ${column.label}`}>{column.label}<span aria-hidden="true">{sortIndex===index?(direction==='asc'?'↑':'↓'):'↕'}</span></button>:column.label}
  </TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(row=><TableRow key={row.id}>{columns.map((column,index)=><TableCell key={index} className="min-w-0">{column.render(row)}</TableCell>)}</TableRow>)}</TableBody></Table></SiiScrollRegion></div>
  <section className="space-y-3 md:hidden" aria-label={label}>{visible.map(row=><dl key={row.id} className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border bg-card p-4 min-[420px]:grid-cols-2">{columns.map((column,index)=><div key={index} className="min-w-0 break-words"><dt className="text-xs font-medium text-muted-foreground">{column.label}</dt><dd className="mt-1 break-words text-sm">{column.render(row)}</dd></div>)}</dl>)}</section>
  <nav aria-label={`Paginación de ${label}`} className="flex flex-wrap items-center justify-between gap-3">
   <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Mostrando {current*pageSize+1}–{current*pageSize+visible.length} de {ordered.length} registros · Página {current+1} de {last+1}</p>
   {last>0&&<div className="flex gap-2"><Button type="button" variant="outline" disabled={current===0} onClick={()=>setPage(Math.max(0,current-1))}>Anterior</Button><Button type="button" variant="outline" disabled={current===last} onClick={()=>setPage(Math.min(last,current+1))}>Siguiente</Button></div>}
  </nav></>:<div className="space-y-3">
   <SiiEmptyView icon="book" title={query?'Sin resultados para esta búsqueda':'Sin registros para mostrar'} description={query?'Prueba otro nombre, clave o término.':'No hay registros oficiales disponibles en esta consulta.'}/>
   {query&&<Button type="button" variant="outline" onClick={()=>{setQuery('');setPage(0)}}>Limpiar búsqueda</Button>}
  </div>}
 </div>;
}
