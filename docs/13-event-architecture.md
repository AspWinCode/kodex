# Codex — Event Architecture

---

## Назначение

Как Player фиксирует игровые события, и как они превращаются в аналитику Studio. Событийная модель здесь простая (в отличие от аспирационного event-bus из `02-engine-architecture.md`): нет диспетчера/подписчиков, есть последовательный лог + best-effort копия на сервер.

---

## 1. Клиентский журнал

`logGameEvent(type, payload)` (`apps/player/js/engine.js`) добавляет запись `{ type, payload, ts }` в `S.events` (часть состояния агента в `localStorage`) и одновременно best-effort отправляет копию на сервер (`sendEventToAnalytics`) — сбой сети никогда не блокирует и не откатывает игровое действие.

## 2. Реальные типы событий (по коду, не по спецификации)

| Тип | Где вызывается | Смысл |
|---|---|---|
| `case.taken` | `state.js` | агент взял дело в работу |
| `case.completed` | `state.js` | дело раскрыто |
| `task.check_passed` | `screens.js` | все улики подтверждены за одну попытку |
| `task.check_failed` | `screens.js` | попытка провалена (с `evidenceId`, `crashed`) |
| `hint.delivered` | `overlays.js` | выдана наводка Джарвисмена (с уровнем) |
| `xp.awarded` / `credits.awarded` | `state.js` | начисление награды при раскрытии |
| `rank.promoted` | `state.js` | повышение допуска |
| `achievement.granted` | `state.js` | выдан значок |

---

## 3. Серверный журнал

`POST /api/events` дописывает строку в `services/content-api/data/events.jsonl` (append-only, одна запись — одна строка JSON) через `appendEvent()`. Не валидирует форму строго (`if (payload && payload.type)`) — некритичный, best-effort приёмник (см. `11-database-architecture.md`).

`computeAnalytics(events)` (`server.mjs`) агрегирует по `caseId` из `payload`: количество взятий, раскрытий, пройденных/провальных проверок, использованных наводок; вычисляет `completionRate`/`successRate`. Отдаётся `GET /api/analytics`, читается дашбордом Studio.

**Не привязано к конкретному агенту** — события анонимны относительно личности, агрегация идёт только по делу. Это осознанное ограничение (нет серверной идентификации агента вообще — см. `06-domain-model.md`).

---

## 4. Гарантии

- Аналитика **никогда** не блокирует игровой цикл — сбой отправки события молча игнорируется на клиенте.
- Журнал append-only — нет удаления/изменения задним числом отдельных событий (только через резервную копию/восстановление, см. `11-database-architecture.md`).
