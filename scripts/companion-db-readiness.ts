import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {readReleaseMigrations,releaseAppendixHash,releaseDefinitionHash} from '../db/release-profile';
import {assertNoConnectionOverrides} from '../db/connection-url';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const observation=z.object({ledger:z.array(z.object({hash,created_at:z.union([z.number(),z.string()])})),profile:z.array(z.object({profile:z.string(),definition_hash:hash})),appendix:z.array(z.object({name:z.string(),definition_hash:hash}))});

/** Metadata only. This preparation is intentionally fixed to the observed
 * 0000..0017 prefix and target 0025; later migrations require their own review.
 */
export function validateCompanionProductionLedger(input:unknown){
 const parsed=observation.safeParse(input);if(!parsed.success)throw Error('COMPANION_PRODUCTION_METADATA_INVALID');
 const value=parsed.data,migrations=readReleaseMigrations('supabase-v1').slice(0,26);
 if(value.ledger.length!==18)throw Error('COMPANION_PRODUCTION_PREFIX_CHANGED');
 if(value.ledger.some((row,index)=>row.hash!==migrations[index].hash||Number(row.created_at)!==migrations[index].folderMillis))throw Error('COMPANION_PRODUCTION_LEDGER_DRIFT');
 if(value.profile.length!==1||value.profile[0].profile!=='supabase-v1'||value.profile[0].definition_hash!==releaseDefinitionHash('supabase-v1'))throw Error('COMPANION_RELEASE_PROFILE_DRIFT');
 if(value.appendix.length!==1||value.appendix[0].name!=='schema-isolation-v1'||value.appendix[0].definition_hash!==releaseAppendixHash())throw Error('COMPANION_RELEASE_APPENDIX_DRIFT');
 const journal=JSON.parse(readFileSync(new URL('../db/migrations/meta/_journal.json',import.meta.url),'utf8'));
 return {applied:18,pending:migrations.slice(18).map((migration,index)=>({index:index+18,tag:journal.entries[index+18].tag as string,hash:migration.hash}))};
}
export function assertCompanionLocalEndpoint(raw:string,admin=false):void{
 try{const url=new URL(raw);assertNoConnectionOverrides(url);if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='55439'||(admin?url.pathname!=='/postgres':!/^\/p0_companion_[a-z0-9_]+$/.test(url.pathname)))throw Error();}
 catch{throw Error('COMPANION_LOCAL_REHEARSAL_ONLY');}
}
