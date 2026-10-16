import {it,expect} from 'vitest';
import {isolatedDatabaseUrl} from '../support/database-url';
import {validateMigrationEnvironment} from '../../db/migration-safety';
it.each(['host=example.invalid','user=postgres.kkjzbqsaummyralqjqrb','password=synthetic','database=live','dbname=live','port=5432','options=-crole%3Dpostgres','sslcert=local-file','sslmode=require&sslmode=disable'])('rejects driver URL overrides before connecting: %s',query=>{
 const url='postgresql://fixture:synthetic@127.0.0.1/isolated_test?'+query;
 expect(()=>isolatedDatabaseUrl({SIII_DATABASE_ENV:'test',DATABASE_URL:url})).toThrow('ISOLATED_TEST_DATABASE_REQUIRED');
 expect(()=>validateMigrationEnvironment({NODE_ENV:'test',SIII_DATABASE_ENV:'test',DATABASE_URL:url})).toThrow('INVALID_DATABASE_URL');
});
it('accepts reviewed connection parameters without changing the destination',()=>{
 const url='postgresql://fixture:synthetic@127.0.0.1/isolated_test?sslmode=require&application_name=test';
 expect(isolatedDatabaseUrl({SIII_DATABASE_ENV:'test',DATABASE_URL:url})).toBe(url);
 expect(validateMigrationEnvironment({NODE_ENV:'test',SIII_DATABASE_ENV:'test',DATABASE_URL:url})).toBe(url);
});
