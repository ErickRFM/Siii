import {describe,it,expect} from 'vitest';
import {managedReleaseSql} from '../../scripts/managed-release-sql';
describe('connector managed release',()=>{
 it('requires a complete encrypted-backup row fingerprint for the official production transport',()=>{expect(()=>managedReleaseSql()).toThrow('PRODUCTION_BACKUP_GUARD_REQUIRED');expect(()=>managedReleaseSql({expectedRows:{}})).toThrow('BACKUP_ROW_GUARD_INVALID')});
 it('binds a baseline signature, actual hashes, lock and profile to one transaction',()=>{const sql=managedReleaseSql({database:'p0_test',actor:'test'});expect(sql).toContain('pg_advisory_xact_lock');expect(sql).toContain('BASELINE_SCHEMA_DRIFT');expect(sql).toContain('MIGRATION_LEDGER_DRIFT');expect(sql).toContain('MIGRATION_PROFILE_DRIFT');expect(sql).toContain('RELEASE_ACTOR_UNSAFE');expect(sql.startsWith('BEGIN;')).toBe(true);expect(sql.trim().endsWith('COMMIT;')).toBe(true)});
});
