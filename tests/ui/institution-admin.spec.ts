import {test, expect, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import argon2 from 'argon2';
import {randomBytes, randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret, digestRecoveryCode} from '../../src/shared/auth/mfa-primitives';

const sql = new pg.Client({connectionString: isolatedDatabaseUrl()});
const password = 'Synthetic-institution-administration-2026!';
let hash: string, institutionId: string, foreignId: string, username: string, loginCode: string, stepCode: string;

test.beforeAll(async () => {
  await sql.connect();
  hash = await argon2.hash(password, {type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1});
});
test.afterAll(async () => { await sql.end(); });
async function member(role: string, institution = institutionId) {
  const name = `ia-${role}-${randomUUID().slice(0, 8)}`;
  const person = (await sql.query("INSERT INTO people(first_name,last_name) VALUES('Identidad global','Conservada') RETURNING id")).rows[0].id;
  const user = (await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id', [person, name, hash])).rows[0].id;
  const membership = (await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id', [institution, user])).rows[0].id;
  await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)', [membership, role]);
  return {user, name};
}
test.beforeEach(async () => {
  await sql.query('DELETE FROM auth_throttle');
  institutionId = (await sql.query("INSERT INTO institutions(name,code) VALUES('QA administración sintética',$1) RETURNING id", [`IA${randomUUID().slice(0, 8)}`])).rows[0].id;
  foreignId = (await sql.query("INSERT INTO institutions(name,code) VALUES('QA ajena sintética',$1) RETURNING id", [`IF${randomUUID().slice(0, 8)}`])).rows[0].id;
  const actor = await member('admin');
  username = actor.name;
  const factor = (await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute') RETURNING id", [actor.user, sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', actor.user)])).rows[0].id;
  [loginCode, stepCode] = [randomBytes(16).toString('hex').toUpperCase(), randomBytes(16).toString('hex').toUpperCase()];
  for (const code of [loginCode, stepCode]) await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)', [actor.user, factor, digestRecoveryCode(code, actor.user)]);
});
async function login(page: Page, name: string, recovery?: string) {
  await page.goto('/login');
  await page.getByLabel('Usuario institucional').fill(name);
  await page.getByLabel('Contraseña', {exact: true}).fill(password);
  await page.getByRole('button', {name: 'Entrar al sistema'}).click();
  if (recovery) {
    await page.getByRole('button', {name: 'Usar código de recuperación', exact: true}).click();
    await page.getByLabel('Código de recuperación', {exact: true}).fill(recovery);
    await page.getByRole('button', {name: 'Verificar y entrar'}).click();
  }
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function administrator(page: Page) {
  await login(page, username, loginCode);
  await page.goto('/dashboard/security');
  await page.getByLabel('Contraseña actual para confirmar').fill(password);
  await page.getByRole('button', {name: 'Usar código de recuperación', exact: true}).click();
  await page.getByLabel('Código de recuperación para confirmar').fill(stepCode);
  await page.getByRole('button', {name: 'Confirmar identidad', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Renovar códigos de recuperación', exact: true})).toBeEnabled();
  await page.goto(`/dashboard/institutions/${institutionId}/admin`);
  await expect(page.getByRole('heading', {name: 'Administración institucional.'})).toBeVisible();
}
function origin() { return {Origin: String(test.info().project.use.baseURL)}; }
async function accessible(page: Page) {
  const result = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map(item => ({id: item.id, targets: item.nodes.map(node => node.target)}))).toEqual([]);
}

test('settings persist with a reason, audit, version and preserved global identity', async ({page}) => {
  test.setTimeout(120000);
  await administrator(page);
  const identity = await sql.query('SELECT u.username,p.first_name,p.last_name FROM platform_users u JOIN people p ON p.id=u.person_id WHERE u.username=$1', [username]);
  await page.getByLabel('Nombre de la institución', {exact: true}).fill('Institución corregida QA');
  await page.getByLabel('Nombre corto', {exact: true}).fill('QA corregida');
  await page.getByLabel('Motivo de la configuración').fill('Corrección institucional sintética');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name: 'Guardar configuración', exact: true}).click();
  await expect(page.getByRole('status').filter({hasText: 'Configuración guardada'})).toBeVisible();
  expect((await sql.query('SELECT name,short_name,admin_version AS version FROM institutions WHERE id=$1', [institutionId])).rows[0]).toMatchObject({name: 'Institución corregida QA', short_name: 'QA corregida', version: 1});
  expect((await sql.query('SELECT u.username,p.first_name,p.last_name FROM platform_users u JOIN people p ON p.id=u.person_id WHERE u.username=$1', [username])).rows).toEqual(identity.rows);
  await expect(page.getByRole('region', {name: 'Auditoría institucional'}).getByText('Corrección institucional sintética', {exact: true})).toBeVisible();
  await accessible(page);
  await page.setViewportSize({width: 390, height: 844});
  await page.getByRole('button', {name: 'Activar tema oscuro'}).click();
  await accessible(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a stale settings draft survives until an explicit reload and offline blocks writes', async ({page}) => {
  await administrator(page);
  await page.getByLabel('Nombre de la institución', {exact: true}).fill('Mi borrador conservado');
  await page.getByLabel('Motivo de la configuración').fill('Mi motivo conservado');
  const current = (await (await page.request.get(`/api/v1/institutions/${institutionId}/settings`)).json()).data;
  const response = await page.request.patch(`/api/v1/institutions/${institutionId}/settings`, {headers: origin(), data: {name: 'Edición concurrente', expectedVersion: current.version, reason: 'Otra edición sintética'}});
  expect(response.status()).toBe(200);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name: 'Guardar configuración', exact: true}).click();
  await expect(page.locator('#institution-admin-error')).toContainText('Otra persona modificó');
  await expect(page.locator('#institution-admin-error')).toBeFocused();
  await expect(page.getByLabel('Nombre de la institución', {exact: true})).toHaveValue('Mi borrador conservado');
  await expect(page.getByLabel('Motivo de la configuración')).toHaveValue('Mi motivo conservado');
  await expect(page.getByRole('button', {name: 'Guardar configuración', exact: true})).toBeDisabled();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name: 'Recargar configuración vigente', exact: true}).click();
  await expect(page.getByLabel('Nombre de la institución', {exact: true})).toHaveValue('Edición concurrente');
  await page.context().setOffline(true);
  await expect(page.getByRole('button', {name: 'Guardar configuración', exact: true})).toBeDisabled();
  await expect(page.getByText(/Sin conexión. Las operaciones/)).toBeVisible();
  await page.context().setOffline(false);
});

