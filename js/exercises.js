import { clamp, randInt, shuffle, el, normJp } from './util.js';
import { state, save } from './store.js';
import { session, addTimer } from './session.js';
import { sndOK, sndNG, sndTap, sndDone } from './audio.js';

/* ================= ベンチマーク種目1: 二重注意 =================
   ACTIVE試験の速度訓練(中央課題+周辺標的の同時処理)を再現。
   表示時間を成績に応じて自動で変える階段法。 */
const DD_CENTERS = [['🚗', '乗用車'], ['🚚', 'トラック']];
const DD_POS = [ // 8方位(3x3の外周セル)。[x%, y%] がステージ内位置
  [16.6, 16.6], [50, 12], [83.3, 16.6],
  [12, 50], [88, 50],
  [16.6, 83.3], [50, 88], [83.3, 83.3],
];

export function exDualAttention(container, finish) {
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
export function exRapidCalc(container, finish) {
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
export function exNBack(container, finish) {
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
export function exDualTask(container, finish) {
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

export function exStroopTimed(container, finish) {
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

export function exVerbalFluency(container, finish) {
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
export function exMonkey(container, finish) {
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
export function exVisualSearch(container, finish) {
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
export function exDigitSpan(container, finish) {
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
export function exWordRecog(container, finish) {
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
export function exTrailMaking(container, finish) {
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
export function exSymbolMatch(container, finish) {
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
export function exShiritori(container, finish) {
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
export function exPlanRoute(container, finish) {
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
