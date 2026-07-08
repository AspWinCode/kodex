/**
 * Приём одноразового SSO-токена от learning-portal (tirskix-lms) — см.
 * докладную docs/17-lms-integration.md. Токен подписан ОТДЕЛЬНЫМ секретом
 * SSO_KODEX_SHARED_SECRET (не основным секретом ни одной из двух систем —
 * так утечка одного секрета не позволяет подделывать переходы), HS256,
 * без сторонних библиотек — Node `crypto` умеет HMAC-SHA256 нативно, а JWT
 * из трёх base64url-частей разбирается без парсера.
 *
 * Схема токена (генерируется app/services/kodex_sso.py в learning-portal):
 *   { iss: "tirskix-lms", aud: "kodex", external_ref: "lp-student-<id>",
 *     full_name, catalog_item_code: "kodex", iat, exp, jti }
 * TTL по умолчанию — 60 секунд: токен предназначен для немедленного
 * однократного обмена на сессию Codex, не для долгого хранения.
 */

import crypto from 'node:crypto';

const EXPECTED_ISS = 'tirskix-lms';
const EXPECTED_AUD = 'kodex';

// защита от повторного использования токена (replay) в пределах его TTL —
// в памяти процесса достаточно: TTL короткий (60с), переживать рестарт
// сервиса не требуется (см. Engineering Handbook, раздел 1 — KISS).
const usedJti = new Map(); // jti -> истекает (мс)

function cleanupUsedJti() {
  const now = Date.now();
  for (const [jti, expiresAt] of usedJti) if (expiresAt < now) usedJti.delete(jti);
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url');
}

/**
 * Проверяет подпись, срок действия, издателя и аудиторию токена.
 * Бросает Error с человекочитаемым сообщением при любом несоответствии.
 * Возвращает разобранный payload при успехе.
 */
export function verifySsoToken(token, secret) {
  if (!secret) throw new Error('SSO не настроен на этой стороне (нет SSO_KODEX_SHARED_SECRET)');
  if (!token || typeof token !== 'string') throw new Error('токен не передан');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('токен повреждён (не JWT)');
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch (e) {
    throw new Error('токен повреждён (не JSON)');
  }

  if (header.alg !== 'HS256') throw new Error(`неподдерживаемый алгоритм подписи: ${header.alg}`);

  const expectedSig = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
  let actualSig;
  try { actualSig = base64urlDecode(sigB64); } catch (e) { throw new Error('подпись повреждена'); }
  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    throw new Error('недействительная подпись');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('токен просрочен');
  if (payload.iss !== EXPECTED_ISS) throw new Error('токен выпущен не тем издателем');
  if (payload.aud !== EXPECTED_AUD) throw new Error('токен предназначен не для этой платформы');
  if (!payload.external_ref) throw new Error('в токене нет external_ref');

  cleanupUsedJti();
  if (payload.jti) {
    if (usedJti.has(payload.jti)) throw new Error('токен уже был использован');
    usedJti.set(payload.jti, payload.exp * 1000);
  }

  return payload;
}
