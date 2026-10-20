"use strict";
// ---------- ニャル様のラッキーお散歩デイズ ----------
// 公式: https://ragnarokonline.gungho.jp/cms/news/nyar-lucky-walk-days-2609
const NYAR = {
  start: Date.parse("2026-09-29T12:00:00+09:00"),   // 9/29メンテ後(目安)
  end: Date.parse("2026-10-20T11:00:00+09:00"),     // 10/20メンテ前(目安)
  limit: 420,
  exp: [[270, 63280000000], [260, 42750000000], [250, 29250000000], [240, 20650000000], [230, 15450000000], [220, 11250000000]],
  missions: [
    ["浸食されたゲフェニア", 15, "5ミッション×3回・入場バフ中のみ報告・報告後5分CT"],
    ["破壊されたヴァルキリーレルム", 15, "5ミッション×3回・入場バフ中のみ報告・報告後5分CT"],
    ["バルムントのバイオスフィア", 15, "5ミッション×3回"],
    ["欺瞞の別荘", 20, "2ミッション(シュラン+デミフレイヤ 各5回)"],
    ["悔恨の墓", 32, "2ミッション(ティアラ姫+サクライ 各8回)"],
    ["封じられた不死者", 16, "2ミッション×8回"],
    ["変えられない最後", 16, "2ミッション×8回"],
    ["夢幻の迷宮", 40, "10階〜102階の各階"],
    ["星座の塔", 20, "5階〜75階の主・ベテルギウス"],
    ["呪われた次元（4th）", 60, "欠片01〜20・アムダライス・ヒメルメズ"],
    ["生命の殿堂", 20, "神獣4種・金の竜・リゲル"],
    ["特異点 名もなき島", 60, "暴食の力01〜20・大神官・ヴェルゼブブ"],
    ["特異点 生体工学研究所", 30, "思念体1〜8体・コア実験体"],
    ["特異点 タナトスタワー", 90, "傲慢のエナジー50〜1000点・タナトス2種"],
  ],
};
const norm = (x) => String(x).replace(/[\s　]/g, "").replace(/（/g, "(").replace(/）/g, ")").toLowerCase();
function nyarExp(lv) { for (const [lo, e] of NYAR.exp) if (lv >= lo) return e; return 0; }
function weekStart(nowSec) {   // 火曜12:00(日本時間)
  const jst = nowSec + 9 * 3600, day = Math.floor(jst / 86400), wd = (day + 3) % 7;
  let s = (day - ((wd - 1 + 7) % 7)) * 86400 + 12 * 3600 - 9 * 3600;
  if (s > nowSec) s -= 7 * 86400;
  return s;
}
// 経験値の桁: K / M / G / T (1G = 10億)
const oku = (n) => {
  for (const [v, u] of [[1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "K"]])
    if (n >= v) return (n / v).toLocaleString("en-US", { maximumFractionDigits: 2 }) + u;
  return String(n);
};

