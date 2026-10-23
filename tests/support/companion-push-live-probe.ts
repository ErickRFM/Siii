/** Opt-in local contract child. Never imported by the application or a production worker. */
import assert from 'node:assert/strict';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {signedAcademicTransport} from '../../src/integrations/companion/outbox/signed-transport';
import {validateAcademicSnapshot} from '../../src/integrations/companion/outbox/snapshot';

const PREFIX = 'COMPANION_PUSH_PROBE_';
const EVENTS_PATH = '/integration/v1/events';
const DUMMY_ORIGIN = 'https://companion-probe.invalid';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONFIG_INVALID = 'COMPANION_PUSH_PROBE_CONFIG_INVALID';

function configuration() {
  const values = ['ORIGIN', 'SOURCE_INSTITUTION_ID', 'TARGET_TENANT_ID', 'CREDENTIAL_ID', 'SECRET_BASE64']
    .map(name => process.env[PREFIX + name]);
  if (values.some(value => !value)) throw Error(CONFIG_INVALID);
  const [origin, institutionId, tenantId, keyId, secretBase64] = values as string[];
  let target: URL;
  try { target = new URL(origin); } catch { throw Error(CONFIG_INVALID); }
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/.test(origin) || target.origin !== origin ||
      !target.port || !UUID.test(institutionId) || !UUID.test(tenantId) || institutionId === tenantId ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(keyId)) throw Error(CONFIG_INVALID);
  const secret = Buffer.from(secretBase64, 'base64');
  if (secret.length !== 32 || secret.toString('base64') !== secretBase64) {
    secret.fill(0);
    throw Error(CONFIG_INVALID);
  }
  return {origin, institutionId, keyId, secret};
}

async function atTime<T>(milliseconds: number, operation: () => Promise<T>): Promise<T> {
  const originalNow = Date.now;
  try {
    // This isolated test child controls only the real sender's timestamp; no second signer exists.
    Date.now = () => milliseconds;
    return await operation();
  } finally { Date.now = originalNow; }
}

async function main() {
  const config = configuration();
  const deadline = setTimeout(() => {
    process.stderr.write('COMPANION_PUSH_PROBE_TIMEOUT\n');
    process.exit(1);
  }, 35_000);
  deadline.unref();
  const wrongSecret = randomBytes(32);
  try {
    const now = Date.now(), eventId = randomUUID(), sectionId = randomUUID();
    const payload = validateAcademicSnapshot({
      contract: 'siii.academic_section_snapshot.v1', sectionId, sectionCode: 'PROBE_01', status: 'open', timezone: 'UTC',
      term: {sourceId: randomUUID(), code: 'PROBE2026', startsOn: '2026-01-01', endsOn: '2026-12-31'},
      subject: {sourceId: randomUUID(), code: 'TEST_01', name: 'Asignatura sintética', credits: 3},
      teachers: [{sourceId: randomUUID(), externalId: 'DOC_PROBE', fullName: 'Docente sintético'}],
      enrollments: [{sourceId: randomUUID(), studentSourceId: randomUUID(), studentExternalId: 'ALU_PROBE',
        fullName: 'Estudiante sintético', studentStatus: 'active', status: 'enrolled'}],
      occurrences: [{sourceId: randomUUID(), patternSourceId: randomUUID(), date: '2026-10-22',
        startsAt: '2026-10-22T09:00:00Z', endsAt: '2026-10-22T10:00:00Z', status: 'SCHEDULED',
        room: {sourceId: randomUUID(), code: 'ROOM_01', building: 'Edificio sintético',
          campusSourceId: randomUUID(), campusName: 'Campus sintético'}}],
    });
    // One immutable raw envelope for delivery, retries, and authentication negatives.
    const body = JSON.stringify({schemaVersion: 1, eventId, entityType: 'group', externalId: sectionId,
      sourceVersion: 1, occurredAtEpochSeconds: Math.floor(now / 1000), operation: 'upsert', payload});
    const requests: {status: number; headers: Headers; init: RequestInit}[] = [];
    const http: typeof fetch = async (url, init) => {
      assert.equal(String(url), DUMMY_ORIGIN + EVENTS_PATH);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, body);
      assert.equal(init?.redirect, 'manual');
      assert.equal(init?.credentials, 'omit');
      // Test-only destination adaptation; the actual HTTP request and response stay real.
      const response = await fetch(config.origin + EVENTS_PATH, init);
      requests.push({status: response.status, headers: new Headers(init.headers), init: {...init}});
      return response;
    };
    const targets = (secret: Buffer) => JSON.stringify({[config.institutionId]: {
      origin: DUMMY_ORIGIN, keyId: config.keyId, secretBase64: secret.toString('base64'),
    }});
    const sender = signedAcademicTransport(targets(config.secret), http);
    const input = {eventId, institutionId: config.institutionId, sectionId, sourceVersion: 1,
      body, signal: AbortSignal.timeout(30_000)};
    const first = await atTime(now, () => sender(input));
    assert.equal(first.status, 'accepted');
    const retry = await atTime(now + 1000, () => sender(input));
    assert.equal(retry.status, 'accepted');
    const stale = await atTime(now - 601_000, () => sender(input));
    assert.equal(stale.status, 'retryable');
    const fresh = await atTime(now + 2000, () => sender(input));
    assert.equal(fresh.status, 'accepted');
    const freshRequest = requests[3];
    assert.ok(freshRequest);
    const replay = await http(DUMMY_ORIGIN + EVENTS_PATH, {
      ...freshRequest.init, headers: new Headers(freshRequest.headers),
    });
    await replay.body?.cancel();
    const wrongKey = await atTime(now + 3000, () => signedAcademicTransport(targets(wrongSecret), http)(input));
    assert.equal(wrongKey.status, 'retryable');
    assert.deepEqual(requests.map(request => request.status), [202, 200, 401, 200, 401, 401]);
    const nonces = requests.map(request => request.headers.get('X-Integration-Nonce'));
    assert.equal(new Set([nonces[0], nonces[1], nonces[2], nonces[3], nonces[5]]).size, 5);
    assert.equal(nonces[4], nonces[3]);
    assert.notEqual(requests[0].headers.get('X-Integration-Timestamp'), requests[1].headers.get('X-Integration-Timestamp'));
    const report = {eventId, sectionId, bodySha256: createHash('sha256').update(body, 'utf8').digest('hex'),
      statuses: [first.status, retry.status], negativeResults: {
        stale: requests[2].status, replay: requests[4].status, wrongKey: requests[5].status,
      }};
    const output = JSON.stringify(report);
    assert.ok(Buffer.byteLength(output, 'utf8') <= 65_536);
    process.stdout.write(output + '\n');
  } finally {
    clearTimeout(deadline);
    config.secret.fill(0);
    wrongSecret.fill(0);
  }
}

await main().catch(error => {
  process.stderr.write((error instanceof Error && error.message === CONFIG_INVALID
    ? CONFIG_INVALID : 'COMPANION_PUSH_PROBE_CONTRACT_FAILED') + '\n');
  process.exitCode = 1;
});
