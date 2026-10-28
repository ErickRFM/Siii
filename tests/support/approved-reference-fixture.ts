import type pg from 'pg';
import {randomUUID} from 'node:crypto';
import {portalFixture} from './portal-fixture';

/** Synthetic rows in an isolated database. All UI reads still use the real authenticated API. */
export async function approvedReferenceFixture(sql:pg.Client){
 const f=await portalFixture(sql);
 await sql.query("UPDATE institutions SET name='Universidad Politécnica de Tlaxcala' WHERE id=$1",[f.tenant]);
 await sql.query("UPDATE people SET first_name='Alejandra',last_name='Torres' WHERE id=(SELECT person_id FROM platform_users WHERE id=$1)",[f.student.id]);
 await sql.query("UPDATE institutional_students SET first_name='Alejandra',last_name='Torres',enrollment_number='REF-2026-001' WHERE id=$1",[f.studentId]);
 await sql.query("UPDATE academic_programs SET name='Ingeniería en Tecnologías de la Información' WHERE id=$1",[f.program]);
 await sql.query("UPDATE academic_terms SET name='Periodo 2026-2' WHERE id=$1",[f.term]);
 await sql.query("UPDATE academic_courses SET name='Bases de Datos' WHERE id=$1",[f.course]);
 await sql.query('UPDATE final_grades SET score_hundredths=950 WHERE publication_id=$1 AND student_id=$2',[f.publication,f.studentId]);
 for(const [index,name,score]of [[1,'Programación Web',870],[2,'Redes de Computadoras',920],[3,'Matemáticas Discretas',980]] as const){
  const course=(await sql.query('INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,$3,6) RETURNING id',[f.tenant,'REF'+index,name])).rows[0].id;
  const section=(await sql.query('INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,$4,30) RETURNING id',[f.tenant,f.term,course,'REF-0'+index])).rows[0].id;
  await sql.query('INSERT INTO section_enrollments(institution_id,section_id,student_id) VALUES($1,$2,$3)',[f.tenant,section,f.studentId]);
  await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.tenant,section,f.teacherId]);
  const publication=(await sql.query('INSERT INTO grade_publications(institution_id,section_id,operation_id,published_by) VALUES($1,$2,$3,$4) RETURNING id',[f.tenant,section,randomUUID(),f.teacher.id])).rows[0].id;
  await sql.query('INSERT INTO final_grades(institution_id,publication_id,student_id,score_hundredths) VALUES($1,$2,$3,$4)',[f.tenant,publication,f.studentId,score]);
 }
 await sql.query("UPDATE grade_publications SET published_at='2026-10-10T17:00:00Z' WHERE id=$1",[f.publication]);
 await sql.query("UPDATE grade_publications SET published_at=CASE course.name WHEN 'Programación Web' THEN '2026-10-08T17:00:00Z'::timestamptz WHEN 'Redes de Computadoras' THEN '2026-10-07T17:00:00Z'::timestamptz ELSE '2026-10-05T17:00:00Z'::timestamptz END FROM academic_sections section JOIN academic_courses course ON course.id=section.course_id WHERE grade_publications.section_id=section.id AND section.institution_id=$1 AND grade_publications.id<>$2",[f.tenant,f.publication]);
 for(const [title,body]of [['Suspensión de actividades','Dirección Académica'],['Periodo de reinscripciones','Servicios Escolares'],['Nueva convocatoria','Becas Institucionales']])await sql.query("INSERT INTO institutional_announcements(institution_id,title,body,status,author_user_id,published_at) VALUES($1,$2,$3,'PUBLISHED',$4,'2026-10-26T17:00:00Z')",[f.tenant,title,body,f.admin.id]);
 await sql.query("UPDATE institutional_announcements SET published_at=CASE title WHEN 'Suspensión de actividades' THEN '2026-10-26T17:00:00Z'::timestamptz WHEN 'Periodo de reinscripciones' THEN '2026-10-26T14:00:00Z'::timestamptz ELSE '2026-10-25T18:00:00Z'::timestamptz END WHERE institution_id=$1",[f.tenant]);
 for(const [type,summary]of [['CERTIFICATE','Constancia de estudios'],['OTHER','Historial académico'],['OTHER','Kárdex'],['CERTIFICATE','Constancia de inscripción']])await sql.query("INSERT INTO student_service_requests(institution_id,student_id,request_type,summary,status) VALUES($1,$2,$3,$4,'SUBMITTED')",[f.tenant,f.studentId,type,summary]);
 await sql.query("INSERT INTO institutional_announcements(institution_id,title,body,status,author_user_id,published_at) VALUES($1,'PRIVATE-OTHER-TENANT','No debe aparecer','PUBLISHED',$2,'2026-10-26T17:00:00Z')",[f.other,f.admin.id]);
 return f;
}
