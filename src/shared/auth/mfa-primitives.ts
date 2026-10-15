import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { generateSecret, generateURI, verify } from 'otplib';

const crypto = new NodeCryptoPlugin();
const OTP_OPTIONS = { strategy: 'totp', algorithm: 'sha1', digits: 6, period: 30 } as const;
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SECRET_FORMAT = /^[A-Z2-7]{32}$/;

function failure(code: 'MFA_KEY_UNAVAILABLE' | 'MFA_SECRET_INVALID'): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function assertSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length !== 32 || !SECRET_FORMAT.test(secret)) throw failure('MFA_SECRET_INVALID');
}

export function createMfaSecret(label: string): { secret: string; uri: string } {
  const secret = generateSecret({ length: 20, crypto });
  const uri = new URL(generateURI({ ...OTP_OPTIONS, issuer: 'SIII', label, secret }));
  // URI helpers may omit defaults; publish the complete enrollment contract.
  uri.searchParams.set('algorithm', 'SHA1');
  uri.searchParams.set('digits', '6');
  uri.searchParams.set('period', '30');
  return { secret, uri: uri.toString() };
}

/** The caller must persist the returned timeStep under a factor row lock. */
export async function verifyTotp(
  secret: string, token: string, afterTimeStep: number | null, now: Date = new Date(),
): Promise<{ valid: boolean; timeStep?: number }> {
  assertSecret(secret);
  if (typeof token !== 'string' || token.length !== 6 || !/^[0-9]{6}$/.test(token)) return { valid: false };
  const epoch = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw failure('MFA_SECRET_INVALID');
  if (afterTimeStep !== null) {
    if (!Number.isSafeInteger(afterTimeStep) || afterTimeStep < 0) throw failure('MFA_SECRET_INVALID');
    // A persisted step ahead of the clock also denies rather than widening the window.
    if (afterTimeStep >= Math.floor(epoch / OTP_OPTIONS.period)) return { valid: false };
  }
  const result = await verify({
    ...OTP_OPTIONS, secret, token, crypto, epoch, epochTolerance: [30, 0],
    afterTimeStep: afterTimeStep ?? undefined,
  });
  return result.valid && 'timeStep' in result
    ? { valid: true, timeStep: result.timeStep }
    : { valid: false };
}

function keyring(): Record<string, Buffer> {
  try {
    const parsed: unknown = JSON.parse(process.env.SIII_MFA_KEYS ?? '');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    const entries = Object.entries(parsed);
    if (!entries.length) throw new Error();
    const keys: Record<string, Buffer> = Object.create(null);
    for (const [id, value] of entries) {
      if (!KEY_ID.test(id) || typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error();
      const bytes = Buffer.from(value, 'base64');
      if (bytes.length !== 32 || bytes.toString('base64') !== value) throw new Error();
      keys[id] = bytes;
    }
    return keys;
  } catch {
    throw failure('MFA_KEY_UNAVAILABLE');
  }
}

function aad(keyId: string, userId: string): Buffer {
  if (typeof userId !== 'string' || !userId.length) throw failure('MFA_SECRET_INVALID');
  return Buffer.from(JSON.stringify(['SIII:mfa-secret', 1, keyId, userId]), 'utf8');
}

export function sealMfaSecret(secret: string, userId: string): string {
  assertSecret(secret);
  const keys = keyring();
  const keyId = process.env.SIII_MFA_ACTIVE_KEY_ID;
  if (!keyId || !KEY_ID.test(keyId) || !Object.hasOwn(keys, keyId)) throw failure('MFA_KEY_UNAVAILABLE');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys[keyId], iv, { authTagLength: 16 });
  cipher.setAAD(aad(keyId, userId));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return JSON.stringify({
    version: 1, keyId, iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url'),
  });
}

function binaryField(value: unknown, length: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw failure('MFA_SECRET_INVALID');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== length || bytes.toString('base64url') !== value) throw failure('MFA_SECRET_INVALID');
  return bytes;
}

export function openMfaSecret(blob: string, userId: string): string {
  let envelope: { keyId: string; iv: Buffer; tag: Buffer; ciphertext: Buffer };
  try {
    if (typeof blob !== 'string' || blob.length > 1024) throw new Error();
    const parsed = JSON.parse(blob);
    if (!parsed || parsed.version !== 1 || typeof parsed.keyId !== 'string' || !KEY_ID.test(parsed.keyId)) throw new Error();
    envelope = {
      keyId: parsed.keyId, iv: binaryField(parsed.iv, 12), tag: binaryField(parsed.tag, 16),
      ciphertext: binaryField(parsed.ciphertext, 32),
    };
  } catch {
    throw failure('MFA_SECRET_INVALID');
  }
  const keys = keyring();
  if (!Object.hasOwn(keys, envelope.keyId)) throw failure('MFA_KEY_UNAVAILABLE');
  try {
    const decipher = createDecipheriv('aes-256-gcm', keys[envelope.keyId], envelope.iv, { authTagLength: 16 });
    decipher.setAAD(aad(envelope.keyId, userId));
    decipher.setAuthTag(envelope.tag);
    const secret = Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString('utf8');
    assertSecret(secret);
    return secret;
  } catch {
    throw failure('MFA_SECRET_INVALID');
  }
}

/** Only digests are stored; the plaintext list is shown once by the caller. */
export function createRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const hex = randomBytes(16).toString('hex').toUpperCase();
    return [hex.slice(0, 8), hex.slice(8, 16), hex.slice(16, 24), hex.slice(24)].join('-');
  });
}

export function digestRecoveryCode(code: string, userId: string): string | null {
  if (typeof code !== 'string' || typeof userId !== 'string' || !userId.length || code.length > 128) return null;
  const normalized = code.replace(/[- ]/g, '').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(normalized)) return null;
  return createHash('sha256').update(JSON.stringify(['SIII:mfa-recovery', 1, userId, normalized])).digest('hex');
}
