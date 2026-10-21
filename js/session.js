import { $, el, randInt, todayKey } from './util.js';
import { state, save, lastBench, currentStreak } from './store.js';
import { sndTap, sndDone } from './audio.js';
import { render, renderHome } from './render.js';
import { exDualAttention, exRapidCalc, exNBack, exDualTask, exStroopTimed, exVerbalFluency, exMonkey, exVisualSearch, exDigitSpan, exWordRecog, exTrailMaking, exSymbolMatch, exShiritori, exPlanRoute } from './exercises.js';

export let session = null;
let sessionTimers = [];
export function addTimer(t) { sessionTimers.push(t); return t; }
export function clearTimers() { sessionTimers.forEach(t => { clearInterval(t); clearTimeout(t); }); sessionTimers = []; }
export function speakHtml(html) {
  const t = document.createElement('div'); t.innerHTML = html;
  const u = new SpeechSynthesisUtterance(t.textContent.replace(/\s+/g, ' ').trim());
  u.lang = 'ja-JP'; u.rate = .95;
  speechSynthesis.speak(u);
}

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

export function startSession() {
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

export function runExercise() {
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

export function finishSession() {
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
