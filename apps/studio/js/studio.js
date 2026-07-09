/* ============ Codex Studio — минимальный Case Editor ============ *
 * Studio Architecture (docs/09, раздел 3 — Case Editor): список дел + форма
 * редактирования одного дела поверх тех же данных, что читает Player
 * (packages/game-data/data.js). Правки хранятся не в localStorage браузера,
 * а в общем JSON-файле на сервере через services/content-api — это и есть
 * настоящий Publishing: правка видна всем, переживает перезагрузку страницы.
 * Гейт качества при сохранении выполняет сервер (services/content-api/server.mjs,
 * validateCase) — Studio лишь показывает вернувшиеся ошибки.
 * ------------------------------------------------------------------- */
'use strict';

const APP = document.getElementById('app');

function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function toast(kind, text) {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = `st-toast st-toast-${kind}`;
  t.textContent = text;
  root.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

/* ---------- схема простых полей формы ---------- */
const SIMPLE_FIELDS = [
  ['num', 'Номер дела', 'text', 'CASE-011'],
  ['title', 'Название', 'text', ''],
  ['curator', 'Куратор', 'select', ''],
  ['rank', 'Требуемый допуск', 'number', '1'],
  ['difficulty', 'Сложность (1–3)', 'number', '1'],
  ['rewardCredits', 'Награда: кредиты', 'number', '40'],
  ['rewardRep', 'Награда: репутация', 'number', '60'],
];

// materials — обычный JSON-textarea; остальные поля используют визуальные редакторы
const JSON_FIELDS = [
  ['briefing', 'Брифинг', '[]'],
  ['materials', 'Материалы дела', '[]'],
  ['evidence', 'Улики и тесты', '[]'],
  ['hints', 'Подсказки', '{}'],
  ['versions', 'Версии отчёта', '[]'],
  ['finale', 'Финальная сцена', '[]'],
];

/* ============ Визуальные редакторы JSON-полей ============ */

function veCuratorOpts(selected) {
  return Object.keys(CURATORS).map(k =>
    `<option value="${k}" ${selected === k ? 'selected' : ''}>${esc(CURATORS[k].name)}</option>`
  ).join('');
}

function renderVeDialogue(key, label, items) {
  items = Array.isArray(items) ? items : [];
  return `<div class="st-field">
    <label>${label}</label>
    <div class="ve-list" id="ve-${key}">
      ${items.map(it => `<div class="ve-row ve-dialogue-row">
        <select class="ve-f" data-f="curator">${veCuratorOpts(it.curator)}</select>
        <textarea class="ve-f" data-f="text" rows="2">${esc(it.text || '')}</textarea>
        <button type="button" class="st-btn st-btn-s st-btn-danger ve-del">✕</button>
      </div>`).join('')}
    </div>
    <button type="button" class="st-btn st-btn-s ve-add" data-list="ve-${key}" data-tpl="dialogue">+ Реплика</button>
    <textarea name="${key}" hidden></textarea>
  </div>`;
}

function renderVeHints(hints) {
  hints = hints && typeof hints === 'object' ? hints : {};
  return `<div class="st-field">
    <label>Подсказки по уровням <span class="st-hint">(обязательно)</span></label>
    <div id="ve-hints">
      ${[1, 2, 3].map(lvl => `<div class="ve-hints-row">
        <span class="ve-hints-label">Уровень ${lvl}</span>
        <textarea class="ve-f" data-hint="${lvl}" rows="2">${esc(hints[lvl] || hints[String(lvl)] || '')}</textarea>
      </div>`).join('')}
    </div>
    <textarea name="hints" hidden></textarea>
  </div>`;
}

function renderVeVersions(versions) {
  versions = Array.isArray(versions) ? versions : [];
  return `<div class="st-field">
    <label>Версии для отчёта закрытия <span class="st-hint">(обязательно, минимум одна correct)</span></label>
    <div class="ve-list" id="ve-versions">
      ${versions.map(v => `<div class="ve-row ve-version-row">
        <label class="ve-correct-label">
          <input type="checkbox" class="ve-f" data-f="correct" ${v.correct ? 'checked' : ''}>
          Верная версия
        </label>
        <textarea class="ve-f" data-f="text" rows="2">${esc(v.text || '')}</textarea>
        <button type="button" class="st-btn st-btn-s st-btn-danger ve-del">✕</button>
      </div>`).join('')}
    </div>
    <button type="button" class="st-btn st-btn-s ve-add" data-list="ve-versions" data-tpl="version">+ Версия</button>
    <textarea name="versions" hidden></textarea>
  </div>`;
}

function renderVeTestRow(t, i) {
  const argsStr = Array.isArray(t.args) ? t.args.map(a => JSON.stringify(a)).join(', ') : '';
  const expectStr = t.expect !== undefined ? JSON.stringify(t.expect) : '';
  return `<div class="ve-test-row" data-test>
    <span class="ve-test-n">#${i + 1}</span>
    <input class="ve-f" data-f="args" type="text" value="${esc(argsStr)}" placeholder='"hello", 42'>
    <span class="ve-arrow">→</span>
    <input class="ve-f" data-f="expect" type="text" value="${esc(expectStr)}" placeholder='"OLLEH"'>
    <button type="button" class="st-btn st-btn-s st-btn-danger ve-del-test">✕</button>
  </div>`;
}

function renderVeEvidenceItem(e, i) {
  e = e || { id: `e${i + 1}`, name: '', tests: [] };
  const tests = Array.isArray(e.tests) ? e.tests : [];
  return `<div class="ve-row ve-evidence-item" data-ulika>
    <div class="ve-evidence-header">
      <input class="ve-f ve-id" data-f="id" type="text" value="${esc(e.id || `e${i + 1}`)}" placeholder="e1">
      <input class="ve-f ve-name" data-f="name" type="text" value="${esc(e.name || '')}" placeholder="Название улики">
      <button type="button" class="st-btn st-btn-s st-btn-danger ve-del">✕ Улику</button>
    </div>
    <div class="ve-tests-list">${tests.map((t, ti) => renderVeTestRow(t, ti)).join('')}</div>
    <button type="button" class="st-btn st-btn-s ve-add-test">+ Тест</button>
  </div>`;
}

function renderVeEvidence(evidence) {
  evidence = Array.isArray(evidence) ? evidence : [];
  return `<div class="st-field">
    <label>Улики и тесты <span class="st-hint">(обязательно)</span></label>
    <div class="ve-list" id="ve-evidence">
      ${evidence.map((e, i) => renderVeEvidenceItem(e, i)).join('')}
    </div>
    <button type="button" class="st-btn st-btn-s ve-add" data-list="ve-evidence" data-tpl="evidence">+ Улика</button>
    <textarea name="evidence" hidden></textarea>
  </div>`;
}

function bindVeDelTests(container) {
  container.querySelectorAll('.ve-del-test').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('[data-test]');
      const list = row.parentElement;
      row.remove();
      list.querySelectorAll('.ve-test-n').forEach((el, i) => el.textContent = `#${i + 1}`);
    };
  });
}

