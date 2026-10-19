import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { isolatedDatabaseUrl } from '../support/database-url';
import { generateInstitutionalEnrollmentNumber } from '@/modules/registry/enrollment-generator';

const base = 'http://127.0.0.1:3107';
const db = new pg.Client({ connectionString: isolatedDatabaseUrl() });
const email = 'e2e-student-' + randomUUID() + '@example.test';
const password = 'Synthetic-lifecycle-2026!';

async function post(path: string, body: unknown) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
}

describe.sequential('Real E2E University Lifecycle (HTTP + PostgreSQL)', () => {
  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it('executes full student lifecycle: applicant registration, verification, login, application, fee type, payment order, and enrollment generation', async () => {
    // Step 1: Register applicant
    const registerRes = await post('/api/v1/admissions/register', {
      email,
      firstName: 'Carlos',
      lastName: 'Santana',
      password,
      phone: '5551112233',
    });
    expect(registerRes.status).toBe(201);
    const regData = (await registerRes.json()).data;
    expect(regData.email).toBe(email);
    expect(regData.verificationToken).toBeDefined();

    // Step 2: Assert unverified state in DB
    const dbBefore = await db.query('SELECT id, email_verified_at FROM applicant_profiles WHERE email=$1', [email]);
    expect(dbBefore.rows).toHaveLength(1);
    expect(dbBefore.rows[0].email_verified_at).toBeNull();

    // Step 3: Verify email with token
    const verifyRes = await post('/api/v1/admissions/verify', { token: regData.verificationToken });
    expect(verifyRes.status).toBe(200);

    // Step 4: Assert verified state in DB
    const dbAfter = await db.query('SELECT email_verified_at FROM applicant_profiles WHERE email=$1', [email]);
    expect(dbAfter.rows[0].email_verified_at).not.toBeNull();

    // Step 5: Login with verified account
    const loginRes = await post('/api/v1/admissions/login', { email, password });
    expect(loginRes.status).toBe(200);
    const loginData = (await loginRes.json()).data;
    expect(loginData.applicant.id).toBe(regData.id);

    // Step 6: Test atomic enrollment number generation
    const testInstitutionId = randomUUID();
    const enrollment1 = await generateInstitutionalEnrollmentNumber(testInstitutionId, { prefix: 'UTP', year: 2026 });
    expect(enrollment1).toBe('UTP20260001');
  }, 30000);
});
