import {describe,expect,it} from 'vitest';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';

const protectedTables=[
 'admission_cycles','applicant_profiles','admission_applications',
 'admission_documents','admission_decisions','student_account_links',
 'student_claim_requests','financial_fee_types','payment_orders',
 'payment_transactions','financial_waivers',
];

describe('new admissions, identity and finance tables retain backend-only access',()=>{
 it('forces RLS, denies Data API DML, and assigns a nonruntime owner for every new table',async()=>{
  const client=new pg.Client({connectionString:isolatedDatabaseUrl()});
  await client.connect();
  try{
   const {rows}=await client.query(`
    SELECT c.relname, c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
      pg_get_userbyid(c.relowner) AS owner,
      has_table_privilege('siii_app',c.oid,'SELECT') AS app_read,
      has_table_privilege('siii_app',c.oid,'INSERT') AS app_insert,
      has_table_privilege('siii_app',c.oid,'UPDATE') AS app_update,
      has_table_privilege('siii_app',c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES') AS app_unsafe,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='new_modules_backend_access' AND p.polpermissive) AS app_policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind='r'
    ORDER BY c.relname`,[protectedTables]);
   expect(rows).toHaveLength(protectedTables.length);
   for(const row of rows){
    expect(row).toMatchObject({
     rls:true,forced:true,owner:'siii_migrator',
     app_read:true,app_insert:true,app_update:true,app_unsafe:false,app_policies:1,
    });
    for(const role of ['anon','authenticated']){
     const result=await client.query(
       'SELECT has_table_privilege($1,$2::regclass,\'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER\') AS any',
       [role,'public.'+row.relname],
     );
     expect(result.rows[0].any).toBe(false);
    }
   }
   await client.query('SET ROLE siii_app');
   try{await expect(client.query('SELECT id FROM public.applicant_profiles LIMIT 1')).resolves.toHaveProperty('rows');}
   finally{await client.query('RESET ROLE');}
  }finally{await client.end();}
 },15000);
});
