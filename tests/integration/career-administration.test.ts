import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';
import { fixtureCookie, fixtureMfaLogin } from '../support/mfa-fixture';
import { isolatedDatabaseUrl } from '../support/database-url';

const base = 'http://127.0.0.1:3107';
const database = new pg.Client({ connectionString: isolatedDatabaseUrl() });
const password = 'Synthetic-career-integration-2026!';
type Identity = { id: string; username: string; membershipId: string; grantId: string };
let hash: string;
let institutionId: string;
let otherInstitutionId: string;
let careerA: string;
let careerB: string;
let coordinator: Identity;
let administrator: Identity;
let student: Identity;

async function createUser(role: string, scopeId?: string): Promise<Identity> {
  const username = 'career-' + randomUUID();
  const person = (await database.query(
    "INSERT INTO people(first_name,last_name) VALUES('QA Career','Integration') RETURNING id",
  )).rows[0].id as string;
  const id = (await database.query(
    'INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',
    [person, username, hash],
  )).rows[0].id as string;
  const membershipId = (await database.query(
    'INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',
    [institutionId, id],
  )).rows[0].id as string;
  const grantId = (await database.query(
    'INSERT INTO role_assignments(membership_id,institution_id,role,scope_type,scope_program_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [membershipId, institutionId, role, scopeId ? 'program' : 'institution', scopeId ?? null],
  )).rows[0].id as string;
  return { id, username, membershipId, grantId };
}

async function login(account: Identity, withMfa = false): Promise<string> {
  const response = await fetch(base + '/api/v1/auth/login', {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ username: account.username, password }),
  });
  expect(response.status).toBe(200);
  return withMfa
    ? fixtureMfaLogin(database, base, account.username, password, response, false)
    : fixtureCookie(response);
}

async function readCareer(id: string, cookie: string, institution = institutionId) {
  return fetch(base + '/api/v1/institutions/' + institution + '/career-admin/' + id, {
    headers: { origin: base, cookie },
    cache: 'no-store',
  });
}

describe.sequential('career administration read authority, tenant isolation and revocation', () => {
  beforeAll(async () => {
    await database.connect();
    hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    institutionId = (await database.query(
      "INSERT INTO institutions(name,code) VALUES('Synthetic career one',$1) RETURNING id", [randomUUID()],
    )).rows[0].id as string;
    otherInstitutionId = (await database.query(
      "INSERT INTO institutions(name,code) VALUES('Synthetic career other',$1) RETURNING id", [randomUUID()],
    )).rows[0].id as string;
    careerA = (await database.query(
      "INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'CAREER-A','Technology','ingenieria','presencial') RETURNING id",
      [institutionId],
    )).rows[0].id as string;
    careerB = (await database.query(
      "INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'CAREER-B','Business','ingenieria','presencial') RETURNING id",
      [institutionId],
    )).rows[0].id as string;
    await database.query(
      "INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,'QA-A-0001','Student','Technology'),($1,$3,'QA-B-0002','Student','Business')",
      [institutionId, careerA, careerB],
    );
    administrator = await createUser('super_admin');
    coordinator = await createUser('coordinator', careerA);
    student = await createUser('student');
  });

  afterAll(async () => { await database.end(); });

  it('lists only requested career students and does not leak records from another career', async () => {
    const cookie = await login(administrator, true);
    const response = await readCareer(careerA, cookie);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.program).toMatchObject({ id: careerA, code: 'CAREER-A' });
    expect(data.students).toHaveLength(1);
    expect(data.students[0]).toMatchObject({ enrollmentNumber: 'QA-A-0001' });
    expect(JSON.stringify(data)).not.toContain('QA-B-0002');
    expect(data.teachers).toEqual([]);
    expect(data.sections).toEqual([]);
    expect(data.truncated).toEqual({ students: false, teachers: false, sections: false });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('requires MFA for the delegated administrator without breaking ordinary academic access', async () => {
    const withoutMfa = await login(coordinator);
    expect((await readCareer(careerA, withoutMfa)).status).toBe(403);
    const withMfa = await login(coordinator, true);
    expect((await readCareer(careerA, withMfa)).status).toBe(200);
    expect((await readCareer(careerB, withMfa)).status).toBe(403);
    expect((await readCareer(careerA, withMfa, otherInstitutionId)).status).toBe(403);
    expect((await readCareer(careerA, withMfa)).status).toBe(200);
  });

  it('rejects students, missing programs and revoked scoped career grants', async () => {
    const studentSession = await login(student);
    expect((await readCareer(careerA, studentSession)).status).toBe(403);
    const adminSession = await login(administrator, true);
    expect((await readCareer(randomUUID(), adminSession)).status).toBe(404);
    const scopedSession = await login(coordinator, true);
    await database.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1', [coordinator.grantId]);
    expect((await readCareer(careerA, scopedSession)).status).toBe(403);
  });
});
