'use strict';

/* ================= ユーティリティ ================= */
const $ = (sel, root) => (root || document).querySelector(sel);

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample(arr, n) { return shuffle(arr).slice(0, n); }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pad2(n) { return String(n).padStart(2, '0'); }
function todayKey(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function daysBetween(a, b) { // 'YYYY-MM-DD' の差(b - a, 日数)
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

const WDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/* ================= 効果音 ================= */
let audioCtx = null;
function beep(freq, dur, type) {
  if (state.muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.1, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* 無音でも動作 */ }
}
const sndOK = () => { beep(880, .15); setTimeout(() => beep(1174, .18), 80); };
const sndNG = () => beep(200, .22, 'triangle');
const sndTap = () => beep(620, .06);
const sndDone = () => { beep(659, .13); setTimeout(() => beep(784, .13), 130); setTimeout(() => beep(1047, .26), 260); };

/* ================= 状態保存 ================= */
const STORE_KEY = 'noutore-v2';
function sanitizeState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
  if (typeof s.muted !== 'boolean') s.muted = false;
  ['checks', 'bench', 'challenges', 'levels'].forEach(k => { if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {}; });
  if (typeof s.bigText !== 'boolean') s.bigText = false;
  if (typeof s.dark !== 'boolean') s.dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (typeof s.tab !== 'string') s.tab = 'home';
  if (typeof s.seenIntro !== 'boolean') s.seenIntro = false;
  if (!s.family || typeof s.family !== 'object' || typeof s.family.code !== 'string' || typeof s.family.name !== 'string') s.family = null; // {code, name}
  if (typeof s.lastPost !== 'string') s.lastPost = '';    // 今日投稿済みか
  Object.keys(s.bench).forEach(k => {
    const e = s.bench[k];
    if (!e || typeof e !== 'object' || typeof e.score !== 'number' || !isFinite(e.score)) { delete s.bench[k]; return; }
    if (!e.metrics || typeof e.metrics !== 'object' || Array.isArray(e.metrics)) e.metrics = {};
    if (!e.scores || typeof e.scores !== 'object' || Array.isArray(e.scores)) e.scores = {};
  });
  Object.keys(s.checks).forEach(k => { if (!s.checks[k] || typeof s.checks[k] !== 'object' || Array.isArray(s.checks[k])) delete s.checks[k]; });
  Object.keys(s.challenges).forEach(k => {
    const e = s.challenges[k];
    if (!e || typeof e !== 'object' || typeof e.idx !== 'number' || typeof e.status !== 'string') delete s.challenges[k];
  });
  Object.keys(s.levels).forEach(k => { if (typeof s.levels[k] !== 'number' || !isFinite(s.levels[k])) delete s.levels[k]; });
  return s;
}
let state;
try {
  const raw = localStorage.getItem(STORE_KEY);
  const parsed = JSON.parse(raw);
  state = sanitizeState(parsed);
  if (raw !== null && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) localStorage.removeItem(STORE_KEY);
} catch (e) { state = sanitizeState(null); }

let coachBusy = false;
const KV = 'https://keyvalue.immanuel.co/api/KeyVal';
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDec = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); return decodeURIComponent(escape(atob(s + '='.repeat((4 - s.length % 4) % 4)))); };
const kvSet = (ak, k, v) => fetch(`${KV}/UpdateValue/${ak}/${encodeURIComponent(k)}/${b64u(JSON.stringify(v))}`, { method: 'POST' }).then(r => r.ok ? r.json() : Promise.reject());
const kvGet = async (ak, k) => {
  const r = await fetch(`${KV}/GetValue/${ak}/${encodeURIComponent(k)}`);
  const s = await r.json();
  try { return s ? JSON.parse(b64uDec(s)) : null; } catch (e) { return null; }
};
const famAk = code => 'noutore' + code;
const hexEnc = s => Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, '0')).join('');
const famMk = name => 'm' + hexEnc(name);

function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

function isActiveDay(k) {
  const c = state.checks[k];
  return (c && Object.values(c).some(Boolean)) || !!state.bench[k] ||
    (state.challenges[k] && state.challenges[k].status === 'done');
}

function activeDates() {
  const set = new Set();
  [...Object.keys(state.checks), ...Object.keys(state.bench), ...Object.keys(state.challenges)]
    .forEach(k => { if (isActiveDay(k)) set.add(k); });
  return [...set];
}

function currentStreak() {
  const set = new Set(activeDates());
  let n = 0;
  const d = new Date();
  if (!set.has(todayKey(d))) d.setDate(d.getDate() - 1);
  while (set.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function lastBench(beforeDate) {
  const keys = Object.keys(state.bench).filter(k => (!beforeDate || k < beforeDate) && state.bench[k] && typeof state.bench[k] === 'object' && typeof state.bench[k].score === 'number').sort();
  const k = keys[keys.length - 1];
  return k ? { date: k, ...state.bench[k] } : null;
}

function maxStreak() {
  let best = 0, cur = 0, prev = null;
  activeDates().sort().forEach(k => {
    cur = prev && daysBetween(prev, k) === 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
    prev = k;
  });
  return best;
}

const BADGES = [
  { icon: '🔥', label: '7日連続',      max: 7,   n: () => maxStreak() },
  { icon: '🏆', label: '30日連続',     max: 30,  n: () => maxStreak() },
  { icon: '👑', label: '100日連続',    max: 100, n: () => maxStreak() },
  { icon: '🧠', label: 'ベンチ5回',    max: 5,   n: () => Object.keys(state.bench).length },
  { icon: '🧠', label: 'ベンチ20回',   max: 20,  n: () => Object.keys(state.bench).length },
  { icon: '💡', label: 'チャレンジ10回', max: 10,  n: () => Object.values(state.challenges).filter(c => c.status === 'done').length },
  { icon: '🌿', label: '習慣50個',     max: 50,  n: () => Object.values(state.checks).reduce((n, c) => n + Object.values(c).filter(Boolean).length, 0) },
];
BADGES.forEach(b => { b.ok = () => b.n() >= b.max; });

/* ================= 画面ヘルパー ================= */
const app = $('#app');
let session = null;
let sessionTimers = [];
function addTimer(t) { sessionTimers.push(t); return t; }
function clearTimers() { sessionTimers.forEach(t => { clearInterval(t); clearTimeout(t); }); sessionTimers = []; }

function applyFont() {
  document.body.classList.toggle('bigtext', !!state.bigText);
  document.body.classList.toggle('dark', !!state.dark);
}

function render(node) {
  clearTimers();
  try { speechSynthesis.cancel(); } catch (e) {}
  app.innerHTML = '';
  app.appendChild(node);
  window.scrollTo(0, 0);
  applyFont();
}

function speakHtml(html) {
  const t = document.createElement('div'); t.innerHTML = html;
  const u = new SpeechSynthesisUtterance(t.textContent.replace(/\s+/g, ' ').trim());
  u.lang = 'ja-JP'; u.rate = .95;
  speechSynthesis.speak(u);
}

/* ================= ベンチマーク種目1: 二重注意 =================
   ACTIVE試験の速度訓練(中央課題+周辺標的の同時処理)を再現。
   表示時間を成績に応じて自動で変える階段法。 */
const DD_CENTERS = [['🚗', '乗用車'], ['🚚', 'トラック']];
const DD_POS = [ // 8方位(3x3の外周セル)。[x%, y%] がステージ内位置
  [16.6, 16.6], [50, 12], [83.3, 16.6],
  [12, 50], [88, 50],
  [16.6, 83.3], [50, 88], [83.3, 83.3],
];

function exDualAttention(container, finish) {
  const TRIALS = 10;
  let D = clamp((state.levels.dd_ms || 500) * 1.3, 300, 1200);
  let trial = 0;
  const trialDs = [];

  container.innerHTML = `
    <div class="instr"><b>何が出る:</b> 中央に車の絵が、同時に画面のまわりに ● が一瞬だけ出ます。<br><b>何をする:</b> 消えたあと「車の種類」と「●の場所」の2つを答えます。<br><span class="dim">(直後に出る ✳︎ などの印は残像を消す目隠しです)</span> 正解するほど速くなります。</div>
    <div class="dd-stage" id="ddstage"></div>
    <div class="dd-answer" id="ddanswer"></div>
    <div class="timer-label" id="ddcount"></div>`;
  const stage = $('#ddstage'), answer = $('#ddanswer'), count = $('#ddcount');

  function nextTrial() {
    if (trial >= TRIALS) {
      const thr = Math.round(trialDs.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, trialDs.length));
      state.levels.dd_ms = thr; save();
      const score = clamp((900 - thr) / 700, 0.1, 1);
      finish({ score, detail: `閾値 ${thr}ms`, metric: { key: 'dd_ms', value: thr } });
      return;
    }
    trial++;
    count.textContent = `試行 ${trial} / ${TRIALS}　表示 ${Math.round(D)}ms`;
    const [emoji, label] = DD_CENTERS[randInt(0, 1)];
    const posIdx = randInt(0, 7);

    answer.innerHTML = '';
    stage.innerHTML = `<div class="dd-fix">＋</div>`;
    addTimer(setTimeout(() => {
      stage.innerHTML = `
        <div class="dd-center">${emoji}</div>
        <div class="dd-dot" style="left:${DD_POS[posIdx][0]}%;top:${DD_POS[posIdx][1]}%"></div>`;
      addTimer(setTimeout(() => {
        stage.innerHTML = shuffle(['✳︎', '✕', '◆', '＊', '✦', '❖', '✱', '✧'])
          .slice(0, 5).map(s => `<span class="dd-mask" style="left:${randInt(10, 85)}%;top:${randInt(10, 85)}%">${s}</span>`).join('')
          + `<div class="dd-fix" style="opacity:.25">＋</div>`;
        addTimer(setTimeout(askCenter, 130));
      }, D));
    }, 450));

    let gotCenter = null, gotPos = null;
    function askCenter() {
      stage.innerHTML = '';
      answer.innerHTML = `<div class="question small"><span class="step-badge">①</span> 中央の車は どちらでしたか?</div>`;
      const g = el(`<div class="choice-grid two"></div>`);
      DD_CENTERS.forEach(([e, l]) => {
        const b = document.createElement('button');
        b.className = 'choice-btn';
        b.innerHTML = `<span style="font-size:40px">${e}</span><br><span style="font-size:17px">${l}</span>`;
        b.onclick = () => { gotCenter = (l === label); sndTap(); askPos(); };
        g.appendChild(b);
      });
      answer.appendChild(g);
    }
    function askPos() {
      answer.innerHTML = `<div class="question small"><span class="step-badge">②</span> ● は どこにありましたか?</div>`;
      const g = el(`<div class="pos-grid"></div>`);
      const cellMap = [0, 1, 2, 3, -1, 4, 5, 6, 7];
      for (let i = 0; i < 9; i++) {
        const c = document.createElement('button');
        c.className = 'pos-cell';
        if (cellMap[i] === -1) { c.disabled = true; c.innerHTML = '<span style="opacity:.3">＋</span>'; }
        else {
          const pi = cellMap[i];
          c.innerHTML = '<span style="opacity:.35">・</span>';
          c.onclick = () => { gotPos = (pi === posIdx); sndTap(); scoreTrial(); };
        }
        g.appendChild(c);
      }
      answer.appendChild(g);
    }
    function scoreTrial() {
      const ok = gotCenter && gotPos;
      trialDs.push(D);
      if (ok) D = Math.max(80, D * 0.85);
      else D = Math.min(1500, D + 80);
      addTimer(setTimeout(nextTrial, 250));
    }
  }
  nextTrial();
}

/* ================= 種目2: 高速計算 ================= */
function exRapidCalc(container, finish) {
  const SECS = 30;
  let left = SECS, correct = 0;
  container.innerHTML = `
    <div class="instr"><b>何をする:</b> 計算の答えを3つの中から選んでください。<br>制限時間は30秒。間違えてもすぐ次に進むので、<b>とにかく速く・多く</b>解きましょう。</div>
    <div class="bar-track"><div class="bar-fill" id="calcbar" style="width:100%"></div></div>
    <div class="calc-q" id="calcq"></div>
    <div class="choice-grid three" id="calcgrid"></div>
    <div class="timer-label" id="calchud">正解 0</div>`;
  const bar = $('#calcbar'), qEl = $('#calcq'), grid = $('#calcgrid'), hud = $('#calchud');

  function nextQ() {
    const add = Math.random() < 0.55;
    let a, b, ans, expr;
    if (add) { a = randInt(2, 9); b = randInt(2, 9); ans = a + b; expr = `${a} + ${b}`; }
    else { a = randInt(3, 9); b = randInt(1, a - 1); ans = a - b; expr = `${a} − ${b}`; }
    const cand = shuffle([ans + 1, ans - 1, ans + 2, ans - 2, ans + 3])
      .filter(w => w >= 0 && w !== ans).slice(0, 2);
    qEl.textContent = `${expr} = ?`;
    grid.innerHTML = '';
    shuffle([ans, ...cand]).forEach(v => {
      const b2 = document.createElement('button');
      b2.className = 'choice-btn slim';
      b2.textContent = v;
      b2.onclick = () => {
        if (v === ans) { correct++; sndTap(); qEl.style.color = 'var(--ok)'; }
        else { sndNG(); qEl.style.color = 'var(--ng)'; }
        hud.textContent = `正解 ${correct}`;
        setTimeout(() => { qEl.style.color = ''; }, 120);
        nextQ();
      };
      grid.appendChild(b2);
    });
  }
  nextQ();

  const t = setInterval(() => {
    left -= 0.2;
    bar.style.width = Math.max(0, left / SECS * 100) + '%';
    if (left <= 0) {
      clearInterval(t);
      sndDone();
      finish({ score: clamp(correct / 11, 0, 1), detail: `${correct}問 / 30秒`, metric: { key: 'calc_n', value: correct } });
    }
  }, 200);
  addTimer(t);
}

/* ================= 種目3: Nバック ================= */
function exNBack(container, finish) {
  const N_ITEMS = 14;
  let interval = state.levels.nb_ms || 2000;
  interval = clamp(interval, 1400, 2600);

  const seq = [];
  for (let i = 0; i < N_ITEMS; i++) {
    if (i < 2) seq.push(randInt(1, 9));
    else seq.push(Math.random() < 0.3 ? seq[i - 2] : (() => { let d; do { d = randInt(1, 9); } while (d === seq[i - 2]); return d; })());
  }

  let i = 0, hits = 0, scored = 0, responded = false;
  container.innerHTML = `
    <div class="instr"><b>何が出る:</b> 数字が1つずつ順番に出ます。<br><b>何をする:</b> 「いまの数字」が<b>2つ前の数字</b>と同じなら【同じ】、違えば【違う】。最初の2個は覚えるだけでOKです。</div>
    <div class="nb-display" id="nbd">―</div>
    <div class="choice-grid two">
      <button class="choice-btn" id="nbSame">同じ</button>
      <button class="choice-btn" id="nbDiff">違う</button>
    </div>
    <div class="timer-label" id="nbhud"></div>`;
  const disp = $('#nbd'), hud = $('#nbhud'), bS = $('#nbSame'), bD = $('#nbDiff');

  function step() {
    if (i >= N_ITEMS) {
      const acc = scored ? hits / scored : 0;
      state.levels.nb_ms = acc >= 0.9 ? Math.round(interval * 0.9) : acc < 0.7 ? Math.round(interval * 1.15) : interval;
      save();
      sndDone();
      finish({ score: acc, detail: `正答率 ${Math.round(acc * 100)}%`, metric: { key: 'nb_acc', value: Math.round(acc * 100) } });
      return;
    }
    const isMatch = i >= 2 && seq[i] === seq[i - 2];
    responded = false;
    disp.textContent = seq[i];
    disp.style.borderColor = 'var(--line)';
    hud.textContent = `${i + 1} / ${N_ITEMS}`;

    const mark = ok => {
      disp.style.borderColor = ok ? 'var(--ok)' : 'var(--ng)';
      ok ? sndTap() : sndNG();
    };
    const onRes = saidSame => {
      if (responded) return;
      responded = true;
      if (i >= 2) {
        scored++;
        if (saidSame === isMatch) { hits++; mark(true); } else mark(false);
      } else mark(true);
    };
    bS.onclick = () => onRes(true);
    bD.onclick = () => onRes(false);

    addTimer(setTimeout(() => {
      if (!responded && i >= 2) { scored++; if (!isMatch) { hits++; } else mark(false); }
      disp.textContent = '―';
    }, interval * 0.55));
    i++;
    addTimer(setTimeout(step, interval));
  }
  step();
}

/* ================= 種目4: デュアルタスク ================= */
function exDualTask(container, finish) {
  const SECS = 28;
  const TICK = 800;
  const target = session.dualTarget ?? randInt(2, 9);

  let digits = [], tcount = 0;
  for (let tries = 0; tries < 40; tries++) {
    digits = Array.from({ length: Math.floor(SECS * 1000 / TICK) }, () => randInt(2, 9));
    tcount = digits.filter(d => d === target).length;
    if (tcount >= 3 && tcount <= 8) break;
  }

  let left = SECS, idx = 0, starsSpawned = 0, starsHit = 0, doneFlag = false;
  container.innerHTML = `
    <div class="instr"><b>2つ同時にやります。</b>28秒間。<br>① 中央に数字が流れます。中に「<b>${target}</b>」が何回出たか、あとで答えます。<br>② その間、画面のどこかに ⭐ がポッと出ます。見つけたら<b>すぐタップ</b>。</div>
    <div class="dt-stage" id="dtstage"><div class="dt-digit" id="dtdigit">―</div></div>
    <div class="bar-track"><div class="bar-fill" id="dtbar" style="width:100%"></div></div>`;
  const stage = $('#dtstage'), digitEl = $('#dtdigit'), bar = $('#dtbar');

  const digitTick = setInterval(() => {
    left -= TICK / 1000;
    bar.style.width = Math.max(0, left / SECS * 100) + '%';
    if (idx < digits.length) { digitEl.textContent = digits[idx]; idx++; }
    if (left <= 0 || idx >= digits.length) endPhase();
  }, TICK);
  addTimer(digitTick);

  const starTick = setInterval(() => {
    if (doneFlag || starsSpawned >= 6) return;
    starsSpawned++;
    const s = document.createElement('button');
    s.className = 'dt-star';
    s.textContent = '⭐';
    s.style.left = randInt(2, 78) + '%';
    s.style.top = randInt(4, 80) + '%';
    s.onclick = () => { starsHit++; sndTap(); s.remove(); };
    stage.appendChild(s);
    addTimer(setTimeout(() => { s.remove(); }, 1100));
  }, 4300);
  addTimer(starTick);

  function endPhase() {
    if (doneFlag) return;
    doneFlag = true;
    clearInterval(digitTick); clearInterval(starTick);
    stage.querySelectorAll('.dt-star').forEach(s => s.remove());
    digitEl.textContent = '―';
    const opts = [];
    for (let off = -2; off <= 2; off++) if (tcount + off >= 0) opts.push(tcount + off);
    while (opts.length < 4) opts.push(opts[opts.length - 1] + 1);
    container.innerHTML = `
      <div class="question">「${target}」は 何回 出ましたか?</div>
      <div class="choice-grid" id="dtg"></div>
      <div class="judge" id="dtj"></div>`;
    const g = $('#dtg');
    shuffle(opts.slice(0, 4)).forEach(v => {
      const b = document.createElement('button');
      b.className = 'choice-btn slim';
      b.textContent = v + '回';
      b.onclick = () => {
        const diff = Math.abs(v - tcount);
        const countScore = diff === 0 ? 1 : diff === 1 ? 0.5 : 0;
        const starScore = starsSpawned ? starsHit / starsSpawned : 1;
        const score = clamp(countScore * 0.6 + starScore * 0.4, 0, 1);
        $('#dtj').className = 'judge ' + (countScore === 1 ? 'ok' : 'ng');
        $('#dtj').textContent = `正解は ${tcount}回 / ⭐ ${starsHit}/${starsSpawned}`;
        sndDone();
        setTimeout(() => finish({
          score,
          detail: `数え${diff === 0 ? '正解' : '誤差' + diff}・⭐${starsHit}/${starsSpawned}`,
          metric: { key: 'dual', value: Math.round(score * 100) }
        }), 1600);
      };
      g.appendChild(b);
    });
  }
}

/* ================= 種目5: ストループ(45秒) ================= */
const COLORS = [
  { name: 'あか', css: '#d23c3c' },
  { name: 'あお', css: '#2b6fd4' },
  { name: 'きいろ', css: '#c99200' },
  { name: 'みどり', css: '#2e9e63' },
];

function exStroopTimed(container, finish) {
  const SECS = 30;
  let left = SECS, correct = 0;
  container.innerHTML = `
    <div class="instr"><b>何をする:</b> <b>文字の意味ではなく、文字の「色」</b>を押してください。30秒間。<br>例:「あお」の文字が<span style="color:#d23c3c">赤色</span>なら →【あか】を押します。</div>
    <div class="bar-track"><div class="bar-fill" id="stbar" style="width:100%"></div></div>
    <div class="stroop-word" id="stw"></div>
    <div class="color-grid" id="stg"></div>
    <div class="timer-label" id="sthud">正解 0</div>`;
  const bar = $('#stbar'), w = $('#stw'), g = $('#stg'), hud = $('#sthud');

  let ink = null;
  function nextQ() {
    const word = COLORS[randInt(0, 3)];
    ink = Math.random() < 0.25 ? word : COLORS.filter(c => c !== word)[randInt(0, 2)];
    w.textContent = word.name;
    w.style.color = ink.css;
  }
  COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'color-btn';
    b.style.background = c.css;
    b.textContent = c.name;
    b.onclick = () => {
      if (c === ink) { correct++; sndTap(); hud.textContent = `正解 ${correct}`; nextQ(); }
      else { sndNG(); w.style.transform = 'scale(.94)'; setTimeout(() => w.style.transform = '', 150); }
    };
    g.appendChild(b);
  });
  nextQ();

  const t = setInterval(() => {
    left -= 0.2;
    bar.style.width = Math.max(0, left / SECS * 100) + '%';
    if (left <= 0) {
      clearInterval(t);
      sndDone();
      finish({ score: clamp(correct / 11, 0, 1), detail: `${correct}問 / 30秒`, metric: { key: 'stroop_n', value: correct } });
    }
  }, 200);
  addTimer(t);
}

