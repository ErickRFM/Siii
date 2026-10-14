import { NextRequest,NextResponse } from 'next/server';
import { authorizeCompanion } from '@/integrations/companion/guard';
import { externalCourses } from '@/integrations/companion/academic';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const scope=authorizeCompanion(req);if(scope instanceof NextResponse)return scope;
 const result=await externalCourses(scope.institutionId);
 return 'error'in result&&typeof result.error==='string'
 ?NextResponse.json({error:{code:result.error}},{status:result.status})
 :NextResponse.json('data'in result?result.data:null,{headers:{'Cache-Control':'no-store'}});
}
