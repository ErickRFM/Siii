import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorizeInstitution} from '@/shared/auth/session';
import {jsonError} from '@/shared/auth/guards';
import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {previewOccurrenceRecovery} from '@/modules/scheduling/recovery-preview';

export const runtime='nodejs';
type Context={params:Promise<{institutionId:string}>};
const noCache={'Cache-Control':'no-store'};

/** Preflight never writes classes, versions or outbox; only an authorized POST can recover. */
export const GET=withDomainErrors(async(req:NextRequest,ctx:Context)=>{
 const id=(await ctx.params).institutionId;
 const sections=req.nextUrl.searchParams.getAll('sectionId');
 if(!z.uuid().safeParse(id).success)return jsonError('INVALID_INSTITUTION',404);
 if(sections.length!==1||!z.uuid().safeParse(sections[0]).success)return jsonError('INVALID_SECTION',422);
 const actor=await authorizeInstitution(id,'integrations.manage');
 if(!actor||!await authorizeInstitution(id,'academic.manage'))return jsonError('FORBIDDEN',403);
 const data=await domainTransaction(actor,{permission:'integrations.manage'},tx=>previewOccurrenceRecovery(tx,id,sections[0]));
 if(!data)return jsonError('SECTION_NOT_FOUND',404);
 return NextResponse.json({data},{headers:noCache});
});
