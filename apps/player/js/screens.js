/* ============ KODEX OS — экраны ============ */
'use strict';

function go(hash) { location.hash = hash; }

/* ================= S0. Онбординг — кинематографичное вступление ================= */
/* Портировано из AspWinCode/codex (OnboardingIntro): терминал → письмо директора →
   имя агента → «досье создано». Авторизация — только через SSO, страницы входа нет. */

const KX_TERMINAL_LINES = [
  'encrypted connection...',
  'decoding...',
  'authentication...',
  'secure channel established.',
];

function kxStartRain(canvas) {
  const ctx = canvas.getContext('2d');
  let raf = null;
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  resize();
  addEventListener('resize', resize);
  const drop = () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    len: 14 + Math.random() * 26, speed: 5 + Math.random() * 9,
    drift: -1.4 + Math.random() * .6, opacity: .06 + Math.random() * .16,
    hue: Math.random() > .7 ? '53,199,255' : '0,255,171',
  });
  const drops = Array.from({ length: 160 }, drop);
  (function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const d of drops) {
      ctx.strokeStyle = `rgba(${d.hue},${d.opacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.drift * 2, d.y + d.len); ctx.stroke();
      d.y += d.speed; d.x += d.drift;
      if (d.y > canvas.height) { d.y = -d.len; d.x = Math.random() * canvas.width; }
    }
    raf = requestAnimationFrame(tick);
  })();
  return () => { removeEventListener('resize', resize); if (raf) cancelAnimationFrame(raf); };
}

function kxStartRainAudio() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 3, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = .3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = .4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(.22, ctx.currentTime + 3);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start();
    return {
      stop() {
        try {
          const t = ctx.currentTime;
          g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0, t + 1.5);
          setTimeout(() => ctx.close().catch(() => {}), 1700);
        } catch (e) {}
      },
      setMuted(m) {
        try {
          const t = ctx.currentTime;
          g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(m ? 0 : .22, t + .4);
        } catch (e) {}
      },
    };
  } catch (e) { return null; }
}

function renderOnboarding(root) {
  let rain = null, cleanupRain = null, muted = false;

  root.innerHTML = `
  <div class="kx-root">
    <div class="kx-scene" id="kx-scene">
      <div class="kx-city"></div>
      <div class="kx-skyline"></div>
      <div class="kx-windows"></div>
      <div class="kx-fog"></div>
    </div>
    <canvas class="kx-rain" id="kx-rain"></canvas>
    <div class="kx-scanline"></div>
    <div class="kx-vignette"></div>
    <button class="kx-sound-btn" id="kx-sound" style="display:none" title="Звук">🔊</button>

    <div class="kx-stage">
      <div class="kx-brand">
        <div class="kx-brand-mark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </div>
        <div class="kx-brand-title">КОДЭКС</div>
        <div class="kx-brand-sub">Агентство цифровых расследований</div>
      </div>

      <div class="kx-center">
        <div class="kx-panel kx-terminal kx-active" id="kx-terminal">
          ${KX_TERMINAL_LINES.map((_, i) => `<div class="kx-term-line"><span class="kx-term-prefix">&gt; </span><span id="kx-tl-${i}"></span>${i === KX_TERMINAL_LINES.length - 1 ? '<span class="kx-cursor" id="kx-cursor" style="display:none"></span>' : ''}</div>`).join('')}
        </div>

        <div class="kx-panel kx-letter" id="kx-letter">
          <div class="kx-letter-seal">В.К.</div>
          <div class="kx-letter-body">
            <p>Агент.</p>
            <p>Если ты читаешь это сообщение —</p>
            <p>значит мы нашли тебя раньше,</p>
            <p>чем это сделал Хаос.</p>
            <p>Нам нужны люди, умеющие замечать детали,</p>
            <p>искать закономерности и мыслить как следователь.</p>
            <p>Если ты готов — добро пожаловать.</p>
          </div>
          <div class="kx-letter-sign">— Виктор Кодэкс, директор агентства</div>
          <div class="kx-btn-row"><button class="btn btn-primary btn-l" id="kx-accept">Принять приглашение</button></div>
        </div>

        <div class="kx-panel kx-form-panel" id="kx-form">
          <div class="kx-form-question">Как тебя зовут, агент?</div>
          <div class="kx-input-line">
            <span>&gt;</span>
            <input type="text" id="kx-name" placeholder="введи имя агента" autocomplete="off" spellcheck="false" maxlength="18" value="${esc(S.agent.callsign || '')}">
          </div>
          <button class="btn btn-primary btn-l" id="kx-create" disabled>Создать досье</button>
        </div>

        <div class="kx-panel kx-welcome-panel" id="kx-welcome">
          <div class="kx-check">✓</div>
          <div class="kx-welcome-line">Досье создано.</div>
          <div class="kx-welcome-line">Добро пожаловать, агент <span class="kx-name" id="kx-name-out"></span>.</div>
          <div class="kx-welcome-line">Первое дело уже лежит на вашем столе.</div>
          <div class="kx-btn-row kx-fast"><button class="btn btn-primary btn-l" id="kx-enter">Открыть дело №001</button></div>
        </div>
      </div>
    </div>
    <div class="kx-fade" id="kx-fade"></div>
  </div>`;

  cleanupRain = kxStartRain(root.querySelector('#kx-rain'));

  // параллакс сцены
  const scene = root.querySelector('#kx-scene');
  const onMove = (e) => {
    const x = (e.clientX / innerWidth - .5) * 18;
    const y = (e.clientY / innerHeight - .5) * 12;
    scene.style.transform = `translate(${x}px,${y}px)`;
  };
  addEventListener('mousemove', onMove);

  const show = (id) => {
    root.querySelectorAll('.kx-panel').forEach(p => p.classList.remove('kx-active'));
    root.querySelector('#' + id).classList.add('kx-active');
  };

  // терминальная печать
  const cursor = root.querySelector('#kx-cursor');
  let li = 0, ci = 0;
  (function typeNext() {
    if (li >= KX_TERMINAL_LINES.length) {
      cursor.style.display = 'none';
      setTimeout(() => show('kx-letter'), 900);
      return;
    }
    if (li === KX_TERMINAL_LINES.length - 1) cursor.style.display = '';
    const line = KX_TERMINAL_LINES[li];
    if (ci <= line.length) {
      root.querySelector('#kx-tl-' + li).textContent = line.slice(0, ci);
      ci++;
      setTimeout(typeNext, 30 + Math.random() * 12);
    } else { li++; ci = 0; setTimeout(typeNext, 260); }
  })();

  // звук дождя — с первого жеста
  const soundBtn = root.querySelector('#kx-sound');
  soundBtn.onclick = () => {
    muted = !muted;
    rain && rain.setMuted(muted);
    soundBtn.textContent = muted ? '🔇' : '🔊';
    soundBtn.classList.toggle('kx-muted', muted);
  };

  root.querySelector('#kx-accept').onclick = () => {
    if (!rain) { rain = kxStartRainAudio(); soundBtn.style.display = ''; }
    show('kx-form');
    setTimeout(() => root.querySelector('#kx-name').focus(), 700);
  };

  const nameInput = root.querySelector('#kx-name');
  const createBtn = root.querySelector('#kx-create');
  nameInput.addEventListener('input', () => { createBtn.disabled = !nameInput.value.trim(); });
  createBtn.disabled = !nameInput.value.trim();
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter' && nameInput.value.trim()) createBtn.click(); });

  createBtn.onclick = () => {
    const name = nameInput.value.trim().toUpperCase();
    if (!name) return;
    createBtn.disabled = true;
    createBtn.textContent = 'Создание досье...';
    S.agent.callsign = name; save();
    setTimeout(() => {
      root.querySelector('#kx-name-out').textContent = name;
      show('kx-welcome');
    }, 1300);
  };

  root.querySelector('#kx-enter').onclick = () => {
    root.querySelector('#kx-fade').classList.add('kx-active');
    rain && rain.stop();
    setTimeout(() => {
      removeEventListener('mousemove', onMove);
      cleanupRain && cleanupRain();
      S.onboarded = true; save();
      go('/hub');
      setTimeout(() => toast('info', 'Входящий вызов', 'Виктор Кодэкс: дело «Перехваченный шифр»', { label: 'Открыть канал', fn: openComms }), 500);
    }, 1100);
  };
}

/* ================= S1. Оперативный центр ================= */
function renderHub(root) {
  const act = activeCases();
  const avail = availableCases().slice(0, 3);
  const rank = agentRank();
  const nxt = nextRank();
  const now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const msgs = S.messages.slice(0, 3);

  let mainBlock;
  if (act.length) {
    const c = act[0];
    const cs = caseState(c.id);
    const done = evidenceProgress(c, cs);
    mainBlock = `
    <div class="card card-folder active-case-card is-active-case case-card">
      <div class="case-card-top">
        <span class="case-card-num">${esc(c.num)}</span>
        <span class="badge badge-accent">В работе</span>
        <span class="badge badge-neutral">${stageName(cs.stage)}</span>
      </div>
      <div class="display-m">${esc(c.title)}</div>
      <div class="t2" style="font-size:13px">${esc(c.anno)}</div>
      ${pictureScale(c.evidence ? c.evidence.length : 3, done, true)}
      <div><button class="btn btn-primary btn-l" data-go="/case/${c.id}/${stageRoute(cs)}">Продолжить расследование</button></div>
    </div>`;
  } else if (!solvedCases().length) {
    mainBlock = `
    <div class="card active-case-card" style="border-color:var(--accent-border)">
      <div class="mono-s" style="color:var(--accent)">ПЕРВЫЙ ВЫЗОВ</div>
      <div class="display-m">Вас ожидает первое дело, агент</div>
      <div class="t2" style="font-size:13px">Директор оставил вызов на вашем терминале. Откройте канал связи или загляните в картотеку.</div>
      <div style="display:flex;gap:10px"><button class="btn btn-primary" data-act="comms">Открыть канал</button>
      <button class="btn btn-secondary" data-go="/registry">В картотеку</button></div>
    </div>`;
  } else {
    mainBlock = `
    <div class="card active-case-card">
      <div class="display-m t2">Ожидание новых дел</div>
      <div class="t2" style="font-size:13px">Активных расследований нет. Загляните в картотеку — или Директорат вскоре выйдет на связь.</div>
      <div><button class="btn btn-secondary" data-go="/registry">Открыть картотеку</button></div>
    </div>`;
  }

  root.innerHTML = `
  <div class="hub-grid">
    <div class="hub-summary">СВОДКА НА ${now} // АГЕНТ <b>${esc(S.agent.callsign)}</b> // ДОПУСК ${'I'.repeat(rank.level)} · ${esc(rank.name.toUpperCase())}</div>
    <div class="hub-main">
      ${mainBlock}
      <div>
        <div class="section-head">
          <span class="section-title">Доступные дела</span>
          <a href="#/registry" style="font-size:12px">Вся картотека →</a>
        </div>
        <div class="hub-cases-row">
          ${avail.length ? avail.map(caseCardHTML).join('') : `<div class="body-s t3">Новых дел на вашем допуске нет — Директорат готовит вызов.</div>`}
        </div>
      </div>
    </div>
    <div class="hub-side">
      <div class="card">
        <div class="section-head"><span class="section-title">Вызовы и сообщения</span>
          ${unreadCount() ? `<span class="badge badge-accent">${unreadCount()}</span>` : ''}</div>
        ${msgs.map(m => msgItemHTML(m)).join('') || '<div class="body-s t3">Эфир тих.</div>'}
        <button class="btn btn-ghost btn-s" data-act="comms" style="margin-top:8px">Весь канал связи</button>
      </div>
      <div class="card status-card">
        <div class="rank-row">
          <div class="chevron-mark">${ICONS.chevron}</div>
          <div>
            <div class="heading-s">${esc(rank.name)}</div>
            <div class="mono-s t3">допуск ${'I'.repeat(rank.level)} · репутация ${S.agent.reputation}</div>
          </div>
        </div>
        ${nxt ? `<div>
          <div class="rep-bar"><div class="rep-fill" style="width:${Math.min(100, Math.round((S.agent.reputation - rank.threshold) / (nxt.threshold - rank.threshold) * 100))}%"></div></div>
          <div class="mono-s t3" style="margin-top:5px">до допуска «${esc(nxt.name)}»: ${nxt.threshold - S.agent.reputation} репутации</div>
        </div>` : `<div class="mono-s" style="color:var(--accent)">Высший допуск агентства</div>`}
        <div class="stat-mini"><span>Баланс</span><span class="mono">${S.agent.credits} кр</span></div>
        <div class="stat-mini"><span>Серия раскрытий</span><span class="mono">${S.agent.streak}</span></div>
        <button class="btn btn-secondary btn-s" data-go="/terminal/dossier">Личный терминал</button>
      </div>
    </div>
  </div>`;
  bindCommon(root);
}

function msgItemHTML(m) {
  const c = CURATORS[m.from];
  return `<div class="msg-item ${m.read ? '' : 'unread'}" data-act="comms">
    ${curatorAvatar(m.from)}
    <div style="min-width:0">
      <div style="display:flex;gap:8px;align-items:baseline"><span class="heading-s" style="font-size:13px">${esc(c.name)}</span>
      <span class="mono-s t3" style="font-size:10px">${esc(m.time)}</span></div>
      <div class="msg-preview">${esc(m.text)}</div>
    </div>
  </div>`;
}

function stageName(st) {
  return { briefing: 'Брифинг', map: 'Материалы', bench: 'Верстак', check: 'Проверка', report: 'Отчёт' }[st] || st;
}
function stageRoute(cs) {
  return cs.stage === 'briefing' && cs.briefed ? 'map' : (cs.stage || 'briefing');
}
function evidenceProgress(c, cs) {
  if (!c.evidence) return 0;
  return (cs.confirmed || []).length;
}

/* ================= S2. Картотека ================= */
let registryFilter = 'all';
function renderRegistry(root) {
  const counts = {
    active: activeCases().length,
    available: availableCases().length,
    locked: CASES.filter(c => caseStatus(c) === 'locked').length,
    solved: solvedCases().length,
  };
  const filters = [['all', 'Все'], ['available', 'Доступные'], ['active', 'В работе'], ['solved', 'Раскрытые']];
  let list = CASES.slice().sort((a, b) => {
    const order = { active: 0, available: 1, locked: 2, solved: 3 };
    return order[caseStatus(a)] - order[caseStatus(b)];
  });
  if (registryFilter !== 'all') list = list.filter(c => caseStatus(c) === registryFilter);

  root.innerHTML = `
  <div class="registry-head">
    <div class="display-l">Картотека дел</div>
    <div class="mono-s t3">В работе: ${counts.active} · Доступно: ${counts.available} · Засекречено: ${counts.locked} · Раскрыто: ${counts.solved}</div>
  </div>
  <div class="filters">
    <div class="seg-control">${filters.map(([k, l]) => `<button class="seg-btn ${registryFilter === k ? 'is-active' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
  </div>
  ${list.length ? `<div class="registry-grid">${list.map(caseCardHTML).join('')}</div>`
    : `<div class="empty-state"><span style="font-size:30px">🗂️</span><div>По этому запросу дел в реестре нет.</div></div>`}
  `;
  root.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { registryFilter = b.dataset.filter; renderRegistry(root); });
  bindCommon(root);
}

function caseCardHTML(c) {
  const st = caseStatus(c);
  const badges = {
    available: '<span class="badge badge-neutral">Доступно</span>',
    active: '<span class="badge badge-accent">В работе</span>',
    solved: '<span class="badge badge-success">Раскрыто</span>',
    locked: `<span class="badge badge-locked">${ICONS.lock} Засекречено</span>`,
  };
  const anno = st === 'locked'
    ? `ГРИФ «СЕКРЕТНО» · ТРЕБУЕТСЯ ДОПУСК ${'I'.repeat(c.rank)}`
    : c.anno;
  return `
  <div class="card card-folder card-click case-card ${st === 'active' ? 'is-active-case' : ''} ${st === 'solved' ? 'is-solved' : ''} ${st === 'locked' ? 'is-locked' : ''}" data-case="${c.id}" tabindex="0">
    <div class="case-card-top">
      <span class="case-card-num">${esc(c.num)}</span>
      ${badges[st]}
    </div>
    <div class="case-card-title">${esc(c.title)}</div>
    <div class="case-card-anno">${esc(anno)}</div>
    <div class="case-card-meta">
      ${diffDots(c.difficulty)}
      <span class="credits">${ICONS.coin} ${c.rewardCredits} кр</span>
      <span>допуск ${'I'.repeat(c.rank)}</span>
    </div>
  </div>`;
}

/* ================= CASE INTRO — кинематографическое вступление ================= */
function renderCaseIntro(root, caseId, agentName, onComplete) {
  const name = (agentName || 'АГЕНТ').toUpperCase();

  // Контентные данные — для каждого дела свои диалоги
  const INTRO_DATA = {
    'case-001': {
      caseNum: 'ДЕЛО №001',
      caseTitle: 'ПЕРЕХВАЧЕННЫЙ ШИФР',
      char1: { name: 'ВИКТОР КОДЭКС', role: 'директор агентства', color: '#00ffab', colorA: 'rgba(0,255,171,.1)', colorB: 'rgba(0,255,171,.4)', colorC: 'rgba(0,255,171,.07)' },
      char2: { name: 'АННА ЛОГ', role: 'старший аналитик данных', color: '#35c7ff', colorA: 'rgba(53,199,255,.1)', colorB: 'rgba(53,199,255,.4)', colorC: 'rgba(53,199,255,.07)' },
      lines1: ['Агент.', 'Наш человек в поле обнаружил записку в тайнике.', 'Курьер успел исчезнуть.', 'Но текст мы перехватили.', 'Он закодирован. Нам нужен дешифратор.'],
      lines2: ['Я изучила перехваченный фрагмент.', 'Алгоритм примитивный, но эффективный.', 'Текст просто записан задом наперёд.', 'Напишем функцию — и шифр раскрыт.', 'Жду твоих инструкций, агент.'],
      ctaText: 'Открыть материалы дела',
      docs: {
        photo: { label: 'ТАЙНИК Б4 · КАМ 02 · 07:17', tag: 'SIGNAL LOST' },
        report: ['Дата: <b>14.06.2026</b>', 'Тайник: <b>сектор Б-4</b>', 'Текст: <b>АКДАЛКАЗ</b>', 'Статус: <span class="ci-red">НЕ РАСШИФРОВАНО</span>'],
        reportTitle: 'ДОНЕСЕНИЕ',
        logTitle: 'SYSTEM LOG · 14.06.2026',
        log: ['07:12 · агент · ПРИБЫЛ', '07:14 · тайник Б4 · НАЙДЕНО', '<span class="ci-red">07:16 · СВЯЗЬ ПОТЕРЯНА</span>', '<span class="ci-red">07:18 · КАМ 02 · ERR</span>', '07:24 · агент · ВЫХОД'],
        mapNote: '▲ Б4, В7, Г2 — маршрут курьера',
        receipt: [['Курьер 0441', '✓'], ['Маршрут Б4', '—'], ['Груз K-01', '✓'], ['<span class="ci-red">Записка</span>', '<span class="ci-red">???</span>'], ['<span class="ci-red">Получатель</span>', '<span class="ci-red">???</span>']],
        receiptTitle: 'МАРШРУТНЫЙ ЛИСТ',
      },
      cctvLines: ['КАМ 02  ·  ТАЙНИК Б4  ·  07:18', '● REC', 'SIGNAL LOST', 'ERROR 0x4F2A — FRAME MISSING', 'LOG FILE CORRUPTED'],
    },
    'case-002': {
      caseNum: 'ДЕЛО №002', caseTitle: 'МОЛЧАЩИЙ СВИДЕТЕЛЬ',
      char1: { name: 'АННА ЛОГ', role: 'старший аналитик данных', color: '#35c7ff', colorA: 'rgba(53,199,255,.1)', colorB: 'rgba(53,199,255,.4)', colorC: 'rgba(53,199,255,.07)' },
      char2: { name: 'РИТА ДЕПЛОЙ', role: 'специалист по безопасности', color: '#00ffab', colorA: 'rgba(0,255,171,.1)', colorB: 'rgba(0,255,171,.4)', colorC: 'rgba(0,255,171,.07)' },
      lines1: ['Агент.', 'Свидетель передал диктофонную запись.', 'Сам говорить отказывается.', 'Аналитикам нужен подсчёт условных сигналов.', 'Только код поможет нам сдвинуться с места.'],
      lines2: ['Сигнал зашифрован в тексте как повторяющийся символ.', 'Нужно посчитать его вхождения.', 'Задача простая — но ошибки недопустимы.', 'Удачи, агент.', ''],
      ctaText: 'Открыть материалы дела',
      docs: { photo: { label: 'ДИКТОФОН · ЗАПИСЬ 07', tag: 'РАСШИФРОВКА' }, report: ['Источник: <b>свидетель</b>', 'Запись: <b>07:31</b>', 'Длина: <b>4:22</b>', 'Статус: <span class="ci-red">НЕ ПРОВЕРЕНО</span>'], reportTitle: 'АУДИОФАЙЛ', logTitle: 'ТРАНСКРИПЦИЯ', log: ['...нет, я не скажу...', '"a" "b" "a" "a" "b"...', '<span class="ci-red">сигнал повтор...</span>', '<span class="ci-red">помехи...</span>', '...конец записи...'], mapNote: '▲ Позиции 3, 7, 11 — сигнал', receipt: [['Символ "a"', '?'], ['Символ "b"', '?'], ['Всего', '?']], receiptTitle: 'ПОДСЧЁТ' },
      cctvLines: ['АУДИО 07 · 07:31', '● REC', 'ШИФР ОБНАРУЖЕН', 'АНАЛИЗ НЕЗАВЕРШЁН', 'ОЖИДАНИЕ...'],
    },
    'case-003': {
      caseNum: 'ДЕЛО №003', caseTitle: 'АРХИВ БЕЗ ОПИСИ',
      char1: { name: 'РИТА ДЕПЛОЙ', role: 'специалист по безопасности', color: '#00ffab', colorA: 'rgba(0,255,171,.1)', colorB: 'rgba(0,255,171,.4)', colorC: 'rgba(0,255,171,.07)' },
      char2: { name: 'АННА ЛОГ', role: 'старший аналитик данных', color: '#35c7ff', colorA: 'rgba(53,199,255,.1)', colorB: 'rgba(53,199,255,.4)', colorC: 'rgba(53,199,255,.07)' },
      lines1: ['Агент.', 'Изъятый архив содержит ведомости.', 'Опись была уничтожена.', 'Нам нужно свести суммы автоматически.', 'Это единственный способ восстановить картину.'],
      lines2: ['Данные разрознены.', 'Но алгоритм прост — сложить все числа из списка.', 'Напишем функцию — и архив раскрыт.', 'Действуй, агент.', ''],
      ctaText: 'Открыть материалы дела',
      docs: { photo: { label: 'АРХИВ A · БЛОК 3 · 08:40', tag: 'ОПИСЬ УНИЧТОЖЕНА' }, report: ['Файлов: <b>14</b>', 'Целые: <b>11</b>', 'Повреждено: <b>3</b>', 'Статус: <span class="ci-red">НЕПОЛНОЕ</span>'], reportTitle: 'ОТЧЁТ ОБ ИЗЪЯТИИ', logTitle: 'АРХИВ · ВЕДОМОСТЬ', log: ['ряд 1 · 1200 ₽', 'ряд 2 · 850 ₽', '<span class="ci-red">ряд 3 · ???</span>', '<span class="ci-red">итог · ???</span>', 'версия 2.1'], mapNote: '▲ Блоки 1, 3, 7 — не сведены', receipt: [['Сумма 1', '1200'], ['Сумма 2', '850'], ['<span class="ci-red">Итого</span>', '<span class="ci-red">???</span>']], receiptTitle: 'ВЕДОМОСТЬ' },
      cctvLines: ['АРХИВ A · БЛОК 3 · 08:40', '● REC', 'ФАЙЛ ПОВРЕЖДЁН', 'ДАННЫЕ НЕПОЛНЫЕ', 'ОЖИДАНИЕ АГЕНТА...'],
    },
  };

  const d = INTRO_DATA[caseId] || INTRO_DATA['case-001'];

  // Audio
  let audioCtx = null, masterGain = null;
  function startAudio() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 3, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource(); src.buffer = buf; src.loop = true;
      const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
      const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      masterGain = audioCtx.createGain(); masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 3);
      src.connect(hp); hp.connect(lp); lp.connect(masterGain); masterGain.connect(audioCtx.destination); src.start();
    } catch(e) {}
  }
  function stopAudio() {
    if (!audioCtx || !masterGain) return;
    try {
      const t = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(t); masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(0, t + 1.5);
      setTimeout(() => { try { audioCtx.close(); } catch(e){} }, 1700);
    } catch(e) {}
  }

  // CCTV canvas raf ref
  let cctvRaf = null;

  // State
  let stage = 'access';
  let accessLines = [];
  let barPct = 0;
  let accessGranted = false;
  let docsVisible = false;
  let cctvLines = [];
  let char1Text = [];
  let char2Text = [];
  let char1Done = false;
  let char2Done = false;

  // Root HTML
  root.innerHTML = `
  <div class="ci-root" id="ci-root">
    <div class="ci-access" id="ci-access">
      <div class="ci-access-inner">
        <div class="ci-access-logo">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
        </div>
        <div class="ci-access-lines" id="ci-al"></div>
        <div id="ci-bar-slot"></div>
        <div id="ci-granted-slot"></div>
      </div>
    </div>
    <div class="ci-desk" id="ci-desk" style="display:none">
      <div class="ci-docs" id="ci-docs">
        <div class="ci-doc ci-doc-photo">
          <div class="ci-photo-inner">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 17l-5-5L7 21"/></svg>
            <span>${d.docs.photo.label}</span>
            <span class="ci-photo-tag">${d.docs.photo.tag}</span>
          </div>
        </div>
        <div class="ci-doc ci-doc-report">
          <div class="ci-doc-head">${d.docs.reportTitle}</div>
          <div class="ci-doc-body">${d.docs.report.map(r => `<p>${r}</p>`).join('')}</div>
        </div>
        <div class="ci-doc ci-doc-map">
          <div class="ci-doc-head">СХЕМА ТАЙНИКА</div>
          <div class="ci-map-grid">${Array.from({length:15},(_,i)=>`<div class="ci-shelf${[3,7,11].includes(i)?' ci-shelf-hot':''}"></div>`).join('')}</div>
          <div class="ci-map-note">${d.docs.mapNote}</div>
        </div>
        <div class="ci-doc ci-doc-receipt">
          <div class="ci-doc-head">${d.docs.receiptTitle}</div>
          <div class="ci-doc-body">${d.docs.receipt.map(r=>`<div class="ci-row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}</div>
        </div>
        <div class="ci-doc ci-doc-log">
          <div class="ci-doc-head">${d.docs.logTitle}</div>
          <div class="ci-doc-body ci-mono-sm">${d.docs.log.map(r=>`<p>${r}</p>`).join('')}</div>
        </div>
      </div>
      <div id="ci-stage-content"></div>
    </div>
    <div class="ci-fade" id="ci-fade" style="display:none"></div>
  </div>`;

  const $ = (sel) => root.querySelector(sel);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function typeLines(lines, onLine) {
    return new Promise(async resolve => {
      const arr = [...lines];
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const line = arr[i];
        let buf = '';
        for (let c = 0; c <= line.length; c++) {
          buf = line.slice(0, c);
          result[i] = buf;
          onLine(result.slice());
          await sleep(28 + Math.random() * 12);
        }
        await sleep(320);
      }
      resolve();
    });
  }

  // ── 1. ACCESS animation ───────────────────────────────────────────────────
  async function runAccess() {
    const alDiv = $('#ci-al');
    const barSlot = $('#ci-bar-slot');
    const grantedSlot = $('#ci-granted-slot');
    const ACCESS_LINES = [
      'KODEX AGENCY // SECURE TERMINAL v4.1',
      'ИДЕНТИФИКАЦИЯ АГЕНТА...',
      `УРОВЕНЬ ДОСТУПА: ▓▓ СТАЖЁР`,
      'ПОДКЛЮЧЕНИЕ К БАЗЕ ДЕЛ...',
    ];
    for (const line of ACCESS_LINES) {
      await sleep(520);
      const div = document.createElement('div');
      div.className = 'ci-access-line';
      div.textContent = line;
      alDiv.appendChild(div);
    }
    await sleep(700);
    // Progress bar
    barSlot.innerHTML = `<div class="ci-bar-row"><div class="ci-bar" id="ci-bar"></div><span class="ci-bar-pct" id="ci-barpct">0%</span></div>`;
    for (let p = 0; p <= 20; p++) {
      const bars = Array.from({length:20},(_,i) => `<span class="${i<p?'ci-bar-on':'ci-bar-off'}">${i<p?'█':'░'}</span>`).join('');
      $('#ci-bar').innerHTML = bars;
      $('#ci-barpct').textContent = Math.round(p * 5) + '%';
      await sleep(60);
    }
    await sleep(500);
    grantedSlot.innerHTML = `<div class="ci-granted">✓&nbsp;&nbsp;ACCESS GRANTED</div>`;
    await sleep(1800);
    // Fade access out, show desk
    $('#ci-access').classList.add('ci-access-exit');
    await sleep(900);
    $('#ci-desk').style.display = '';
    setStageContent('folder');
  }

  // ── Stage content renderer ────────────────────────────────────────────────
  function setStageContent(newStage) {
    stage = newStage;
    const slot = $('#ci-stage-content');
    if (!slot) return;

    if (newStage === 'folder') {
      slot.innerHTML = `
        <div class="ci-folder-wrap" id="ci-fw">
          <div class="ci-folder" id="ci-folder">
            <div class="ci-folder-tab"></div>
            <div class="ci-folder-body">
              <div class="ci-stamp-red">КОНФИДЕН-<br>ЦИАЛЬНО</div>
              <div class="ci-case-num">${d.caseNum}</div>
              <div class="ci-case-title">${d.caseTitle}</div>
              <div class="ci-wax-seal"><span>КОДЭКС</span></div>
              <div class="ci-folder-meta">
                <div class="ci-meta-row"><span>Статус</span><span>Не расследовано</span></div>
                <div class="ci-meta-row ci-meta-hi"><span>Приоритет</span><span>⚡ Высокий</span></div>
                <div class="ci-meta-row"><span>Агент</span><span>${esc(name)}</span></div>
              </div>
              <div class="ci-folder-hint">↑ нажмите, чтобы открыть</div>
            </div>
          </div>
        </div>`;
      $('#ci-folder').onclick = () => {
        // Spread documents
        const docs = $('#ci-docs');
        docs.classList.add('ci-docs-in');
        docsVisible = true;
        setStageContent('spread');
        setTimeout(() => setStageContent('char1'), 2800);
      };
    } else if (newStage === 'spread') {
      slot.innerHTML = '';
    } else if (newStage === 'char1') {
      slot.innerHTML = charCard(d.char1, false, false, false);
      runChar1();
    } else if (newStage === 'cctv') {
      slot.innerHTML = cctvHTML() + charCard(d.char1, true, false, true);
      startCCTV();
      runCCTV();
    } else if (newStage === 'char2') {
      if (cctvRaf) { cancelAnimationFrame(cctvRaf); cctvRaf = null; }
      slot.innerHTML = charCard(d.char2, false, true, false);
      runChar2();
    } else if (newStage === 'cta') {
      slot.innerHTML = charCard(d.char2, false, true, true) + `
        <div class="ci-cta">
          <button class="ci-cta-btn" id="ci-cta-btn">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            ${d.ctaText}
          </button>
        </div>`;
      $('#ci-cta-btn').onclick = () => {
        stopAudio();
        const fadeEl = $('#ci-fade');
        if (fadeEl) { fadeEl.style.display = ''; }
        setTimeout(onComplete, 1300);
      };
    }
  }

  function charCard(char, small, isRight, finalState) {
    const side = isRight ? 'ci-card-right' : 'ci-card-left';
    return `
      <div class="ci-card ${side} ci-card-in" style="${small?'bottom:8px':''}">
        <div class="ci-card-head">
          <div class="ci-avatar">
            <svg viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="17" r="10" fill="${char.colorA}" stroke="${char.colorB}" strokeWidth="1.5"/>
              <path d="M6 47c0-9.9 8.1-18 18-18s18 8.1 18 18" fill="${char.colorC}" stroke="${char.colorB}" strokeWidth="1.5"/>
            </svg>
          </div>
          <div>
            <div class="ci-char-name${isRight?' is-anna':''}">${char.name}</div>
            <div class="ci-char-role${isRight?' is-anna':''}">${char.role}</div>
          </div>
        </div>
        <div class="ci-speech" id="ci-speech${isRight?'2':'1'}">
          ${finalState ? d.lines2.filter(Boolean).map(l=>`<p>${l}</p>`).join('') : ''}
        </div>
      </div>`;
  }

  function cctvHTML() {
    return `
      <div class="ci-cctv">
        <canvas class="ci-cctv-canvas" id="ci-cctv-canvas"></canvas>
        <div class="ci-cctv-scanlines"></div>
        <div class="ci-cctv-overlay" id="ci-cctv-overlay"></div>
      </div>`;
  }

  function startCCTV() {
    setTimeout(() => {
      const canvas = $('#ci-cctv-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width || 340; canvas.height = rect.height || 220;
      let frame = 0;
      function draw() {
        const w = canvas.width, h = canvas.height; frame++;
        const img = ctx.createImageData(w, h); const dd = img.data;
        for (let i = 0; i < dd.length; i+=4) {
          const v = Math.random() > .93 ? Math.random()*180 : Math.random()*20;
          dd[i]=v; dd[i+1]=v; dd[i+2]=v*.78; dd[i+3]=255;
        }
        ctx.putImageData(img, 0, 0);
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        for (let y = 0; y < h; y+=3) ctx.fillRect(0, y, w, 1);
        if (frame % 42 < 3) {
          const gy = Math.random()*h, gh = 3+Math.random()*12, gx = (Math.random()-.5)*32;
          ctx.drawImage(canvas, 0, gy, w, gh, gx, gy, w, gh);
        }
        const grad = ctx.createRadialGradient(w/2,h/2,h*.12,w/2,h/2,h*.78);
        grad.addColorStop(0,'rgba(0,0,0,0)'); grad.addColorStop(1,'rgba(0,0,0,.7)');
        ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
        cctvRaf = requestAnimationFrame(draw);
      }
      cctvRaf = requestAnimationFrame(draw);
    }, 50);
  }

  async function runCCTV() {
    const overlay = () => $('#ci-cctv-overlay');
    for (const line of d.cctvLines) {
      await sleep(750);
      if (!overlay()) break;
      const div = document.createElement('div');
      div.className = 'ci-cctv-line' + (line.includes('ERROR')||line.includes('CORRUPTED')||line.includes('LOST')?' ci-cctv-err':'');
      div.textContent = line;
      overlay().appendChild(div);
    }
    await sleep(1500);
    if (stage === 'cctv') setStageContent('char2');
  }

  async function runChar1() {
    const speech = () => $('#ci-speech1');
    await typeLines(d.lines1, lines => {
      if (!speech()) return;
      speech().innerHTML = lines.map(l => l !== undefined ? `<p>${l}</p>` : '').join('');
    });
    if (!speech()) return;
    const btn = document.createElement('button');
    btn.className = 'ci-speech-btn';
    btn.textContent = 'Продолжить →';
    btn.onclick = () => {
      startAudio();
      setStageContent('cctv');
    };
    speech().appendChild(btn);
  }

  async function runChar2() {
    const speech = () => $('#ci-speech2');
    await typeLines(d.lines2, lines => {
      if (!speech()) return;
      speech().innerHTML = lines.filter(Boolean).map(l => `<p>${l}</p>`).join('');
    });
    if (!speech()) return;
    const btn = document.createElement('button');
    btn.className = 'ci-speech-btn is-anna';
    btn.textContent = 'Понял →';
    btn.onclick = () => setStageContent('cta');
    speech().appendChild(btn);
  }

  // Start the sequence
  runAccess();
}

/* ================= S3. Карточка дела (модал) ================= */
function openCaseModal(id) {
  const c = caseById(id);
  const st = caseStatus(c);
  const cur = CURATORS[c.curator];
  let action = '';
  if (st === 'available') action = `<button class="btn btn-primary btn-l" data-x="take">Взять в работу</button>`;
  else if (st === 'active') action = `<button class="btn btn-primary btn-l" data-x="cont">Продолжить</button>`;
  else if (st === 'solved') action = `<button class="btn btn-secondary" data-x="arch">Открыть личное дело</button>`;
  else action = `<button class="btn btn-secondary" data-x="ranks">К повышению допуска</button>`;

  const body = st === 'locked'
    ? `<div style="padding:18px;border:1px dashed var(--locked-border);border-radius:8px;text-align:center;color:var(--locked)">
        <div style="margin-bottom:6px">${ICONS.lock}</div>
        <div class="label">Материалы засекречены</div>
        <div class="body-s" style="margin-top:8px">Требуется допуск ${'I'.repeat(c.rank)} «${esc(RANKS[c.rank - 1].name)}».<br>
        До допуска: ${Math.max(0, RANKS[c.rank - 1].threshold - S.agent.reputation)} репутации.</div>
      </div>`
    : `<p class="body-l" style="color:var(--text-2)">${esc(c.anno)}</p>`;

  const m = openModal(`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <span class="mono-s t3">${esc(c.num)}</span>
      ${st === 'solved' ? '<span class="badge badge-success">Раскрыто</span>' : st === 'active' ? '<span class="badge badge-accent">В работе</span>' : st === 'locked' ? '<span class="badge badge-locked">Засекречено</span>' : '<span class="badge badge-neutral">Доступно</span>'}
    </div>
    <div class="display-l" style="margin-bottom:10px">${esc(c.title)}</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      ${curatorAvatar(c.curator)}
      <div><div style="font-size:13px;font-weight:600">${esc(cur.name)}</div><div class="body-s t3">${esc(cur.role)} · куратор дела</div></div>
    </div>
    ${body}
    <div class="case-card-meta" style="margin-top:16px">
      ${diffDots(c.difficulty)}
      <span>улик: ${c.evidence ? c.evidence.length : '—'}</span>
      <span class="credits">${ICONS.coin} ${c.rewardCredits} кр</span>
      <span>+${c.rewardRep} репутации</span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-x="close">Вернуться</button>
      ${action}
    </div>`, { wide: true });

  m.modal.addEventListener('click', e => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    m.close();
    if (x.dataset.x === 'take') {
      takeCase(id);
      if (!(S.introSeen || []).includes(id)) {
        // Показываем кинематографический онбординг дела
        document.getElementById('overlay-root').innerHTML = '';
        const APP = document.getElementById('app');
        APP.innerHTML = '';
        renderCaseIntro(APP, id, S.agent.callsign || 'АГЕНТ', () => {
          if (!S.introSeen) S.introSeen = [];
          S.introSeen.push(id);
          save();
          go(`/case/${id}/briefing`);
        });
      } else {
        go(`/case/${id}/briefing`);
      }
    }
    else if (x.dataset.x === 'cont') go(`/case/${id}/${stageRoute(caseState(id))}`);
    else if (x.dataset.x === 'arch') go(`/archive/${id}`);
    else if (x.dataset.x === 'ranks') go('/terminal/ranks');
  });
}

/* ================= S4. Брифинг ================= */
function renderBriefing(root, c) {
  const cs = caseState(c.id);
  cs.stage = 'briefing'; save();
  const cur = CURATORS[c.curator];

  root.innerHTML = `
  <div class="briefing-grid">
    <div>
      <div class="mono-s t3" style="margin-bottom:14px">БРИФИНГ // ${esc(c.num)} // КУРАТОР: ${esc(cur.name.toUpperCase())}</div>
      <div class="briefing-feed" id="brief-feed"></div>
      <div style="margin-top:22px;display:none" id="brief-accept">
        <button class="btn btn-primary btn-l btn-pulse">Принять дело</button>
      </div>
    </div>
    <div class="card goal-card" id="goal-card">
      <div class="section-title">Карточка цели</div>
      <div class="goal-rows" id="goal-rows"></div>
    </div>
  </div>`;

  const feed = root.querySelector('#brief-feed');
  const goalRows = root.querySelector('#goal-rows');
  const goals = [
    { at: 1, html: `<div class="goal-row"><span class="goal-key">ПРОИСШЕСТВИЕ</span><span>${esc(c.anno)}</span></div>` },
    { at: 2, html: `<div class="goal-row"><span class="goal-key">ФИГУРАНТЫ</span><span>${esc(c.suspects || '—')}</span></div>` },
    { at: 3, html: `<div class="goal-row"><span class="goal-key">ЦЕЛЬ</span><span>${esc(c.goal)}</span></div>` },
    {
      at: 4, html: `<div class="goal-row"><span class="goal-key">УЛИКИ</span>
      <span class="goal-evidence-list">${c.evidence.map(e => `<span class="goal-ev"><span class="ev-dot"></span>${esc(e.name)}</span>`).join('')}</span></div>` },
  ];

  let i = 0;
  function nextLine() {
    if (i >= c.briefing.length) {
      root.querySelector('#brief-accept').style.display = '';
      return;
    }
    const line = c.briefing[i];
    const lc = CURATORS[line.curator];
    const node = el(`<div class="curator-line">${curatorAvatar(line.curator)}<div>
      <div class="curator-name"><b>${esc(lc.name)}</b></div>
      <div class="curator-bubble"><span></span></div></div></div>`);
    feed.appendChild(node);
    const span = node.querySelector('span:last-child');
    const already = cs.briefed;
    i++;
    const addGoals = () => goals.filter(g => g.at === i).forEach(g => goalRows.insertAdjacentHTML('beforeend', g.html));
    if (already) { span.textContent = line.text; addGoals(); nextLine(); }
    else typeText(span, line.text, 10, () => { addGoals(); setTimeout(nextLine, 250); });
  }
  nextLine();

  root.querySelector('#brief-accept button').onclick = () => {
    cs.briefed = true; cs.stage = 'map'; save();
    go(`/case/${c.id}/map`);
  };
}

/* ================= S5. Карта дела + документ ================= */
function renderCaseMap(root, c) {
  const cs = caseState(c.id);
  cs.stage = 'map'; save();
  const keyMats = c.materials.filter(m => m.key);
  const keyStudied = keyMats.filter(m => cs.studied.includes(m.id)).length;
  const allKeysOpen = keyStudied === keyMats.length;

  const nodes = c.materials.map(m => {
    const studied = cs.studied.includes(m.id);
    return `<div class="map-node ${studied ? 'studied' : ''}" style="left:${m.x}%;top:${m.y}%" data-doc="${m.id}" tabindex="0">
      <div class="map-node-top">${ICONS.doc}<span class="map-node-type">${esc(m.type)}${m.key ? ' · ключевой' : ''}</span></div>
      <div class="map-node-title">${esc(m.title)}</div>
      <div class="map-node-status"><span class="ev-dot ${studied ? 'studied' : ''}"></span>${studied ? 'изучено' : 'не изучено'}</div>
    </div>`;
  }).join('');

  // связи: последовательная цепочка + вещдок к центру
  const pts = c.materials.map(m => [m.x, m.y]);
  let lines = '';
  for (let i = 0; i < pts.length - 1; i++) {
    lines += `<line x1="${pts[i][0]}%" y1="${pts[i][1]}%" x2="${pts[i + 1][0]}%" y2="${pts[i + 1][1]}%" stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="4 4"/>`;
  }

  root.innerHTML = `
  <div class="casemap-wrap">
    <div class="mono-s t3" style="margin-bottom:12px">ДОСКА РАССЛЕДОВАНИЯ // ${esc(c.num)} «${esc(c.title.toUpperCase())}»</div>
    <div class="casemap">
      <svg class="links">${lines}</svg>
      ${nodes}
      <div class="casemap-hud">
        ${pictureScale(keyMats.length, keyStudied, !allKeysOpen)}
        <span class="casemap-hint">ключевые материалы: ${keyStudied}/${keyMats.length}</span>
      </div>
      <div class="casemap-cta">
        ${allKeysOpen ? '' : '<span class="casemap-hint">ключевые документы ещё не изучены</span>'}
        <button class="btn btn-primary ${allKeysOpen ? 'btn-pulse' : ''}" id="to-bench">На верстак</button>
      </div>
    </div>
  </div>`;

  root.querySelectorAll('[data-doc]').forEach(n => {
    n.onclick = () => openDocOverlay(c, n.dataset.doc, () => renderCaseMap(root, c));
    n.onkeydown = e => { if (e.key === 'Enter') n.onclick(); };
  });
  root.querySelector('#to-bench').onclick = () => go(`/case/${c.id}/bench`);
}

function openDocOverlay(c, matId, onClose) {
  const m = c.materials.find(x => x.id === matId);
  const cs = caseState(c.id);
  const body = m.body.map(b => typeof b === 'string'
    ? `<p>${esc(b)}</p>`
    : `<div class="code-sample">${esc(b.code)}</div>`).join('');

  const ov = el(`<div class="doc-overlay">
    <div class="doc-paper">
      <div class="doc-meta">
        <span>ТИП: ${esc(m.type.toUpperCase())}</span>
        <span>ИСТОЧНИК: ${esc(m.meta.source)}</span>
        <span>ПОДГОТОВИЛ: ${esc(m.meta.author)}</span>
        <span>${esc(c.num)}</span>
      </div>
      <div class="display-m" style="margin-bottom:14px">${esc(m.title)}</div>
      <div class="doc-body">${body}</div>
      <div class="doc-actions">
        <button class="btn btn-ghost" data-x="back">${ICONS.back} К доске</button>
        <button class="btn ${cs.studied.includes(m.id) ? 'btn-secondary' : 'btn-primary'}" data-x="done">
          ${cs.studied.includes(m.id) ? 'Изучено ✓' : 'Отметить изученным'}</button>
      </div>
    </div>
  </div>`);
  const close = () => { ov.remove(); onClose && onClose(); };
  ov.addEventListener('click', e => {
    if (e.target === ov) return close();
    const x = e.target.closest('[data-x]');
    if (!x) return;
    if (x.dataset.x === 'done' && !cs.studied.includes(m.id)) {
      cs.studied.push(m.id); save();
      toast('info', 'Материал изучен', `«${m.title}» добавлен в вашу картину дела.`);
    }
    close();
  });
  document.getElementById('overlay-root').appendChild(ov);
}

/* ================= S6. Верстак ================= */
function renderBench(root, c) {
  const cs = caseState(c.id);
  cs.stage = 'bench'; save();
  if (cs.code == null) cs.code = c.starter;

  root.innerHTML = `
  <div class="bench">
    <div class="bench-top">
      <div class="bench-task" id="task-box" title="Развернуть условие">
        <span class="mono-s" style="color:var(--accent)">ЗАДАЧА //</span> <span id="task-short">${esc(c.goal)}</span>
        <div class="full" id="task-full" style="display:none">${esc(c.task)}</div>
      </div>
      <button class="btn btn-secondary btn-s" id="side-toggle">Материалы дела</button>
    </div>
    <div class="bench-split">
      <div class="bench-editor-col" style="position:relative">
        <div class="bench-tab">${ICONS.doc} обработчик_улик.js <span class="bench-save mono" id="save-ind"></span></div>
        <textarea class="code-editor" id="code" spellcheck="false">${esc(cs.code)}</textarea>
        <div class="bench-console">
          <div class="console-head"><span class="net-dot" style="background:var(--info)"></span> Черновой прогон</div>
          <div class="console-out" id="console-out"><span class="dim">Прогон не выполнялся. Черновые прогоны не тратят попытки.</span></div>
        </div>
        <div id="cooldown-slot"></div>
      </div>
      <div class="bench-side" id="bench-side">
        <div class="bench-side-head"><span class="section-title">Материалы</span>
          <button class="icon-btn" id="side-close" style="display:none">${ICONS.close}</button></div>
        <div class="bench-side-body">
          ${c.materials.map(m => `<div class="side-mat" data-doc="${m.id}">${ICONS.doc}
            <span style="flex:1">${esc(m.title)}</span>
            <span class="ev-dot ${cs.studied.includes(m.id) ? 'studied' : ''}"></span></div>`).join('')}
          <div class="body-s t3" style="margin-top:8px">Застряли? Джарвисмен даст наводку, а Полигон — тренировку без ставок.</div>
          <button class="btn btn-ghost btn-s" data-go="/polygon?from=${c.id}">На полигон</button>
        </div>
      </div>
    </div>
    <div class="bench-footer">
      <button class="btn btn-secondary" id="dry-run">Черновой прогон</button>
      <button class="btn btn-primary" id="submit">Отправить на проверку</button>
      <button class="btn btn-danger btn-s" id="reset-code">Сбросить решение</button>
      <div class="bench-meta">
        <span>попытки: ${attemptsDots(cs.attempts, MAX_ATTEMPTS)}</span>
        <span>наводки: ${S.agent.hintTokens} беспл.</span>
      </div>
    </div>
  </div>`;

  const saveInd = root.querySelector('#save-ind');
  let saveTimer;
  const cm = mountCodeEditor(root.querySelector('#code'), {
    onChange: (code) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        cs.code = code; save();
        saveInd.textContent = 'черновик сохранён ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      }, 600);
    },
  });

  root.querySelector('#task-box').onclick = () => {
    const f = root.querySelector('#task-full');
    f.style.display = f.style.display === 'none' ? '' : 'none';
    root.querySelector('#task-box').classList.toggle('open');
  };

  const side = root.querySelector('#bench-side');
  root.querySelector('#side-toggle').onclick = () => {
    side.classList.toggle('is-open');
    root.querySelector('#side-close').style.display = side.classList.contains('is-open') ? '' : 'none';
  };
  root.querySelector('#side-close').onclick = () => side.classList.remove('is-open');
  root.querySelectorAll('[data-doc]').forEach(n => n.onclick = () => openDocOverlay(c, n.dataset.doc, () => renderBench(root, c)));

  root.querySelector('#reset-code').onclick = () => {
    confirmDialog('Сбросить решение?', 'Верстак вернётся к стартовому шаблону. Материалы и статус дела сохранятся.', 'Сбросить', () => {
      cs.code = c.starter; save(); renderBench(root, c);
      toast('warning', 'Верстак очищен', 'Стартовый шаблон восстановлен.');
    }, true);
  };

  const out = root.querySelector('#console-out');
  root.querySelector('#dry-run').onclick = async () => {
    cs.code = cm.getValue(); save();
    out.innerHTML = `<span class="dim">Отправка на сервер…</span>`;
    // Черновой прогон проверяет только первый тест каждой улики — быстрый
    // предпросмотр, не тратящий попытку (сама попытка списывается только
    // на «Отправить на проверку», см. #submit ниже).
    const preview = c.evidence.map(ev => ({ id: ev.id, tests: [ev.tests[0]] }));
    const response = await runOnServer(cs.code, c.fnName, preview);
    if (response.compileError) {
      out.innerHTML = `<span class="err">✗ Улика повреждена: обработчик не запустился.</span>\n<span class="dim">${esc(response.compileError)}</span>`;
      return;
    }
    const byId = Object.fromEntries((response.results || []).map(r => [r.evidenceId, r]));
    const lines = c.evidence.map(ev => {
      const t = ev.tests[0];
      const r = byId[ev.id];
      const ok = r && r.pass;
      const got = r ? (r.crashed ? r.error : (r.pass ? t.expect : r.got)) : 'нет ответа';
      return `${ok ? '<span class="ok">✓</span>' : '<span class="err">✗</span>'} ${esc(fmtCall(c.fnName, t.args))} → ${esc(fmtVal(got))} <span class="dim">(ожидалось: ${esc(fmtVal(t.expect))})</span>`;
    });
    out.innerHTML = lines.join('\n');
  };

  root.querySelector('#submit').onclick = () => {
    cs.code = cm.getValue(); save();
    go(`/case/${c.id}/check?run=1`);
  };

  // кулдаун
  updateCooldown();
  function updateCooldown() {
    const slot = root.querySelector('#cooldown-slot');
    if (!slot) return;
    const left = Math.ceil((cs.cooldownUntil - Date.now()) / 1000);
    if (cs.attempts <= 0 && left > 0) {
      slot.innerHTML = `<div class="cooldown-overlay">
        <div class="label" style="color:var(--warning)">${ICONS.hourglass} Дело временно на паузе</div>
        <div class="cooldown-timer" id="cd-timer">${fmtSec(left)}</div>
        <div class="body-s t2" style="max-width:300px;text-align:center">Верстак перегрет. Дождитесь остывания, отработайте навык на полигоне или запросите снаряжение.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-secondary btn-s" data-go="/polygon?from=${c.id}">На полигон</button>
          <button class="btn btn-secondary btn-s" data-go="/terminal/supply">Снабжение</button>
        </div>
      </div>`;
      bindCommon(slot);
      const iv = setInterval(() => {
        const l = Math.ceil((cs.cooldownUntil - Date.now()) / 1000);
        const t = slot.querySelector('#cd-timer');
        if (!t) return clearInterval(iv);
        if (l <= 0) {
          clearInterval(iv);
          cs.attempts = 2; save();
          slot.innerHTML = '';
          toast('success', 'Верстак остыл', 'Выдано 2 резервные попытки. За дело, агент.');
          renderBench(root, c);
        } else t.textContent = fmtSec(l);
      }, 500);
    } else if (cs.attempts <= 0) {
      cs.attempts = 2; save();
    } else slot.innerHTML = '';
  }
  bindCommon(root);
}
function fmtSec(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

/* ================= S7. Проверка улик ================= */
function renderCheck(root, c, autorun) {
  const cs = caseState(c.id);
  cs.stage = 'check'; save();

  root.innerHTML = `
  <div class="check-screen">
    <div>
      <div class="display-l">Проверка улик</div>
      <div class="mono-s t3" style="margin-top:4px">${esc(c.num)} // авточекер сети Кодэкс // попытки: <span id="chk-att"></span></div>
    </div>
    <div class="check-list" id="check-list">
      ${c.evidence.map(ev => `<div class="check-row pending" data-ev="${ev.id}">
        <span class="ev-dot"></span>
        <span class="check-row-name">${esc(ev.name)}</span>
        <span class="check-row-status">ожидание</span>
      </div>`).join('')}
    </div>
    <div id="check-detail"></div>
    <div id="check-actions" style="display:flex;gap:10px;flex-wrap:wrap"></div>
  </div>`;
  root.querySelector('#chk-att').innerHTML = attemptsDots(cs.attempts, MAX_ATTEMPTS);

  const actions = root.querySelector('#check-actions');
  if (!autorun) {
    actions.innerHTML = `<button class="btn btn-primary" id="run-check">Запустить проверку</button>
      <button class="btn btn-secondary" data-go="/case/${c.id}/bench">На верстак</button>`;
    root.querySelector('#run-check').onclick = () => runCheck();
    bindCommon(root);
  } else runCheck();

  async function runCheck() {
    if (cs.attempts <= 0) { toast('warning', 'Попытки исчерпаны', 'Верстак на паузе — загляните туда.'); return; }
    actions.innerHTML = '';
    root.querySelector('#check-detail').innerHTML = '';
    cs.attempts -= 1; cs.tries += 1; save();
    root.querySelector('#chk-att').innerHTML = attemptsDots(cs.attempts, MAX_ATTEMPTS);

    const rows = [...root.querySelectorAll('.check-row')];
    rows.forEach(r => { r.className = 'check-row running'; r.querySelector('.check-row-status').innerHTML = `<span class="spinner"></span> отправка на сервер…`; });

    // Исполнение решения — на сервере, в изолированном Python-раннере
    // (services/python-runner), а не в браузере: см. Technical Architecture,
    // Runner — самый критичный по безопасности компонент платформы.
    const response = await runOnServer(cs.code || '', c.fnName, c.evidence);

    if (response.compileError) {
      // решение не запустилось — попытку возвращаем
      cs.attempts += 1; cs.tries -= 1; save();
      root.querySelector('#chk-att').innerHTML = attemptsDots(cs.attempts, MAX_ATTEMPTS);
      rows.forEach(r => { r.className = 'check-row fail'; r.querySelector('.check-row-status').innerHTML = `${ICONS.cross} не запускалась`; });
      root.querySelector('#check-detail').innerHTML = `<div class="check-detail">
        <div style="color:var(--error)">✗ Обработчик не запустился — попытка не списана.</div>
        <div class="exp" style="margin-top:6px">${esc(response.compileError)}</div>
      </div>`;
      actions.innerHTML = `<button class="btn btn-primary" data-go="/case/${c.id}/bench">Вернуться на верстак</button>`;
      bindCommon(actions);
      return;
    }

    const resultByEvId = Object.fromEntries((response.results || []).map(r => [r.evidenceId, r]));
    const results = c.evidence.map(ev => resultByEvId[ev.id] || { pass: false, crashed: true, error: 'Раннер не вернул результат по этой улике' });

    let i = 0;
    function step() {
      if (i > 0) {
        const prev = rows[i - 1], res = results[i - 1];
        prev.className = 'check-row ' + (res.pass ? 'pass' : 'fail');
        prev.querySelector('.ev-dot').className = 'ev-dot ' + (res.pass ? 'confirmed' : '');
        prev.querySelector('.check-row-status').innerHTML = res.pass ? `${ICONS.check} подтверждена` : `${ICONS.cross} не сходится`;
      }
      if (i >= rows.length) return finish();
      const row = rows[i];
      row.className = 'check-row running';
      row.querySelector('.check-row-status').innerHTML = `<span class="spinner"></span> сверка…`;
      i++;
      setTimeout(step, 550);
    }
    setTimeout(step, 400);

    function finish() {
      const failed = results.map((r, idx) => ({ r, ev: c.evidence[idx] })).filter(x => !x.r.pass);
      cs.confirmed = c.evidence.filter((_, idx) => results[idx].pass).map(e => e.id);
      save();

      if (!failed.length) {
        logGameEvent('task.check_passed', { caseId: c.id, attemptsLeft: cs.attempts, tries: cs.tries });
        toast('success', 'Все улики подтверждены', 'Дело готово к закрытию, агент.');
        if (c.visual === 'turtle') {
          root.querySelector('#check-detail').innerHTML = `<div class="check-detail"><div class="mono-s t3" style="margin-bottom:8px">Рисунок по данным решения:</div>${renderTurtlePath(response.lastResult)}</div>`;
        } else if (c.visual === 'chart') {
          root.querySelector('#check-detail').innerHTML = `<div class="check-detail">${renderChartSpec(response.lastResult)}</div>`;
        }
        actions.innerHTML = `<button class="btn btn-primary btn-l btn-pulse" data-go="/case/${c.id}/report">Перейти к отчёту</button>`;
        bindCommon(actions);
        cs.failStreak = 0; save();
        return;
      }

      cs.failStreak = (cs.failStreak || 0) + 1;
      const f = failed[0];
      logGameEvent('task.check_failed', { caseId: c.id, evidenceId: f.ev.id, crashed: !!f.r.crashed });
      const detail = f.r.crashed
        ? `<div style="color:var(--error)">✗ ${esc(f.ev.name)}: обработчик остановился с ошибкой.</div>
           <div class="exp" style="margin-top:6px">${esc(f.r.error)}</div>`
        : `<div style="color:var(--error)">✗ ${esc(f.ev.name)}: улика не сходится.</div>
           <div class="exp" style="margin-top:6px">${esc(fmtCall(c.fnName, f.r.test.args))} → получено ${esc(fmtVal(f.r.got))}, ожидалось ${esc(fmtVal(f.r.test.expect))}</div>`;
      root.querySelector('#check-detail').innerHTML = `<div class="check-detail">${detail}</div>`;

      if (cs.attempts <= 0) {
        cs.cooldownUntil = Date.now() + COOLDOWN_SEC * 1000; save();
        toast('warning', 'Попытки исчерпаны', 'Дело на паузе. Верстак остынет через минуту.');
      }
      actions.innerHTML = `<button class="btn btn-primary" data-go="/case/${c.id}/bench">Вернуться на верстак</button>
        <button class="btn btn-ghost" id="ask-jarvis">Запросить наводку</button>`;
      bindCommon(actions);
      actions.querySelector('#ask-jarvis').onclick = () => openJarvis();
      if (cs.failStreak >= 2) {
        setTimeout(() => {
          openJarvis();
          jarvisSay(`Вижу, улика «${f.ev.name}» упрямится, агент. Возьмите наводку — для вас уровень I сейчас без списания.`);
          window._jarvisFreeL1 = c.id;
        }, 900);
      }
      save();
    }
  }
}

/* ================= S8. Отчёт ================= */
function renderReport(root, c) {
  const cs = caseState(c.id);
  const confirmed = (cs.confirmed || []).length === c.evidence.length;
  if (!confirmed && cs.status !== 'solved') { go(`/case/${c.id}/check`); return; }
  cs.stage = 'report'; save();

  const ov = el(`<div class="report-overlay"><div class="report-inner" id="rep-inner"></div></div>`);
  root.innerHTML = ''; root.appendChild(ov);
  const inner = ov.querySelector('#rep-inner');

  function stepVersion() {
    if (cs.versionOk) return stepFinale();
    const shuffled = c.versions.map((v, i) => ({ ...v, i }));
    inner.innerHTML = `
      <div class="mono-s t3">ЗАКРЫТИЕ ДЕЛА // ${esc(c.num)}</div>
      <div class="display-l">Подтвердите итоговую версию</div>
      <p class="t2" style="font-size:14px">Улики подтверждены. Перед закрытием дела сформулируйте вывод — какая версия сходится с фактами?</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${shuffled.map(v => `<button class="version-option" data-v="${v.i}"><span class="mono-s t3">§</span><span>${esc(v.text)}</span></button>`).join('')}
      </div>`;
    inner.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      const v = c.versions[+b.dataset.v];
      if (v.correct) { cs.versionOk = true; save(); stepFinale(); }
      else {
        b.classList.add('wrong');
        toast('info', CURATORS[c.curator].name, 'Не спешите, агент. Сверьте версию с подтверждёнными уликами ещё раз.');
      }
    });
  }

  function stepFinale() {
    inner.innerHTML = `
      <div class="mono-s t3">ЗАКРЫТИЕ ДЕЛА // ${esc(c.num)}</div>
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <div class="display-l">${esc(c.title)}</div>
        <span class="stamp stamp-in" id="stamp">Раскрыто</span>
      </div>
      <div class="report-final" id="finale-feed"></div>
      <div id="finale-next" style="display:none"><button class="btn btn-primary btn-l">К наградам</button></div>`;
    const feed = inner.querySelector('#finale-feed');
    let i = 0;
    (function next() {
      if (i >= c.finale.length) { inner.querySelector('#finale-next').style.display = ''; return; }
      const line = c.finale[i]; i++;
      const node = el(`<div class="curator-line">${curatorAvatar(line.curator)}<div>
        <div class="curator-name"><b>${esc(CURATORS[line.curator].name)}</b></div>
        <div class="curator-bubble"><span></span></div></div></div>`);
      feed.appendChild(node);
      if (cs.status === 'solved') { node.querySelector('span:last-child').textContent = line.text; next(); }
      else typeText(node.querySelector('span:last-child'), line.text, 10, () => setTimeout(next, 200));
    })();
    inner.querySelector('#finale-next button').onclick = stepRewards;
  }

  function stepRewards() {
    const already = cs.status === 'solved';
    let promoted = false, rankAfter = agentRank();
    if (!already) { const r = solveCase(c.id); promoted = r.promoted; rankAfter = r.rank; }

    inner.innerHTML = `
      <div class="mono-s t3">ПРИКАЗ ПО АГЕНТСТВУ // ${esc(c.num)}</div>
      <div class="display-l">${already ? 'Итог дела' : 'Награды агента'}</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="card reward-card" style="animation-delay:.1s"><span style="font-size:24px">🪙</span>
          <div><div class="heading-s">Кредиты</div><div class="body-s t3">за раскрытие дела</div></div>
          <span class="reward-num">+${c.rewardCredits}</span></div>
        <div class="card reward-card" style="animation-delay:.3s"><span style="font-size:24px">📈</span>
          <div><div class="heading-s">Репутация</div><div class="body-s t3">зачтено в личное дело</div></div>
          <span class="reward-num">+${c.rewardRep}</span></div>
        <div class="card reward-card" style="animation-delay:.5s"><span style="font-size:24px">⏱️</span>
          <div><div class="heading-s">Точность</div><div class="body-s t3">отправок на проверку</div></div>
          <span class="reward-num">${cs.tries}</span></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary btn-l" data-go="/hub">В оперативный центр</button>
        <button class="btn btn-secondary" data-go="/registry">Следующее дело</button>
        <button class="btn btn-ghost" data-go="/archive/${c.id}">Пересмотреть дело</button>
      </div>`;
    bindCommon(inner);

    if (promoted) {
      setTimeout(() => {
        const m = openModal(`<div class="event-modal">
          <div class="event-icon">🎖️</div>
          <div class="display-l" style="color:var(--accent)">Повышение допуска</div>
          <p class="t2">Директорат присваивает вам звание<br><b style="color:var(--text-1)">«${esc(rankAfter.name)}»</b> — допуск ${'I'.repeat(rankAfter.level)}.</p>
          <p class="body-s t3">${esc(rankAfter.note)}. Засекреченные дела вашего уровня рассекречены.</p>
          <button class="btn btn-primary btn-l" data-x="ok">Принято</button>
        </div>`, { locked: true });
        m.modal.querySelector('[data-x=ok]').onclick = m.close;
      }, 900);
    }
  }

  stepVersion();
}

/* ================= S9–S12. Личный терминал ================= */
function renderTerminal(root, tab) {
  tab = tab || 'dossier';
  const tabs = [['dossier', 'Личное дело'], ['ranks', 'Ранги и награды'], ['supply', 'Снабжение'], ['stats', 'Статистика']];
  const rank = agentRank();
  const nxt = nextRank();

  let body = '';
  if (tab === 'dossier') {
    body = `
    <div class="card id-card card-folder">
      <div class="avatar avatar-lg">${esc(S.agent.callsign.slice(0, 2))}</div>
      <div class="id-fields">
        <div class="id-field"><div class="k">Позывной</div><div class="v mono">${esc(S.agent.callsign)} ${S.inventory['brass-case'] ? '🏅' : ''}</div></div>
        <div class="id-field"><div class="k">Звание</div><div class="v">${esc(rank.name)}</div></div>
        <div class="id-field"><div class="k">Уровень допуска</div><div class="v mono">${'I'.repeat(rank.level)}</div></div>
        <div class="id-field"><div class="k">Репутация</div><div class="v mono">${S.agent.reputation}</div></div>
        <div class="id-field"><div class="k">В агентстве с</div><div class="v mono">${esc(S.agent.joined)}</div></div>
        <div class="id-field"><div class="k">Раскрыто дел</div><div class="v mono">${solvedCases().length}</div></div>
      </div>
    </div>
    <div class="section-title" style="margin:26px 0 12px">Значки отличия</div>
    <div class="badges-grid" style="max-width:720px">
      ${BADGES.map(b => {
      const got = S.agent.badges.includes(b.id);
      return `<div class="card badge-tile ${got ? '' : 'locked'}" title="${esc(b.cond)}">
          <span class="icon">${got ? b.icon : '❔'}</span><span class="name">${esc(b.name)}</span>
          <span class="body-s t3">${got ? 'получен' : esc(b.cond)}</span></div>`;
    }).join('')}
    </div>
    <div style="margin-top:26px"><button class="btn btn-ghost btn-s" id="reset-dossier">Сбросить локальное досье</button></div>`;
  } else if (tab === 'ranks') {
    body = `
    <div class="rank-ladder">
      ${RANKS.map(r => {
      const done = S.agent.reputation >= r.threshold && r.level < rank.level + 1 && r.level <= rank.level;
      const current = r.level === rank.level;
      const casesAtRank = CASES.filter(c => c.rank === r.level);
      return `<div class="rank-step ${done && !current ? 'done' : ''} ${current ? 'current' : ''}">
          <div class="chevron-mark" style="${current ? '' : 'opacity:.5'}">${ICONS.chevron}</div>
          <div style="flex:1">
            <div style="display:flex;gap:10px;align-items:baseline">
              <span class="heading-s">${esc(r.name)}</span>
              <span class="mono-s t3">от ${r.threshold} репутации</span>
              ${current ? '<span class="badge badge-accent">вы здесь</span>' : ''}
            </div>
            <div class="body-s t2" style="margin-top:2px">${esc(r.note)}</div>
            ${casesAtRank.length ? `<div class="body-s t3" style="margin-top:4px">Дела: ${casesAtRank.map(c => `${esc(c.num)} «${esc(c.title)}»`).join(' · ')}</div>` : ''}
            ${current && nxt ? `<div style="margin-top:8px;max-width:280px"><div class="rep-bar"><div class="rep-fill" style="width:${Math.min(100, Math.round((S.agent.reputation - r.threshold) / (nxt.threshold - r.threshold) * 100))}%"></div></div>
              <div class="mono-s t3" style="margin-top:4px">${S.agent.reputation} / ${nxt.threshold}</div></div>` : ''}
          </div>
        </div>`;
    }).join('')}
    </div>`;
  } else if (tab === 'supply') {
    body = `
    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:18px">
      <span class="display-m" style="color:var(--accent)">${S.agent.credits} кр</span>
      <span class="body-s t3">Директорат платит за раскрытые дела</span>
    </div>
    <div class="shop-grid">
      ${SHOP.map(item => {
      const owned = S.inventory[item.id];
      const afford = S.agent.credits >= item.price;
      const permOwned = item.type === 'permanent' && owned;
      return `<div class="card shop-card">
          <span class="shop-icon">${item.icon}</span>
          <div class="heading-s">${esc(item.name)}</div>
          <div class="body-s t2" style="flex:1">${esc(item.desc)}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
            <span class="mono" style="color:${afford || permOwned ? 'var(--accent)' : 'var(--warning)'}">${item.price} кр</span>
            ${permOwned ? '<span class="badge badge-success">активно</span>'
          : `<button class="btn btn-secondary btn-s" data-buy="${item.id}" ${afford ? '' : 'disabled title="Не хватает кредитов. Раскройте дело — Директорат платит за результат."'}>Купить</button>`}
          </div>
          ${item.type === 'consumable' && owned ? `<div class="body-s t3">в запасе: ${owned}</div>` : ''}
        </div>`;
    }).join('')}
    </div>`;
  } else {
    const totalTries = Object.values(S.cases).reduce((a, cs) => a + (cs.tries || 0), 0);
    body = `
    <div class="stats-row">
      <div class="card stat-big"><div class="val">${solvedCases().length}</div><div class="cap">раскрыто дел</div></div>
      <div class="card stat-big"><div class="val">${S.agent.streak}</div><div class="cap">серия раскрытий</div></div>
      <div class="card stat-big"><div class="val">${totalTries}</div><div class="cap">отправок на проверку</div></div>
      <div class="card stat-big"><div class="val">${S.agent.badges.length}</div><div class="cap">значков</div></div>
    </div>
    <div class="section-title" style="margin-bottom:10px">Журнал операций</div>
    ${S.log.length ? `<table class="table" style="max-width:760px"><thead><tr><th>Время</th><th>Событие</th></tr></thead>
      <tbody>${S.log.map(l => `<tr class="${l.caseId && caseStatus(caseById(l.caseId)) === 'solved' ? 'is-clickable' : ''}" ${l.caseId ? `data-arch="${l.caseId}"` : ''}>
        <td class="mono-s t3" style="white-space:nowrap">${esc(l.time)}</td><td>${esc(l.text)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="body-s t3">Журнал заполнится по мере службы.</div>'}`;
  }

  root.innerHTML = `
  <div class="display-l" style="margin-bottom:16px">Личный терминал</div>
  <div class="terminal-tabs">
    ${tabs.map(([k, l]) => `<button class="terminal-tab ${tab === k ? 'is-active' : ''}" data-tab="${k}">${l}</button>`).join('')}
  </div>
  ${body}`;

  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go('/terminal/' + b.dataset.tab));
  const resetBtn = root.querySelector('#reset-dossier');
  if (resetBtn) resetBtn.onclick = () => {
    confirmDialog('Сбросить досье?', 'Весь локальный прогресс агента будет удалён. Действие необратимо.', 'Сбросить', () => {
      resetState(); location.hash = '/onboarding'; location.reload();
    }, true);
  };
  root.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buyItem(b.dataset.buy, () => renderTerminal(root, tab)));
  root.querySelectorAll('[data-arch]').forEach(r => r.onclick = () => go('/archive/' + r.dataset.arch));
  bindCommon(root);
}

