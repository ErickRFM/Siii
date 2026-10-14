import 'server-only';
import { createHash,timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const error=(code:string,status:number)=>NextResponse.json({error:{code}},{status,headers:{'Cache-Control':'no-store'}});

/** One configured institution per S2S credential until IntegrationClient registry is implemented. */
export function authorizeCompanion(req:NextRequest):{institutionId:string}|NextResponse {
 const institutionId=process.env.SIII_COMPANERO_INSTITUTION_ID;
 const sha=process.env.SIII_COMPANERO_TOKEN_SHA256;
 if(!institutionId||!z.uuid().safeParse(institutionId).success||!sha||!/^[0-9a-f]{64}$/i.test(sha)){
  return error('INTEGRATION_NOT_CONFIGURED',503);
 }
 const auth=req.headers.get('authorization')??'';
 if(!/^Bearer [A-Za-z0-9_-]{32,512}$/.test(auth))return error('UNAUTHENTICATED',401);
 const actual=createHash('sha256').update(auth.slice(7)).digest();
 const expected=Buffer.from(sha,'hex');
 if(expected.length!==actual.length||!timingSafeEqual(actual,expected))return error('UNAUTHENTICATED',401);
 return {institutionId};
}
