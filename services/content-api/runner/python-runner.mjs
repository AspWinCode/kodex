/**
 * Python Runner — запуск решения агента в изолированном окружении.
 *
 * Режим по умолчанию ('docker') — единственный, допустимый в продакшне:
 * каждое исполнение — отдельный, одноразовый контейнер без сети, без
 * доступа к хост-файловой системе, с жёсткими лимитами ресурсов.
 *
 * Режим 'unsafe-local-dev' существует ТОЛЬКО для локальной разработки на
 * машинах без установленного Docker (спавнит системный python напрямую,
 * без какой-либо изоляции) — включается явно через переменную окружения
 * PYTHON_RUNNER_MODE=unsafe-local-dev, никогда не является поведением
 * по умолчанию, и при попытке использовать его сервис обязан явно
 * предупреждать (см. server.mjs, лог при старте).
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HARNESS_PATH = fileURLToPath(new URL('../../python-runner/harness.py', import.meta.url));
const DOCKER_IMAGE = process.env.PYTHON_RUNNER_IMAGE || 'codex-python-runner';
const TIMEOUT_MS = 10000;

function runProcess(command, args, input) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ compileError: `Не удалось запустить раннер (${command}): ${e.message}` });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ compileError: 'Превышено время выполнения (раннер не ответил вовремя)' });
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('error', (e) => {
      finish({ compileError: `Раннер недоступен: ${e.message}` });
    });

    child.on('close', (code) => {
      if (!stdout.trim()) {
        finish({ compileError: `Раннер завершился без ответа (код ${code}): ${stderr.slice(0, 300) || 'нет вывода'}` });
        return;
      }
      try {
        const lastLine = stdout.trim().split('\n').pop();
        finish(JSON.parse(lastLine));
      } catch (e) {
        finish({ compileError: `Не удалось разобрать ответ раннера: ${e.message}` });
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

export async function runPython({ code, fnName, evidence }) {
  const payload = JSON.stringify({ code, fnName, evidence });
  const mode = process.env.PYTHON_RUNNER_MODE || 'docker';

  if (mode === 'unsafe-local-dev') {
    const pythonBin = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
    return runProcess(pythonBin, [HARNESS_PATH], payload);
  }

  return runProcess('docker', [
    'run', '--rm', '-i',
    '--network=none',
    '--memory=256m',
    '--cpus=0.5',
    '--pids-limit=64',
    '--read-only',
    '--tmpfs', '/tmp',
    DOCKER_IMAGE,
  ], payload);
}

export function runnerModeDescription() {
  const mode = process.env.PYTHON_RUNNER_MODE || 'docker';
  return mode === 'unsafe-local-dev'
    ? 'unsafe-local-dev (БЕЗ ИЗОЛЯЦИИ — только для разработки, не использовать в проде)'
    : 'docker (изолированный контейнер на попытку)';
}
