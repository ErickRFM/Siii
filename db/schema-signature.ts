import pg from 'pg';
export const SCHEMA_SIGNATURE_SQL = `
 SELECT jsonb_build_object(
  'columns',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name,x.ordinal_position) FROM (
   SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
   FROM information_schema.columns WHERE table_schema='public'
  ) x),'[]'::jsonb),
  'constraints',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name,x.name) FROM (
   SELECT c.relname AS table_name,k.conname AS name,pg_get_constraintdef(k.oid) AS definition
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public'
  ) x),'[]'::jsonb),
  'indexes',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.tablename,x.indexname) FROM (
   SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
  ) x),'[]'::jsonb),
  'enums',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.typname,x.enumsortorder) FROM (
   SELECT t.typname,e.enumsortorder,e.enumlabel FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
   JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public'
  ) x),'[]'::jsonb)
 ) AS signature
 `;
export async function schemaSignature(client: pg.Client | pg.PoolClient) {
 const result=await client.query<{signature:unknown}>(SCHEMA_SIGNATURE_SQL);
 return result.rows[0].signature;
}
