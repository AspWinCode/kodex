/* ============ Codex — слияние Studio-правок с сидом данных ============ *
 * Общий модуль, используемый и Player (js/content-overrides.js), и Studio
 * (js/studio.js). Правки, сделанные в Studio, хранятся не в localStorage
 * браузера (как в v0.3), а в общем JSON-файле на сервере — через
 * services/content-api. Это и есть переход к настоящему Publishing: правка
 * видна всем, переживает перезагрузку и работает с любого браузера/машины,
 * а не только с той, где её сохранили.
 *
 * Все функции асинхронны (сетевой вызов) — вызывающий код обязан ждать Promise.
 * При недоступности API (сервис не запущен) — тихая деградация к пустому
 * стору правок: Player и Studio продолжают работать на одном сиде.
 * ------------------------------------------------------------------- */
'use strict';

const CONTENT_API_BASE = '/api/content';

// Идентификация «на доверии» для Studio (см. server.mjs, комментарий у
// pushHistory/authorFromRequest) — НЕ аутентификация: имя хранится в
// localStorage этого браузера и подставляется заголовком на каждый запрос,
// подделать его тривиально. Это подпись для истории версий и рецензии
// внутри одной доверенной команды, а не защита доступа.
function studioAuthorHeaders() {
  const name = (typeof localStorage !== 'undefined' && localStorage.getItem('studio-author')) || 'Аноним';
  // HTTP-заголовки ограничены ISO-8859-1 — кириллица (обычные имена в этой
  // команде) ломает fetch() без кодирования. Сервер декодирует обратно.
  return { 'X-Studio-Author': encodeURIComponent(name) };
}

async function loadStudioOverrides(opts = {}) {
  try {
    const res = await fetch(CONTENT_API_BASE + (opts.all ? '?all=1' : ''));
    if (!res.ok) throw new Error('content-api: ' + res.status);
    const data = await res.json();
    return {
      cases: (data && data.cases) || {},
      meta: (data && data.meta) || {},
    };
  } catch (e) {
    console.warn('[game-data] content-api недоступен, работаем с сидом без правок:', e.message);
    return { cases: {}, meta: {} };
  }
}

/**
 * baseVersion — номер версии, с которой методист открыл форму (Studio
 * запоминает его при открытии редактора через fetchCaseHistory). Если к
 * моменту сохранения кто-то другой уже сохранил более новую версию, сервер
 * отклоняет запрос 409 вместо тихой перезаписи — совместное редактирование
 * без real-time инфраструктуры (см. server.mjs, комментарий у PUT-обработчика).
 * baseVersion может быть null/undefined для нового дела — конфликтовать не с чем.
 */
async function upsertStudioCase(caseObj, baseVersion) {
  const headers = { 'Content-Type': 'application/json', ...studioAuthorHeaders() };
  if (baseVersion !== null && baseVersion !== undefined) headers['X-Base-Version'] = String(baseVersion);
  const res = await fetch(`${CONTENT_API_BASE}/${encodeURIComponent(caseObj.id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(caseObj),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.conflict) {
      const err = new Error(body.error || 'дело изменено кем-то другим');
      err.conflict = true;
      err.currentVersion = body.currentVersion;
      err.currentAuthor = body.currentAuthor;
      err.currentSavedAt = body.currentSavedAt;
      throw err;
    }
    const err = new Error('не удалось сохранить дело');
    err.errors = body.errors || [body.error || `HTTP ${res.status}`];
    throw err;
  }
  return res.json();
}

async function removeStudioOverride(id) {
  await fetch(`${CONTENT_API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ---------- версии и рецензия (Studio Architecture, docs/09) ---------- */

async function loadStudioMeta() {
  const { meta } = await loadStudioOverrides({ all: true });
  return meta;
}

async function submitCaseForReview(id) {
  const res = await fetch(`${CONTENT_API_BASE}/${encodeURIComponent(id)}/submit`, {
    method: 'POST',
    headers: studioAuthorHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function reviewStudioCase(id, decision, comment) {
  const res = await fetch(`${CONTENT_API_BASE}/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studioAuthorHeaders() },
    body: JSON.stringify({ decision, comment }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function fetchCaseHistory(id) {
  const res = await fetch(`${CONTENT_API_BASE}/${encodeURIComponent(id)}/history`);
  if (!res.ok) return { history: [], meta: null };
  return res.json();
}

async function restoreCaseVersion(id, version) {
  const res = await fetch(`${CONTENT_API_BASE}/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studioAuthorHeaders() },
    body: JSON.stringify({ version }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

/**
 * Запрашивает черновик дела у AI Gateway (services/content-api/ai/gateway.mjs) —
 * ничего не сохраняет, только возвращает объект для доработки и последующего
 * upsertStudioCase. topic — один из ключей шаблонов ('if','while','loop','dict',
 * 'multi-return') либо произвольная строка (тогда провайдер отдаст общий скелет).
 */
async function generateDraftCase(topic) {
  const res = await fetch('/api/generate-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `не удалось сгенерировать черновик (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Агрегированные метрики по сыгранным делам (v0.5 Analytics) — читает
 * журнал событий, накопленный content-api из POST /api/events (см.
 * apps/player/js/engine.js: sendEventToAnalytics). Используется дашбордом
 * Studio; Player эту функцию не вызывает.
 */
async function loadAnalytics() {
  try {
    const res = await fetch('/api/analytics');
    if (!res.ok) throw new Error('content-api: ' + res.status);
    return res.json();
  } catch (e) {
    console.warn('[game-data] не удалось загрузить аналитику:', e.message);
    return { totalEvents: 0, totalCasesTaken: 0, totalCasesCompleted: 0, cases: [] };
  }
}

async function isStudioOverridden(id) {
  const store = await loadStudioOverrides({ all: true });
  return Object.prototype.hasOwnProperty.call(store.cases, id);
}

/**
 * Мутирует переданный массив CASES «на месте» (сохраняя ссылку — важно,
 * так как остальной код Player держит const CASES и ожидает тот же массив):
 * существующие дела дополняются/перезаписываются полями из override,
 * дела с новыми id — добавляются в конец.
 */
async function applyStudioOverrides(casesArr) {
  const store = await loadStudioOverrides();
  Object.keys(store.cases).forEach(id => {
    const override = store.cases[id];
    const idx = casesArr.findIndex(c => c.id === id);
    if (idx >= 0) Object.assign(casesArr[idx], override);
    else casesArr.push(Object.assign({ id }, override));
  });
  return casesArr;
}

/**
 * Неразрушающий вариант applyStudioOverrides — используется Studio, которой
 * важно сохранить нетронутый сид (чтобы можно было сравнить с ним и
 * предложить «Сбросить к сиду»). Возвращает НОВЫЙ массив, seedCases не трогает.
 */
async function mergedCasesView(seedCases) {
  const store = await loadStudioOverrides({ all: true });
  const seedIds = new Set(seedCases.map(c => c.id));
  const merged = seedCases.map(c => store.cases[c.id] ? Object.assign({}, c, store.cases[c.id]) : c);
  Object.keys(store.cases).forEach(id => {
    if (!seedIds.has(id)) merged.push(Object.assign({ id }, store.cases[id]));
  });
  return merged;
}
