import {afterAll,describe,expect,it} from 'vitest';
import {existsSync,mkdtempSync,readFileSync,readdirSync,rmdirSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {parse} from 'yaml';

const file=resolve('.github/workflows/companion-delivery.yml'),directory=mkdtempSync(join(tmpdir(),'siii-companion-workflow-'));
afterAll(()=>{for(const name of readdirSync(directory))unlinkSync(join(directory,name));rmdirSync(directory);});
function workflow(){expect(existsSync(file)).toBe(true);return parse(readFileSync(file,'utf8'));}
function execute(secret:string,status='200',curlExit='0'){
 const step=workflow().jobs.delivery.steps[0],trace=join(directory,'curl-'+Math.random()+'.txt').replaceAll('\\','/');
 // Shell function replaces curl in the actual workflow script: no network.
 const observer='curl() { printf "%s\\n" "$@" > "$CURL_TRACE_FILE"; printf "%s" "$FAKE_HTTP_STATUS"; return "$FAKE_CURL_EXIT"; }\n';
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
 const result=spawnSync(bash,['--noprofile','--norc','-e','-o','pipefail','-s'],{input:observer+step.run,encoding:'utf8',env:{...process.env,SIII_CRON_SECRET:secret,CURL_TRACE_FILE:trace,FAKE_HTTP_STATUS:status,FAKE_CURL_EXIT:curlExit}});
 if(result.error)throw result.error;return {...result,arguments:existsSync(trace)?readFileSync(trace,'utf8').trim().split('\n'):[]};
}
describe('opt-in Companion delivery scheduler',()=>{
 it('requires an explicit true repository variable for both trigger types',()=>{
  const value=workflow();expect(value.on.schedule).toEqual([{cron:'*/5 * * * *'}]);expect(value.on.workflow_dispatch).toEqual({});
  const expression=value.jobs.delivery.if as string;
  const match=expression.match(/^\$\{\{\s*vars\.([A-Z_]+)\s*==\s*'([^']+)'\s*\}\}$/);expect(match).not.toBeNull();
  const enabled=(variables:Record<string,string>)=>variables[match![1]]===match![2];
  expect(enabled({})).toBe(false);expect(enabled({SIII_COMPANION_AUTOMATION_ENABLED:'false'})).toBe(false);expect(enabled({SIII_COMPANION_AUTOMATION_ENABLED:'true'})).toBe(true);
  expect(value.permissions).toEqual({});expect(value.concurrency['cancel-in-progress']).toBe(false);expect(value.jobs.delivery['timeout-minutes']).toBeLessThanOrEqual(3);
 });
 it('executes only one bounded request to the literal endpoint and discards the response body',()=>{
  const result=execute('synthetic-only-secret');expect(result.status).toBe(0);
  const args=result.arguments;expect(args).toContain('https://siii-three.vercel.app/api/internal/companion-snapshot-delivery');expect(args[args.indexOf('--max-time')+1]).toBe('110');expect(args[args.indexOf('--connect-timeout')+1]).toBe('10');expect(args[args.indexOf('--output')+1]).toBe('/dev/null');expect(args[args.indexOf('--retry')+1]).toBe('0');expect(args).not.toContain('--location');
  expect(result.stdout+result.stderr).not.toContain('synthetic-only-secret');expect(result.stdout+result.stderr).not.toContain('Bearer');
  for(const step of workflow().jobs.delivery.steps)if(step.uses)expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
 });
 it('fails closed without credentials and never invokes curl',()=>{
  const result=execute('');expect(result.status).toBe(1);expect(result.arguments).toEqual([]);expect(result.stdout+result.stderr).toContain('CRON_SECRET_MISSING');
 });
 it.each([['503','0'],['200','28']])('fails HTTP/transport errors without blind retries (%s/%s)',(status,exit)=>{
  const result=execute('synthetic-only-secret',status,exit);expect(result.status).toBe(1);expect(result.stdout+result.stderr).not.toContain('synthetic-only-secret');
 });
});
