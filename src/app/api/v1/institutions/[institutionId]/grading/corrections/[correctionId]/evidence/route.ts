import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getIdentity,institutionContext} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {CorrectionError,correctionAttachment} from '@/modules/grading/corrections';
import {evidenceType,MAX_CORRECTION_EVIDENCE} from '@/modules/grading/correction-validation';
import {requestId} from '@/shared/http/request-context';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string;correctionId:string}>};
function failure(error:unknown){if(error instanceof CorrectionError)return jsonError(error.message,error.status);const e=error as {code?:string;cause?:{code?:string}};if((e.code??e.cause?.code)==='23505')return jsonError('CORRECTION_EVIDENCE_EXISTS',409);throw error;}
async function boundedBody(req:NextRequest){const reader=req.body?.getReader();if(!reader)throw new CorrectionError('INVALID_EVIDENCE',422);let size=0;const chunks:Uint8Array[]=[];try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_CORRECTION_EVIDENCE)throw new CorrectionError('EVIDENCE_TOO_LARGE',413);chunks.push(part.value);}return Buffer.concat(chunks);}finally{await reader.cancel();}}
async function access(ctx:Ctx){const params=await ctx.params;if(!z.uuid().safeParse(params.institutionId).success||!z.uuid().safeParse(params.correctionId).success)return null;const context=await institutionContext(params.institutionId);return context?{...params,context}:null;}
export const GET=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!await getIdentity())return jsonError('UNAUTHENTICATED',401);const actor=await access(ctx);if(!actor)return jsonError('FORBIDDEN',403);if(req.headers.has('x-siii-expected-actor')&&req.headers.get('x-siii-expected-actor')!==actor.context.identity.id)return jsonError('FORBIDDEN',403);
 try{const file=await correctionAttachment(actor.context,actor.correctionId,null,requestId(req.headers));const name=encodeURIComponent(file.fileName).replace(/['()*]/g,character=>'%'+character.charCodeAt(0).toString(16));return new NextResponse(new Uint8Array(file.content),{headers:{'Cache-Control':'no-store','Content-Type':file.mediaType,'Content-Length':String(file.size),'Content-Disposition':`attachment; filename*=UTF-8''${name}`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});}catch(error){return failure(error);}
});
export const POST=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);if(!await getIdentity())return jsonError('UNAUTHENTICATED',401);const actor=await access(ctx);if(!actor)return jsonError('FORBIDDEN',403);if(req.headers.has('x-siii-expected-actor')&&req.headers.get('x-siii-expected-actor')!==actor.context.identity.id)return jsonError('FORBIDDEN',403);
 try{const expectedRevision=Number(req.headers.get('x-correction-revision'));if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)return jsonError('VALIDATION_ERROR',422);if(Number(req.headers.get('content-length')??0)>MAX_CORRECTION_EVIDENCE)return jsonError('EVIDENCE_TOO_LARGE',413);const bytes=await boundedBody(req),mediaType=evidenceType(bytes,req.headers.get('content-type')??'');if(!bytes.length||!mediaType)return jsonError('INVALID_EVIDENCE',422);let name='';try{name=decodeURIComponent(req.headers.get('x-file-name')??'');}catch{}const fileName=name.replace(/[\/\\\r\n\x00-\x1f]/g,'_').slice(0,180).trim();if(!fileName)return jsonError('INVALID_EVIDENCE_NAME',422);
 const file=await correctionAttachment(actor.context,actor.correctionId,{bytes,mediaType,fileName,expectedRevision},requestId(req.headers));return NextResponse.json({data:{id:file.id,fileName:file.fileName,size:file.size}},{status:201,headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}
});