/* ================= 種目6: 音声流暢性(60秒) =================
   「動物の名前をできるだけ多く挙げる」— MCIスクリーニングで使われる
   意味流暢性検査。音声認識で自動カウント(非対応端末は入力モード)。 */
const ANIMAL_PAIRS = [
  // 1配列=1動物。先頭が表示名、残りは読み仮名・別表記
  ['犬','いぬ'], ['猫','ねこ'], ['牛','うし'], ['馬','うま'], ['豚','ぶた'], ['羊','ひつじ'],
  ['山羊','やぎ'], ['鶏','にわとり'], ['アヒル','あひる'], ['兎','うさぎ'], ['鼠','ねずみ'],
  ['ハムスター'], ['モルモット'], ['リス','りす'], ['ハリネズミ'], ['フェレット'],
  ['虎','とら'], ['ライオン','獅子','しし'], ['豹','ひょう'], ['チーター'], ['ジャガー'], ['ピューマ'],
  ['象','ぞう'], ['キリン','きりん','麒麟'], ['カバ','かば','河馬'], ['サイ','さい','犀'],
  ['シマウマ'], ['ラクダ','らくだ','駱駝'], ['ロバ','ろば'], ['ラマ'], ['アルパカ'],
  ['熊','くま'], ['パンダ'], ['コアラ'], ['カンガルー'], ['ワラビー'],
  ['ペンギン'], ['ダチョウ','だちょう','駝鳥'], ['エミュー'],
  ['猿','さる'], ['チンパンジー'], ['ゴリラ'], ['オランウータン'], ['テナガザル'], ['キツネザル'], ['ヒヒ','ひひ','狒狒'],
  ['狼','おおかみ','オオカミ'], ['狐','きつね'], ['狸','たぬき'], ['コヨーテ'], ['ハイエナ'], ['フェネック'], ['ミーアキャット'],
  ['鹿','しか'], ['トナカイ'], ['ヘラジカ'], ['カモシカ','かもしか','鴨鹿'],
  ['アンテロープ'], ['ガゼル'], ['インパラ'], ['バク','ばく','獏'],
  ['アリクイ','ありくい','食蟻獣'], ['ナマケモノ'], ['アルマジロ'], ['ハリモグラ'],
  ['イルカ','いるか','海豚'], ['クジラ','くじら','鯨'], ['シャチ','しゃち'],
  ['アザラシ','あざらし','海豹'], ['アシカ','あしか','海驢'], ['セイウチ'], ['ジュゴン'], ['マナティー'],
  ['ラッコ'], ['カワウソ','かわうそ','獺'], ['ビーバー'], ['プレーリードッグ'],
  ['サメ','さめ','鮫'], ['エイ','えい'], ['マグロ','まぐろ','鮪'], ['タイ','たい','鯛'],
  ['サケ','さけ','鮭'], ['ウナギ','うなぎ','鰻'], ['フグ','ふぐ','河豚'],
  ['金魚','きんぎょ'], ['メダカ','めだか','目高'], ['グッピー'], ['コイ','こい','鯉'],
  ['カメ','かめ','亀'], ['ワニ','わに','鰐'], ['ヘビ','へび','蛇'],
  ['トカゲ','とかげ','蜥蜴'], ['イグアナ'], ['カメレオン'], ['ヤモリ','やもり','守宮'],
  ['カエル','かえる','蛙'], ['イモリ','いもり','井守'], ['サンショウウオ'],
  ['タコ','たこ','蛸'], ['イカ','いか','烏賊'], ['クラゲ','くらげ','海月'],
  ['ヒトデ','ひとで','海星'], ['ウニ','うに','海胆'], ['カニ','かに','蟹'],
  ['エビ','えび','海老'], ['伊勢海老','いせえび'], ['ロブスター'], ['ヤドカリ'],
  ['貝','かい'], ['アサリ','あさり','浅蜊'], ['シジミ','しじみ','蜆'], ['ホタテ','ほたて','帆立'],
  ['カキ','かき','牡蠣'], ['アワビ','あわび','鮑'], ['サザエ','さざえ','栄螺'],
  ['ハマグリ','はまぐり','蛤'], ['ナマコ','なまこ','海鼠'],
  ['チョウ','ちょう','蝶'], ['トンボ','とんぼ','蜻蛉'], ['セミ','せみ','蝉'],
  ['ハチ','はち','蜂'], ['スズメバチ','すずめばち','雀蜂'], ['ミツバチ','みつばち','蜜蜂'],
  ['アリ','あり','蟻'], ['カブトムシ','かぶとむし','甲虫'], ['クワガタ','くわがた','鍬形'],
  ['テントウムシ','てんとうむし','瓢虫'], ['ホタル','ほたる','蛍'], ['バッタ','ばった','飛蝗'],
  ['カマキリ','かまきり','蟷螂'], ['コオロギ','こおろぎ','蟋蟀'], ['キリギリス'],
  ['クモ','くも','蜘蛛'], ['ムカデ','むかで','百足'], ['ダンゴムシ','だんごむし','団子虫'],
  ['ミミズ','みみず','蚯蚓'], ['カタツムリ','かたつむり','蝸牛'],
  ['スズメ','すずめ','雀'], ['カラス','からす','烏'], ['ハト','はと','鳩'],
  ['フクロウ','ふくろう','梟'], ['ワシ','わし','鷲'], ['タカ','たか','鷹'],
  ['ツル','つる','鶴'], ['サギ','さぎ','鷺','白鷺','しらさぎ'], ['カモ','かも','鴨'],
  ['ハクチョウ','はくちょう','白鳥'], ['フラミンゴ'], ['オウム','おうむ','鸚鵡'],
  ['インコ'], ['セキセイインコ'], ['オカメインコ'], ['文鳥','ぶんちょう'],
  ['メジロ','めじろ','目白'], ['ウグイス','うぐいす','鶯'], ['ツバメ','つばめ','燕'],
  ['キジ','きじ','雉'], ['クジャク','くじゃく','孔雀'], ['コンドル'],
  ['ペリカン'], ['カモメ','かもめ','鴎'], ['オカピ'], ['ヌー','ぬー'],
  ['バイソン'], ['バッファロー'], ['ヤク','やく'], ['ジャッカル'],
];
const FORM2CANON = new Map();
ANIMAL_PAIRS.forEach(pair => pair.forEach(f =>
  FORM2CANON.set(f.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)), pair[0])));
