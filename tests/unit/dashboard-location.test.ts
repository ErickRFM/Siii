import {describe,expect,it} from 'vitest';
import {resolveDashboardLocation} from '@/shared/navigation/dashboard-location';
describe('persistent dashboard navigation',()=>{
  it('keeps the only institution in overview and account security',()=>{
    expect(resolveDashboardLocation('/dashboard','inst-a')).toEqual({active:'overview',institutionId:'inst-a'});
    expect(resolveDashboardLocation('/dashboard/security','inst-a')).toEqual({active:'security',institutionId:'inst-a'});
    expect(resolveDashboardLocation('/dashboard/security')).toEqual({active:'security'});
  });
  it('derives institutional module identity without an async permissions response',()=>{
    for(const section of ['academic','registry','operations','grading','scheduling','services','users','roles','invitations','administration'])
      expect(resolveDashboardLocation(`/dashboard/institutions/inst-a/${section}`,'inst-b')).toEqual({active:section,institutionId:'inst-a'});
  });
  it('maps the admin URL to its visible administration tab',()=>{
    expect(resolveDashboardLocation('/dashboard/institutions/inst-a/admin')).toEqual({active:'administration',institutionId:'inst-a'});
  });
  it('separates institution switching and unknown routes',()=>{
    expect(resolveDashboardLocation('/dashboard/institutions/inst-b')).toEqual({active:'institution',institutionId:'inst-b'});
    expect(resolveDashboardLocation('/dashboard/institutions/inst-b/unknown')).toEqual({active:'institution',institutionId:'inst-b'});
    expect(resolveDashboardLocation('/login')).toEqual({active:'overview'});
  });
});
