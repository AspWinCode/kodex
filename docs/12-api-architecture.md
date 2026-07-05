# Codex — API Architecture

---

## Назначение

Полный перечень HTTP-эндпоинтов `services/content-api/server.mjs` — единственного бэкенд-процесса платформы. Документ ведётся синхронно с кодом; при расхождении источник истины — код.

Общие конвенции: JSON-тело запроса/ответа (`Content-Type: application/json; charset=utf-8`), ошибки — `{ error: string }` или `{ errors: string[] }` с соответствующим HTTP-статусом. Без версионирования путей (`/api/v1/...`) — single-tenant внутренний инструмент, версионирование не оправдано на этом масштабе.

---

## 1. Health

`GET /api/health` → `{ ok, aiProvider, pythonRunner }`. Используется для проверки после деплоя (`curl` в цикле commit→push→deploy) и для отображения режима раннера (`docker` vs `unsafe-local-dev`).

---

## 2. Исполнение решения агента

`POST /api/run` `{ code, fnName, evidence }` → `{ compileError, results, lastResult }`. См. `03-content-architecture.md` (контракт улик) и `10-technical-architecture.md` (изоляция). Не требует авторизации — вызывается напрямую из Player при каждой проверке улик.

---

## 3. AI-черновик

`POST /api/generate-draft` `{ topic }` → `{ draft, provider }`. Ничего не сохраняет — только генерирует объект дела для доработки. См. `07-ai-generation-architecture.md`.

---

## 4. Контент дел (Publishing + версии/рецензия)

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/api/content` | — | `{ cases, meta: {}, history: {} }` — только approved + легаси |
| GET | `/api/content?all=1` | — | `{ cases, meta, history }` — полный стор, для Studio |
| PUT | `/api/content/:id` | объект дела | `{ ok, id, version }` или `422 { errors }` |
| DELETE | `/api/content/:id` | — | `{ ok }` |
| POST | `/api/content/:id/submit` | — | `{ ok, status: 'in_review' }` |
| POST | `/api/content/:id/review` | `{ decision, comment }` | `{ ok, status }` |
| GET | `/api/content/:id/history` | — | `{ history, meta }` |
| POST | `/api/content/:id/restore` | `{ version }` | `{ ok, id, version }` |

Заголовок `X-Studio-Author` (URL-кодированный) на изменяющих запросах — см. `08-content-production-pipeline.md`. Полная схема тела дела — `03-content-architecture.md`.

---

## 5. События и аналитика

`POST /api/events` `{ type, payload, ... }` → `{ ok }` — best-effort, никогда не возвращает ошибку игроку (см. `13-event-architecture.md`). `GET /api/analytics` → агрегаты по делам для дашборда Studio.

---

## 6. Статика

Всё, что не начинается с `/api/`, отдаётся как файл репозитория (`serveStatic`). Заблокировано регулярным выражением: `.git`, `.github`, `.claude`, `.gitignore` — репозиторий физически лежит в веб-корне на VPS, без этого блока история git была бы публично скачиваема.
