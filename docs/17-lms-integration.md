# Codex — интеграция с LMS (learning-portal / tirskix-lms)

---

## Назначение

Единая учётная запись ученика между `learning-portal` (кабинет ученика/родителя, финансы, продажи — см. `github.com/AspWinCode/learning-portal`) и Codex: вход одним кликом из кабинета, прогресс сохраняется на сервере (не только в `localStorage` браузера — переживает смену устройства).

Документ фиксирует **реально реализованный** протокол — оба направления (вход и обратная синхронизация прогресса) работают на обеих сторонах и проверены на проде.

---

## 1. Направление 1: вход (LMS → Codex) — ✅ реализовано полностью

Уже готово и в learning-portal (`app/services/kodex_sso.py`, `POST .../courses/{item_id}/launch`), и в Codex (`services/content-api/sso/kodex-sso.mjs`, `GET /api/auth/sso`).

```
Ученик жмёт «Запустить курс» в кабинете
        │
        ▼
learning-portal: build_launch_redirect_url()
  — одноразовый JWT (HS256, TTL 60с), подписан SSO_KODEX_SHARED_SECRET
  — payload: { iss: "tirskix-lms", aud: "kodex", external_ref: "lp-student-<id>",
               full_name, catalog_item_code: "kodex", iat, exp, jti }
        │
        ▼ редирект на https://kodex.tirskix.space/api/auth/sso?token=<jwt>
        │
        ▼
Codex: GET /api/auth/sso
  — проверка подписи, iss, aud, exp, защита от повтора (jti, in-memory)
  — редирект на /apps/player/index.html#sso_ref=<external_ref>&sso_name=<имя>
        │
        ▼
Player (apps/player/js/app.js: lmsBootstrap):
  — S.lmsExternalRef = external_ref (устойчивый ключ, не зависит от браузера)
  — GET /api/lms-progress/:externalRef → если есть сохранённое досье,
    оно становится текущим состоянием агента (не пустой хаб с нуля)
  — дальше обычный игровой цикл; save() на каждое изменение best-effort
    (с задержкой 800мс) отправляет текущее состояние на сервер —
    PUT /api/lms-progress/:externalRef
```

**Безопасность**: секрет `SSO_KODEX_SHARED_SECRET` — общий, но отдельный от основных секретов обеих систем (утечка секрета одной системы не позволяет подделывать переходы). Токен живёт 60 секунд и одноразовый (jti) — не предназначен для долгого хранения, только для мгновенного хендшейка.

**Хранилище на стороне Codex**: `services/content-api/data/lms-progress.json`, ключ — `external_ref`, значение — весь блок состояния Player как есть (`S` из `state.js`) — один источник схемы (сам `state.js`), не две синхронизируемые схемы.

---

## 2. Почему это решает проблему «прогресс теряется при смене устройства»

Обычный агент Codex (без входа через LMS) хранит прогресс только в `localStorage` — реальное ограничение, обсуждавшееся отдельно. Агент, вошедший через `external_ref`, получает то же самое состояние на любом устройстве, где он снова войдёт через тот же кабинет LMS — потому что ключ хранения на сервере Codex — не браузер, а `external_ref`.

---

## 3. Направление 2: прогресс (Codex → LMS) — ✅ реализовано с обеих сторон

Полный цикл (спецификация из более раннего черновика этого документа передана программистам `learning-portal` файлом `KODEX_PROGRESS_SYNC_SPEC.md`; они реализовали свою часть, мы — свою). Проверено вручную на проде (см. `CHANGELOG.md`).

### 3.1 На стороне learning-portal (готово)

- Таблица `student_course_progress` (`backend/alembic/versions/0140_student_course_progress.py`, модель `StudentCourseProgress` в `models.py`).
- Эндпоинт `POST /api/v1/student-portal/progress-sync` (`backend/app/routers/student_portal.py`) — путь фактически с префиксом `/api/v1`, не `/api` (важно для конфигурации на нашей стороне, см. 3.3).
- Схема тела — `ProgressSyncRequest` (`backend/app/schemas/student_portal.py`): `external_ref`, `catalog_item_code`, `cases_solved`, `cases_total`, `rank_name`, `badges_count`, `last_badge_name`.
- Проверка подписи `X-Kodex-Signature` — HMAC-SHA256 тем же `SSO_KODEX_SHARED_SECRET`, что и вход, `hmac.compare_digest` (тот же паттерн, что уже был в `auth.py: _hash_reset_code`).
- Отображение прогресса — родительский дашборд (`parent_dashboard.py`), витрина курсов ученика.

### 3.2 На стороне Codex (готово)

`services/content-api/server.mjs`:
- `loadGameData()` — читает `CASES`/`BADGES`/`RANKS` из сида (`packages/game-data/data.js`) тем же способом, что и `readSeedCaseIds()`.
- `buildLmsProgressSummary(state, gameData)` — считает `cases_solved` (по `state.cases[*].status === 'solved'`), `cases_total` (все играбельные дела сида), `rank_name` (по порогам `RANKS` и текущей репутации), `badges_count` и `last_badge_name` (по последнему id в `state.agent.badges`, с расшифровкой имени через `BADGES`).
- `pushLmsProgressSummary(externalRef, state)` — подписывает тело `HMAC-SHA256(SSO_KODEX_SHARED_SECRET, rawBody)` заголовком `X-Kodex-Signature` и best-effort шлёт `POST` на `LMS_PROGRESS_SYNC_URL`. Вызывается из обработчика `PUT /api/lms-progress/:externalRef` сразу после сохранения — не блокирует ответ клиенту (fire-and-forget, симметрично остальной аналитике проекта).

### 3.3 Переменные окружения (обновлено)

| Переменная | Где | Значение |
|---|---|---|
| `SSO_KODEX_SHARED_SECRET` | learning-portal и content-api (VPS) | общий секрет — уже был задан в контейнере `learning-portal-backend-1`, скопирован в systemd-юнит `codex-content-api` |
| `SSO_KODEX_TOKEN_TTL_SECONDS` | learning-portal | по умолчанию 60 |
| `LMS_PROGRESS_SYNC_URL` | content-api (VPS) | `https://tirskix.space/api/v1/student-portal/progress-sync` — публичный домен LMS (не `kodex.tirskix.space`), путь с префиксом `/api/v1` |

Секрет никогда не попадает в git ни одного из двух репозиториев — только в переменные окружения на сервере.

### 3.4 Проверено вручную

- Подписанный `PUT /api/lms-progress/:externalRef` с реальными данными (2 раскрытых дела, 2 значка) корректно посчитал сводку и отправил её на локальный мок-приёмник — тело и подпись совпали побайтово.
- Прямой вызов настоящего продакшн-эндпоинта LMS (`https://tirskix.space/api/v1/student-portal/progress-sync`) с телом, подписанным реальным продакшн-секретом — `401` без подписи, `404` на несуществующего ученика с верной подписью (оба ответа — ожидаемое поведение их стороны, не ошибка).
