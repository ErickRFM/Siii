import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {z} from 'zod';
export type AcademicBodyScope={eventId:string;institutionId:string;sectionId:string};
const id=z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const envelope=z.object({version:z.literal(1),keyId:id,iv:z.string().length(16),tag:z.string().length(22),ciphertext:z.string().min(1).max(1398102)}).strict();
const invalid=():never=>{throw Error('ACADEMIC_OUTBOX_BODY_INVALID')};
const unavailable=():never=>{throw Error('ACADEMIC_OUTBOX_KEY_UNAVAILABLE')};
function keyring(){
 try{
  const parsed:unknown=JSON.parse(process.env.SIII_ACADEMIC_OUTBOX_KEYS??'');
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return unavailable();
  const entries=Object.entries(parsed);if(entries.length<1||entries.length>16)return unavailable();
  const ring:Record<string,Buffer>=Object.create(null);
  for(const [name,key] of entries){if(!id.safeParse(name).success||typeof key!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(key))return unavailable();const bytes=Buffer.from(key,'base64');if(bytes.length!==32||bytes.toString('base64')!==key)return unavailable();ring[name]=bytes}return ring;
 }catch{return unavailable()}
}
function aad(scope:AcademicBodyScope,keyId:string){
 if([scope.eventId,scope.institutionId,scope.sectionId].some(value=>!z.uuid().safeParse(value).success))return invalid();
 return Buffer.from(JSON.stringify(['SIII:academic-section-outbox',1,keyId,scope.institutionId,scope.sectionId,scope.eventId]));
}
function binary(value:string,length?:number){if(!/^[A-Za-z0-9_-]+$/.test(value))return invalid();const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value||(length!==undefined&&bytes.length!==length))return invalid();return bytes}
export function sealAcademicBody(body:string,scope:AcademicBodyScope):string{
 const ring=keyring(),active=process.env.SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID;if(!active||!id.safeParse(active).success||!Object.hasOwn(ring,active))return unavailable();
 const bytes=Buffer.from(body,'utf8');if(bytes.length<1||bytes.length>1048576)return invalid();
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',ring[active],iv,{authTagLength:16});cipher.setAAD(aad(scope,active));
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);return JSON.stringify({version:1,keyId:active,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url')});
}
export function openAcademicBody(value:string,scope:AcademicBodyScope):string{
 let parsed:z.infer<typeof envelope>;try{if(value.length>1400000)return invalid();parsed=envelope.parse(JSON.parse(value))}catch{return invalid()}
 const ring=keyring();if(!Object.hasOwn(ring,parsed.keyId))return unavailable();
 try{const decipher=createDecipheriv('aes-256-gcm',ring[parsed.keyId],binary(parsed.iv,12),{authTagLength:16});decipher.setAAD(aad(scope,parsed.keyId));decipher.setAuthTag(binary(parsed.tag,16));const bytes=Buffer.concat([decipher.update(binary(parsed.ciphertext)),decipher.final()]);if(bytes.length<1||bytes.length>1048576)return invalid();return bytes.toString('utf8')}catch{return invalid()}
}
