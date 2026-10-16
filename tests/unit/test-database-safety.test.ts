import {describe,it,expect} from 'vitest';
import {isolatedDatabaseUrl} from '../support/database-url';
describe('destructive test fixture connection boundary',()=>{
 it('requires an explicit test environment',()=>{expect(()=>isolatedDatabaseUrl({DATABASE_URL:'postgresql://local@localhost/p0_empty'})).toThrow('ISOLATED_TEST_DATABASE_REQUIRED');});
 it('rejects remote fixture connections',()=>{expect(()=>isolatedDatabaseUrl({SIII_DATABASE_ENV:'test',INTEGRATION_DATABASE_URL:'postgresql://local@remote.example/siii_test'})).toThrow('LOCAL_HTTP_TEST_DATABASE_REQUIRED');});
 it('rejects an ordinary local database even if labeled test',()=>{expect(()=>isolatedDatabaseUrl({SIII_DATABASE_ENV:'test',DATABASE_URL:'postgresql://local@localhost/institution_live'})).toThrow('ISOLATED_TEST_DATABASE_REQUIRED');});
 it('selects the isolated URL when a runtime DATABASE_URL is also present',()=>{
  const local='postgresql://local@127.0.0.1:55432/p0_empty';
  expect(isolatedDatabaseUrl({SIII_DATABASE_ENV:'test',INTEGRATION_DATABASE_URL:local,DATABASE_URL:'postgresql://runtime@remote.example/live'})).toBe(local);
 });
});
