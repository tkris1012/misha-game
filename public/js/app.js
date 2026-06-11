'use strict';

/* ---------- ユーティリティ ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const wordById = (id) => WORDS.find((w) => w.id === id);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const DAY = 86400000;

/* ---------- アカウント & セーブデータ ---------- */
const ACCOUNTS = ['test', 'みしな'];
const LOGIN_KEY = 'misha-login';
let account = null;
const DEFAULT_STATE = () => ({
  m: {},        // 単語id → 習熟度0〜5
  due: {},      // 単語id → 次回復習時刻
  candies: 0,   // ことばのみ
  fed: 0,       // たべさせた回数
  hatched: false,
  cleared: 0,   // クリア済みステージ数(0〜6)
  sound: true,
  rev: 0        // 保存世代(クラウドとの競合解決用)
});
let state = DEFAULT_STATE();
const saveKey = () => 'misha-save-v1:' + account;

let cloudTimer = null;
function save() {
  state.rev = (state.rev || 0) + 1;
  localStorage.setItem(saveKey(), JSON.stringify(state));
  if (cloudEnabled() && account) {
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => { cloudSave(account, state).catch(() => {}); }, 1200);
  }
}
function loadLocal() {
  state = DEFAULT_STATE();
  try {
    const rawAcc = localStorage.getItem(saveKey());
    const rawOld = rawAcc ? null : localStorage.getItem('misha-save-v1'); // アカウント導入前のデータ引き継ぎ
    const raw = rawAcc || rawOld;
    if (raw) state = Object.assign(DEFAULT_STATE(), JSON.parse(raw));
    if (rawOld) {
      localStorage.setItem(saveKey(), rawOld);
      localStorage.removeItem('misha-save-v1');
    }
  } catch (e) { /* 壊れたセーブは初期化 */ }
}
const getM = (id) => state.m[id] || 0;
const learnedCount = () => WORDS.filter((w) => getM(w.id) > 0).length;

/* ---------- SRS ---------- */
function srsCorrect(id) {
  const m = Math.min(5, getM(id) + 1);
  state.m[id] = m;
  state.due[id] = Date.now() + SRS_DAYS[m] * DAY;
}
function srsWrong(id) {
  state.m[id] = Math.max(0, getM(id) - 1);
  state.due[id] = Date.now();
}
function dueWordIds(excludeIds) {
  const now = Date.now();
  return WORDS
    .filter((w) => getM(w.id) > 0 && (state.due[w.id] || 0) <= now && !excludeIds.includes(w.id))
    .map((w) => w.id);
}

/* ---------- 読み上げ ---------- */
function speak(text, lang, rate) {
  if (!state.sound || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || 'en-US';
  u.rate = rate || 0.95;
  const v = speechSynthesis.getVoices().find((vo) => vo.lang && vo.lang.startsWith((lang || 'en-US').slice(0, 2)));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function speakWord(w, withPhrase) {
  speak(w.en, 'en-US');
  if (withPhrase) {
    setTimeout(() => speak(w.ph, 'en-US'), 1100);
  }
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();

/* ---------- 画面切り替え ---------- */
function showScreen(name) {
  $$('.screen').forEach((s) => { s.hidden = true; });
  $('#screen-' + name).hidden = false;
  $('#tabbar').style.display = (name === 'login') ? 'none' : '';
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.screen === name));
  if (name === 'home') renderHome();
  if (name === 'map') renderMap();
  if (name === 'zukan') renderZukan();
}
$$('#tabbar button').forEach((b) => {
  b.addEventListener('click', () => showScreen(b.dataset.screen));
});

/* ---------- ホーム ---------- */
function roomLevel() {
  if (state.cleared >= 6) return 4;
  if (state.cleared >= 4) return 3;
  if (state.cleared >= 2) return 2;
  return 1;
}
function renderHome() {
  $('#room-bg').src = 'assets/room' + roomLevel() + '.svg';
  $('#ui-candy').textContent = state.candies;
  $('#ui-words').textContent = learnedCount();
  $('#ui-feed-candy').textContent = state.candies;
  $('#egg-svg').style.display = state.hatched ? 'none' : '';
  $('#baby-svg').style.display = state.hatched ? '' : 'none';
  $('#btn-feed').disabled = state.candies <= 0;
  $('#btn-sound').textContent = state.sound ? '🔊' : '🔇';

  if (!state.hatched) {
    $('#mission-chip').textContent = state.candies > 0
      ? 'たべさせると たまごが そだつよ! 🥚'
      : 'ぼうけんで ことばのみを あつめよう! 🎯';
  } else {
    $('#mission-chip').textContent = 'きょうも いっしょに あそぼう! 🎯';
  }
  showBubbleGreeting();
}
let bubbleTimer = null;
function showBubbleGreeting() {
  if (!state.hatched) { $('#bubble').hidden = true; return; }
  const learned = WORDS.filter((w) => getM(w.id) > 0);
  const text = learned.length > 0
    ? 'I like ' + learned[Math.floor(Math.random() * learned.length)].en + '!'
    : 'Hello!';
  $('#bubble').textContent = text;
  $('#bubble').hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { $('#bubble').hidden = true; }, 4000);
}

