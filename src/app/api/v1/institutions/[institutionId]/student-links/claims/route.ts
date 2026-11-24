import {NextResponse,type NextRequest} from 'next/server';
import {and,asc,eq} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/infrastructure/database';
import {studentClaimRequests,institutionalStudents,platformUsers,people,accountEmailVerifications} from '../../../../../../../../db/schema';
import {authorizeInstitution} from '@/shared/auth/session';
import {jsonError} from '@/shared/auth/guards';
import {canonicalEmail} from '@/shared/invitations/validation';
import {withDomainErrors} from '@/modules/consolidation/domain-boundary';

export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
const LIMIT=200;

/**
 * Pending enrollment claims that could not be auto-linked. Reviewers see the evidence
 * that the auto-link rule compared (profile email, verified mailbox proof, record email)
 * so the decision is explicit instead of silently trusting editable contact text.
 */
export const GET=withDomainErrors(async(_req:NextRequest,{params}:{params:Promise<{institutionId:string}>})=>{
 const {institutionId}=await params;if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);
 if(!await authorizeInstitution(institutionId,'users.manage'))return jsonError('FORBIDDEN',403);
 const rows=await db.select({
  id:studentClaimRequests.id,enrollmentNumber:studentClaimRequests.enrollmentNumber,createdAt:studentClaimRequests.createdAt,
  applicantUserId:platformUsers.id,username:platformUsers.username,firstName:people.firstName,lastName:people.lastName,profileEmail:people.email,
  verifiedEmail:accountEmailVerifications.verifiedEmail,
  studentId:institutionalStudents.id,studentFirstName:institutionalStudents.firstName,studentLastName:institutionalStudents.lastName,
  studentEmail:institutionalStudents.institutionalEmail,studentStatus:institutionalStudents.status,
 }).from(studentClaimRequests)
  .innerJoin(platformUsers,eq(platformUsers.id,studentClaimRequests.applicantUserId))
  .innerJoin(people,eq(people.id,platformUsers.personId))
  .leftJoin(accountEmailVerifications,eq(accountEmailVerifications.userId,platformUsers.id))
  .leftJoin(institutionalStudents,and(eq(institutionalStudents.institutionId,studentClaimRequests.institutionId),eq(institutionalStudents.enrollmentNumber,studentClaimRequests.enrollmentNumber)))
  .where(and(eq(studentClaimRequests.institutionId,institutionId),eq(studentClaimRequests.verificationStatus,'pending')))
  .orderBy(asc(studentClaimRequests.createdAt),asc(studentClaimRequests.id)).limit(LIMIT+1);
 const norm=(value:string|null)=>value?canonicalEmail(value):null;
 const data=rows.slice(0,LIMIT).map(row=>({
  id:row.id,enrollmentNumber:row.enrollmentNumber,createdAt:row.createdAt,
  applicant:{userId:row.applicantUserId,username:row.username,name:`${row.firstName} ${row.lastName}`.trim(),profileEmail:row.profileEmail,verifiedEmail:row.verifiedEmail},
  student:row.studentId?{id:row.studentId,name:`${row.studentFirstName} ${row.studentLastName}`.trim(),institutionalEmail:row.studentEmail,status:row.studentStatus}:null,
  evidence:{
   verifiedMatchesRecord:!!row.verifiedEmail&&!!row.studentEmail&&norm(row.verifiedEmail)===norm(row.studentEmail),
   profileMatchesRecord:!!row.profileEmail&&!!row.studentEmail&&norm(row.profileEmail)===norm(row.studentEmail),
  },
 }));
 return NextResponse.json({data,truncated:rows.length>LIMIT},{headers});
});
