import {NextResponse,type NextRequest} from 'next/server';
import {eq,and,or,isNull} from 'drizzle-orm';
import {studentClaimRequests,institutionalStudents,studentAccountLinks,platformUsers,people,accountEmailVerifications} from '../../../../../../../../db/schema';
import {getIdentity,authorizeCapability} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {audit,context} from '@/shared/http/request-context';
import {canonicalEmail} from '@/shared/invitations/validation';
import {domainTransaction,withDomainErrors,DomainAccessDenied,DomainConflict} from '@/modules/consolidation/domain-boundary';
import {z} from 'zod';

const claimSchema=z.object({enrollmentNumber:z.string().trim().min(3,'Matrícula requerida')});
class ClaimStudentNotFound extends Error {}
const alreadyLinked=()=>NextResponse.json({error:{code:'ALREADY_LINKED',message:'Este expediente ya está vinculado a otra cuenta'}},{status:409});

export const POST=withDomainErrors(async(request:NextRequest,{params}:{params:Promise<{institutionId:string}>})=>{
  if(!assertSameOrigin(request))return jsonError('INVALID_ORIGIN',403);
  const {institutionId}=await params;
  try{
    if(!await getIdentity())return NextResponse.json({error:{code:'UNAUTHORIZED',message:'Sesión requerida'}},{status:401});
    const access=await authorizeCapability(institutionId,'institutions.read');
    if(!access)return jsonError('FORBIDDEN',403);
    const parsed=claimSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return NextResponse.json({error:{code:'INVALID_INPUT',message:'Matrícula no válida'}},{status:400});
    const {enrollmentNumber}=parsed.data,{requestId}=context(request);

    const result=await domainTransaction(access,{capability:'institutions.read'},async tx=>{
      // The shared boundary holds the current institution, user and membership.
      // Contact/proof and student locks keep the auto-link evidence stable too.
      const [person]=await tx.select({email:people.email}).from(platformUsers)
        .innerJoin(people,eq(platformUsers.personId,people.id))
        .where(eq(platformUsers.id,access.identity.id)).for('share',{of:people});
      const [proof]=await tx.select({email:accountEmailVerifications.verifiedEmail}).from(accountEmailVerifications)
        .where(eq(accountEmailVerifications.userId,access.identity.id)).for('share');
      const [student]=await tx.select().from(institutionalStudents)
        .where(and(eq(institutionalStudents.institutionId,institutionId),eq(institutionalStudents.enrollmentNumber,enrollmentNumber)))
        .for('update');
      if(!student)throw new ClaimStudentNotFound();
      const [existingLink]=await tx.select({id:studentAccountLinks.id}).from(studentAccountLinks)
        .where(and(eq(studentAccountLinks.institutionId,institutionId),isNull(studentAccountLinks.revokedAt),
          or(eq(studentAccountLinks.studentId,student.id),eq(studentAccountLinks.membershipId,access.access.membershipId))))
        .for('update');
      if(existingLink)throw new DomainConflict('ALREADY_LINKED');

      const currentEmail=person?.email?canonicalEmail(person.email):null;
      const studentEmail=student.institutionalEmail?canonicalEmail(student.institutionalEmail):null;
      // Proof is global historical mailbox ownership, not an invitation grant.
      // Matching editable contact text alone must only create a pending request.
      if(currentEmail&&studentEmail&&proof&&canonicalEmail(proof.email)===currentEmail&&currentEmail===studentEmail){
        const [link]=await tx.insert(studentAccountLinks).values({
          institutionId,membershipId:access.access.membershipId,studentId:student.id,linkedBy:access.identity.id,
        }).returning();
        await audit(tx,{actorUserId:access.identity.id,institutionId,requestId,action:'student.link.auto_approved',target:'student_account_link:'+link.id,
          details:{after:{studentId:student.id,membershipId:access.access.membershipId}}});
        return {link,autoApproved:true as const,message:'Expediente vinculado automáticamente'};
      }
      const [claim]=await tx.insert(studentClaimRequests).values({institutionId,applicantUserId:access.identity.id,enrollmentNumber,verificationStatus:'pending'}).returning();
      await audit(tx,{actorUserId:access.identity.id,institutionId,requestId,action:'student.claim.requested',target:'student_claim:'+claim.id,
        details:{after:{enrollmentNumber,verificationStatus:claim.verificationStatus}}});
      return {claim,autoApproved:false as const,message:'Solicitud de vinculación enviada a Control Escolar'};
    });
    return NextResponse.json({data:result},{status:201});
  }catch(error){
    // These catches run after domainTransaction has rolled back, including a
    // late authority denial following a successful-looking insert and audit.
    if(error instanceof DomainAccessDenied)throw error;
    if(error instanceof ClaimStudentNotFound)return NextResponse.json({error:{code:'STUDENT_NOT_FOUND',message:'No se encontró ningún expediente con esa matrícula en esta institución'}},{status:404});
    if(error instanceof DomainConflict)return alreadyLinked();
    const driver=(error as {cause?:{code?:string;constraint?:string}})?.cause??error as {code?:string;constraint?:string};
    if(driver?.code==='23505'&&['student_account_links_active_student_uidx','student_account_links_active_member_uidx'].includes(driver.constraint??''))return alreadyLinked();
    return NextResponse.json({error:{code:'CLAIM_FAILED',message:'No se pudo procesar la solicitud de vinculación'}},{status:500});
  }
});
