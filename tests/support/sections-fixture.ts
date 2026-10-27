import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';

/** Synthetic data only; callers must connect using isolatedDatabaseUrl(). */
export async function sectionsFixture(sql:pg.Client,role='coordinator'){
 const suffix=randomUUID().slice(0,8),username='section-page-'+suffix,password='Synthetic-sections-pager-2026!';
 const units=(await sql.query("INSERT INTO institutions(name,code) VALUES('QA secciones paginadas',$1),('QA otro tenant secciones',$2) RETURNING id",['SP'+suffix,'SO'+suffix])).rows;
 const tenant:string=units[0].id,other:string=units[1].id;
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('QA','Secciones') RETURNING id")).rows[0].id;
 const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 for(const [institutionId,count] of [[tenant,205],[other,3]] as const){
  const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institutionId,user])).rows[0].id;
  await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[member,role]);
  const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,'MAT','Materia sintética',6) RETURNING id",[institutionId])).rows[0].id;
  const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,'2026','Periodo sintético','2026-01-01','2026-12-31') RETURNING id",[institutionId])).rows[0].id;
  await sql.query("INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity,created_at) SELECT $1,$2,$3,'SEC'||n,30,('2026-10-01 12:00:00.12345'||(n%2+6)||'+00')::timestamptz FROM generate_series(1,$4::int)n",[institutionId,term,course,count]);
 }
 return {tenant,other,user,username,password};
}
