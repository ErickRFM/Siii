import {describe,it,expect} from 'vitest';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {readReleaseMigrations,releaseDefinitionHash} from '../../db/release-profile';

describe('versioned managed PostgreSQL migration profile',()=>{
 it('keeps canonical history unchanged and records the actually executed compatibility SQL',()=>{
  const canonical=readMigrationFiles({migrationsFolder:'db/migrations'}),managed=readReleaseMigrations('supabase-v1');
  expect(managed).toHaveLength(canonical.length);
  for(let index=0;index<canonical.length;index++){
   expect(managed[index].folderMillis).toBe(canonical[index].folderMillis);
   if(index===2){expect(managed[index].hash).not.toBe(canonical[index].hash);expect(managed[index].sql.join('')).toContain('REVOKE USAGE ON SCHEMA public FROM PUBLIC,anon,authenticated')}
   else if(index===3){expect(managed[index].hash).not.toBe(canonical[index].hash);expect(managed[index].sql.join('')).toContain('IF state.rolsuper');expect(managed[index].sql.join('')).toContain('UNSAFE_DATABASE_ROLE')}
   else if(index===4){expect(managed[index].hash).not.toBe(canonical[index].hash);expect(managed[index].sql.join('')).toContain("name <> 'supabase_admin'")}
   else expect(managed[index]).toEqual(canonical[index]);
  }
  expect(releaseDefinitionHash('supabase-v1')).toMatch(/^[a-f0-9]{64}$/);
 });
 it('rejects an unknown release rather than silently choosing SQL',()=>{
  expect(()=>readReleaseMigrations('unknown')).toThrow('MIGRATION_PROFILE_INVALID');
 });
});