test('inactive management remains scoped and restores the institution without business access', async ({page}) => {
  await administrator(page);
  for (const status of ['inactive', 'suspended', 'active']) {
    await page.getByLabel('Nuevo estado institucional').selectOption(status);
    await page.getByLabel('Motivo del cambio institucional').fill(`Decisión sintética ${status}`);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', {name: 'Confirmar estado institucional', exact: true}).click();
    await expect(page.getByRole('status').filter({hasText: 'Estado institucional actualizado'})).toBeVisible();
    expect((await sql.query('SELECT status FROM institutions WHERE id=$1', [institutionId])).rows[0].status).toBe(status);
    if (status !== 'active') {
      await expect(page.getByRole('navigation', {name: 'Áreas administrativas'})).toHaveCount(0);
      expect((await page.request.get(`/api/v1/institutions/${institutionId}/memberships`)).status()).toBe(403);
      await page.goto('/dashboard');
      await page.getByRole('link', {name: /Administrar QA administración sintética/}).click();
      await expect(page.getByLabel('Nuevo estado institucional')).toBeVisible();
    }
  }
});

test('guest and coordinator cannot discover or open management for own or foreign institutions', async ({page}) => {
  for (const role of ['guest', 'coordinator']) {
    const actor = await member(role);
    await login(page, actor.name);
    await expect(page.getByRole('link', {name: /Administrar QA/})).toHaveCount(0);
    expect((await page.request.get(`/api/v1/institutions/${institutionId}/settings`)).status()).toBe(403);
    expect((await page.request.get(`/api/v1/institutions/${foreignId}/settings`)).status()).toBe(403);
    await page.goto(`/dashboard/institutions/${institutionId}/admin`);
    await expect(page.getByRole('button', {name: 'Guardar configuración', exact: true})).toHaveCount(0);
    await page.context().clearCookies();
  }
});

