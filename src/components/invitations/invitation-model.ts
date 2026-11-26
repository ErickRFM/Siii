import type {SiiStatusBadgeProps} from '@/components/ui/sii-institutional';
import type {InstitutionGrant} from '../institution-capabilities';

export type Invitation={
 id:string;email:string;role:string;scopeType:InstitutionGrant['scopeType'];scopeId:string|null;
 expiresAt:string;grantExpiresAt:string|null;state:'pending'|'accepted'|'rejected'|'revoked';
 delivery:{state:'queued'|'accepted'|'failed'|'cancelled';code?:string};createdAt:string;
 actions:{canResend:boolean;canRevoke:boolean};
};
export type Scope={id:string;name:string;code:string|null;status:string};
export type InvitationDraft={email:string;role:string;scopeType:InstitutionGrant['scopeType'];scopeId:string|null;expiresAt?:string;grantExpiresAt:string|null};

export const LINK_MAX_DAYS=7;

export function invitationErrorMessage(code?:string){
 switch(code){
  case 'MFA_REQUIRED':return 'Configura o verifica tu autenticador en seguridad y vuelve a intentar.';
  case 'STEP_UP_REQUIRED':return 'Confirma tu identidad en seguridad y vuelve a intentar.';
  case 'PASSWORD_CHANGE_REQUIRED':return 'Actualiza tu contraseña en seguridad y vuelve a intentar.';
  case 'ROLE_GRANT_DENIED':return 'No tienes autoridad para invitar con este perfil y ámbito.';
  case 'GRANT_EXPIRY_DENIED':return 'La vigencia solicitada supera tu autorización. Revisa las fechas.';
  case 'INVALID_EXPIRY':return 'La caducidad del enlace debe ser futura y quedar dentro de siete días, tu autorización y la vigencia del perfil.';
  case 'INVITATION_KEY_UNAVAILABLE':case 'INVALID_PUBLIC_ORIGIN':case 'INVITATION_DELIVERY_INVALID':return 'La configuración de invitaciones no está disponible. Contacta a la administración.';
  case 'INVALID_SCOPE':return 'El ámbito no está disponible en esta institución.';
  case 'VALIDATION_ERROR':return 'Revisa el correo, el perfil, el ámbito y ambas fechas de caducidad.';
  case 'RATE_LIMITED':return 'Se alcanzó el límite de intentos. Espera antes de volver a intentar.';
  case 'INVITATION_UNAVAILABLE':return 'La invitación venció o dejó de estar disponible. Actualiza el listado.';
  case 'FORBIDDEN':return 'Tu acceso cambió. Actualiza tus permisos antes de volver a intentar.';
  default:return 'No se pudo completar la operación. Vuelve a intentar.';
 }
}

/** Delivery only matters while the link is still usable; afterwards the state says it all. */
export function deliveryLabel(delivery:Invitation['delivery']){
 if(delivery.code==='EMAIL_NOT_CONFIGURED')return 'Pendiente de configurar correo';
 switch(delivery.state){
  case 'queued':return 'Entrega pendiente';
  case 'accepted':return 'Correo enviado';
  case 'failed':return 'Entrega fallida';
  case 'cancelled':return 'Entrega cancelada';
  default:return 'Estado de entrega no disponible';
 }
}

export type InvitationStatus={label:string;variant:NonNullable<SiiStatusBadgeProps['variant']>;open:boolean};
export function invitationStatus(row:Invitation,now=Date.now()):InvitationStatus{
 const expired=new Date(row.expiresAt).getTime()<=now;
 if(row.state==='pending')return expired?{label:'Vencida',variant:'muted',open:false}:{label:'Pendiente',variant:'pending',open:true};
 if(row.state==='accepted')return {label:'Aceptada',variant:'active',open:false};
 if(row.state==='rejected')return {label:'Rechazada',variant:'cancelled',open:false};
 if(row.state==='revoked')return {label:'Revocada',variant:'archived',open:false};
 return {label:'Estado no disponible',variant:'muted',open:false};
}

export function scopeName(row:Pick<Invitation,'scopeType'|'scopeId'>,programs:Scope[],campuses:Scope[]){
 if(row.scopeType==='institution')return 'Institución';
 return (row.scopeType==='program'?programs:campuses).find(scope=>scope.id===row.scopeId)?.name??'Ámbito asignado';
}
