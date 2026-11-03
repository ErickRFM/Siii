import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import {
  academicPrograms, academicSections, institutionalStudents, institutionalTeachers,
  sectionEnrollments, sectionTeachers, roleAssignments,
} from '../../../../../../../../db/schema';
import { authorizeCapability } from '@/shared/auth/session';
import { can } from '@/shared/auth/capabilities';
import { readVisibility } from '@/shared/auth/read-access';
import { jsonError } from '@/shared/auth/guards';
import { uuid } from '@/shared/auth/validation';
import { withErrors } from '@/shared/http/route-errors';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ institutionId: string; programId: string }> };

/**
 * Read-only career administration directory. The backend, not the client,
 * resolves staff through actual section enrollments, so a coordinator can
 * never select an unrelated institution or program by changing a URL.
 *
 * Bounded results are intentionally not a full-data export.
 */
export const GET = withErrors(async (_req: NextRequest, ctx: RouteContext) => {
  const { institutionId, programId } = await ctx.params;
  if (!uuid.safeParse(institutionId).success || !uuid.safeParse(programId).success) {
    return jsonError('INVALID_ID', 400);
  }
  const resource = { institutionId, programId, status: 'active' };
  const actor = await authorizeCapability(institutionId, 'groups.manage', resource);
  if (!actor) return jsonError('FORBIDDEN', 403);

  const eligible = actor.access.grants.filter(grant =>
    can({ ...actor.subject, grants: [grant] }, 'groups.manage', resource),
  );
  const visibility = readVisibility(
    actor.subject, actor.access, actor.identity.sessionId, eligible,
    or(
      eq(roleAssignments.scopeType, 'institution'),
      and(eq(roleAssignments.scopeType, 'program'), eq(roleAssignments.programId, programId)),
    ),
  );

  const [program] = await db.select({
    id: academicPrograms.id, code: academicPrograms.code,
    name: academicPrograms.name, level: academicPrograms.level,
    modality: academicPrograms.modality, status: academicPrograms.status,
  }).from(academicPrograms).where(and(
    eq(academicPrograms.id, programId),
    eq(academicPrograms.institutionId, institutionId),
    eq(academicPrograms.status, 'active'),
    visibility,
  )).limit(1);
  if (!program) return jsonError('NOT_FOUND', 404);

  const students = await db.select({
    id: institutionalStudents.id,
    enrollmentNumber: institutionalStudents.enrollmentNumber,
    firstName: institutionalStudents.firstName,
    lastName: institutionalStudents.lastName,
    institutionalEmail: institutionalStudents.institutionalEmail,
    status: institutionalStudents.status,
  }).from(institutionalStudents).where(and(
    eq(institutionalStudents.institutionId, institutionId),
    eq(institutionalStudents.programId, programId),
    visibility,
  )).orderBy(asc(institutionalStudents.lastName), asc(institutionalStudents.id)).limit(201);

  // Teachers and sections must have an *actual* enrolled student in this
  // program. A teacher's institutional presence alone proves no career link.
  const teacherRows = await db.selectDistinct({
    id: institutionalTeachers.id,
    employeeNumber: institutionalTeachers.employeeNumber,
    firstName: institutionalTeachers.firstName,
    lastName: institutionalTeachers.lastName,
    institutionalEmail: institutionalTeachers.institutionalEmail,
    status: institutionalTeachers.status,
  }).from(institutionalTeachers)
    .innerJoin(sectionTeachers, and(
      eq(sectionTeachers.teacherId, institutionalTeachers.id),
      eq(sectionTeachers.institutionId, institutionId),
      isNull(sectionTeachers.revokedAt),
    ))
    .innerJoin(sectionEnrollments, and(
      eq(sectionEnrollments.sectionId, sectionTeachers.sectionId),
      eq(sectionEnrollments.institutionId, institutionId),
      eq(sectionEnrollments.status, 'enrolled'),
    ))
    .innerJoin(institutionalStudents, and(
      eq(institutionalStudents.id, sectionEnrollments.studentId),
      eq(institutionalStudents.institutionId, institutionId),
      eq(institutionalStudents.programId, programId),
    ))
    .where(and(
      eq(institutionalTeachers.institutionId, institutionId), visibility,
    )).orderBy(asc(institutionalTeachers.lastName), asc(institutionalTeachers.id)).limit(201);

  const sectionRows = await db.selectDistinct({
    id: academicSections.id, code: academicSections.code, status: academicSections.status,
    termId: academicSections.termId, courseId: academicSections.courseId,
  }).from(academicSections)
    .innerJoin(sectionEnrollments, and(
      eq(sectionEnrollments.sectionId, academicSections.id),
      eq(sectionEnrollments.institutionId, institutionId),
      eq(sectionEnrollments.status, 'enrolled'),
    ))
    .innerJoin(institutionalStudents, and(
      eq(institutionalStudents.id, sectionEnrollments.studentId),
      eq(institutionalStudents.institutionId, institutionId),
      eq(institutionalStudents.programId, programId),
    ))
    .where(and(eq(academicSections.institutionId, institutionId), visibility))
    .orderBy(asc(academicSections.code), asc(academicSections.id)).limit(201);

  return NextResponse.json({
    data: {
      program,
      students: students.slice(0, 200), teachers: teacherRows.slice(0, 200),
      sections: sectionRows.slice(0, 200),
      truncated: {
        students: students.length > 200, teachers: teacherRows.length > 200,
        sections: sectionRows.length > 200,
      },
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
});
