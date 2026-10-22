import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {fixtureCookie, fixtureMfaLogin} from '../support/mfa-fixture';

const sql = new pg.Client({connectionString: isolatedDatabaseUrl()});
const base = 'http://127.0.0.1:' + (process.env.SIII_TEST_PORT || 3107);
const paths = ['admissions/applications', 'financials/orders'] as const;
const password = 'Synthetic-sensitive-lists-2026!';
const suffix = randomUUID().slice(0, 8);
type Actor = {user: string; username: string; cookie: string};
let tenant: string, other: string, application: string, order: string;
let privateName: string, admin: Actor, superAdmin: Actor, passwordOnlyAdmin: Actor;
const readers = new Map<string, Actor>();

async function actor(role: string, name: string): Promise<Actor> {
  const person = (await sql.query("INSERT INTO people(first_name,last_name) VALUES('QA','Sensitive lists') RETURNING id")).rows[0].id;
  const username = `sensitive-${name}-${suffix}`;
  const hash = await argon2.hash(password, {type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1});
  const user = (await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id', [person, username, hash])).rows[0].id;
  const membership = (await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id', [tenant, user])).rows[0].id;
  await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)', [membership, role]);
  const login = await fetch(base + '/api/v1/auth/login', {method: 'POST', headers: {origin: base, 'content-type': 'application/json'}, body: JSON.stringify({username, password})});
  expect(login.status).toBe(200);
  return {user, username, cookie: fixtureCookie(login)};
}

async function get(path: string, cookie = '', institution = tenant) {
  return fetch(`${base}/api/v1/institutions/${institution}/${path}`, {headers: {cookie}, redirect: 'manual'});
}

describe.sequential('sensitive institutional lists through real HTTP and PostgreSQL', () => {
  beforeAll(async () => {
    await sql.connect();
    await sql.query('DELETE FROM auth_throttle');
    const units = (await sql.query("INSERT INTO institutions(name,code) VALUES('QA Sensitive lists',$1),('QA Other sensitive tenant',$2) RETURNING id", ['SL' + suffix, 'SX' + suffix])).rows;
    tenant = units[0].id; other = units[1].id;
    privateName = 'PrivateApplicant-' + suffix;
    const program = (await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'SENSITIVE','QA program','ingenieria','presencial') RETURNING id", [tenant])).rows[0].id;
    const cycle = (await sql.query("INSERT INTO admission_cycles(institution_id,code,name,start_date,end_date,status) VALUES($1,'QA','QA cycle','2026-01-01','2026-12-31','open') RETURNING id", [tenant])).rows[0].id;
    const applicant = (await sql.query("INSERT INTO applicant_profiles(email,first_name,last_name,password_hash) VALUES($1,$2,'Synthetic','not-used-for-login') RETURNING id", [`sensitive-${suffix}@example.test`, privateName])).rows[0].id;
    application = (await sql.query("INSERT INTO admission_applications(institution_id,cycle_id,applicant_id,program_id,application_number,status) VALUES($1,$2,$3,$4,'QA-PRIVATE','submitted') RETURNING id", [tenant, cycle, applicant, program])).rows[0].id;
    const fee = (await sql.query("INSERT INTO financial_fee_types(institution_id,code,name,default_amount_cents) VALUES($1,'QA','QA fee',500) RETURNING id", [tenant])).rows[0].id;
    order = (await sql.query("INSERT INTO payment_orders(institution_id,order_number,fee_type_id,total_amount_cents) VALUES($1,'QA-PRIVATE',$2,500) RETURNING id", [tenant, fee])).rows[0].id;
    // A populated second tenant makes an accidentally unscoped success query fail as well.
    const otherProgram = (await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'OTHER','Other synthetic program','ingenieria','presencial') RETURNING id", [other])).rows[0].id;
    const otherCycle = (await sql.query("INSERT INTO admission_cycles(institution_id,code,name,start_date,end_date,status) VALUES($1,'OTHER','Other cycle','2026-01-01','2026-12-31','open') RETURNING id", [other])).rows[0].id;
    await sql.query("INSERT INTO admission_applications(institution_id,cycle_id,applicant_id,program_id,application_number,status) VALUES($1,$2,$3,$4,'OTHER-PRIVATE','submitted')", [other, otherCycle, applicant, otherProgram]);
    const otherFee = (await sql.query("INSERT INTO financial_fee_types(institution_id,code,name,default_amount_cents) VALUES($1,'OTHER','Other fee',900) RETURNING id", [other])).rows[0].id;
    await sql.query("INSERT INTO payment_orders(institution_id,order_number,fee_type_id,total_amount_cents) VALUES($1,'OTHER-PRIVATE',$2,900)", [other, otherFee]);
    for (const role of ['student', 'guest', 'workshop_participant', 'teacher_pending']) readers.set(role, await actor(role, role));
    passwordOnlyAdmin = await actor('admin', 'password-only');
    admin = await actor('admin', 'verified');
    // Enroll and verify with the same real HTTP flow used by the existing auth suites.
    const login = await fetch(base + '/api/v1/auth/login', {method: 'POST', headers: {origin: base, 'content-type': 'application/json'}, body: JSON.stringify({username: admin.username, password})});
    expect(login.status).toBe(200);
    admin.cookie = await fixtureMfaLogin(sql, base, admin.username, password, login, false);
    superAdmin = await actor('super_admin', 'super-admin');
    const superLogin = await fetch(base + '/api/v1/auth/login', {method: 'POST', headers: {origin: base, 'content-type': 'application/json'}, body: JSON.stringify({username: superAdmin.username, password})});
    expect(superLogin.status).toBe(200);
    superAdmin.cookie = await fixtureMfaLogin(sql, base, superAdmin.username, password, superLogin, false);
  }, 30000);
  afterAll(async () => {await sql.end();});

  for (const path of paths) {
    describe(path, () => {
      it('preserves 401 without a session and returns no data', async () => {
        const response = await get(path);
        expect(response.status).toBe(401);
        expect(await response.json()).not.toHaveProperty('data');
      });
      it.each(['student', 'guest', 'workshop_participant', 'teacher_pending'])('denies %s even with an active institutional membership', async role => {
        const response = await get(path, readers.get(role)!.cookie);
        expect(response.status).toBe(403);
        expect(await response.json()).not.toHaveProperty('data');
      });
      it('requires MFA for an institutional administrator', async () => {
        const response = await get(path, passwordOnlyAdmin.cookie);
        expect(response.status).toBe(403);
        expect(await response.json()).not.toHaveProperty('data');
      });
      it('preserves the successful projection for an administrator with MFA', async () => {
        const response = await get(path, admin.cookie);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].id).toBe(path === 'admissions/applications' ? application : order);
        if (path === 'admissions/applications') expect(body.data[0]).toMatchObject({institutionId: tenant, applicantFirstName: privateName});
        else expect(body.data[0]).toMatchObject({orderNumber: 'QA-PRIVATE', totalAmountCents: 500, paidAmountCents: 0});
      });
      it('denies an administrator of a different institution', async () => {
        const response = await get(path, admin.cookie, other);
        expect(response.status).toBe(403);
        expect(await response.json()).not.toHaveProperty('data');
      });
      it('allows a super administrator only within its institutional grant', async () => {
        const response = await get(path, superAdmin.cookie);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].id).toBe(path === 'admissions/applications' ? application : order);
        const denied = await get(path, superAdmin.cookie, other);
        expect(denied.status).toBe(403);
        expect(await denied.json()).not.toHaveProperty('data');
      });
    });
  }

  it.each(['student', 'guest', 'workshop_participant', 'teacher_pending', 'password-only-admin'])('does not serialize applicant PII in SSR for %s', async role => {
    const cookie = role === 'password-only-admin' ? passwordOnlyAdmin.cookie : readers.get(role)!.cookie;
    const response = await fetch(`${base}/dashboard/institutions/${tenant}/admissions`, {headers: {cookie}, redirect: 'manual'});
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/dashboard');
    expect(await response.text()).not.toContain(privateName);
  });
  it('keeps the administrative admissions page available with MFA', async () => {
    const response = await fetch(`${base}/dashboard/institutions/${tenant}/admissions`, {headers: {cookie: admin.cookie}, redirect: 'manual'});
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(privateName);
  });
  it('denies SSR in a different institution even to a verified administrator', async () => {
    const response = await fetch(`${base}/dashboard/institutions/${other}/admissions`, {headers: {cookie: admin.cookie}, redirect: 'manual'});
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/dashboard');
    expect(await response.text()).not.toContain(privateName);
  });
  it('rechecks suspended membership and inactive institution', async () => {
    await sql.query("UPDATE institution_memberships SET status='suspended' WHERE institution_id=$1 AND user_id=$2", [tenant, admin.user]);
    for (const path of paths) expect((await get(path, admin.cookie)).status).toBe(403);
    await sql.query("UPDATE institution_memberships SET status='active' WHERE institution_id=$1 AND user_id=$2", [tenant, admin.user]);
    await sql.query("UPDATE institutions SET status='inactive' WHERE id=$1", [tenant]);
    for (const path of paths) expect((await get(path, admin.cookie)).status).toBe(403);
    await sql.query("UPDATE institutions SET status='active' WHERE id=$1", [tenant]);
  });
  it('rejects a revoked session', async () => {
    await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [admin.user]);
    for (const path of paths) expect((await get(path, admin.cookie)).status).toBe(401);
  });
});
