import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {buildApplicationBackupSql,createApplicationBackupPlan,validateApplicationCapture, type ApplicationBackupMetadata} from '../../scripts/application-backup';

const signature=JSON.parse(readFileSync('db/baseline/0001-schema.json','utf8'));
function metadata():ApplicationBackupMetadata {
 const names=[...new Set<string>(signature.columns.map((c:{table_name:string})=>c.table_name))].sort();
 return {signature,tables:[...names.map(name=>({schema:'public',name,columns:signature.columns.filter((c:{table_name:string})=>c.table_name===name).map((c:{column_name:string})=>c.column_name),primaryKey:['id']})),{schema:'drizzle',name:'__drizzle_migrations',columns:['id','hash','created_at'],primaryKey:['id']}],ledger:readMigrationFiles({migrationsFolder:'db/migrations'}).slice(0,2).map((m,i)=>({id:i+1,hash:m.hash,created_at:String(m.folderMillis)})),release_profile:[],release_appendix:[],pgcrypto_schema:'extensions',unsupported:0};
}
const publicKey='-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nYWJj\n-----END PGP PUBLIC KEY BLOCK-----';
const sourceProject='kkjzbqsaummyralqjqrb';
describe('application recovery capture boundary',()=>{
 it('constructs encrypted read-only capture for a complete canonical prefix',()=>{
  const plan=createApplicationBackupPlan(metadata(),sourceProject);
  const sql=buildApplicationBackupSql({plan,publicKey,recipientKeyId:'AABBCCDDEEFF0011'});
  expect(plan.profile).toBe('canonical');
  expect(sql).toContain('REPEATABLE READ READ ONLY');
  expect(sql).toContain('"extensions".pgp_pub_encrypt');
  expect(sql).toContain('ciphertext_base64');
  expect(sql).toContain('ciphertext_sha256');
  expect(sql.replace(/'(?:[^']|'')*'/g,"''")).not.toMatch(/\b(CREATE|INSERT|UPDATE|DELETE|COPY)\b/i);
 });
 it.each(['unknown','prod','abcdefghijklmnopqrst'])('rejects unrecognized source project %s',project=>{
  expect(()=>createApplicationBackupPlan(metadata(),project)).toThrow('BACKUP_PROJECT_INVALID');
 });
 it('rejects incomplete table manifests even when the remaining names are valid',()=>{
  const input=metadata();input.tables=input.tables.filter(t=>t.name!=='people');
  expect(()=>createApplicationBackupPlan(input,sourceProject)).toThrow('BACKUP_TABLE_SET_MISMATCH');
 });
 it('rejects omitted columns, invalid PKs and unsafe identifiers',()=>{
  for(const mutate of [(m:ApplicationBackupMetadata)=>m.tables[0].columns.pop(),(m:ApplicationBackupMetadata)=>m.tables[0].primaryKey=['missing'],(m:ApplicationBackupMetadata)=>m.tables[0].name='bad"; SELECT 1']){
   const input=metadata();mutate(input);expect(()=>createApplicationBackupPlan(input,sourceProject)).toThrow();
  }
 });
 it('rejects reordered, truncated or forged migration prefixes and unknown profiles',()=>{
  for(const mutate of [(m:ApplicationBackupMetadata)=>m.ledger.reverse(),(m:ApplicationBackupMetadata)=>m.ledger.shift(),(m:ApplicationBackupMetadata)=>m.ledger[0].hash='a'.repeat(64),(m:ApplicationBackupMetadata)=>m.release_profile=[{singleton:true,profile:'unknown',definition_hash:'a'.repeat(64),registered_at:'2026-10-27T00:00:00Z'}]]){
   const input=metadata();mutate(input);expect(()=>createApplicationBackupPlan(input,sourceProject)).toThrow();
  }
 });
 it('accepts primary keys other than id and orders ciphertext payload rows by that key',()=>{
  const input=metadata();input.signature=structuredClone(input.signature);
  input.signature.columns.push({table_name:'auth_throttle',column_name:'key',ordinal_position:1});
  input.signature.constraints.push({table_name:'auth_throttle',name:'auth_throttle_pkey',definition:'PRIMARY KEY (key)'});
  input.tables.push({schema:'public',name:'auth_throttle',columns:['key'],primaryKey:['key']});
  const sql=buildApplicationBackupSql({plan:createApplicationBackupPlan(input,sourceProject),publicKey,recipientKeyId:'AABBCCDDEEFF0011'});
  expect(sql).toContain('ORDER BY t."key"');
 });
 it('rejects private key armor and arbitrary crypto schemas',()=>{
  const plan=createApplicationBackupPlan(metadata(),sourceProject);
  expect(()=>buildApplicationBackupSql({plan,publicKey:publicKey.replaceAll('PUBLIC','PRIVATE'),recipientKeyId:'AABBCCDDEEFF0011'})).toThrow('BACKUP_PUBLIC_KEY_REQUIRED');
  plan.pgcrypto_schema='malicious';expect(()=>buildApplicationBackupSql({plan,publicKey,recipientKeyId:'AABBCCDDEEFF0011'})).toThrow();
 });
 it('rejects corrupted ciphertext before accepting recovery evidence',()=>{
  expect(()=>validateApplicationCapture({ciphertext_base64:'YWJj',ciphertext_sha256:'0'.repeat(64),recipient_key_id:'AABBCCDDEEFF0011',manifest:{} as never},'AABBCCDDEEFF0011')).toThrow('BACKUP_CIPHERTEXT_CHECKSUM_MISMATCH');
 });
});
