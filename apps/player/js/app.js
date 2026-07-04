/* ============ KODEX OS — каркас и маршрутизация ============ */
'use strict';

const APP = document.getElementById('app');

/* ---------- SSO ----------
   Страниц регистрации и входа нет: пользователь приходит из внешнего портала
   с токенами во фрагменте URL: #access_token=...&refresh_token=...&user=<base64url>. */
(function ssoBootstrap() {
  const h = location.hash;
  if (h.includes('access_token=')) {
    try {
      const params = new URLSearchParams(h.replace(/^#\/?/, ''));
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');
      const userB64 = params.get('user');
      if (access) {
        S.sso = { access, refresh };
        if (userB64) {
          const json = atob(userB64.replace(/-/g, '+').replace(/_/g, '/'));
          const user = JSON.parse(decodeURIComponent(escape(json)));
          S.sso.user = user;
          if (user.name && !S.agent.callsign) S.agent.callsign = String(user.name).toUpperCase();
        }
        S.loggedIn = true;
        save();
      }
      history.replaceState(null, '', location.pathname);
      location.hash = S.onboarded ? '/hub' : '/onboarding';
    } catch (e) { /* битый fragment — игнорируем */ }
  }
  // Сеанс без токена: в проде здесь был бы редирект на SSO-портал;
  // в прототипе открываем терминал сразу.
  if (!S.loggedIn) { S.loggedIn = true; save(); }
})();

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
  if (location.hash.includes('access_token=')) { location.reload(); return; }
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

/* ---------- старт ---------- */
if (!location.hash) location.hash = S.onboarded ? '/hub' : '/onboarding';
route();
