import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeCompanion } from '@/integrations/companion/guard';
import { externalAcademicLoad } from '@/integrations/companion/academic';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{externalId:string}>}){
 const scope=authorizeCompanion(req);if(scope instanceof NextResponse)return scope;
 const {externalId}=await params;
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(externalId))return NextResponse.json({error:{code:'INVALID_STUDENT_ID'}},{status:422});
 const weekOf=req.nextUrl.searchParams.get('weekOf');
 if(weekOf&&!z.iso.date().safeParse(weekOf).success)return NextResponse.json({error:{code:'INVALID_WEEK'}},{status:422});
 // Current adapter intentionally returns the registered recurring timetable.
 // Per-date cancellations require a future dated occurrence contract instead of silently distorting recurrence.
 const result=await externalAcademicLoad(scope.institutionId,externalId.toUpperCase());
 return 'error'in result&&typeof result.error==='string'
 ?NextResponse.json({error:{code:result.error}},{status:result.status})
 :NextResponse.json('data'in result?result.data.schedule:null,{headers:{'Cache-Control':'no-store'}});
}
