'use strict';

/* ---------- 効果音(WebAudioで生成する可愛いチャイム) ---------- */
let _audioCtx = null;
function _ac() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function _tone(freq, delay, dur, type, gain) {
  const ctx = _ac();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  const t0 = ctx.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function sfx(name) {
  if (typeof state !== 'undefined' && !state.sound) return;
  try {
    if (name === 'correct') { _tone(880, 0, 0.12); _tone(1320, 0.1, 0.2); }
    else if (name === 'wrong') { _tone(233, 0, 0.22, 'triangle', 0.07); }
    else if (name === 'candy') { _tone(1568, 0, 0.1); _tone(2093, 0.08, 0.16); }
    else if (name === 'clear') { [523, 659, 784, 1047].forEach((f, i) => _tone(f, i * 0.12, 0.24)); }
    else if (name === 'fanfare') { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => _tone(f, i * 0.13, 0.32)); }
    else if (name === 'pop') { _tone(740, 0, 0.07, 'square', 0.045); }
  } catch (e) { /* 音が出せない環境では無視 */ }
}

/* ---------- パーティクル ---------- */
function burstAt(target, emojis, count) {
  const app = document.getElementById('app');
  if (!app || !target) return;
  const ar = app.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const cx = r.left + r.width / 2 - ar.left;
  const cy = r.top + r.height / 2 - ar.top;
  for (let i = 0; i < (count || 8); i++) {
    const s = document.createElement('span');
    s.className = 'particle';
    s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    s.style.left = cx + 'px';
    s.style.top = cy + 'px';
    app.appendChild(s);
    const ang = Math.random() * Math.PI * 2;
    const dist = 45 + Math.random() * 75;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 35;
    const dur = 600 + Math.random() * 500;
    s.animate([
      { transform: 'translate(-50%,-50%) scale(.5)', opacity: 1 },
      { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(' + (1 + Math.random()) + ')', opacity: 0 }
    ], { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)' });
    setTimeout(() => s.remove(), dur);
  }
}

/* 紙吹雪(画面上から降る) */
function confetti(count) {
  const app = document.getElementById('app');
  if (!app) return;
  const emojis = ['💖', '⭐', '💛', '💜', '💙', '🌸', '✨', '🎀'];
  const W = app.clientWidth;
  const H = app.clientHeight;
  for (let i = 0; i < (count || 24); i++) {
    const s = document.createElement('span');
    s.className = 'particle';
    s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    s.style.left = (Math.random() * W) + 'px';
    s.style.top = '-30px';
    app.appendChild(s);
    const drift = (Math.random() - 0.5) * 90;
    const rot = (Math.random() - 0.5) * 720;
    const dur = 1300 + Math.random() * 1500;
    s.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: 'translate(' + drift + 'px,' + (H + 60) + 'px) rotate(' + rot + 'deg)', opacity: 0.9 }
    ], { duration: dur, easing: 'linear' });
    setTimeout(() => s.remove(), dur);
  }
}

/* 画面フラッシュ(孵化・進化用) */
function flashFx(dur) {
  const app = document.getElementById('app');
  if (!app) return;
  const d = document.createElement('div');
  d.className = 'flash-fx';
  app.appendChild(d);
  d.animate([{ opacity: 0 }, { opacity: 0.95 }, { opacity: 0 }], { duration: dur || 650, easing: 'ease-out' });
  setTimeout(() => d.remove(), dur || 650);
}

/* ぽよんと出る演出(同じ要素で何度でも再生できる) */
function popIn(el) {
  if (!el) return;
  el.classList.remove('pop-in');
  void el.offsetWidth;
  el.classList.add('pop-in');
}
