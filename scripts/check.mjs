#!/usr/bin/env node
/**
 * Codex — базовый Quality Gate (Engineering Handbook, раздел 29).
 * Не требует установки зависимостей: только встроенные модули Node.
 *
 * Проверяет:
 *  1. Синтаксическую корректность всех .js файлов apps/player.
 *  2. Инварианты игровых данных (data.js): каждое играбельное дело обязано
 *     иметь задачу, стартовый код, минимум одну улику, у каждой улики —
 *     минимум один тест, минимум одну подсказку, финал и брифинг.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const playerJsDir = join(root, 'apps/player/js');

let errors = 0;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (extname(full) === '.js') out.push(full);
  }
  return out;
}

console.log('== Codex Quality Gate ==\n');

// 1. Синтаксическая проверка
console.log('-- Синтаксис --');
for (const file of walk(playerJsDir)) {
  const code = readFileSync(file, 'utf8');
  try {
    new vm.Script(code, { filename: file });
    console.log(`  ok    ${file.replace(root, '')}`);
  } catch (e) {
    console.error(`  FAIL  ${file.replace(root, '')}: ${e.message}`);
    errors++;
  }
}

// 2. Инварианты данных (data.js)
console.log('\n-- Инварианты игровых данных --');
try {
  const dataCode = readFileSync(join(playerJsDir, 'data.js'), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(dataCode, ctx, { filename: 'data.js' });
  // top-level const/let в vm-контексте не становятся свойствами ctx —
  // достаём значения отдельным прогоном в том же (сохраняющем лексическую область) контексте
  const cases = vm.runInContext('CASES', ctx) || [];
  const playable = cases.filter(c => c.playable);
  console.log(`  дел всего: ${cases.length}, играбельных: ${playable.length}`);

  for (const c of playable) {
    const prefix = `  [${c.id}]`;
    if (!c.fnName) { console.error(`${prefix} нет fnName`); errors++; }
    if (!c.starter) { console.error(`${prefix} нет starter`); errors++; }
    if (!Array.isArray(c.evidence) || c.evidence.length === 0) {
      console.error(`${prefix} нет улик (evidence)`); errors++;
    } else {
      for (const ev of c.evidence) {
        if (!Array.isArray(ev.tests) || ev.tests.length === 0) {
          console.error(`${prefix} улика «${ev.id}» без тестов`); errors++;
        }
      }
    }
    if (!c.hints || Object.keys(c.hints).length === 0) {
      console.error(`${prefix} нет подсказок (hints)`); errors++;
    }
    if (!Array.isArray(c.briefing) || c.briefing.length === 0) {
      console.error(`${prefix} нет брифинга`); errors++;
    }
    if (!Array.isArray(c.finale) || c.finale.length === 0) {
      console.error(`${prefix} нет финала`); errors++;
    }
    if (!Array.isArray(c.versions) || c.versions.length === 0) {
      console.error(`${prefix} нет версий для отчёта закрытия дела`); errors++;
    } else if (!c.versions.some(v => v.correct)) {
      console.error(`${prefix} среди версий нет ни одной верной`); errors++;
    }
  }
  console.log(errors === 0 ? '  ok    все играбельные дела соответствуют схеме' : '');
} catch (e) {
  console.error(`  FAIL  не удалось загрузить data.js: ${e.message}`);
  errors++;
}

console.log(`\n== Итог: ${errors === 0 ? 'ПРОЙДЕНО' : `${errors} ошибок`} ==`);
process.exit(errors === 0 ? 0 : 1);
