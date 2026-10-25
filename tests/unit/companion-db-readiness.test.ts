import {describe,expect,it} from 'vitest';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {readReleaseMigrations,releaseAppendixHash,releaseDefinitionHash} from '../../db/release-profile';
import {validateCompanionProductionLedger,assertCompanionLocalEndpoint} from '../../scripts/companion-db-readiness';
function observation(){return {ledger:readReleaseMigrations('supabase-v1').slice(0,18).map(row=>({hash:row.hash,created_at:row.folderMillis})),profile:[{profile:'supabase-v1',definition_hash:releaseDefinitionHash('supabase-v1')}],appendix:[{name:'schema-isolation-v1',definition_hash:releaseAppendixHash()}]};}
describe('Companion production migration preparation gates',()=>{
 it('identifies only 0018 through 0025 after the exact managed ledger prefix',()=>{
  const result=validateCompanionProductionLedger(observation());expect(result.applied).toBe(18);expect(result.pending.map(row=>row.index)).toEqual([18,19,20,21,22,23,24,25]);expect(result.pending[0].tag).toBe('0018_academic_section_outbox');expect(result.pending.at(-1)?.tag).toBe('0025_financial_payer_tenants');
 });
 it('rejects canonical 0017 in place of the executed compatibility hash',()=>{const value=observation();value.ledger[17].hash=readMigrationFiles({migrationsFolder:'db/migrations'})[17].hash;expect(()=>validateCompanionProductionLedger(value)).toThrow('COMPANION_PRODUCTION_LEDGER_DRIFT');});
 it('rejects changed timestamps, missing ledger rows and altered release metadata',()=>{
  const timestamp=observation();timestamp.ledger[3].created_at++;expect(()=>validateCompanionProductionLedger(timestamp)).toThrow('COMPANION_PRODUCTION_LEDGER_DRIFT');
  const prefix=observation();prefix.ledger.pop();expect(()=>validateCompanionProductionLedger(prefix)).toThrow('COMPANION_PRODUCTION_PREFIX_CHANGED');
  const profile=observation();profile.profile[0].definition_hash='0'.repeat(64);expect(()=>validateCompanionProductionLedger(profile)).toThrow('COMPANION_RELEASE_PROFILE_DRIFT');
  const appendix=observation();appendix.appendix=[];expect(()=>validateCompanionProductionLedger(appendix)).toThrow('COMPANION_RELEASE_APPENDIX_DRIFT');
 });
 it('allows rehearsal exclusively on its loopback port and reserved database names',()=>{
  expect(()=>assertCompanionLocalEndpoint('postgresql://postgres@127.0.0.1:55439/postgres',true)).not.toThrow();expect(()=>assertCompanionLocalEndpoint('postgresql://postgres@127.0.0.1:55439/p0_companion_rehearsal_abcd')).not.toThrow();
  for(const raw of ['postgresql://postgres@127.0.0.1:55439/siii_ui_test','postgresql://postgres@127.0.0.1:5432/p0_companion_rehearsal_abcd','postgresql://postgres@db.kkjzbqsaummyralqjqrb.supabase.co:5432/postgres','postgresql://postgres@127.0.0.1:55439/p0_companion_rehearsal_abcd?options=-csearch_path%3Dpublic'])expect(()=>assertCompanionLocalEndpoint(raw)).toThrow('COMPANION_LOCAL_REHEARSAL_ONLY');
 });
});