/* 表情 */
const EXPR = {
  normal: ['px-eyes-open', 'px-mouth-smile'],
  joy: ['px-eyes-happy', 'px-mouth-open', 'px-hearts'],
  eat: ['px-eyes-open', 'px-mouth-chew', 'px-berry'],
  blink: ['px-eyes-blink', 'px-mouth-smile']
};
let currentExpr = 'normal';
function setExpr(name) {
  currentExpr = name;
  $$('#baby-svg .px').forEach((g) => { g.style.display = 'none'; });
  EXPR[name].forEach((id) => { $('#' + id).style.display = ''; });
  $('#baby-svg').classList.toggle('anim-hop', name === 'joy');
  $('#baby-svg').classList.toggle('anim-float', name !== 'joy');
}
setInterval(() => {
  if (!state.hatched || $('#screen-home').hidden || currentExpr !== 'normal') return;
  setExpr('blink');
  setTimeout(() => { if (currentExpr === 'blink') setExpr('normal'); }, 140);
}, 3400);

/* たべさせる */
$('#btn-feed').addEventListener('click', () => {
  if (state.candies <= 0) return;
  state.candies--;
  state.fed++;
  save();
  if (!state.hatched) {
    eggExcite();
    if (state.fed >= 5) { setTimeout(hatch, 1300); }
  } else {
    setExpr('eat');
    const learned = WORDS.filter((w) => getM(w.id) > 0);
    setTimeout(() => {
      setExpr('joy');
      if (learned.length > 0) {
        const w = learned[Math.floor(Math.random() * learned.length)];
        speak(w.en + '! Yummy!', 'en-US');
        $('#bubble').textContent = w.en + '! 😋';
        $('#bubble').hidden = false;
      }
      setTimeout(() => { setExpr('normal'); renderHome(); }, 1400);
    }, 1500);
  }
  $('#ui-candy').textContent = state.candies;
  $('#ui-feed-candy').textContent = state.candies;
  $('#btn-feed').disabled = state.candies <= 0;
});

function eggExcite() {
  const egg = $('#egg-svg');
  egg.classList.remove('anim-rock');
  egg.classList.add('anim-wiggle');
  $('#egg-crack').style.display = '';
  setTimeout(() => {
    egg.classList.remove('anim-wiggle');
    egg.classList.add('anim-rock');
    if (!state.hatched) $('#egg-crack').style.display = 'none';
  }, 1200);
}
$('#egg-svg').addEventListener('click', eggExcite);
$('#baby-svg').addEventListener('click', () => {
  if (currentExpr !== 'normal') return;
  setExpr('joy');
  showBubbleGreeting();
  const learned = WORDS.filter((w) => getM(w.id) > 0);
  if (learned.length > 0) speak(learned[Math.floor(Math.random() * learned.length)].en, 'en-US');
  setTimeout(() => setExpr('normal'), 1300);
});

function hatch() {
  state.hatched = true;
  save();
  showOverlay('うまれたよ!! 🦄', 'ベビーユニコーンが なかまに なった!', true, 'やったー! 🎉', () => {
    renderHome();
    setExpr('joy');
    speak('Hello!', 'en-US');
    setTimeout(() => setExpr('normal'), 1600);
  });
}