test('audit filters paginate real institution events and preserve invalid date drafts', async ({page}) => {
  test.setTimeout(120000);
  await administrator(page);
  let version = (await (await page.request.get(`/api/v1/institutions/${institutionId}/settings`)).json()).data.version;
  for (let index = 0; index < 11; index++) {
    const response = await page.request.patch(`/api/v1/institutions/${institutionId}/settings`, {headers: origin(), data: {shortName: `Página ${index}`, reason: `Auditoría paginada ${index}`, expectedVersion: version}});
    expect(response.status()).toBe(200);
    version = (await response.json()).data.version;
  }
  await page.getByRole('button', {name: 'Actualizar auditoría', exact: true}).click();
  await expect(page.locator('.sii-administration-events > li')).toHaveCount(10);
  await page.getByRole('button', {name: 'Auditoría: siguiente página'}).click();
  await expect(page.locator('.sii-administration-events > li')).toHaveCount(1);
  await page.getByRole('button', {name: 'Auditoría: página anterior'}).click();
  await expect(page.locator('.sii-administration-events > li')).toHaveCount(10);
  await page.getByLabel('Acción exacta').fill('institution.status.change');
  await page.getByLabel('Tipo de recurso').selectOption('institution');
  await page.getByRole('button', {name: 'Aplicar filtros de auditoría'}).click();
  await expect(page.getByText('No hay eventos para esta consulta.', {exact: true})).toBeVisible();
  await page.getByLabel('Desde', {exact: true}).fill('2026-10-16T12:00');
  await page.getByLabel('Hasta', {exact: true}).fill('2026-10-15T12:00');
  await page.getByRole('button', {name: 'Aplicar filtros de auditoría'}).click();
  await expect(page.locator('#institution-audit-filter-error')).toBeFocused();
  await expect(page.getByLabel('Desde', {exact: true})).toHaveValue('2026-10-16T12:00');
  await expect(page.getByLabel('Hasta', {exact: true})).toHaveValue('2026-10-15T12:00');
});

test('archived management is read-only and an authorization revocation disables a preserved draft', async ({page}) => {
  const initialAudit = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/institutions/${institutionId}/audit` && response.request().method() === 'GET');
  await administrator(page);
  expect((await initialAudit).status()).toBe(200);
  await expect(page.getByRole('region', {name: 'Auditoría institucional'})).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', {name: 'Guardar configuración', exact: true})).toBeEnabled();
  await page.getByLabel('Nombre de la institución', {exact: true}).fill('Borrador tras revocación');
  await page.getByLabel('Motivo de la configuración').fill('Intento sintético posterior a revocación');
  await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE membership_id IN (SELECT m.id FROM institution_memberships m JOIN platform_users u ON u.id=m.user_id WHERE m.institution_id=$1 AND u.username=$2)', [institutionId, username]);
  const deniedWrite = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/institutions/${institutionId}/settings` && response.request().method() === 'PATCH');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name: 'Guardar configuración', exact: true}).click();
  const denied = await deniedWrite;
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error?.code).toBe('FORBIDDEN');
  await expect(page.locator('#institution-admin-error')).toContainText('Tu autorización cambió');
  await expect(page.getByRole('button', {name: 'Guardar configuración', exact: true})).toBeDisabled();
  await expect(page.getByLabel('Nombre de la institución', {exact: true})).toHaveValue('Borrador tras revocación');
  await expect(page.getByRole('region', {name: 'Auditoría institucional'})).toHaveCount(0);
  await sql.query('UPDATE role_assignments SET revoked_at=NULL WHERE membership_id IN (SELECT m.id FROM institution_memberships m JOIN platform_users u ON u.id=m.user_id WHERE m.institution_id=$1 AND u.username=$2)', [institutionId, username]);
  await sql.query("UPDATE institutions SET status='archived' WHERE id=$1", [institutionId]);
  await page.reload();
  await expect(page.getByText('Esta institución está archivada. Su configuración y estado son de solo lectura.')).toBeVisible();
  await expect(page.getByLabel('Nombre de la institución', {exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Guardar configuración', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Confirmar estado institucional', exact: true})).toHaveCount(0);
  await accessible(page);
});

