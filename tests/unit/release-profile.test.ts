import {describe,it,expect} from 'vitest';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {readReleaseMigrations,releaseDefinitionHash,releaseAppendixHash} from '../../db/release-profile';

describe('versioned managed PostgreSQL migration profile',()=>{
 it('keeps canonical history unchanged and records the actually executed compatibility SQL',()=>{
  const canonical=readMigrationFiles({migrationsFolder:'db/migrations'}),managed=readReleaseMigrations('supabase-v1');
  expect(managed).toHaveLength(canonical.length);
  for(let index=0;index<canonical.length;index++){
   expect(managed[index].folderMillis).toBe(canonical[index].folderMillis);
   if(index===2){expect(managed[index].hash).not.toBe(canonical[index].hash);expect(managed[index].sql.join('')).toContain('REVOKE USAGE ON SCHEMA public FROM PUBLIC,anon,authenticated')}
   else if(index===3){expect(managed[index].hash).not.toBe(canonical[index].hash);expect(managed[index].sql.join('')).toContain('IF state.rolsuper');expect(managed[index].sql.join('')).toContain('UNSAFE_DATABASE_ROLE')}
   else if(index===4){expect(managed[index].hash).not.toBe(canonical[index].hash);expect(managed[index].sql.join('')).toContain("name <> 'supabase_admin'")}
   else if(index===17){expect(managed[index].hash).toBe('68b2b137783f9523b28908594675cd2b70685163208f7caec4fb3f7052c6e296');expect(managed[index].sql.join('')).toContain('DATA_API_SCHEMA_PATH_UNSAFE');expect(managed[index].hash).not.toBe(canonical[index].hash)}
   else expect(managed[index]).toEqual(canonical[index]);
  }
  expect(releaseDefinitionHash('supabase-v1')).toBe('fbabc793547e0d533188444e4d4e00fdca0aa310d2fab52b520eb2b9640a43ed');expect(releaseAppendixHash()).toMatch(/^[a-f0-9]{64}$/);
 });
 it('rejects an unknown release rather than silently choosing SQL',()=>{
  expect(()=>readReleaseMigrations('unknown')).toThrow('MIGRATION_PROFILE_INVALID');
 });
});
