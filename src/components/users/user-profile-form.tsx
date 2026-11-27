'use client';
import type {Dispatch,FormEvent,SetStateAction} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import type {Member,Profile} from './users-model';

/** Institution-scoped profile fields; the global identity stays read-only. */
export function UserProfileForm({detail,draft,onDraft,saving,online,hasError,onSubmit}:{
 detail:Member;draft:Profile;onDraft:Dispatch<SetStateAction<Profile>>;saving:boolean;online:boolean;hasError:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
}){
 const profileDraft=draft,setProfileDraft=onDraft,edit=onSubmit;
 return <form className="sii-catalog-form" onSubmit={edit} aria-label="Editar perfil institucional" aria-describedby={hasError?'users-error':undefined}><h3>Perfil institucional</h3><label htmlFor="member-display">Nombre institucional</label><Input id="member-display" value={profileDraft.displayName??''} maxLength={160} disabled={!detail.actions.canEdit||saving||!online} onChange={event=>setProfileDraft(value=>({...value,displayName:event.target.value.trim()?event.target.value:null}))}/><label htmlFor="member-code">Clave institucional</label><Input id="member-code" value={profileDraft.institutionalCode??''} maxLength={80} disabled={!detail.actions.canEdit||saving||!online} onChange={event=>setProfileDraft(value=>({...value,institutionalCode:event.target.value.trim()?event.target.value:null}))}/><label htmlFor="member-email">Correo institucional de contacto</label><Input id="member-email" type="email" value={profileDraft.institutionalEmail??''} maxLength={254} disabled={!detail.actions.canEdit||saving||!online} onChange={event=>setProfileDraft(value=>({...value,institutionalEmail:event.target.value.trim()?event.target.value:null}))} aria-describedby="member-email-help"/><p id="member-email-help">Este contacto no cambia el correo verificado del titular ni el destino de recuperación de su cuenta.</p>{detail.actions.canEdit&&<><label htmlFor="member-profile-reason">Motivo de la edición</label><Textarea id="member-profile-reason" name="reason" required minLength={3} maxLength={500} disabled={saving||!online}/><Button variant="default" type="submit" className="sii-submit" disabled={saving||!online}>Guardar perfil institucional</Button></>}</form>;
}
