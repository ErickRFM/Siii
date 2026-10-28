import {describe,expect,it} from 'vitest';
import {resolveDashboardEntry as resolve} from '@/shared/navigation/dashboard-entry';

const resolveDashboardEntry=(contexts:readonly {institutionId:string;roles:readonly string[]}[],mustChangePassword=false)=>resolve(contexts.map(context=>({...context,grants:context.roles.map(role=>({role,scopeType:'institution'}))})),mustChangePassword);

describe('authorized initial personal destination',()=>{
 it('does not redirect a campus student to a rejected personal route',()=>expect(resolve([{institutionId:'one',roles:['student'],grants:[{role:'student',scopeType:'campus'}]}])).toBeNull());
 it('does not redirect a program-scoped teacher to a rejected personal route',()=>expect(resolve([{institutionId:'one',roles:['teacher'],grants:[{role:'teacher',scopeType:'program'}]}])).toBeNull());
 it('allows program-scoped student self reads',()=>expect(resolve([{institutionId:'one',roles:['student'],grants:[{role:'student',scopeType:'program'}]}])).toBe('/dashboard/institutions/one/student'));
 it('opens the only student context directly',()=>expect(resolveDashboardEntry([{institutionId:'one',roles:['student']}])).toBe('/dashboard/institutions/one/student'));
 it('opens the only teacher context directly',()=>expect(resolveDashboardEntry([{institutionId:'one',roles:['teacher']}])).toBe('/dashboard/institutions/one/teacher'));
 it('keeps mixed operational roles in their operational context',()=>expect(resolveDashboardEntry([{institutionId:'one',roles:['student','admin']}])).toBeNull());
 it('requires an explicit choice between student and teacher',()=>expect(resolveDashboardEntry([{institutionId:'one',roles:['student','teacher']}])).toBeNull());
 it('does not choose another institution silently',()=>expect(resolveDashboardEntry([{institutionId:'one',roles:['student']},{institutionId:'two',roles:['student']}])).toBeNull());
 it('preserves the mandatory password gate',()=>expect(resolveDashboardEntry([{institutionId:'one',roles:['student']}],true)).toBeNull());
 it.each([[],['guest'],['teacher_pending'],['workshop_participant'],['unknown']].map(roles=>({roles})))('does not invent a portal for $roles',({roles})=>expect(resolveDashboardEntry([{institutionId:'one',roles}])).toBeNull());
 it('permits the student context alongside pending or guest personal grants',()=>expect(resolveDashboardEntry([{institutionId:'one',roles:['student','teacher_pending','guest']}])).toBe('/dashboard/institutions/one/student'));
});
