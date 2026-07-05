# Codex — Backend Architecture

---

## Назначение

Внутреннее устройство единственного бэкенд-процесса (`services/content-api/server.mjs`) и границы безопасности вокруг него.

---

## 1. Структура процесса

Один файл `server.mjs`, без фреймворка, поверх `node:http`. Основной цикл: разобрать `pathname`/`searchParams` из `req.url` → если начинается с `/api/` — `handleApi()`, иначе `serveStatic()`. `handleApi` — последовательность `if`-проверок по `pathname`+`method` (см. `12-api-architecture.md` — полный список).

Вспомогательные модули процесса:
- `ai/gateway.mjs` + `ai/providers/*` — генерация черновиков (`07`).
- `runner/python-runner.mjs` — спавн `docker run` или прямого `python` (dev-режим) для исполнения кода агента.

---

## 2. Границы безопасности

| Угроза | Механизм защиты | Где |
|---|---|---|
| Произвольный код агента (RCE) | Docker-изоляция: `--network=none --read-only --memory=256m --pids-limit=64 --rm`, non-root пользователь | `services/python-runner/Dockerfile`, `runner/python-runner.mjs` |
| XSS через `id` дела/улики/материала | Регулярка `^[a-z0-9-]+$` на границе записи | `server.mjs: validateCase`, `scripts/check.mjs` |
| XSS через произвольный текстовый контент | `esc()` на каждом месте вывода в DOM | `apps/player/js/ui.js`, `apps/studio/js/studio.js` |
| Утечка `.git` через веб-корень | `nginx location ~ /\.(git|github|claude|gitignore)` + дублирующая блокировка в `serveStatic` (`BLOCKED` regex) | VPS-конфиг + `server.mjs` |
| Path traversal через статику | `path.normalize` + проверка `startsWith(ROOT)` | `server.mjs: serveStatic` |
| Зависание/зацикленное решение агента | SIGALRM-таймаут внутри `harness.py` (8с) + внешний таймаут Node (10с) | `harness.py`, `runner/python-runner.mjs` |

**Явно вне зоны защиты:** сам `services/content-api` API не имеет аутентификации/авторизации — доверенный внутренний инструмент одной команды (см. `08-content-production-pipeline.md`, `X-Studio-Author` — не аутентификация).

---

## 3. Отказоустойчивость

systemd-юнит `codex-content-api` с `Restart=always`. Проверено не гипотетически: намеренный `kill -9` процесса на VPS → автоматическое восстановление за ≤4 секунды без вмешательства.

---

## 4. Развёртывание

`git pull && systemctl restart codex-content-api` — обновление кода. При изменении `services/python-runner/harness.py` или `Dockerfile` дополнительно требуется `docker build -t codex-python-runner .` до рестарта сервиса (иначе рестарт продолжит использовать старый образ). Данные (`services/content-api/data/`) вне git — переживают `git pull` без потерь.
