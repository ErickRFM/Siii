import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

function contextId(value:string):string {
 if(!z.uuid().safeParse(value).success) throw new Error('INVALID_INVITATION_CONTEXT');
 return value.toLowerCase();
}
function canonicalToken(value:string):string {
 if(typeof value!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('INVALID_INVITATION_TOKEN');
 const bytes=Buffer.from(value,'base64url');
 if(bytes.length!==32 || bytes.toString('base64url')!==value) throw new Error('INVALID_INVITATION_TOKEN');
 return value;
}
/** Raw token is a bearer credential: return only to the delivery boundary, never logs or admin responses. */
export function newInvitationToken():string {return randomBytes(32).toString('base64url');}
export function hashInvitationToken(token:string,invitationId:string,institutionId:string):string {
 return createHash('sha256').update(JSON.stringify(['SIII:invitation',1,contextId(invitationId),contextId(institutionId),canonicalToken(token)])).digest('hex');
}
/** Origin must be explicit server configuration. Fragment prevents the bearer entering HTTP URL/access logs. */
export function invitationLink(publicOrigin:string,invitationId:string,token:string):string {
 let origin:URL;
 try {origin=new URL(publicOrigin);} catch {throw new Error('INVALID_PUBLIC_ORIGIN');}
 if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash || publicOrigin.includes('\\')) throw new Error('INVALID_PUBLIC_ORIGIN');
 const link=new URL('/invitations/accept',origin.origin);
 link.hash=new URLSearchParams({id:contextId(invitationId),token:canonicalToken(token)}).toString();
 return link.toString();
}
