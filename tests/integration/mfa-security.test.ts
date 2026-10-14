import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import argon2 from 'argon2';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { generate } from 'otplib';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { isolatedDatabaseUrl } from '../support/database-url';

const sql = new pg.Client({ connectionString: isolatedDatabaseUrl() });
const base = 'http://127.0.0.1:3107';
const password = 'Synthetic-mfa-integration-2026!';
let userId: string, username: string, cookie = '', hash: string;
function responseCookie(response: Response, name = 'siii_session') {
  return response.headers.getSetCookie().find(value => value.startsWith(name + '='))?.split(';')[0] ?? '';
}
async function request(path: string, body?: unknown, session = cookie, headers: Record<string, string> = {}) {
  return fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
    headers: { origin: base, ...(session ? { cookie: session } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function login(pass = password) {
  const response = await request('/api/v1/auth/login', { username, password: pass }, '');
  return { response, cookie: responseCookie(response), challenge: responseCookie(response, 'siii_mfa_challenge') };
}
async function token(secret: string, offset = 0) {
  return generate({ secret, crypto: new NodeCryptoPlugin(), algorithm: 'sha1', digits: 6, period: 30, epoch: Math.floor(Date.now() / 1000) + offset });
}
async function wrongToken(secret: string) {
  const valid = [await token(secret), await token(secret, -30)];
  let candidate = 0;
  while (valid.includes(String(candidate).padStart(6, '0'))) candidate++;
  return String(candidate).padStart(6, '0');
}
async function enroll(session = cookie) {
  const response = await request('/api/v1/auth/mfa/enroll', { currentPassword: password }, session);
  expect(response.status).toBe(201);
  const { data } = await response.json();
  return data as { enrollmentId: string; secret: string; uri: string; expiresAt: string };
}
async function configure() {
  const enrollment = await enroll();
  const code = await token(enrollment.secret);
  const response = await request('/api/v1/auth/mfa/verify', { enrollmentId: enrollment.enrollmentId, code });
  expect(response.status).toBe(200);
  cookie = responseCookie(response);
  return { ...enrollment, code, recoveryCodes: (await response.json()).data.recoveryCodes as string[] };
}
async function recoveryLogin(code: string) {
  const first = await login(); expect(first.response.status).toBe(200);
  const response = await request('/api/v1/auth/mfa/challenge', { recoveryCode: code }, first.challenge);
  expect(response.status).toBe(200);
  return responseCookie(response);
}

describe.sequential('real MFA HTTP security and transaction boundaries', () => {
  beforeAll(async () => {
    await sql.connect();
    hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  });
  beforeEach(async () => {
    await sql.query('DELETE FROM auth_throttle');
    username = 'qa-mfa-' + randomUUID().slice(0, 12);
    const person = (await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic MFA','Integration') RETURNING id")).rows[0].id;
    userId = (await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id', [person, username, hash])).rows[0].id;
    const authenticated = await login(); expect(authenticated.response.status).toBe(200); cookie = authenticated.cookie;
  });
  afterAll(async () => { await sql.end(); });

  it('preserves password-only login and reports real factor status', async () => {
    expect((await request('/api/v1/auth/me')).status).toBe(200);
    const response = await request('/api/v1/auth/mfa');
    expect(await response.json()).toEqual({ data: { configured: false, pending: false, recoveryCodesRemaining: 0, stepUpExpiresAt: null } });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('requires the mandatory password change before enrollment or step-up', async () => {
    await sql.query('UPDATE platform_users SET must_change_password=true WHERE id=$1', [userId]);
    for (const path of ['/enroll', '/step-up']) {
      const response = await request('/api/v1/auth/mfa' + path, { currentPassword: password });
      expect(response.status).toBe(403); expect(await response.json()).toHaveProperty('error.code', 'PASSWORD_CHANGE_REQUIRED');
    }
    expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_enrollments WHERE user_id=$1', [userId])).rows[0].n).toBe(0);
  });
  it('encrypts enrollment, binds it to the current session, rotates activation and revokes devices', async () => {
    const old = cookie, other = (await login()).cookie;
    const pending = await enroll();
    const stored = (await sql.query('SELECT secret_encrypted FROM auth_mfa_enrollments WHERE id=$1', [pending.enrollmentId])).rows[0].secret_encrypted;
    expect(stored).not.toContain(pending.secret);
    expect(JSON.parse(stored).version).toBe(1);
    const denied = await request('/api/v1/auth/mfa/verify', { enrollmentId: pending.enrollmentId, code: await token(pending.secret) }, other);
    expect(denied.status).toBe(401);
    const activated = await request('/api/v1/auth/mfa/verify', { enrollmentId: pending.enrollmentId, code: await token(pending.secret) });
    expect(activated.status).toBe(200); cookie = responseCookie(activated);
    const codes = (await activated.json()).data.recoveryCodes;
    expect(codes).toHaveLength(10); expect(cookie).not.toBe(old);
    expect((await request('/api/v1/auth/me', undefined, old)).status).toBe(401);
    expect((await request('/api/v1/auth/me', undefined, other)).status).toBe(401);
    expect((await request('/api/v1/auth/me')).status).toBe(200);
    const rows = (await sql.query('SELECT code_hash FROM auth_mfa_recovery_codes WHERE user_id=$1', [userId])).rows;
    expect(rows).toHaveLength(10);
    for (const row of rows) { expect(row.code_hash).toMatch(/^[a-f0-9]{64}$/); expect(codes).not.toContain(row.code_hash); }
  });
  it('creates an HttpOnly hashed challenge without minting a full session', async () => {
    await configure();
    const before = (await sql.query('SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1', [userId])).rows[0].n;
    const first = await login();
    expect(await first.response.json()).toMatchObject({ mfaRequired: true });
    const cookieHeader = first.response.headers.getSetCookie().find(value => value.startsWith('siii_mfa_challenge='))!;
    expect(cookieHeader).toContain('HttpOnly'); expect(cookieHeader).toContain('SameSite=lax'); expect(cookieHeader).toContain('Path=/');
    expect(first.cookie).toBe('siii_session=');
    expect((await request('/api/v1/auth/me', undefined, first.challenge)).status).toBe(401);
    const challenge = (await sql.query('SELECT token_hash,expires_at FROM auth_mfa_challenges WHERE user_id=$1', [userId])).rows[0];
    expect(challenge.token_hash).not.toBe(first.challenge.split('=')[1]); expect(challenge.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect((await sql.query('SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1', [userId])).rows[0].n).toBe(before);
    expect((await request('/api/v1/auth/mfa/challenge', { challengeToken: first.challenge.split('=')[1], code: '123456' }, first.challenge)).status).toBe(401);
  });
  it('never accepts the TOTP used to activate the factor again', async () => {
    const active = await configure(), first = await login();
    const replay = await request('/api/v1/auth/mfa/challenge', { code: active.code }, first.challenge);
    expect(replay.status).toBe(401); expect(await replay.json()).toHaveProperty('error.code', 'INVALID_MFA_CODE');
    const recovery = await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge);
    expect(recovery.status).toBe(200);
    expect((await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[1] }, first.challenge)).status).toBe(401);
    expect((await sql.query('SELECT consumed_at FROM auth_mfa_recovery_codes WHERE user_id=$1 ORDER BY created_at,id', [userId])).rows.filter(row => row.consumed_at)).toHaveLength(1);
  });
  it('consumes one recovery code atomically even through two different challenges', async () => {
    const active = await configure();
    const first = await login(), second = await login();
    const responses = await Promise.all([
      request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge),
      request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, second.challenge),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 401]);
    expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_recovery_codes WHERE user_id=$1 AND consumed_at IS NOT NULL', [userId])).rows[0].n).toBe(1);
  });
  it('completes a challenge only once even with two distinct valid recovery codes racing', async () => {
    const active = await configure(), first = await login();
    const responses = await Promise.all([
      request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge),
      request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[1] }, first.challenge),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 401]);
    expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_recovery_codes WHERE user_id=$1 AND consumed_at IS NOT NULL', [userId])).rows[0].n).toBe(1);
  });
  it('revalidates authVersion after waiting for a user lock before consuming a challenge', async () => {
    const active = await configure(), first = await login();
    const gate = new pg.Client({ connectionString: isolatedDatabaseUrl() }); await gate.connect(); await gate.query('BEGIN');
    let pending: Promise<Response> | undefined;
    try {
      await gate.query('SELECT id FROM platform_users WHERE id=$1 FOR UPDATE', [userId]);
      pending = request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge);
      let blocked = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const waiting = (await sql.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%platform_users%'")).rows[0].n;
        if (waiting) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(blocked).toBe(true);
      await gate.query('UPDATE platform_users SET auth_version=auth_version+1 WHERE id=$1', [userId]);
      await gate.query('COMMIT');
      const denied = await pending; expect(denied.status).toBe(401); expect(await denied.json()).toHaveProperty('error.code', 'MFA_CHALLENGE_EXPIRED');
      expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_recovery_codes WHERE user_id=$1 AND consumed_at IS NOT NULL', [userId])).rows[0].n).toBe(0);
    } finally {
      await gate.query('ROLLBACK').catch(() => undefined); await gate.end(); if (pending) await pending;
    }
  });
  it('revalidates session authVersion during academic writes after preliminary authorization', async () => {
    await configure();
    const institution = (await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic MFA write guard',$1) RETURNING id", ['MFA' + randomUUID().slice(0, 12)])).rows[0].id;
    const membership = (await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id', [institution, userId])).rows[0].id;
    await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'admin')", [membership]);
    const gate = new pg.Client({ connectionString: isolatedDatabaseUrl() }); await gate.connect(); await gate.query('BEGIN');
    let pending: Promise<Response> | undefined;
    const code = 'STALE' + randomUUID().slice(0, 8).toUpperCase();
    try {
      await gate.query('LOCK TABLE role_assignments IN ACCESS EXCLUSIVE MODE');
      pending = request('/api/v1/institutions/' + institution + '/academic/courses', { code, name: 'Forbidden stale session write', credits: 6 });
      let blocked = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        const waiting = (await sql.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%role_assignments%'")).rows[0].n;
        if (waiting) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(blocked).toBe(true);
      await sql.query('UPDATE platform_users SET auth_version=auth_version+1 WHERE id=$1', [userId]);
      await gate.query('COMMIT');
      expect((await pending).status).toBe(403);
      expect((await sql.query('SELECT count(*)::int AS n FROM academic_courses WHERE institution_id=$1 AND code=$2', [institution, code])).rows[0].n).toBe(0);
    } finally {
      await gate.query('ROLLBACK').catch(() => undefined); await gate.end(); if (pending) await pending;
    }
  });
  it('rejects expired enrollment and expires its attempt budget after five failed codes', async () => {
    const expired = await enroll();
    await sql.query("UPDATE auth_mfa_enrollments SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.enrollmentId]);
    const denied = await request('/api/v1/auth/mfa/verify', { enrollmentId: expired.enrollmentId, code: await token(expired.secret) });
    expect(await denied.json()).toHaveProperty('error.code', 'MFA_ENROLLMENT_EXPIRED');
    const pending = await enroll(), wrong = await wrongToken(pending.secret);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await request('/api/v1/auth/mfa/verify', { enrollmentId: pending.enrollmentId, code: wrong });
      expect(response.status).toBe(attempt === 5 ? 429 : 401);
    }
    expect((await request('/api/v1/auth/mfa/verify', { enrollmentId: pending.enrollmentId, code: await token(pending.secret) })).status).toBe(429);
  });
  it('expires challenges without consuming a valid recovery code', async () => {
    const active = await configure(), first = await login();
    await sql.query("UPDATE auth_mfa_challenges SET expires_at=now()-interval '1 second' WHERE user_id=$1", [userId]);
    const response = await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge);
    expect(response.status).toBe(401); expect(await response.json()).toHaveProperty('error.code', 'MFA_CHALLENGE_EXPIRED');
    expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_recovery_codes WHERE user_id=$1 AND consumed_at IS NOT NULL', [userId])).rows[0].n).toBe(0);
  });
  it('limits factor guesses across newly issued password challenges', async () => {
    const active = await configure(), first = await login(), wrong = await wrongToken(active.secret);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await request('/api/v1/auth/mfa/challenge', { code: wrong }, first.challenge);
      expect(response.status).toBe(attempt === 5 ? 429 : 401);
    }
    expect((await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge)).status).toBe(429);
    expect((await login()).response.status).toBe(429);
    expect((await sql.query('SELECT failed_attempts,blocked_until FROM auth_mfa_factors WHERE user_id=$1', [userId])).rows[0]).toMatchObject({ failed_attempts: 5 });
  });
  it('requires fresh password plus factor step-up, renews hashes and rejects previous recovery codes', async () => {
    const active = await configure();
    expect((await request('/api/v1/auth/mfa/recovery/regenerate', {})).status).toBe(403);
    expect((await request('/api/v1/auth/mfa/revoke', {})).status).toBe(403);
    expect((await request('/api/v1/auth/mfa/step-up', { currentPassword: 'incorrect', recoveryCode: active.recoveryCodes[0] })).status).toBe(401);
    expect((await request('/api/v1/auth/mfa/step-up', { currentPassword: password })).status).toBe(401);
    const beforeStepUp = cookie;
    const step = await request('/api/v1/auth/mfa/step-up', { currentPassword: password, recoveryCode: active.recoveryCodes[0] });
    expect(step.status).toBe(200); expect(await step.json()).toHaveProperty('expiresAt');
    cookie = responseCookie(step); expect(cookie).toMatch(/^siii_session=[A-Za-z0-9_-]{43}$/); expect(cookie).not.toBe(beforeStepUp);
    expect((await request('/api/v1/auth/me', undefined, beforeStepUp)).status).toBe(401);
    const generated = await request('/api/v1/auth/mfa/recovery/regenerate', {});
    expect(generated.status).toBe(200);
    const codes = (await generated.json()).data.recoveryCodes;
    expect(codes).toHaveLength(10); expect(codes.some((code: string) => active.recoveryCodes.includes(code))).toBe(false);
    const first = await login();
    expect((await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[1] }, first.challenge)).status).toBe(401);
    expect((await request('/api/v1/auth/mfa/challenge', { recoveryCode: codes[0] }, first.challenge)).status).toBe(200);
    await sql.query("UPDATE auth_sessions SET step_up_at=now()-interval '5 minutes' WHERE user_id=$1", [userId]);
    expect((await request('/api/v1/auth/mfa/revoke', {})).status).toBe(403);
  });
  it('invalidates pending challenges and sessions on password change while preserving own MFA assurance', async () => {
    const active = await configure(), first = await login(), old = cookie;
    const newPassword = 'Synthetic-mfa-replaced-password-2026!';
    const changed = await request('/api/v1/auth/password/change', { currentPassword: password, newPassword });
    expect(changed.status).toBe(200); cookie = responseCookie(changed);
    expect((await request('/api/v1/auth/me')).status).toBe(200);
    expect((await request('/api/v1/auth/me', undefined, old)).status).toBe(401);
    const stale = await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge);
    expect(stale.status).toBe(401); expect(await stale.json()).toHaveProperty('error.code', 'MFA_CHALLENGE_EXPIRED');
    const version = (await sql.query('SELECT auth_version FROM platform_users WHERE id=$1', [userId])).rows[0].auth_version;
    expect(version).toBe(2);
    const sessions = (await sql.query('SELECT auth_version,mfa_verified_at,step_up_at FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL', [userId])).rows;
    expect(sessions).toHaveLength(1); expect(sessions[0].auth_version).toBe(version); expect(sessions[0].mfa_verified_at).not.toBeNull(); expect(sessions[0].step_up_at).toBeNull();
  });
  it('denies sessions with missing MFA assurance or stale authVersion even if not revoked', async () => {
    await configure();
    const raw = cookie.split('=')[1], digest = createHash('sha256').update(raw).digest('hex');
    await sql.query('UPDATE auth_sessions SET mfa_verified_at=NULL WHERE token_hash=$1', [digest]);
    expect((await request('/api/v1/auth/me')).status).toBe(401);
    expect((await request('/api/v1/auth/password/change', { currentPassword: password, newPassword: 'Synthetic-forbidden-password-2026!' })).status).toBe(401);
    await sql.query('UPDATE auth_sessions SET mfa_verified_at=now(),auth_version=auth_version-1 WHERE token_hash=$1', [digest]);
    expect((await request('/api/v1/auth/me')).status).toBe(401);
  });
  it('reports an expired password-based MFA session without consuming recovery codes', async () => {
    const active = await configure();
    await sql.query("UPDATE auth_sessions SET last_seen_at=now()-interval '31 minutes' WHERE user_id=$1", [userId]);
    const expired = await request('/api/v1/auth/mfa/step-up', { currentPassword: password, recoveryCode: active.recoveryCodes[0] });
    expect(expired.status).toBe(401); expect(await expired.json()).toHaveProperty('error.code', 'UNAUTHENTICATED');
    expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_recovery_codes WHERE user_id=$1 AND consumed_at IS NOT NULL', [userId])).rows[0].n).toBe(0);
  });
  it('cleanup skips a password transaction holding an expired enrollment and avoids cascade lock inversion', async () => {
    const pendingEnrollment = await enroll(), expiredCookie = cookie;
    await sql.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [createHash('sha256').update(expiredCookie.split('=')[1]).digest('hex')]);
    cookie = (await login()).cookie;
    const beforePassword = cookie;
    const advisoryKey = Math.floor(Math.random() * 2000000000);
    const gate = new pg.Client({ connectionString: isolatedDatabaseUrl() }); await gate.connect();
    await gate.query('SELECT pg_advisory_lock($1)', [advisoryKey]);
    await sql.query("CREATE OR REPLACE FUNCTION public.qa_mfa_worker_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=" + pg.escapeLiteral(pendingEnrollment.enrollmentId) + "::uuid AND NEW.consumed_at IS NOT NULL THEN PERFORM pg_advisory_xact_lock(" + advisoryKey + "); END IF; RETURN NEW; END $$");
    await sql.query('CREATE TRIGGER qa_mfa_worker_gate BEFORE UPDATE ON auth_mfa_enrollments FOR EACH ROW EXECUTE FUNCTION public.qa_mfa_worker_gate()');
    let passwordRequest: Promise<Response> | undefined, child: ChildProcess | undefined, completion: Promise<number | null> | undefined;
    try {
      passwordRequest = request('/api/v1/auth/password/change', { currentPassword: password, newPassword: 'Synthetic-worker-race-new-password-2026!' });
      let paused = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        const waiting = (await sql.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%auth_mfa_enrollments%'")).rows[0].n;
        if (waiting) { paused = true; break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(paused).toBe(true);
      const appConnection = JSON.parse(readFileSync('.superpowers/sdd/2026-10-13-p0-hardening/app-connection.json', 'utf8')).connectionString;
      child = spawn(process.execPath, ['--import', 'tsx', 'worker/index.ts', '--once'], { env: { ...process.env, DATABASE_URL: appConnection }, stdio: 'ignore', windowsHide: true });
      completion = new Promise(resolve => child!.once('exit', resolve));
      const finished = await Promise.race([completion, new Promise<null>(resolve => setTimeout(() => resolve(null), 8000))]);
      expect(finished).toBe(0);
      expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_enrollments WHERE id=$1', [pendingEnrollment.enrollmentId])).rows[0].n).toBe(1);
      await gate.query('SELECT pg_advisory_unlock($1)', [advisoryKey]);
      const changed = await passwordRequest; expect(changed.status).toBe(200); cookie = responseCookie(changed); expect(cookie).not.toBe(beforePassword);
      expect((await request('/api/v1/auth/me')).status).toBe(200);
    } finally {
      await gate.query('SELECT pg_advisory_unlock($1)', [advisoryKey]).catch(() => undefined); await gate.end();
      if (passwordRequest) await passwordRequest;
      if (completion) await completion;
      await sql.query('DROP TRIGGER IF EXISTS qa_mfa_worker_gate ON auth_mfa_enrollments');
      await sql.query('DROP FUNCTION IF EXISTS public.qa_mfa_worker_gate()');
    }
  });
  it('rotates revocation, revokes every other device and invalidates recovery and pending challenges', async () => {
    const active = await configure(), other = await recoveryLogin(active.recoveryCodes[0]), first = await login(), old = cookie;
    const step = await request('/api/v1/auth/mfa/step-up', { currentPassword: password, recoveryCode: active.recoveryCodes[1] });
    expect(step.status).toBe(200); cookie = responseCookie(step);
    const revoked = await request('/api/v1/auth/mfa/revoke', {}); expect(revoked.status).toBe(200); cookie = responseCookie(revoked);
    expect(cookie).not.toBe(old); expect((await request('/api/v1/auth/me')).status).toBe(200);
    expect((await request('/api/v1/auth/me', undefined, old)).status).toBe(401);
    expect((await request('/api/v1/auth/me', undefined, other)).status).toBe(401);
    expect((await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[2] }, first.challenge)).status).toBe(401);
    const next = await login(); expect(await next.response.json()).toMatchObject({ ok: true });
    expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_recovery_codes WHERE user_id=$1 AND consumed_at IS NULL', [userId])).rows[0].n).toBe(0);
  });
  it('cancels the cookie challenge at logout and clears both browser cookies', async () => {
    const active = await configure(), first = await login();
    const logout = await request('/api/v1/auth/logout', {}, first.challenge);
    expect(logout.status).toBe(303);
    expect(logout.headers.get('location')).toBe('/login');
    expect(logout.headers.getSetCookie().filter(value => value.includes('Max-Age=0'))).toHaveLength(2);
    expect((await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge)).status).toBe(401);
  });
  it('fails closed with stable codes for missing cipher keys and tampering', async () => {
    const active = await configure();
    const stored = (await sql.query('SELECT secret_encrypted FROM auth_mfa_factors WHERE user_id=$1', [userId])).rows[0].secret_encrypted;
    const envelope = JSON.parse(stored); envelope.keyId = 'unavailable-key';
    await sql.query('UPDATE auth_mfa_factors SET secret_encrypted=$2 WHERE user_id=$1', [userId, JSON.stringify(envelope)]);
    const missing = await login(); expect(missing.response.status).toBe(503); expect(await missing.response.json()).toHaveProperty('error.code', 'MFA_KEY_UNAVAILABLE');
    await sql.query('UPDATE auth_mfa_factors SET secret_encrypted=$2 WHERE user_id=$1', [userId, stored]);
    const first = await login(); const tag = Buffer.from(JSON.parse(stored).tag, 'base64url'); tag[0] ^= 1;
    const tampered = { ...JSON.parse(stored), tag: tag.toString('base64url') };
    await sql.query('UPDATE auth_mfa_factors SET secret_encrypted=$2 WHERE user_id=$1', [userId, JSON.stringify(tampered)]);
    const invalid = await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge);
    expect(invalid.status).toBe(503); expect(await invalid.json()).toHaveProperty('error.code', 'MFA_SECRET_INVALID');
    expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_recovery_codes WHERE user_id=$1 AND consumed_at IS NOT NULL', [userId])).rows[0].n).toBe(0);
  });
  it('checks origin and strict bodies on every MFA mutation', async () => {
    for (const path of ['/enroll', '/verify', '/challenge', '/step-up', '/recovery/regenerate', '/revoke']) {
      expect((await request('/api/v1/auth/mfa' + path, {}, cookie, { origin: 'https://attacker.example' })).status).toBe(403);
    }
    expect((await request('/api/v1/auth/mfa/enroll', { currentPassword: password, userId: randomUUID() })).status).toBe(422);
    expect((await request('/api/v1/auth/mfa/revoke', { userId: randomUUID() })).status).toBe(422);
    expect((await request('/api/v1/auth/mfa/challenge', { code: '123456', recoveryCode: '01234567-89ABCDEF-01234567-89ABCDEF' }, '')).status).toBe(401);
  });
  it('rolls back recovery consumption and challenge completion when login audit fails', async () => {
    const active = await configure(), first = await login();
    const before = (await sql.query('SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1', [userId])).rows[0].n;
    await sql.query("CREATE OR REPLACE FUNCTION public.qa_mfa_login_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='auth.login' AND NEW.details->'after'->>'mfa'='true' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await sql.query('CREATE TRIGGER qa_mfa_login_audit_failure BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION public.qa_mfa_login_audit_failure()');
    try {
      const response = await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge);
      expect(response.status).toBe(500);
      expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_recovery_codes WHERE user_id=$1 AND consumed_at IS NOT NULL', [userId])).rows[0].n).toBe(0);
      expect((await sql.query('SELECT consumed_at FROM auth_mfa_challenges WHERE user_id=$1', [userId])).rows[0].consumed_at).toBeNull();
      expect((await sql.query('SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1', [userId])).rows[0].n).toBe(before);
    } finally {
      await sql.query('DROP TRIGGER IF EXISTS qa_mfa_login_audit_failure ON security_audit_log');
      await sql.query('DROP FUNCTION IF EXISTS public.qa_mfa_login_audit_failure()');
    }
    const retried = await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge);
    expect(retried.status).toBe(200);
  });
  it('rolls back factor activation and plaintext recovery generation when transactional audit fails', async () => {
    const pending = await enroll();
    await sql.query("CREATE OR REPLACE FUNCTION public.qa_mfa_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='auth.mfa.enabled' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await sql.query('CREATE TRIGGER qa_mfa_audit_failure BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION public.qa_mfa_audit_failure()');
    try {
      const response = await request('/api/v1/auth/mfa/verify', { enrollmentId: pending.enrollmentId, code: await token(pending.secret) });
      expect(response.status).toBe(500);
      expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_factors WHERE user_id=$1 AND enabled_at IS NOT NULL', [userId])).rows[0].n).toBe(0);
      expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_recovery_codes WHERE user_id=$1', [userId])).rows[0].n).toBe(0);
      expect((await request('/api/v1/auth/me')).status).toBe(200);
      expect((await sql.query('SELECT consumed_at FROM auth_mfa_enrollments WHERE id=$1', [pending.enrollmentId])).rows[0].consumed_at).toBeNull();
    } finally {
      await sql.query('DROP TRIGGER IF EXISTS qa_mfa_audit_failure ON security_audit_log');
      await sql.query('DROP FUNCTION IF EXISTS public.qa_mfa_audit_failure()');
    }
  });
  it('records request-correlated MFA events without secrets, tokens or recovery codes', async () => {
    const active = await configure(), first = await login();
    await request('/api/v1/auth/mfa/challenge', { recoveryCode: active.recoveryCodes[0] }, first.challenge);
    const events = (await sql.query('SELECT action,request_id,details,target FROM security_audit_log WHERE actor_user_id=$1', [userId])).rows;
    expect(events.some(event => event.action === 'auth.mfa.enabled')).toBe(true);
    expect(events.some(event => event.action === 'auth.mfa.challenge.created')).toBe(true);
    for (const event of events) expect(event.request_id).toMatch(/^[0-9a-f-]{36}$/);
    const serialized = JSON.stringify(events);
    for (const secret of [active.secret, password, cookie.split('=')[1], first.challenge.split('=')[1], ...active.recoveryCodes]) expect(serialized).not.toContain(secret);
  });
});
