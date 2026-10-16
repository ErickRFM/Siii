import {afterAll,expect,it} from 'vitest';
import {GET} from '@/app/api/ready/route';
import {pool} from '@/infrastructure/database';
it('refuses readiness when the web runtime uses an owner/superuser credential',async()=>{
 const response=await GET();
 expect(response.status).toBe(503);
 expect(await response.json()).toHaveProperty('error.code','DATABASE_ROLE_UNSAFE');
});
afterAll(async()=>pool.end());