/* サウンドON/OFF */
$('#btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  if (!state.sound) speechSynthesis.cancel();
  save();
  $('#btn-sound').textContent = state.sound ? '🔊' : '🔇';
});

$('#btn-go').addEventListener('click', () => showScreen('map'));

/* ---------- オーバーレイ ---------- */
function showOverlay(title, sub, withBaby, btnText, onClose) {
  $('#overlay .ov-title').textContent = title;
  $('#overlay .ov-sub').textContent = sub;
  $('#overlay img').hidden = !withBaby;
  $('#overlay button').textContent = btnText;
  $('#overlay').hidden = false;
  $('#overlay button').onclick = () => {
    $('#overlay').hidden = true;
    if (onClose) onClose();
  };
}

/* ---------- マップ ---------- */
const NODE_POS = [
  [80, 480], [230, 410], [200, 330], [150, 230], [160, 120], [160, 48]
];
function renderMap() {
  const wrap = $('#map-nodes');
  wrap.innerHTML = '';
  STAGES.forEach((st, i) => {
    const n = document.createElement('button');
    n.className = 'node';
    const isBoss = st.type === 'boss';
    if (isBoss) n.classList.add('boss');
    if (i < state.cleared) {
      n.classList.add('done');
      n.innerHTML = (isBoss ? '👑' : '✓') + '<small>' + st.name + '</small>';
    } else if (i === state.cleared) {
      n.classList.add('now');
      n.innerHTML = (isBoss ? '👑' : (i + 1)) + '<small>' + st.name + '</small>';
    } else {
      n.classList.add('lock');
      n.textContent = '🔒';
    }
    n.style.left = (NODE_POS[i][0] / 320 * 100) + '%';
    n.style.top = (NODE_POS[i][1] / 560 * 100) + '%';
    n.style.transform = 'translate(-50%, -50%)';
    if (i <= state.cleared) n.addEventListener('click', () => startStage(i));
    wrap.appendChild(n);
  });
  $('#map-progress').textContent = 'あつめた ことば 🍬 ' + learnedCount() + '/50';
}

/* ---------- ゲーム共通 ---------- */
let G = null;

function showGameView(id) {
  $$('.gameview').forEach((v) => { v.hidden = true; });
  $('#' + id).hidden = false;
}

function startStage(idx) {
  const st = STAGES[idx];
  let ids, type;
  if (st.type === 'boss') {
    type = 'catch';
    const due = dueWordIds([]);
    const learned = shuffle(WORDS.filter((w) => getM(w.id) > 0).map((w) => w.id));
    ids = [...new Set([...due, ...learned])].slice(0, 10);
    while (ids.length < 10) {
      const cand = shuffle(WORDS.map((w) => w.id)).find((id) => !ids.includes(id));
      ids.push(cand);
    }
  } else {
    type = st.type;
    ids = shuffle(st.ids);
    if (type === 'catch') {
      ids = ids.concat(shuffle(dueWordIds(st.ids)).slice(0, 2)); // 復習を最大2問ミックス
    }
  }
  G = {
    idx, type,
    queue: ids,
    pos: 0,
    candies: 0,
    correct: 0,
    total: ids.length,
    requeued: {},
    rounds: null,
    matchedInRound: 0
  };
  $('#game-stage-name').textContent = st.name;
  showScreen('game');
  $$('#tabbar button').forEach((b) => b.classList.remove('on'));
  if (type === 'catch') nextCatchQuestion();
  else startMatchRounds();
}

$('#game-quit').addEventListener('click', () => { speechSynthesis.cancel(); showScreen('map'); });

