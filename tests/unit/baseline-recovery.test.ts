import {describe,it,expect} from 'vitest';
import {assertLocalRecoveryEndpoint} from '../../scripts/baseline-recovery';
describe('recovery endpoint isolation',()=>{
 it('accepts only an effective loopback client endpoint and a synthetic database name',()=>{for(const host of ['127.0.0.1','localhost','::1'])expect(()=>assertLocalRecoveryEndpoint(host,'p0_recovery_target')).not.toThrow()});
 it('rejects remote, provider, missing or production destinations',()=>{for(const[host,database]of [['172.17.0.2','p0_recovery_target'],['db.example.supabase.co','p0_recovery_target'],['127.0.0.1','postgres'],[undefined,'p0_recovery_target'],['127.0.0.1',undefined]])expect(()=>assertLocalRecoveryEndpoint(host,database)).toThrow('LOCAL_RECOVERY_ONLY')});
});
