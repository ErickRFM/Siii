import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { assertSameOrigin } from '@/shared/auth/guards';
import { canGrantRole, canManageMembership } from '@/shared/auth/roles';

function mutation(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://sii.example/api/v1/auth/login', {
    method: 'POST',
    headers,
  });
}

describe('unsafe-request origin policy', () => {
  it('accepts an explicitly same-origin browser submission', () => {
    expect(assertSameOrigin(mutation({
      origin: 'https://sii.example',
      'sec-fetch-site': 'same-origin',
    }))).toBe(true);
  });

  it('rejects a cross-origin submission even without Fetch Metadata', () => {
    expect(assertSameOrigin(mutation({ origin: 'https://attacker.example' }))).toBe(false);
  });

  it('rejects a cross-site browser POST even when Origin is omitted', () => {
    expect(assertSameOrigin(mutation({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
  });

  it('rejects a same-site request from a different subdomain', () => {
    expect(assertSameOrigin(mutation({ 'sec-fetch-site': 'same-site' }))).toBe(false);
  });

  it('rejects a null or malformed Origin', () => {
    expect(assertSameOrigin(mutation({ origin: 'null' }))).toBe(false);
    expect(assertSameOrigin(mutation({ origin: 'not a url' }))).toBe(false);
  });

  it('rejects an incorrect origin protocol', () => {
    expect(assertSameOrigin(mutation({ origin: 'http://sii.example' }))).toBe(false);
  });

  it('retains compatibility with non-browser requests without Fetch Metadata', () => {
    expect(assertSameOrigin(mutation())).toBe(true);
  });
});

describe('institutional role grants', () => {
  it('never grants super administration from the ordinary API', () => {
    expect(canGrantRole(['super_admin'], 'super_admin')).toBe(false);
  });

  it('does not allow an administrator to create another administrator', () => {
    expect(canGrantRole(['admin'], 'admin')).toBe(false);
  });

  it('permits a super administrator to grant admin, but not super admin', () => {
    expect(canGrantRole(['super_admin'], 'admin')).toBe(true);
    expect(canGrantRole(['super_admin'], 'super_admin')).toBe(false);
  });

  it('permits administrators to grant limited institutional roles', () => {
    expect(canGrantRole(['admin'], 'teacher')).toBe(true);
    expect(canGrantRole(['admin'], 'coordinator')).toBe(true);
  });

  it('disallows teachers and students from granting any roles', () => {
    expect(canGrantRole(['teacher'], 'student')).toBe(false);
    expect(canGrantRole(['student'], 'teacher')).toBe(false);
  });
});

describe('privileged membership changes', () => {
  it('blocks administrative peers from managing one another', () => {
    expect(canManageMembership(['admin'], ['admin'])).toBe(false);
  });

  it('blocks every ordinary API actor from modifying super administrators', () => {
    expect(canManageMembership(['super_admin'], ['super_admin'])).toBe(false);
    expect(canManageMembership(['admin'], ['super_admin'])).toBe(false);
  });

  it('permits a super administrator to manage an administrator', () => {
    expect(canManageMembership(['super_admin'], ['admin'])).toBe(true);
  });

  it('permits institution admins to manage limited roles only', () => {
    expect(canManageMembership(['admin'], ['student', 'teacher'])).toBe(true);
  });

  it('denies non-administrative actors', () => {
    expect(canManageMembership(['teacher'], ['student'])).toBe(false);
    expect(canManageMembership(['student'], [])).toBe(false);
  });
});

it('accepts a literal loopback origin despite NextURL normalization',()=>{
 const req=new NextRequest('http://127.0.0.1:3107/api/v1/auth/login',{
  method:'POST',headers:{origin:'http://127.0.0.1:3107',host:'127.0.0.1:3107','sec-fetch-site':'same-origin'}
 });
 expect(assertSameOrigin(req)).toBe(true);
});