function bindVeAddTest(btn) {
  btn.onclick = () => {
    const list = btn.previousElementSibling;
    const idx = list.children.length;
    const div = document.createElement('div');
    div.innerHTML = renderVeTestRow({}, idx);
    const row = div.firstElementChild;
    list.appendChild(row);
    bindVeDelTests(row.parentElement);
  };
}

function bindVisualEditors(form) {
  // Кнопки "Добавить строку"
  form.querySelectorAll('.ve-add').forEach(btn => {
    btn.onclick = () => {
      const list = document.getElementById(btn.dataset.list);
      const tpl = btn.dataset.tpl;
      const div = document.createElement('div');
      if (tpl === 'dialogue') {
        div.innerHTML = `<div class="ve-row ve-dialogue-row">
          <select class="ve-f" data-f="curator">${veCuratorOpts('')}</select>
          <textarea class="ve-f" data-f="text" rows="2"></textarea>
          <button type="button" class="st-btn st-btn-s st-btn-danger ve-del">✕</button>
        </div>`;
      } else if (tpl === 'version') {
        div.innerHTML = `<div class="ve-row ve-version-row">
          <label class="ve-correct-label">
            <input type="checkbox" class="ve-f" data-f="correct"> Верная версия
          </label>
          <textarea class="ve-f" data-f="text" rows="2"></textarea>
          <button type="button" class="st-btn st-btn-s st-btn-danger ve-del">✕</button>
        </div>`;
      } else if (tpl === 'evidence') {
        div.innerHTML = renderVeEvidenceItem({}, list.children.length);
        div.querySelector('.ve-add-test') && bindVeAddTest(div.querySelector('.ve-add-test'));
      }
      const row = div.firstElementChild;
      if (!row) return;
      list.appendChild(row);
      row.querySelectorAll('.ve-del').forEach(b => b.onclick = () => b.closest('.ve-row, [data-ulika]')?.remove());
      bindVeDelTests(row);
    };
  });

  // Кнопки "Удалить строку"
  form.querySelectorAll('.ve-del').forEach(btn => {
    btn.onclick = () => btn.closest('.ve-row, [data-ulika]')?.remove();
  });

  // Кнопки "Добавить тест" внутри улик
  form.querySelectorAll('.ve-add-test').forEach(bindVeAddTest);
  bindVeDelTests(form);
}

