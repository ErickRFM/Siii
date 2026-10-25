import {NextResponse,type NextRequest} from 'next/server';
import {academicAuthorityCredential} from '@/integrations/companion/authority-signature';
import {academicAuthority,AcademicAuthorityError,authorityRequest,reserveAcademicAuthority} from '@/integrations/companion/authority';
import {requestId} from '@/shared/http/request-context';
import {logger} from '@/shared/logging';
import {academicOutboxEnabled} from '@/integrations/companion/outbox/policy';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
const error=(code:string,status:number)=>NextResponse.json({error:{code}},{status,headers});

async function bodyText(request:Request){
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>2048){await reader.cancel();throw new AcademicAuthorityError('BODY_TOO_LARGE',413)}chunks.push(part.value)}}finally{reader.releaseLock()}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))}catch{throw new AcademicAuthorityError('INVALID_BODY',422)}
}

/** Service-only live manifest; academic payloads are still read from the durable Ktor projection. */
export async function POST(request:NextRequest){
 try{
  const raw=await bodyText(request),credential=academicAuthorityCredential(request.headers,raw);
  if(!credential)return error('UNAUTHENTICATED',401);
  const parsed=authorityRequest.safeParse(JSON.parse(raw));if(!parsed.success)return error('INVALID_BODY',422);
  if(!academicOutboxEnabled())return error('SOURCE_AUTHORITY_DISABLED',503);
  const correlation=requestId(request.headers);
  if(!await reserveAcademicAuthority(credential,correlation))return error('UNAUTHENTICATED',401);
  return NextResponse.json(await academicAuthority(parsed.data,correlation),{headers});
 }catch(cause){
  if(cause instanceof AcademicAuthorityError)return error(cause.code,cause.status);
  logger.error({code:'SIII_SOURCE_AUTHORITY_UNAVAILABLE'},'Academic source authority unavailable');
  return error('SOURCE_AUTHORITY_UNAVAILABLE',503);
 }
}
