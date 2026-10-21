import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const runner=resolve(process.cwd(),'scripts/companion-pilot-preflight.mjs');
const safeSecrets=()=>{
 const institutionId=randomUUID();
 return {
  SIII_ACADEMIC_OUTBOX_KEYS:JSON.stringify({'siii-pilot-1':randomBytes(32).toString('base64')}),
  SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID:'siii-pilot-1',
  SIII_COMPANION_DELIVERY_TARGETS_JSON:JSON.stringify({
   [institutionId]:{origin:'https://compa-ero-de-esc.onrender.com',keyId:'pilot-key',secretBase64:randomBytes(32).toString('base64')},
  }),
  CRON_SECRET:randomBytes(32).toString('hex'),
  SIII_ACADEMIC_OUTBOX_ENABLED:'false',
  SIII_COMPANION_DELIVERY_ENABLED:'false',
 };
};
const execute=(env:Record<string,string>,mode?:string)=>spawnSync(process.execPath,[runner,...(mode?[mode]:[])],{
 env:{NODE_ENV:'test',PATH:process.env.PATH??'',...env},
 encoding:'utf8',
 timeout:5000,
});

describe('Companion operator-side pilot configuration checker',()=>{
 it('checks valid secrets by format without displaying their values or activating them',()=>{
  const env=safeSecrets();
  const out=execute(env);
  expect(out.status).toBe(0);
  expect(out.stdout).toContain('apagada (segura)');
  expect(out.stdout).toContain('No se ha conectado');
  expect(out.stdout+out.stderr).not.toContain(env.CRON_SECRET);
  expect(out.stdout+out.stderr).not.toContain(JSON.parse(env.SIII_COMPANION_DELIVERY_TARGETS_JSON)[Object.keys(JSON.parse(env.SIII_COMPANION_DELIVERY_TARGETS_JSON))[0]].secretBase64);
 });
 it('does not claim the pilot is active without both enable flags',()=>{
  const out=execute(safeSecrets(),'--active');
  expect(out.status).toBe(1);
  expect(out.stderr).toContain('SIII_ACADEMIC_OUTBOX_ENABLED');
  expect(out.stderr).toContain('SIII_COMPANION_DELIVERY_ENABLED');
 });
 it('fails closed on insecure plain-HTTP tenant endpoint and truncated HMAC',()=>{
  const env=safeSecrets();
  const targets=JSON.parse(env.SIII_COMPANION_DELIVERY_TARGETS_JSON);
  const id=Object.keys(targets)[0];
  targets[id].origin='http://localhost:8080';
  targets[id].secretBase64='abc';
  const out=execute({...env,SIII_COMPANION_DELIVERY_TARGETS_JSON:JSON.stringify(targets)});
  expect(out.status).toBe(1);
  expect(out.stderr).toContain('SIII_COMPANION_DELIVERY_TARGETS_JSON');
 });
});
