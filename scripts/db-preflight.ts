/**
 * Read-only structural preflight. Never applies migrations or logs DATABASE_URL.
 * Run against staging before promoting a new academic schema to Supabase production.
 */
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const required=[
 'institutions','campuses','academic_terms','people','platform_users',
 'institution_memberships','role_assignments','auth_sessions','security_audit_log',
 'academic_programs','academic_courses','curriculum_versions',
];
async function main(){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required but never printed');
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,max:1});
 try{
  const result=await pool.query<{table_name:string}>(`
   SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_type='BASE TABLE'
  `);
  const actual=new Set(result.rows.map(row=>row.table_name));
  const missing=required.filter(table=>!actual.has(table));
  const ledgers=await pool.query<{
   supabase_ledger:string|null;drizzle_ledger:string|null;
  }>(`SELECT to_regclass('supabase_migrations.schema_migrations')::text AS supabase_ledger,
    to_regclass('drizzle.__drizzle_migrations')::text AS drizzle_ledger`);
  const grants=await pool.query<{table_name:string;grantee:string;privilege_type:string}>(`
   SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants
   WHERE table_schema='public'
     AND table_name=ANY($1::text[])
     AND grantee IN ('anon','authenticated','PUBLIC')
   ORDER BY table_name,grantee,privilege_type
  `,[required]);
  const raw=JSON.parse(await readFile(new URL('../db/migrations/meta/_journal.json',import.meta.url),'utf8')) as {
   entries?:{idx:number;tag:string}[];
  };
  const ledger=ledgers.rows[0];
  const drift=!!ledger?.supabase_ledger&&!ledger.drizzle_ledger;
  const report={
   kind:'SIII_READONLY_DATABASE_PREFLIGHT',at:new Date().toISOString(),
   requiredTables:required.length,missingTables:missing,
   journalMigrations:raw.entries?.map(x=>x.tag)??[],
   supabaseLedgerPresent:!!ledger?.supabase_ledger,
   drizzleLedgerPresent:!!ledger?.drizzle_ledger,
   mixedLedgerRequiresReconciliation:drift,
   directApiGrants:grants.rows,
   nextAction:drift?'Reconcile ledger in isolated staging; DO NOT run db:migrate on production':
    'Verify backup, staging rehearsal and deployment approval before migration',
  };
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(missing.length||grants.rows.length||drift)process.exitCode=2;
 }finally{await pool.end()}
}
main().catch((e:unknown)=>{console.error('Database preflight failed:',e instanceof Error?e.message:'unknown');process.exitCode=1});
