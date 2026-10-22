import {and,eq,sql} from 'drizzle-orm';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {admissionApplications,admissionCycles,academicPrograms,campuses,institutions} from '../../../db/schema';
import {audit,context} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
import {jsonError} from '@/shared/auth/guards';
import {withApplicant,applicantOrigin,applicantOk} from './identity';
import {admissionApplicationSchema} from './validation';

export const submitApplication=withErrors(async(req:NextRequest,{params}:{params:Promise<{institutionId:string}>})=>{
 if(!applicantOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await params;if(!z.uuid().safeParse(institutionId).success)return jsonError('OFFER_UNAVAILABLE',404);
 const input=admissionApplicationSchema.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('INVALID_INPUT',422);
 const result=await withApplicant(req,async(tx,profile)=>{
  const [institution]=await tx.select().from(institutions).where(and(eq(institutions.id,institutionId),eq(institutions.status,'active'))).for('share');
  if(!institution)return jsonError('OFFER_UNAVAILABLE',404);
  // Cycle lock serializes folios. Catalog locks prevent suspension while submitting.
  const [cycle]=await tx.select().from(admissionCycles).where(and(eq(admissionCycles.id,input.data.cycleId),eq(admissionCycles.institutionId,institutionId))).for('update');
  const now=new Date();if(!cycle||cycle.status!=='open'||cycle.startDate>now||cycle.endDate<=now)return jsonError('CYCLE_CLOSED',409);
  const [program]=await tx.select().from(academicPrograms).where(and(eq(academicPrograms.id,input.data.programId),eq(academicPrograms.institutionId,institutionId),eq(academicPrograms.status,'active'))).for('share');
  if(!program)return jsonError('OFFER_UNAVAILABLE',404);
  if(input.data.campusId){const [campus]=await tx.select().from(campuses).where(and(eq(campuses.id,input.data.campusId),eq(campuses.institutionId,institutionId),eq(campuses.status,'active'))).for('share');if(!campus)return jsonError('OFFER_UNAVAILABLE',404);}
  // Network retries return the already submitted application, without consuming another folio.
  const [existing]=await tx.select().from(admissionApplications).where(and(eq(admissionApplications.cycleId,cycle.id),eq(admissionApplications.applicantId,profile.id),eq(admissionApplications.programId,program.id)));
  if(existing)return applicantOk({id:existing.id,applicationNumber:existing.applicationNumber,status:existing.status},200);
  const [counter]=await tx.update(admissionCycles).set({applicationSequence:sql`${admissionCycles.applicationSequence}+1`}).where(eq(admissionCycles.id,cycle.id)).returning({sequence:admissionCycles.applicationSequence});
  const [application]=await tx.insert(admissionApplications).values({...input.data,institutionId,applicantId:profile.id,applicationNumber:'ADM-'+cycle.id+'-'+counter.sequence.toString().padStart(8,'0'),status:'submitted',submittedAt:now}).returning();
  await audit(tx,{institutionId,action:'admissions.application.submitted',target:'application:'+application.id,details:{after:{applicantId:profile.id}},requestId:context(req).requestId});
  return applicantOk({id:application.id,applicationNumber:application.applicationNumber,status:application.status},201);
 });return result??jsonError('UNAUTHORIZED',401);
});
