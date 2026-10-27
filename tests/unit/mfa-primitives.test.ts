import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMfaSecret, createRecoveryCodes, digestRecoveryCode,
  openMfaSecret, sealMfaSecret, verifyTotp,
} from '@/shared/auth/mfa-primitives';

// RFC 6238 Appendix B SHA-1 secret; six-digit values are the RFC values mod 10^6.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const USER = '8fbaf97b-5967-420e-84e9-8f19bc74a19f';
const KEY_V1 = Buffer.alloc(32, 17).toString('base64');
const KEY_V2 = Buffer.alloc(32, 29).toString('base64');
const at = (seconds: number) => new Date(seconds * 1000);

beforeEach(() => {
  vi.stubEnv('SIII_MFA_KEYS', JSON.stringify({ v1: KEY_V1 }));
  vi.stubEnv('SIII_MFA_ACTIVE_KEY_ID', 'v1');
});
afterEach(() => vi.unstubAllEnvs());

describe('authenticator enrollment', () => {
  it('generates independent secrets and an interoperable URI', () => {
    const first = createMfaSecret('student+mobile@example.edu');
    const second = createMfaSecret('student+mobile@example.edu');
    expect(first.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(second.secret).not.toBe(first.secret);
    const uri = new URL(first.uri);
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.hostname).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/SIII:student+mobile@example.edu');
    expect(uri.searchParams.get('secret')).toBe(first.secret);
    expect(uri.searchParams.get('issuer')).toBe('SIII');
    expect(uri.searchParams.get('algorithm')).toBe('SHA1');
    expect(uri.searchParams.get('digits')).toBe('6');
    expect(uri.searchParams.get('period')).toBe('30');
  });
});

describe('TOTP verification', () => {
  it.each([
    [59, '287082', 1],
    [1111111109, '081804', 37037036],
    [1111111111, '050471', 37037037],
    [1234567890, '005924', 41152263],
    [2000000000, '279037', 66666666],
    [20000000000, '353130', 666666666],
  ])('accepts the RFC SHA-1 vector at epoch %i', async (epoch, token, timeStep) => {
    expect(await verifyTotp(SECRET, token, null, at(epoch))).toEqual({ valid: true, timeStep });
  });

  it('allows a previous step at the end of its 30-second past tolerance', async () => {
    expect(await verifyTotp(SECRET, '287082', null, at(89.999))).toEqual({ valid: true, timeStep: 1 });
    expect(await verifyTotp(SECRET, '287082', null, at(90))).toEqual({ valid: false });
  });

  it('rejects future codes even one second before the next step', async () => {
    expect(await verifyTotp(SECRET, '050471', null, at(1111111109))).toEqual({ valid: false });
  });

  it('rejects replay and older accepted steps but permits a newer step', async () => {
    expect(await verifyTotp(SECRET, '050471', 37037037, at(1111111111))).toEqual({ valid: false });
    expect(await verifyTotp(SECRET, '081804', 37037037, at(1111111111))).toEqual({ valid: false });
    expect(await verifyTotp(SECRET, '050471', 37037036, at(1111111111))).toEqual({ valid: true, timeStep: 37037037 });
    expect(await verifyTotp(SECRET, '050471', 37037038, at(1111111111))).toEqual({ valid: false });
  });

  it.each(['', '28708', '2870820', '28708a', ' 287082', '287082\n', '２８７０８２', '000000'])
    ('fails closed for a malformed or incorrect token %j', async token => {
      expect(await verifyTotp(SECRET, token, null, at(59))).toEqual({ valid: false });
    });

  it.each(['', 'NOT!BASE32', 'A'])('reports invalid stored secrets with a stable error', async secret => {
    await expect(verifyTotp(secret, '287082', null, at(59))).rejects.toMatchObject({ code: 'MFA_SECRET_INVALID', message: 'MFA_SECRET_INVALID' });
  });
});

