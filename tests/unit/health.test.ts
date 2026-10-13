import { describe,it,expect } from 'vitest';
import { GET as healthGET } from '@/app/api/health/route';
import { hasPermission,canGrantRole } from '@/shared/auth/roles';
describe('health endpoint',()=>{it('returns ok',async()=>{const r=await healthGET();expect((await r.json()).status).toBe('ok')})});
describe('RBAC policy',()=>{
 it('denies student writes',()=>expect(hasPermission(['student'],'users.manage')).toBe(false));
 it('requires institutional role for admin actions',()=>expect(hasPermission(['teacher'],'roles.assign')).toBe(false));
 it('allows admin staff operations',()=>expect(hasPermission(['admin'],'users.manage')).toBe(true));
 it('disallows all super admin grants through the application',()=>expect(canGrantRole(['super_admin'],'super_admin')).toBe(false));
 it('disallows teacher granting roles',()=>expect(canGrantRole(['teacher'],'student')).toBe(false));
});
