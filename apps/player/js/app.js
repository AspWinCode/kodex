/* ============ KODEX OS — каркас и маршрутизация ============ */
'use strict';

const APP = document.getElementById('app');

/* ---------- SSO из learning-portal (docs/17-lms-integration.md) ----------
 * Страниц регистрации и входа нет. Сервер (`GET /api/auth/sso`) уже проверил
 * одноразовый JWT LMS и передаёт сюда только external_ref/имя во фрагменте
 * URL — сам токен больше не нужен и не виден Player. external_ref — устойчивый
 * ID ученика в LMS, не зависит от браузера/устройства: с ним прогресс агента
 * хранится на сервере (services/content-api: /api/lms-progress/:externalRef),
 * а не только в localStorage. window.__LMS_READY__ — промис, которого
 * дожидается первый route() (см. конец файла), чтобы не отрисовать хаб на
 * пустом состоянии, пока серверное досье ещё не подгружено. */
window.__LMS_READY__ = (function lmsBootstrap() {
  const h = location.hash;
  if (!h.includes('sso_ref=')) return Promise.resolve();

  const params = new URLSearchParams(h.replace(/^#\/?/, ''));
  const ref = params.get('sso_ref');
  const name = params.get('sso_name');
  history.replaceState(null, '', location.pathname); // не оставлять ref в истории/адресной строке

  if (!ref) return Promise.resolve();

  S.lmsExternalRef = ref;
  if (name && !S.agent.callsign) S.agent.callsign = name.toUpperCase();
  S.loggedIn = true;
  save();

  return fetchLmsProgress(ref).then(remote => {
    if (remote) Object.assign(S, remote, { lmsExternalRef: ref }); // серверное досье — источник истины при входе через LMS
    save();
  }).catch(() => { /* сервер недоступен — продолжаем с тем, что уже есть локально */ });
})();

if (!S.loggedIn) { S.loggedIn = true; save(); }

/* ---------- каркас ---------- */
function renderShell(route) {
  const inCase = route.name === 'case';
  const navItems = [
    ['/hub', 'hub', 'Опер. центр'],
    ['/registry', 'registry', 'Картотека'],
    ['/terminal/dossier', 'terminal', 'Терминал'],
    ['/polygon', 'polygon', 'Полигон'],
  ];
  const activeNav = (path) => {
    if (route.name === 'hub' && path === '/hub') return true;
    if ((route.name === 'registry' || route.name === 'archive') && path === '/registry') return true;
    if (route.name === 'terminal' && path.startsWith('/terminal')) return true;
    if (route.name === 'polygon' && path === '/polygon') return true;
    return false;
  };

  APP.innerHTML = `
  <div class="shell">
    <nav class="nav ${inCase ? 'is-collapsed' : ''}">
      <div class="nav-logo">
        <div class="nav-logo-mark">К</div>
        <div class="nav-logo-text">KODEX OS<small>ОПЕРАТИВНАЯ СЕТЬ</small></div>
      </div>
      <div class="nav-items">
        ${navItems.map(([path, icon, label]) => `
          <button class="nav-item ${activeNav(path) ? 'is-active' : ''}" data-go="${path}" title="${label}">
            ${ICONS[icon]}<span class="nav-label">${label}</span>
            ${icon === 'hub' && unreadCount() ? '<span class="nav-dot" id="nav-unread"></span>' : ''}
          </button>`).join('')}
      </div>
      <div class="nav-foot">
        <button class="nav-item" data-act="comms" title="Канал связи">
          ${ICONS.comms}<span class="nav-label">Канал связи</span>
          ${unreadCount() ? '<span class="nav-dot"></span>' : ''}
        </button>
      </div>
    </nav>
    <div class="shell-main">
      <header class="topbar" id="topbar"></header>
      <div id="stagebar-slot"></div>
      <div id="banner-slot"></div>
      <main class="screen" id="screen"></main>
    </div>
  </div>`;
  renderTopbar(route);
  renderStagebar(route);
  bindCommon(APP);
  mountJarvisFab();
  return document.getElementById('screen');
}

function renderTopbar(route) {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  route = route || currentRoute();
  let crumb = 'KODEX OS';
  if (route.name === 'hub') crumb += ' / <b>ОПЕРАТИВНЫЙ ЦЕНТР</b>';
  else if (route.name === 'registry') crumb += ' / <b>КАРТОТЕКА</b>';
  else if (route.name === 'terminal') crumb += ' / <b>ЛИЧНЫЙ ТЕРМИНАЛ</b>';
  else if (route.name === 'polygon') crumb += ' / <b>ПОЛИГОН</b>';
  else if (route.name === 'archive') crumb += ' / КАРТОТЕКА / <b>АРХИВ</b>';
  else if (route.name === 'case') crumb += ` / КАРТОТЕКА / <b>${esc(caseById(route.caseId).num)}</b>`;

  bar.innerHTML = `
    <span class="topbar-crumb">${crumb}</span>
    <div class="topbar-right">
      <span class="topbar-net"><span class="net-dot" id="net-dot"></span><span id="net-label">СВЯЗЬ</span></span>
      <span class="topbar-credits" title="Кредиты агентства">${ICONS.coin} <span id="tb-credits">${S.agent.credits}</span></span>
      <div class="topbar-agent" data-go="/terminal/dossier" title="Личное дело">
        <div class="avatar">${esc((S.agent.callsign || '??').slice(0, 2))}</div>
        <div class="nav-label"><div style="font-size:12px;font-weight:600">${esc(S.agent.callsign || 'АГЕНТ')}</div>
        <div class="mono-s t3" style="font-size:10px">${esc(agentRank().name)}</div></div>
      </div>
    </div>`;
  bindCommon(bar);
}

function renderStagebar(route) {
  const slot = document.getElementById('stagebar-slot');
  if (!slot) return;
  if (route.name !== 'case') { slot.innerHTML = ''; return; }
  const c = caseById(route.caseId);
  const cs = caseState(route.caseId);
  const stages = [['briefing', 'Брифинг'], ['map', 'Материалы'], ['bench', 'Верстак'], ['check', 'Проверка'], ['report', 'Отчёт']];
  const order = stages.map(s => s[0]);
  const curIdx = order.indexOf(route.stage);
  const reachedIdx = Math.max(curIdx, order.indexOf(cs.stage));

  slot.innerHTML = `<div class="stagebar">
    <span class="stagebar-case">${esc(c.num)}</span>
    ${stages.map(([key, label], i) => {
    const done = i < curIdx || (key === 'check' && (cs.confirmed || []).length === (c.evidence || []).length && c.evidence);
    const current = key === route.stage;
    const reachable = i <= reachedIdx && !(key === 'report' && caseStatus(c) !== 'solved' && (cs.confirmed || []).length !== (c.evidence || []).length);
    return `${i ? '<span class="stage-sep">›</span>' : ''}
      <button class="stage-step ${current ? 'is-current' : ''} ${done ? 'is-done' : ''} ${reachable && !current ? 'is-clickable' : ''}"
        ${reachable && !current ? `data-go="/case/${c.id}/${key}"` : 'disabled'}>
        ${done ? '<span class="stage-tick">✓</span>' : ''}${label}</button>`;
  }).join('')}
    <button class="btn btn-ghost btn-s stagebar-exit" id="case-exit">Покинуть кабинет</button>
  </div>`;
  bindCommon(slot);
  slot.querySelector('#case-exit').onclick = () => {
    confirmDialog('Покинуть кабинет?', 'Дело останется в работе, черновик сохранён. Вернуться можно в любой момент.', 'Покинуть', () => go('/hub'));
  };
}

function refreshNavBadge() {
  document.querySelectorAll('.nav-dot').forEach(d => { if (!unreadCount()) d.remove(); });
}

/* ---------- маршрутизация ---------- */
function currentRoute() {
  const raw = location.hash.replace(/^#/, '') || '/hub';
  const [path, query] = raw.split('?');
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  const p = path.split('/').filter(Boolean);

  if (p[0] === 'onboarding') return { name: 'onboarding' };
  if (p[0] === 'registry') return { name: 'registry' };
  if (p[0] === 'terminal') return { name: 'terminal', tab: p[1] || 'dossier' };
  if (p[0] === 'polygon' && p[1]) return { name: 'drill', drillId: p[1], from: q.from };
  if (p[0] === 'polygon') return { name: 'polygon', from: q.from };
  if (p[0] === 'archive' && p[1]) return { name: 'archive', caseId: p[1] };
  if (p[0] === 'case' && p[1]) return { name: 'case', caseId: p[1], stage: p[2] || 'briefing', q };
  return { name: 'hub' };
}

function route() {
  // SSO-редирект может прийти сменой одного лишь фрагмента — прогоняем bootstrap заново
  if (location.hash.includes('sso_ref=')) { location.reload(); return; }
  closeJarvis();
  document.getElementById('overlay-root').innerHTML = '';
  const r = currentRoute();

  // охрана доступа: до онбординга — только вступление (вход выполняется через SSO)
  if (!S.onboarded && r.name !== 'onboarding') { go('/onboarding'); return; }

  if (r.name === 'onboarding') { unmountJarvisFab(); APP.innerHTML = ''; renderOnboarding(APP); return; }

  // защита маршрутов дела
  if (r.name === 'case') {
    const c = caseById(r.caseId);
    if (!c || !c.playable) { go('/registry'); return; }
    const st = caseStatus(c);
    if (st === 'solved' && r.stage !== 'report') { go('/archive/' + r.caseId); return; }
    if (st === 'available') { go('/registry'); return; }
    if (st === 'locked') { go('/registry'); return; }
  }

  const screen = renderShell(r);
  switch (r.name) {
    case 'hub': renderHub(screen); break;
    case 'registry': renderRegistry(screen); break;
    case 'terminal': renderTerminal(screen, r.tab); break;
    case 'polygon': renderPolygon(screen, r.from); break;
    case 'drill': renderDrill(screen, r.drillId, r.from); break;
    case 'archive': renderArchive(screen, r.caseId); break;
    case 'case': {
      const c = caseById(r.caseId);
      if (r.stage === 'briefing') renderBriefing(screen, c);
      else if (r.stage === 'map') renderCaseMap(screen, c);
      else if (r.stage === 'bench') renderBench(screen, c);
      else if (r.stage === 'check') renderCheck(screen, c, r.q.run === '1');
      else if (r.stage === 'report') renderReport(screen, c);
      break;
    }
  }
}

window.addEventListener('hashchange', route);

/* ---------- потеря связи ---------- */
window.addEventListener('offline', () => {
  if (document.querySelector('.offline-overlay')) return;
  const ov = el(`<div class="offline-overlay">
    <div class="offline-wave">📡</div>
    <div class="display-l">Связь с сетью Кодэкс потеряна</div>
    <div class="t2">Ваши данные сохранены, агент. Терминал ждёт восстановления канала.</div>
    <div class="mono-s t3 cursor-blink" id="off-status">ВОССТАНОВЛЕНИЕ СВЯЗИ…</div>
  </div>`);
  document.body.appendChild(ov);
});
window.addEventListener('online', () => {
  const ov = document.querySelector('.offline-overlay');
  if (ov) { ov.remove(); toast('success', 'Связь восстановлена', 'Сеанс продолжен с сохранённым прогрессом.'); }
});

/* ---------- старт ---------- *
 * Дожидаемся applyStudioOverrides (content-overrides.js) — сетевой запрос
 * к content-api за правками Studio — и __LMS_READY__ (докладная о серверном
 * досье выше) прежде чем маршрутизировать первый экран, иначе игрок иногда
 * увидел бы дело без свежей правки методиста либо хаб на пустом прогрессе
 * до того, как подгрузилось серверное досье из LMS. */
Promise.all([window.__CONTENT_READY__, window.__LMS_READY__]).then(() => {
  if (!location.hash) location.hash = S.onboarded ? '/hub' : '/onboarding';
  route();
});
