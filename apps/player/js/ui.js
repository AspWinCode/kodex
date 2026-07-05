/* ============ KODEX OS — примитивы интерфейса ============ */
'use strict';

function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ---------- иконки (линейные, 1.5px) ---------- */
const ICONS = {
  hub: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
  registry: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V6z"/><path d="M7 13h6"/></svg>',
  terminal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M8 17c.8-2 2.3-3 4-3s3.2 1 4 3"/></svg>',
  polygon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/></svg>',
  comms: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12a8 8 0 0116 0v4a2 2 0 01-2 2h-2v-6h4M4 12v4a2 2 0 002 2h2v-6H4"/></svg>',
  lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  cross: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  doc: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/></svg>',
  coin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 9.8c0-1 1.1-1.8 2.5-1.8s2.5.8 2.5 1.8-1 1.5-2.5 1.9c-1.5.4-2.5 1-2.5 2s1.1 1.8 2.5 1.8 2.5-.8 2.5-1.8"/></svg>',
  chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3l7 6-2 10H7L5 9z"/><path d="M9 12l3 3 3-3"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  hourglass: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 3h10M7 21h10M8 3c0 7 8 7 8 11s-8 4-8 7M16 3c0 7-8 7-8 11s8 4 8 7"/></svg>',
};

/* ---------- тосты ---------- */
function toast(kind, title, text, action) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = el(`<div class="toast toast-${kind}" role="status">
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${text ? `<div class="toast-text">${esc(text)}</div>` : ''}
      ${action ? `<span class="toast-action">${esc(action.label)}</span>` : ''}
    </div>
    <button class="icon-btn" style="width:24px;height:24px" aria-label="Закрыть">${ICONS.close}</button>
  </div>`);
  const kill = () => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 200); };
  t.querySelector('.icon-btn').onclick = kill;
  if (action) t.querySelector('.toast-action').onclick = () => { kill(); action.fn(); };
  root.appendChild(t);
  if (kind !== 'error') {
    let timer = setTimeout(kill, kind === 'success' ? 4000 : 6000);
    t.onmouseenter = () => clearTimeout(timer);
    t.onmouseleave = () => { timer = setTimeout(kill, 2500); };
  }
  while (root.children.length > 3) root.firstElementChild.remove();
}

/* ---------- модальные окна ---------- */
function openModal(html, opts = {}) {
  const scrim = el(`<div class="scrim"><div class="modal ${opts.wide ? 'modal-wide' : ''}" role="dialog">${html}</div></div>`);
  const close = () => scrim.remove();
  if (!opts.locked) {
    scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
    const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }
  document.getElementById('overlay-root').appendChild(scrim);
  return { scrim, modal: scrim.firstElementChild, close };
}

function confirmDialog(title, text, okLabel, onOk, danger) {
  const m = openModal(`
    <div class="display-m">${esc(title)}</div>
    <p class="t2" style="margin-top:10px;font-size:14px;line-height:22px">${esc(text)}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-x="no">Отмена</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="yes">${esc(okLabel)}</button>
    </div>`);
  m.modal.querySelector('[data-x=no]').onclick = m.close;
  m.modal.querySelector('[data-x=yes]').onclick = () => { m.close(); onOk(); };
}

/* ---------- терминальная печать ---------- */
function typeText(node, text, speed, done) {
  let i = 0;
  node.classList.add('typing');
  node.textContent = '';
  const tick = () => {
    node.textContent = text.slice(0, ++i);
    if (i < text.length) setTimeout(tick, speed + Math.random() * 14);
    else { node.classList.remove('typing'); done && done(); }
  };
  tick();
}

/* ---------- авточекер ---------- *
 * Исполнение решения агента происходит НЕ в браузере (было — new Function()
 * прямо здесь), а на сервере, в изолированном Python-раннере
 * (services/python-runner) — см. Technical Architecture, Runner. Один вызов
 * возвращает результат сразу по всем уликам (evidence), каждая — со своим
 * набором тестов; сервер останавливается на первом провалившемся тесте
 * внутри улики, как раньше делал runTests() локально. */
async function runOnServer(code, fnName, evidence) {
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, fnName, evidence }),
    });
    return await res.json();
  } catch (e) {
    return { compileError: 'Не удалось связаться с сервером проверки: ' + e.message };
  }
}

function fmtVal(v) {
  if (v === undefined) return 'ничего (undefined)';
  return JSON.stringify(v);
}
function fmtCall(fnName, args) {
  return `${fnName}(${args.map(a => JSON.stringify(a)).join(', ')})`;
}

/* ---------- разное ---------- */
function pictureScale(total, done, currentIdx) {
  let segs = '';
  for (let i = 0; i < total; i++) {
    segs += `<div class="picture-seg ${i < done ? 'is-full' : ''} ${i === done && currentIdx !== false ? 'is-current' : ''}"></div>`;
  }
  return `<div class="picture-scale" title="Полнота картины дела">${segs}</div>`;
}
function attemptsDots(left, max) {
  let d = '';
  for (let i = 0; i < max; i++) {
    const used = i >= left;
    d += `<span class="attempt-dot ${used ? 'used' : ''} ${!used && left === 1 ? 'last' : ''}"></span>`;
  }
  return `<span class="attempts" title="Попытки: ${left} из ${max}">${d}</span>`;
}
function diffDots(n) {
  return `<span class="diff-dots" title="Сложность">${[1, 2, 3].map(i => `<span class="diff-dot ${i <= n ? 'on' : ''}"></span>`).join('')}</span>`;
}
function curatorAvatar(cid, lg) {
  const c = CURATORS[cid];
  return `<div class="avatar ${lg ? 'avatar-lg' : ''}" title="${esc(c.name)}">${esc(c.initials)}</div>`;
}