function syncVisualEditors(form) {
  // Брифинг и финал
  for (const key of ['briefing', 'finale']) {
    const list = form.querySelector(`#ve-${key}`);
    if (!list) continue;
    const data = [...list.querySelectorAll('.ve-dialogue-row')].map(row => ({
      curator: row.querySelector('[data-f=curator]').value,
      text: row.querySelector('[data-f=text]').value,
    }));
    form.querySelector(`textarea[name="${key}"]`).value = JSON.stringify(data);
  }

  // Подсказки
  const hintsEl = form.querySelector('#ve-hints');
  if (hintsEl) {
    const data = {};
    hintsEl.querySelectorAll('[data-hint]').forEach(el => { data[el.dataset.hint] = el.value; });
    form.querySelector('textarea[name="hints"]').value = JSON.stringify(data);
  }

  // Версии
  const versionsEl = form.querySelector('#ve-versions');
  if (versionsEl) {
    const data = [...versionsEl.querySelectorAll('.ve-version-row')].map(row => ({
      text: row.querySelector('[data-f=text]').value,
      correct: row.querySelector('[data-f=correct]').checked,
    }));
    form.querySelector('textarea[name="versions"]').value = JSON.stringify(data);
  }

  // Улики
  const evidenceEl = form.querySelector('#ve-evidence');
  if (evidenceEl) {
    const data = [...evidenceEl.querySelectorAll('[data-ulika]')].map((ulika, i) => ({
      id: ulika.querySelector('[data-f=id]').value || `e${i + 1}`,
      name: ulika.querySelector('[data-f=name]').value,
      tests: [...ulika.querySelectorAll('[data-test]')].map(test => {
        const argsStr = test.querySelector('[data-f=args]').value.trim();
        const expectStr = test.querySelector('[data-f=expect]').value.trim();
        let args = [], expect = null;
        try { args = JSON.parse('[' + argsStr + ']'); } catch { if (argsStr) args = [argsStr]; }
        try { expect = JSON.parse(expectStr); } catch { expect = expectStr; }
        return { args, expect };
      }),
    }));
    form.querySelector('textarea[name="evidence"]').value = JSON.stringify(data);
  }
}

/* ---------- статусы рецензии (Studio Architecture, docs/09) ---------- */
const STATUS_LABEL = {
  draft: 'Черновик',
  in_review: 'На проверке',
  approved: 'Одобрено',
  changes_requested: 'Есть замечания',
};

/* ---------- панель имени (идентификация «на доверии», не аутентификация) ---------- */
function renderAuthorBar() {
  const bar = document.createElement('div');
  bar.className = 'st-author-bar';
  bar.innerHTML = `<span>Вы:</span><input type="text" id="studio-author-input" placeholder="ваше имя" value="${esc(localStorage.getItem('studio-author') || '')}">`;
  document.body.appendChild(bar);
  bar.querySelector('input').oninput = (e) => localStorage.setItem('studio-author', e.target.value.trim());
}
renderAuthorBar();

