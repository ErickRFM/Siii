import { describe,it,expect,afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { authorizeCompanion } from '@/integrations/companion/guard';
const oldId=process.env.SIII_COMPANERO_INSTITUTION_ID;
const oldHash=process.env.SIII_COMPANERO_TOKEN_SHA256;
const institutionId='a84b0d45-a3a0-4fe3-ab73-71ed9779848d';
const token='C3x5N2Pq6Ks4Uy7Ax8Jf9Dg0Vt1Ym5Rc2Gb8Ph6Sk3Q';
const request=(credential?:string)=>new NextRequest('https://siii.example.test/api/integrations/companion/v1/teachers',{
 headers:credential?{authorization:'Bearer '+credential}:{}
});
afterEach(()=>{
 if(oldId===undefined)delete process.env.SIII_COMPANERO_INSTITUTION_ID;else process.env.SIII_COMPANERO_INSTITUTION_ID=oldId;
 if(oldHash===undefined)delete process.env.SIII_COMPANERO_TOKEN_SHA256;else process.env.SIII_COMPANERO_TOKEN_SHA256=oldHash;
});
describe('Siii→Compañero S2S authentication',()=>{
 it('fails closed without verified environment configuration',()=>{
  delete process.env.SIII_COMPANERO_INSTITUTION_ID;delete process.env.SIII_COMPANERO_TOKEN_SHA256;
  expect(authorizeCompanion(request(token))).toBeInstanceOf(NextResponse);
 });
 it('accepts the expected token only in the configured institution',()=>{
  process.env.SIII_COMPANERO_INSTITUTION_ID=institutionId;
  process.env.SIII_COMPANERO_TOKEN_SHA256=createHash('sha256').update(token).digest('hex');
  expect(authorizeCompanion(request(token))).toEqual({institutionId});
  expect(authorizeCompanion(request(token.slice(0,-1)+'Z'))).toBeInstanceOf(NextResponse);
  expect(authorizeCompanion(request())).toBeInstanceOf(NextResponse);
 });
 it('rejects malformed institution scoping even with valid token',()=>{
  process.env.SIII_COMPANERO_INSTITUTION_ID='any';
  process.env.SIII_COMPANERO_TOKEN_SHA256=createHash('sha256').update(token).digest('hex');
  expect(authorizeCompanion(request(token))).toBeInstanceOf(NextResponse);
 });
});
