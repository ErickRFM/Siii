import { afterAll,describe,it,expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db,pool } from '@/infrastructure/database';
describe('Postgres foundation',()=>{
 it('runs real SQL',async()=>{const result=await db.execute(sql`SELECT 1 AS ok`);expect(result.rows[0]).toHaveProperty('ok',1)});
 it('has institutional membership schema',async()=>{
  const res=await db.execute(sql`SELECT to_regclass('public.institution_memberships') AS table_name`);
  expect(res.rows[0]?.table_name).toBe('institution_memberships');
 });
 afterAll(async()=>{await pool.end()});
});