const ANIMAL_RX = new RegExp('(' + [...FORM2CANON.keys()].sort((a, b) => b.length - a.length)
  .map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
function normJp(s) { return s.toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)); }

function exVerbalFluency(container, finish) {
  const SECS = 30;
  let left = SECS;
  const found = new Set();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;

  container.innerHTML = `
    <div class="instr"><b>何をする:</b> 30秒間、<b>動物の名前を思いつくだけ多く</b>挙げてください(例: いぬ・ねこ・ぞう)。<br>${SR ? 'マイクに向かって順番に話してください。' : '入力欄に入れて「追加」を押してください。'}</div>
    <div class="bar-track"><div class="bar-fill" id="vfbar" style="width:100%"></div></div>
    <div class="vf-hud"><span id="vfrec" class="vf-rec">${SR ? '🎤 待機中' : '⌨️ 入力モード'}</span><span class="vf-count" id="vfcount">0語</span></div>
    <div class="vf-words" id="vfwords"></div>
    ${SR ? '<div class="vf-live" id="vflive"></div>' : `
      <div class="row-flex" style="margin-top:10px">
        <input class="vf-input" id="vfinput" placeholder="例: いぬ" autocomplete="off">
        <button class="mini-btn" id="vfadd">追加</button>
      </div>`}
    <button class="btn ghost" id="vfend" style="margin-top:14px">終了する</button>`;
  const bar = $('#vfbar'), wordsEl = $('#vfwords'), countEl = $('#vfcount'), recEl = $('#vfrec'), liveEl = $('#vflive');

  function scanText(text) {
    const n = normJp(text);
    for (const m of n.matchAll(ANIMAL_RX)) {
      const c = FORM2CANON.get(m[1]);
      if (!found.has(c)) {
        found.add(c);
        const chip = document.createElement('span');
        chip.className = 'vf-chip';
        chip.textContent = c;
        wordsEl.appendChild(chip);
        countEl.textContent = `${found.size}語`;
        sndTap();
      }
    }
  }

  if (SR) {
    rec = new SR();
    rec.lang = 'ja-JP'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) scanText(e.results[i][0].transcript);
        else interim += e.results[i][0].transcript;
      }
      if (liveEl) liveEl.textContent = interim;
    };
    rec.onstart = () => { listening = true; recEl.textContent = '🔴 聞き取り中'; };
    rec.onend = () => { listening = false; if (left > 0) { try { rec.start(); } catch (e) {} recEl.textContent = '🎤 話してください'; } };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        recEl.textContent = '🎤 マイクの許可がありません — 入力欄を使ってください';
        if (!$('#vfinput')) {
          const row = el(`<div class="row-flex" style="margin-top:10px">
            <input class="vf-input" id="vfinput" placeholder="例: いぬ" autocomplete="off">
            <button class="mini-btn" id="vfadd">追加</button></div>`);
          container.insertBefore(row, $('#vfend'));
          bindInput(row);
        }
        try { rec.stop(); } catch (x) {}
      }
    };
    try { rec.start(); } catch (e) {}
  }

  function bindInput(scope) {
    const inp = $('#vfinput', scope || container), btn = $('#vfadd', scope || container);
    const add = () => { if (inp.value.trim()) { scanText(inp.value); inp.value = ''; inp.focus(); } };
    btn.onclick = add;
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  }
  if ($('#vfinput')) bindInput(container);

  const done = () => {
    if (rec) try { rec.onend = null; rec.stop(); } catch (e) {}
    clearInterval(t);
    sndDone();
    const n = found.size;
    finish({ score: clamp(n / 8, 0.05, 1), detail: `${n}語 / 30秒`, metric: { key: 'vf_n', value: n } });
  };
  $('#vfend').onclick = done;

  const t = setInterval(() => {
    left -= 0.2;
    bar.style.width = Math.max(0, left / SECS * 100) + '%';
    if (left <= 0) done();
  }, 200);
  addTimer(t);
}

/* ================= 種目7: モンキーテスト =================
   京大チンパンジ「アユム」の課題の再現: 数字が一瞬表示→隠れたあと
   小さい順にタップする視空間ワーキングメモリ検査。個数と速度が適応。 */
function exMonkey(container, finish) {
  const TRIALS = 4, CELLS = 20;
  let trial = 0, count = 3, showMs = 1800, best = 0;
  container.innerHTML = `
    <div class="instr"><b>何が出る:</b> 数字のついたマスが一瞬だけ出て、すぐ全部隠れます。<br><b>何をする:</b> 隠れたあと、<b>1 → 2 → 3…の順に</b>その場所をタップ。成功するほど個数が増え、表示が速くなります。</div>
    <div class="mk-grid" id="mkg"></div>
    <div class="timer-label" id="mkhud"></div>`;
  const g = $('#mkg'), hud = $('#mkhud');

  function nextTrial() {
    if (trial >= TRIALS) {
      sndDone();
      finish({ score: clamp(best / 6, 0, 1), detail: `最大 ${best}個まで記憶`, metric: { key: 'mk_n', value: best } });
      return;
    }
    trial++;
    hud.textContent = `試行 ${trial} / ${TRIALS}　数字 ${count}個・よく見てください`;
    const pos = shuffle(Array.from({ length: CELLS }, (_, i) => i)).slice(0, count);
    const numAt = {};
    pos.forEach((c, i) => numAt[c] = i + 1);
    let masked = false, expected = 1;
    g.innerHTML = '';
    for (let i = 0; i < CELLS; i++) {
      const b = document.createElement('button');
      b.className = 'mk-cell';
      if (numAt[i]) { b.textContent = numAt[i]; b.dataset.n = numAt[i]; }
      g.appendChild(b);
    }
    addTimer(setTimeout(() => {
      masked = true;
      hud.innerHTML = `試行 ${trial} / ${TRIALS}　<b>1 から順にタップ</b>`;
      [...g.children].forEach(c => { c.textContent = ''; });
    }, showMs));

    g.onclick = e => {
      const b = e.target.closest('.mk-cell');
      if (!masked || !b || b.classList.contains('mk-hit')) return;
      const n = +b.dataset.n;
      if (n === expected) {
        sndTap();
        b.classList.add('mk-hit');
        b.textContent = n;
        expected++;
        if (expected > count) {
          best = Math.max(best, count);
          count = Math.min(8, count + 1);
          showMs = Math.max(700, showMs - 250);
          g.onclick = null;
          addTimer(setTimeout(nextTrial, 700));
        }
      } else {
        sndNG();
        g.onclick = null;
        [...g.children].forEach(c => { if (c.dataset.n) { c.textContent = c.dataset.n; c.classList.add('mk-reveal'); } });
        count = Math.max(3, count - 1);
        showMs = Math.min(2600, showMs + 300);
        addTimer(setTimeout(nextTrial, 1300));
      }
    };
  }
  nextTrial();
}

/* ================= 種目8: 視覚探索 ================= */
function exVisualSearch(container, finish) {
  const SECS = 30, COLS = 4, ROWS = 4;
  const TARGET = '🍎', DISTRACT = '🍏', NTGT = 3;
  let left = SECS, rounds = 0, found = 0, ticking = false;
  container.innerHTML = `
    <div class="instr"><b>何をする:</b> 🍏 の中にまぎれた <b>🍎 を3つ全部</b>タップしてください。見つけると次の面に進みます。30秒で何面進めるかを測ります。</div>
    <div class="bar-track"><div class="bar-fill" id="vsbar" style="width:100%"></div></div>
    <div class="mk-grid" id="vsg"></div>
    <div class="timer-label" id="vshud">クリア 0面</div>`;
  const g = $('#vsg'), hud = $('#vshud'), bar = $('#vsbar');
  let tgtSet = new Set();
  function nextRound() {
    rounds++;
    found = 0;
    tgtSet = new Set(shuffle(Array.from({ length: COLS * ROWS }, (_, i) => i)).slice(0, NTGT));
    g.innerHTML = '';
    for (let i = 0; i < COLS * ROWS; i++) {
      const b = document.createElement('button');
      b.className = 'mk-cell vs-cell';
      b.textContent = tgtSet.has(i) ? TARGET : DISTRACT;
      b.dataset.i = i;
      g.appendChild(b);
    }
    hud.textContent = `クリア ${rounds - 1}面　残り3つ`;
  }
  g.onclick = e => {
    const b = e.target.closest('.mk-cell');
    if (!b || b.classList.contains('mk-hit')) return;
    if (tgtSet.has(+b.dataset.i)) {
      sndTap(); b.classList.add('mk-hit'); found++;
      hud.textContent = `クリア ${rounds - 1}面　残り${NTGT - found}つ`;
      if (found >= NTGT) nextRound();
    } else { sndNG(); b.classList.add('vs-miss'); setTimeout(() => b.classList.remove('vs-miss'), 250); }
  };
  nextRound();
  const tick = setInterval(() => {
    left--; bar.style.width = (left / SECS * 100) + '%';
    if (left <= 0) {
      clearInterval(tick); g.onclick = null; sndDone();
      finish({ score: clamp(rounds / 8, 0, 1), detail: `${rounds}面クリア`, metric: { key: 'vs_n', value: rounds } });
    }
  }, 1000);
}

/* ================= 種目9: 数字の逆唱 ================= */
function exDigitSpan(container, finish) {
  const TRIALS = 4;
  let trial = 0, span = 3, best = 0, seq = [], typed = [];
  container.innerHTML = `
    <div class="instr"><b>何が出る:</b> 数字が1つずつ順番に出ます。<br><b>何をする:</b> 出終わったら、<b>逆の順番</b>で数字キーで入力します。例: 3・7・2 と出たら「2・7・3」</div>
    <div class="nb-display" id="dsd">―</div>
    <div class="timer-label" id="dshud"></div>`;
  const d = $('#dsd'), hud = $('#dshud');
  function showSeq() {
    typed = [];
    seq = Array.from({ length: span }, () => randInt(0, 9));
    hud.textContent = `試行 ${trial + 1} / ${TRIALS}　${span}個・よく見てください`;
    d.textContent = '・・・';
    let i = 0;
    const iv = setInterval(() => {
      d.textContent = seq[i]; i++;
      if (i >= seq.length) { clearInterval(iv); addTimer(setTimeout(ask, 500)); }
    }, 900);
  }
  function ask() {
    hud.textContent = '逆の順番で入力してください';
    d.textContent = '▢'.repeat(span);
    const pad = el(`<div class="ds-pad"></div>`);
    [...'1234567890'].forEach(n => {
      const b = document.createElement('button');
      b.className = 'mk-cell vs-cell ds-key';
      b.textContent = n;
      b.onclick = () => {
        if (typed.length >= span) return;
        typed.push(+n); sndTap();
        d.textContent = typed.map(() => '●').join('') + '▢'.repeat(span - typed.length);
        if (typed.length === span) addTimer(setTimeout(judge, 350));
      };
      pad.appendChild(b);
    });
    const del = document.createElement('button');
    del.className = 'mk-cell vs-cell ds-key'; del.textContent = '←';
    del.onclick = () => { if (typed.length) { typed.pop(); d.textContent = typed.map(() => '●').join('') + '▢'.repeat(span - typed.length); } };
    pad.appendChild(del);
    container.appendChild(pad);
  }
  function judge() {
    container.querySelector('.ds-pad')?.remove();
    const ok = typed.every((v, i) => v === seq[span - 1 - i]);
    if (ok) { sndOK(); best = Math.max(best, span); span = Math.min(8, span + 1); hud.textContent = '正解! 桁数が増えます'; }
    else { sndNG(); span = Math.max(3, span - 1); d.textContent = `正解: ${[...seq].reverse().join('')}`; hud.textContent = `不正解 — 出た数字は ${seq.join('')}`; }
    trial++;
    if (trial >= TRIALS) addTimer(setTimeout(() => { sndDone(); finish({ score: clamp(best / 7, 0, 1), detail: `最大 ${best}桁`, metric: { key: 'ds_n', value: best } }); }, 1400));
    else addTimer(setTimeout(showSeq, 1400));
  }
  showSeq();
}

/* ================= 種目10: 単語再認 ================= */
const WR_WORDS = ['りんご','電車','花瓶','手紙','時計','新聞','机','眼鏡','傘','切手','鉛筆','財布','映画','カメラ','地図','郵便','犬','桜','電話','帽子','新幹線','鏡','椅子','信号','雑誌','鞄','自転車','洗濯','台所','薬'];
function exWordRecog(container, finish) {
  const SHOW_MS = 5000, N = 6;
  const study = shuffle([...WR_WORDS]).slice(0, N);
  const foil = shuffle(WR_WORDS.filter(w => !study.includes(w))).slice(0, N);
  container.innerHTML = `
    <div class="instr"><b>何が出る:</b> 6つの言葉が5秒間出ます。<br><b>何をする:</b> あとで12個の中から<b>さっき出た6つだけ</b>を選んでください。</div>
    <div class="wr-study" id="wrbox"></div>
    <div class="timer-label" id="wrhud">よく見てください</div>`;
  $('#wrbox').innerHTML = study.map(w => `<span class="wr-word">${w}</span>`).join('');
  const hud = $('#wrhud');
  addTimer(setTimeout(ask, SHOW_MS));
  function ask() {
    hud.textContent = 'さっき出た言葉を6つ選んでください';
    $('#wrbox').innerHTML = '';
    const grid = el(`<div class="mk-grid wr-grid"></div>`);
    const chosen = new Set();
    const all = shuffle([...study, ...foil]);
    all.forEach(w => {
      const b = document.createElement('button');
      b.className = 'mk-cell vs-cell wr-cell';
      b.textContent = w;
      b.onclick = () => {
        sndTap();
        if (chosen.has(w)) { chosen.delete(w); b.classList.remove('mk-hit'); }
        else { chosen.add(w); b.classList.add('mk-hit'); }
        done.disabled = chosen.size !== N;
      };
      grid.appendChild(b);
    });
    container.appendChild(grid);
    const done = el(`<button class="btn" id="wrdone" disabled style="opacity:.5">これでOK</button>`);
    done.onclick = () => {
      const hits = study.filter(w => chosen.has(w)).length;
      const misses = chosen.size - hits;
      const net = Math.max(0, hits - misses);
      sndDone();
      finish({ score: clamp(net / N, 0, 1), detail: `正解 ${hits} / 6(誤選択 ${misses})`, metric: { key: 'wr_n', value: net } });
    };
    container.appendChild(done);
    const upd = () => { done.disabled = chosen.size !== N; done.style.opacity = chosen.size === N ? '1' : '.5'; };
    grid.addEventListener('click', () => setTimeout(upd, 0));
  }
}

