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

const JSON_FIELDS = [
  ['briefing', 'Брифинг', '[{ "curator": "viktor", "text": "" }]'],
  ['materials', 'Материалы дела', '[]'],
  ['evidence', 'Улики и тесты (обязательно)', '[{ "id": "e1", "name": "", "tests": [{ "args": [], "expect": null }] }]'],
  ['hints', 'Подсказки по уровням (обязательно)', '{ "1": "", "2": "", "3": "" }'],
  ['versions', 'Версии для отчёта закрытия (обязательно, минимум одна verified: true)', '[{ "text": "", "correct": true }, { "text": "", "correct": false }]'],
  ['finale', 'Финальная сцена (обязательно)', '[{ "curator": "viktor", "text": "" }]'],
];

/* ---------- маршрутизация ---------- */
async function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (raw.startsWith('edit/')) return renderEditor(raw.slice(5));
  if (raw === 'export') return renderExport();
  return renderList();
}
window.addEventListener('hashchange', route);

/* ---------- список дел ---------- */
async function renderList() {
  APP.innerHTML = `<div class="st-header"><h1>CODEX STUDIO</h1></div><p class="st-sub">Загрузка…</p>`;

  const [cases] = await Promise.all([mergedCasesView(CASES)]);
  const seedIds = CASES.map(c => c.id);
  const overriddenIds = new Set(await Promise.all(cases.map(async c => await isStudioOverridden(c.id) ? c.id : null)));

  APP.innerHTML = `
    <div class="st-header">
      <div>
        <h1>CODEX STUDIO</h1>
        <div class="st-sub">Редактор дел · ${cases.length} всего · правки хранятся на сервере (services/content-api), общие для всех</div>
      </div>
      <div style="display:flex;gap:10px">
        <a class="st-link" href="#/export" style="align-self:center">Экспорт правок →</a>
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
            <td>${isNew ? '<span class="st-badge st-badge-new">новое</span>' : overridden ? '<span class="st-badge st-badge-edited">изменено</span>' : '<span class="st-badge st-badge-off">сид</span>'}</td>
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
  APP.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { location.hash = '#/edit/' + b.dataset.edit; });
  APP.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
    if (!confirm(`Сбросить правки для «${b.dataset.reset}» к исходному сиду?`)) return;
    await removeStudioOverride(b.dataset.reset);
    toast('success', 'Правка сброшена к сиду');
    renderList();
  });
}

/* ---------- форма редактирования / создания ---------- */
async function renderEditor(id) {
  const isNew = id === 'new';
  APP.innerHTML = `<div class="st-header"><h1>${isNew ? 'НОВОЕ ДЕЛО' : 'РЕДАКТИРОВАНИЕ'}</h1></div><p class="st-sub">Загрузка…</p>`;

  const seed = isNew ? null : (await mergedCasesView(CASES)).find(c => c.id === id);
  const c = seed ? Object.assign({}, seed) : {
    id: '', num: '', title: '', curator: Object.keys(CURATORS)[0], rank: 1, difficulty: 1,
    rewardCredits: 40, rewardRep: 60, anno: '', goal: '', suspects: '', playable: true,
    task: '', fnName: '', starter: '',
    briefing: [], materials: [], evidence: [], hints: {}, versions: [], finale: [],
  };

  APP.innerHTML = `
    <div class="st-header">
      <div>
        <h1>${isNew ? 'НОВОЕ ДЕЛО' : 'РЕДАКТИРОВАНИЕ · ' + esc(id)}</h1>
        <div class="st-sub">Сохранение идёт на сервер (services/content-api) — Player подхватит правку сразу, с любого браузера</div>
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

      ${JSON_FIELDS.map(([key, label, placeholder]) => `
        <div class="st-field">
          <label>${label} <span class="st-hint">— JSON</span></label>
          <textarea class="st-mono" name="${key}" rows="5" data-json placeholder='${esc(placeholder)}'>${esc(JSON.stringify(c[key] ?? (key === 'hints' ? {} : []), null, 2))}</textarea>
        </div>`).join('')}

      <div class="st-actions">
        <button type="submit" class="st-btn st-btn-primary">Сохранить</button>
        <a class="st-btn" href="#/" style="text-decoration:none;display:inline-flex;align-items:center">Отмена</a>
      </div>
    </form>
  `;

  APP.querySelector('#case-form').onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type=submit]');
    submitBtn.disabled = true;

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
      await upsertStudioCase(draft);
      toast('success', `Дело «${draft.id}» сохранено`);
      location.hash = '#/';
    } catch (err) {
      showFormErrors(err.errors || [err.message]);
      submitBtn.disabled = false;
    }
  };
}

function showFormErrors(errors) {
  document.getElementById('form-errors').innerHTML = `
    <div class="st-errors">
      <b>Дело не сохранено — гейт качества не пройден:</b>
      <ul>${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
    </div>`;
  toast('error', `Не сохранено: ${errors.length} ошиб${errors.length === 1 ? 'ка' : 'ки/ок'}`);
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