/* ---------- ことばキャッチ ---------- */
function nextCatchQuestion() {
  if (G.pos >= G.queue.length) { stageClear(); return; }
  const w = wordById(G.queue[G.pos]);
  $('#game-qnum').textContent = (G.pos + 1) + '/' + G.queue.length;
  showGameView('view-catch');
  const distractors = shuffle(WORDS.filter((x) => x.id !== w.id)).slice(0, 3);
  const choices = shuffle([w, ...distractors]);
  const grid = $('#catch-choices');
  grid.innerHTML = '';
  let answered = false;
  choices.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = c.e;
    b.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      if (c.id === w.id) {
        b.classList.add('correct');
        srsCorrect(w.id);
        G.candies++;
        G.correct++;
        setTimeout(() => showResult(w, true), 550);
      } else {
        b.classList.add('wrong', 'shake');
        srsWrong(w.id);
        grid.querySelectorAll('.choice').forEach((el, i2) => {
          if (choices[i2].id === w.id) el.classList.add('correct');
        });
        if (!G.requeued[w.id]) { G.requeued[w.id] = true; G.queue.push(w.id); }
        setTimeout(() => showResult(w, false), 900);
      }
      save();
    });
    grid.appendChild(b);
  });
  $('#btn-speaker').onclick = () => speak(w.en, 'en-US');
  setTimeout(() => speak(w.en, 'en-US'), 350);
}

function showResult(w, ok) {
  showGameView('view-result');
  $('#result-mark').textContent = ok ? '💮 せいかい!' : 'おしい! こたえは…';
  $('#word-card .pic').textContent = w.e;
  $('#word-card .en').textContent = w.en;
  $('#word-card .ja').textContent = w.ja;
  $('#word-card .ph').textContent = w.ph;
  $('#btn-replay').onclick = () => speakWord(w, true);
  setTimeout(() => speakWord(w, true), 400);
  $('#btn-next').onclick = () => {
    speechSynthesis.cancel();
    G.pos++;
    nextCatchQuestion();
  };
}

/* ---------- 絵あわせカード ---------- */
function startMatchRounds() {
  const ids = G.queue.slice();
  G.rounds = [];
  for (let i = 0; i < ids.length; i += 4) G.rounds.push(ids.slice(i, i + 4));
  G.roundPos = 0;
  startMatchRound();
}
function startMatchRound() {
  if (G.roundPos >= G.rounds.length) { stageClear(); return; }
  const ids = G.rounds[G.roundPos];
  $('#game-qnum').textContent = 'ラウンド ' + (G.roundPos + 1) + '/' + G.rounds.length;
  showGameView('view-match');
  const cards = shuffle(ids.flatMap((id) => [
    { id, kind: 'pic' }, { id, kind: 'word' }
  ]));
  const grid = $('#match-grid');
  grid.innerHTML = '';
  let first = null;
  let lockBoard = false;
  let found = 0;
  cards.forEach((cd) => {
    const b = document.createElement('button');
    b.className = 'mcard';
    b.innerHTML = '<span class="back-mark">💗</span>';
    b.dataset.id = cd.id;
    b.dataset.kind = cd.kind;
    const openCard = () => {
      b.classList.add('open');
      if (cd.kind === 'word') b.classList.add('word');
      const w = wordById(cd.id);
      b.textContent = cd.kind === 'pic' ? w.e : w.en;
      if (cd.kind === 'word') speak(w.en, 'en-US');
    };
    const closeCard = () => {
      b.classList.remove('open', 'word');
      b.innerHTML = '<span class="back-mark">💗</span>';
    };
    b.addEventListener('click', () => {
      if (lockBoard || b.classList.contains('open') || b.classList.contains('got')) return;
      openCard();
      if (!first) { first = b; return; }
      const a = first;
      first = null;
      if (a.dataset.id === b.dataset.id && a.dataset.kind !== b.dataset.kind) {
        a.classList.add('got');
        b.classList.add('got');
        const w = wordById(cd.id);
        srsCorrect(w.id);
        G.candies++;
        G.correct++;
        save();
        speakWord(w, false);
        found++;
        if (found >= ids.length) {
          setTimeout(() => { G.roundPos++; startMatchRound(); }, 900);
        }
      } else {
        lockBoard = true;
        setTimeout(() => {
          closeCard();
          a.classList.remove('open', 'word');
          a.innerHTML = '<span class="back-mark">💗</span>';
          lockBoard = false;
        }, 800);
      }
    });
    grid.appendChild(b);
  });
}

