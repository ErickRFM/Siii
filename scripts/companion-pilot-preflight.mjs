#!/usr/bin/env node
// Operator-side configuration check only. Never prints credentials or makes HTTP requests.
import {Buffer} from 'node:buffer';

const active = process.argv.includes('--active');
const problems = [];
const ok = [];
const required = name => {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(name + ': no configurada');
    return null;
  }
  return value;
};
const validB64 = (value, min = 32, max = 128) => {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length >= min && bytes.length <= max && bytes.toString('base64') === value;
};

const keyJson = required('SIII_ACADEMIC_OUTBOX_KEYS');
const activeKey = required('SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID');
if (keyJson) {
  try {
    const keys = JSON.parse(keyJson);
    if (!keys || Array.isArray(keys) || typeof keys !== 'object' || Object.keys(keys).length < 1 ||
      Object.keys(keys).length > 16 ||
      !Object.entries(keys).every(([id, value]) =>
        /^[A-Za-z0-9_-]{1,64}$/.test(id) && typeof value === 'string' && validB64(value, 32, 32)
      ) || !Object.hasOwn(keys, activeKey)) {
      problems.push('SIII_ACADEMIC_OUTBOX_KEYS: keyring o clave activa incompatible');
    } else {
      ok.push('Cifrado outbox: formato válido');
    }
  } catch { problems.push('SIII_ACADEMIC_OUTBOX_KEYS: JSON inválido'); }
}
const targetsJson = required('SIII_COMPANION_DELIVERY_TARGETS_JSON');
if (targetsJson) {
  try {
    const targets = JSON.parse(targetsJson);
    const ids = targets && !Array.isArray(targets) && typeof targets === 'object' ? Object.keys(targets) : [];
    if (!ids.length || targetsJson.length > 32000 ||
      !ids.every(id => {
        const item = targets[id];
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
          !item || typeof item !== 'object' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.keyId || '') ||
          !validB64(item.secretBase64 || '')) return false;
        let u;
        try { u = new URL(item.origin); } catch { return false; }
        return u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash &&
          !u.username && !u.password && !u.port && u.hostname.includes('.') &&
          !u.hostname.endsWith('.local');
      })) {
      problems.push('SIII_COMPANION_DELIVERY_TARGETS_JSON: destino, UUID, HTTPS o HMAC no válidos');
    } else {
      ok.push('Destino HMAC por institución: formato válido (' + ids.length + ' tenant)');
    }
  } catch { problems.push('SIII_COMPANION_DELIVERY_TARGETS_JSON: JSON inválido'); }
}
if (required('CRON_SECRET')) ok.push('Autorización del procesador: configurada');
for (const key of ['SIII_ACADEMIC_OUTBOX_ENABLED', 'SIII_COMPANION_DELIVERY_ENABLED']) {
  const val = process.env[key] ?? 'false';
  if (!['true', 'false'].includes(val)) problems.push(key + ': debe ser true o false');
  else if (active && val !== 'true') problems.push(key + ': debe ser true en modo --active');
  else ok.push(key + ': ' + (val === 'true' ? 'habilitada' : 'apagada (segura)'));
}
const url = process.env.COMPANERO_API_URL;
if (url) {
  try { if (new URL(url).protocol !== 'https:') problems.push('COMPANERO_API_URL: requiere HTTPS'); }
  catch { problems.push('COMPANERO_API_URL: URL inválida'); }
}
for (const message of ok) console.log('[OK] ' + message);
for (const message of problems) console.error('[FALTA] ' + message);
console.log('No se ha conectado, enviado ni escrito ningún dato; no se inspeccionó Supabase ni Ktor.');
console.log('La aceptación requiere migración 0018 confirmada, credencial provisionada en Mongo y pruebas E2E.');
process.exitCode = problems.length ? 1 : 0;
