import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { generate } from 'otplib';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { isolatedDatabaseUrl } from '../support/database-url';

const sql = new pg.Client({ connectionString: isolatedDatabaseUrl() });
const username = `qa-mfa-${randomUUID().slice(0, 8)}`;
const password = 'Synthetic-mfa-ui-password-2026!';

test.beforeAll(async () => {
  await sql.connect();
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  const person = (await sql.query("INSERT INTO people(first_name,last_name) VALUES('QA MFA','Local') RETURNING id")).rows[0].id;
  await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3)', [person, username, hash]);
});
test.afterAll(async () => { await sql.end(); });

async function credentials(page: Page, name = username) {
  await page.goto('/login');
  await page.getByLabel('Usuario institucional').fill(name);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
}
async function accessible(page: Page) {
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(audit.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))).toEqual([]);
}

test('real enrollment, cookie challenge, recovery consumption, step-up, renewal and revocation', async ({ page, context, browser }) => {
  test.setTimeout(150000);
  await credentials(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/security');
  await expect(page.getByText('No tienes un autenticador activo.', { exact: true })).toBeVisible();
  await page.getByLabel('Contraseña actual para activar').fill(password);
  await page.getByRole('button', { name: 'Configurar autenticador', exact: true }).click();
  const secret = await page.getByLabel('Clave manual del autenticador').inputValue();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await expect(page.getByLabel('Código para activar el autenticador')).toBeFocused();
  await accessible(page);
  const token = await generate({ secret, algorithm: 'sha1', digits: 6, period: 30, crypto: new NodeCryptoPlugin(), epoch: Math.floor(Date.now() / 1000) });
  await page.getByLabel('Código para activar el autenticador').fill(token);
  await page.getByRole('button', { name: 'Activar autenticador', exact: true }).click();
  const recovery = page.getByRole('region', { name: 'Guarda estos códigos de recuperación' });
  await expect(recovery.locator('li')).toHaveCount(10);
  const originalCodes = await recovery.locator('code').allTextContents();
  await expect(recovery).toBeFocused();
  await expect(page.getByLabel('Clave manual del autenticador')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ya guardé mis códigos; ocultarlos' }).click();
  await expect(recovery).toHaveCount(0);
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await credentials(page);
  await expect(page.getByLabel('Código del autenticador', { exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveCount(0);
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
  await accessible(page);
  await page.getByRole('button', { name: 'Usar código de recuperación', exact: true }).click();
  await page.getByLabel('Código de recuperación', { exact: true }).fill(originalCodes[0]);
  const sent = page.waitForRequest(request => request.url().endsWith('/api/v1/auth/mfa/challenge') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  expect((await sent).postDataJSON()).toEqual({ recoveryCode: originalCodes[0] });
  await expect(page).toHaveURL(/\/dashboard$/);

  // A different browser context cannot replay the consumed recovery code.
  const second = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const other = await second.newPage();
    await credentials(other);
    await expect(other.getByLabel('Código del autenticador', { exact: true })).toBeVisible();
    await other.getByRole('button', { name: 'Usar código de recuperación', exact: true }).click();
    await other.getByLabel('Código de recuperación', { exact: true }).fill(originalCodes[0]);
    await other.getByRole('button', { name: 'Verificar y entrar' }).click();
    await expect(other.locator('#sii-login-error')).toContainText('ya se utilizó');
    await expect(other.locator('#sii-login-error')).toBeFocused();
    await expect(other.getByLabel('Código de recuperación', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect((await other.request.get('/api/v1/auth/me')).status()).toBe(401);
  } finally { await second.close(); }

  await page.goto('/dashboard/security');
  await expect(page.getByRole('status').filter({ hasText: '9 códigos de recuperación disponibles' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Renovar códigos de recuperación', exact: true })).toBeDisabled();
  await context.setOffline(true);
  await expect(page.getByText(/Sin conexión/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar identidad', exact: true })).toBeDisabled();
  await context.setOffline(false);
  await page.getByLabel('Contraseña actual para confirmar').fill(password);
  await page.getByRole('button', { name: 'Usar código de recuperación', exact: true }).click();
  await page.getByLabel('Código de recuperación para confirmar').fill(originalCodes[1]);
  await page.getByRole('button', { name: 'Confirmar identidad', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Renovar códigos de recuperación', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Renovar códigos de recuperación', exact: true }).click();
  await expect(recovery.locator('li')).toHaveCount(10);
  const replacementCodes = await recovery.locator('code').allTextContents();
  expect(replacementCodes.some(code => originalCodes.includes(code))).toBe(false);
  await accessible(page);
  await page.getByRole('button', { name: 'Ya guardé mis códigos; ocultarlos' }).click();
  await page.getByRole('button', { name: 'Desactivar autenticador y cerrar otros dispositivos', exact: true }).click();
  await expect(page.getByText('No tienes un autenticador activo.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await credentials(page);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('expired enrollment returns to a focused password form and creates a new manual key', async ({ page }) => {
  const name = `qa-mfa-expired-${randomUUID().slice(0, 8)}`;
  const person = (await sql.query("INSERT INTO people(first_name,last_name) VALUES('QA MFA Expired','Local') RETURNING id")).rows[0].id;
  await sql.query('INSERT INTO platform_users(person_id,username,password_hash) SELECT $1,$2,password_hash FROM platform_users WHERE username=$3', [person, name, username]);
  await credentials(page, name); await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/security');
  await expect(page.getByText('No tienes un autenticador activo.', { exact: true })).toBeVisible();
  await page.getByLabel('Contraseña actual para activar').fill(password);
  const enrollmentResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/mfa/enroll') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Configurar autenticador', exact: true }).click();
  const started = await enrollmentResponse;
  expect(started.status()).toBe(201);
  const enrollmentId = (await started.json()).data.enrollmentId as string;
  const secret = await page.getByLabel('Clave manual del autenticador').inputValue();
  // A fixed past instant avoids comparing a one-second margin across process clocks.
  const expired = await sql.query<{id: string; expires_at: Date; expired: boolean}>("UPDATE auth_mfa_enrollments SET expires_at=TIMESTAMPTZ '2000-01-01T00:00:00Z' WHERE id=$1 AND user_id=(SELECT id FROM platform_users WHERE username=$2) RETURNING id,expires_at,expires_at<clock_timestamp() AS expired", [enrollmentId, name]);
  expect(expired.rowCount).toBe(1);
  expect(expired.rows[0].id).toBe(enrollmentId);
  expect(expired.rows[0].expired).toBe(true);
  expect(expired.rows[0].expires_at.getTime()).toBeLessThan(Date.now());
  await page.getByLabel('Código para activar el autenticador').fill(await generate({ secret, algorithm: 'sha1', digits: 6, period: 30, crypto: new NodeCryptoPlugin() }));
  const verificationResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/mfa/verify') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Activar autenticador', exact: true }).click();
  const denied = await verificationResponse;
  expect(denied.status()).toBe(401);
  expect((await denied.json()).error?.code).toBe('MFA_ENROLLMENT_EXPIRED');
  await expect(page.locator('#mfa-error')).toContainText('La activación venció');
  await expect(page.getByLabel('Contraseña actual para activar')).toBeFocused();
  await expect(page.getByLabel('Clave manual del autenticador')).toHaveCount(0);
  await page.getByLabel('Contraseña actual para activar').fill(password);
  await page.getByRole('button', { name: /Configurar autenticador|Iniciar nueva activación/ }).click();
  await expect(page.getByLabel('Clave manual del autenticador')).toHaveValue(/^[A-Z2-7]{32}$/);
  await expect(page.getByLabel('Clave manual del autenticador')).not.toHaveValue(secret);
  await accessible(page);
});