/* ---------- маршрутизация ---------- */
let pendingDraft = null; // черновик от AI Gateway, ждущий редактирования (ещё не сохранён)

async function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (raw === 'edit/draft' && pendingDraft) return renderEditor('new', pendingDraft);
  if (raw.startsWith('edit/')) return renderEditor(raw.slice(5));
  if (raw === 'export') return renderExport();
  if (raw === 'analytics') return renderAnalytics();
  return renderList();
}
window.addEventListener('hashchange', route);

const AI_TOPICS = [
  ['if', 'Условие (if/else)'],
  ['while', 'Цикл while'],
  ['loop', 'Накопление в цикле (for)'],
  ['dict', 'Словарь/реестр'],
  ['multi-return', 'Несколько возвращаемых значений'],
  ['generic', 'Общий скелет'],
];

/* ---------- список дел ---------- */
async function renderList() {
  APP.innerHTML = `<div class="st-header"><h1>CODEX STUDIO</h1></div><p class="st-sub">Загрузка…</p>`;

  const [cases, meta] = await Promise.all([mergedCasesView(CASES), loadStudioMeta()]);
  const seedIds = CASES.map(c => c.id);
  const overriddenIds = new Set(Object.keys(meta));

  APP.innerHTML = `
    <div class="st-header">
      <div>
        <h1>CODEX STUDIO</h1>
        <div class="st-sub">Редактор дел · ${cases.length} всего · правки хранятся на сервере (services/content-api), общие для всех · в игру попадает только «Одобрено»</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <select id="ai-topic" title="Тема черновика">${AI_TOPICS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <button class="st-btn" id="ai-generate">✨ Сгенерировать черновик</button>
        <a class="st-link" href="#/analytics">Аналитика →</a>
        <a class="st-link" href="#/export">Экспорт правок →</a>
        <button class="st-btn st-btn-primary" id="new-case">+ Создать дело</button>
      </div>
    </div>
    <table class="st-table">
      <thead><tr><th>ID</th><th>Название</th><th>Куратор</th><th>Допуск</th><th>Играбельно</th><th>Статус</th><th></th></tr></thead>
      <tbody>
        ${cases.map(c => {
    const overridden = overriddenIds.has(c.id);
    const isNew = !seedIds.includes(c.id);
    const cur = CURATORS[c.curator];
    return `<tr>
            <td class="st-mono" style="font-family:var(--font-mono);font-size:12px">${esc(c.id)}</td>
            <td>${esc(c.title || '—')}</td>
            <td>${cur ? esc(cur.name) : esc(c.curator || '—')}</td>
            <td>${'I'.repeat(c.rank || 1)}</td>
            <td>${c.playable ? '✓' : '—'}</td>
            <td>
              ${isNew ? '<span class="st-badge st-badge-new">новое</span>' : overridden ? '<span class="st-badge st-badge-edited">изменено</span>' : '<span class="st-badge st-badge-off">сид</span>'}
              ${overridden && meta[c.id] ? `<span class="st-badge st-badge-${meta[c.id].status}">${STATUS_LABEL[meta[c.id].status] || meta[c.id].status}</span>` : ''}
            </td>
            <td style="text-align:right;white-space:nowrap">
              <button class="st-btn st-btn-s" data-edit="${esc(c.id)}">Редактировать</button>
              ${overridden ? `<button class="st-btn st-btn-s st-btn-danger" data-reset="${esc(c.id)}">Сбросить</button>` : ''}
            </td>
          </tr>`;
  }).join('')}
      </tbody>
    </table>
  `;

  APP.querySelector('#new-case').onclick = () => { location.hash = '#/edit/new'; };
  APP.querySelector('#ai-generate').onclick = async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Генерирую…';
    try {
      const topic = APP.querySelector('#ai-topic').value;
      const { draft, provider } = await generateDraftCase(topic);
      pendingDraft = draft;
      toast('success', `Черновик готов (провайдер: ${provider}) — доработайте и сохраните`);
      location.hash = '#/edit/draft';
    } catch (err) {
      toast('error', 'Не удалось сгенерировать черновик: ' + err.message);
      btn.disabled = false;
      btn.textContent = '✨ Сгенерировать черновик';
    }
  };
  APP.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { location.hash = '#/edit/' + b.dataset.edit; });
  APP.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
    if (!confirm(`Сбросить правки для «${b.dataset.reset}» к исходному сиду?`)) return;
    await removeStudioOverride(b.dataset.reset);
    toast('success', 'Правка сброшена к сиду');
    renderList();
  });
}