function buyItem(id, rerender) {
  const item = SHOP.find(i => i.id === id);
  confirmDialog('Оформить закупку?', `«${item.name}» — ${item.desc}. Со счёта спишется ${item.price} кр.`, 'Купить', () => {
    if (S.agent.credits < item.price) return toast('warning', 'Недостаточно кредитов', 'Раскройте дело — Директорат платит за результат.');
    S.agent.credits -= item.price;
    if (item.id === 'hint-pack') S.agent.hintTokens += 1;
    else if (item.id === 'extra-try') {
      const act = activeCases()[0];
      if (act) { const cs = caseState(act.id); cs.attempts = Math.min(MAX_ATTEMPTS, cs.attempts + 2); cs.cooldownUntil = 0; }
    } else if (item.id === 'cool-cut') {
      Object.values(S.cases).forEach(cs => { cs.cooldownUntil = 0; if (cs.attempts <= 0) cs.attempts = 2; });
    } else S.inventory[item.id] = true;
    if (item.type === 'consumable' && item.id !== 'hint-pack') S.inventory[item.id] = (S.inventory[item.id] || 0) + 1;
    logEvent(`Снабжение: «${item.name}» (−${item.price} кр)`);
    save();
    toast('success', 'Снаряжение выдано', `«${item.name}» — ${item.desc}.`);
    rerender();
  });
}

