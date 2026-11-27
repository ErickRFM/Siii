'use client';
import Link from 'next/link';
import type {FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {Textarea} from '@/components/ui/textarea';
import {operations,type Member,type Operation} from './users-model';

/** Lifecycle change, recovery request and the link to role administration for one membership. */
export function UserLifecycleForms({detail,operation,onOperation,saving,online,hasError,onChange,onReset,canAssignRoles,institutionId}:{
 detail:Member;operation:Operation|'';onOperation:(value:Operation|'')=>void;saving:boolean;online:boolean;hasError:boolean;
 onChange:(event:FormEvent<HTMLFormElement>)=>void;onReset:(event:FormEvent<HTMLFormElement>)=>void;canAssignRoles:boolean;institutionId:string;
}){
 const setOperation=onOperation,change=onChange,reset=onReset;
 return <div><form className="sii-catalog-form" onSubmit={change} aria-label="Cambiar estado institucional" aria-describedby={hasError?'users-error':undefined}><h3>Estado y acceso</h3>{Object.values(operations).some(item=>detail.actions[item.action])?<><label htmlFor="member-operation">Operación institucional</label><NativeSelect id="member-operation" value={operation} onChange={event=>setOperation(event.target.value as Operation|'')} required disabled={saving||!online}><option value="">Seleccionar operación permitida</option>{Object.entries(operations).filter(([,item])=>detail.actions[item.action]).map(([value,item])=><option key={value} value={value}>{item.label}</option>)}</NativeSelect>{operation&&<p id="member-operation-help">{operations[operation].explanation}</p>}<label htmlFor="member-lifecycle-reason">Motivo del cambio de estado</label><Textarea id="member-lifecycle-reason" name="reason" required minLength={3} maxLength={500} disabled={saving||!online}/><Button variant="default" type="submit" className="sii-submit" disabled={!operation||saving||!online}>{saving?'Registrando cambio…':'Confirmar cambio de estado'}</Button></>:<p>No hay cambios de estado autorizados para esta membresía.</p>}</form>{detail.actions.canRequestReset&&<form className="sii-catalog-form" onSubmit={reset} aria-label="Solicitar recuperación de cuenta" style={{marginTop:24}}><h3>Recuperación autorizada</h3><p>Registra una solicitud al correo verificado del titular. La persona elige su contraseña y debe verificar su autenticador si está configurado.</p><label htmlFor="member-reset-reason">Motivo de la solicitud de recuperación</label><Textarea id="member-reset-reason" name="reason" required minLength={3} maxLength={500} disabled={saving||!online}/><Button variant="outline" type="submit" className="sii-outline-button" disabled={saving||!online}>Solicitar recuperación del titular</Button></form>}{canAssignRoles&&<p><Link href={`/dashboard/institutions/${institutionId}/roles`}>Administrar roles y ámbitos</Link></p>}</div>;
}
