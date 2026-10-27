import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const tables=['institutional_students','institutional_teachers','academic_sections','section_enrollments','section_teachers','teacher_account_links','assessment_components','assessment_scores','grade_publications','final_grades','classrooms','schedule_patterns','class_occurrences','institutional_announcements','student_service_requests','tutoring_cases','institutional_workshops','workshop_enrollments'];
describe('consolidated academic runtime security',()=>{
 beforeAll(async()=>{await sql.connect()});afterAll(async()=>{await sql.end()});
 it.each(tables)('%s has forced RLS, denied API roles and minimal runtime grants',async table=>{
  const row=(await sql.query(`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner,has_table_privilege('siii_app',oid,'SELECT,INSERT,UPDATE') AS runtime,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'SELECT') AS authenticated FROM pg_class WHERE oid=$1::regclass`,[table])).rows[0];
  expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'siii_migrator',runtime:true,anon:false,authenticated:false});
  await sql.query('BEGIN');try{await sql.query('SET LOCAL ROLE siii_app');await expect(sql.query('SELECT id FROM '+table+' LIMIT 1')).resolves.toBeDefined()}finally{await sql.query('ROLLBACK')}
 });
});