/* ---------- форма редактирования / создания ---------- */
async function renderEditor(id, preset) {
  const isNew = id === 'new';
  APP.innerHTML = `<div class="st-header"><h1>${isNew ? 'НОВОЕ ДЕЛО' : 'РЕДАКТИРОВАНИЕ'}</h1></div><p class="st-sub">Загрузка…</p>`;

  const seed = isNew ? null : (await mergedCasesView(CASES)).find(c => c.id === id);
  // Совместное редактирование (docs/08, docs/09): запоминаем версию, с которой
  // открыта форма — при сохранении сервер сверит её с текущей и откажет 409,
  // если кто-то другой уже сохранил дело за это время (не тихая перезапись).
  let baseVersion = null;
  if (!isNew) {
    const { history } = await fetchCaseHistory(id);
    baseVersion = history.length ? history[history.length - 1].version : 0;
  }
  const c = preset || seed || {
    id: '', num: '', title: '', curator: Object.keys(CURATORS)[0], rank: 1, difficulty: 1,
    rewardCredits: 40, rewardRep: 60, anno: '', goal: '', suspects: '', playable: true,
    task: '', fnName: '', starter: '',
    briefing: [], materials: [], evidence: [], hints: {}, versions: [], finale: [],
  };
  if (preset) pendingDraft = null; // черновик потреблён — не подставлять его повторно при обновлении хэша

  APP.innerHTML = `
    <div class="st-header">
      <div>
        <h1>${isNew ? 'НОВОЕ ДЕЛО' : 'РЕДАКТИРОВАНИЕ · ' + esc(id)}</h1>
        <div class="st-sub">${preset ? '✨ Черновик сгенерирован шаблонным AI-провайдером — замените поля [ЗАПОЛНИТЕ] перед сохранением. ' : ''}Сохранение идёт на сервер (services/content-api) — Player подхватит правку сразу, с любого браузера</div>
      </div>
      <a class="st-link" href="#/">← К списку дел</a>
    </div>
    <div id="form-errors"></div>
    <form class="st-form" id="case-form">
      ${isNew ? `<div class="st-field"><label>ID дела (латиницей, уникальный)</label><input type="text" name="id" value="${esc(c.id)}" placeholder="case-011"></div>` : ''}
      <div class="st-row">
        ${SIMPLE_FIELDS.map(([key, label, type]) => {
    if (key === 'curator') {
      return `<div class="st-field"><label>${label}</label>
              <select name="curator">${Object.keys(CURATORS).map(k => `<option value="${k}" ${c.curator === k ? 'selected' : ''}>${esc(CURATORS[k].name)}</option>`).join('')}</select></div>`;
    }
    return `<div class="st-field"><label>${label}</label><input type="${type}" name="${key}" value="${esc(c[key] ?? '')}"></div>`;
  }).join('')}
      </div>
      <div class="st-check"><input type="checkbox" name="playable" id="f-playable" ${c.playable ? 'checked' : ''}><label for="f-playable">Играбельно (показывать в картотеке как доступное дело)</label></div>
      <div class="st-field"><label>Аннотация (карточка в картотеке)</label><textarea name="anno" rows="2">${esc(c.anno || '')}</textarea></div>
      <div class="st-field"><label>Цель расследования</label><input type="text" name="goal" value="${esc(c.goal || '')}"></div>
      <div class="st-field"><label>Фигуранты</label><input type="text" name="suspects" value="${esc(c.suspects || '')}"></div>
      <div class="st-field"><label>Формулировка задачи</label><textarea name="task" rows="2">${esc(c.task || '')}</textarea></div>
      <div class="st-field"><label>Имя функции (fnName)</label><input type="text" name="fnName" value="${esc(c.fnName || '')}"></div>
      <div class="st-field"><label>Стартовый код (starter)</label><textarea class="st-mono" name="starter" rows="5">${esc(c.starter || '')}</textarea></div>

      ${renderVeDialogue('briefing', 'Брифинг', c.briefing)}
      <div class="st-field">
        <label>Материалы дела <span class="st-hint">— JSON</span></label>
        <textarea class="st-mono" name="materials" rows="5" data-json placeholder='[]'>${esc(JSON.stringify(c.materials ?? [], null, 2))}</textarea>
      </div>
      ${renderVeEvidence(c.evidence)}
      ${renderVeHints(c.hints)}
      ${renderVeVersions(c.versions)}
      ${renderVeDialogue('finale', 'Финальная сцена (обязательно)', c.finale)}

      <div class="st-actions">
        <button type="submit" class="st-btn st-btn-primary">Сохранить</button>
        <a class="st-btn" href="#/" style="text-decoration:none;display:inline-flex;align-items:center">Отмена</a>
      </div>
    </form>
    <div id="review-section"></div>
  `;

  if (!isNew) renderReviewPanel(id);
  bindVisualEditors(APP.querySelector('#case-form'));

  APP.querySelector('#case-form').onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    syncVisualEditors(e.target);

    const fd = new FormData(e.target);
    const draft = { id: isNew ? String(fd.get('id') || '').trim() : id };
    SIMPLE_FIELDS.forEach(([key, , type]) => {
      const v = fd.get(key);
      draft[key] = type === 'number' ? Number(v) : v;
    });
    draft.playable = fd.get('playable') === 'on';
    draft.anno = fd.get('anno');
    draft.goal = fd.get('goal');
    draft.suspects = fd.get('suspects');
    draft.task = fd.get('task');
    draft.fnName = fd.get('fnName');
    draft.starter = fd.get('starter');

    const jsonErrors = [];
    JSON_FIELDS.forEach(([key, label]) => {
      const raw = fd.get(key);
      try { draft[key] = raw.trim() ? JSON.parse(raw) : (key === 'hints' ? {} : []); }
      catch (err) { jsonErrors.push(`«${label}»: некорректный JSON — ${err.message}`); }
    });

    if (jsonErrors.length) { showFormErrors(jsonErrors); submitBtn.disabled = false; return; }

    try {
      await upsertStudioCase(draft, baseVersion);
      toast('success', `Дело «${draft.id}» сохранено как черновик — отправьте на проверку ниже`);
      if (isNew) location.hash = '#/edit/' + draft.id;
      else renderEditor(id);
    } catch (err) {
      if (err.conflict) {
        document.getElementById('form-errors').innerHTML = `
          <div class="st-errors">
            <b>Дело изменено кем-то другим, пока вы редактировали.</b>
            <p style="margin:6px 0 10px">Текущая версия — v${err.currentVersion}${err.currentAuthor ? ` (сохранил: ${esc(err.currentAuthor)})` : ''}. Ваши изменения не сохранены, чтобы не затереть чужую правку.</p>
            <div class="st-actions">
              <button class="st-btn" id="conflict-reload">Обновить форму (потерять свои правки)</button>
              <button class="st-btn st-btn-danger" id="conflict-force">Всё равно сохранить поверх</button>
            </div>
          </div>`;
        toast('error', 'Конфликт версий — дело изменено кем-то другим');
        document.getElementById('conflict-reload').onclick = () => renderEditor(id);
        document.getElementById('conflict-force').onclick = async () => {
          try {
            await upsertStudioCase(draft, err.currentVersion);
            toast('success', `Дело «${draft.id}» сохранено поверх чужой правки`);
            renderEditor(id);
          } catch (err2) {
            showFormErrors(err2.errors || [err2.message]);
          }
        };
        submitBtn.disabled = false;
        return;
      }
      showFormErrors(err.errors || [err.message]);
      submitBtn.disabled = false;
    }
  };
}

