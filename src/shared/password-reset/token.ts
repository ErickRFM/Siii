import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {invitationLink} from '@/shared/invitations/token';
export const newResetToken=()=>randomBytes(32).toString('base64url');
export function hashResetToken(token:string,id:string,userId:string,authVersion:number){
 if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(userId).success||!Number.isInteger(authVersion)||authVersion<0)throw Error('INVALID_RESET_CONTEXT');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)||Buffer.from(token,'base64url').length!==32||Buffer.from(token,'base64url').toString('base64url')!==token)throw Error('INVALID_RESET_TOKEN');
 return createHash('sha256').update(JSON.stringify(['SIII:password-reset',1,id.toLowerCase(),userId.toLowerCase(),authVersion,token])).digest('hex');
}
export function resetLink(origin:string,id:string,token:string){const link=new URL(invitationLink(origin,id,token));link.pathname='/password/reset';return link.toString();}
