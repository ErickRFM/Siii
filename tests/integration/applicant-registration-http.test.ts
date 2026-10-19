import {beforeAll, afterAll, describe, expect, it} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';

const base = 'http://127.0.0.1:3107';
const db = new pg.Client({connectionString: isolatedDatabaseUrl()});
const email = 'lifecycle-' + randomUUID() + '@example.test';
const password = 'Synthetic-admissions-2026!';

async function post(path: string, body: unknown) {
  return fetch(base + path, {
    method: 'POST',
    headers: {'content-type': 'application/json', origin: base},
    body: JSON.stringify(body),
    redirect: 'manual',
  });
}

describe.sequential('real applicant registration and email verification (HTTP + PostgreSQL)', () => {
  beforeAll(async () => { await db.connect(); });
  afterAll(async () => { await db.end(); });

  it('persists unverified applicant, rejects login, verifies token once, then permits login', async () => {
    const register = await post('/api/v1/admissions/register', {
      email, firstName: 'Prueba', lastName: 'Integración',
      password, phone: '5551234567',
    });
    expect(register.status).toBe(201);
    const registered = (await register.json()).data;
    expect(registered.email).toBe(email);
    expect(registered.verificationToken).toEqual(expect.any(String));

    const before = await db.query(
      'SELECT id, email_verified_at, verification_token_hash FROM applicant_profiles WHERE email=$1',
      [email],
    );
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0].id).toBe(registered.id);
    expect(before.rows[0].email_verified_at).toBeNull();
    expect(before.rows[0].verification_token_hash).toEqual(expect.any(String));
    expect(before.rows[0].verification_token_hash).not.toBe(registered.verificationToken);

    const premature = await post('/api/v1/admissions/login', {email, password});
    expect(premature.status).not.toBe(200);
    const invalid = await post('/api/v1/admissions/verify', {token: randomUUID()});
    expect(invalid.status).toBe(400);
    const verify = await post('/api/v1/admissions/verify', {token: registered.verificationToken});
    expect(verify.status).toBe(200);

    const after = await db.query(
      'SELECT email_verified_at, verification_token_hash FROM applicant_profiles WHERE id=$1',
      [registered.id],
    );
    expect(after.rows[0].email_verified_at).not.toBeNull();
    expect(after.rows[0].verification_token_hash).toBeNull();
    const replay = await post('/api/v1/admissions/verify', {token: registered.verificationToken});
    expect(replay.status).toBe(400);
    const login = await post('/api/v1/admissions/login', {email, password});
    expect(login.status).toBe(200);
  }, 30000);
});
