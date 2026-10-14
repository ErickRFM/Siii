// One-time local bootstrap. Execute with environment variables from a secret manager.
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../src/shared/auth/password';
import { db,pool } from '../src/infrastructure/database';
import { institutions,people,platformUsers,institutionMemberships,roleAssignments,securityAuditLog } from '../db/schema';
async function main(){
 const required=['SIII_BOOTSTRAP_CONFIRM','SIII_BOOTSTRAP_USERNAME','SIII_BOOTSTRAP_PASSWORD','SIII_BOOTSTRAP_INSTITUTION_CODE','SIII_BOOTSTRAP_INSTITUTION_NAME'];
 if(required.some(k=>!process.env[k]))throw new Error('Missing bootstrap environment variables');
 if(process.env.SIII_BOOTSTRAP_CONFIRM!=='YES')throw new Error('Explicit bootstrap confirmation required');
 const username=process.env.SIII_BOOTSTRAP_USERNAME!.trim().toLowerCase();
 const password=process.env.SIII_BOOTSTRAP_PASSWORD!;
 if(password.length<16 || username.length<3)throw new Error('Weak initial credentials');
 const passwordHash=await hashPassword(password);
 await db.transaction(async(tx)=>{
  const existing=await tx.select({id:platformUsers.id}).from(platformUsers).limit(1);
  if(existing.length)throw new Error('Bootstrap only allowed for an empty identity database');
  const [inst]=await tx.insert(institutions).values({name:process.env.SIII_BOOTSTRAP_INSTITUTION_NAME!,code:process.env.SIII_BOOTSTRAP_INSTITUTION_CODE!}).returning({id:institutions.id});
  const [person]=await tx.insert(people).values({firstName:'System',lastName:'Administrator'}).returning({id:people.id});
  const [user]=await tx.insert(platformUsers).values({personId:person.id,username,passwordHash,mustChangePassword:true}).returning({id:platformUsers.id});
  const [member]=await tx.insert(institutionMemberships).values({institutionId:inst.id,userId:user.id}).returning({id:institutionMemberships.id});
  await tx.insert(roleAssignments).values({membershipId:member.id,role:'super_admin',grantedBy:user.id});
  await tx.insert(securityAuditLog).values({actorUserId:user.id,institutionId:inst.id,action:'bootstrap.initial',requestId:randomUUID(),target:`institution:${inst.id}`});
 });
 console.log('Initial institution administrator created. Change password at first login.');
}
main().catch(()=>{console.error('BOOTSTRAP_FAILED');process.exitCode=1}).finally(()=>pool.end());
