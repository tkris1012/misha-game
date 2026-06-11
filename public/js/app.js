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
const HATCH_FED = 5;    // 卵 → ベビー: たべさせた回数
const EVOLVE_FED = 50;  // ベビー → ユニコーン(成体): たべさせた回数(仮)
let account = null;
const DEFAULT_STATE = () => ({
  m: {},        // 単語id → 習熟度0〜5
  due: {},      // 単語id → 次回復習時刻
  pantry: {},   // 単語id → 持っている食べ物の数(ことばのみ)
  candies: 0,   // 旧形式の通貨(pantryへ移行済み・互換用)
  fed: 0,       // たべさせた回数
  hatched: false,
  evolved: false, // ユニコーン(成体)へ進化済みか
  cleared: 0,   // クリア済みステージ数(0〜6)
  lastRoom: 1,  // 部屋レベルアップ演出用
  sound: true,
  rev: 0        // 保存世代(クラウドとの競合解決用)
});

/* 旧セーブ(candies通貨)を食べ物インベントリへ移行 */
function migrateState() {
  if (!state.pantry) state.pantry = {};
  if (state.candies > 0) {
    const learned = WORDS.filter((w) => getM(w.id) > 0);
    if (learned.length > 0) {
      let i = 0;
      while (state.candies > 0) {
        const id = learned[i % learned.length].id;
        state.pantry[id] = (state.pantry[id] || 0) + 1;
        state.candies--;
        i++;
      }
    } else {
      state.candies = 0;
    }
  }
}
const pantryTotal = () => Object.values(state.pantry || {}).reduce((a, b) => a + b, 0);
const addFood = (id) => { state.pantry[id] = (state.pantry[id] || 0) + 1; };
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
  migrateState();
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
  b.addEventListener('click', () => { sfx('pop'); showScreen(b.dataset.screen); });
});

