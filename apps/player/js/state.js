/* ============ KODEX OS — состояние агента ============ */
'use strict';

const STORE_KEY = 'kodex-player-v1';

function defaultState() {
  return {
    loggedIn: false,
    onboarded: false,
    agent: {
      callsign: '',
      reputation: 0,
      credits: 20,
      hintTokens: 1,        // бесплатные наводки
      joined: new Date().toISOString().slice(0, 10),
      badges: [],
      streak: 0,
      brass: false,
    },
    cases: {},              // id → { status, stage, studied[], code, attempts, hintsUsed[], cooldownUntil, solvedAt, claimed, tries }
    messages: [
      {
        id: 'msg-1', from: 'viktor', time: 'сегодня 08:12', read: false, caseId: 'case-001',
        text: 'Агент, для вас есть первое дело. Перехвачена записка курьера — нужен дешифратор. Подробности в картотеке.',
      },
    ],
    inventory: {},          // shopId → count / true
    polygon: {},            // drillId → { done, code }
    log: [],                // { time, text, caseId }
    jarvisLog: {},          // caseId → [ {who, text} ]
    introSeen: [],          // caseId[] — список дел, чьё кинематографическое вступление уже показано
  };
}

let S = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* повреждённый архив — начинаем чистое досье */ }
  return defaultState();
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* offline-режим */ }
}

function resetState() {
  localStorage.removeItem(STORE_KEY);
  S = defaultState();
}

/* ---------- селекторы ---------- */

function caseState(id) {
  if (!S.cases[id]) {
    S.cases[id] = {
      status: 'available', stage: 'briefing', studied: [], code: null,
      attempts: MAX_ATTEMPTS, hintsUsed: [], cooldownUntil: 0,
      solvedAt: null, claimed: false, tries: 0, versionOk: false, briefed: false,
      failStreak: 0,
    };
  }
  return S.cases[id];
}

function caseStatus(c) {
  const cs = S.cases[c.id];
  if (cs && cs.status === 'solved') return 'solved';
  if (cs && cs.status === 'active') return 'active';
  if (c.rank > agentRank().level) return 'locked';
  return 'available';
}

function agentRank() { return rankByRep(S.agent.reputation); }
function nextRank() { return RANKS.find(r => r.threshold > S.agent.reputation) || null; }

function activeCases() {
  return CASES.filter(c => caseStatus(c) === 'active');
}
function availableCases() {
  return CASES.filter(c => caseStatus(c) === 'available');
}
function solvedCases() {
  return CASES.filter(c => caseStatus(c) === 'solved');
}
function unreadCount() { return S.messages.filter(m => !m.read).length; }

function logEvent(text, caseId) {
  S.log.unshift({ time: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), text, caseId: caseId || null });
  if (S.log.length > 40) S.log.pop();
}

/* ---------- мутации ---------- */

function takeCase(id) {
  const cs = caseState(id);
  cs.status = 'active';
  cs.stage = 'briefing';
  logEvent(`Дело ${caseById(id).num} взято в работу`, id);
  save();
}

function grantBadge(id) {
  if (!S.agent.badges.includes(id)) {
    S.agent.badges.push(id);
    const b = BADGES.find(x => x.id === id);
    if (b) toast('accent', 'Новый значок', `${b.icon} «${b.name}»`);
  }
}

function solveCase(id) {
  const c = caseById(id);
  const cs = caseState(id);
  const prevRank = agentRank().level;
  cs.status = 'solved';
  cs.solvedAt = new Date().toLocaleDateString('ru-RU');
  S.agent.credits += c.rewardCredits;
  S.agent.reputation += c.rewardRep;
  S.agent.streak += 1;
  grantBadge('first-case');
  if (cs.tries === 1) grantBadge('clean');
  if (c.materials && cs.studied.length >= c.materials.length) grantBadge('bookworm');
  if (S.agent.streak >= 3) grantBadge('streak3');
  logEvent(`Дело ${c.num} раскрыто (+${c.rewardCredits} кр, +${c.rewardRep} реп)`, id);
  const promoted = agentRank().level > prevRank;
  // следующий вызов от куратора
  queueNextCall();
  save();
  return { promoted, rank: agentRank() };
}

function queueNextCall() {
  const next = availableCases().find(c => c.playable && !S.messages.some(m => m.caseId === c.id));
  if (next) {
    const cur = CURATORS[next.curator];
    S.messages.unshift({
      id: 'msg-' + Date.now(), from: next.curator, read: false, caseId: next.id,
      time: 'только что',
      text: `Агент, ${cur.name.split(' ')[0]} на связи. Для вас новое дело: «${next.title}». Жду в картотеке.`,
    });
  } else if (availableCases().length === 0 && CASES.some(c => caseStatus(c) === 'locked')) {
    if (!S.messages.some(m => m.id === 'msg-locked-tease')) {
      S.messages.unshift({
        id: 'msg-locked-tease', from: 'viktor', read: false, caseId: null, time: 'только что',
        text: 'Все дела вашего допуска раскрыты. Директорат готовит материалы категории II — набирайте репутацию, агент.',
      });
    }
  }
}
