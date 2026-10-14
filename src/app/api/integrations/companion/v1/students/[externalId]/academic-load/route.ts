import { NextRequest,NextResponse } from 'next/server';
import { authorizeCompanion } from '@/integrations/companion/guard';
import { externalAcademicLoad } from '@/integrations/companion/academic';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{externalId:string}>}){
 const scope=authorizeCompanion(req);
 if(scope instanceof NextResponse)return scope;
 const {externalId}=await params;
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(externalId))
  return NextResponse.json({error:{code:'INVALID_STUDENT_ID'}},{status:422});
 const result=await externalAcademicLoad(scope.institutionId,externalId.toUpperCase());
 return 'error' in result&&typeof result.error==='string'
  ?NextResponse.json({error:{code:result.error}},{status:result.status,headers:{'Cache-Control':'no-store'}})
  :NextResponse.json('data'in result?result.data:null,{headers:{'Cache-Control':'no-store'}});
}
