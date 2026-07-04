/* ============ Codex — слияние Studio-правок с сидом данных ============ *
 * Общий модуль, используемый и Player (js/content-overrides.js), и Studio
 * (js/studio.js). Никакого бэкенда: правки, сделанные в Studio, хранятся
 * в localStorage браузера и применяются поверх сида CASES из data.js —
 * оба приложения обязаны работать с одним и тем же origin, чтобы localStorage
 * реально разделялся между ними (см. README, раздел «Studio»).
 * ------------------------------------------------------------------- */
'use strict';

const STUDIO_CONTENT_KEY = 'kodex-studio-content-v1';

function loadStudioOverrides() {
  try {
    const raw = localStorage.getItem(STUDIO_CONTENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { cases: parsed.cases || {} };
    }
  } catch (e) { /* повреждённое хранилище — работаем с сидом как есть */ }
  return { cases: {} };
}

function saveStudioOverrides(store) {
  localStorage.setItem(STUDIO_CONTENT_KEY, JSON.stringify(store));
}

/**
 * Мутирует переданный массив CASES «на месте» (сохраняя ссылку — важно,
 * так как остальной код Player держит const CASES и ожидает тот же массив):
 * существующие дела дополняются/перезаписываются полями из override,
 * дела с новыми id — добавляются в конец.
 */
function applyStudioOverrides(casesArr) {
  const store = loadStudioOverrides();
  Object.keys(store.cases).forEach(id => {
    const override = store.cases[id];
    const idx = casesArr.findIndex(c => c.id === id);
    if (idx >= 0) Object.assign(casesArr[idx], override);
    else casesArr.push(Object.assign({ id }, override));
  });
  return casesArr;
}

function upsertStudioCase(caseObj) {
  const store = loadStudioOverrides();
  store.cases[caseObj.id] = caseObj;
  saveStudioOverrides(store);
}

function removeStudioOverride(id) {
  const store = loadStudioOverrides();
  delete store.cases[id];
  saveStudioOverrides(store);
}

function isStudioOverridden(id) {
  const store = loadStudioOverrides();
  return Object.prototype.hasOwnProperty.call(store.cases, id);
}

/**
 * Неразрушающий вариант applyStudioOverrides — используется Studio, которой
 * важно сохранить нетронутый сид (чтобы можно было сравнить с ним и
 * предложить «Сбросить к сиду»). Возвращает НОВЫЙ массив, seedCases не трогает.
 */
function mergedCasesView(seedCases) {
  const store = loadStudioOverrides();
  const seedIds = new Set(seedCases.map(c => c.id));
  const merged = seedCases.map(c => store.cases[c.id] ? Object.assign({}, c, store.cases[c.id]) : c);
  Object.keys(store.cases).forEach(id => {
    if (!seedIds.has(id)) merged.push(Object.assign({ id }, store.cases[id]));
  });
  return merged;
}