/* ---------- панель статуса, рецензии и истории версий ---------- */
async function renderReviewPanel(id) {
  const section = document.getElementById('review-section');
  if (!section) return;
  section.innerHTML = '<p class="st-sub">Загрузка истории…</p>';

  const { history, meta } = await fetchCaseHistory(id);
  const status = meta ? meta.status : null;

  const statusBlock = !status ? '' : `
    <div class="st-history">
      <h3>Рецензия <span class="st-badge st-badge-${status}">${STATUS_LABEL[status] || status}</span></h3>
      <p class="st-sub" style="margin:0 0 10px">
        ${meta.author ? `Последнее сохранение: ${esc(meta.author)}` : ''}
        ${status === 'in_review' && meta.submittedBy ? ` · отправлено на проверку: ${esc(meta.submittedBy)}` : ''}
        ${(status === 'approved' || status === 'changes_requested') && meta.reviewer ? ` · рецензент: ${esc(meta.reviewer)}` : ''}
      </p>
      ${meta.reviewComment ? `<p class="st-sub" style="margin:0 0 10px">Комментарий рецензента: «${esc(meta.reviewComment)}»</p>` : ''}
      <div style="display:flex;gap:10px">
        ${status === 'draft' || status === 'changes_requested' ? '<button class="st-btn st-btn-s" id="submit-review">Отправить на проверку</button>' : ''}
        ${status === 'in_review' ? '<button class="st-btn st-btn-s st-btn-primary" id="approve-case">Одобрить</button><button class="st-btn st-btn-s st-btn-danger" id="request-changes">Запросить правки</button>' : ''}
      </div>
      <div id="review-comment-box"></div>
    </div>`;

  const historyBlock = `
    <div class="st-history">
      <h3>История версий (${history.length})</h3>
      ${history.length === 0 ? '<p class="st-sub">Пока не сохранялось.</p>' : history.slice().reverse().map(h => `
        <div class="st-history-row">
          <span class="st-mono">v${h.version}</span>
          <span>${esc(h.author)}</span>
          <span class="st-mono">${new Date(h.savedAt).toLocaleString('ru-RU')}</span>
          <span style="flex:1"></span>
          <button class="st-btn st-btn-s" data-restore="${h.version}">Восстановить</button>
        </div>`).join('')}
    </div>`;

  section.innerHTML = statusBlock + historyBlock;

  const submitBtn = section.querySelector('#submit-review');
  if (submitBtn) submitBtn.onclick = async () => {
    submitBtn.disabled = true;
    try { await submitCaseForReview(id); toast('success', 'Отправлено на проверку'); renderReviewPanel(id); }
    catch (err) { toast('error', err.message); submitBtn.disabled = false; }
  };

  const approveBtn = section.querySelector('#approve-case');
  if (approveBtn) approveBtn.onclick = async () => {
    approveBtn.disabled = true;
    try { await reviewStudioCase(id, 'approved', ''); toast('success', 'Дело одобрено — теперь видно в Player'); renderReviewPanel(id); }
    catch (err) { toast('error', err.message); approveBtn.disabled = false; }
  };

  const requestBtn = section.querySelector('#request-changes');
  if (requestBtn) requestBtn.onclick = () => {
    const box = section.querySelector('#review-comment-box');
    box.innerHTML = `
      <div class="st-review-panel">
        <textarea id="review-comment" rows="3" placeholder="Что нужно доработать?"></textarea>
        <div class="st-actions">
          <button class="st-btn st-btn-s st-btn-danger" id="confirm-request-changes">Отправить замечания</button>
        </div>
      </div>`;
    box.querySelector('#confirm-request-changes').onclick = async () => {
      const comment = box.querySelector('#review-comment').value;
      try { await reviewStudioCase(id, 'changes_requested', comment); toast('success', 'Замечания отправлены'); renderReviewPanel(id); }
      catch (err) { toast('error', err.message); }
    };
  };

  section.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
    const version = Number(b.dataset.restore);
    if (!confirm(`Восстановить версию v${version}? Текущее состояние станет новой версией в истории.`)) return;
    try { await restoreCaseVersion(id, version); toast('success', `Восстановлена версия v${version}`); renderEditor(id); }
    catch (err) { toast('error', err.message); }
  });
}

