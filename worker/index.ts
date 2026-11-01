import {reconcileAttendanceResults} from '../src/integrations/companion/results-worker';
import {pool,assertApplicationRole} from '../src/infrastructure/database';
import {logger} from '../src/shared/logging';
import {runCleanup} from './session-cleanup';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_REQUIRED');
 await assertApplicationRole();
 let stopping=false;process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
 await runCleanup();await reconcileAttendanceResults();if(process.argv.includes('--once'))return;
 let nextResults=Date.now()+30000;
 let nextCleanup=Date.now()+15*60000;
 while(!stopping){
  await new Promise(resolve=>setTimeout(resolve,1000));if(stopping)break;
  if(Date.now()>=nextResults){try{await reconcileAttendanceResults();nextResults=Date.now()+30000}catch{logger.error({code:'ATTENDANCE_RESULTS_RETRY'},'Attendance results retry scheduled');nextResults=Date.now()+60000}}
  if(Date.now()>=nextCleanup){
   try{await runCleanup();nextCleanup=Date.now()+15*60000;}
   catch{logger.error({code:'SESSION_CLEANUP_RETRY_SCHEDULED'},'Cleanup failed; scheduled retry');nextCleanup=Date.now()+60000;}
  }
 }
}
main().catch(()=>{logger.error({code:'SESSION_CLEANUP_FAILED'},'Session cleanup failed');process.exitCode=1;}).finally(()=>pool.end());