/* ================= ベンチマーク種目11: 交互タップ(Trail Making B風) =================
   1→あ→2→い…と数字・かなを交互にたどる課題。セット切替と処理速度。 */
function exTrailMaking(container, finish) {
  const SECS = 30;
  const KANA = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'こ'];
  const SEQ = [];
  for (let i = 0; i < 8; i++) { SEQ.push(String(i + 1)); SEQ.push(KANA[i]); }
  let left = SECS, cleared = 0, errors = 0, need = 0;
  container.innerHTML = `
    <div class="instr"><b>何をする:</b> <b>1 → あ → 2 → い → 3 → う…</b>の順に、数字とひらがなを<b>交互に</b>タップしてください。終わると次の面。30秒で何面クリアできるかを測ります。</div>
    <div class="bar-track"><div class="bar-fill" id="tmtbar" style="width:100%"></div></div>
    <div class="mk-grid" id="tmtg"></div>
    <div class="timer-label" id="tmthud"></div>`;
  const g = $('#tmtg'), hud = $('#tmthud'), bar = $('#tmtbar');
  function nextBoard() {
    need = 0;
    g.innerHTML = '';
    shuffle(SEQ.slice()).forEach(ch => {
      const b = document.createElement('button');
      b.className = 'mk-cell vs-cell';
      b.textContent = ch;
      g.appendChild(b);
    });
    hud.textContent = `クリア ${cleared}面　次は 【${SEQ[0]}】`;
  }
  g.onclick = e => {
    const b = e.target.closest('.mk-cell');
    if (!b || b.disabled) return;
    if (b.textContent === SEQ[need]) {
      sndTap(); b.classList.add('mk-hit'); b.disabled = true; need++;
      if (need >= SEQ.length) { cleared++; nextBoard(); return; }
      hud.textContent = `クリア ${cleared}面　次は 【${SEQ[need]}】`;
    } else { errors++; sndNG(); b.classList.add('vs-miss'); setTimeout(() => b.classList.remove('vs-miss'), 250); }
  };
  nextBoard();
  const tick = setInterval(() => {
    left--; bar.style.width = (left / SECS * 100) + '%';
    if (left <= 0) {
      clearInterval(tick); g.onclick = null; sndDone();
      finish({ score: clamp(cleared / 3, 0, 1), detail: `${cleared}面クリア(誤タップ ${errors})`, metric: { key: 'tmt_n', value: cleared } });
    }
  }, 1000);
}

/* ================= ベンチマーク種目12: 数字記号変換 =================
   WAIS系検査の数字-記号対応課題。対応表を引きながら速く正確に変換する。 */
function exSymbolMatch(container, finish) {
  const SECS = 30;
  const SYMS = ['●', '▲', '■', '★', '◆', '♥', '♦', '♣', '○'];
  const map = shuffle(SYMS.slice()); // map[i] = 数字 i+1 に対応する記号
  let left = SECS, correct = 0, wrong = 0, cur = 1;
  container.innerHTML = `
    <div class="instr"><b>何をする:</b> 上の表は<b>数字と記号の対応表</b>です。中央に出た<b>数字に対応する記号</b>を下から押してください。表は何度見返してもOK。30秒で何問正解できるかを測ります。</div>
    <div class="bar-track"><div class="bar-fill" id="symbar" style="width:100%"></div></div>
    <div class="sym-key">${map.map((s, i) => `<div class="sym-pair"><b>${i + 1}</b><span>${s}</span></div>`).join('')}</div>
    <div class="sym-q" id="symq"></div>
    <div class="ds-pad" id="syma"></div>
    <div class="timer-label" id="symhud">正解 0</div>`;
  const q = $('#symq'), ans = $('#syma'), hud = $('#symhud'), bar = $('#symbar');
  SYMS.forEach(s => {
    const b = document.createElement('button');
    b.className = 'choice-btn ds-key';
    b.textContent = s;
    b.onclick = () => {
      if (s === map[cur - 1]) { correct++; sndTap(); hud.textContent = `正解 ${correct}`; nextQ(); }
      else { wrong++; sndNG(); b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 200); }
    };
    ans.appendChild(b);
  });
  function nextQ() { cur = randInt(1, 9); q.textContent = cur; }
  nextQ();
  const tick = setInterval(() => {
    left--; bar.style.width = (left / SECS * 100) + '%';
    if (left <= 0) {
      clearInterval(tick); sndDone();
      finish({ score: clamp(correct / 15, 0, 1), detail: `正解 ${correct}問(誤答 ${wrong})`, metric: { key: 'sym_n', value: correct } });
    }
  }, 1000);
}

/* ================= ベンチマーク種目13: しりとり =================
   前の言葉の最後の文字から始まる言葉を繋げる。語彙の検索力+ひらめき。 */
function exShiritori(container, finish) {
  const SECS = 30;
  const STARTS = ['りんご', 'しか', 'とまと', 'すもも', 'くるま', 'えんぴつ', 'ねこ', 'ふね', 'ほし'];
  const SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ' };
  let left = SECS;
  const used = new Set();
  let cur = STARTS[randInt(0, STARTS.length - 1)];
  used.add(cur);
  const lastKana = w => {
    let c = w[w.length - 1];
    if (c === 'ー' && w.length > 1) c = w[w.length - 2];
    return SMALL[c] || c;
  };
  container.innerHTML = `
    <div class="instr"><b>何をする:</b> 前の言葉の<b>最後の文字から始まる言葉</b>を入力して、30秒間どんどん繋げてください。<br>例: りんご → ごりら → らくだ。「ん」で終わる言葉と、同じ言葉は使えません。</div>
    <div class="bar-track"><div class="bar-fill" id="stbar" style="width:100%"></div></div>
    <div class="vf-hud"><span class="vf-rec" id="stneed"></span><span class="vf-count" id="stcount">0語</span></div>
    <div class="vf-words" id="stwords"><span class="vf-chip st-start">${cur}</span></div>
    <div class="row-flex" style="margin-top:10px">
      <input class="vf-input" id="stinput" placeholder="ひらがなで入力" autocomplete="off" enterkeyhint="go">
      <button class="mini-btn" id="stadd">追加</button>
    </div>
    <div class="timer-label" id="stmsg"></div>
    <button class="btn ghost" id="stend" style="margin-top:14px">終了する</button>`;
  const bar = $('#stbar'), wordsEl = $('#stwords'), countEl = $('#stcount'),
        needEl = $('#stneed'), inp = $('#stinput'), msg = $('#stmsg');
  let need = lastKana(cur);
  const showNeed = () => { needEl.textContent = `「${need}」から始まる言葉`; };
  showNeed();
  setTimeout(() => { try { inp.focus(); } catch (e) {} }, 50);

  const add = () => {
    const w = normJp(inp.value.trim().replace(/\s+/g, ''));
    if (!w) return;
    inp.value = '';
    if (!/^[ぁ-んー]+$/.test(w)) { msg.textContent = 'ひらがな・カタカナだけで入力してください'; sndNG(); return; }
    if (w.length < 2) { msg.textContent = '2文字以上の言葉にしてください'; sndNG(); return; }
    if ((SMALL[w[0]] || w[0]) !== need) { msg.textContent = `「${need}」から始まる言葉にしてください`; sndNG(); return; }
    if (used.has(w)) { msg.textContent = 'その言葉はもう出ています'; sndNG(); return; }
    if (w.endsWith('ん')) { msg.textContent = '「ん」で終わる言葉は使えません'; sndNG(); return; }
    used.add(w); cur = w; need = lastKana(w); showNeed();
    msg.textContent = '';
    const chip = document.createElement('span');
    chip.className = 'vf-chip'; chip.textContent = w;
    wordsEl.appendChild(chip);
    countEl.textContent = `${used.size - 1}語`;
    sndTap();
    inp.focus();
  };
  $('#stadd').onclick = add;
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };

  const done = () => {
    clearInterval(t);
    sndDone();
    const n = used.size - 1;
    finish({ score: clamp(n / 10, 0, 1), detail: `${n}語繋がった / 30秒`, metric: { key: 'st_n', value: n } });
  };
  $('#stend').onclick = done;
  const t = setInterval(() => {
    left -= 0.2;
    bar.style.width = Math.max(0, left / SECS * 100) + '%';
    if (left <= 0) done();
  }, 200);
  addTimer(t);
}

/* ================= ベンチマーク種目14: お届けルート =================
   出発点から全配送先を最短で回る順番を立てる計画課題(遂行機能)。
   正解は全通り(5!=120通り)を総当たりした最適巡回との効率比。 */
function exPlanRoute(container, finish) {
  const TRIALS = 3, G = 5;
  let trial = 0, home = 0, pins = [], order = [];
  const effs = [];
  const dist = (a, b) => Math.abs(a % G - b % G) + Math.abs(Math.floor(a / G) - Math.floor(b / G));
  container.innerHTML = `
    <div class="instr"><b>何をする:</b> あなたは宅配のドライバーです。🏠を出て📦を<b>全部</b>届けます。<b>移動が一番短くなる順番</b>を考えて、回る順に📦をタップしてください(全部で3盤)。<br>押す前に頭の中でルートを決めるのがコツです。</div>
    <div class="pl-grid" id="plg"></div>
    <div class="timer-label" id="plhud"></div>`;
  const g = $('#plg'), hud = $('#plhud');

  function optDist() {
    let best = Infinity;
    const p = pins.slice();
    (function perm(arr, l) {
      if (l === arr.length) {
        let d = dist(home, arr[0]);
        for (let i = 1; i < arr.length; i++) d += dist(arr[i - 1], arr[i]);
        if (d < best) best = d;
        return;
      }
      for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
    })(p, 0);
    return best;
  }

  function nextBoard() {
    order = [];
    const cells = shuffle([...Array(G * G).keys()]);
    home = cells[0]; pins = cells.slice(1, 6);
    g.innerHTML = '';
    for (let i = 0; i < G * G; i++) {
      const b = document.createElement('button');
      b.className = 'mk-cell pl-cell'; b.dataset.i = i;
      if (i === home) { b.textContent = '🏠'; b.disabled = true; b.classList.add('pl-home'); }
      else if (pins.includes(i)) b.textContent = '📦';
      g.appendChild(b);
    }
    hud.textContent = `盤面 ${trial + 1}/${TRIALS} — 回る順に📦をタップ`;
  }

  g.onclick = e => {
    const b = e.target.closest('.pl-cell');
    if (!b || b.disabled) return;
    const i = +b.dataset.i;
    if (!pins.includes(i)) return;
    order.push(i); sndTap();
    b.textContent = order.length;
    b.classList.add('pl-done');
    b.disabled = true;
    if (order.length === pins.length) {
      const tour = [home, ...order];
      let d = 0;
      for (let j = 1; j < tour.length; j++) d += dist(tour[j - 1], tour[j]);
      const opt = optDist();
      const eff = opt / d;
      effs.push(eff);
      g.querySelectorAll('.pl-cell').forEach(c => c.disabled = true);
      hud.textContent = `距離 ${d} / 最短 ${opt} → 効率 ${Math.round(eff * 100)}%`;
      trial++;
      addTimer(setTimeout(() => {
        if (trial < TRIALS) { nextBoard(); return; }
        const mean = effs.reduce((s, x) => s + x, 0) / effs.length;
        sndDone();
        finish({ score: mean, detail: `平均効率 ${Math.round(mean * 100)}%(3盤)`, metric: { key: 'pl_e', value: Math.round(mean * 100) } });
      }, 1600));
    }
  };
  nextBoard();
}

/* ================= 生活習慣チェック項目(Lancet因子) ================= */
const LIFE_ITEMS = [
  { key: 'exercise', label: '30分以上の有酸素運動(速歩・自転車など)', why: '週150分で海馬の維持に' },
  { key: 'sleep', label: '7時間以上の睡眠', why: '記憶の固定と老廃物の除去に' },
  { key: 'social', label: '誰かと会話した(対面・電話)', why: '社会的孤立はリスク因子' },
  { key: 'diet', label: '魚・緑の野菜を多めに食べた', why: '地中海型食事が保護的' },
  { key: 'alcohol', label: '飲酒は休肝日 or 少量に抑えた', why: '過度の飲酒はリスク因子' },
  { key: 'bp', label: '今週、血圧を測った(週1回でOK)', why: '高血圧は中年期の重要因子' },
];

