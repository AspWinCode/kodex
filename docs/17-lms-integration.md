# Codex — интеграция с LMS (learning-portal / tirskix-lms)

---

## Назначение

Единая учётная запись ученика между `learning-portal` (кабинет ученика/родителя, финансы, продажи — см. `github.com/AspWinCode/learning-portal`) и Codex: вход одним кликом из кабинета, прогресс сохраняется на сервере (не только в `localStorage` браузера — переживает смену устройства).

Документ фиксирует **реально реализованный** протокол — часть уже работает на стороне Codex (этот репозиторий), часть ещё предстоит сделать на стороне `learning-portal` (раздел 3 — чёткая спецификация для их программистов, не для нас).

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

## 3. Направление 2: прогресс (Codex → LMS) — ❌ не реализовано, спецификация для программистов learning-portal

Сейчас в `learning-portal` нет способа принять данные о прохождении Codex обратно — ни поля в БД, ни эндпоинта. Это отдельная задача для программистов `learning-portal` (не для нас — мы можем только подготовить и, при необходимости, отправлять данные в их будущий эндпоинт).

### 3.1 Что нужно добавить в БД (`backend/app/models.py`)

Либо расширить `StudentCourseAccess` новыми колонками, либо (чище) новую таблицу `student_course_progress`:

```python
class StudentCourseProgress(Base):
    __tablename__ = "student_course_progress"

    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    catalog_item_id = Column(Integer, ForeignKey("course_catalog_items.id", ondelete="CASCADE"), nullable=False, index=True)
    cases_solved = Column(Integer, nullable=False, default=0)
    cases_total = Column(Integer, nullable=False, default=0)
    rank_name = Column(String(64), nullable=True)          # напр. "Оперативник"
    badges_count = Column(Integer, nullable=False, default=0)
    last_badge_name = Column(String(128), nullable=True)     # для уведомления родителю о новом значке
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
```

### 3.2 Новый эндпоинт приёма прогресса

```
POST /api/student-portal/progress-sync
Authorization: не JWT ученика — подписанный запрос тем же SSO_KODEX_SHARED_SECRET
                (HMAC заголовком, см. 3.3), потому что вызывающая сторона — сервер
                Codex, а не браузер ученика.

Тело запроса:
{
  "external_ref": "lp-student-42",
  "cases_solved": 13,
  "cases_total": 39,
  "rank_name": "Оперативник",
  "badges_count": 5,
  "last_badge_name": "Художник"
}

Ответ: 200 { "ok": true }  |  401 при неверной подписи  |  404 если external_ref не найден
```

Обработчик: найти `Student` по `external_ref` (обратное сопоставление `lp-student-{id}` → `id`), найти/создать `StudentCourseProgress` для пары (student, catalog_item code="kodex"), обновить поля.

### 3.3 Подпись запроса (симметрично входящему JWT, тем же секретом)

Простейший вариант — HMAC-подпись тела заголовком, без полноценного JWT (запрос server-to-server, не нуждается в `exp`/`aud` — только в проверке, что отправитель знает секрет):

```
X-Kodex-Signature: hex(HMAC-SHA256(SSO_KODEX_SHARED_SECRET, raw_body))
```

learning-portal проверяет подпись тем же способом, что уже умеет (`hmac.compare_digest`, см. `auth.py: _hash_reset_code` — в проекте уже есть паттерн HMAC-сравнения, использовать тот же).

### 3.4 Где показывать эти данные

- Родительский дашборд (`parent_dashboard.py`) — карточка «Кодэкс»: раскрыто дел из `cases_total`, ранг, число значков, дата последнего обновления.
- Кабинет ученика (`student_portal.py`, витрина курсов) — под названием курса можно показать `cases_solved/cases_total` и последний значок.

### 3.5 Что должен будет добавить Codex после появления этого эндпоинта (не сделано, ждёт их стороны)

Небольшое дополнение к уже существующему `syncLmsProgress()` в `apps/player/js/state.js`: рядом с `PUT /api/lms-progress/:externalRef` — второй best-effort вызов `POST <learning-portal-url>/api/student-portal/progress-sync` с сводкой (не всем состоянием) и подписью из 3.3. Настраивается через переменную окружения `LMS_PROGRESS_SYNC_URL` в `content-api` (не хардкодить домен LMS в код Player). Это отдельная, самостоятельная задача — не блокирует всё остальное в этом документе.

---

## 4. Переменные окружения

| Переменная | Где | Значение |
|---|---|---|
| `SSO_KODEX_SHARED_SECRET` | learning-portal и content-api (VPS) | общий секрет, сгенерировать один раз, прописать в оба `.env`/systemd |
| `SSO_KODEX_TOKEN_TTL_SECONDS` | learning-portal | по умолчанию 60, менять не обязательно |

Секрет никогда не попадает в git ни одного из двух репозиториев — только в переменные окружения на сервере.
