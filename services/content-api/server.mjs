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
 * Инвариант дела (validateCase) продублирован из apps/studio/js/studio.js и
 * scripts/check.mjs сознательно, а не вынесен в общий модуль: три места держать
 * в синхроне ощутимо дешевле, чем городить кросс-рантайм (браузер + два вида
 * Node-процессов) загрузку общего файла ради одной небольшой функции (см.
 * Engineering Handbook, раздел 1 — KISS).
 */

import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DATA_DIR = fileURLToPath(new URL('./data', import.meta.url));
const CONTENT_FILE = path.join(DATA_DIR, 'studio-content.json');
const PORT = Number(process.env.PORT) || 4173;

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
    return { cases: (parsed && parsed.cases) || {} };
  } catch (e) {
    return { cases: {} };
  }
}

async function writeContentStore(store) {
  await writeFile(CONTENT_FILE, JSON.stringify(store, null, 2));
}

/* ---------- валидация дела (см. пояснение вверху файла) ---------- */

function validateCase(c, existingIds) {
  const errors = [];
  if (!c.id) errors.push('не указан id дела');
  else if (existingIds.includes(c.id)) errors.push(`дело с id «${c.id}» уже существует`);
  if (!c.fnName) errors.push('не указано имя функции (fnName)');
  if (!c.starter) errors.push('не указан стартовый код (starter)');
  if (!Array.isArray(c.evidence) || c.evidence.length === 0) {
    errors.push('нет улик (evidence) — минимум одна');
  } else {
    c.evidence.forEach(ev => {
      if (!Array.isArray(ev.tests) || ev.tests.length === 0) errors.push(`улика «${ev.id || '?'}» без тестов`);
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

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health') { sendJson(res, 200, { ok: true }); return true; }

  if (pathname === '/api/content' && req.method === 'GET') {
    const store = await readContentStore();
    sendJson(res, 200, store);
    return true;
  }

  // PUT /api/content/:id — сохранить/обновить одно дело (частичный апдейт
  // всего стора, а не замена целиком — так конкурентные правки разных
  // методистов разных дел не затирают друг друга).
  if (pathname.startsWith('/api/content/') && req.method === 'PUT') {
    const id = decodeURIComponent(pathname.slice('/api/content/'.length));
    let payload;
    try { payload = await readJsonBody(req); } catch (e) { sendJson(res, 400, { error: 'некорректный JSON' }); return true; }
    if (!payload || typeof payload !== 'object') { sendJson(res, 400, { error: 'ожидался объект дела' }); return true; }
    payload.id = id;

    const store = await readContentStore();
    const existingIds = Object.keys(store.cases).filter(x => x !== id);
    const errors = validateCase(payload, existingIds);
    if (errors.length) { sendJson(res, 422, { errors }); return true; }

    store.cases[id] = payload;
    await writeContentStore(store);
    sendJson(res, 200, { ok: true, id });
    return true;
  }

  if (pathname.startsWith('/api/content/') && req.method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/api/content/'.length));
    const store = await readContentStore();
    delete store.cases[id];
    await writeContentStore(store);
    sendJson(res, 200, { ok: true });
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
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname);
      if (!handled) sendJson(res, 404, { error: 'not found' });
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

await ensureContentFile();
server.listen(PORT, () => {
  console.log(`Codex content-api + static: http://localhost:${PORT} (данные: ${CONTENT_FILE})`);
});
