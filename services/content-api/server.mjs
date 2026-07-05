#!/usr/bin/env node
/**
 * Codex Content API — минимальный сервис без фреймворков и без БД.
 *
 * Делает две вещи:
 *  1. Раздаёт статику всего репозитория (apps/, packages/, корневой index.html) —
 *     заменяет собой python -m http.server и в дев-режиме, и на VPS, чтобы
 *     локальная разработка и продакшн работали одинаково (dev/prod parity).
 *  2. Хранит правки Studio в общем JSON-файле на диске (services/content-api/data/
 *     studio-content.json) — это и есть переход от localStorage (правки видны
 *     только в одном браузере) к настоящему Publishing: правки общие для всех,
 *     переживают перезагрузку страницы и передеплой (файл вне git, см. .gitignore).
 *
 * Инвариант дела (validateCase) продублирован в scripts/check.mjs сознательно,
 * а не вынесен в общий модуль: два места держать в синхроне ощутимо дешевле,
 * чем городить кросс-рантайм (браузер Studio полагается на этот сервер как на
 * единственный источник валидации — не дублирует её у себя) загрузку общего
 * файла ради одной небольшой функции (см. Engineering Handbook, раздел 1 — KISS).
 */

import http from 'node:http';
import { readFile, writeFile, appendFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { generateDraftCase, currentProviderName } from './ai/gateway.mjs';
import { runPython, runnerModeDescription } from './runner/python-runner.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DATA_DIR = fileURLToPath(new URL('./data', import.meta.url));
const CONTENT_FILE = path.join(DATA_DIR, 'studio-content.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const SEED_FILE = path.join(ROOT, 'packages/game-data/data.js');
const PORT = Number(process.env.PORT) || 4173;

async function readSeedCaseIds() {
  try {
    const code = await readFile(SEED_FILE, 'utf8');
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx, { filename: 'data.js' });
    const cases = vm.runInContext('CASES', ctx) || [];
    return cases.map(c => c.id);
  } catch (e) {
    return [];
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* ---------- хранилище правок ---------- */

async function ensureContentFile() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(CONTENT_FILE)) {
    await writeFile(CONTENT_FILE, JSON.stringify({ cases: {} }, null, 2));
  }
}

async function readContentStore() {
  try {
    const raw = await readFile(CONTENT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      cases: (parsed && parsed.cases) || {},
      meta: (parsed && parsed.meta) || {},
      history: (parsed && parsed.history) || {},
    };
  } catch (e) {
    return { cases: {}, meta: {}, history: {} };
  }
}

async function writeContentStore(store) {
  await writeFile(CONTENT_FILE, JSON.stringify(store, null, 2));
}

/* ---------- версии и рецензия (Studio Architecture, docs/09) ---------- *
 * Честная оговорка: в системе нет аутентификации/ролей (см. README) — имя
 * автора/рецензента приходит заголовком X-Studio-Author, который клиент
 * может подставить любым. Это идентификация «на доверии» для внутреннего
 * инструмента одной команды, а не защита от злоумышленника — как и весь
 * остальной Studio API (см. Engineering Handbook про доверенных пользователей
 * этого конкретного эндпоинта). Что реально работает: история версий
 * (снапшот при каждом сохранении, восстановление любой из них) и статусный
 * цикл draft → in_review → approved/changes_requested. Player видит только
 * approved-правки (и легаси-правки без meta — сохранены до внедрения этой
 * функции, чтобы не «погасить» уже опубликованный контент задним числом). */

function authorFromRequest(req) {
  const raw = req.headers['x-studio-author'];
  const name = Array.isArray(raw) ? raw[0] : raw;
  if (!name) return 'Аноним';
  // Клиент кодирует encodeURIComponent (заголовки ограничены ISO-8859-1,
  // кириллица иначе не проходит через fetch) — декодируем обратно.
  let decoded;
  try { decoded = decodeURIComponent(String(name)); } catch (e) { decoded = String(name); }
  return decoded.trim().slice(0, 60) || 'Аноним';
}

function pushHistory(store, id, snapshot, author) {
  const list = store.history[id] || (store.history[id] = []);
  const version = list.length ? list[list.length - 1].version + 1 : 1;
  list.push({ version, savedAt: Date.now(), author, snapshot: JSON.parse(JSON.stringify(snapshot)) });
  if (list.length > 20) list.splice(0, list.length - 20);
  return version;
}

/* ---------- журнал игровых событий (Analytics, v0.5) ---------- *
 * Append-only JSONL: одна строка — одно событие. Player шлёт сюда копию
 * своего локального S.events (js/engine.js) как best-effort, не блокирующий
 * игровой цикл вызов (Event Architecture, docs/13, раздел 15 — Analytics
 * асинхронна и некритична: сбой записи никогда не должен ломать игру). */

async function ensureEventsFile() {
  if (!existsSync(EVENTS_FILE)) await writeFile(EVENTS_FILE, '');
}

async function appendEvent(evt) {
  await appendFile(EVENTS_FILE, JSON.stringify(evt) + '\n');
}

async function readAllEvents() {
  try {
    const raw = await readFile(EVENTS_FILE, 'utf8');
    return raw.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function computeAnalytics(events) {
  const perCase = {};
  const ensure = id => (perCase[id] ||= { caseId: id, taken: 0, completed: 0, checkPassed: 0, checkFailed: 0, hintsUsed: 0 });

  for (const e of events) {
    const caseId = e.payload && e.payload.caseId;
    if (!caseId) continue;
    if (e.type === 'case.taken') ensure(caseId).taken++;
    else if (e.type === 'case.completed') ensure(caseId).completed++;
    else if (e.type === 'task.check_passed') ensure(caseId).checkPassed++;
    else if (e.type === 'task.check_failed') ensure(caseId).checkFailed++;
    else if (e.type === 'hint.delivered') ensure(caseId).hintsUsed++;
  }

  const cases = Object.values(perCase).map(c => {
    const attempts = c.checkPassed + c.checkFailed;
    return {
      ...c,
      attempts,
      successRate: attempts > 0 ? Math.round((c.checkPassed / attempts) * 100) : null,
      completionRate: c.taken > 0 ? Math.round((c.completed / c.taken) * 100) : null,
    };
  }).sort((a, b) => b.taken - a.taken);

  return {
    totalEvents: events.length,
    totalCasesTaken: cases.reduce((s, c) => s + c.taken, 0),
    totalCasesCompleted: cases.reduce((s, c) => s + c.completed, 0),
    cases,
  };
}

/* ---------- валидация дела (см. пояснение вверху файла) ---------- */

const SAFE_ID = /^[a-z0-9-]+$/;

function validateCase(c, existingIds) {
  const errors = [];
  if (!c.id) errors.push('не указан id дела');
  else if (!SAFE_ID.test(c.id)) errors.push('id дела может содержать только строчные латинские буквы, цифры и дефис (id вставляется в HTML-атрибуты Player без экранирования)');
  else if (existingIds.includes(c.id)) errors.push(`дело с id «${c.id}» уже существует`);
  if (!c.fnName) errors.push('не указано имя функции (fnName)');
  if (!c.starter) errors.push('не указан стартовый код (starter)');
  if (!Array.isArray(c.evidence) || c.evidence.length === 0) {
    errors.push('нет улик (evidence) — минимум одна');
  } else {
    c.evidence.forEach(ev => {
      if (!ev.id) errors.push('улика без id');
      else if (!SAFE_ID.test(ev.id)) errors.push(`id улики «${ev.id}» может содержать только строчные латинские буквы, цифры и дефис (вставляется в HTML-атрибут data-ev без экранирования)`);
      if (!Array.isArray(ev.tests) || ev.tests.length === 0) errors.push(`улика «${ev.id || '?'}» без тестов`);
    });
  }
  if (Array.isArray(c.materials)) {
    c.materials.forEach(m => {
      if (!m.id) errors.push('материал без id');
      else if (!SAFE_ID.test(m.id)) errors.push(`id материала «${m.id}» может содержать только строчные латинские буквы, цифры и дефис (вставляется в HTML-атрибут data-doc без экранирования)`);
    });
  }
  if (!c.hints || Object.keys(c.hints).length === 0) errors.push('нет подсказок (hints)');
  if (!Array.isArray(c.briefing) || c.briefing.length === 0) errors.push('нет брифинга');
  if (!Array.isArray(c.finale) || c.finale.length === 0) errors.push('нет финальной сцены');
  if (!Array.isArray(c.versions) || c.versions.length === 0) errors.push('нет версий для отчёта закрытия дела');
  else if (!c.versions.some(v => v.correct)) errors.push('среди версий нет ни одной верной (correct: true)');
  return errors;
}

/* ---------- API ---------- */

async function readJsonBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : null;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function handleApi(req, res, pathname, query) {
  if (pathname === '/api/health') { sendJson(res, 200, { ok: true, aiProvider: currentProviderName(), pythonRunner: runnerModeDescription() }); return true; }

  // POST /api/run — исполнение решения агента (Evaluation Engine).
  // Раньше это делалось в браузере через new Function() — теперь через
  // изолированный Python-раннер (services/python-runner). Принимает код,
  // имя функции и улики с тестами; возвращает per-evidence pass/fail —
  // именно то, что раньше вычисляла runTests() в apps/player/js/ui.js.
  if (pathname === '/api/run' && req.method === 'POST') {
    let payload;
    try { payload = await readJsonBody(req); } catch (e) { sendJson(res, 400, { error: 'некорректный JSON' }); return true; }
    if (!payload || !payload.fnName || !Array.isArray(payload.evidence)) {
      sendJson(res, 400, { error: 'ожидались code, fnName, evidence' });
      return true;
    }
    const result = await runPython({ code: payload.code || '', fnName: payload.fnName, evidence: payload.evidence });
    sendJson(res, 200, result);
    return true;
  }

  // POST /api/generate-draft — черновик дела через AI Gateway (ai/gateway.mjs).
  // Ничего не сохраняет — только возвращает объект дела для доработки в Studio;
  // публикуется он тем же PUT /api/content/:id, что и любая ручная правка,
  // и проходит тот же гейт качества (AI не имеет привилегированного пути записи —
  // см. AI Generation Architecture, docs/07, раздел 7).
  if (pathname === '/api/generate-draft' && req.method === 'POST') {
    let payload;
    try { payload = (await readJsonBody(req)) || {}; } catch (e) { sendJson(res, 400, { error: 'некорректный JSON' }); return true; }
    const store = await readContentStore();
    const seedIds = await readSeedCaseIds();
    const existingIds = [...new Set([...seedIds, ...Object.keys(store.cases)])];
    try {
      const draft = await generateDraftCase({ topic: payload.topic, existingIds });
      sendJson(res, 200, { draft, provider: currentProviderName() });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return true;
  }

  // GET /api/content — по умолчанию отдаёт только то, что реально должно
  // играться (Player): approved-правки и легаси-правки без записи meta
  // (сохранены до внедрения рецензии — не гасим уже опубликованное задним
  // числом). ?all=1 — полный стор со всеми статусами, для Studio.
  if (pathname === '/api/content' && req.method === 'GET') {
    const store = await readContentStore();
    const showAll = query.get('all') === '1';
    if (showAll) { sendJson(res, 200, store); return true; }
    const cases = {};
    for (const [cid, c] of Object.entries(store.cases)) {
      const status = store.meta[cid] && store.meta[cid].status;
      if (!status || status === 'approved') cases[cid] = c;
    }
    sendJson(res, 200, { cases, meta: {}, history: {} });
    return true;
  }

  // PUT /api/content/:id — сохранить/обновить одно дело (частичный апдейт
  // всего стора, а не замена целиком — так конкурентные правки разных
  // методистов разных дел не затирают друг друга). Каждое сохранение —
  // новая версия в истории; статус сбрасывается на 'draft' (правка после
  // approve требует повторной рецензии).
  //
  // Совместное редактирование (Studio Architecture, docs/09): вместо
  // real-time инфраструктуры (WebSocket/presence — не оправдано на этом
  // масштабе, см. Engineering Handbook, раздел 1 — KISS) используется
  // оптимистичная блокировка версией. Studio при открытии формы запоминает
  // номер последней версии из истории и присылает его заголовком
  // X-Base-Version. Если к моменту сохранения в истории уже появилась более
  // новая версия (кто-то другой сохранил дело за это время) — запрос
  // отклоняется 409, вместо тихой перезаписи чужой правки.
  if (pathname.startsWith('/api/content/') && req.method === 'PUT') {
    const id = decodeURIComponent(pathname.slice('/api/content/'.length));
    let payload;
    try { payload = await readJsonBody(req); } catch (e) { sendJson(res, 400, { error: 'некорректный JSON' }); return true; }
    if (!payload || typeof payload !== 'object') { sendJson(res, 400, { error: 'ожидался объект дела' }); return true; }
    payload.id = id;

    const store = await readContentStore();

    const baseVersionRaw = req.headers['x-base-version'];
    if (baseVersionRaw !== undefined && baseVersionRaw !== '') {
      const baseVersion = Number(baseVersionRaw);
      const history = store.history[id] || [];
      const currentVersion = history.length ? history[history.length - 1].version : 0;
      if (baseVersion !== currentVersion) {
        const meta = store.meta[id] || null;
        sendJson(res, 409, {
          conflict: true,
          currentVersion,
          currentAuthor: meta && meta.author,
          currentSavedAt: meta && meta.savedAt,
          error: `Дело уже сохранено кем-то другим (версия v${currentVersion}) с момента открытия формы`,
        });
        return true;
      }
    }

    const seedIds = await readSeedCaseIds();
    const existingIds = [...new Set([...seedIds, ...Object.keys(store.cases)])].filter(x => x !== id);
    const errors = validateCase(payload, existingIds);
    if (errors.length) { sendJson(res, 422, { errors }); return true; }

    const author = authorFromRequest(req);
    store.cases[id] = payload;
    const version = pushHistory(store, id, payload, author);
    store.meta[id] = { status: 'draft', author, savedAt: Date.now(), reviewer: null, reviewComment: null, reviewedAt: null };
    await writeContentStore(store);
    sendJson(res, 200, { ok: true, id, version });
    return true;
  }

  if (pathname.startsWith('/api/content/') && req.method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/api/content/'.length));
    const store = await readContentStore();
    delete store.cases[id];
    delete store.meta[id];
    delete store.history[id];
    await writeContentStore(store);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // POST /api/content/:id/submit — отправить черновик на рецензию.
  if (pathname.endsWith('/submit') && pathname.startsWith('/api/content/') && req.method === 'POST') {
    const id = decodeURIComponent(pathname.slice('/api/content/'.length, -'/submit'.length));
    const store = await readContentStore();
    if (!store.cases[id]) { sendJson(res, 404, { error: `дело «${id}» не найдено среди правок Studio` }); return true; }
    const meta = store.meta[id] || { status: 'draft' };
    if (meta.status === 'in_review') { sendJson(res, 409, { error: 'дело уже отправлено на проверку' }); return true; }
    if (meta.status === 'approved') { sendJson(res, 409, { error: 'дело уже одобрено' }); return true; }
    store.meta[id] = { ...meta, status: 'in_review', submittedAt: Date.now(), submittedBy: authorFromRequest(req) };
    await writeContentStore(store);
    sendJson(res, 200, { ok: true, status: 'in_review' });
    return true;
  }

  // POST /api/content/:id/review — вынести решение рецензента: {decision: 'approved'|'changes_requested', comment}.
  if (pathname.endsWith('/review') && pathname.startsWith('/api/content/') && req.method === 'POST') {
    const id = decodeURIComponent(pathname.slice('/api/content/'.length, -'/review'.length));
    let payload;
    try { payload = (await readJsonBody(req)) || {}; } catch (e) { sendJson(res, 400, { error: 'некорректный JSON' }); return true; }
    const store = await readContentStore();
    const meta = store.meta[id];
    if (!meta || meta.status !== 'in_review') { sendJson(res, 400, { error: 'дело не находится на проверке' }); return true; }
    if (payload.decision !== 'approved' && payload.decision !== 'changes_requested') {
      sendJson(res, 400, { error: 'decision должен быть approved или changes_requested' }); return true;
    }
    store.meta[id] = {
      ...meta,
      status: payload.decision,
      reviewer: authorFromRequest(req),
      reviewComment: (payload.comment || '').slice(0, 2000),
      reviewedAt: Date.now(),
    };
    await writeContentStore(store);
    sendJson(res, 200, { ok: true, status: payload.decision });
    return true;
  }

  // GET /api/content/:id/history — список версий (со снапшотами) для панели истории в Studio.
  if (pathname.endsWith('/history') && pathname.startsWith('/api/content/') && req.method === 'GET') {
    const id = decodeURIComponent(pathname.slice('/api/content/'.length, -'/history'.length));
    const store = await readContentStore();
    sendJson(res, 200, { history: store.history[id] || [], meta: store.meta[id] || null });
    return true;
  }

  // POST /api/content/:id/restore — вернуть дело к более ранней версии из истории: {version}.
  if (pathname.endsWith('/restore') && pathname.startsWith('/api/content/') && req.method === 'POST') {
    const id = decodeURIComponent(pathname.slice('/api/content/'.length, -'/restore'.length));
    let payload;
    try { payload = (await readJsonBody(req)) || {}; } catch (e) { sendJson(res, 400, { error: 'некорректный JSON' }); return true; }
    const store = await readContentStore();
    const entry = (store.history[id] || []).find(h => h.version === payload.version);
    if (!entry) { sendJson(res, 404, { error: `версия ${payload.version} не найдена` }); return true; }

    const seedIds = await readSeedCaseIds();
    const existingIds = [...new Set([...seedIds, ...Object.keys(store.cases)])].filter(x => x !== id);
    const errors = validateCase(entry.snapshot, existingIds);
    if (errors.length) { sendJson(res, 422, { errors }); return true; }

    const author = authorFromRequest(req);
    store.cases[id] = entry.snapshot;
    const version = pushHistory(store, id, entry.snapshot, author);
    store.meta[id] = { status: 'draft', author, savedAt: Date.now(), reviewer: null, reviewComment: null, reviewedAt: null, restoredFrom: entry.version };
    await writeContentStore(store);
    sendJson(res, 200, { ok: true, id, version });
    return true;
  }

  // POST /api/events — Player шлёт сюда копию своих игровых событий
  // (js/engine.js: logGameEvent). Best-effort: не проверяем строго форму,
  // не критично для игры, если запись не удалась.
  if (pathname === '/api/events' && req.method === 'POST') {
    try {
      const payload = await readJsonBody(req);
      if (payload && payload.type) await appendEvent({ ...payload, receivedAt: Date.now() });
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 200, { ok: false }); // не критично — см. комментарий выше
    }
    return true;
  }

  // GET /api/analytics — агрегаты по журналу для дашборда Studio.
  if (pathname === '/api/analytics' && req.method === 'GET') {
    const events = await readAllEvents();
    sendJson(res, 200, computeAnalytics(events));
    return true;
  }

  return false;
}

/* ---------- статика ---------- */

const BLOCKED = /(^|\/)\.(git|github|claude|gitignore)(\/|$)/;

async function serveStatic(req, res, pathname) {
  if (BLOCKED.test(pathname)) { sendJson(res, 404, { error: 'not found' }); return; }

  let filePath = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  if (!filePath.startsWith(ROOT)) { sendJson(res, 403, { error: 'forbidden' }); return; }

  try {
    let st = await stat(filePath);
    if (st.isDirectory()) filePath = path.join(filePath, 'index.html');
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

/* ---------- сервер ---------- */

const server = http.createServer(async (req, res) => {
  try {
    const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname, searchParams);
      if (!handled) sendJson(res, 404, { error: 'not found' });
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

await ensureContentFile();
await ensureEventsFile();
server.listen(PORT, () => {
  console.log(`Codex content-api + static: http://localhost:${PORT} (данные: ${CONTENT_FILE})`);
  console.log(`Python Runner: ${runnerModeDescription()}`);
  if ((process.env.PYTHON_RUNNER_MODE || 'docker') === 'unsafe-local-dev') {
    console.warn('!!! PYTHON_RUNNER_MODE=unsafe-local-dev — исполнение БЕЗ ИЗОЛЯЦИИ. Только для локальной разработки. Никогда не использовать в проде.');
  }
});
