import {NextRequest,NextResponse} from 'next/server';
import {and,eq,sql,desc} from 'drizzle-orm';import {z} from 'zod';import {db} from '@/infrastructure/database';
import {academicSections,academicCourses} from '../../../../../../../../db/schema';
import {teachingContext,teachingReadVisibility} from '@/modules/grading/teaching-scope';import {jsonError} from '@/shared/auth/guards';import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {parsePage,cursorPredicate,cursorTimestamp,pageEnvelope} from '@/shared/http/pagination';
export const runtime='nodejs';type Ctx={params:Promise<{institutionId:string}>};
export const GET=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 const {institutionId}=await ctx.params;if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);
 const access=await teachingContext(institutionId);if(!access)return jsonError('FORBIDDEN',403);
 const scope=`gradebooks:${institutionId}:${access.access.membershipId}`,page=parsePage(req,scope);if(!page)return jsonError('INVALID_QUERY',422);
 const rows=await db.select({id:academicSections.id,cursorAt:cursorTimestamp(academicSections.createdAt),code:academicSections.code,status:academicSections.status,termId:academicSections.termId,courseName:academicCourses.name}).from(academicSections)
 .innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId)))
 .where(and(eq(academicSections.institutionId,institutionId),teachingReadVisibility(access,sql`${academicSections.id}`),cursorPredicate(page,academicSections.createdAt,academicSections.id))).orderBy(desc(academicSections.createdAt),desc(academicSections.id)).limit(page.limit+1);
 const result=pageEnvelope(rows,page,scope);
 return NextResponse.json({data:result.visible.map(({cursorAt,...row})=>{void cursorAt;return row}),page:result.page},{headers:{'Cache-Control':'no-store'}});
});
