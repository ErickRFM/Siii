import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '@/infrastructure/database';
describe('database pool boundary',()=>{
 it('bounds acquisition and idle time instead of waiting indefinitely',()=>{
  expect(pool.options.connectionTimeoutMillis).toBeGreaterThan(0);
  expect(pool.options.connectionTimeoutMillis).toBeLessThanOrEqual(5000);
  expect(pool.options.idleTimeoutMillis).toBeGreaterThan(0);
 });
 it('handles errors from idle clients',()=>{expect(pool.listenerCount('error')).toBeGreaterThan(0)});
 afterAll(async()=>{await pool.end()});
});
