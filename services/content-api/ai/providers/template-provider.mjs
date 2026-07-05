/**
 * Template Provider — детерминированный генератор черновика дела без
 * обращения к какой-либо внешней LLM. Это осознанная заглушка на месте
 * настоящего провайдера (AI Generation Architecture, docs/07): в этом
 * деплое нет ключа доступа ни к одному LLM-провайдеру, поэтому вместо
 * притворного «AI» здесь — честный шаблонный генератор, закрывающий
 * механическую часть работы (валидный скелет дела) и оставляющий
 * содержательную часть (сюжет, формулировки) методисту.
 *
 * AI Gateway (../gateway.mjs) обращается к провайдерам через единый
 * интерфейс generate(input) — подключить настоящую LLM позже означает
 * добавить один файл рядом с этим и переключить AI_PROVIDER, не трогая
 * ничего в Studio или в остальном content-api.
 */

const CURATORS_CYCLE = ['viktor', 'anna', 'rita'];

const TOPIC_SKELETONS = {
  if: {
    fnName: 'checkThreshold',
    starter: 'function checkThreshold(n, limit) {\n  \n}\n',
    task: '[ЗАПОЛНИТЕ] Опишите условие: функция checkThreshold(n, limit) возвращает "ДА", если n >= limit, иначе "НЕТ".',
    tests: [{ args: [5, 5], expect: 'ДА' }, { args: [4, 5], expect: 'НЕТ' }],
  },
  while: {
    fnName: 'firstNegative',
    starter: 'function firstNegative(list) {\n  \n}\n',
    task: '[ЗАПОЛНИТЕ] Функция firstNegative(list) возвращает номер первого отрицательного элемента или -1.',
    tests: [{ args: [[1, -2, 3]], expect: 1 }, { args: [[1, 2]], expect: -1 }],
  },
  loop: {
    fnName: 'sumAll',
    starter: 'function sumAll(list) {\n  \n}\n',
    task: '[ЗАПОЛНИТЕ] Функция sumAll(list) возвращает сумму всех чисел списка (0 для пустого списка).',
    tests: [{ args: [[1, 2, 3]], expect: 6 }, { args: [[]], expect: 0 }],
  },
  dict: {
    fnName: 'lookupValue',
    starter: 'function lookupValue(map, key) {\n  \n}\n',
    task: '[ЗАПОЛНИТЕ] Функция lookupValue(map, key) возвращает map[key] или "НЕТ ДАННЫХ", если ключа нет.',
    tests: [{ args: [{ a: 1 }, 'a'], expect: 1 }, { args: [{}, 'z'], expect: 'НЕТ ДАННЫХ' }],
  },
  'multi-return': {
    fnName: 'minMax',
    starter: 'function minMax(list) {\n  \n}\n',
    task: '[ЗАПОЛНИТЕ] Функция minMax(list) возвращает [минимум, максимум] списка.',
    tests: [{ args: [[3, 1, 2]], expect: [1, 3] }],
  },
  generic: {
    fnName: 'echoValue',
    starter: 'function echoValue(x) {\n  \n}\n',
    task: '[ЗАПОЛНИТЕ] Опишите задачу для этого дела и переименуйте echoValue.',
    tests: [{ args: [5], expect: 5 }],
  },
};

function nextCaseId(existingIds) {
  let n = 1;
  while (existingIds.includes(`case-${String(n).padStart(3, '0')}`)) n++;
  return `case-${String(n).padStart(3, '0')}`;
}

export async function generate({ topic, existingIds = [] }) {
  const key = TOPIC_SKELETONS[topic] ? topic : 'generic';
  const skeleton = TOPIC_SKELETONS[key];
  const id = nextCaseId(existingIds);
  const curator = CURATORS_CYCLE[existingIds.length % CURATORS_CYCLE.length];

  return {
    id,
    num: id.toUpperCase().replace('CASE-', 'CASE-'),
    title: `[ЗАПОЛНИТЕ] Новое дело — тема «${key}»`,
    curator,
    rank: 1,
    difficulty: 1,
    rewardCredits: 40,
    rewardRep: 60,
    playable: false, // черновик не должен попасть игроку раньше, чем методист его отредактирует и включит явно
    anno: '[ЗАПОЛНИТЕ] Короткая аннотация для картотеки.',
    goal: '[ЗАПОЛНИТЕ] Цель расследования.',
    suspects: '[ЗАПОЛНИТЕ] Фигуранты дела.',
    task: skeleton.task,
    fnName: skeleton.fnName,
    starter: skeleton.starter,
    briefing: [{ curator, text: '[ЗАПОЛНИТЕ] Бриф от куратора — что произошло и что нужно сделать.' }],
    materials: [],
    evidence: [{ id: 'e1', name: '[ЗАПОЛНИТЕ] Название улики', tests: skeleton.tests }],
    hints: { 1: '[ЗАПОЛНИТЕ] Наводка уровня I.' },
    versions: [
      { text: '[ЗАПОЛНИТЕ] Верная версия произошедшего.', correct: true },
      { text: '[ЗАПОЛНИТЕ] Ложная версия для отвлечения.', correct: false },
    ],
    finale: [{ curator, text: '[ЗАПОЛНИТЕ] Финальная реплика куратора при закрытии дела.' }],
  };
}
