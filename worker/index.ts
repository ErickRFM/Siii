import {pool,assertApplicationRole} from '../src/infrastructure/database';
import {logger} from '../src/shared/logging';
import {runCleanup} from './session-cleanup';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_REQUIRED');
 await assertApplicationRole();
 let stopping=false;process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
 await runCleanup();if(process.argv.includes('--once'))return;
 let nextCleanup=Date.now()+15*60000;
 while(!stopping){
  await new Promise(resolve=>setTimeout(resolve,1000));if(stopping)break;
  if(Date.now()>=nextCleanup){
   try{await runCleanup();nextCleanup=Date.now()+15*60000;}
   catch{logger.error({code:'SESSION_CLEANUP_RETRY_SCHEDULED'},'Cleanup failed; scheduled retry');nextCleanup=Date.now()+60000;}
  }
 }
}
main().catch(()=>{logger.error({code:'SESSION_CLEANUP_FAILED'},'Session cleanup failed');process.exitCode=1;}).finally(()=>pool.end());
