/* ============ KODEX OS — звуковые эффекты (Web Audio API) ============
 * Все звуки синтезируются через AudioContext — без внешних файлов.
 * Вызов: sfx('success') | sfx('fail') | sfx('badge') | sfx('win') |
 *        sfx('info') | sfx('warn') | sfx('click') | sfx('unlock')
 * Пользователь может отключить звук через localStorage: kodex-sfx=off
 * Или через консоль: sfxToggle() */
'use strict';

let _ac = null;

/* Разблокировка AudioContext при первом клике — capture:true гарантирует,
 * что контекст уже running к моменту любых последующих async-вызовов sfx. */
document.addEventListener('click', function _unlock() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  if (_ac.state === 'suspended') _ac.resume();
}, { capture: true });

async function _play(notes, vol = 0.18) {
  if (localStorage.getItem('kodex-sfx') === 'off') return;
  try {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') await _ac.resume();
    const ac = _ac;
    let t = ac.currentTime + 0.02;
    notes.forEach(([freq, dur, type = 'sine', v = vol]) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(v, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.05);
      t += dur * 0.75;
    });
  } catch (e) { /* AudioContext недоступен */ }
}

const SFX = {
  click:  () => _play([[900, 0.06, 'sine', 0.08]]),
  info:   () => _play([[660, 0.12], [880, 0.10]]),
  warn:   () => _play([[440, 0.15, 'triangle', 0.15], [330, 0.20, 'triangle', 0.12]]),
  success:() => _play([[523, 0.10], [659, 0.10], [784, 0.18]]),
  fail:   () => _play([[400, 0.12, 'sawtooth', 0.10], [280, 0.22, 'sawtooth', 0.08]]),
  unlock: () => _play([[392, 0.10], [523, 0.10], [659, 0.12]]),
  badge:  () => _play([[784, 0.08], [988, 0.08], [1175, 0.08], [1568, 0.18]]),
  win:    () => _play([
    [523, 0.10], [659, 0.10], [784, 0.10],
    [1047, 0.22], [988, 0.10], [1047, 0.30],
  ]),
};

function sfx(name) {
  if (SFX[name]) SFX[name]();
}

function sfxToggle() {
  const off = localStorage.getItem('kodex-sfx') === 'off';
  localStorage.setItem('kodex-sfx', off ? 'on' : 'off');
  return off ? 'sfx: включён' : 'sfx: выключен';
}
