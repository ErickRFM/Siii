import type pg from 'pg';
import {openDelivery} from '../../src/shared/email/delivery-seal';
/** Test-only mailbox observation of encrypted delivery, never an HTTP credential endpoint. */
export async function applicantMail(sql:pg.Client,email:string){
 const row=(await sql.query("SELECT o.* FROM applicant_verification_outbox o JOIN applicant_profiles p ON p.id=o.applicant_id WHERE p.email=$1 AND o.state='queued' ORDER BY o.created_at DESC LIMIT 1",[email])).rows[0];
 if(!row)throw Error('EXPECTED_APPLICANT_MAIL');
 const message=openDelivery(row.payload_encrypted,row.id,row.applicant_id,{purpose:'admissions',keys:process.env.SIII_APPLICANT_EMAIL_KEYS,activeKeyId:process.env.SIII_APPLICANT_EMAIL_ACTIVE_KEY_ID});
 const url=new URL(message.text.match(/https:\/\/[^\s]+/)![0]);const fragment=new URLSearchParams(url.hash.slice(1));
 return {id:fragment.get('id')!,token:fragment.get('token')!,url:url.toString(),message,eventId:row.id};
}
