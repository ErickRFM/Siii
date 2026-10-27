import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getIdentity,institutionContext} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {CorrectionError,correctionList,correctionWrite} from '@/modules/grading/corrections';
import {correctionCommand} from '@/modules/grading/correction-validation';
import {parsePage} from '@/shared/http/pagination';
import {requestId} from '@/shared/http/request-context';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
async function boundedJson(req:NextRequest){const reader=req.body?.getReader();if(!reader)return null;const chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768)throw new CorrectionError('REQUEST_TOO_LARGE',413);chunks.push(part.value);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{return null;}}finally{await reader.cancel();}}

function correctionFailure(error:unknown){if(error instanceof CorrectionError)return jsonError(error.message,error.status);const e=error as {code?:string;cause?:{code?:string}};if((e.code??e.cause?.code)==='23505')return jsonError('CORRECTION_DUPLICATE',409);throw error;}
export const GET=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 const {institutionId}=await ctx.params;if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);if(!await getIdentity())return jsonError('UNAUTHENTICATED',401);const context=await institutionContext(institutionId);if(!context)return jsonError('FORBIDDEN',403);if(req.headers.has('x-siii-expected-actor')&&req.headers.get('x-siii-expected-actor')!==context.identity.id)return jsonError('FORBIDDEN',403);
 const id=req.nextUrl.searchParams.get('id')??undefined,scope=`corrections:${institutionId}:${context.access.membershipId}`;
 const sectionId=req.nextUrl.searchParams.get('sectionId'),studentId=req.nextUrl.searchParams.get('studentId'),publicationId=req.nextUrl.searchParams.get('publicationId');
 const candidate=sectionId||studentId||publicationId?z.object({sectionId:z.uuid(),studentId:z.uuid(),publicationId:z.uuid()}).safeParse({sectionId,studentId,publicationId}):null;if(candidate&&!candidate.success)return jsonError('INVALID_QUERY',422);
 const query=new URL(req.url);for(const key of ['id','sectionId','studentId','publicationId'])query.searchParams.delete(key);const page=parsePage(new NextRequest(query),scope);if(!page||id&&!z.uuid().safeParse(id).success)return jsonError('INVALID_QUERY',422);
 try{return NextResponse.json(await correctionList(context,page,scope,id,candidate?.success?candidate.data:undefined),{headers:{'Cache-Control':'no-store','X-SIII-Correction-Actor':context.identity.id,'X-SIII-Correction-Context':createHash('sha256').update(JSON.stringify({actor:context.identity.id,session:context.identity.sessionId,member:context.access.membershipId,grants:context.access.grants})).digest('hex')}});}catch(error){return correctionFailure(error);}
});
export const POST=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);const {institutionId}=await ctx.params;if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);if(!await getIdentity())return jsonError('UNAUTHENTICATED',401);const context=await institutionContext(institutionId);if(!context)return jsonError('FORBIDDEN',403);if(req.headers.has('x-siii-expected-actor')&&req.headers.get('x-siii-expected-actor')!==context.identity.id)return jsonError('FORBIDDEN',403);
 try{const parsed=correctionCommand.safeParse(await boundedJson(req));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);const {policyHash,...data}=await correctionWrite(context,parsed.data,requestId(req.headers));void policyHash;return NextResponse.json({data},{status:parsed.data.kind==='draft'?201:200,headers:{'Cache-Control':'no-store'}});}catch(error){return correctionFailure(error);}
});
