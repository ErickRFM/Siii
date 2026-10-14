import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import {
  academicCourses, academicPrograms, academicTerms, campuses, curriculumVersions,
  securityAuditLog,
} from '../../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin, jsonError } from '@/shared/auth/guards';
import { catalogCreate, catalogResource, catalogUpdate } from '@/modules/academic/catalog-validation';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ institutionId: string; resource: string }> };
const uuid = z.uuid();
const noCache = { 'Cache-Control': 'no-store' };

async function routeContext(ctx: Ctx) {
  const { institutionId, resource } = await ctx.params;
  if (!uuid.safeParse(institutionId).success || !catalogResource.safeParse(resource).success) return null;
  return { institutionId, resource: catalogResource.parse(resource) };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const params = await routeContext(ctx);
  if (!params) return jsonError('INVALID_RESOURCE', 404);
  const access = await authorizeInstitution(params.institutionId, 'academic.read');
  if (!access) return jsonError('FORBIDDEN', 403);
  const { institutionId, resource } = params;
  const data = resource === 'campuses'
    ? await db.select().from(campuses).where(eq(campuses.institutionId, institutionId)).orderBy(desc(campuses.createdAt)).limit(200)
    : resource === 'terms'
      ? await db.select().from(academicTerms).where(eq(academicTerms.institutionId, institutionId)).orderBy(desc(academicTerms.createdAt)).limit(200)
      : resource === 'programs'
        ? await db.select().from(academicPrograms).where(eq(academicPrograms.institutionId, institutionId)).orderBy(desc(academicPrograms.createdAt)).limit(200)
        : resource === 'courses'
          ? await db.select().from(academicCourses).where(eq(academicCourses.institutionId, institutionId)).orderBy(desc(academicCourses.createdAt)).limit(200)
          : await db.select().from(curriculumVersions).where(eq(curriculumVersions.institutionId, institutionId)).orderBy(desc(curriculumVersions.createdAt)).limit(200);
  return NextResponse.json({ data }, { headers: noCache });
}

async function audit(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], actor: string, institutionId: string, resource: string, id: string, operation: string) {
  await tx.insert(securityAuditLog).values({
    actorUserId: actor, institutionId,
    action: `academic.${resource}.${operation}`,
    target: `${resource}:${id}`,
  });
}

