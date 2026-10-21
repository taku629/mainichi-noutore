import { $, el, todayKey, daysBetween, WDAYS, randInt } from './util.js';
import { state, setState, sanitizeState, save, isActiveDay, currentStreak, lastBench, maxStreak, coachBusy, setCoachBusy, famAk, famMk, kvGet, kvSet } from './store.js';
import { sndTap, sndOK } from './audio.js';
import { clearTimers, startSession } from './session.js';

/* ================= 画面ヘルパー ================= */
const app = $('#app');
export function applyFont() {
  document.body.classList.toggle('bigtext', !!state.bigText);
  document.body.classList.toggle('dark', !!state.dark);
}

export function render(node) {
  clearTimers();
  try { speechSynthesis.cancel(); } catch (e) {}
  app.innerHTML = '';
  app.appendChild(node);
  window.scrollTo(0, 0);
  applyFont();
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
export function benchTrends() {
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

export function spark(pts, w = 110, h = 30) {
  const min = Math.min(...pts), max = Math.max(...pts), r = (max - min) || 1;
  const step = w / (pts.length - 1);
  const str = pts.map((v, i) => `${(i * step).toFixed(1)},${(h - 4 - (v - min) / r * (h - 8)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}"><polyline points="${str}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function coachPrompt() {
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

export function benchAnalysis() {
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
export function renderHome() {
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
        setState(sanitizeState(obj));
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
    setCoachBusy(true);
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
    setCoachBusy(false);
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
export function renderWeekReport() {
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
export function renderGuide() {
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
export function renderWelcome() {
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
export function renderEvidence() {
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
