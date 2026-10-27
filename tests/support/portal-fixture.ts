import type pg from 'pg';
import argon2 from 'argon2';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {sealMfaSecret} from '../../src/shared/auth/mfa-primitives';

export const portalPassword='Synthetic-portal-2026!';
export async function portalFixture(sql:pg.Client){
 const suffix=randomUUID().slice(0,8);
 const tenant=(await sql.query("INSERT INTO institutions(name,code) VALUES('Universidad de pruebas VNext',$1) RETURNING id",['VN'+suffix])).rows[0].id as string;
 const other=(await sql.query("INSERT INTO institutions(name,code) VALUES('Institución externa de pruebas',$1) RETURNING id",['VO'+suffix])).rows[0].id as string;
 const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'SYS','Ingeniería de Sistemas','ingenieria','presencial') RETURNING id",[tenant])).rows[0].id as string;
 const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,'2026-3','Otoño 2026','2026-09-01','2026-12-31') RETURNING id",[tenant])).rows[0].id as string;
 const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,'ALG','Álgebra institucional',6) RETURNING id",[tenant])).rows[0].id as string;
 const section=(await sql.query("INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,'SYS-101',30) RETURNING id",[tenant,term,course])).rows[0].id as string;
 const otherSection=(await sql.query("INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,'SYS-202',30) RETURNING id",[tenant,term,course])).rows[0].id as string;
 const hash=await argon2.hash(portalPassword,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 async function actor(role:string){
  const username='vn-'+role+'-'+randomUUID().slice(0,8);
  const person=(await sql.query("INSERT INTO people(first_name,last_name,email,phone) VALUES('Persona','Sintética','private@example.test','private-phone') RETURNING id")).rows[0].id;
  const id=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id as string;
  const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,id])).rows[0].id as string;
  const grant=(await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2) RETURNING id',[member,role])).rows[0].id as string;
  if(role==='admin')await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[id,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',id)]);
  const token=randomBytes(32).toString('base64url');
  const session=(await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at,step_up_at) VALUES($1,$2,now()+interval '1 hour',$3,$3) RETURNING id",[id,createHash('sha256').update(token).digest('hex'),role==='admin'?new Date():null])).rows[0].id as string;
  return {id,member,grant,session,username,cookie:'siii_session='+token};
 }
 const student=await actor('student'),secondStudent=await actor('student'),teacher=await actor('teacher'),secondTeacher=await actor('teacher'),admin=await actor('admin'),guest=await actor('guest');
 async function studentRecord(member:string,name:string){
  const id=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,$3,$4,'Sintético') RETURNING id",[tenant,program,'MAT-'+randomUUID().slice(0,8),name])).rows[0].id as string;
  await sql.query('INSERT INTO student_account_links(institution_id,membership_id,student_id) VALUES($1,$2,$3)',[tenant,member,id]);
  return id;
 }
 const studentId=await studentRecord(student.member,'Alumna propia'),secondStudentId=await studentRecord(secondStudent.member,'Alumno ajeno');
 await sql.query('INSERT INTO section_enrollments(institution_id,section_id,student_id) VALUES($1,$2,$3),($1,$2,$4)',[tenant,section,studentId,secondStudentId]);
 const teacherId=(await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name,institutional_email) VALUES($1,$2,'Docente oficial','Asignado','private-teacher@example.test') RETURNING id",[tenant,'EMP'+suffix])).rows[0].id as string;
 await sql.query('INSERT INTO teacher_account_links(institution_id,membership_id,teacher_id) VALUES($1,$2,$3)',[tenant,teacher.member,teacherId]);
 await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[tenant,section,teacherId]);
 const campus=(await sql.query("INSERT INTO campuses(institution_id,code,name) VALUES($1,'CENTRAL','Campus central') RETURNING id",[tenant])).rows[0].id as string;
 const room=(await sql.query("INSERT INTO classrooms(institution_id,campus_id,code,building,capacity) VALUES($1,$2,'A-101','Edificio A',40) RETURNING id",[tenant,campus])).rows[0].id as string;
 const pattern=(await sql.query('INSERT INTO schedule_patterns(institution_id,section_id,room_id,weekday,start_minute,end_minute) VALUES($1,$2,$3,1,480,540) RETURNING id',[tenant,section,room])).rows[0].id as string;
 await sql.query("INSERT INTO class_occurrences(institution_id,section_id,pattern_id,on_date) VALUES($1,$2,$3,'2026-10-26')",[tenant,section,pattern]);
 const component=(await sql.query("INSERT INTO assessment_components(institution_id,section_id,code,title,weight) VALUES($1,$2,'FINAL','Evaluación final',100) RETURNING id",[tenant,section])).rows[0].id as string;
 await sql.query('INSERT INTO assessment_scores(institution_id,component_id,student_id,score_hundredths,updated_by) VALUES($1,$2,$3,999,$4)',[tenant,component,studentId,teacher.id]);
 const publication=(await sql.query('INSERT INTO grade_publications(institution_id,section_id,operation_id,published_by) VALUES($1,$2,$3,$4) RETURNING id',[tenant,section,randomUUID(),teacher.id])).rows[0].id as string;
 await sql.query('INSERT INTO final_grades(institution_id,publication_id,student_id,score_hundredths) VALUES($1,$2,$3,850),($1,$2,$4,700)',[tenant,publication,studentId,secondStudentId]);
 const fee=(await sql.query("INSERT INTO financial_fee_types(institution_id,code,name,default_amount_cents) VALUES($1,'REINS','Reinscripción',10000) RETURNING id",[tenant])).rows[0].id as string;
 async function order(payer=studentId){return (await sql.query('INSERT INTO payment_orders(institution_id,order_number,fee_type_id,payer_student_id,total_amount_cents) VALUES($1,$2,$3,$4,10000) RETURNING id',[tenant,'ORD-'+randomUUID(),fee,payer])).rows[0].id as string;}
 const orderId=await order(),otherOrderId=await order(secondStudentId);
 return {tenant,other,program,term,course,section,otherSection,student,secondStudent,teacher,secondTeacher,admin,guest,studentId,secondStudentId,teacherId,pattern,component,publication,fee,orderId,otherOrderId,order,actor};
}