/* ================= Полигон ================= */
function renderPolygon(root, fromCase) {
  const reco = fromCase ? POLYGON.filter(d => d.forCases.includes(fromCase)) : [];
  root.innerHTML = `
  <div class="display-l" style="margin-bottom:6px">Полигон</div>
  <div class="body-s t3" style="margin-bottom:18px">Внеплановые учения. Без попыток, без ставок — только отработка навыка.</div>
  ${fromCase ? `<div class="reco-strip">🎯 Рекомендовано для дела ${esc(caseById(fromCase).num)}:
    ${reco.map(d => `«${esc(d.name)}»`).join(', ') || 'общие учения'}
    <button class="btn btn-secondary btn-s" style="margin-left:auto" data-go="/case/${fromCase}/bench">${ICONS.back} Вернуться к делу</button></div>` : ''}
  <div class="polygon-grid">
    ${POLYGON.map(d => {
    const done = S.polygon[d.id] && S.polygon[d.id].done;
    return `<div class="card card-click" data-drill="${d.id}" tabindex="0">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <span class="badge ${done ? 'badge-success' : 'badge-neutral'}">${done ? 'отработано' : 'не пройдено'}</span>
        </div>
        <div class="heading-s">${esc(d.name)}</div>
        <div class="body-s t2" style="margin-top:4px">${esc(d.skill)}</div>
      </div>`;
  }).join('')}
  </div>`;
  root.querySelectorAll('[data-drill]').forEach(n => n.onclick = () => go(`/polygon/${n.dataset.drill}${fromCase ? '?from=' + fromCase : ''}`));
  bindCommon(root);
}

