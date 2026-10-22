import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {isolatedDatabaseUrl} from './database-url';
import {seedFinancialBaseline24} from './financial-tenant-database';
import httpSetup from './http-setup';

/** Dedicated Vitest process/config: never a second server inside the global suite. */
export default async function setup(){
 const source=new URL(isolatedDatabaseUrl());
 const admin=new pg.Client({connectionString:source.href});await admin.connect();
 const name='siii_financial_fk_legacy_'+randomUUID().replaceAll('-','').slice(0,12)+'_test';
 await admin.query('CREATE DATABASE '+pg.escapeIdentifier(name));
 const url=new URL(source);url.pathname='/'+name;
 const client=new pg.Client({connectionString:url.href});await client.connect();
 // httpSetup intentionally mutates worker/child fixture environment and two fixed
 // files. Restore all of them even on startup failure; never print their contents.
 const keys=['DATABASE_URL','INTEGRATION_DATABASE_URL','SIII_MFA_KEYS','SIII_MFA_ACTIVE_KEY_ID','SIII_INVITATION_KEYS','SIII_INVITATION_ACTIVE_KEY_ID','SIII_PASSWORD_RESET_KEYS','SIII_PASSWORD_RESET_ACTIVE_KEY_ID','SIII_COMPANERO_INSTITUTION_ID','SIII_COMPANERO_TEST_TOKEN','SIII_COMPANERO_TOKEN_SHA256','SIII_APPLICANT_EMAIL_KEYS','SIII_APPLICANT_EMAIL_ACTIVE_KEY_ID','SIII_PUBLIC_ORIGIN'];
 const environment=new Map(keys.map(key=>[key,process.env[key]]));
 const files=['.superpowers/sdd/2026-10-13-p0-hardening/app-connection.json','.superpowers/sdd/2026-10-13-p0-hardening/http-server.log'];
 const previous=new Map(files.map(file=>[file,existsSync(file)?readFileSync(file):undefined]));
 function restore(){
  for(const[key,value]of environment){if(value===undefined)delete process.env[key];else process.env[key]=value}
  for(const[file,value]of previous){if(value===undefined){if(existsSync(file))unlinkSync(file)}else writeFileSync(file,value)}
 }
 async function cleanup(){
  try{await client.end();await admin.query('DROP DATABASE '+pg.escapeIdentifier(name))}
  finally{restore();await admin.end()}
 }
 let stop:(()=>Promise<void>)|undefined;
 try{
  await seedFinancialBaseline24(client);
  process.env.DATABASE_URL=url.href;process.env.INTEGRATION_DATABASE_URL=url.href;
  stop=await httpSetup();
 }catch(error){await cleanup();throw error}
 return async()=>{try{await stop?.()}finally{await cleanup()}};
}
