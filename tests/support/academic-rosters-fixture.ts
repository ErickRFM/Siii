import type pg from 'pg';
import {sectionsFixture} from './sections-fixture';

/** Synthetic fixture, used only with isolatedDatabaseUrl(). */
export async function academicRostersFixture(sql:pg.Client){
 // Sequential suites share one synthetic HTTP IP. Do not inherit another suite's exhausted budget.
 await sql.query('DELETE FROM auth_throttle');
 const fixture=await sectionsFixture(sql),sections:Record<string,{main:string;alternate:string}>={};
 for(const [institutionId,count] of [[fixture.tenant,205],[fixture.other,3]] as const){
  const groups=(await sql.query('SELECT id FROM academic_sections WHERE institution_id=$1 ORDER BY code LIMIT 2',[institutionId])).rows;
  sections[institutionId]={main:groups[0].id,alternate:groups[1].id};
  await sql.query('UPDATE academic_sections SET capacity=500 WHERE institution_id=$1',[institutionId]);
  const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'PAGER','Programa sintético','ingenieria','presencial') RETURNING id",[institutionId])).rows[0].id;
  await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) SELECT $1,$2,'ROSTER'||n,'Estudiante','Sintético' FROM generate_series(1,$3::int)n",[institutionId,program,count]);
  await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) SELECT $1,'TEACHER'||n,'Docente','Sintético' FROM generate_series(1,$2::int)n",[institutionId,count]);
  for(const [table,foreign,people] of [['section_enrollments','student_id','institutional_students'],['section_teachers','teacher_id','institutional_teachers']] as const){
   await sql.query(`INSERT INTO ${table}(institution_id,section_id,${foreign},created_at) SELECT $1,$2,id,'2026-10-01 12:00:00.123456+00'::timestamptz+(row_number() OVER(ORDER BY id)%2)*interval '1 microsecond' FROM ${people} WHERE institution_id=$1`,[institutionId,groups[0].id]);
   await sql.query(`INSERT INTO ${table}(institution_id,section_id,${foreign}) SELECT $1,$2,id FROM ${people} WHERE institution_id=$1 ORDER BY id LIMIT 3`,[institutionId,groups[1].id]);
  }
  await sql.query("UPDATE section_enrollments SET status='withdrawn' WHERE id=(SELECT id FROM section_enrollments WHERE institution_id=$1 AND section_id=$2 ORDER BY id LIMIT 1)",[institutionId,groups[0].id]);
  await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id,revoked_at) SELECT $1,$2,id,now() FROM institutional_teachers WHERE institution_id=$1 ORDER BY id LIMIT 1',[institutionId,groups[0].id]);
 }
 return {...fixture,sections};
}
