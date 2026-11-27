'use client';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';
import SiiScrollRegion from '../sii-scroll-region';
import {PROFILE_LABELS} from '../institution-capabilities';
import {grantLabel,status,type Member} from './users-model';

/** Same membership rows as cards below sm and as a table from sm up. */
export function UserList({rows,online,onSelect}:{rows:Member[];online:boolean;onSelect:(id:string)=>void}){
 const select=onSelect;
 return <>
 <div className="grid gap-3 p-2 sm:hidden" role="list" aria-label="Usuarios institucionales">
 {rows.map(row=><article key={row.id} role="listitem" className="rounded-xl border border-border bg-card p-4">
  <div className="flex flex-wrap items-start justify-between gap-2">
   <div className="min-w-0"><h3 className="break-words text-sm font-bold">{row.username}</h3><p className="mt-1 text-xs text-muted-foreground">{row.firstName} {row.lastName}</p></div>
   <span className="text-xs font-semibold">{status(row)}</span>
  </div>
  <dl className="mt-3 grid gap-2 border-t border-border pt-3 text-sm">
   <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Perfil institucional</dt><dd>{row.profile.displayName??'Sin nombre institucional'}</dd></div>
   <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Clave</dt><dd>{row.profile.institutionalCode??'Sin clave institucional'}</dd></div>
   <div><dt className="mb-1 text-muted-foreground">Concesiones vigentes</dt><dd className="text-xs">{row.grants.length?row.grants.map(grant=><span key={grant.id} className="block">{grantLabel(grant,PROFILE_LABELS)}</span>):'Sin concesiones vigentes'}</dd></div>
  </dl>
  <Button variant="outline" type="button" className="sii-outline-button mt-4 w-full" aria-label={`Ver perfil de ${row.username}`} onClick={()=>select(row.id)} disabled={!online}>Ver perfil</Button>
 </article>)}
 </div>
 <div className="hidden sm:block"><SiiScrollRegion label="Tabla de usuarios, desplazamiento horizontal"><Table scrollable={false} className="sii-catalog-table"><TableHeader><TableRow><TableHead scope="col">Usuario y nombre</TableHead><TableHead scope="col">Perfil institucional</TableHead><TableHead scope="col">Estado</TableHead><TableHead scope="col">Concesiones vigentes</TableHead><TableHead scope="col">Detalle</TableHead></TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.id}><TableCell><strong>{row.username}</strong><small>{row.firstName} {row.lastName}</small></TableCell><TableCell>{row.profile.displayName??'Sin nombre institucional'}<small>{row.profile.institutionalCode??'Sin clave institucional'}</small></TableCell><TableCell>{status(row)}</TableCell><TableCell>{row.grants.length?row.grants.map(grant=><small key={grant.id}>{grantLabel(grant,PROFILE_LABELS,' · Sin vencimiento')}</small>):'Sin concesiones vigentes'}</TableCell><TableCell><Button variant="outline" type="button" className="sii-outline-button" aria-label={`Ver perfil de ${row.username}`} onClick={()=>select(row.id)} disabled={!online}>Ver perfil</Button></TableCell></TableRow>)}</TableBody></Table></SiiScrollRegion></div>
 </>;
}
