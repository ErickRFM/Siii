import 'server-only';
import {db} from '@/infrastructure/database';
import {lockWriteCapability} from '@/shared/auth/write-access';
import type {InstitutionAccess} from '@/shared/auth/institution-policy';
import type {Transaction} from '@/shared/http/request-context';

type Actor={identity:{id:string;sessionId:string};access:InstitutionAccess};
class FinancialAccessDenied extends Error {}

/** Reuse the central capability policy before writes and again before commit. */
export async function financialTransaction<T>(actor:Actor,work:(tx:Transaction)=>Promise<T>):Promise<{authorized:true;data:T}|{authorized:false}>{
 try{
  const data=await db.transaction(async tx=>{
   async function check(){
    if(!await lockWriteCapability(tx,actor.identity,actor.access,'institutions.manage'))throw new FinancialAccessDenied();
   }
   await check();
   const result=await work(tx);
   await check();
   return result;
  });
  return {authorized:true,data};
 }catch(error){
  // Catch outside db.transaction so a late denial rolls back financial rows and audit.
  if(error instanceof FinancialAccessDenied)return {authorized:false};
  throw error;
 }
}
