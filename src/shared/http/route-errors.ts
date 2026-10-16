import type {NextRequest} from 'next/server';
import {jsonError} from '@/shared/auth/guards';
import {logger} from '@/shared/logging';
import {assertApplicationRole} from '@/infrastructure/database';
import {requestId} from './request-context';
export function withErrors<A extends [NextRequest,...unknown[]],R>(handler:(...args:A)=>Promise<R>){
 return async(...args:A)=>{
  try{await assertApplicationRole();return await handler(...args);}
  catch(error){
   if(error instanceof Error&&error.message==='DATABASE_ROLE_UNSAFE')return jsonError('DATABASE_ROLE_UNSAFE',503);
   logger.error({requestId:requestId(args[0].headers),code:'REQUEST_FAILED'},'Request failed');
   return jsonError('INTERNAL_ERROR',500);
  }
 };
}