function renderNyar(groups, chars, now) {
  const ws = weekStart(now), nextReset = ws + 7 * 86400;
  const live = now * 1000 >= NYAR.start && now * 1000 < NYAR.end;
  const C = DATA.chars || {};
  const used = (c) => { const n = C[c].nyar; return n && n.week === ws ? n.count : 0; };
  // アカウントごとに合計(アカウント不明は1つにまとめる)
  const accs = new Map();
  const known = [...new Set(chars.map((c) => accOfChar(c)).filter(Boolean))];
  const accOf = (c) => accOfChar(c) || (known.length === 1 ? known[0] : "?");   // アカウントが1つしか分からなければ、不明なキャラもそれ
  for (const c of chars) {
    const a = accOf(c);
    if (!accs.has(a)) accs.set(a, { chars: [], used: 0 });
    const A = accs.get(a); A.chars.push(c); A.used += used(c);
  }
  let h = `<div class="cards">
    <div class="panel card"><span>開催期間</span><b>9/29〜10/20</b><span>${live ? "開催中" : (now * 1000 < NYAR.start ? "開催前" : "終了")}・各ミッション 火曜12:00 リセット</span></div>
    <div class="panel card"><span>今週のリセットまで</span><b>${remain(nextReset - now)}</b><span>${when(nextReset)}</span></div>`;
  for (const [a, A] of accs) {
    // ニャル様の会話で見た公式の回数(今週・いちばん新しいもの)があればそれを使う
    let off = null;
    for (const c of A.chars) { const o = (C[c].nyar && C[c].nyar.week === ws && C[c].nyar.acc_official) || null; if (o && (!off || o.t > off.t)) off = o; }
    if (off && off.n >= 0) { A.official = off; A.used = Math.max(off.n, 0); }
  }
  for (const [a, A] of accs) {
    const pct = Math.min(100, A.used / NYAR.limit * 100);
    h += `<div class="panel card"><span>${esc(accLabel(a))} の今週の報告回数</span>
      <b>${A.used} / ${NYAR.limit}</b><span>残り ${NYAR.limit - A.used} 回${A.official ? "・公式(" + when(A.official.t) + "にニャル様で確認)" : "・ツールの記録の合計"}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }
  h += `</div>`;

  // おすすめ: 残り回数をどのキャラで使うと経験値が一番多いか
  const rows = chars.map((c) => {
    const lv = C[c].lv || 0, e = nyarExp(lv), A = accs.get(accOf(c));
    const left = Math.max(0, Math.min(NYAR.limit - used(c), NYAR.limit - A.used));
    return { c, lv, e, u: used(c), left };
  }).sort((x, y) => y.e - x.e || y.lv - x.lv);
  h += `<h2>キャラ別（1回あたりの Base経験値が多い順）</h2><div class="panel tablewrap"><table><thead><tr>
    <th class="char">キャラ</th><th>BaseLv</th><th>1回あたり</th><th>今週の報告</th><th>残りを全部使うと</th></tr></thead><tbody>`;
  for (const r of rows) {
    h += `<tr><td class="char">${esc(cn(r.c))}</td><td>${r.lv || "?"}</td>
      <td>${r.e ? oku(r.e) : '<span class="muted">対象外(220未満)</span>'}</td>
      <td>${r.u}回${C[r.c].nyar && C[r.c].nyar.week === ws && C[r.c].nyar.official ? ' <span class="tag on" title="ニャル様の会話で確認">公式</span>' : ""}</td><td>${r.e ? "+" + oku(r.e * r.left) : "-"}</td></tr>`;
  }
  h += `</tbody></table></div>
    <p class="hint">1アカウント1週間で420回まで（同じアカウントのキャラ全員の合計）。全ミッションを1キャラでやると449回分あるので、1キャラで上限まで使い切れます。報告回数は「報告して完了した専用クエスト(〜NLWD) × 公式の回数表」で自動カウント（【東部】【西部】などのサブクエストは数えない）。1回あたりの経験値は公式の表の値で、経験値アップ効果は含まない。BaseLvはキャラ選択画面・ログイン時に自動取得。</p>`;

  // ミッション一覧 × キャラ
  const showChars = rows.filter((r) => r.e).map((r) => r.c);
  const gByName = new Map(groups.map((G) => [norm(G.name), G]));
  const titles = DATA.titles || {};
  h += `<h2>対象ダンジョン（今週の状況）</h2><div class="panel tablewrap"><table><thead><tr><th class="l">ダンジョン</th><th>最大</th>`;
  for (const c of showChars) h += `<th>${esc(cn(c))}</th>`;
  h += `<th class="l">内容</th></tr></thead><tbody>`;
  for (const [md, max, note] of NYAR.missions) {
    const key = norm(md);
    const G = [...gByName.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1];
    h += `<tr><td class="l">${iconImg(md, true)}${esc(md)}</td><td>${max}</td>`;
    for (const c of showChars) {
      const q = C[c].quests || {};
      const ms = (C[c].nyar && C[c].nyar.week === ws && C[c].nyar.missions) || null;
      // ミッション(「欺瞞の別荘 1回目」など)ごとに状況を決める
      //  1) クエストに「報告済」の印がある → 報告済（報告しないともらえないので確実）
      //  2) ミッションの枠クエストを持っている → 受注中
      //  3) クエストに手がかりがない → ニャル様の会話で見た状況（古いことがあるので補助）
      const inst = new Map(), why = [];
      const ikey = (t) => norm(String(t).replace(/^【報告済】/, "").replace(/NLWD/g, ""));
      const hitKey = key.replace(/^特異点/, "");
      if (ms) for (const [k, v] of Object.entries(ms)) {
        if (/NLWD/.test(k) || !norm(k).includes(hitKey)) continue;          // 討伐などのサブクエストは除く
        inst.set(ikey(k), /報告済|完了/.test(v) ? "done" : /未受注/.test(v) ? "" : "active");
        why.push(`会話: ${k} = ${v}`);
      }
      const mine = Object.keys(q).filter((id) => /NLWD/.test(titles[id] || "") && /^(【報告済】)?NLWD/.test(titles[id]) && norm(titles[id]).includes(hitKey));
      for (const id of mine) if (!titles[id].startsWith("【報告済】") && inst.get(ikey(titles[id])) !== "done-q") inst.set(ikey(titles[id]), "active");
      for (const id of mine) if (titles[id].startsWith("【報告済】")) inst.set(ikey(titles[id]), "done-q");
      for (const id of mine) why.push(`クエスト: ${titles[id]}`);
      const vals = [...inst.values()];
      const done = vals.filter((v) => v.startsWith("done")).length;      // 報告が終わったミッション
      const active = vals.filter((v) => v === "active").length;          // 受注中のミッション
      const e = G ? endOf(c, G) : null;
      const entered = e !== null && e > now && e <= nextReset + 3600 && e >= ws;
      let cell = "";
      if (done) cell += `<span class="tag on">報告済${done}</span> `;
      // 受注はMDに入ると自動なので出さない(報告だけ見る)
      if (!done) {
        if (entered) cell += `<span class="tag">今週入場済</span>`;
        else if (e !== null && e > now) cell += `<span class="tag">CT中</span>`;
      }
      h += `<td title="${esc(why.join("\n"))}">${cell || '<span class="none">ー</span>'}</td>`;
    }
    h += `<td class="l muted">${esc(note)}</td></tr>`;
  }
  h += `</tbody></table></div>
    <p class="hint">「報告済N」= ニャル様への報告が終わったミッションの数（例: 悔恨の墓 1回目・2回目 → 報告済2）。ニャル様のクエストはMDに入ると自動で受注されるので、報告の状況だけ出しています。クエストの状態を優先し、わからない分だけニャル様の会話で補っています（マスにマウスを乗せると根拠が出ます）。「今週入場済」= そのMDのCTが今週のリセットまで残っている。</p>`;
  $("#view").innerHTML = h;
}

function renderHistory() {
  const hs = [...(DATA.history || [])].reverse().filter((x) => inServer(x.char)).slice(0, 150);
  if (!hs.length) { $("#view").innerHTML = `<div class="panel empty">まだ入場の記録がありません。</div>`; return; }
  let h = `<div class="panel tablewrap"><table class="hist"><thead><tr><th class="char">キャラ</th><th>日時</th><th>MD（内部名）</th><th>マップ</th></tr></thead><tbody>`;
  for (const x of hs) h += `<tr><td class="char">${esc(cn(x.char))}</td><td>${when(x.t)}</td><td>${esc(x.md || "")}</td><td class="muted">${esc(x.map)}</td></tr>`;
  $("#view").innerHTML = h + `</tbody></table></div>`;
}
