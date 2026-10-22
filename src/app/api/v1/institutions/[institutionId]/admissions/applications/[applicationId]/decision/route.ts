import { NextResponse,type NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { admissionApplications, admissionDecisions } from '../../../../../../../../../../db/schema';
import { getIdentity, authorizeCapability } from '@/shared/auth/session';
import { admissionDecisionSchema } from '@/modules/admissions/validation';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {audit,requestId} from '@/shared/http/request-context';
import {domainTransaction,withDomainErrors,DomainAccessDenied} from '@/modules/consolidation/domain-boundary';

export const POST=withDomainErrors(async(request: NextRequest, { params }: { params: Promise<{ institutionId: string; applicationId: string }> })=>{
  const { institutionId, applicationId } = await params;
  if(!assertSameOrigin(request))return jsonError('INVALID_ORIGIN',403);
  try {
    const user = await getIdentity();
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, { status: 401 });
    }

    const access = await authorizeCapability(institutionId,'admissions.manage');
    if (!access) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'No tienes acceso a esta institución' } }, { status: 403 });
    }

    const json = await request.json().catch(()=>null);
    const parseResult = admissionDecisionSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de dictamen no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { decision, reason } = parseResult.data;

    const decisionRecord=await domainTransaction(access,{capability:'admissions.manage'},async tx=>{
     const [application] = await tx.select().from(admissionApplications)
      .where(and(eq(admissionApplications.id, applicationId), eq(admissionApplications.institutionId, institutionId)))
      .for('update');

    if (!application) {
      return null;
    }

      const [decisionRow] = await tx.insert(admissionDecisions).values({
        institutionId,
        applicationId,
        decidedBy: access.identity.id,
        decision,
        reason,
      }).returning();

      await tx.update(admissionApplications)
        .set({ status: decision, updatedAt: new Date() })
        .where(and(eq(admissionApplications.id, applicationId),eq(admissionApplications.institutionId,institutionId)));

      await audit(tx,{institutionId,actorUserId:access.identity.id,requestId:requestId(request.headers),action:'admissions.decision.recorded',target:'admission_application:'+applicationId,details:{before:{status:application.status},after:{status:decision,decisionId:decisionRow.id,reason}}});
      return decisionRow;
    });
    if(!decisionRecord)return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Solicitud de admisión no encontrada' } }, { status: 404 });

    return NextResponse.json({ data: decisionRecord }, { status: 201 });
  } catch(error) {
    if(error instanceof DomainAccessDenied)throw error;
    return NextResponse.json({ error: { code: 'DECISION_FAILED', message: 'No se pudo emitir el dictamen de admisión' } }, { status: 500 });
  }
});
