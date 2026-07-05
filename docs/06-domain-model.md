# Codex — Domain Model

---

## Назначение

Основные сущности платформы и связи между ними, как они реально представлены в коде — не абстрактная UML-схема, а карта того, где что лежит.

---

## 1. Сущности

### Agent (игрок)
Хранится в `localStorage` браузера под ключом `kodex-player-v1` (`apps/player/js/state.js`). Поля: `callsign`, `reputation`, `credits`, `hintTokens`, `joined`, `badges`, `streak`, `brass`. Нет сервера-владельца состояния игрока — прогресс локален для устройства (осознанное ограничение, не баг: см. `10-technical-architecture.md`, известные ограничения).

### Case (дело)
Схема — `03-content-architecture.md`. Источники: сид (`packages/game-data/data.js`) + Studio-правки (`services/content-api/data/studio-content.json`), объединяются `merge.js`.

### CaseState (прогресс по делу)
Часть состояния агента: `{ stage, status, attempts, tries, code, studied, confirmed, cooldownUntil, failStreak }` на каждый `case.id`. `status`: locked → available → active → solved.

### Evidence / Material / Hint
Подсущности Case — см. `03-content-architecture.md`.

### StudioOverride + Meta + History (версии и рецензия)
`services/content-api/data/studio-content.json`: `{ cases: {id: caseObject}, meta: {id: {status, author, savedAt, reviewer, reviewComment, reviewedAt}}, history: {id: [{version, savedAt, author, snapshot}]} }`. `status` ∈ draft / in_review / approved / changes_requested. Подробности цикла — `08-content-production-pipeline.md`.

### Event (игровое событие)
`{ type, payload, ts }`, лог в `S.events` (клиент) и best-effort копия в `services/content-api/data/events.jsonl` (сервер). Подробности — `13-event-architecture.md`.

### PythonRunResult (результат проверки)
Ответ Python Runner: `{ compileError, results: [{evidenceId, pass, crashed?, error?, got?}], lastResult }`. Не персистится — существует только в рамках одного HTTP-ответа `/api/run`.

---

## 2. Связи

```
Agent 1──* CaseState 1──1 Case
Case 1──* Evidence
Case 1──* Material
Case 1──1 Hints(3 уровня)
Case 1──? Meta (если правка Studio)
Meta 1──* HistoryEntry
Agent 1──* Event
```

`CaseState` — единственная связь между Agent и Case на клиенте; сервер не хранит, какой агент какое дело проходит (Analytics агрегирует события анонимно по `caseId`, без привязки к конкретному агенту — см. `13-event-architecture.md`).

---

## 3. Идентификаторы

Все `id` (дела/улики/материала) — `^[a-z0-9-]+$`, проверяется на границе записи (`validateCase`), потому что вставляются в HTML-атрибуты без экранирования на нескольких экранах Player (`data-case`, `data-ev`, `data-doc`).