function showFormErrors(errors) {
  document.getElementById('form-errors').innerHTML = `
    <div class="st-errors">
      <b>Дело не сохранено — гейт качества не пройден:</b>
      <ul>${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
    </div>`;
  toast('error', `Не сохранено: ${errors.length} ошиб${errors.length === 1 ? 'ка' : 'ки/ок'}`);
}

/* ---------- аналитика (v0.5) ---------- */
async function renderAnalytics() {
  APP.innerHTML = `<div class="st-header"><h1>АНАЛИТИКА</h1></div><p class="st-sub">Загрузка…</p>`;

  const [analytics, cases] = await Promise.all([loadAnalytics(), mergedCasesView(CASES)]);
  const titleById = Object.fromEntries(cases.map(c => [c.id, c.title || c.id]));

  APP.innerHTML = `
    <div class="st-header">
      <div>
        <h1>АНАЛИТИКА</h1>
        <div class="st-sub">${analytics.totalEvents} событий в журнале · ${analytics.totalCasesTaken} взятий дел · ${analytics.totalCasesCompleted} закрытий — данные из живых прохождений Player, а не выдумка</div>
      </div>
      <a class="st-link" href="#/">← К списку дел</a>
    </div>
    ${analytics.cases.length === 0
      ? `<p class="st-sub">Пока ни один агент не сыграл ни одного дела — как только Player пришлёт события, они появятся здесь.</p>`
      : `<table class="st-table">
          <thead><tr><th>Дело</th><th>Взято</th><th>Закрыто</th><th>% закрытия</th><th>Попыток проверки</th><th>% успеха проверки</th><th>Подсказок</th></tr></thead>
          <tbody>
            ${analytics.cases.map(c => `<tr>
              <td>${esc(titleById[c.caseId] || c.caseId)}</td>
              <td>${c.taken}</td>
              <td>${c.completed}</td>
              <td>${c.completionRate === null ? '—' : c.completionRate + '%'}</td>
              <td>${c.attempts}</td>
              <td>${c.successRate === null ? '—' : c.successRate + '%'}</td>
              <td>${c.hintsUsed}</td>
            </tr>`).join('')}
          </tbody>
        </table>`}
  `;
}