function renderDrill(root, id, fromCase) {
  const d = drillById(id);
  const ps = S.polygon[id] || (S.polygon[id] = { done: false, code: d.starter });
  root.innerHTML = `
  <div style="max-width:900px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-s" data-go="/polygon${fromCase ? '?from=' + fromCase : ''}">${ICONS.back} Учения</button>
      <div class="display-m">${esc(d.name)}</div>
      ${ps.done ? '<span class="badge badge-success">отработано</span>' : ''}
      ${fromCase ? `<button class="btn btn-primary btn-s" style="margin-left:auto" data-go="/case/${fromCase}/bench">Вернуться к делу</button>` : ''}
    </div>
    <div class="bench-task open" style="margin-bottom:12px">${esc(d.task)}</div>
    <div class="bench-editor-col">
      <div class="bench-tab">${ICONS.doc} учение.js</div>
      <textarea class="code-editor" id="drill-code" spellcheck="false" style="min-height:180px">${esc(ps.code)}</textarea>
      <div class="bench-console">
        <div class="console-head">Результат</div>
        <div class="console-out" id="drill-out"><span class="dim">Запустите прогон.</span></div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:12px">
      <button class="btn btn-primary" id="drill-run">Прогон</button>
    </div>
  </div>`;
  mountCodeEditor(root.querySelector('#drill-code'), {
    onChange: (code) => { ps.code = code; save(); },
  });
  root.querySelector('#drill-run').onclick = async () => {
    const out = root.querySelector('#drill-out');
    out.innerHTML = `<span class="dim">Отправка на сервер…</span>`;
    const response = await runOnServer(ps.code, d.fnName, [{ id: 'drill', tests: d.tests }]);
    if (response.compileError) { out.innerHTML = `<span class="err">✗ ${esc(response.compileError)}</span>`; return; }
    const res = (response.results || [])[0] || { pass: false, crashed: true, error: 'Раннер не вернул результат' };
    if (res.pass) {
      if (!ps.done) {
        ps.done = true;
        // учение снимает часть кулдауна
        Object.values(S.cases).forEach(cs => { if (cs.cooldownUntil > Date.now()) cs.cooldownUntil -= 30000; });
        save();
        toast('success', 'Навык отработан', fromCase ? 'Кулдаун верстака сокращён. Возвращайтесь к делу.' : 'Учение зачтено.');
        renderDrill(root, id, fromCase);
      }
      root.querySelector('#drill-out').innerHTML = `<span class="ok">✓ Все проверки пройдены. Навык отработан.</span>`;
    } else {
      out.innerHTML = res.crashed
        ? `<span class="err">✗ Остановка: ${esc(res.error)}</span>`
        : `<span class="err">✗ ${esc(fmtCall(d.fnName, res.test.args))} → ${esc(fmtVal(res.got))}</span> <span class="dim">(ожидалось: ${esc(fmtVal(res.test.expect))})</span>`;
    }
  };
  bindCommon(root);
}

