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

async function loadStudioOverrides() {
  try {
    const res = await fetch(CONTENT_API_BASE);
    if (!res.ok) throw new Error('content-api: ' + res.status);
    const data = await res.json();
    return { cases: (data && data.cases) || {} };
  } catch (e) {
    console.warn('[game-data] content-api недоступен, работаем с сидом без правок:', e.message);
    return { cases: {} };
  }
}

async function upsertStudioCase(caseObj) {
  const res = await fetch(`${CONTENT_API_BASE}/${encodeURIComponent(caseObj.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(caseObj),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error('не удалось сохранить дело');
    err.errors = body.errors || [body.error || `HTTP ${res.status}`];
    throw err;
  }
  return res.json();
}

async function removeStudioOverride(id) {
  await fetch(`${CONTENT_API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function isStudioOverridden(id) {
  const store = await loadStudioOverrides();
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
  const store = await loadStudioOverrides();
  const seedIds = new Set(seedCases.map(c => c.id));
  const merged = seedCases.map(c => store.cases[c.id] ? Object.assign({}, c, store.cases[c.id]) : c);
  Object.keys(store.cases).forEach(id => {
    if (!seedIds.has(id)) merged.push(Object.assign({ id }, store.cases[id]));
  });
  return merged;
}