/* ================= 今日のチャレンジ(新しいこと=認知予備力) ================= */
const CHALLENGES = [
  'いつもと違うルートで歩く・移動する',
  '作ったことのない料理を1品つくる',
  '利き手と逆の手で歯磨きや文字書きをする',
  '今日のニュースを1つ選び、3行で要約を書く',
  '5分でいいので楽器・歌・ダンスに触れる',
  '知らない言葉を1つ調べて、今日中に使う',
  '外国語で今日の予定を3文書いてみる',
  '身近なものを題材に絵を1枚描く',
  '今日の買い物の合計を暗算で出してみる',
  'テーマを1つ決めて写真を5枚撮る',
  '行ったことのない店・道・駅を1つ開拓する',
  '家族や知人に、知らない話題を1つ聞いてみる',
  '小さなDIY・裁縫・工作を15分やる',
  '英語のニュースを1本読むか聴く',
  '将棋・囲碁・チェス・パズルを1局/1問解く',
  'スマホの知らない機能を1つ覚える',
  '昔の曲を聴いて、歌詞を思い出しながら歌う',
  '深呼吸や瞑想を10分間やる',
  '今日あったことを3行の日記に書く',
  '誰かに何かを教える・説明する機会を1つつくる',
  '本を10ページ読んで一言メモを残す',
  '手話の指文字を3文字覚える',
  '身近な植物や星などの名前を3つ調べて覚える',
  '俳句か短歌を1句つくる',
  '目を閉じて自宅の間取り図を描いてみる',
  '聴いたことのないジャンルの音楽を1曲聴く',
  '電話番号や数字を1つ暗記する',
  'タイピング練習を5分やる',
  'スーパーで買ったことのない食材を1つ買う',
  'ラジオ体操やストレッチを10分やる',
];

/* ================= ベンチマークセッション ================= */
const EXERCISES = [
  { key: 'dd', title: '二重注意', icon: '🎯', sub: '処理速度', run: exDualAttention, weight: .10, demo: 'demo-dd.mp4',
    intro: '中央に車の絵が、同時にまわりに ● が<b>一瞬だけ</b>出ます。<br><br>消えたあと「車の種類」と「●の場所」を2つ順番に答えます。直後に ✳︎ などの印が出るのは、目に残像が残らないようにする目隠しです。正解するほど速くなります。' },
  { key: 'calc', title: '高速計算', icon: '⚡', sub: '作業速度', run: exRapidCalc, weight: .07, demo: 'demo-calc.mp4',
    intro: '計算の答えを3つの中から選びます。制限時間は30秒。<br><br>間違えてもすぐ次に進むので、<b>とにかく速く・多く</b>解きましょう。' },
  { key: 'nback', title: 'Nバック', icon: '🧩', sub: 'ワーキングメモリ', run: exNBack, weight: .09, demo: 'demo-nb.mp4',
    intro: '数字が1つずつ順番に出ます。<br><br>「いまの数字」が<b>2つ前の数字</b>と同じなら【同じ】、違えば【違う】。最初の2個は覚えるだけでOKです。' },
  { key: 'mk', title: 'モンキーテスト', icon: '🐵', sub: '視空間記憶', run: exMonkey, weight: .09, demo: 'demo-mk.mp4',
    intro: '数字のついたマスが<b>一瞬だけ</b>出て、すぐ全部隠れます。<br><br>隠れたあと、<b>1 → 2 → 3…の順に</b>その場所をタップ。成功するほど個数が増え、表示が速くなります。' },
  { key: 'dual', title: 'デュアルタスク', icon: '🌗', sub: '二重課題', run: exDualTask, weight: .05, demo: 'demo-dual.mp4',
    intro: () => { session.dualTarget = randInt(2, 9); return `<b>2つ同時にやります。</b>28秒間。<br><br>① 中央に数字が流れます。中に「<b>${session.dualTarget}</b>」が何回出たか、あとで答えます。<br>② その間、画面のどこかに ⭐ がポッと出ます。見つけたら<b>すぐタップ</b>。`; } },
  { key: 'stroop', title: 'ストループ', icon: '🚦', sub: '抑制制御', run: exStroopTimed, weight: .08, demo: 'demo-stroop.mp4',
    intro: '<b>文字の意味ではなく、文字の「色」</b>を押してください。30秒間。<br><br>例:「あお」の文字が<span style="color:#d23c3c">赤色</span>なら →【あか】を押します。' },
  { key: 'vf', title: '音声流暢性', icon: '🗣️', sub: '語彙の検索力', run: exVerbalFluency, weight: .05, demo: 'demo-vf.mp4',
    intro: '30秒間、<b>動物の名前を思いつくだけ多く</b>挙げてください(例: いぬ・ねこ・ぞう)。<br><br>マイクの許可を求められたら許可してください。音声認識が使えない端末では入力欄が出ます。' },
  { key: 'vs', title: '視覚探索', icon: '🔎', sub: '注意の切替', run: exVisualSearch, weight: .08, demo: 'demo-vs.mp4',
    intro: '🍏 の中にまぎれた <b>🍎 を3つ全部</b>タップしてください。見つけると次の面に進みます。<br><br>30秒で何面クリアできるかを測ります。' },
  { key: 'ds', title: '数字の逆唱', icon: '🔢', sub: 'ワーキングメモリ', run: exDigitSpan, weight: .08, demo: 'demo-ds.mp4',
    intro: '数字が1つずつ順番に出ます。<br><br>出終わったら<b>逆の順番</b>で入力してください。例: 3・7・2 と出たら「2・7・3」。正解するほど桁数が増えます。' },
  { key: 'wr', title: '単語の記憶', icon: '📝', sub: '記憶の保持', run: exWordRecog, weight: .05, demo: 'demo-wr.mp4',
    intro: '6つの言葉が5秒間出ます。<br><br>あとで12個の中から<b>さっき出た6つだけ</b>を選んでください。' },
  { key: 'tmt', title: '交互タップ', icon: '🔀', sub: '切替・処理速度', run: exTrailMaking, weight: .08, demo: 'demo-tmt.mp4',
    intro: '数字とひらがながバラバラに出ます。<br><br><b>1 → あ → 2 → い → 3 → う…</b>の順に交互にタップ。終わると次の面。30秒で何面クリアできるかを測ります。' },
  { key: 'sym', title: '数字記号変換', icon: '🔣', sub: '対応付け・速度', run: exSymbolMatch, weight: .08, demo: 'demo-sym.mp4',
    intro: '上の表は<b>数字と記号の対応表</b>です。<br><br>中央に出た数字に対応する記号を、下のボタンから押してください。表は何度見返してもOKです。' },
  { key: 'st', title: 'しりとり', icon: '🔗', sub: '語彙・発想力', run: exShiritori, weight: .05, demo: 'demo-st.mp4',
    intro: '前の言葉の<b>最後の文字</b>から始まる言葉を入力して繋げます。30秒間。<br><br>例: りんご → ごりら → らくだ。「ん」で終わる言葉と、同じ言葉は使えません。' },
  { key: 'pl', title: 'お届けルート', icon: '🗺️', sub: '計画・遂行機能', run: exPlanRoute, weight: .06, demo: 'demo-pl.mp4',
    intro: '🏠を出て📦を全部届けます。<b>移動が一番短くなる順番</b>を考えて、回る順に📦をタップしてください。全部で3盤。<br><br>タップする前に、頭の中でルートを決めるのがコツです。' },
];

function startSession() {
  session = { idx: 0, results: [], list: EXERCISES.map((_, i) => i) };
  const screen = el(`<div class="screen">
    <div class="topbar">
      <div class="ex-title">🧠 認知ベンチマーク</div>
      <button class="quit-btn" id="quit0">戻る</button>
    </div>
    <div class="card">
      <div class="instr" style="margin-top:4px">行いたいテストを選んでください(全部で約7分)。<b>各テストは説明 → 「はじめる」ボタンの順なので、読む時間はかかりません。</b></div>
      <div id="exlist"></div>
    </div>
    <button class="btn" id="gobench" style="margin-top:14px">選択したテストをはじめる</button>
  </div>`);
  const list = $('#exlist', screen);
  const btn = $('#gobench', screen);
  EXERCISES.forEach((e, i) => {
    const row = el(`<label class="pick-row">
      <input type="checkbox" class="pick-cb" data-i="${i}" checked>
      <span class="pick-label">${e.icon} ${e.title}</span>
      <span class="bench-sub">${e.sub}</span>
    </label>`);
    list.appendChild(row);
  });
  const update = () => {
    session.list = [...list.querySelectorAll('.pick-cb')].filter(c => c.checked).map(c => +c.dataset.i);
    btn.disabled = session.list.length === 0;
    btn.style.opacity = session.list.length === 0 ? '.5' : '1';
    btn.textContent = session.list.length === EXERCISES.length
      ? '全部はじめる(約7分)' : `選んだ ${session.list.length} 個をはじめる`;
  };
  list.addEventListener('change', update);
  update();
  $('#quit0', screen).onclick = () => renderHome();
  btn.onclick = () => runExercise();
  render(screen);
}

function runExercise() {
  const ex = EXERCISES[session.list[session.idx]];
  const topbar = `
    <div class="topbar">
      <div class="ex-title">${ex.icon} ${ex.title}<span class="ex-sub">${ex.sub}</span></div>
      <button class="quit-btn">中断する</button>
    </div>
    <div class="dots">${session.list.map((_, i) =>
      `<div class="dot${i < session.idx ? ' done' : i === session.idx ? ' now' : ''}"></div>`).join('')}
    </div>`;

  // 説明フェーズ(開始ボタンを押すまでタイマーは動かない)
  const introHtml = typeof ex.intro === 'function' ? ex.intro() : ex.intro;
  const intro = el(`<div class="screen">
    ${topbar}
    <div class="card">
      ${ex.demo ? `<video class="demo-vid" src="${ex.demo}" autoplay muted loop playsinline preload="metadata"></video>` : ''}
      <div class="instr" style="margin-top:2px">${introHtml}</div>
      ${'speechSynthesis' in window ? '<button class="tts-btn" id="tts">🔊 説明を音声で読み上げる</button>' : ''}
      <button class="btn" id="exgo">このテストをはじめる</button>
    </div>
  </div>`);
  $('.quit-btn', intro).onclick = () => { if (confirm('ベンチマークを中断しますか?')) renderHome(); };
  $('#exgo', intro).onclick = play;
  const tts = $('#tts', intro);
  if (tts) tts.onclick = () => {
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); tts.textContent = '🔊 説明を音声で読み上げる'; return; }
    sndTap(); speakHtml(introHtml); tts.textContent = '⏹ 読み上げを停止';
    const iv2 = addTimer(setInterval(() => { if (!speechSynthesis.speaking) { tts.textContent = '🔊 説明を音声で読み上げる'; clearInterval(iv2); } }, 400));
  };
  render(intro);

  function play() {
    const screen = el(`<div class="screen">
      ${topbar}
      <div class="body" style="flex:1"></div>
    </div>`);
    $('.quit-btn', screen).onclick = () => { if (confirm('ベンチマークを中断しますか?')) renderHome(); };
    render(screen);
    ex.run($('.body', screen), onResult);
  }

  function onResult(res) {
    session.results.push({ key: ex.key, icon: ex.icon, title: ex.title, weight: ex.weight, ...res });
    session.idx++;
    if (session.idx < session.list.length) runExercise();
    else finishSession();
  }
}

function finishSession() {
  const key = todayKey();
  const prevEntry = state.bench[key];
  const prevMetrics = (prevEntry && typeof prevEntry.metrics === 'object' && prevEntry.metrics) || {};
  const prevScores = (prevEntry && typeof prevEntry.scores === 'object' && prevEntry.scores) || {};
  const metrics = { ...prevMetrics };
  const scores = { ...prevScores };
  session.results.forEach(r => {
    if (r.metric) metrics[r.metric.key] = r.metric.value;
    if (r.key && typeof r.score === 'number') scores[r.key] = r.score;
  });
  const weighted = Object.entries(scores)
    .map(([k, s]) => ({ s, w: (EXERCISES.find(e => e.key === k) || { weight: 0 }).weight }))
    .filter(r => r.w > 0);
  const cog = weighted.length
    ? Math.round(weighted.reduce((a, r) => a + r.s * r.w, 0) / weighted.reduce((a, r) => a + r.w, 0) * 100)
    : 0;
  const prev = lastBench(key); // 今日より前の最新ベンチマーク
  state.bench[key] = { score: cog, metrics, scores, at: Date.now() };
  save();
  const streak = currentStreak();
  sndDone();

  const dScore2 = prev ? cog - prev.score : 0;
  const deltaHtml = prev ? `<div class="delta ${dScore2 >= 0 ? 'up' : 'down'}">${dScore2 >= 0 ? '▲' : '▼'} ${dScore2 >= 0 ? '+' : ''}${dScore2}点</div><div class="result-delta">前回(${Number(prev.date.slice(5, 7))}月${Number(prev.date.slice(8))}日)は ${prev.score}点</div>` : '';

  const msg = !prev ? '初回のベンチマークを記録しました。この数値が今後の基線です。' :
    cog >= 85 ? '非常に良い状態です。この調子で継続を。' :
    cog >= 65 ? '着実に向上しています。' :
    cog >= 45 ? 'まずまず。次のベンチマークで伸ばしましょう。' :
    '今回は基線として記録しました。継続すれば数値が伸びます。';

  const screen = el(`<div class="screen">
    <div class="card result-hero">
      <div class="result-label">認知ベンチマーク スコア</div>
      <div class="result-score">${cog}<small> / 100</small></div>
      ${deltaHtml}
      <div class="result-msg">${msg}</div>
      <div class="encourage">🔥 連続 ${streak}日目</div>
    </div>
    <div class="card">
      ${session.results.map(r => `<div class="result-row"><span>${r.icon} ${r.title}</span><span class="r">${r.detail}</span></div>`).join('')}
    </div>
    <button class="btn">ホームに戻る</button>
  </div>`);
  $('.btn', screen).onclick = () => renderHome();
  render(screen);
}

/* ================= 記録の分析(直近2回のベンチマーク比較) ================= */
const METRIC_META = {
  dd_ms:    { label: '二重注意(閾値)',   better: 'down', unit: 'ms' },
  calc_n:   { label: '高速計算',        better: 'up',   unit: '問' },
  nb_acc:   { label: 'Nバック(正答率)',  better: 'up',   unit: '%' },
  dual:     { label: 'デュアルタスク',    better: 'up',   unit: '%' },
  stroop_n: { label: 'ストループ',      better: 'up',   unit: '問' },
  vf_n:     { label: '音声流暢性',      better: 'up',   unit: '語' },
  mk_n:     { label: 'モンキー(記憶数)', better: 'up',   unit: '個' },
  vs_n:     { label: '視覚探索',        better: 'up',   unit: '面' },
  ds_n:     { label: '数字の逆唱',      better: 'up',   unit: '桁' },
  wr_n:     { label: '単語の記憶',      better: 'up',   unit: '点' },
  tmt_n:    { label: '交互タップ',      better: 'up',   unit: '面' },
  sym_n:    { label: '数字記号変換',    better: 'up',   unit: '問' },
  st_n:     { label: 'しりとり',        better: 'up',   unit: '語' },
  pl_e:     { label: 'お届けルート(効率)', better: 'up',  unit: '%' },
};