/* ---------- ステージクリア ---------- */
function stageClear() {
  const isBoss = STAGES[G.idx].type === 'boss';
  const rate = G.correct / Math.max(1, G.total);
  const stars = rate >= 0.9 ? 3 : rate >= 0.7 ? 2 : 1;
  state.candies += G.candies;
  if (G.idx === state.cleared) state.cleared++;
  save();
  showGameView('clear-view');
  $('#clear-title').textContent = isBoss ? '👑 ワールドクリア!!' : '🎉 ステージクリア!';
  $('#clear-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  $('#clear-candy').textContent = '🍬 ことばのみ ×' + G.candies + ' ゲット!';
  speak('Great job!', 'en-US');
  if (isBoss) {
    setTimeout(() => {
      showOverlay('たべものの森 コンプリート! 🍓', 'おへやが ゆめかわプリンセスルームに なった!', true, 'すごーい! 🎀', () => showScreen('home'));
    }, 800);
  }
}
$('#btn-clear-home').addEventListener('click', () => showScreen('home'));
$('#btn-clear-map').addEventListener('click', () => showScreen('map'));

/* ---------- ずかん ---------- */
function renderZukan() {
  $('#zukan-count').textContent = learnedCount();
  const grid = $('#zukan-grid');
  grid.innerHTML = '';
  WORDS.forEach((w) => {
    const c = document.createElement('button');
    const m = getM(w.id);
    if (m >= 1) {
      c.className = 'zcard' + (m >= 2 ? ' gold' : '');
      c.innerHTML = '<div class="pic">' + w.e + '</div><div class="w">' + w.en + (m >= 2 ? ' ⭐' : '') + '</div><div class="j">' + w.ja + '</div>';
      c.addEventListener('click', () => {
        speakWord(w, true);
        setTimeout(() => speak(w.ja, 'ja-JP'), 2600);
      });
    } else {
      c.className = 'zcard unknown';
      c.innerHTML = '<div class="pic">' + w.e + '</div><div class="w">???</div><div class="j">&nbsp;</div>';
    }
    grid.appendChild(c);
  });
}

/* ---------- ログイン ---------- */
function setLoginMsg(text, ok) {
  $('#login-msg').textContent = text;
  $('#login-msg').classList.toggle('ok', !!ok);
}

async function doLogin(id) {
  account = id;
  localStorage.setItem(LOGIN_KEY, id);
  loadLocal();
  if (cloudEnabled()) {
    setLoginMsg('クラウドから よみこみちゅう… ☁️', true);
    try {
      const cloud = await cloudLoad(id);
      if (cloud && (cloud.rev || 0) >= (state.rev || 0)) {
        state = Object.assign(DEFAULT_STATE(), cloud);
        localStorage.setItem(saveKey(), JSON.stringify(state));
      } else if ((state.rev || 0) > 0) {
        cloudSave(id, state).catch(() => {});
      }
      setLoginMsg('', true);
    } catch (e) {
      setLoginMsg('クラウドに つながらなかったよ(このたんまつに ほぞんするね)', false);
    }
  }
  $('#btn-account').textContent = '👤 ' + id;
  showScreen('home');
}

$('#btn-login').addEventListener('click', () => {
  const id = $('#login-id').value.trim();
  if (!ACCOUNTS.includes(id)) {
    setLoginMsg('その IDは ないよ 🥺', false);
    return;
  }
  setLoginMsg('', true);
  doLogin(id);
});
$('#login-id').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-login').click();
});

$('#btn-account').addEventListener('click', () => {
  if (!confirm('アカウントを きりかえる?\n(データは ほぞんされるよ)')) return;
  speechSynthesis.cancel();
  clearTimeout(cloudTimer);
  if (cloudEnabled() && account) cloudSave(account, state).catch(() => {});
  account = null;
  localStorage.removeItem(LOGIN_KEY);
  $('#login-id').value = '';
  setLoginMsg('', true);
  showScreen('login');
});

/* ---------- 起動 ---------- */
(() => {
  const savedId = localStorage.getItem(LOGIN_KEY);
  if (savedId && ACCOUNTS.includes(savedId)) doLogin(savedId);
  else showScreen('login');
})();
