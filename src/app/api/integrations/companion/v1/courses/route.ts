import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
import { NextRequest,NextResponse } from 'next/server';
import { authorizeCompanion } from '@/integrations/companion/access';
import { externalCourses } from '@/integrations/companion/academic';
export const runtime='nodejs';
export const GET=withDomainErrors(async (req:NextRequest)=>{
 const scope=await authorizeCompanion(req);if(scope instanceof NextResponse)return scope;
 const result=await externalCourses(scope.institutionId);
 return 'error'in result&&typeof result.error==='string'
 ?NextResponse.json({error:{code:result.error}},{status:result.status})
 :NextResponse.json('data'in result?result.data:null,{headers:{'Cache-Control':'no-store'}});
});