/* ---------- экспорт правок (для ручного переноса в сид) ---------- */
async function renderExport() {
  APP.innerHTML = `<div class="st-header"><h1>ЭКСПОРТ ПРАВОК</h1></div><p class="st-sub">Загрузка…</p>`;

  const store = await loadStudioOverrides();
  const ids = Object.keys(store.cases);
  const code = ids.length
    ? ids.map(id => `// ${id}\n${JSON.stringify(store.cases[id], null, 2)}`).join('\n\n')
    : '// нет несохранённых в сид правок';

  APP.innerHTML = `
    <div class="st-header">
      <div>
        <h1>ЭКСПОРТ ПРАВОК</h1>
        <div class="st-sub">${ids.length} ${ids.length === 1 ? 'дело изменено/создано' : 'дел изменено/создано'} в Studio (хранится на сервере). Перенесите вручную в packages/game-data/data.js, чтобы зафиксировать как новый сид (Publishing, docs/09).</div>
      </div>
      <a class="st-link" href="#/">← К списку дел</a>
    </div>
    <textarea class="st-export" readonly>${esc(code)}</textarea>
    <div class="st-actions">
      <button class="st-btn st-btn-primary" id="copy-export">Скопировать</button>
    </div>
  `;
  APP.querySelector('#copy-export').onclick = () => {
    navigator.clipboard.writeText(code).then(() => toast('success', 'Скопировано в буфер обмена'));
  };
}

route();