// 全ベンチマーク履歴から各指標の推移(スパークライン用データ)
function benchTrends() {
  const ks = Object.keys(state.bench).sort();
  if (ks.length < 2) return null;
  return Object.keys(METRIC_META).map(k => {
    const meta = METRIC_META[k];
    const pts = ks.map(d2 => state.bench[d2].metrics && state.bench[d2].metrics[k]).filter(v => v != null);
    if (pts.length < 2) return null;
    const n = pts.length, half = Math.floor(n / 2);
    const a = pts.slice(0, n - half).reduce((s, v) => s + v, 0) / (n - half);
    const b = pts.slice(n - half).reduce((s, v) => s + v, 0) / half;
    const diff = b - a;
    const mark = diff === 0 ? '→' : (meta.better === 'up' ? diff > 0 : diff < 0) ? '↑' : '↓';
    return { label: meta.label, pts, mark, last: pts[pts.length - 1], unit: meta.unit };
  }).filter(Boolean);
}

function spark(pts, w = 110, h = 30) {
  const min = Math.min(...pts), max = Math.max(...pts), r = (max - min) || 1;
  const step = w / (pts.length - 1);
  const str = pts.map((v, i) => `${(i * step).toFixed(1)},${(h - 4 - (v - min) / r * (h - 8)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}"><polyline points="${str}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function coachPrompt() {
  const ks = Object.keys(state.bench).sort();
  const lines = ['あなたは認知症予防の専門家です。以下は60歳のユーザーの「まいにち脳トレ」アプリの記録です。', ''];
  lines.push(`■ 連続記録: 現在 ${currentStreak()}日(最長 ${maxStreak()}日)`);
  const d = new Date();
  let wChecks = 0;
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(d); dd.setDate(d.getDate() - i);
    const k = todayKey(dd);
    wChecks += LIFE_ITEMS.filter(it => state.checks[k] && state.checks[k][it.key]).length;
  }
  lines.push(`■ 直近7日の習慣チェック: 計${wChecks}個(運動・睡眠・会話・食事・飲酒・血圧の6項目×7日=最大42)`);
  if (ks.length) {
    lines.push('■ 認知ベンチマークの推移(14種目・総合100点満点):');
    ks.slice(-8).forEach(k => {
      const b2 = state.bench[k];
      const ms = Object.keys(b2.metrics || {}).map(mk2 => {
        const mm = METRIC_META[mk2];
        return mm ? `${mm.label}=${b2.metrics[mk2]}${mm.unit}` : '';
      }).filter(Boolean).join(', ');
      lines.push(`  ${k}: 総合${b2.score}点${ms ? ' — ' + ms : ''}`);
    });
  } else {
    lines.push('■ 認知ベンチマーク: まだ未実施');
  }
  lines.push('', 'この記録をもとに、来週やるべきことを3つ、科学的根拠つきで具体的に提案してください。医学的診断ではなく生活改善のアドバイスとして、簡潔にお願いします。');
  return lines.join('\n');
}

function benchAnalysis() {
  const ks = Object.keys(state.bench).sort();
  if (ks.length < 2) return null;
  const prev = state.bench[ks[ks.length - 2]], cur = state.bench[ks[ks.length - 1]];
  const rows = [];
  Object.keys(METRIC_META).forEach(k => {
    const meta = METRIC_META[k];
    const a = prev.metrics && prev.metrics[k], b = cur.metrics && cur.metrics[k];
    if (a == null || b == null) return;
    const diff = b - a;
    const mark = diff === 0 ? '→' : (meta.better === 'up' ? diff > 0 : diff < 0) ? '↑' : '↓';
    rows.push({ label: meta.label, text: `${a}${meta.unit} → ${b}${meta.unit}`, mark });
  });
  const dScore = cur.score - prev.score;
  const overall =
    dScore <= -8 ? '前回より大きく低下しています。睡眠不足や体調不良の影響もあり得ます。数日おいて再測定を。' :
    dScore >= 5  ? '前回より改善しています。この調子で。' :
    'おおむね安定しています。';
  return { rows, overall };
}

/* ================= ホーム(毎日のダッシュボード) ================= */
function renderHome() {
  const d = new Date();
  const key = todayKey(d);
  const hour = d.getHours();
  const greet = hour < 10 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは';
  const streak = currentStreak();
  const todayChecks = state.checks[key] || {};
  const checkedN = LIFE_ITEMS.filter(i => todayChecks[i.key]).length;

  // ベンチマーク状態(2日以上空いたら実施推奨)
  const lb = lastBench();
  const lbPrev = lb ? lastBench(lb.date) : null;
  const sinceBench = lb ? daysBetween(lb.date, key) : null;
  const benchDue = !lb || sinceBench >= 2;
  const best = Math.max(0, ...Object.values(state.bench).map(b => (b && typeof b === 'object' && typeof b.score === 'number') ? b.score : 0));

  // 今日のチャレンジ
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  if (!state.challenges[key]) {
    state.challenges[key] = { idx: doy % CHALLENGES.length, status: 'shown' };
    save();
  }
  const ch = state.challenges[key];
  if (typeof ch.idx !== 'number' || !isFinite(ch.idx) || ch.idx < 0) ch.idx = doy % CHALLENGES.length;
  ch.idx = Math.floor(((ch.idx % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length);

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(d); dd.setDate(d.getDate() - i);
    const k = todayKey(dd);
    week.push({ w: WDAYS[dd.getDay()], done: isActiveDay(k), today: i === 0 });
  }

  const screen = el(`<div class="screen has-tabs">
    <div class="tabpage" data-tab="home">
    <div class="greet">${greet}</div>
    <div class="big-date">${d.getMonth() + 1}月${d.getDate()}日 <small>${WDAYS[d.getDay()]}曜日</small></div>

    ${!isActiveDay(key) ? '<div class="todo-banner">📌 今日はまだ記録がありません — 下のどれか1つ、約2分で終わります</div>' : ''}

    <div class="card">
      <div class="bench-title">📋 今日やること</div>
      <div class="today-row">
        <button class="today-chip${checkedN === LIFE_ITEMS.length ? ' done' : ''}" data-goto="lifeCard">🌿 習慣 <b>${checkedN} / ${LIFE_ITEMS.length}</b></button>
        <button class="today-chip${ch.status === 'done' ? ' done' : ''}" data-goto="chCard">💡 チャレンジ <b>${ch.status === 'done' ? '✓ 済' : '未達'}</b></button>
        <button class="today-chip${state.bench[key] ? ' done' : ''}" data-goto="benchCard">🧠 ベンチ <b>${state.bench[key] ? state.bench[key].score + '点 ✓' : benchDue ? 'おすすめ' : 'あと ' + (2 - sinceBench) + '日'}</b></button>
      </div>
    </div>

    <div class="card bench-card" id="benchCard">
      <div class="bench-title">🧠 認知ベンチマーク<span class="bench-sub">週2〜3回・約5分</span></div>
      ${benchDue ? `
        <div class="bench-msg">${lb ? '前回から ' + sinceBench + '日 — 今日は実施のタイミングです' : 'まずは最初のベンチマークを測りましょう'}</div>
        <button class="btn" id="bench">ベンチマークをはじめる</button>
      ` : `
        <div class="last-score-row"><span class="last-score">${lb.score}<small> 点</small></span>${lbPrev ? `<span class="delta ${lb.score - lbPrev.score >= 0 ? 'up' : 'down'}">${lb.score - lbPrev.score >= 0 ? '▲ +' : '▼ '}${lb.score - lbPrev.score}</span>` : ''}</div>
        <div class="bench-msg dim">次のおすすめ: あと ${2 - sinceBench}日</div>
        <button class="btn ghost" id="bench">今すぐ測る</button>
      `}
    </div>

    <div class="card" id="lifeCard">
      <div class="bench-title">🌿 今日の習慣チェック
        <svg class="ring" viewBox="0 0 48 48"><circle class="ring-bg" cx="24" cy="24" r="19"></circle><circle class="ring-fg" id="lifeRing" cx="24" cy="24" r="19" transform="rotate(-90 24 24)" style="stroke-dashoffset:${(119.4 * (1 - checkedN / LIFE_ITEMS.length)).toFixed(1)}"></circle><text class="ring-txt" id="lifehud" x="24" y="29.5" text-anchor="middle">${checkedN}/${LIFE_ITEMS.length}</text></svg>
      </div>
      <div id="lifelist"></div>
    </div>

    <div class="card" id="chCard">
      <div class="bench-title">💡 今日のチャレンジ<span class="bench-sub">新しい刺激が脳の予備力に</span></div>
      <div class="challenge-text">${CHALLENGES[ch.idx]}</div>
      ${ch.status === 'done'
        ? '<div class="encourage">✓ 達成済み — よくできました</div>'
        : `<div class="row-flex" style="justify-content:center;gap:12px">
            <button class="mini-btn" id="chDone">できた</button>
            <button class="mini-btn sub" id="chNext">別のにする</button>
          </div>`}
    </div>

    <div class="card streak-card">
      <div style="font-size:36px">🔥</div>
      <div>
        <div class="streak-num">${streak}<span style="font-size:18px"> 日</span></div>
        <div class="streak-label">連続記録</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div class="streak-num" style="color:var(--primary);font-size:30px">${best || '―'}</div>
        <div class="streak-label">ベンチ最高値</div>
      </div>
    </div>

    <div class="card">
      <div class="streak-label" style="margin-bottom:8px">この1週間</div>
      <div class="week-row">
        ${week.map(x => `<div class="week-cell"><div class="week-dot${x.done ? ' done' : ''}${x.today ? ' today' : ''}">${x.done ? '✓' : '・'}</div><div>${x.w}</div></div>`).join('')}
      </div>
      <div class="home-note">「ベンチマーク」「習慣チェック」「チャレンジ」のどれかをやればその日はカウントされます</div>
      <button class="mini-btn" id="weekrep" style="margin:10px auto 0;display:block">📊 週次レポートを見る</button>
    </div>
    </div>

    <div class="tabpage" data-tab="rec">
    <div class="greet" style="margin-bottom:12px">📈 きろくと分析</div>

    ${(() => {
      const earned = BADGES.filter(b => b.ok());
      const next = BADGES.filter(b => !b.ok()).sort((a, b2) => b2.n() / b2.max - a.n() / a.max).slice(0, 3);
      return `
    <div class="card">
      <div class="bench-title">🏅 バッジ<span class="bench-sub">継続の証</span></div>
      ${earned.length ? `<div class="badge-row">${earned.map(b => `<div class="badge"><span class="badge-icon">${b.icon}</span>${b.label}</div>`).join('')}</div>` : '<div class="bench-msg dim">まだ獲得したバッジはありません</div>'}
      ${next.length ? `<div class="bench-title" style="font-size:15px;margin-top:12px">つぎのバッジ</div>
        ${next.map(b => { const n = b.n(); const pct = Math.round(n / b.max * 100); return `
        <div class="bprog-row">
          <span class="bprog-icon">${b.icon}</span>
          <div class="bprog-main">
            <div class="bprog-top"><span>${b.label}</span><span>${n} / ${b.max}</span></div>
            <div class="bar-track bprog-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          </div>
          <span class="bprog-left">あと${b.max - n}</span>
        </div>`; }).join('')}` : ''}
    </div>`; })()}

    ${(() => { const ana = benchAnalysis(); return ana ? `
    <div class="card">
      <div class="bench-title">📈 記録の分析<span class="bench-sub">直近2回のベンチマーク比較</span></div>
      ${ana.rows.map(r => `<div class="ana-row"><span>${r.label}</span><span class="ana-${r.mark === '↑' ? 'up' : r.mark === '↓' ? 'down' : 'flat'}">${r.mark} ${r.text}</span></div>`).join('')}
      <div class="bench-msg" style="margin:10px 0 0">${ana.overall}</div>
    </div>` : ''; })()}

    ${(() => { const tr = benchTrends(); return tr && tr.length ? `
    <div class="card">
      <div class="bench-title">📉 領域別の推移<span class="bench-sub">全ベンチマークの傾向</span></div>
      ${tr.map(t => `<div class="trend-row">
        <span class="trend-name">${t.label}<small>最新 ${t.last}${t.unit}</small></span>
        ${spark(t.pts)}
        <span class="ana-${t.mark === '↑' ? 'up' : t.mark === '↓' ? 'down' : 'flat'}">${t.mark}</span>
      </div>`).join('')}
    </div>` : ''; })()}

    <div class="card">
      <div class="bench-title">🤖 AIコーチ<span class="bench-sub">あなたの記録をAIが分析</span></div>
      <div id="coachBody">
        ${state.coach && state.coach.date === key
          ? `<div class="coach-advice">${state.coach.text}</div>`
          : '<div class="bench-msg" style="font-weight:600">記録の数値をAIに送って、今日のアドバイスを生成します(名前など個人情報は送りません)</div>'}
      </div>
      <div class="row-flex" style="justify-content:center;gap:10px">
        <button class="share-btn" id="coach" style="margin-top:0;flex:1">${state.coach && state.coach.date === key ? '🔄 もう一度生成' : '✨ アドバイスを生成'}</button>
        <button class="mute-btn" id="coachCopy" title="相談文をコピー">📋</button>
      </div>
    </div>

    <div class="card">
      <div class="bench-title">👨‍👩‍👧 家族の記録<span class="bench-sub">同じアプリの中で見えます</span></div>
      ${state.family ? `
        <div class="fam-code">グループコード <b>${state.family.code}</b> ・ ${state.family.name} として参加中</div>
        <div id="famList"><div class="home-note">読み込み中…</div></div>
        <div class="row-flex" style="justify-content:center;gap:10px;margin-top:10px">
          <button class="mini-btn sub" id="famRefresh">🔄 更新</button>
          <button class="mini-btn sub" id="famLeave">グループを抜ける</button>
        </div>
        <div class="home-note">このコードを家族の端末で「コードで参加」に入れるとつながります</div>
      ` : `
        <div class="bench-msg" style="font-weight:600">同じグループに入ると、お互いの記録(連続日数・習慣数・ベンチ点数)がここに表示されます。</div>
        <div class="remind-row"><input id="famName" class="vf-input" placeholder="あなたの名前(例: としお)" maxlength="20"></div>
        <div class="remind-row"><input id="famCode" class="vf-input" placeholder="グループコード(6文字)" maxlength="6"></div>
        <div class="row-flex" style="justify-content:center;gap:10px">
          <button class="mini-btn" id="famCreate">🆕 グループを作成</button>
          <button class="mini-btn sub" id="famJoin">コードで参加</button>
        </div>
        <div class="home-note">最初の人が「作成」でコード発行 → 他の人はそのコードで「参加」</div>
      `}
    </div>
    </div>

    <div class="tabpage" data-tab="set">
    <div class="greet" style="margin-bottom:12px">⚙️ 設定</div>

    <div class="card">
      <div class="bench-title">🔔 毎日リマインド<span class="bench-sub">続けることが一番効きます</span></div>
      <div class="remind-row">
        <input type="time" id="remTime" value="${state.remind && state.remind.time ? state.remind.time : '08:00'}">
        <button class="mini-btn" id="remBtn">${state.remind && state.remind.on ? 'ON — 押して解除' : 'この時刻に通知'}</button>
      </div>
      <div class="home-note" id="remNote">${'Notification' in window ? (Notification.permission === 'denied' ? '端末の設定で通知がブロックされています' : 'ホーム画面に追加したアプリでは通知が届きやすくなります') : 'この端末では通知が使えません'}</div>
    </div>

    <div class="card">
      <div class="bench-title">🗂 記録の管理<span class="bench-sub">機種変更・誤削除の備えに</span></div>
      <div class="row-flex" style="justify-content:center;gap:10px">
        <button class="mini-btn" id="exportBtn">📥 バックアップ保存</button>
        <button class="mini-btn sub" id="importBtn">📤 復元する</button>
        <input type="file" id="importFile" accept=".json,application/json" style="display:none">
      </div>
      <div class="home-note">記録はこの端末だけに保存されます。月1回のバックアップがおすすめです</div>
    </div>

    <div class="card">
      <div class="bench-title">表示と音声</div>
      <div class="row-flex" style="flex-wrap:wrap;justify-content:flex-start;gap:10px">
        <button class="mute-btn" id="mute">${state.muted ? '🔇 音声 OFF' : '🔊 音声 ON'}</button>
        <button class="mute-btn" id="fontBtn">${state.bigText ? '🔠 文字: 大' : '🔡 文字: 標準'}</button>
        <button class="mute-btn" id="darkBtn">${state.dark ? '☀️ 明るい画面' : '🌙 暗い画面'}</button>
      </div>
    </div>

    <button class="mute-btn" id="guide" style="width:100%;padding:14px;font-size:16px;font-weight:700;margin-bottom:10px">📖 使い方ガイド</button>
    <button class="mute-btn" id="evi" style="width:100%;padding:14px;font-size:16px;font-weight:700">ℹ️ このアプリの根拠(研究文献)</button>
    </div>

    <div class="tabspacer"></div>
    <div class="tabbar">
      <button class="tabb" data-tab="home">🏠<span>ホーム</span></button>
      <button class="tabb" data-tab="rec">📈<span>きろく</span></button>
      <button class="tabb" data-tab="set">⚙️<span>設定</span></button>
    </div>
  </div>`);

  // チェックリスト(タップですぐ保存)
  // タブ切替(ホーム / きろく / 設定)
  const tabs = [...screen.querySelectorAll('.tabb')];
  const showTab = t => {
    if (state.tab !== t) { state.tab = t; save(); }
    tabs.forEach(x => x.classList.toggle('on', x.dataset.tab === t));
    screen.querySelectorAll('.tabpage').forEach(p => p.classList.toggle('on', p.dataset.tab === t));
    window.scrollTo(0, 0);
  };
  tabs.forEach(b => b.onclick = () => { sndTap(); showTab(b.dataset.tab); });
  showTab(state.tab === 'rec' || state.tab === 'set' ? state.tab : 'home');

  // 「今日やること」チップ → 各カードへスクロール
  screen.querySelectorAll('.today-chip').forEach(c => c.onclick = () => {
    const t = $('#' + c.dataset.goto, screen);
    if (t) { sndTap(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  const updHabitHud = () => {
    const t = todayKey();
    const n = LIFE_ITEMS.filter(i => state.checks[t] && state.checks[t][i.key]).length;
    const hud = $('#lifehud', screen), ring = $('#lifeRing', screen);
    if (hud) hud.textContent = `${n}/${LIFE_ITEMS.length}`;
    if (ring) ring.style.strokeDashoffset = (119.4 * (1 - n / LIFE_ITEMS.length)).toFixed(1);
    const chip = $('.today-chip[data-goto="lifeCard"]', screen);
    if (chip) { chip.querySelector('b').textContent = `${n} / ${LIFE_ITEMS.length}`; chip.classList.toggle('done', n === LIFE_ITEMS.length); }
  };

  // チェックリスト(タップですぐ保存)
  const list = $('#lifelist', screen);
  LIFE_ITEMS.forEach(it => {
    const row = document.createElement('button');
    row.className = 'life-row' + (todayChecks[it.key] ? ' on' : '');
    row.innerHTML = `<span class="life-check">${todayChecks[it.key] ? '☑' : '☐'}</span><span class="life-text">${it.label}<span class="life-why">${it.why}</span></span>`;
    row.onclick = () => {
      const t = todayKey();
      if (!state.checks[t]) state.checks[t] = {};
      state.checks[t][it.key] = !state.checks[t][it.key];
      if (!state.checks[t][it.key]) delete state.checks[t][it.key];
      save();
      const on = !!state.checks[t][it.key];
      row.classList.toggle('on', on);
      row.querySelector('.life-check').textContent = on ? '☑' : '☐';
      updHabitHud();
      sndTap();
    };
    list.appendChild(row);
  });

  $('#bench', screen).onclick = () => { sndTap(); startSession(); };
  const chDone = $('#chDone', screen);
  if (chDone) {
    chDone.onclick = () => { state.challenges[todayKey()].status = 'done'; save(); sndOK(); renderHome(); };
    $('#chNext', screen).onclick = () => {
      state.challenges[todayKey()].idx = (ch.idx + randInt(1, CHALLENGES.length - 1)) % CHALLENGES.length;
      save(); renderHome();
    };
  }
  $('#mute', screen).onclick = () => { state.muted = !state.muted; save(); renderHome(); };
  $('#fontBtn', screen).onclick = () => { state.bigText = !state.bigText; save(); applyFont(); renderHome(); };
  $('#darkBtn', screen).onclick = () => { state.dark = !state.dark; save(); applyFont(); renderHome(); };
  $('#guide', screen).onclick = () => renderGuide();
  $('#evi', screen).onclick = () => renderEvidence();
  $('#weekrep', screen).onclick = () => renderWeekReport();

  // 記録のバックアップ/復元
  $('#exportBtn', screen).onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `noutore-backup-${key}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const imp = $('#importFile', screen);
  $('#importBtn', screen).onclick = () => imp.click();
  imp.onchange = () => {
    const f = imp.files && imp.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj) || (!obj.checks && !obj.bench)) throw 0;
        if (!confirm('いまの記録をバックアップの内容に置き換えます。よろしいですか?')) return;
        state = sanitizeState(obj);
        save(); applyFont(); renderHome();
      } catch (e) { alert('バックアップファイルが読めませんでした'); }
    };
    rd.readAsText(f);
  };

  // リマインド設定
  const remBtn = $('#remBtn', screen), remTime = $('#remTime', screen);
  remBtn.onclick = async () => {
    if (state.remind && state.remind.on) { state.remind = { on: false, time: remTime.value }; save(); renderHome(); return; }
    if (!('Notification' in window)) { alert('この端末では通知が使えません'); return; }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') { renderHome(); return; }
    state.remind = { on: true, time: remTime.value || '08:00' }; save();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        if (reg.periodicSync) reg.periodicSync.register('daily-remind', { minInterval: 22 * 3600 * 1000 }).catch(() => {});
      }).catch(() => {});
    }
    renderHome();
  };

  // AIコーチ(アプリ内で生成)
  const coachGo = $('#coach', screen), coachBody = $('#coachBody', screen);
  coachGo.onclick = async () => {
    if (coachBusy) return;
    coachBusy = true;
    coachGo.disabled = true; coachGo.style.opacity = .6;
    const t0 = Date.now();
    const steps = ['📊 記録を集計しています', '🧠 AIが分析しています', '✍️ アドバイスを書いています', '⏳ まもなく完了します'];
    coachBody.innerHTML = `<div class="coach-prog">
      <div class="coach-step" id="coachStep">${steps[0]}</div>
      <div class="coach-track"><div class="coach-fill" id="coachFill"></div></div>
      <div class="coach-time" id="coachTime">0秒経過 — 通常15〜40秒かかります</div>
    </div>`;
    const iv = setInterval(() => {
      const el = (Date.now() - t0) / 1000;
      const st = $('#coachStep'), fl = $('#coachFill'), tm = $('#coachTime');
      if (!st || !fl || !tm) { clearInterval(iv); return; }
      st.textContent = steps[el < 5 ? 0 : el < 15 ? 1 : el < 45 ? 2 : 3];
      fl.style.width = (el < 40 ? el / 40 * 90 : Math.min(97, 90 + (el - 40) / 20 * 7)) + '%';
      tm.textContent = Math.floor(el) + '秒経過 — 通常15〜40秒かかります';
    }, 500);
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 60000);
      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ messages: [
          { role: 'system', content: 'あなたは認知症予防の専門家で、60歳前後の働く人向けの健康コーチです。送られてくるのは記録の数値だけです。やさしく具体的に、来週やるべきことを3つ箇条書きで日本語で提案してください。各項目は1文で簡潔に。' },
          { role: 'user', content: coachPrompt() },
        ]}),
      });
      clearTimeout(to); clearInterval(iv);
      let adv = await res.text();
      if (!res.ok || !adv) throw 0;
      adv = adv.split('\n---')[0].split('**Support')[0].split('🌸')[0].trim();
      const html = adv.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
      state.coach = { date: key, text: html }; save();
      coachBody.innerHTML = `<div class="coach-advice">${html}</div>`;
      coachGo.textContent = '🔄 もう一度生成';
    } catch (e) {
      clearInterval(iv);
      coachBody.innerHTML = '<div class="bench-msg">通信に失敗しました。オフライン時は右の📋で相談文をコピーし、ChatGPT等に貼ってください。</div>';
    }
    coachBusy = false;
    coachGo.disabled = false; coachGo.style.opacity = 1;
  };
  $('#coachCopy', screen).onclick = () => {
    const t = coachPrompt();
    if (navigator.share) navigator.share({ title: 'AIコーチへの相談', text: t }).catch(() => {});
    else navigator.clipboard?.writeText(t).then(() => alert('相談文をコピーしました。ChatGPTなどのAIに貼り付けてください')).catch(() => alert(t));
  };

  // 家族グループ(アプリ内共有)
  if (state.family) {
    const ak = famAk(state.family.code);
    const loadFam = async () => {
      try {
        const idx = await kvGet(ak, '_index');
        const names = (idx && idx.names) || [];
        const members = await Promise.all(names.map(async n => {
          try { return { name: n, ...(await kvGet(ak, famMk(n))) }; } catch (e) { return { name: n }; }
        }));
        $('#famList', screen).innerHTML = members.length
          ? members.map(m => `<div class="fam-row"><span>${m.name === state.family.name ? '🧑 ' + m.name + ' (あなた)' : m.name}</span><span>${m.last_date ? `🌿${m.checks}/6 🔥${m.streak}日${m.bench != null ? ' 🧠' + m.bench + '点' : ''}` : 'まだ記録なし'}</span><small>${(m.last_date || '').slice(5)}</small></div>`).join('')
          : '<div class="home-note">まだ投稿がありません</div>';
      } catch (e) { $('#famList', screen).innerHTML = '<div class="home-note">通信できませんでした</div>'; }
    };
    loadFam();
    $('#famRefresh', screen).onclick = loadFam;
    $('#famLeave', screen).onclick = () => { if (confirm('グループを抜けますか?(端末の記録は残ります)')) { state.family = null; save(); renderHome(); } };
    // 今日の記録があれば自動投稿(1日1回)
    if (isActiveDay(key) && state.lastPost !== key) {
      state.lastPost = key;
      (async () => {
        await kvSet(ak, famMk(state.family.name), { last_date: key, streak, checks: checkedN, bench: lb ? lb.score : null });
        const idx = (await kvGet(ak, '_index')) || { names: [] };
        if (!idx.names.includes(state.family.name)) { idx.names.push(state.family.name); await kvSet(ak, '_index', idx); }
        save(); loadFam();
      })().catch(() => { state.lastPost = ''; });
    }
  } else {
    $('#famCreate', screen).onclick = async () => {
      const name = $('#famName', screen).value.trim();
      if (!name) { alert('名前を入れてください'); return; }
      try {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        const ak = famAk(code);
        if (await kvGet(ak, '_index')) { alert('もう一度押してください'); return; }
        await kvSet(ak, '_index', { names: [name] });
        state.family = { code, name }; save(); renderHome();
      } catch (e) { alert('通信できませんでした'); }
    };
    $('#famJoin', screen).onclick = async () => {
      const name = $('#famName', screen).value.trim();
      const code = $('#famCode', screen).value.trim().toUpperCase();
      if (!name || !code) { alert('名前とコードを入れてください'); return; }
      try {
        const ak = famAk(code);
        const idx = await kvGet(ak, '_index');
        if (!idx || !idx.names) { alert('グループが見つかりません。コードを確認してください'); return; }
        if (!idx.names.includes(name)) {
          if (idx.names.length >= 8) { alert('グループがいっぱいです(最大8人)'); return; }
          idx.names.push(name); await kvSet(ak, '_index', idx);
        }
        state.family = { code, name }; save(); renderHome();
      } catch (e) { alert('通信できませんでした'); }
    };
  }

  render(screen);
}