test('management requests real step-up and changing own institution clears the previous draft', async ({page}) => {
  test.setTimeout(120000);
  await login(page, username, loginCode);
  await page.goto(`/dashboard/institutions/${institutionId}/admin`);
  await expect(page.getByRole('button', {name: 'Guardar configuración', exact: true})).toHaveCount(0);
  await page.getByRole('link', {name: 'Configurar seguridad y volver', exact: true}).click();
  await page.getByLabel('Contraseña actual para confirmar').fill(password);
  await page.getByRole('button', {name: 'Usar código de recuperación', exact: true}).click();
  await page.getByLabel('Código de recuperación para confirmar').fill(stepCode);
  await page.getByRole('button', {name: 'Confirmar identidad', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Renovar códigos de recuperación', exact: true})).toBeEnabled();
  await page.getByRole('link', {name: 'Volver y reintentar la operación', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Guardar configuración', exact: true})).toBeEnabled();
  await page.getByLabel('Nombre de la institución', {exact: true}).fill('Borrador exclusivo de A');
  const actor = (await sql.query('SELECT id FROM platform_users WHERE username=$1', [username])).rows[0].id;
  const membership = (await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id', [foreignId, actor])).rows[0].id;
  await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'admin')", [membership]);
  await page.getByRole('link', {name: '← Mis instituciones', exact: true}).click();
  await page.getByRole('link', {name: 'Administrar QA ajena sintética', exact: true}).click();
  await expect(page.getByLabel('Nombre de la institución', {exact: true})).toHaveValue('QA ajena sintética');
  await expect(page.getByLabel('Motivo de la configuración')).toHaveValue('');
  await page.goto('/dashboard/institutions/not-a-uuid/admin');
  await expect(page.getByRole('heading', {name: '404'})).toBeVisible();
  const missing = randomUUID();
  await page.goto(`/dashboard/institutions/${missing}/admin`);
  await expect(page.getByRole('heading', {name: '404'})).toBeVisible();
});

test('manageable discovery paginates own active, inactive and suspended institutions', async ({page}) => {
  test.setTimeout(120000);
  const actor = (await sql.query('SELECT id FROM platform_users WHERE username=$1', [username])).rows[0].id;
  for (let index = 0; index < 10; index++) {
    const status = ['active', 'inactive', 'suspended'][index % 3];
    const id = (await sql.query('INSERT INTO institutions(name,code,status) VALUES($1,$2,$3) RETURNING id', [`Otra propia ${index}`, `IP${randomUUID().slice(0, 8)}`, status])).rows[0].id;
    const membership = (await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id', [id, actor])).rows[0].id;
    await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'admin')", [membership]);
  }
  await login(page, username, loginCode);
  const discovery = page.getByRole('region', {name: 'Instituciones administrables'});
  await expect(discovery.getByRole('link', {name: /^Administrar /})).toHaveCount(10);
  await discovery.getByRole('button', {name: 'Instituciones: siguiente página'}).click();
  await expect(discovery.getByRole('link', {name: /^Administrar /})).toHaveCount(1);
  await expect(discovery.getByRole('link', {name: 'Administrar QA administración sintética'})).toBeVisible();
  await discovery.getByRole('button', {name: 'Instituciones: página anterior'}).click();
  await expect(discovery.getByRole('link', {name: /^Administrar /})).toHaveCount(10);
  await expect(discovery.getByRole('link', {name: 'Administrar QA ajena sintética'})).toHaveCount(0);
});
