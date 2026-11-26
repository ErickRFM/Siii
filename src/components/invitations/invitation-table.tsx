'use client';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';
import {SiiStatusBadge} from '@/components/ui/sii-institutional';
import SiiScrollRegion from '../sii-scroll-region';
import {PROFILE_LABELS} from '../institution-capabilities';
import {formatDateTime} from '@/shared/format/date-time';
import {deliveryLabel,invitationStatus,scopeName,type Invitation,type Scope} from './invitation-model';

export function InvitationTable({rows,programs,campuses,busy,onAction}:{
 rows:Invitation[];programs:Scope[];campuses:Scope[];busy:boolean;onAction:(row:Invitation,action:'resend'|'revoke')=>void;
}){
 const now=Date.now();
 return <SiiScrollRegion label="Tabla de invitaciones, desplazamiento horizontal"><Table scrollable={false} className="sii-catalog-table">
  <TableHeader><TableRow>
   <TableHead scope="col">Destinatario</TableHead><TableHead scope="col">Ámbito y vigencia</TableHead><TableHead scope="col">Estado</TableHead><TableHead scope="col"><span className="sr-only">Acciones</span></TableHead>
  </TableRow></TableHeader>
  <TableBody>{rows.map(row=>{
   const status=invitationStatus(row,now);
   return <TableRow key={row.id}>
    <TableCell><strong>{row.email}</strong><small>{PROFILE_LABELS[row.role]??row.role}</small></TableCell>
    <TableCell>{scopeName(row,programs,campuses)}
     <small>{row.grantExpiresAt?`Perfil hasta ${formatDateTime(row.grantExpiresAt)}`:'Perfil sin vencimiento'}</small>
     {status.open&&<small>Enlace vence {formatDateTime(row.expiresAt)}</small>}
    </TableCell>
    <TableCell><SiiStatusBadge variant={status.variant}>{status.label}</SiiStatusBadge>{status.open&&<small>{deliveryLabel(row.delivery)}</small>}</TableCell>
    <TableCell><InvitationActions row={row} open={status.open} busy={busy} onAction={onAction}/></TableCell>
   </TableRow>;
  })}</TableBody>
 </Table></SiiScrollRegion>;
}

function InvitationActions({row,open,busy,onAction}:{row:Invitation;open:boolean;busy:boolean;onAction:(row:Invitation,action:'resend'|'revoke')=>void}){
 if(!open||!(row.actions?.canResend||row.actions?.canRevoke))return <><span aria-hidden="true" className="text-muted-foreground">—</span><span className="sr-only">Sin acciones disponibles</span></>;
 return <div className="sii-catalog-actions">
  <Button variant="outline" type="button" aria-label="Reenviar invitación" disabled={busy||!row.actions.canResend}
   aria-describedby={!row.actions.canResend?'resend-policy-'+row.id:undefined} onClick={()=>onAction(row,'resend')}>Reenviar</Button>
  {!row.actions.canResend&&<details className="sii-invitation-policy"><summary id={'resend-policy-'+row.id}>Política de reenvío</summary>
   <small>Solo el emisor autorizado puede reenviar, con una espera mínima de un minuto y un máximo de tres veces por hora. Actualiza para consultar la disponibilidad.</small></details>}
  {row.actions.canRevoke&&<Button variant="outline" type="button" aria-label="Revocar invitación" disabled={busy} onClick={()=>onAction(row,'revoke')}>Revocar</Button>}
 </div>;
}
