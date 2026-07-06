/**
 * AITUNNEL Provider — настоящий LLM-провайдер (AI Generation Architecture,
 * docs/07, раздел 2 — путь подключения был описан заранее, это его
 * реализация). AITUNNEL — российский агрегатор API нейросетей с оплатой в
 * рублях без VPN, OpenAI-совместимый (https://docs.aitunnel.ru/api/reference).
 *
 * Модель по умолчанию — дешёвая (deepseek-v4-flash): генерация черновика
 * дела — простая структурная задача, не требующая топовой/reasoning-модели.
 * Настраивается AITUNNEL_MODEL, ключ — AITUNNEL_API_KEY (вне git, только в
 * окружении процесса — см. README/VPS-деплой).
 *
 * Как и template-provider.mjs, возвращает playable: false — черновик,
 * сгенерированный ИИ, не получает привилегированного пути публикации:
 * та же валидация (validateCase) и тот же цикл рецензии, что и любая
 * ручная правка (docs/08, раздел про AI не имеет отдельного пути записи).
 */

const API_URL = 'https://api.aitunnel.ru/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const CURATORS = ['viktor', 'anna', 'rita'];

const SYSTEM_PROMPT = `Ты — сценарист образовательной платформы Codex: детективное агентство «Кодэкс», которое учит детей программированию на Python, но в интерфейсе нет слов «урок»/«тест»/«домашнее задание» — только «дело», «улика», «верстак», «проверка улик», «куратор». Три куратора: Виктор Кодэкс (директор, синтетические дела), Анна Лог (аналитик, строки/циклы/статистика), Рита Деплой (инженер, структуры данных/функции).

Придумай ОДНО дело для заданной темы и верни СТРОГО валидный JSON (без markdown-обёртки, без пояснений вокруг), по такой схеме:
{
  "title": "название дела",
  "anno": "аннотация для картотеки, 1-2 предложения",
  "goal": "цель расследования одной фразой",
  "suspects": "фигуранты дела",
  "task": "формулировка задачи для агента, с примером вызова функции",
  "fnName": "имя функции на английском, camelCase",
  "starter": "стартовый код на Python: комментарий(и) + определение функции с телом pass, ровно как учебная заготовка",
  "briefing": [{"curator": "viktor|anna|rita", "text": "реплика куратора перед делом"}],
  "evidence": [{"name": "название улики", "tests": [{"args": [...], "expect": ...}, {"args": [...], "expect": ...}]}],
  "hints": {"1": "наводка уровня I — направление", "2": "наводка уровня II — метод", "3": "наводка уровня III — подход целиком, с кодом"},
  "versions": [{"text": "верная версия произошедшего", "correct": true}, {"text": "ложная версия для отвлечения", "correct": false}],
  "finale": [{"curator": "тот же куратор, что в briefing", "text": "финальная реплика при закрытии дела"}]
}
Минимум одна улика, у каждой — минимум два теста. starter — валидный Python-синтаксис. Ответ — ТОЛЬКО JSON.`;

function stripCodeFence(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1].trim() : trimmed;
}

function nextCaseId(existingIds) {
  let n = 1;
  while (existingIds.includes(`case-${String(n).padStart(3, '0')}`)) n++;
  return `case-${String(n).padStart(3, '0')}`;
}

// Модель — не доверенный источник для того, что становится HTML-атрибутом
// (evidence[].id, materials[].id — см. server.mjs: SAFE_ID) — id улик всегда
// перегенерируются нами, а не берутся из ответа модели.
function sanitizeEvidence(evidence) {
  if (!Array.isArray(evidence) || !evidence.length) {
    return [{ id: 'e1', name: '[ЗАПОЛНИТЕ] Название улики', tests: [{ args: [], expect: null }] }];
  }
  return evidence.map((ev, i) => ({
    id: `e${i + 1}`,
    name: (ev && ev.name) || `[ЗАПОЛНИТЕ] Улика ${i + 1}`,
    tests: (ev && Array.isArray(ev.tests) && ev.tests.length) ? ev.tests : [{ args: [], expect: null }],
  }));
}

export async function generate({ topic, existingIds = [] }) {
  const apiKey = process.env.AITUNNEL_API_KEY;
  if (!apiKey) throw new Error('AITUNNEL_API_KEY не задан — провайдер aitunnel недоступен без ключа');

  const model = process.env.AITUNNEL_MODEL || DEFAULT_MODEL;
  const userPrompt = `Тема дела: ${topic || 'на твой выбор — любая тема из школьного курса Python (условия, циклы, списки, словари, функции)'}.`;

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    throw new Error(`Не удалось связаться с AITUNNEL: ${e.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AITUNNEL API вернул ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('AITUNNEL API не вернул текст ответа');

  let draft;
  try {
    draft = JSON.parse(stripCodeFence(content));
  } catch (e) {
    throw new Error(`Не удалось разобрать ответ модели как JSON: ${e.message}`);
  }

  const id = nextCaseId(existingIds);
  const briefingCurator = draft.briefing && draft.briefing[0] && draft.briefing[0].curator;
  const curator = CURATORS.includes(briefingCurator) ? briefingCurator : CURATORS[existingIds.length % CURATORS.length];

  return {
    id,
    num: id.toUpperCase(),
    title: draft.title || '[ЗАПОЛНИТЕ] Название дела',
    curator,
    rank: 1,
    difficulty: 1,
    rewardCredits: 40,
    rewardRep: 60,
    playable: false, // черновик не должен попасть игроку раньше, чем методист его проверит и включит явно
    anno: draft.anno || '[ЗАПОЛНИТЕ] Короткая аннотация для картотеки.',
    goal: draft.goal || '[ЗАПОЛНИТЕ] Цель расследования.',
    suspects: draft.suspects || '[ЗАПОЛНИТЕ] Фигуранты дела.',
    task: draft.task || '[ЗАПОЛНИТЕ] Формулировка задачи.',
    fnName: draft.fnName || 'solve',
    starter: draft.starter || 'def solve():\n    pass\n',
    briefing: (Array.isArray(draft.briefing) && draft.briefing.length) ? draft.briefing : [{ curator, text: '[ЗАПОЛНИТЕ] Бриф от куратора.' }],
    materials: [],
    evidence: sanitizeEvidence(draft.evidence),
    hints: (draft.hints && Object.keys(draft.hints).length) ? draft.hints : { 1: '[ЗАПОЛНИТЕ] Наводка уровня I.' },
    versions: (Array.isArray(draft.versions) && draft.versions.some(v => v && v.correct)) ? draft.versions : [
      { text: '[ЗАПОЛНИТЕ] Верная версия произошедшего.', correct: true },
      { text: '[ЗАПОЛНИТЕ] Ложная версия для отвлечения.', correct: false },
    ],
    finale: (Array.isArray(draft.finale) && draft.finale.length) ? draft.finale : [{ curator, text: '[ЗАПОЛНИТЕ] Финальная реплика при закрытии дела.' }],
  };
}
