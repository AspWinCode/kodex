/* ============ KODEX OS — сквозные слои: Comms и Джарвисмен ============ */
'use strict';

/* ---------- S13. Канал связи ---------- */
function openComms() {
  if (document.querySelector('.comms-panel')) return;
  const scrim = el(`<div class="scrim" style="justify-content:flex-end;padding:0;background:rgba(13,17,23,.4)"></div>`);
  const panel = el(`<div class="comms-panel">
    <div class="comms-head">
      ${ICONS.comms}
      <div style="flex:1"><div class="display-m" style="font-size:15px">Канал связи</div>
      <div class="mono-s t3" style="font-size:10px">ЗАЩИЩЁННАЯ ЛИНИЯ ДИРЕКТОРАТА</div></div>
      <button class="icon-btn" data-x="close">${ICONS.close}</button>
    </div>
    <div class="comms-feed" id="comms-feed"></div>
  </div>`);
  scrim.appendChild(panel);
  document.getElementById('overlay-root').appendChild(scrim);

  const close = () => scrim.remove();
  scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
  panel.querySelector('[data-x=close]').onclick = close;
  const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  const feed = panel.querySelector('#comms-feed');
  feed.innerHTML = S.messages.map(m => {
    const cur = CURATORS[m.from];
    const c = m.caseId ? caseById(m.caseId) : null;
    const st = c ? caseStatus(c) : null;
    return `<div class="comms-msg">
      ${curatorAvatar(m.from)}
      <div style="flex:1;min-width:0">
        <div class="curator-name"><b>${esc(cur.name)}</b> · ${esc(cur.role)}</div>
        <div class="comms-bubble">${esc(m.text)}
          ${c ? `<div class="call-card">
            <span class="mono-s" style="color:var(--accent)">${esc(c.num)}</span>
            <span style="flex:1;font-size:12px;font-weight:600">${esc(c.title)}</span>
            <button class="btn btn-primary btn-s" data-open-case="${c.id}">${st === 'solved' ? 'Архив' : st === 'active' ? 'Продолжить' : 'Открыть дело'}</button>
          </div>` : ''}
          <div class="comms-time">${esc(m.time)}</div>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="body-s t3" style="text-align:center;padding:30px">Эфир тих, агент.</div>';

  // пометить прочитанными
  let hadUnread = S.messages.some(m => !m.read);
  S.messages.forEach(m => m.read = true);
  save();
  if (hadUnread) refreshNavBadge();

  feed.querySelectorAll('[data-open-case]').forEach(b => b.onclick = () => {
    const id = b.dataset.openCase;
    close();
    const st = caseStatus(caseById(id));
    if (st === 'solved') go('/archive/' + id);
    else if (st === 'active') go(`/case/${id}/${stageRoute(caseState(id))}`);
    else openCaseModal(id);
  });
}

/* ---------- S14. Джарвисмен ---------- */
let jarvisOpen = false;

function mountJarvisFab(obMode) {
  let fab = document.querySelector('.jarvis-fab');
  if (!fab) {
    fab = el(`<button class="jarvis-fab" title="Джарвисмен — эксперт сети" aria-label="Джарвисмен"><span class="core"></span></button>`);
    document.getElementById('jarvis-root').appendChild(fab);
    fab.onclick = () => {
      if (window._obJarvisTap) {
        openJarvis();
        jarvisSay('Приветствую, новобранец. Я Джарвисмен — эксперт сети. Когда дело зайдёт в тупик, жмите на мой ромб: дам наводку. Первая — за счёт агентства.');
        window._obJarvisTap();
        return;
      }
      toggleJarvis();
    };
  }
  if (obMode) fab.classList.add('has-note');
}

function unmountJarvisFab() {
  document.getElementById('jarvis-root').innerHTML = '';
  jarvisOpen = false;
}

function toggleJarvis() { jarvisOpen ? closeJarvis() : openJarvis(); }
function closeJarvis() {
  const p = document.querySelector('.jarvis-panel');
  if (p) p.remove();
  jarvisOpen = false;
}

function currentCaseId() {
  const m = location.hash.match(/case\/([^/]+)/);
  return m ? m[1] : (activeCases()[0] ? activeCases()[0].id : null);
}

function openJarvis() {
  if (jarvisOpen) return;
  jarvisOpen = true;
  document.querySelector('.jarvis-fab')?.classList.remove('has-note');
  const caseId = currentCaseId();
  const c = caseId ? caseById(caseId) : null;

  const panel = el(`<div class="jarvis-panel">
    <div class="jarvis-head">
      <span class="core" style="width:12px;height:12px;border-radius:50%;background:var(--info);display:inline-block"></span>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">Джарвисмен</div>
        <div class="mono-s t3" style="font-size:10px">${c ? 'КОНТЕКСТ: ' + esc(c.num) : 'ЭКСПЕРТ СЕТИ КОДЭКС'}</div>
      </div>
      <span class="mono-s" style="color:var(--info)">беспл.: ${S.agent.hintTokens}</span>
      <button class="icon-btn" data-x="close">${ICONS.close}</button>
    </div>
    <div class="jarvis-feed" id="jarvis-feed"></div>
    <div class="jarvis-actions" id="jarvis-actions"></div>
  </div>`);
  document.getElementById('jarvis-root').appendChild(panel);
  panel.querySelector('[data-x=close]').onclick = closeJarvis;

  renderJarvisFeed();
  renderJarvisActions();
}

function jarvisFeedFor(caseId) {
  const key = caseId || '_global';
  if (!S.jarvisLog[key]) S.jarvisLog[key] = [];
  return S.jarvisLog[key];
}

function renderJarvisFeed() {
  const feed = document.getElementById('jarvis-feed');
  if (!feed) return;
  const log = jarvisFeedFor(currentCaseId());
  feed.innerHTML = log.length
    ? log.map(m => `<div class="jarvis-msg ${m.who}">${esc(m.text)}</div>`).join('')
    : `<div class="jarvis-msg bot">На связи, агент. ${currentCaseId() ? 'Нужна наводка по делу? Выбирайте уровень ниже.' : 'Возьмите дело в работу — и я подскажу, если застрянете.'}</div>`;
  feed.scrollTop = feed.scrollHeight;
}

function jarvisSay(text) {
  if (!jarvisOpen) openJarvis();
  const log = jarvisFeedFor(currentCaseId());
  log.push({ who: 'bot', text });
  save();
  renderJarvisFeed();
}

function renderJarvisActions() {
  const box = document.getElementById('jarvis-actions');
  if (!box) return;
  const caseId = currentCaseId();
  const c = caseId ? caseById(caseId) : null;

  if (!c || !c.playable || caseStatus(c) === 'solved') {
    box.innerHTML = `<div class="body-s t3">Наводки доступны внутри активного дела.</div>`;
    return;
  }
  const cs = caseState(caseId);
  box.innerHTML = HINT_LEVELS.map(h => {
    const used = cs.hintsUsed.includes(h.level);
    const free = S.agent.hintTokens > 0 || (window._jarvisFreeL1 === caseId && h.level === 1);
    const afford = free || S.agent.credits >= h.price;
    return `<button class="hint-btn" data-hint="${h.level}" ${used || !afford ? 'disabled' : ''}
      ${!afford && !used ? 'title="Не хватает кредитов"' : ''}>
      <span>💡</span><span>${esc(h.label)}</span>
      <span class="price">${used ? 'выдана' : free ? 'беспл.' : h.price + ' кр'}</span>
    </button>`;
  }).join('') + `<div class="body-s t3" style="text-align:center">Уровень III раскрывает подход, но не готовый код.</div>`;

  box.querySelectorAll('[data-hint]').forEach(b => b.onclick = () => {
    const lvl = +b.dataset.hint;
    const h = HINT_LEVELS.find(x => x.level === lvl);
    const freeL1 = window._jarvisFreeL1 === caseId && lvl === 1;
    if (freeL1) window._jarvisFreeL1 = null;
    else if (S.agent.hintTokens > 0) S.agent.hintTokens -= 1;
    else if (S.agent.credits >= h.price) S.agent.credits -= h.price;
    else return;
    cs.hintsUsed.push(lvl);
    const log = jarvisFeedFor(caseId);
    log.push({ who: 'user', text: h.label });
    log.push({ who: 'bot', text: c.hints[lvl] });
    logEvent(`Наводка ${'I'.repeat(lvl)} по делу ${c.num}`, caseId);
    save();
    renderJarvisFeed();
    renderJarvisActions();
    renderTopbar(); // обновить баланс
  });
}