/* ================= 週次レポート ================= */
function renderWeekReport() {
  const d = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(d); dd.setDate(d.getDate() - i);
    const k = todayKey(dd);
    days.push({
      k, label: `${dd.getMonth() + 1}/${dd.getDate()}(${WDAYS[dd.getDay()]})`,
      checks: LIFE_ITEMS.filter(it => state.checks[k] && state.checks[k][it.key]).length,
      bench: state.bench[k] || null,
      ch: state.challenges[k] && state.challenges[k].status === 'done',
      active: isActiveDay(k),
    });
  }
  const activeN = days.filter(x => x.active).length;
  const checkSum = days.reduce((s, x) => s + x.checks, 0);
  const benches = days.filter(x => x.bench);
  const streak = currentStreak();
  const pdays = [];
  for (let i = 13; i >= 7; i--) {
    const dd = new Date(d); dd.setDate(d.getDate() - i);
    const k = todayKey(dd);
    pdays.push({
      checks: LIFE_ITEMS.filter(it => state.checks[k] && state.checks[k][it.key]).length,
      bench: state.bench[k] || null,
      active: isActiveDay(k),
    });
  }
  const pActiveN = pdays.filter(x => x.active).length;
  const pCheckSum = pdays.reduce((s, x) => s + x.checks, 0);
  const pB = pdays.filter(x => x.bench);
  const pBenchAvg = pB.length ? Math.round(pB.reduce((s, x) => s + x.bench.score, 0) / pB.length) : null;
  const cBenchAvg = benches.length ? Math.round(benches.reduce((s, x) => s + x.bench.score, 0) / benches.length) : null;
  const sign = n => (n >= 0 ? '+' : '') + n;
  const cmpLine = `先週比: 記録 ${sign(activeN - pActiveN)}日 / 習慣 ${sign(checkSum - pCheckSum)}個` +
    (cBenchAvg != null && pBenchAvg != null ? ` / ベンチ ${sign(cBenchAvg - pBenchAvg)}点` : '');

  const shareText = `🧠 まいにち脳トレ 週次レポート(${days[0].label}〜${days[6].label})\n` +
    `記録した日: ${activeN}/7日 / 習慣チェック 計${checkSum}個 / ` +
    (benches.length ? `ベンチマーク ${benches.map(b => b.bench.score + '点').join(' → ')} / ` : '') +
    `連続 ${streak}日`;

  const screen = el(`<div class="screen">
    <div class="topbar"><div class="ex-title">📊 週次レポート</div><button class="quit-btn" id="back">戻る</button></div>
    <div class="card result-hero">
      <div class="result-label">この1週間</div>
      <div class="result-score">${activeN}<small> / 7日 記録</small></div>
      <div class="result-msg">${activeN >= 6 ? 'ほぼ毎日続いています。素晴らしい習慣です。' : activeN >= 4 ? 'いいペースです。「毎日2分」を目安に。' : activeN >= 1 ? 'まずは「2分だけ」を毎日の習慣に。' : 'まずは今日の習慣チェックから。'}</div>
      <div class="wb-compare">${cmpLine}</div>
    </div>
    <div class="card">
      ${days.map(x => `<div class="result-row">
        <span>${x.label}${x.k === todayKey() ? '(今日)' : ''}</span>
        <span class="r">${x.active ? `🌿${x.checks} ${x.ch ? '💡✓' : ''}${x.bench ? ' 🧠' + x.bench.score + '点' : ''}` : '—'}</span>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="bench-title">📈 この1週間のグラフ</div>
      <div class="wbar-chart">
        ${days.map(x => `<div class="wb-col"><div class="wb-fill-wrap"><div class="wb-bar" style="height:${Math.max(4, Math.round(x.checks / 6 * 100))}%">${x.checks || ''}</div></div><div class="wb-day">${x.label.slice(x.label.indexOf('(') + 1, x.label.indexOf(')'))}</div></div>`).join('')}
      </div>
      <div class="wb-cap">🌿 習慣チェック数(各日 最大6個)</div>
      ${(() => { const bks = Object.keys(state.bench).filter(k2 => state.bench[k2] && typeof state.bench[k2] === 'object' && typeof state.bench[k2].score === 'number').sort().slice(-10); return bks.length >= 2 ? `
        <div class="wb-cap" style="margin-top:16px">🧠 ベンチマーク点数の推移(直近${bks.length}回)</div>
        <div class="wb-spark">${spark(bks.map(k2 => state.bench[k2].score), 320, 70)}</div>
        <div class="wb-range"><span>${bks[0].slice(5).replace('-', '/')} ${state.bench[bks[0]].score}点</span><span>${bks[bks.length - 1].slice(5).replace('-', '/')} ${state.bench[bks[bks.length - 1]].score}点</span></div>` : ''; })()}
    </div>
    <button class="share-btn" id="wshare" style="margin-top:0">📤 この週報を家族に共有</button>
    <button class="btn ghost" id="back2" style="margin-top:12px">ホームに戻る</button>
  </div>`);
  $('#back', screen).onclick = renderHome;
  $('#back2', screen).onclick = renderHome;
  $('#wshare', screen).onclick = () => {
    const text = shareText + `\n一緒にやってみて → ${location.href}`;
    if (navigator.share) navigator.share({ title: 'まいにち脳トレ 週次レポート', text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => alert('週報をコピーしました — 貼り付けて送れます')).catch(() => alert(text));
  };
  render(screen);
}

/* ================= 使い方ガイド ================= */
function renderGuide() {
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const screen = el(`<div class="screen">
    <div class="topbar"><div class="ex-title">📖 使い方ガイド</div><button class="quit-btn" id="back">戻る</button></div>
    <div class="card">
      <div class="bench-title">📱 アプリのように使うには</div>
      <div class="instr">${isIOS
        ? 'Safariでこのページを開き、下の「共有ボタン(□↑)」→「ホーム画面に追加」を選びます。'
        : 'Chromeでこのページを開き、右上の「⋮メニュー」→「ホーム画面に追加」(または「アプリをインストール」)を選びます。'}ホーム画面のアイコンから開けば、アドレスバーなしで毎日使えます。</div>
    </div>
    <div class="card">
      <div class="bench-title">🎤 マイクの許可</div>
      <div class="instr">「声に出して答える」テストでマイクの許可を聞かれたら「許可」を押してください。使えない環境では自動で入力式に切り替わります。</div>
    </div>
    <div class="card">
      <div class="bench-title">🔔 毎日のリマインド</div>
      <div class="instr">設定タブで時刻を決めてONにすると通知が届きます。通知の許可を求められたら「許可」を押してください。<b>ホーム画面に追加したアイコンから開いた状態</b>で設定すると確実に届きます。</div>
    </div>
    <div class="card">
      <div class="bench-title">👨‍👩‍👧 家族と記録を見る</div>
      <div class="instr">設定タブの「家族の記録」で「グループを作成」→ 6文字のコードが出ます。家族の端末で「コードで参加」に入れると、お互いの連続日数とベンチ点数がアプリ内で見えます。</div>
    </div>
    <div class="card">
      <div class="bench-title">🗂 記録のバックアップ</div>
      <div class="instr">記録はこの端末の中だけに保存されます。機種変更や誤って消した時に備えて、設定タブの「バックアップを保存」で月1回ファイルを残すのがおすすめです。復元も同じ画面からできます。</div>
    </div>
    <button class="btn" id="back2">ホームに戻る</button>
  </div>`);
  $('#back', screen).onclick = renderHome;
  $('#back2', screen).onclick = renderHome;
  render(screen);
}

/* ================= 初回案内 ================= */
function renderWelcome() {
  const screen = el(`<div class="screen">
    <div class="greet">ようこそ</div>
    <div class="big-date">まいにち脳トレ</div>
    <div class="card">
      <div class="instr">認知症予防の研究(ACTIVE試験・Lancet報告など)にもとづいた、<b>1日2分</b>の習慣アプリです。やることは3つだけ:</div>
      <div class="wl-item"><span class="wl-icon">🌿</span><div><b>習慣チェック(毎日)</b><br>運動・睡眠・会話など、予防に効く6項目をタップするだけ</div></div>
      <div class="wl-item"><span class="wl-icon">🧠</span><div><b>認知ベンチマーク(週2〜3回)</b><br>14種のテストで処理速度や記憶を計測。やり方は動画つき</div></div>
      <div class="wl-item"><span class="wl-icon">💡</span><div><b>今日のチャレンジ(毎日)</b><br>新しいことを1つ。脳の予備力を育てます</div></div>
      <div class="home-note">記録はこの端末だけに保存され、毎日続けると「連続日数」が伸びます</div>
    </div>
    <button class="btn" id="wgo">はじめる</button>
    <div class="home-note" style="margin-top:14px">📱 ブラウザのメニュー →「ホーム画面に追加」で<br>アプリのように毎日使えます</div>
  </div>`);
  $('#wgo', screen).onclick = () => { state.seenIntro = true; save(); sndOK(); renderHome(); };
  render(screen);
}

/* ================= 根拠の説明 ================= */
function renderEvidence() {
  const screen = el(`<div class="screen">
    <div class="topbar"><div class="ex-title">このアプリの根拠</div><button class="quit-btn" id="back">戻る</button></div>
    <div class="card evidence">
      <p>🌿 <b>生活習慣(最重要)</b><br>Lancet委員会2024年報告: 運動不足・社会的孤立・高血圧・過度の飲酒・聴力/視力の未治療など14の修正可能因子が、認知症全体の約45%を占めると推計。チェック項目はこの因子に対応しています。</p>
      <p>💡 <b>新しいことへの挑戦</b><br>高齢者が「新しく複雑な技能(写真・キルトなど)」を学んだ群は、受動的なゲーム群より記憶・認知が改善(Synapse Project)。毎日の「チャレンジ」はこの知見にもとづきます。</p>
      <p>🎯 <b>二重注意・処理速度</b><br>ACTIVE試験(2,802人のRCT)で、適応型の「処理速度トレーニング」を受けた群は10年後の認知症リスクが約29%低下。記憶・推理の訓練では有意な低下は見られませんでした。継続(ブースター)受講で20年後も有意。</p>
      <p>🌗 <b>デュアルタスク</b><br>認知+運動の二重課題トレーニングは、注意・言語流暢性・空間認知を有意に改善(複数のRCT)。</p>
      <p>⚡ <b>高速計算・音読(学習療法)</b><br>川島隆太らの研究。簡単な課題を「速く・毎日」行うことで前頭前野(背外側部)が活性化し、認知機能の維持・改善が報告されています。</p>
      <p>🧩 <b>ワーキングメモリ(Nバック)・抑制制御(ストループ)</b><br>注意・実行機能の訓練として採用。広い転移効果は限定的ですが、ベンチマークとして経時変化を追う指標にしています。</p>
      <p>🗣️ <b>音声流暢性(意味流暢性)</b><br>「60秒で動物名を挙げる」は軽度認知障害(MCI)のスクリーニングで標準的に使われる検査です。語彙の検索力・実行機能を反映し、経時変化の指標として有用とされます。</p>
      <p>🐵 <b>モンキーテスト(視空間ワーキングメモリ)</b><br>京大のチンパンジ「アユム」が人間を上回った課題の再現。一瞬表示された数字の位置を覚えて順番に押す検査で、視空間の記憶と処理速度を同時に測ります。</p>
      <p>📈 <b>記録の分析</b><br>ベンチマーク2回分から、領域ごとの改善・低下を自動判定します。反応速度や語数の変動は認知変化の早期サインとされます。</p>
      <p style="color:var(--muted);font-size:15px">※ 本アプリは医療機器ではなく、認知症予防の効果を保証するものではありません。気になる症状は医療機関にご相談ください。</p>
      <div class="refs">
        <div class="refs-title">📚 参考にした研究</div>
        <a class="ref-link" href="https://doi.org/10.1016/S0140-6736(24)01296-0" target="_blank" rel="noopener">Lancet委員会: 認知症の予防・介入・ケア 2024年報告(修正可能14因子で約45%)</a>
        <a class="ref-link" href="https://doi.org/10.1016/j.trci.2017.09.002" target="_blank" rel="noopener">ACTIVE試験: 処理速度トレーニングが10年後の認知症リスクを29%低下(Edwards et al., 2017)</a>
        <a class="ref-link" href="https://doi.org/10.1177/0956797613499592" target="_blank" rel="noopener">Synapse Project: 新しい複雑な技能の学習が高齢者の記憶を改善(Park et al., 2014)</a>
        <a class="ref-link" href="https://doi.org/10.1016/j.cub.2007.10.027" target="_blank" rel="noopener">モンキーテストの原論文: チンパンジ「アユム」の数字記憶(Inoue & Matsuzawa, 2007)</a>
        <a class="ref-link" href="https://doi.org/10.1016/j.neuropsychologia.2004.02.001" target="_blank" rel="noopener">音声流暢性のメタ分析: 意味流暢性とアルツハイマー型認知症(Henry et al., 2004)</a>
        <a class="ref-link" href="https://pubmed.ncbi.nlm.nih.gov/?term=Kawashima+reading+aloud+arithmetic+calculation+frontal" target="_blank" rel="noopener">学習療法(川島隆太ら): 音読・計算で前頭前野が活性化(PubMedの関連論文)</a>
        <a class="ref-link" href="https://pubmed.ncbi.nlm.nih.gov/?term=dual-task+training+cognitive+function+older+adults" target="_blank" rel="noopener">デュアルタスク訓練と認知機能(PubMedの関連論文)</a>
      </div>
    </div>
  </div>`);
  $('#back', screen).onclick = () => renderHome();
  render(screen);
}

/* ================= PWA ================= */
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

if (state.seenIntro) renderHome(); else renderWelcome();
