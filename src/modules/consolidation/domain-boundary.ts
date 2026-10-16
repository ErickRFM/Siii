import 'server-only';
import type {NextRequest} from 'next/server';
import {db,assertApplicationRole} from '@/infrastructure/database';
import {lockInstitutionContext} from '@/shared/auth/write-access';
import {legacyAllows,type InstitutionAccess} from '@/shared/auth/institution-policy';
import type {Permission} from '@/shared/auth/roles';
import type {Transaction} from '@/shared/http/request-context';
import {gradeScopeAllows} from '@/modules/grading/teaching-scope';
import {jsonError} from '@/shared/auth/guards';
import {logger} from '@/shared/logging';
import {requestId} from '@/shared/http/request-context';
class DomainAccessDenied extends Error {}
export class DomainConflict extends Error {}
type Actor={identity:{id:string;sessionId:string};access:InstitutionAccess};
type Options={permission?:Permission;grade?:{sectionId:string;capability:'grades.manage'|'grades.publish'}};
/** All domain writers serialize against institutional/user administration and revalidate before commit. */
export async function domainTransaction<T>(actor:Actor,options:Options,work:(tx:Transaction)=>Promise<T>):Promise<T>{
 return db.transaction(async tx=>{
  async function check(){
   const critical=options.permission==='users.manage'||options.grade?.capability==='grades.publish';
   const current=await lockInstitutionContext(tx,actor.identity,actor.access,undefined,critical);
   if(!current)throw new DomainAccessDenied();
   const allowed=options.grade?await gradeScopeAllows(tx,current,options.grade.sectionId,options.grade.capability):legacyAllows(current.subject,options.permission??'academic.manage',actor.access.institutionId,new Date());
   if(!allowed)throw new DomainAccessDenied();
  }
  await check();const result=await work(tx);await check();return result;
 });
}
export function withDomainErrors<A extends [NextRequest,...unknown[]],R>(handler:(...args:A)=>Promise<R>){
 return async(...args:A)=>{try{await assertApplicationRole();return await handler(...args)}catch(error){
  if(error instanceof DomainConflict)return jsonError(error.message,409);
  if(error instanceof DomainAccessDenied)return jsonError('FORBIDDEN',403);
  if(error instanceof Error&&error.message==='DATABASE_ROLE_UNSAFE')return jsonError('DATABASE_ROLE_UNSAFE',503);
  logger.error({requestId:requestId(args[0].headers),code:'DOMAIN_REQUEST_FAILED'},'Domain request failed');return jsonError('INTERNAL_ERROR',500);
 }};
}
