import {describe,it,expect} from 'vitest';import {databaseConnectionOptions} from '../../src/infrastructure/database/connection-options';
describe('verified database TLS configuration',()=>{
 it('passes a server-only CA without letting URL sslmode override verification',()=>{const result=databaseConnectionOptions('postgresql://user:secret@db.example.test/postgres?sslmode=require','PUBLIC-CA');expect(result.ssl).toEqual({ca:'PUBLIC-CA',rejectUnauthorized:true});expect(result.connectionString).not.toContain('sslmode');expect(result.connectionString).toContain('db.example.test')});
 it('keeps local disposable PostgreSQL connections available without SSL',()=>{expect(databaseConnectionOptions('postgresql://user:secret@127.0.0.1/test')).toEqual({connectionString:'postgresql://user:secret@127.0.0.1/test'})});
 it('rejects a request to disable TLS when a trusted CA is configured',()=>{expect(()=>databaseConnectionOptions('postgresql://user:secret@db.example.test/postgres?sslmode=disable','PUBLIC-CA')).toThrow('DATABASE_TLS_CONFIGURATION_INVALID')});
});
