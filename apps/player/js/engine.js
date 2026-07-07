/* ============ KODEX OS — Engine: журнал событий и состояния ============ *
 * Формализует часть Engine Architecture (docs/02-engine-architecture.md)
 * поверх уже существующего state.js, не меняя поведение игры:
 *  — единый неизменяемый журнал игровых событий (Event Bus/Game Event);
 *  — именованные состояния Case/Task вместо магических строк по коду
 *    (Engineering Handbook, раздел 7 — запрет магических строк).
 * ------------------------------------------------------------------- */
'use strict';

/* ---------- состояния (Engine Architecture, раздел 3) ---------- */
const CASE_STATE = Object.freeze({
  LOCKED: 'locked',
  AVAILABLE: 'available',
  ACTIVE: 'active',
  SOLVED: 'solved',
});

const TASK_STATE = Object.freeze({
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  PASSED: 'passed',
  FAILED: 'failed',
  EXHAUSTED: 'exhausted',
});

/* ---------- журнал событий (Event Bus, Domain Model: Game Event) ---------- *
 * Неизменяемый (append-only) в рамках сессии агента: события не редактируются
 * и не удаляются задним числом — только добавляются. Хранится в S.events,
 * обрезается по MAX_EVENTS, чтобы не раздувать localStorage бесконечно. */
const MAX_EVENTS = 300;

function logGameEvent(type, payload) {
  if (!S.events) S.events = [];
  const event = { type, payload: payload || {}, time: Date.now() };
  S.events.push(event);
  if (S.events.length > MAX_EVENTS) S.events.splice(0, S.events.length - MAX_EVENTS);
  save();
  sendEventToAnalytics(event);
}

/* ---------- отправка в Analytics (v0.5, services/content-api) ---------- *
 * Best-effort и не блокирующая: сбой сети или недоступность сервиса не
 * должны мешать игровому циклу (Event Architecture, docs/13, раздел 15 —
 * Analytics асинхронна и некритична). Ничего не ждём, ошибки проглатываем. */
function sendEventToAnalytics(event) {
  try {
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(() => { /* офлайн/сервис недоступен — не критично */ });
  } catch (e) { /* fetch недоступен в этом окружении — тоже не критично */ }
}

/* ---------- Reward Engine — расчёт награды за дело ---------- *
 * Извлечено из solveCase(id) в state.js: чистая функция, не трогающая S,
 * только вычисляющая, что причитается агенту — сам state.js применяет результат
 * и публикует события через logGameEvent. */
function calcCaseReward(c) {
  return { credits: c.rewardCredits, reputation: c.rewardRep };
}

/* ---------- Achievement Engine — проверка условий значков ---------- *
 * Условия достижений вынесены сюда явным списком (вместо разбросанных
 * grantBadge-вызовов), чтобы новое достижение добавлялось в одном месте. */

// module (Learning Architecture, docs/04) → значок за полное прохождение модуля.
// Модули 1 и 2 объединены в один значок — ни одно дело сейчас не помечено
// module: 1 (все ранние дела на самом деле уже используют циклы/условия).
const MODULE_BADGE = { 2: 'mod-12', 3: 'mod-3', 4: 'mod-4', 5: 'mod-5', 6: 'mod-6', 7: 'mod-7', 8: 'mod-8', 9: 'mod-9' };

function checkAchievements(c, cs) {
  const earned = ['first-case'];
  if (cs.tries === 1) earned.push('clean');
  if (c.materials && cs.studied.length >= c.materials.length) earned.push('bookworm');
  if (S.agent.streak >= 3) earned.push('streak3');

  // — стиль игры: мастерство, настойчивость, объём (не привязаны к модулям) —
  if ((cs.hintsUsed || []).length === 0) earned.push('no-hint');
  if (c.difficulty === 3 && cs.tries === 1 && (cs.hintsUsed || []).length === 0) earned.push('hard-clean');
  if ((cs.maxFailStreak || 0) >= 3) earned.push('comeback');
  if (cs.hitCooldown) earned.push('second-wind');
  if (agentRank().level >= RANKS.length) earned.push('top-rank');

  // solveCase() выставляет cs.status = SOLVED до вызова checkAchievements —
  // solvedCases() здесь уже включает только что раскрытое дело.
  const solvedIds = new Set(solvedCases().map(x => x.id));
  if (solvedIds.size >= 10) earned.push('veteran');
  if (solvedIds.size >= 25) earned.push('legend');

  const badgeForModule = c.module && MODULE_BADGE[c.module];
  if (badgeForModule) {
    const moduleCases = CASES.filter(x => x.playable && x.module === c.module);
    if (moduleCases.length && moduleCases.every(x => solvedIds.has(x.id))) earned.push(badgeForModule);
  }
  const allPlayable = CASES.filter(x => x.playable);
  if (allPlayable.length && allPlayable.every(x => solvedIds.has(x.id))) earned.push('certificate');

  return earned;
}

// — значки вне цикла раскрытия дела: наводка, снабжение, полигон —
// (вызываются напрямую из overlays.js/screens.js в момент действия, а не
// через checkAchievements, потому что не привязаны к раскрытию дела).
function checkPolygonScoutAchievement() {
  if (POLYGON.length && POLYGON.every(d => S.polygon[d.id] && S.polygon[d.id].done)) grantBadge('polygon-scout');
}
function checkShopAchievement() {
  if (SHOP.length && SHOP.every(i => S.inventory[i.id])) grantBadge('well-equipped');
}