/* ---------- ホーム ---------- */
function roomLevel() {
  if (state.cleared >= 6) return 4;
  if (state.cleared >= 4) return 3;
  if (state.cleared >= 2) return 2;
  return 1;
}
function partnerStage() {
  if (!state.hatched) return 'egg';
  return state.evolved ? 'unicorn' : 'baby';
}
function partnerImg() {
  const st = partnerStage();
  return st === 'egg' ? 'assets/egg.svg' : st === 'baby' ? 'assets/baby.svg' : 'assets/unicorn.svg';
}
function renderHome() {
  const lv = roomLevel();
  $('#room-bg').src = 'assets/room' + lv + '.svg';
  $('#ui-candy').textContent = pantryTotal();
  $('#ui-words').textContent = learnedCount();
  $('#ui-feed-candy').textContent = pantryTotal();
  const stage = partnerStage();
  $('#egg-svg').style.display = stage === 'egg' ? '' : 'none';
  $('#baby-svg').style.display = stage === 'baby' ? '' : 'none';
  $('#unicorn-wrap').style.display = stage === 'unicorn' ? '' : 'none';
  $('#btn-feed').disabled = pantryTotal() <= 0;
  $('#btn-sound').textContent = state.sound ? '🔊' : '🔇';

  // 部屋レベルアップ演出
  if ((state.lastRoom || 1) < lv) {
    state.lastRoom = lv;
    save();
    sfx('clear');
    confetti(22);
    $('#mission-chip').textContent = 'おへやが かわいくなった! 🎀✨';
    popIn($('#mission-chip'));
    showBubbleGreeting();
    return;
  }

  if (stage === 'egg') {
    $('#mission-chip').textContent = pantryTotal() > 0
      ? 'たべさせると たまごが そだつよ! 🥚'
      : 'ぼうけんで たべものを あつめよう! 🎯';
  } else if (stage === 'baby') {
    $('#mission-chip').textContent = 'しんかまで あと ' + Math.max(0, EVOLVE_FED - state.fed) + 'かい たべさせてね ✨';
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
  eat: ['px-eyes-open', 'px-mouth-chew'],
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

/* たべさせる(ゲットした食べ物から選ぶ) */
function buildFoodPicker() {
  const grid = $('#food-picker-grid');
  grid.innerHTML = '';
  WORDS.forEach((w) => {
    const c = state.pantry[w.id] || 0;
    if (c <= 0) return;
    const b = document.createElement('button');
    b.className = 'food-item';
    b.innerHTML = w.e + '<span class="nm">' + w.en + '</span><span class="cnt">×' + c + '</span>';
    b.addEventListener('click', () => pickFood(w.id));
    grid.appendChild(b);
  });
}
function openFoodPicker() {
  buildFoodPicker();
  $('#food-picker').hidden = false;
}
function closeFoodPicker() {
  $('#food-picker').hidden = true;
}
$('#btn-feed').addEventListener('click', () => {
  if (pantryTotal() <= 0) return;
  sfx('pop');
  openFoodPicker();
});
$('#food-picker-close').addEventListener('click', () => { sfx('pop'); closeFoodPicker(); });

let feeding = false;
function pickFood(id) {
  if (feeding || (state.pantry[id] || 0) <= 0) return;
  feeding = true;
  closeFoodPicker();
  state.pantry[id]--;
  state.fed++;
  save();
  sfx('candy');
  const w = wordById(id);
  $('#ui-candy').textContent = pantryTotal();
  $('#ui-feed-candy').textContent = pantryTotal();
  $('#btn-feed').disabled = pantryTotal() <= 0;

  const munch = () => {
    speak(w.en + '! Yummy!', 'en-US');
    $('#bubble').textContent = w.e + ' ' + w.en + '! 😋';
    $('#bubble').hidden = false;
  };

  if (!state.hatched) {
    foodFly($('#egg-svg'), w.e, 0.5);
    setTimeout(eggExcite, 700);
    setTimeout(() => {
      feeding = false;
      if (state.fed >= HATCH_FED) hatch();
      else renderHome();
    }, 1900);
  } else if (!state.evolved) {
    foodFly($('#baby-svg'), w.e, 0.63);
    setTimeout(() => setExpr('eat'), 600);
    setTimeout(() => {
      setExpr('joy');
      burstAt($('#baby-svg'), ['💖', '✨'], 8);
      munch();
      setTimeout(() => {
        setExpr('normal');
        feeding = false;
        if (state.fed >= EVOLVE_FED) evolve();
        else renderHome();
      }, 1300);
    }, 1900);
  } else {
    const u = $('#unicorn-wrap');
    foodFly(u, w.e, 0.6);
    setTimeout(() => {
      u.classList.add('anim-hop');
      u.classList.remove('anim-float');
      burstAt(u, ['💖', '✨'], 8);
      munch();
    }, 900);
    setTimeout(() => {
      u.classList.remove('anim-hop');
      u.classList.add('anim-float');
      feeding = false;
      renderHome();
    }, 2200);
  }
}

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
$('#egg-svg').addEventListener('click', () => { sfx('pop'); eggExcite(); });
$('#baby-svg').addEventListener('click', () => {
  if (currentExpr !== 'normal') return;
  sfx('pop');
  setExpr('joy');
  burstAt($('#baby-svg'), ['💖', '✨'], 6);
  showBubbleGreeting();
  const learned = WORDS.filter((w) => getM(w.id) > 0);
  if (learned.length > 0) speak(learned[Math.floor(Math.random() * learned.length)].en, 'en-US');
  setTimeout(() => setExpr('normal'), 1300);
});
$('#unicorn-wrap').addEventListener('click', () => {
  sfx('pop');
  const u = $('#unicorn-wrap');
  u.classList.add('anim-hop');
  u.classList.remove('anim-float');
  burstAt(u, ['💖', '✨', '⭐'], 8);
  showBubbleGreeting();
  const learned = WORDS.filter((w) => getM(w.id) > 0);
  if (learned.length > 0) speak(learned[Math.floor(Math.random() * learned.length)].en, 'en-US');
  setTimeout(() => {
    u.classList.remove('anim-hop');
    u.classList.add('anim-float');
  }, 1300);
});

function hatch() {
  state.hatched = true;
  save();
  flashFx();
  sfx('fanfare');
  confetti(30);
  showOverlay('うまれたよ!! 🦄', 'ベビーユニコーンが なかまに なった!', 'assets/baby.svg', 'やったー! 🎉', () => {
    renderHome();
    setExpr('joy');
    speak('Hello!', 'en-US');
    setTimeout(() => setExpr('normal'), 1600);
  });
}

function evolve() {
  state.evolved = true;
  save();
  flashFx(800);
  sfx('fanfare');
  confetti(40);
  showOverlay('しんかした!! ✨🦄✨', 'りっぱな ユニコーンに しんかした! おめでとう!', 'assets/unicorn.svg', 'かっこいい! ✨', () => {
    renderHome();
    burstAt($('#unicorn-wrap'), ['💖', '✨', '⭐'], 14);
    speak('I am a unicorn!', 'en-US');
  });
}

/* サウンドON/OFF */
$('#btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  if (!state.sound) speechSynthesis.cancel();
  save();
  $('#btn-sound').textContent = state.sound ? '🔊' : '🔇';
});

$('#btn-go').addEventListener('click', () => { sfx('pop'); showScreen('map'); });

/* ---------- オーバーレイ ---------- */
function showOverlay(title, sub, imgSrc, btnText, onClose) {
  $('#overlay .ov-title').textContent = title;
  $('#overlay .ov-sub').textContent = sub;
  $('#overlay img').hidden = !imgSrc;
  if (imgSrc) $('#overlay img').src = imgSrc;
  $('#overlay button').textContent = btnText;
  $('#overlay').hidden = false;
  popIn($('#overlay .ov-title'));
  popIn($('#overlay img'));
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
        sfx('correct');
        burstAt(b, [w.e, '💖', '✨'], 10);
        srsCorrect(w.id);
        addFood(w.id);
        G.candies++;
        G.correct++;
        setTimeout(() => showResult(w, true), 550);
      } else {
        b.classList.add('wrong', 'shake');
        sfx('wrong');
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
  popIn($('#result-mark'));
  popIn($('#word-card'));
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
        sfx('correct');
        const w = wordById(cd.id);
        burstAt(b, [w.e, '💖', '✨'], 8);
        srsCorrect(w.id);
        addFood(w.id);
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
        sfx('wrong');
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
  if (G.idx === state.cleared) state.cleared++;
  save();
  showGameView('clear-view');
  $('#clear-title').textContent = isBoss ? '👑 ワールドクリア!!' : '🎉 ステージクリア!';
  $('#clear-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  $('#clear-candy').textContent = '🍎 たべもの ×' + G.candies + ' ゲット! たべさせてあげよう!';
  popIn($('#clear-title'));
  popIn($('#clear-stars'));
  sfx('clear');
  confetti(isBoss ? 40 : 26);
  speak('Great job!', 'en-US');
  if (isBoss) {
    setTimeout(() => {
      sfx('fanfare');
      showOverlay('たべものの森 コンプリート! 🍓', 'おへやが ゆめかわプリンセスルームに なった!', partnerImg(), 'すごーい! 🎀', () => showScreen('home'));
    }, 900);
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
        sfx('pop');
        burstAt(c, ['💖', '✨'], 5);
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
        migrateState();
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
