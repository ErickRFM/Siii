'use client';
import type {Dispatch,FormEvent,SetStateAction} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {PROFILE_LABELS} from '../institution-capabilities';
import type {Filter} from './users-model';

export function UserFilters({draft,onDraft,online,saving,onApply}:{draft:Filter;onDraft:Dispatch<SetStateAction<Filter>>;online:boolean;saving:boolean;onApply:(event:FormEvent<HTMLFormElement>)=>void}){
 const setDraft=onDraft,apply=onApply;
 return <form className="sii-catalog-form sii-workspace-filters" onSubmit={apply}><label htmlFor="users-search">Buscar usuario o perfil<Input id="users-search" value={draft.q} onChange={event=>setDraft(value=>({...value,q:event.target.value}))} maxLength={120} disabled={!online}/></label><label htmlFor="users-status">Estado institucional<NativeSelect id="users-status" aria-label="Estado institucional" value={draft.status} onChange={event=>setDraft(value=>({...value,status:event.target.value}))} disabled={!online}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="suspended">Suspendidos</option><option value="deleted">Bajas lógicas</option></NativeSelect></label><label htmlFor="users-role">Perfil vigente<NativeSelect id="users-role" aria-label="Perfil vigente" value={draft.role} onChange={event=>setDraft(value=>({...value,role:event.target.value}))} disabled={!online}><option value="">Todos los perfiles</option>{Object.entries(PROFILE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</NativeSelect></label><Button variant="outline" type="submit" className="sii-outline-button" disabled={!online||saving}>Aplicar filtros</Button></form>;
}
