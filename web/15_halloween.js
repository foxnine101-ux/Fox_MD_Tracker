"use strict";
// ---------- ハロウィンパーティ 2026(サブタブ: ガーリン次郎のMD / ランタンハント) ----------
// 出典: 公式特設ページ https://ragnarokonline.gungho.jp/special/halloweenparty2026/ (期間 2026-10-20 〜 11-10 のメンテナンス開始まで)
// 巨大ガーリン次郎(稀に出現)が出るメモリアルダンジョン。g = Fox のMDの表の列の名前(無いものは "")。drop: 盾 = ディザスターシールド・耳 = ディザスターイヤリング
const HW_JIRO = [
  { nm: "星座の塔", map: "1@ct4", at: "星座の塔 女神の祭壇", x: 39, y: 90, drop: "盾", g: "星座の塔" },
  { nm: "生体工学研究所の記録（4thモード）", map: "1@gol2b2", at: "死体保管所(4th)", x: 49, y: 26, drop: "盾", g: "生体工学研究所の記録‐4th" },
  { nm: "生命の殿堂", map: "1@hol4", at: "生命の殿堂 攻略エリア3", x: 54, y: 50, drop: "耳", g: "生命の殿堂" },
  { nm: "欺瞞の別荘", map: "3@advs", at: "欺瞞の別荘(礼拝堂)", x: 123, y: 352, drop: "盾", g: "欺瞞の別荘" },
  { nm: "悔恨の墓", map: "3@spa2", at: "地下墓地", x: 211, y: 55, drop: "盾", g: "悔恨の墓" },
  { nm: "呪われた次元（3rd）", map: "4@gl_he", at: "汚染された次元", x: 158, y: 239, drop: "耳", g: "" },
  { nm: "呪われた次元（4th）", map: "4@ghc4", at: "呪いの源", x: 158, y: 235, drop: "耳", g: "呪われた次元（4th）" },
  { nm: "タナトスの記憶", map: "9@thts23", at: "タナトスの記憶 13", x: 136, y: 132, drop: "耳", g: "" },
  { nm: "試練の迷宮", map: "4@la_00", at: "夢の終点", x: 133, y: 194, drop: "盾", g: "夢幻の迷宮" },
  { nm: "封印の迷宮", map: "4@lb_00", at: "夢の終点", x: 133, y: 194, drop: "耳", g: "夢幻の迷宮" },
  { nm: "異形の迷宮", map: "4@lc_00", at: "夢の終点", x: 131, y: 73, drop: "耳", g: "夢幻の迷宮" },
  { nm: "幻影の迷宮", map: "4@ld100", at: "夢の終点", x: 61, y: 149, drop: "盾", g: "夢幻の迷宮" },
  { nm: "幻影の迷宮", map: "4@ld200", at: "夢の終点", x: 133, y: 194, drop: "耳", g: "夢幻の迷宮" },
  { nm: "幻影の迷宮(幻影ルート)", map: "4@le100", at: "夢の終点", x: 61, y: 149, drop: "耳", g: "夢幻の迷宮" },
  { nm: "幻影の迷宮(試練ルート)", map: "4@lf200", at: "夢の終点", x: 133, y: 194, drop: "盾", g: "夢幻の迷宮" },
  { nm: "亜空の迷宮", map: "4@lg100", at: "夢の終点", x: 185, y: 180, drop: "盾", g: "夢幻の迷宮" },
  { nm: "ファロス燈台地下迷宮(ノーマル)", map: "7@infi", at: "無限の空間(深部)", x: 366, y: 366, drop: "盾", g: "ファロス燈台地下迷宮" },
  { nm: "ファロス燈台地下迷宮(ハード)", map: "7@a_inf", at: "無限の空間(深部)", x: 366, y: 366, drop: "盾", g: "ファロス燈台地下迷宮" },
  { nm: "特異点 名もなき島（ノーマル）", map: "1@nls5", at: "隠された礼拝堂", x: 58, y: 42, drop: "盾", g: "特異点 名もなき島" },
  { nm: "特異点 名もなき島（インフェルノ）", map: "2@nls5", at: "隠された礼拝堂", x: 58, y: 42, drop: "耳", g: "特異点 名もなき島" },
  { nm: "特異点 生体工学研究所（インフェルノ）", map: "2@lhj8", at: "02 観測エリア", x: 55, y: 152, drop: "耳", g: "" },
  { nm: "特異点 タナトスタワー（インフェルノ）", map: "1@thj27", at: "頂上", x: 135, y: 130, drop: "盾", g: "" },
  { nm: "特異点 タナトスタワー（チャレンジ）", map: "2@thj27", at: "頂上", x: 135, y: 130, drop: "耳", g: "" },
];
const HW_DROPN = { "盾": "ディザスターシールド", "耳": "ディザスターイヤリング" };
let HWV = store.get("md_hwv") || "jiro", HW_DROP = "all", HW_ONLYOK = false;
const hwNav = () => `<div class="simnav"><button data-hwv="jiro" class="${HWV === "jiro" ? "on" : ""}">ガーリン次郎のMD</button><button data-hwv="lantern" class="${HWV === "lantern" ? "on" : ""}">ランタンハント</button><button data-hwv="exp" class="${HWV === "exp" ? "on" : ""}">経験値</button></div>`;
function renderHalloween(chars, now) {
  const body = HWV === "lantern" ? lntHtml(chars) : HWV === "exp" ? hwExpHtml(chars, now) : hwJiroHtml(chars, now);
  $("#view").innerHTML = `${hwNav()}${body}`;
  $("#view").querySelectorAll("[data-hwv]").forEach((b) => b.onclick = () => { HWV = b.dataset.hwv; store.set("md_hwv", HWV); render(); });
  if (HWV === "lantern") lntBind(chars); else if (HWV === "exp") hwExpBind(); else hwJiroBind();
}
// ---- ガーリン次郎のMD: 対象のMDだけ抜き出したマトリクス(メインの表と同じ記録・同じ見方) ----
function hwJiroHtml(chars, now) {
  const groups = new Map(buildGroups().map((G) => [G.name, G]));
  const ents = HW_JIRO.filter((e) => HW_DROP === "all" || e.drop === HW_DROP);
  let cols = [];
  for (const e of ents) {
    const key = e.g || "x:" + e.nm; let col = cols.find((c) => c.key === key);
    if (!col) { col = { key, name: e.g || e.nm, G: e.g ? groups.get(e.g) || null : null, ents: [] }; cols.push(col); }
    col.ents.push(e);
  }
  if (HW_ONLYOK) cols = cols.filter((c) => c.G && chars.some((ch) => { const t = endOf(ch, c.G); return t !== null && t <= now; }));
  const chip = (c) => [...new Set(c.ents.map((e) => e.drop))].map((d) => `<span class="hwd hwd-${d === "盾" ? "s" : "e"}" title="${esc(HW_DROPN[d])}">${d}</span>`).join("");
  let h = `<div class="panel" style="padding:10px 14px"><b>ハロウィンパーティ 2026 ～ガーリン次郎～</b> <span class="muted">（10/20 メンテ後 〜 11/10 メンテ開始まで）</span>
    <div class="muted" style="font-size:12px;margin-top:4px">メモリアルダンジョンに出る<b>巨大ガーリン次郎（稀）</b>は、ディザスターシールド(<span class="hwd hwd-s">盾</span>)・ディザスターイヤリング(<span class="hwd hwd-e">耳</span>)を落とします。少なめに出るガーリン次郎は ハロウィンコイン。下は、対象のMDだけを抜き出した表です（● = いま行ける / 数字 = あと何時間 / ー = 記録なし）。出典: <a href="https://ragnarokonline.gungho.jp/special/halloweenparty2026/" target="_blank" rel="noopener">公式特設ページ</a></div></div>
    <div class="opts"><span>落とすもの:</span> ${[["all", "すべて"], ["盾", "シールド"], ["耳", "イヤリング"]].map(([v, l]) => `<label><input type="radio" name="hwdrop" value="${v}" ${HW_DROP === v ? "checked" : ""}> ${l}</label>`).join("")}
      <label><input type="checkbox" id="hwonlyok" ${HW_ONLYOK ? "checked" : ""}> 行けるMDがある列だけ</label></div>`;
  if (!chars.length) return h + `<div class="panel empty">まだキャラの記録がありません。</div>`;
  h += `<div class="panel tablewrap"><table><thead><tr><th class="char">キャラ</th>` + cols.map((c) => `<th title="${esc(c.ents.map((e) => e.nm + "（" + e.drop + "）").join("\n"))}${c.G ? "" : "\nこのMDは、MDの表に列がありません(クエストの記録を読めていません)"}"><span class="mxn">${esc(c.name)}</span><br>${chip(c)}${c.ents.length > 1 ? ` <span class="muted" style="font-size:10px">×${c.ents.length}</span>` : ""}${c.G ? "" : ` <span class="muted" style="font-size:10px">記録なし</span>`}</th>`).join("") + `</tr></thead><tbody>`;
  for (const ch of chars) {
    h += `<tr data-char="${esc(ch)}"><td class="char" title="${esc(cn(ch))}">${esc(cn(ch))}${carryChip(ch)}<span class="ch-sub">${esc(charLvText(ch))}${jobChip(charJob(ch))}</span></td>`;
    for (const c of cols) {
      const t = c.G ? endOf(ch, c.G) : null;
      if (t === null) h += `<td class="cell none">ー</td>`;
      else if (t <= now) h += `<td class="cell okc">●</td>`;
      else { const r = t - now; h += `<td class="cell ${r < 3 * 3600 ? "soon" : "wait"}">${remain(r)}<span class="when">${when(t)}</span></td>`; }
    }
    h += `</tr>`;
  }
  h += `</tbody></table></div>`;
  h += `<h3 style="margin:12px 0 4px;font-size:13px">出現場所（巨大ガーリン次郎）</h3><div class="panel tablewrap"><table class="hwt"><thead><tr><th>MD</th><th>出現マップ</th><th>座標</th><th>落とすもの</th></tr></thead><tbody>`
    + ents.map((e) => `<tr><td>${esc(e.nm)}</td><td>${esc(e.at)} <span class="muted">(${esc(e.map)})</span></td><td>${e.x}, ${e.y}</td><td><span class="hwd hwd-${e.drop === "盾" ? "s" : "e"}">${e.drop}</span> ${esc(HW_DROPN[e.drop])}</td></tr>`).join("") + `</tbody></table></div>`;
  return h;
}
function hwJiroBind() {
  $("#view").querySelectorAll("input[name=hwdrop]").forEach((r) => r.onchange = () => { HW_DROP = r.value; render(); });
  const o = $("#hwonlyok"); if (o) o.onchange = () => { HW_ONLYOK = o.checked; render(); };
}
// ---- 経験値(ニャル様のタブと同じ見方): ミニスパイダリン捕獲作戦(1アカウント1日1回)・リベンジャーズ・ナイト(1アカウント1週1回) ----
// 出典: 公式特設ページの表(2026-10-20 に原文を確認)。4次職以外は BaseLv に関係なく同じ。経験値は分割して受け取ることがある。
const HW_EXP_ROWS = [      // [BaseLv の下限, 上限, スパイダリン Base, 同 Job, リベンジャーズ Base, 同 Job]
  [200, 209, 56.25e9, 42.1875e9, 22.5e9, 16.875e9], [210, 219, 84.375e9, 63.28125e9, 33.75e9, 25.3125e9], [220, 229, 112.5e9, 84.375e9, 45e9, 33.75e9],
  [230, 239, 154.5e9, 115.875e9, 61.8e9, 46.35e9], [240, 249, 206.5e9, 154.875e9, 82.6e9, 61.95e9], [250, 259, 292.5e9, 219.375e9, 117e9, 87.75e9],
  [260, 269, 427.5e9, 269.325e9, 171e9, 107.73e9], [270, 284, 632.8e9, 314.1e9, 253.12e9, 125.64e9],
];
const HW_EXP_NON4 = [15e9, 7.5e9, 6e9, 3e9];                 // 4次職以外
const HW_EXP_MAX = [0, 314.1e9, 0, 125.64e9];                // 4次職・BaseLv 285 かつ JobLv 65 未満(Base なし)
const HW_FOURTH = new Set(["ドラゴンナイト", "マイスター", "シャドウクロス", "アークメイジ", "カーディナル", "ウィンドホーク", "インペリアルガード", "バイオロ", "アビスチェイサー", "エレメンタルマスター", "インクイジター", "トルバドゥール", "トルヴェール", "天帝", "ソウルアセティック", "蜃気楼", "不知火", "ナイトウォッチ", "ハイパーノービス", "スピリットハンドラー"]);
const HW_END = Date.UTC(2026, 10, 9, 23, 0) / 1000;           // 11/10(火) 8:00(日本時間)ごろ = 定期メンテナンス開始(目安)
const hwDayKey = (now) => Math.floor((now + 9 * 3600 - 5 * 3600) / 86400);      // デイリーは 5:00(日本時間)で切りかわる
function hwExpOf(c) {                 // そのキャラの 1回あたり [スパイダリン Base, Job, リベンジャーズ Base, Job] と区分の名前
  const info = DATA.chars[c] || {}, st = ((((DATA.equip || {}).chars || {})[c]) || {}).status || {};
  const lv = st.lv ?? info.lv ?? 0, jlv = st.jobLv ?? info.jobLv ?? 0, job = charJob(c), four = HW_FOURTH.has(job);
  if (!four) return { v: HW_EXP_NON4, label: job ? "4次職以外" : "4次職以外（職業不明）", lv, jlv };
  if (lv >= 285) return jlv && jlv < 65 ? { v: HW_EXP_MAX, label: "285・JobLv65未満（Baseなし）", lv, jlv } : { v: [0, 0, 0, 0], label: "対象外（285・JobLv65以上）", lv, jlv };
  const r = HW_EXP_ROWS.find((x) => lv >= x[0] && lv <= x[1]);
  return r ? { v: r.slice(2), label: `4次職 BaseLv ${r[0]}〜${r[1]}`, lv, jlv } : { v: HW_EXP_NON4, label: "4次職（Lv200未満）", lv, jlv };
}
function hwExpHtml(chars, now) {
  const C = SETTINGS.hwExp || {}, dk = hwDayKey(now), ws = weekStart(now);
  const known = [...new Set(chars.map((c) => accOfChar(c)).filter(Boolean))];
  const accOf = (c) => accOfChar(c) || (known.length === 1 ? known[0] : "?");
  const accs = new Map();
  for (const c of chars) { const a = accOf(c); if (!accs.has(a)) accs.set(a, { chars: [] }); accs.get(a).chars.push(c); }
  const left = (a) => {               // アカウントの残りの回数(いまの分が済みでなければ +1、このあとのリセットの数)
    const A = accs.get(a), spDone = A.chars.some((c) => (C[c] || {}).sp === dk), rvDone = A.chars.some((c) => (C[c] || {}).rv === ws);
    let sp = spDone ? 0 : 1, rv = rvDone ? 0 : 1;
    for (let t = (dk + 1) * 86400 - 4 * 3600; t < HW_END; t += 86400) sp++;       // 次のリセット(5:00)が 終わりより前の数
    for (let t = ws + 7 * 86400; t < HW_END; t += 7 * 86400) rv++;
    return { sp, rv, spDone, rvDone };
  };
  const live = now < HW_END;
  let h = `<div class="cards"><div class="panel card"><span>開催期間</span><b>10/20〜11/10</b><span>${live ? "開催中" : "終了"}・メンテナンス開始まで（目安 11/10 8:00）</span></div>
    <div class="panel card"><span>デイリーのリセット</span><b>${remain((dk + 1) * 86400 - 4 * 3600 - now)}</b><span>毎日 5:00</span></div>
    <div class="panel card"><span>ウィークリーのリセット</span><b>${remain(ws + 7 * 86400 - now)}</b><span>火曜 12:00</span></div>`;
  for (const [a] of accs) { const L = left(a); h += `<div class="panel card"><span>${esc(accLabel(a))}</span><b>スパイダリン 残り ${L.sp} 回</b><span>今日 ${L.spDone ? "済" : "まだ"}・リベンジャーズ 残り ${L.rv} 回（今週 ${L.rvDone ? "済" : "まだ"}）</span></div>`; }
  h += `</div>`;
  const rows = chars.map((c) => ({ c, e: hwExpOf(c), a: accOf(c) })).sort((x, y) => (y.e.v[0] + y.e.v[1]) - (x.e.v[0] + x.e.v[1]) || y.e.lv - x.e.lv);
  const best = new Map(); for (const r of rows) if (!best.has(r.a) && r.e.v[0] + r.e.v[1] > 0) best.set(r.a, r.c);
  const pair = (b, j) => b || j ? `${b ? oku(b) : "なし"} / ${oku(j)}` : "-";
  h += `<h2>キャラ別（1回あたりの経験値が多い順）</h2><div class="panel tablewrap"><table><thead><tr><th class="char">キャラ</th><th>Base/Job</th><th>区分</th><th>スパイダリン 1回<br><span class="muted">Base / Job</span></th><th>リベンジャーズ 1回<br><span class="muted">Base / Job</span></th><th>やった</th><th>残りを全部やると<br><span class="muted">Base / Job</span></th></tr></thead><tbody>`;
  for (const r of rows) {
    const L = left(r.a), v = r.e.v, mine = C[r.c] || {};
    const tot = [v[0] * L.sp + v[2] * L.rv, v[1] * L.sp + v[3] * L.rv];
    h += `<tr data-char="${esc(r.c)}"><td class="char">${esc(cn(r.c))}${best.get(r.a) === r.c && accs.size > 0 ? ` <span class="tag on" title="このアカウントで、1回あたりの経験値がいちばん多いキャラ">いちばん</span>` : ""}${jobChip(charJob(r.c))}</td>
      <td>${r.e.lv || "?"}/${r.e.jlv || "?"}</td><td class="muted" style="text-align:left">${esc(r.e.label)}</td><td>${pair(v[0], v[1])}</td><td>${pair(v[2], v[3])}</td>
      <td><label title="このキャラで、今日のスパイダリンを済ませた(アカウントでは1日1回。同じアカウントのキャラは、済み扱いになります)"><input type="checkbox" data-hwdone="sp" data-c="${esc(r.c)}" ${mine.sp === dk ? "checked" : ""}>今日</label>
        <label title="このキャラで、今週のリベンジャーズ・ナイトを済ませた(アカウントでは週1回)"><input type="checkbox" data-hwdone="rv" data-c="${esc(r.c)}" ${mine.rv === ws ? "checked" : ""}>今週</label></td>
      <td>${tot[0] || tot[1] ? pair(tot[0], tot[1]) : "-"}</td></tr>`;
  }
  h += `</tbody></table></div><p class="hint">出典: 公式特設ページ（ミニスパイダリン捕獲作戦 = 1アカウント1日1回・リベンジャーズ・ナイト = 1アカウント1週間に1回）。経験値は分割して受け取ることがあります。「残りを全部やると」は、そのキャラが残りの回数を全部やったときの合計です（残りの回数は、アカウントごと・目安）。「やった」は手で付けます（毎日 5:00・火曜 12:00 に、自動で外れます）。区分は、キャラの職業と BaseLv から決めています（職業が分からないときは「4次職以外」の数字）。</p>`;
  return h;
}
function hwExpBind() {
  $("#view").querySelectorAll("input[data-hwdone]").forEach((b) => b.onchange = () => {
    const c = b.dataset.c, k = b.dataset.hwdone, now = Date.now() / 1000; SETTINGS.hwExp = SETTINGS.hwExp || {}; const m = SETTINGS.hwExp[c] = SETTINGS.hwExp[c] || {};
    if (b.checked) m[k] = k === "sp" ? hwDayKey(now) : weekStart(now); else delete m[k];
    if (!Object.keys(m).length) delete SETTINGS.hwExp[c];
    saveSettings(); render();
  });
}
// ---- ランタンハント: 座標の一覧(利用者が取り込む)。ナビ用のコピーと、見つけたもののチェック ----
// 一覧は「ランタンハント.json」(この PC だけ。同梱しない)。チェックは SETTINGS.lanternChecks = { キャラ(空 = 共通): { lantern: [番号…], more: […] } }
const LNT = { data: null, loading: false, msg: "", set: store.get("md_lntset") || "lantern", who: store.get("md_lntwho") || "", area: "all", q: "", todo: false, open: false };
const LNT_AREAS = [["all", "すべて"], ["town", "街・室内（1〜301）"], ["field", "フィールド（302〜600）"], ["sp", "特殊（601〜650）"]];     // 「301番まで街/室内のローテ、600番までフィールド、601〜650番が特殊配置」(一覧のルール欄)
async function lntLoad(fetchMaps) {
  if (!LOCAL) return; LNT.loading = true;
  try { LNT.data = await fetch("/api/lantern" + (fetchMaps ? "?fetch=1" : "")).then((r) => r.json()); } catch (e) { LNT.msg = "読み込めませんでした: " + e.message; }
  LNT.loading = false; if (TAB === "hw" && HWV === "lantern") render();
  if (fetchMaps && LNT.data && LNT.data.official && !LNT.data.mapn) setTimeout(() => lntLoad(false), 6000);     // 公式のマップ一覧を裏で取っている間は、少し待ってもう一度(マップ ID が引ける)
}
async function lntPost(body) {
  try {
    const r = await fetch("/api/lantern", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), j = await r.json();
    LNT.msg = j.msg || (j.ok === false ? "失敗しました" : ""); if (j.sets) LNT.data = j;
  } catch (e) { LNT.msg = "失敗しました: " + e.message; }
  render();
}
const lntChecks = () => { SETTINGS.lanternChecks = SETTINGS.lanternChecks || {}; const w = SETTINGS.lanternChecks[LNT.who] = SETTINGS.lanternChecks[LNT.who] || {}; return (w[LNT.set] = w[LNT.set] || []); };
function lntNavi(it) {              // コピーする文字: マップ ID が分かれば /navi2、分からなければ 名前 X/Y
  const m = (LNT.data.ids || {})[it.map] || {}, id = m.id;
  return id ? { cmd: `/navi2 ${id} ${it.x}/${it.y} 1/1/1`, kind: m.how } : { cmd: `${it.map} ${it.x}/${it.y}`, kind: "" };
}
function lntHtml(chars) {
  if (!LOCAL) return `<div class="panel empty">ランタンハントは、パソコンで動かしている Fox_MD_Tracker の画面で使えます。</div>`;
  if (!LNT.data) { if (!LNT.loading) lntLoad(true); return `<div class="panel empty">読み込んでいます…</div>`; }
  const D = LNT.data, S = (D.sets || {})[LNT.set], items = (S && S.items) || [];
  const setTabs = `<div class="opts"><span>一覧:</span><label><input type="radio" name="lntset" value="lantern" ${LNT.set === "lantern" ? "checked" : ""}> ランタン・ハント</label><label><input type="radio" name="lntset" value="more" ${LNT.set === "more" ? "checked" : ""}> もっとランタン・ハント</label></div>`;
  const imp = `<details class="panel" style="padding:8px 12px" ${LNT.open || !items.length ? "open" : ""} id="lntimp"><summary><b>データの取り込み</b> <span class="muted">${items.length ? `（${items.length} か所入っています。足す・入れ直す）` : (LNT.data && LNT.data.needkey ? "（座標は、設定の「利用キー」を登録すると最初から入ります。自分で貼り付けて取り込むこともできます）" : "（まだ入っていません）")}</span></summary>
    <div class="muted" style="font-size:12px;margin:6px 0">ランタン・ハントの座標（650か所）は、最初から入っています（出典: スプレッドシート「2610ハロウィン」・RO忘備録 sites.google.com/view/romemo。2024年と同じ座標）。ランタンを追加で見つけたときや、「もっとランタン・ハント」は、ここから足せます。リンクで共有されているスプレッドシートの URL を入れるか、番号・マップ名・X・Y・備考 の列をコピーして貼り付けてください（何回かに分けて貼ってよい。同じ番号は新しいもので置きかえ）。</div>
    <div class="opts"><input id="lntu" type="text" placeholder="スプレッドシートの URL（https://docs.google.com/spreadsheets/d/…）" value="${esc(store.get("md_lnturl") || "")}" style="min-width:340px"><button class="ghost" id="lntgo">URL から取り込む</button></div>
    <textarea id="lntt" rows="4" style="width:100%;margin-top:6px" placeholder="ここに貼り付け（例: 3, プロンテラ, 155, 290, 握手像裏 ／ スプレッドシートからコピーした列そのままでも可）"></textarea>
    <div class="opts"><button class="ghost" id="lntpaste">貼り付けた分を取り込む</button><label class="ghost" style="cursor:pointer">ファイルから <input type="file" id="lntf" accept=".csv,.tsv,.txt" hidden></label>${items.length ? `<button class="ghost" id="lntcopy" title="この一覧を、貼り付けで取り込める形でコピーします。身内にチャットなどで送ると、受け取った人は貼り付けるだけで取り込めます">この一覧をコピー（人に渡す用）</button><button class="ghost" id="lntclr">この一覧を消す</button>` : ""}${S && S.src !== "同梱" ? `<button class="ghost" id="lntreseed" title="取り込んだ一覧を捨てて、最初から入っている座標に戻します">同梱の座標に戻す</button>` : ""}<span class="muted">${esc(LNT.msg)}</span></div></details>`;
  if (!items.length) return setTabs + imp;
  const checks = new Set(((((SETTINGS.lanternChecks || {})[LNT.who]) || {})[LNT.set]) || []);
  const inArea = (it) => LNT.set !== "lantern" || LNT.area === "all" || (LNT.area === "town" ? it.n <= 301 : LNT.area === "field" ? it.n >= 302 && it.n <= 600 : it.n >= 601);
  const q = ratNorm(LNT.q), list = items.filter((it) => inArea(it) && (!q || ratNorm(it.map + " " + it.memo).includes(q)) && (!LNT.todo || !checks.has(it.n)));
  const done = items.filter((it) => checks.has(it.n)).length, nextIt = list.find((it) => !checks.has(it.n));
  const who = `<select id="lntwho"><option value="">共通（みんなで1つ）</option>${chars.map((c) => `<option value="${esc(c)}" ${LNT.who === c ? "selected" : ""}>${esc(cn(c))}</option>`).join("")}</select>`;
  let h = setTabs + `<div class="panel" style="padding:10px 14px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>見つけた ${done} / ${items.length}</b>
      <span class="lbar"><i style="width:${items.length ? Math.round(done * 100 / items.length) : 0}%"></i></span> <span class="muted">チェックの対象:</span> ${who}</div>
    <div class="opts" style="margin-top:6px"><select id="lntarea" ${LNT.set === "lantern" ? "" : "hidden"}>${LNT_AREAS.map(([v, l]) => `<option value="${v}" ${LNT.area === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input id="lntq" type="search" placeholder="マップ名・メモで絞る" value="${esc(LNT.q)}"><label><input type="checkbox" id="lnttodo" ${LNT.todo ? "checked" : ""}> 未発見だけ</label>
      ${nextIt ? `<button class="ghost" data-lcp="${esc(lntNavi(nextIt).cmd)}" title="${esc(nextIt.n + "番 " + nextIt.map + " " + nextIt.x + "," + nextIt.y)}">次の未発見をコピー（${nextIt.n}番）</button>` : ""}
      <span class="muted">${list.length} 件を表示</span></div></div>`;
  h += `<div class="panel tablewrap"><table class="lnt"><thead><tr><th>✓</th><th>番号</th><th>ナビ</th><th>マップ</th><th>X</th><th>Y</th><th>メモ</th></tr></thead><tbody>`
    + list.map((it) => { const nv = lntNavi(it), m = (D.ids || {})[it.map] || {}, on = checks.has(it.n);
      return `<tr class="${on ? "done" : ""}"><td><input type="checkbox" data-lck="${it.n}" ${on ? "checked" : ""}></td><td>${it.n}</td><td><button class="navi" data-lcp="${esc(nv.cmd)}" data-lmap="${esc(it.map)}" title="クリックでコピー（チャットに貼り付けて実行）。右クリック = このマップの ID を決める">${m.id ? "/navi2" : "コピー"}</button></td><td>${esc(it.map)}${m.id ? ` <span class="muted lid" title="${m.how === "手" ? "自分で決めたマップ ID" : m.how === "公式" ? "公式サイトのマップ一覧から" : "名前の決まりからの推定(違っていたら、右クリックで直せます)"}">${esc(m.id)}${m.how === "推定" ? "?" : ""}</span>` : ""}</td><td>${it.x}</td><td>${it.y}</td><td class="muted">${esc(it.memo)}</td></tr>`; }).join("")
    + `</tbody></table></div><p class="hint">ナビ = <code>/navi2 マップID X/Y 1/1/1</code> をコピーします（チャットに貼り付けると経路案内。マップ ID が分からない所は「マップ名 X/Y」をコピー）。マップ ID は、公式サイトのマップ一覧と名前の決まりから出しています（<span class="muted">?</span> は推定）。違うときは、ナビのボタンを右クリックして直せます。</p>`;
  return h + imp;
}
function lntBind(chars) {
  const v = $("#view");
  v.querySelectorAll("input[name=lntset]").forEach((r) => r.onchange = () => { LNT.set = r.value; store.set("md_lntset", LNT.set); render(); });
  const w = $("#lntwho"); if (w) w.onchange = () => { LNT.who = w.value; store.set("md_lntwho", LNT.who); render(); };
  const a = $("#lntarea"); if (a) a.onchange = () => { LNT.area = a.value; render(); };
  const q = $("#lntq"); if (q) q.oninput = () => { LNT.q = q.value; clearTimeout(LNT.qt); LNT.qt = setTimeout(() => { render(); const e = $("#lntq"); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }, 300); };
  const t = $("#lnttodo"); if (t) t.onchange = () => { LNT.todo = t.checked; render(); };
  v.querySelectorAll("[data-lck]").forEach((c) => c.onchange = () => {              // 見つけた・見つけていない
    const n = +c.dataset.lck, arr = lntChecks(), i = arr.indexOf(n); if (c.checked && i < 0) arr.push(n); else if (!c.checked && i >= 0) arr.splice(i, 1);
    saveSettings(); render();
  });
  v.querySelectorAll("[data-lcp]").forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.lcp); } catch (e) { const ta = document.createElement("textarea"); ta.value = b.dataset.lcp; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e2) {} ta.remove(); } b.classList.add("copied"); setTimeout(() => b.classList.remove("copied"), 1200); });
  v.querySelectorAll("[data-lmap]").forEach((b) => b.oncontextmenu = (e) => {       // マップ ID を手で決める
    e.preventDefault(); const nm = b.dataset.lmap, cur = ((LNT.data.ids || {})[nm] || {}).id || "";
    const id = prompt(`「${nm}」のマップ ID（例: prontera, prt_fild00）。空にすると、手で決めたものを消します。`, cur);
    if (id !== null) lntPost({ action: "mapid", name: nm, id: id.trim() });
  });
  const imp = $("#lntimp"); if (imp) imp.ontoggle = () => { LNT.open = imp.open; };
  const go = $("#lntgo"); if (go) go.onclick = () => { const u = $("#lntu").value.trim(); if (!u) { LNT.msg = "URL を入れてください"; return render(); } store.set("md_lnturl", u); LNT.msg = "取り込んでいます…（シートごとに少し間をあけて取ります）"; LNT.open = true; render(); lntPost({ action: "sheet", set: LNT.set, url: u }); };
  const pa = $("#lntpaste"); if (pa) pa.onclick = () => { const x = $("#lntt").value; if (!x.trim()) { LNT.msg = "貼り付ける文字がありません"; return render(); } LNT.open = true; lntPost({ action: "text", set: LNT.set, text: x }); };
  const fl = $("#lntf"); if (fl) fl.onchange = async () => { const f = fl.files[0]; if (!f) return; LNT.open = true; lntPost({ action: "text", set: LNT.set, text: await f.text() }); };
  const cp = $("#lntcopy"); if (cp) cp.onclick = async () => {
    const S = ((LNT.data || {}).sets || {})[LNT.set], txt = ((S && S.items) || []).map((it) => [it.n, it.map, it.x, it.y, it.memo].join("\t")).join("\n");
    try { await navigator.clipboard.writeText(txt); LNT.msg = `${S.items.length} か所をコピーしました（チャットなどに貼り付けて送れます）`; } catch (e) { LNT.msg = "コピーできませんでした"; } render();
  };
  const rs = $("#lntreseed"); if (rs) rs.onclick = () => lntPost({ action: "reseed", set: LNT.set });
  const cl = $("#lntclr"); if (cl) cl.onclick = () => { if (confirm("この一覧(座標のデータ)を消します。見つけたもののチェックは残ります。")) lntPost({ action: "clear", set: LNT.set }); };
}
