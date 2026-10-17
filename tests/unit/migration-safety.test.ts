import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
function migrate(env: Record<string,string|undefined>) {
  const result=spawnSync(process.execPath,['--import','tsx','db/migrate.ts'],{
<<<<<<< HEAD
    env:{...process.env,DATABASE_URL:'postgresql://test:placeholder@127.0.0.1:1/test',SIII_DATABASE_ENV:undefined,SIII_ALLOW_PRODUCTION_MIGRATIONS:undefined,...env},
=======
    env:{...process.env,DATABASE_URL:'postgresql://test:placeholder@127.0.0.1:1/test',SIII_DATABASE_ENV:undefined,...env},
>>>>>>> integrate/sii-v1
    encoding:'utf8',timeout:10000,windowsHide:true
  });
  return {status:result.status,output:result.stdout+result.stderr};
}
describe('migration environment gate',()=>{
<<<<<<< HEAD
  it('rejects production without explicit authorization before connecting',()=>{
    const r=migrate({NODE_ENV:'production',SIII_DATABASE_ENV:'production',
      DATABASE_URL:'postgresql://postgres.kkjzbqsaummyralqjqrb:placeholder@127.0.0.1:1/postgres'});
    expect(r.status).toBe(1);expect(r.output).toContain('PRODUCTION_MIGRATION_NOT_AUTHORIZED');
    expect(r.output).not.toContain('ECONNREFUSED');
  });
  it('does not allow a production target mislabeled as test',()=>{
    const r=migrate({NODE_ENV:'test',SIII_DATABASE_ENV:'test',
      DATABASE_URL:'postgresql://postgres.kkjzbqsaummyralqjqrb:placeholder@127.0.0.1:1/postgres'});
    expect(r.status).toBe(1);expect(r.output).toContain('PRODUCTION_MIGRATION_NOT_AUTHORIZED');
  });
=======
  it('rejects production before connecting',()=>{
    const r=migrate({NODE_ENV:'production',SIII_DATABASE_ENV:'test'});
    expect(r.status).toBe(1);expect(r.output).toContain('PRODUCTION_MIGRATION_FORBIDDEN');
    expect(r.output).not.toContain('ECONNREFUSED');
  });
>>>>>>> integrate/sii-v1
  it('requires a declared isolated environment',()=>{
    const r=migrate({NODE_ENV:'development'});
    expect(r.status).toBe(1);expect(r.output).toContain('DATABASE_ENV_REQUIRED');
  });
  it('requires an explicit connection URL',()=>{
    const r=migrate({NODE_ENV:'test',SIII_DATABASE_ENV:'test',DATABASE_URL:''});
    expect(r.status).toBe(1);expect(r.output).toContain('DATABASE_URL_REQUIRED');
  });
  it('never prints the connection secret on connection failure',()=>{
    const r=migrate({NODE_ENV:'test',SIII_DATABASE_ENV:'test'});
    expect(r.status).toBe(1);expect(r.output).not.toContain('placeholder');
  });
});