describe('encrypted MFA secrets', () => {
  it('round trips without exposing the plaintext and randomizes ciphertext', () => {
    const first = sealMfaSecret(SECRET, USER);
    const second = sealMfaSecret(SECRET, USER);
    expect(first).not.toContain(SECRET);
    expect(second).not.toBe(first);
    expect(openMfaSecret(first, USER)).toBe(SECRET);
    expect(Buffer.from(JSON.parse(first).iv, 'base64url')).toHaveLength(12);
    expect(Buffer.from(JSON.parse(first).tag, 'base64url')).toHaveLength(16);
  });

  it('rejects moving a secret to another user', () => {
    const blob = sealMfaSecret(SECRET, USER);
    expect(() => openMfaSecret(blob, 'different-user')).toThrowError('MFA_SECRET_INVALID');
  });

  it.each(['iv', 'tag', 'ciphertext'])('authenticates tampering of %s', field => {
    const envelope = JSON.parse(sealMfaSecret(SECRET, USER));
    const bytes = Buffer.from(envelope[field], 'base64url');
    bytes[0] ^= 1;
    envelope[field] = bytes.toString('base64url');
    expect(() => openMfaSecret(JSON.stringify(envelope), USER)).toThrowError('MFA_SECRET_INVALID');
  });

  it('authenticates the key identifier even when two identifiers use the same key', () => {
    vi.stubEnv('SIII_MFA_KEYS', JSON.stringify({ v1: KEY_V1, alias: KEY_V1 }));
    const envelope = JSON.parse(sealMfaSecret(SECRET, USER));
    envelope.keyId = 'alias';
    expect(() => openMfaSecret(JSON.stringify(envelope), USER)).toThrowError('MFA_SECRET_INVALID');
  });

  it('keeps old ciphertext readable after rotation while new writes use the active key', () => {
    const old = sealMfaSecret(SECRET, USER);
    vi.stubEnv('SIII_MFA_KEYS', JSON.stringify({ v1: KEY_V1, v2: KEY_V2 }));
    vi.stubEnv('SIII_MFA_ACTIVE_KEY_ID', 'v2');
    const current = sealMfaSecret(SECRET, USER);
    expect(JSON.parse(current).keyId).toBe('v2');
    expect(openMfaSecret(old, USER)).toBe(SECRET);
    expect(openMfaSecret(current, USER)).toBe(SECRET);
    vi.stubEnv('SIII_MFA_KEYS', JSON.stringify({ v2: KEY_V2 }));
    expect(() => openMfaSecret(old, USER)).toThrowError('MFA_KEY_UNAVAILABLE');
  });

  it.each(['not json', 'null', '[]', '{}', '{"v1":"not-base64"}', JSON.stringify({ v1: Buffer.alloc(31).toString('base64') })])
    ('rejects invalid keyring configuration %j', keyring => {
      vi.stubEnv('SIII_MFA_KEYS', keyring);
      expect(() => sealMfaSecret(SECRET, USER)).toThrowError('MFA_KEY_UNAVAILABLE');
    });

  it('does not fall back when environment keys or the active identifier are missing', () => {
    vi.stubEnv('SIII_MFA_KEYS', undefined);
    expect(() => sealMfaSecret(SECRET, USER)).toThrowError('MFA_KEY_UNAVAILABLE');
    vi.stubEnv('SIII_MFA_KEYS', JSON.stringify({ v1: KEY_V1 }));
    vi.stubEnv('SIII_MFA_ACTIVE_KEY_ID', undefined);
    expect(() => sealMfaSecret(SECRET, USER)).toThrowError('MFA_KEY_UNAVAILABLE');
    vi.stubEnv('SIII_MFA_ACTIVE_KEY_ID', 'unknown');
    expect(() => sealMfaSecret(SECRET, USER)).toThrowError('MFA_KEY_UNAVAILABLE');
  });

  it.each(['', 'null', '{}', 'not-json', '{"version":2}', '{"version":1,"keyId":"v1","iv":"!","tag":"!","ciphertext":"!"}'])
    ('rejects malformed envelopes without leaking content %j', blob => {
      expect(() => openMfaSecret(blob, USER)).toThrowError('MFA_SECRET_INVALID');
    });

  it('never encrypts an invalid secret or binds to an empty user', () => {
    expect(() => sealMfaSecret('', USER)).toThrowError('MFA_SECRET_INVALID');
    expect(() => sealMfaSecret(SECRET, '')).toThrowError('MFA_SECRET_INVALID');
    expect(() => openMfaSecret(sealMfaSecret(SECRET, USER), '')).toThrowError('MFA_SECRET_INVALID');
  });
});

describe('recovery code generation and digesting', () => {
  it('generates ten independently random 128-bit recovery codes per enrollment', () => {
    const first = createRecoveryCodes();
    const second = createRecoveryCodes();
    expect(first).toHaveLength(10);
    expect(second).toHaveLength(10);
    expect(new Set([...first, ...second]).size).toBe(20);
    for (const code of first) expect(code).toMatch(/^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/);
  });

  it('normalizes only formatting differences and binds hashes to each user', () => {
    const code = '01234567-89ABCDEF-01234567-89ABCDEF';
    const digest = digestRecoveryCode(code, USER);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain('01234567');
    expect(digestRecoveryCode(' 01234567 89abcdef 01234567 89abcdef ', USER)).toBe(digest);
    expect(digestRecoveryCode('0123456789abcdef0123456789abcdef', USER)).toBe(digest);
    expect(digestRecoveryCode(code, 'different-user')).not.toBe(digest);
    expect(digestRecoveryCode('11234567-89ABCDEF-01234567-89ABCDEF', USER)).not.toBe(digest);
  });

  it.each(['', '01234567', '01234567-89ABCDEG-01234567-89ABCDEF', '01234567_89ABCDEF_01234567_89ABCDEF', '01234567-89ABCDEF-01234567-89ABCDEＦ', '01234567-89ABCDEF-01234567-89ABCDE', '01234567-89ABCDEF-01234567-89ABCDEF0'])
    ('rejects unexpected recovery code format %j', code => {
      expect(digestRecoveryCode(code, USER)).toBeNull();
    });

  it('rejects recovery digesting without user binding', () => {
    expect(digestRecoveryCode('01234567-89ABCDEF-01234567-89ABCDEF', '')).toBeNull();
  });
});
