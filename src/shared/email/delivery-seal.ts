import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { transactionalEmailSchema, type TransactionalEmail } from '../../infrastructure/email/transactional';

const keyId=z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const envelopeSchema=z.object({version:z.literal(1),keyId,iv:z.string().length(16),tag:z.string().length(22),ciphertext:z.string().min(1).max(700000)}).strict();
type SealConfig={purpose:'invitation'|'password-reset';keys:string|undefined;activeKeyId?:string};
function invalid():never {throw new Error('DELIVERY_INVALID');}
function unavailable():never {throw new Error('DELIVERY_KEY_UNAVAILABLE');}
function keyring(config:SealConfig):Record<string,Buffer> {
 try {
  const ring:unknown=JSON.parse(config.keys??'');
  if(!ring || typeof ring!=='object' || Array.isArray(ring)) return unavailable();
  const entries=Object.entries(ring);if(entries.length<1 || entries.length>16) return unavailable();
  const result:Record<string,Buffer>=Object.create(null);
  for(const [id,key] of entries){
   if(!keyId.safeParse(id).success || typeof key!=='string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)) return unavailable();
   const bytes=Buffer.from(key,'base64');if(bytes.length!==32 || bytes.toString('base64')!==key) return unavailable();
   result[id]=bytes;
  }
  return result;
 }catch{return unavailable();}
}
function aad(eventId:string,institutionId:string,id:string,purpose:string):Buffer {
 if(!z.uuid().safeParse(eventId).success || !z.uuid().safeParse(institutionId).success) return invalid();
 return Buffer.from(JSON.stringify(['SIII:'+purpose+'-delivery',1,id,eventId.toLowerCase(),institutionId.toLowerCase()]));
}
function binary(value:string,expectedLength?:number):Buffer {
 if(!/^[A-Za-z0-9_-]+$/.test(value)) return invalid();
 const bytes=Buffer.from(value,'base64url');
 if(bytes.toString('base64url')!==value || (expectedLength!==undefined && bytes.length!==expectedLength)) return invalid();
 return bytes;
}
/** The durable queue persists this envelope; never recipient addresses or bearer links in logs or plain queue payloads. */
export function sealDelivery(message:TransactionalEmail,eventId:string,institutionId:string,config:SealConfig):string {
 const parsed=transactionalEmailSchema.safeParse(message);
 if(!parsed.success || parsed.data.eventId!==eventId) return invalid();
 const ring=keyring(config),active=config.activeKeyId;
 if(!active || !keyId.safeParse(active).success || !Object.hasOwn(ring,active)) return unavailable();
 const context=aad(eventId,institutionId,active,config.purpose);
 const plaintext=Buffer.from(JSON.stringify(parsed.data),'utf8');if(plaintext.length>512*1024) return invalid();
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',ring[active],iv,{authTagLength:16});cipher.setAAD(context);
 const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 return JSON.stringify({version:1,keyId:active,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url')});
}
export function openDelivery(value:string,eventId:string,institutionId:string,config:SealConfig):TransactionalEmail {
 let envelope:z.infer<typeof envelopeSchema>;
 try {
  if(typeof value!=='string' || value.length>701000) return invalid();
  envelope=envelopeSchema.parse(JSON.parse(value));
 }catch{return invalid();}
 const ring=keyring(config);if(!Object.hasOwn(ring,envelope.keyId)) return unavailable();
 const context=aad(eventId,institutionId,envelope.keyId,config.purpose);
 try {
  const decipher=createDecipheriv('aes-256-gcm',ring[envelope.keyId],binary(envelope.iv,12),{authTagLength:16});
  decipher.setAAD(context);decipher.setAuthTag(binary(envelope.tag,16));
  const plaintext=Buffer.concat([decipher.update(binary(envelope.ciphertext)),decipher.final()]);
  if(plaintext.length>512*1024) return invalid();
  const message=transactionalEmailSchema.parse(JSON.parse(plaintext.toString('utf8')));
  if(message.eventId!==eventId) return invalid();
  return message;
 }catch{return invalid();}
}
