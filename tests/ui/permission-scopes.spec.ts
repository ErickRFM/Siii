import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { generate } from 'otplib';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { isolatedDatabaseUrl } from '../support/database-url';
import { sealMfaSecret, digestRecoveryCode } from '../../src/shared/auth/mfa-primitives';

const sql = new pg.Client({ connectionString: isolatedDatabaseUrl() });
const suffix = randomUUID().slice(0, 8);
const password = 'Synthetic-scopes-ui-password-2026!';
const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const recoveryCode = '11111111-22222222-33333333-44444444';
let institutionId: string, programId: string, targetMembershipId: string;
const users = { coordinator: `scope-coord-${suffix}`, guest: `scope-guest-${suffix}`, admin: `scope-admin-${suffix}`, onboarding: `scope-onboard-${suffix}`, protected: `scope-protected-${suffix}` };

test.beforeAll(async () => {
  await sql.connect();
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  institutionId = (await sql.query("INSERT INTO institutions(name,code) VALUES('QA ámbitos — datos sintéticos',$1) RETURNING id", [`SC${suffix}`])).rows[0].id;
  for (const [code, name] of [['SC-A', 'Programa autorizado'], ['SC-B', 'Programa ajeno']]) {
    const id = (await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,$3,'ingenieria','presencial') RETURNING id", [institutionId, code, name])).rows[0].id;
    if (code === 'SC-A') programId = id;
    await sql.query('INSERT INTO curriculum_versions(institution_id,program_id,version) VALUES($1,$2,$3)', [institutionId, id, `2026-${code}`]);
  }
  for (const [profile, username] of Object.entries(users)) {
    const personId = (await sql.query("INSERT INTO people(first_name,last_name) VALUES($1,'Local') RETURNING id", [`QA ${profile}`])).rows[0].id;
    const userId = (await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id', [personId, username, hash])).rows[0].id;
    const membershipId = (await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id', [institutionId, userId])).rows[0].id;
    const role = profile === 'coordinator' ? 'coordinator' : profile === 'guest' ? 'guest' : 'admin';
    await sql.query("INSERT INTO role_assignments(membership_id,institution_id,role,scope_type,scope_program_id) VALUES($1,$2,$3,$4,$5)", [membershipId, institutionId, role, profile === 'coordinator' ? 'program' : 'institution', profile === 'coordinator' ? programId : null]);
    if (profile === 'guest') targetMembershipId = membershipId;
    if (profile === 'admin'||profile==='protected') {
      const factorId = (await sql.query('INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval \'1 minute\') RETURNING id', [userId, sealMfaSecret(secret, userId)])).rows[0].id;
      await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)', [userId, factorId, digestRecoveryCode(recoveryCode, userId)]);
    }
  }
});
test.beforeEach(async () => { await sql.query('DELETE FROM auth_throttle'); });
test.afterAll(async () => { await sql.end(); });

async function signIn(page: Page, username: string, factor = false) {
  await page.goto('/login');
  await page.getByLabel('Usuario institucional').fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  if (factor) {
    await page.getByLabel('Código del autenticador', { exact: true }).fill(await generate({ secret, algorithm: 'sha1', digits: 6, period: 30, crypto: new NodeCryptoPlugin() }));
    const result=page.waitForResponse(response=>response.url().endsWith('/api/v1/auth/mfa/challenge')&&response.request().method()==='POST');
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    expect((await result).status()).toBe(200);
  }
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
}

test('program scope filters navigation and records without offering unrelated creation', async ({ page }) => {
  await signIn(page, users.coordinator);
  await page.goto(`/dashboard/institutions/${institutionId}/academic`);
  await expect(page.getByRole('tab', { name: 'Programas', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Materias', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Periodos', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Campus', exact: true })).toHaveCount(0);
  await expect(page.getByText('Programa autorizado', { exact: true })).toBeVisible();
  await expect(page.getByText('Programa ajeno', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar registro' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(1);
  await page.getByRole('tab', { name: 'Programas', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Planes', exact: true })).toBeFocused();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByLabel('Programa académico').locator('option')).toHaveCount(2);
  await accessible(page);
});

test('guest sees institutional disclosure and no academic or role navigation', async ({ page }) => {
  await signIn(page, users.guest);
  await page.goto(`/dashboard/institutions/${institutionId}`);
  await expect(page.getByText('Invitado', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Catálogo académico|Abrir catálogo/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Roles y ámbitos', exact: true })).toHaveCount(0);
  await page.goto(`/dashboard/institutions/${institutionId}/academic`);
  await expect(page.getByText('No tienes acceso a catálogos académicos.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar registro' })).toHaveCount(0);
  await accessible(page);
});

test('required MFA directs onboarding to account security with a safe return link', async ({ page }) => {
  await signIn(page, users.onboarding);
  await page.goto(`/dashboard/institutions/${institutionId}`);
  await expect(page.getByText(/Configura un autenticador para acceder a esta institución/)).toBeVisible();
  await page.getByRole('link', { name: 'Configurar seguridad y volver', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/security\?returnTo=/);
  await expect(page.getByRole('link', { name: 'Volver y reintentar la operación', exact: true })).toHaveAttribute('href', `/dashboard/institutions/${institutionId}`);
  await expect(page.getByLabel('Contraseña actual para activar')).toBeVisible();
  await accessible(page);
});

test('security return navigation rejects an external destination', async ({ page }) => {
  await signIn(page, users.guest);
  await page.goto('/dashboard/security?returnTo=%2F%2Fexample.org');
  await expect(page.getByLabel('Contraseña actual para activar')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver y reintentar la operación', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Configurar seguridad y volver', exact: true })).toHaveCount(0);
});

test('role assignment requires real step-up and revokes the selected scoped grant', async ({ page, context }) => {
  test.setTimeout(120000);
  await signIn(page, users.admin, true);
  await page.goto(`/dashboard/institutions/${institutionId}/roles`);
  await expect(page.getByRole('heading', { name: 'Roles y ámbitos.' })).toBeVisible();
  await page.getByLabel('Membresía').selectOption(targetMembershipId);
  await page.getByLabel('Ámbito').selectOption('program');
  await page.getByLabel('Programa').selectOption(programId);
  await expect(page.getByLabel('Perfil')).toBeEnabled();
  await page.getByLabel('Perfil').selectOption('coordinator');
  await page.getByLabel('Vence el').fill('2030-12-31T18:00');
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Conceder perfil', exact: true })).toBeDisabled();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Conceder perfil', exact: true }).click();
  await expect(page.locator('#roles-error')).toContainText('Confirma tu identidad');
  await expect(page.locator('#roles-error')).toBeFocused();
  expect((await sql.query("SELECT count(*)::int AS total FROM role_assignments WHERE membership_id=$1 AND role='coordinator' AND revoked_at IS NULL", [targetMembershipId])).rows[0].total).toBe(0);
  await page.getByRole('link', { name: 'Configurar seguridad y volver', exact: true }).click();
  await page.getByLabel('Contraseña actual para confirmar').fill(password);
  await page.getByRole('button', { name: 'Usar código de recuperación', exact: true }).click();
  await page.getByLabel('Código de recuperación para confirmar').fill(recoveryCode);
  await page.getByRole('button', { name: 'Confirmar identidad', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Renovar códigos de recuperación', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'Volver y reintentar la operación', exact: true }).click();
  await page.getByLabel('Membresía').selectOption(targetMembershipId);
  await page.getByLabel('Ámbito').selectOption('program');
  await page.getByLabel('Programa').selectOption(programId);
  await expect(page.getByLabel('Perfil')).toBeEnabled();
  await page.getByLabel('Perfil').selectOption('coordinator');
  await page.getByLabel('Vence el').fill('2030-12-31T18:00');
  await page.getByRole('button', { name: 'Conceder perfil', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Perfil concedido' })).toBeVisible();
  const grant = page.locator('tbody tr').filter({ hasText: users.guest }).filter({ hasText: 'Coordinación' });
  await expect(grant).toContainText('Programa autorizado');
  await expect(grant).toContainText('2030');
  await accessible(page);
  page.once('dialog', dialog => dialog.accept());
  await grant.getByRole('button', { name: 'Revocar concesión', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Concesión revocada' })).toBeVisible();
  await expect(grant).toHaveCount(0);
  expect((await sql.query("SELECT count(*)::int AS total FROM role_assignments WHERE membership_id=$1 AND role='guest' AND revoked_at IS NULL", [targetMembershipId])).rows[0].total).toBe(1);
});

test('privileged MFA remains required after fresh step-up and cannot be revoked', async ({page})=>{
  await signIn(page,users.protected,true);
  await page.goto('/dashboard/security');
  await page.getByLabel('Contraseña actual para confirmar').fill(password);
  await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();
  await page.getByLabel('Código de recuperación para confirmar').fill(recoveryCode);
  await page.getByRole('button',{name:'Confirmar identidad',exact:true}).click();
  await expect(page.getByRole('button',{name:'Renovar códigos de recuperación',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Desactivar autenticador y cerrar otros dispositivos',exact:true})).toBeDisabled();
  await expect(page.getByText('No puedes desactivar el autenticador mientras mantengas perfiles privilegiados vigentes.',{exact:true})).toBeVisible();
  const rejected=await page.request.post('/api/v1/auth/mfa/revoke',{data:{},headers:{Origin:'http://127.0.0.1:3107'}});
  expect(rejected.status()).toBe(403);
  expect((await rejected.json()).error.code).toBe('MFA_REQUIRED_BY_ROLE');
  expect((await sql.query("SELECT count(*)::int AS total FROM auth_mfa_factors WHERE user_id=(SELECT id FROM platform_users WHERE username=$1) AND enabled_at IS NOT NULL AND revoked_at IS NULL AND secret_encrypted IS NOT NULL",[users.protected])).rows[0].total).toBe(1);
  await accessible(page);
});

test('returning focus rechecks capabilities while preserving an open draft and fails closed on denial', async ({ page }) => {
  await signIn(page, users.coordinator);
  await page.goto(`/dashboard/institutions/${institutionId}/academic`);
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Borrador sin guardar');
  const path = `/api/v1/institutions/${institutionId}/capabilities`;
  const capabilities = (await (await page.request.get(path)).json()).data;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**' + path, async route => { await pending; await route.fulfill({ json: { data: capabilities } }); });
  const refreshed = page.waitForRequest(request => request.url().endsWith(path), { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  // A background refresh must not temporarily unmount the editor.
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador sin guardar');
  const refreshedResponse = page.waitForResponse(response => response.url().endsWith(path));
  release();
  await refreshedResponse;
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador sin guardar');
  await page.unroute('**' + path);
  await page.route('**' + path, route => route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } }));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('main').getByRole('alert')).toContainText('No tienes acceso vigente');
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Roles y ámbitos', exact: true })).toHaveCount(0);
  await page.unroute('**' + path);
  let recover!: () => void;
  const recovering = new Promise<void>(resolve => { recover = resolve; });
  await page.route('**' + path, async route => { await recovering; await route.fulfill({ json: { data: capabilities } }); });
  const recoveryRequest = page.waitForRequest(request => request.url().endsWith(path));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await recoveryRequest;
  // Keep the known failure visible until revalidation succeeds, instead of flashing
  // an inaccurate empty-permissions state while no projection is available.
  try {
    await expect(page.locator('main').getByRole('alert')).toContainText('No tienes acceso vigente');
    await expect(page.getByText('No tienes acceso a catálogos académicos.', { exact: true })).toHaveCount(0);
  } finally { recover(); }
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador sin guardar');
});


test('real MFA enrollment and step-up refresh the original institutional tab after session rotation', async ({ page, context }) => {
  test.setTimeout(120000);
  await signIn(page, users.onboarding);
  await page.goto(`/dashboard/institutions/${institutionId}`);
  await expect(page.getByText('Configura un autenticador para acceder a esta institución.', { exact: true })).toBeVisible();
  const security = await context.newPage();
  try {
    await security.goto('/dashboard/security?returnTo=' + encodeURIComponent(`/dashboard/institutions/${institutionId}/grading`));
    await expect(security.getByRole('link', { name: 'Volver y reintentar la operación', exact: true })).toHaveAttribute('href', `/dashboard/institutions/${institutionId}/grading`);
    await security.getByLabel('Contraseña actual para activar').fill(password);
    await security.getByRole('button', { name: 'Configurar autenticador', exact: true }).click();
    const manual = await security.getByLabel('Clave manual del autenticador').inputValue();
    await security.getByLabel('Código para activar el autenticador').fill(await generate({ secret: manual, algorithm: 'sha1', digits: 6, period: 30, crypto: new NodeCryptoPlugin() }));
    const verified = security.waitForResponse(response => response.url().endsWith('/api/v1/auth/mfa/verify') && response.request().method() === 'POST');
    await security.getByRole('button', { name: 'Activar autenticador', exact: true }).click();
    expect((await verified).status()).toBe(200);
    const recovery = security.getByRole('region', { name: 'Guarda estos códigos de recuperación' });
    await expect(recovery.locator('code')).toHaveCount(10);
    const recoveryCode = await recovery.locator('code').first().textContent();
    const path = `/api/v1/institutions/${institutionId}/capabilities`;
    const enabled = page.waitForResponse(response => response.url().endsWith(path), { timeout: 10000 });
    await page.bringToFront();
    // Headless Chromium can keep both tabs visible without emitting native focus.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const enrollmentCapabilities = (await (await enabled).json()).data;
    expect(enrollmentCapabilities.restricted).toBe(false);
    expect(enrollmentCapabilities.assurance).toMatchObject({ mfaConfigured: true, mfaVerified: true, stepUpExpiresAt: null });
    await expect(page.getByRole('link', { name: 'Roles y ámbitos', exact: true }).first()).toBeVisible();
    await security.bringToFront();
    await security.getByLabel('Contraseña actual para confirmar').fill(password);
    await security.getByRole('button', { name: 'Usar código de recuperación', exact: true }).click();
    await security.getByLabel('Código de recuperación para confirmar').fill(recoveryCode!);
    await security.getByRole('button', { name: 'Confirmar identidad', exact: true }).click();
    await expect(security.getByRole('button', { name: 'Renovar códigos de recuperación', exact: true })).toBeEnabled();
    const elevated = page.waitForResponse(response => response.url().endsWith(path), { timeout: 10000 });
    await page.bringToFront();
    // Headless Chromium can keep both tabs visible without emitting native focus.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const elevatedCapabilities = (await (await elevated).json()).data;
    expect(elevatedCapabilities.restricted).toBe(false);
    expect(new Date(elevatedCapabilities.assurance.stepUpExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect((await page.request.get(path)).status()).toBe(200);
  } finally { await security.close(); }
});
