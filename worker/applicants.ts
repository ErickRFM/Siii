import {pool,assertApplicationRole} from '../src/infrastructure/database';
import {deliverApplicantVerifications} from '../src/modules/admissions/outbox-worker';
import {logger} from '../src/shared/logging';
/** Schedule every minute on an approved worker; a daily cron cannot retry a 30-minute proof. */
async function main(){await assertApplicationRole();logger.info(await deliverApplicantVerifications({limit:100}),'Applicant verification batch completed');}
main().catch(()=>{logger.error({code:'APPLICANT_EMAIL_JOB_FAILED'},'Applicant verification delivery failed');process.exitCode=1;}).finally(()=>pool.end());
