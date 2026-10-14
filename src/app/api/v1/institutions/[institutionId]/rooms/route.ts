import { NextRequest,NextResponse } from 'next/server';
import { eq,and,desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { campuses,classrooms,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { roomCreate } from '@/modules/scheduling/validation';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
const headers={'Cache-Control':'no-store'};
async function valid(c:Ctx){const v=await c.params;return z.uuid().safeParse(v.institutionId).success?v.institutionId:null;}
export async function GET(_req:NextRequest,c:Ctx){
 const id=await valid(c);if(!id)return jsonError('INVALID_INSTITUTION',404);
 if(!await authorizeInstitution(id,'academic.manage'))return jsonError('FORBIDDEN',403);
 const data=await db.select().from(classrooms).where(eq(classrooms.institutionId,id)).orderBy(desc(classrooms.createdAt)).limit(200);
 return NextResponse.json({data,truncated:data.length===200},{headers});
}
export async function POST(req:NextRequest,c:Ctx){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await valid(c);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const auth=await authorizeInstitution(id,'academic.manage');if(!auth)return jsonError('FORBIDDEN',403);
 const parsed=roomCreate.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 try{
  const result=await db.transaction(async tx=>{
   const [campus]=await tx.select({id:campuses.id}).from(campuses).where(and(eq(campuses.id,parsed.data.campusId),eq(campuses.institutionId,id),eq(campuses.status,'active'))).limit(1);
   if(!campus)return null;
   const [room]=await tx.insert(classrooms).values({...parsed.data,institutionId:id}).returning();
   await tx.insert(securityAuditLog).values({institutionId:id,actorUserId:auth.identity.id,action:'classroom.create',target:'classroom:'+room.id});
   return room;
  });
  return result?NextResponse.json({data:result},{status:201,headers}):jsonError('CAMPUS_NOT_FOUND',422);
 }catch(e){const v=e as {code?:string;cause?:{code?:string}};if((v.code??v.cause?.code)==='23505')return jsonError('ROOM_ALREADY_EXISTS',409);throw e}
}
