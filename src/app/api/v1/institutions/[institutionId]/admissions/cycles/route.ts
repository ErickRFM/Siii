import { NextResponse,type NextRequest } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { admissionCycles } from '../../../../../../../../db/schema';
import { getIdentity, authorizeCapability } from '@/shared/auth/session';
import { admissionCycleSchema } from '@/modules/admissions/validation';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {audit,requestId} from '@/shared/http/request-context';
import {domainTransaction,withDomainErrors,DomainAccessDenied} from '@/modules/consolidation/domain-boundary';

export async function GET(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  try {
    const cycles = await db.select().from(admissionCycles)
      .where(eq(admissionCycles.institutionId, institutionId))
      .orderBy(desc(admissionCycles.startDate));

    return NextResponse.json({ data: cycles }, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: 'CYCLES_FETCH_FAILED', message: 'No se pudieron consultar las convocatorias' } }, { status: 500 });
  }
}

export const POST=withDomainErrors(async(request: NextRequest, { params }: { params: Promise<{ institutionId: string }> })=>{
  const { institutionId } = await params;
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
    const parseResult = admissionCycleSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de convocatoria no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { code, name, startDate, endDate, status } = parseResult.data;

    const cycle=await domainTransaction(access,{capability:'admissions.manage'},async tx=>{
     const [cycle] = await tx.insert(admissionCycles).values({
      institutionId,
      code,
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status,
     }).returning();
     await audit(tx,{institutionId,actorUserId:access.identity.id,requestId:requestId(request.headers),action:'admissions.cycle.created',target:'admission_cycle:'+cycle.id,details:{before:null,after:cycle}});
     return cycle;
    });

    return NextResponse.json({ data: cycle }, { status: 201 });
  } catch(error) {
    if(error instanceof DomainAccessDenied)throw error;
    return NextResponse.json({ error: { code: 'CYCLE_CREATE_FAILED', message: 'No se pudo crear la convocatoria de admisión' } }, { status: 500 });
  }
});
