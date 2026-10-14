import { NextRequest,NextResponse } from 'next/server';
import { authorizeCompanion } from '@/integrations/companion/guard';
import { externalStudent } from '@/integrations/companion/academic';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{externalId:string}>}){
 const result=authorizeCompanion(req);
 if(result instanceof NextResponse)return result;
 const {externalId}=await params;
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(externalId))
  return NextResponse.json({error:{code:'INVALID_STUDENT_ID'}},{status:422});
 const data=await externalStudent(result.institutionId,externalId.toUpperCase());
 if(!data)return NextResponse.json({error:{code:'STUDENT_NOT_FOUND'}},{status:404});
 return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
}
