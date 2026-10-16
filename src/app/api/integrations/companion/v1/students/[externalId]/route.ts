import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
import { NextRequest,NextResponse } from 'next/server';
import { authorizeCompanion } from '@/integrations/companion/access';
import { externalStudent } from '@/integrations/companion/academic';
export const runtime='nodejs';
export const GET=withDomainErrors(async (req:NextRequest,{params}:{params:Promise<{externalId:string}>})=>{
 const result=await authorizeCompanion(req);
 if(result instanceof NextResponse)return result;
 const {externalId}=await params;
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(externalId))
  return NextResponse.json({error:{code:'INVALID_STUDENT_ID'}},{status:422});
 const data=await externalStudent(result.institutionId,externalId.toUpperCase());
 if(!data)return NextResponse.json({error:{code:'STUDENT_NOT_FOUND'}},{status:404});
 return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
});
