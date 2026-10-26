import {z} from 'zod';
import {uuid} from '@/shared/auth/validation';
const role=z.enum(['student','workshop_participant','teacher_pending','teacher','tutor','coordinator','admin','guest','control_escolar','workshop_facilitator']);
export const canonicalEmail=(email:string)=>email.trim().toLowerCase();
export const canonicalUsername=(username:string)=>username.trim().toLowerCase();
// ECMAScript WhiteSpace + LineTerminator, matching String.trim without reading global contacts client-side.
export const EMAIL_TRIM_CHARACTERS='\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF';
export const createInvitationBody=z.object({
 email:z.string().transform(canonicalEmail).pipe(z.email().max(254)),role,
 scopeType:z.enum(['institution','program','campus']).default('institution'),scopeId:uuid.nullable().default(null),
 expiresAt:z.iso.datetime({offset:true}).nullable().default(null),grantExpiresAt:z.iso.datetime({offset:true}).nullable().default(null),
}).strict().refine(value=>(value.scopeType==='institution')===(value.scopeId===null));
export const invitationTokenBody=z.object({invitationId:uuid,token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
const proof={invitationId:uuid,token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),consent:z.literal(true)};
export const invitationRejectBody=z.object(proof).strict();
export const invitationConsentBody=z.discriminatedUnion('mode',[
 z.object({...proof,mode:z.literal('existing')}).strict(),
 z.object({...proof,mode:z.literal('new'),account:z.object({username:z.string().transform(canonicalUsername).pipe(z.string().min(3).max(120).refine(value=>/^[a-z0-9_.-]+$/.test(value)||z.email().safeParse(value).success,{message:'Usa un nombre de usuario o correo electrónico válido'})),password:z.string().min(12).max(128),firstName:z.string().trim().min(1).max(120),lastName:z.string().trim().min(1).max(120)}).strict()}).strict(),
]);