/* ================= Архив — личное дело ================= */
function renderArchive(root, id, tab) {
  const c = caseById(id);
  const cs = caseState(id);
  if (caseStatus(c) !== 'solved') { go('/registry'); return; }
  tab = tab || 'materials';
  const tabs = [['materials', 'Материалы'], ['solution', 'Моё решение'], ['finale', 'Финал'], ['total', 'Итог']];

  let body = '';
  if (tab === 'materials') {
    body = c.materials.map(m => `<div class="card card-click" data-doc="${m.id}" style="margin-bottom:10px;max-width:640px">
      <div style="display:flex;gap:10px;align-items:center">${ICONS.doc}<div>
        <div class="heading-s" style="font-size:14px">${esc(m.title)}</div>
        <div class="body-s t3">${esc(m.type)} · ${esc(m.meta.source)}</div></div></div></div>`).join('');
  } else if (tab === 'solution') {
    body = `<div class="bench-editor-col" style="max-width:720px">
      <div class="bench-tab">${ICONS.doc} обработчик_улик.js · только чтение</div>
      <div class="code-editor" style="white-space:pre-wrap;flex:none">${esc(cs.code || '—')}</div></div>`;
  } else if (tab === 'finale') {
    body = `<div class="report-final" style="max-width:640px">
      ${c.finale.map(l => `<div class="curator-line">${curatorAvatar(l.curator)}<div>
        <div class="curator-name"><b>${esc(CURATORS[l.curator].name)}</b></div>
        <div class="curator-bubble">${esc(l.text)}</div></div></div>`).join('')}
      <div class="card" style="max-width:560px"><div class="label t3" style="margin-bottom:6px">Подтверждённая версия</div>
        ${esc((c.versions.find(v => v.correct) || {}).text || '—')}</div></div>`;
  } else {
    body = `<div class="stats-row" style="max-width:700px">
      <div class="card stat-big"><div class="val" style="color:var(--accent)">+${c.rewardCredits}</div><div class="cap">кредиты</div></div>
      <div class="card stat-big"><div class="val">+${c.rewardRep}</div><div class="cap">репутация</div></div>
      <div class="card stat-big"><div class="val">${cs.tries}</div><div class="cap">отправок</div></div>
      <div class="card stat-big"><div class="val mono" style="font-size:18px">${esc(cs.solvedAt || '—')}</div><div class="cap">дата закрытия</div></div>
    </div>`;
  }

  root.innerHTML = `
  <div class="archive-watermark">Архив</div>
  <div class="archive-head">
    <button class="btn btn-ghost btn-s" data-go="/registry">${ICONS.back} Картотека</button>
    <div class="display-l">${esc(c.title)}</div>
    <span class="stamp" style="font-size:14px;padding:3px 12px">Раскрыто</span>
    <span class="mono-s t3">${esc(c.num)} · закрыто ${esc(cs.solvedAt || '')}</span>
  </div>
  <div class="archive-tabs">
    ${tabs.map(([k, l]) => `<button class="terminal-tab ${tab === k ? 'is-active' : ''}" data-tab="${k}">${l}</button>`).join('')}
  </div>
  ${body}`;
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => renderArchive(root, id, b.dataset.tab));
  root.querySelectorAll('[data-doc]').forEach(n => n.onclick = () => openDocOverlay(c, n.dataset.doc));
  bindCommon(root);
}

/* ---------- общие обработчики ---------- */
function bindCommon(scope) {
  scope.querySelectorAll('[data-go]').forEach(b => { if (!b._bound) { b._bound = 1; b.addEventListener('click', () => go(b.dataset.go)); } });
  scope.querySelectorAll('[data-case]').forEach(b => {
    if (!b._bound) {
      b._bound = 1;
      b.addEventListener('click', () => openCaseModal(b.dataset.case));
      b.addEventListener('keydown', e => { if (e.key === 'Enter') openCaseModal(b.dataset.case); });
    }
  });
  scope.querySelectorAll('[data-act=comms]').forEach(b => { if (!b._bound) { b._bound = 1; b.addEventListener('click', openComms); } });
}
