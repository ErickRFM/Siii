import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';

export const QA_TEMPORARY_PASSWORD = 'Qa-Security-2026!Pass';

export async function provisionQaAccounts(connectionString: string) {
  const sql = new pg.Client({connectionString});
  await sql.connect();
  try {
    const passwordHash = await argon2.hash(QA_TEMPORARY_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const tenantRow = (await sql.query("SELECT id FROM institutions WHERE code='QA-UNIV'")).rows[0];
    const tenantId: string = tenantRow
      ? tenantRow.id
      : (await sql.query(
          "INSERT INTO institutions(id, name, code, timezone) VALUES($1, 'Universidad QA Institucional', 'QA-UNIV', 'America/Mexico_City') RETURNING id",
          [randomUUID()]
        )).rows[0].id;

    const programRow = (await sql.query("SELECT id FROM academic_programs WHERE institution_id=$1 AND code='QA-PROG'", [tenantId])).rows[0];
    const programId: string = programRow
      ? programRow.id
      : (await sql.query("INSERT INTO academic_programs(institution_id, code, name, level, modality) VALUES($1, 'QA-PROG', 'Ingeniería QA', 'ingenieria', 'presencial') RETURNING id", [tenantId])).rows[0].id;

    const termRow = (await sql.query("SELECT id FROM academic_terms WHERE institution_id=$1 AND code='2026-QA'", [tenantId])).rows[0];
    const termId: string = termRow
      ? termRow.id
      : (await sql.query("INSERT INTO academic_terms(institution_id, code, name, start_date, end_date) VALUES($1, '2026-QA', 'Semestre QA 2026', '2026-08-01', '2026-12-31') RETURNING id", [tenantId])).rows[0].id;

    const courseRow = (await sql.query("SELECT id FROM academic_courses WHERE institution_id=$1 AND code='QA-101'", [tenantId])).rows[0];
    const courseId: string = courseRow
      ? courseRow.id
      : (await sql.query("INSERT INTO academic_courses(institution_id, code, name, credits) VALUES($1, 'QA-101', 'Calidad de Software', 6) RETURNING id", [tenantId])).rows[0].id;

    const sectionRow = (await sql.query("SELECT id FROM academic_sections WHERE institution_id=$1 AND code='SEC-QA1'", [tenantId])).rows[0];
    const sectionId: string = sectionRow
      ? sectionRow.id
      : (await sql.query("INSERT INTO academic_sections(institution_id, term_id, course_id, code, capacity) VALUES($1, $2, $3, 'SEC-QA1', 30) RETURNING id", [tenantId, termId, courseId])).rows[0].id;

    const identities = [
      {
        username: 'qa-student',
        role: 'student',
        firstName: 'Estudiante',
        lastName: 'Pruebas QA',
        email: 'qa-student@universidad-qa.test',
        recordCode: 'MAT-QA-2026',
      },
      {
        username: 'qa-teacher',
        role: 'teacher',
        firstName: 'Docente',
        lastName: 'Pruebas QA',
        email: 'qa-teacher@universidad-qa.test',
        recordCode: 'EMP-QA-2026',
      },
      {
        username: 'qa-admin',
        role: 'admin',
        firstName: 'Administrador',
        lastName: 'Institucional QA',
        email: 'qa-admin@universidad-qa.test',
        recordCode: 'ADM-QA-2026',
      },
    ] as const;

    const results: Array<{username: string; role: string; userId: string; membershipId: string}> = [];

    for (const item of identities) {
      let personId = (await sql.query("SELECT id FROM people WHERE email=$1", [item.email])).rows[0]?.id;
      if (!personId) {
        personId = (await sql.query("INSERT INTO people(first_name, last_name, email) VALUES($1, $2, $3) RETURNING id", [item.firstName, item.lastName, item.email])).rows[0].id;
      }

      let userId = (await sql.query("SELECT id FROM platform_users WHERE username=$1", [item.username])).rows[0]?.id;
      if (!userId) {
        userId = (await sql.query(
          "INSERT INTO platform_users(person_id, username, password_hash, must_change_password) VALUES($1, $2, $3, true) RETURNING id",
          [personId, item.username, passwordHash]
        )).rows[0].id;
      } else {
        await sql.query("UPDATE platform_users SET password_hash=$1, must_change_password=true WHERE id=$2", [passwordHash, userId]);
      }

      let memberId = (await sql.query("SELECT id FROM institution_memberships WHERE institution_id=$1 AND user_id=$2", [tenantId, userId])).rows[0]?.id;
      if (!memberId) {
        memberId = (await sql.query("INSERT INTO institution_memberships(institution_id, user_id, status) VALUES($1, $2, 'active') RETURNING id", [tenantId, userId])).rows[0].id;
      }

      const grantId = (await sql.query("SELECT id FROM role_assignments WHERE membership_id=$1 AND role=$2", [memberId, item.role])).rows[0]?.id;
      if (!grantId) {
        await sql.query("INSERT INTO role_assignments(membership_id, role, scope_type) VALUES($1, $2, 'institution')", [memberId, item.role]);
      }

      if (item.role === 'student') {
        let studentRecordId = (await sql.query("SELECT id FROM institutional_students WHERE institution_id=$1 AND enrollment_number=$2", [tenantId, item.recordCode])).rows[0]?.id;
        if (!studentRecordId) {
          studentRecordId = (await sql.query(
            "INSERT INTO institutional_students(institution_id, program_id, enrollment_number, first_name, last_name) VALUES($1, $2, $3, $4, $5) RETURNING id",
            [tenantId, programId, item.recordCode, item.firstName, item.lastName]
          )).rows[0].id;
        }
        await sql.query("INSERT INTO student_account_links(institution_id, membership_id, student_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING", [tenantId, memberId, studentRecordId]);
        await sql.query("INSERT INTO section_enrollments(institution_id, section_id, student_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING", [tenantId, sectionId, studentRecordId]);
      } else if (item.role === 'teacher') {
        let teacherRecordId = (await sql.query("SELECT id FROM institutional_teachers WHERE institution_id=$1 AND employee_number=$2", [tenantId, item.recordCode])).rows[0]?.id;
        if (!teacherRecordId) {
          teacherRecordId = (await sql.query(
            "INSERT INTO institutional_teachers(institution_id, employee_number, first_name, last_name, institutional_email) VALUES($1, $2, $3, $4, $5) RETURNING id",
            [tenantId, item.recordCode, item.firstName, item.lastName, item.email]
          )).rows[0].id;
        }
        await sql.query("INSERT INTO teacher_account_links(institution_id, membership_id, teacher_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING", [tenantId, memberId, teacherRecordId]);
        await sql.query("INSERT INTO section_teachers(institution_id, section_id, teacher_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING", [tenantId, sectionId, teacherRecordId]);
      }

      results.push({username: item.username, role: item.role, userId, membershipId: memberId});
    }

    // QA-UNIV Certified Academic Data: Grade 8.70, Notices, Requests, Schedule
    const studentUser = results.find(r => r.role === 'student');
    const teacherUser = results.find(r => r.role === 'teacher');
    const adminUser = results.find(r => r.role === 'admin');

    if (studentUser && teacherUser) {
      const studentRecordId = (await sql.query("SELECT id FROM institutional_students WHERE institution_id=$1 AND enrollment_number='MAT-QA-2026'", [tenantId])).rows[0]?.id;
      if (studentRecordId) {
        // 1. Published Grade 8.70 (870 hundredths) for Calidad de Software
        const existingPub = (await sql.query("SELECT id FROM grade_publications WHERE institution_id=$1 AND section_id=$2", [tenantId, sectionId])).rows[0];
        let pubId = existingPub?.id;
        if (!pubId) {
          pubId = (await sql.query(
            "INSERT INTO grade_publications(id, institution_id, section_id, operation_id, published_by, version) VALUES($1, $2, $3, $4, $5, 1) RETURNING id",
            [randomUUID(), tenantId, sectionId, randomUUID(), teacherUser.userId]
          )).rows[0].id;
        }
        await sql.query(
          "INSERT INTO final_grades(id, institution_id, publication_id, student_id, score_hundredths) VALUES($1, $2, $3, $4, 870) ON CONFLICT DO NOTHING",
          [randomUUID(), tenantId, pubId, studentRecordId]
        );

        // 2. Demo student service request
        const existingReq = (await sql.query("SELECT id FROM student_service_requests WHERE institution_id=$1 AND student_id=$2", [tenantId, studentRecordId])).rows[0];
        if (!existingReq) {
          await sql.query(
            "INSERT INTO student_service_requests(id, institution_id, student_id, request_type, summary, status) VALUES($1, $2, $3, 'CERTIFICATE', 'Constancia oficial de estudios', 'SUBMITTED')",
            [randomUUID(), tenantId, studentRecordId]
          );
        }
      }
    }

    if (adminUser) {
      // 3. Demo institutional announcement
      const existingNotice = (await sql.query("SELECT id FROM institutional_announcements WHERE institution_id=$1", [tenantId])).rows[0];
      if (!existingNotice) {
        await sql.query(
          "INSERT INTO institutional_announcements(id, institution_id, title, body, status, author_user_id, published_at) VALUES($1, $2, 'Inicio del periodo académico QA 2026', 'Bienvenidos al ciclo de Calidad de Software institucional.', 'PUBLISHED', $3, now())",
          [randomUUID(), tenantId, adminUser.userId]
        );
      }
    }

    // 4. Demo Schedule: Campus, Classroom and Pattern for SEC-QA1
    let campusId = (await sql.query("SELECT id FROM campuses WHERE institution_id=$1 AND code='QA-CAMPUS'", [tenantId])).rows[0]?.id;
    if (!campusId) {
      campusId = (await sql.query(
        "INSERT INTO campuses(id, institution_id, code, name, is_primary) VALUES($1, $2, 'QA-CAMPUS', 'Campus Central QA', true) RETURNING id",
        [randomUUID(), tenantId]
      )).rows[0].id;
    }
    let roomId = (await sql.query("SELECT id FROM classrooms WHERE campus_id=$1 AND code='AULA-QA1'", [campusId])).rows[0]?.id;
    if (!roomId) {
      roomId = (await sql.query(
        "INSERT INTO classrooms(id, institution_id, campus_id, code, building, capacity) VALUES($1, $2, $3, 'AULA-QA1', 'Edificio QA', 30) RETURNING id",
        [randomUUID(), tenantId, campusId]
      )).rows[0].id;
    }
    const existingPattern = (await sql.query("SELECT id FROM schedule_patterns WHERE section_id=$1 AND room_id=$2", [sectionId, roomId])).rows[0];
    if (!existingPattern) {
      await sql.query(
        "INSERT INTO schedule_patterns(id, institution_id, section_id, room_id, weekday, start_minute, end_minute) VALUES($1, $2, $3, $4, 1, 480, 600)",
        [randomUUID(), tenantId, sectionId, roomId]
      );
    }

    return {tenantId, accounts: results};
  } finally {
    await sql.end();
  }
}