function errorResponse(error: unknown) {
  const constraint = error as { code?: string; cause?: { code?: string } };
  const code = constraint.code ?? constraint.cause?.code;
  if (code === '23505') return jsonError('DUPLICATE_CODE', 409);
  if (code === '23503' || code === '23514') return jsonError('ACADEMIC_CONSTRAINT', 422);
  throw error;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!assertSameOrigin(req)) return jsonError('INVALID_ORIGIN', 403);
  const params = await routeContext(ctx);
  if (!params) return jsonError('INVALID_RESOURCE', 404);
  const access = await authorizeInstitution(params.institutionId, 'academic.manage');
  if (!access) return jsonError('FORBIDDEN', 403);
  const { resource, institutionId } = params;
  const body: unknown = await req.json().catch(() => null);
  try {
    if (resource === 'campuses') {
      const v = catalogCreate.campuses.safeParse(body);
      if (!v.success) return jsonError('VALIDATION_ERROR', 422);
      const data = await db.transaction(async tx => {
        const [row] = await tx.insert(campuses).values({ ...v.data, institutionId }).returning();
        await audit(tx, access.identity.id, institutionId, resource, row.id, 'create');
        return row;
      });
      return NextResponse.json({ data }, { status: 201, headers: noCache });
    }
    if (resource === 'terms') {
      const v = catalogCreate.terms.safeParse(body);
      if (!v.success) return jsonError('VALIDATION_ERROR', 422);
      const data = await db.transaction(async tx => {
        const [row] = await tx.insert(academicTerms).values({
          code: v.data.code, name: v.data.name,
          startDate: new Date(`${v.data.startDate}T12:00:00Z`),
          endDate: new Date(`${v.data.endDate}T12:00:00Z`), institutionId,
        }).returning();
        await audit(tx, access.identity.id, institutionId, resource, row.id, 'create');
        return row;
      });
      return NextResponse.json({ data }, { status: 201, headers: noCache });
    }
    if (resource === 'programs') {
      const v = catalogCreate.programs.safeParse(body);
      if (!v.success) return jsonError('VALIDATION_ERROR', 422);
      const data = await db.transaction(async tx => {
        const [row] = await tx.insert(academicPrograms).values({ ...v.data, institutionId }).returning();
        await audit(tx, access.identity.id, institutionId, resource, row.id, 'create');
        return row;
      });
      return NextResponse.json({ data }, { status: 201, headers: noCache });
    }
    if (resource === 'courses') {
      const v = catalogCreate.courses.safeParse(body);
      if (!v.success) return jsonError('VALIDATION_ERROR', 422);
      const data = await db.transaction(async tx => {
        const [row] = await tx.insert(academicCourses).values({ ...v.data, institutionId }).returning();
        await audit(tx, access.identity.id, institutionId, resource, row.id, 'create');
        return row;
      });
      return NextResponse.json({ data }, { status: 201, headers: noCache });
    }
    const v = catalogCreate.curricula.safeParse(body);
    if (!v.success) return jsonError('VALIDATION_ERROR', 422);
    const data = await db.transaction(async tx => {
      const program = await tx.select({ id: academicPrograms.id }).from(academicPrograms)
        .where(and(eq(academicPrograms.id, v.data.programId), eq(academicPrograms.institutionId, institutionId), eq(academicPrograms.status, 'active'))).limit(1);
      if (!program.length) return null;
      const [row] = await tx.insert(curriculumVersions).values({ ...v.data, institutionId }).returning();
      await audit(tx, access.identity.id, institutionId, resource, row.id, 'create');
      return row;
    });
    if (!data) return jsonError('PROGRAM_NOT_FOUND', 422);
    return NextResponse.json({ data }, { status: 201, headers: noCache });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!assertSameOrigin(req)) return jsonError('INVALID_ORIGIN', 403);
  const params = await routeContext(ctx);
  if (!params) return jsonError('INVALID_RESOURCE', 404);
  const access = await authorizeInstitution(params.institutionId, 'academic.manage');
  if (!access) return jsonError('FORBIDDEN', 403);
  const { resource, institutionId } = params;
  const body: unknown = await req.json().catch(() => null);
  const parsed = catalogUpdate[resource].safeParse(body);
  if (!parsed.success) return jsonError('VALIDATION_ERROR', 422);
  const update = z.object({ id: uuid, name: z.string().trim().min(3).max(160).optional(),
    status: z.enum(['active','inactive','archived','suspended']).optional() }).parse(body);
  if (!update.status && !update.name) return jsonError('NO_CHANGES', 422);
  if (resource === 'curricula' && update.name) return jsonError('VALIDATION_ERROR', 422);
  try {
    const data = await db.transaction(async tx => {
      const set = { ...(update.name ? { name: update.name } : {}), ...(update.status ? { status: update.status } : {}), updatedAt: new Date() };
      const changed = resource === 'campuses'
        ? await tx.update(campuses).set(set).where(and(eq(campuses.id, update.id),eq(campuses.institutionId,institutionId))).returning()
        : resource === 'terms'
          ? await tx.update(academicTerms).set(set).where(and(eq(academicTerms.id, update.id),eq(academicTerms.institutionId,institutionId))).returning()
          : resource === 'programs'
            ? await tx.update(academicPrograms).set(set).where(and(eq(academicPrograms.id, update.id),eq(academicPrograms.institutionId,institutionId))).returning()
            : resource === 'courses'
              ? await tx.update(academicCourses).set(set).where(and(eq(academicCourses.id, update.id),eq(academicCourses.institutionId,institutionId))).returning()
              : await tx.update(curriculumVersions).set({ status: update.status, updatedAt:new Date() })
                .where(and(eq(curriculumVersions.id,update.id),eq(curriculumVersions.institutionId,institutionId))).returning();
      if (changed.length) await audit(tx, access.identity.id, institutionId, resource, update.id, 'update');
      return changed[0] ?? null;
    });
    if (!data) return jsonError('NOT_FOUND', 404);
    return NextResponse.json({ data }, { headers: noCache });
  } catch (error) { return errorResponse(error); }
}
