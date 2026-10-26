# -*- coding: utf-8 -*-
"""
ランタンハントの座標を、身内に見せる1枚のページ(index.html)にする。アプリ(Fox_MD_Tracker)とは別に、ブラウザだけで使える。

  python tools/make_lantern_site.py <CSVのフォルダ> <公式モンスター.json> <出力フォルダ>

  - CSV のフォルダ = 2026年のシート10枚(*.csv) + 熊(more*.csv)。make_lantern_seed.py と同じ入力
  - 公式モンスター.json = Fox が集めたもの(maplist = 公式のマップ一覧。マップ ID の引き当てに使う)
  - 出力は **リポジトリの外**(座標が入るので、公開のリポジトリにコミットしない)。置き場所は Cloudflare Worker(F:\\Claude\\Fox_lantern_site)
  - チェックは見る人のブラウザ(localStorage)に保存する。サーバーには何も送らない
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import lantern_core  # noqa: E402

PAGE = r'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>ランタンハント 座標メモ</title>
<style>
:root{--bg:#f6f7fb;--panel:#fff;--ink:#1d2433;--mut:#6b7385;--line:#dde1ea;--acc:#3b5bdb;--ok:#2b8a3e;--okbg:#e9f7ec}
@media (prefers-color-scheme: dark){:root{--bg:#14171f;--panel:#1c202b;--ink:#e6e9f2;--mut:#98a1b5;--line:#2c3243;--acc:#7c93ff;--ok:#6fcf86;--okbg:#18301f}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,"Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:4px 0 2px}
.sub{color:var(--mut);font-size:13px;margin-bottom:12px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:10px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.bar{flex:1;min-width:120px;height:10px;background:var(--line);border-radius:6px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--ok)}
select,input[type=search],button{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink)}
button{cursor:pointer}
button:active{background-image:linear-gradient(rgba(0,0,0,.2),rgba(0,0,0,.2))}
button.pri{background:var(--acc);color:#fff;border-color:var(--acc)}
.tabs button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
.wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
td.memo{white-space:normal;min-width:120px;color:var(--mut)}
tr.done td{background:var(--okbg);color:var(--mut)}
tr.done td:first-child{color:var(--ok)}
td.n,td.x,td.y{text-align:right;font-variant-numeric:tabular-nums}
input[type=checkbox]{width:20px;height:20px}
.mid{color:var(--mut);font-size:12px}
.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#222;color:#fff;padding:8px 14px;border-radius:20px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.on{opacity:.95}
footer{color:var(--mut);font-size:12px;margin:14px 0}
code{background:var(--line);padding:1px 5px;border-radius:4px}
</style>
</head>
<body>
<main>
<h1>ランタンハント 座標メモ</h1>
<div class="sub">見つけたらチェック。ナビのボタンで、ゲームのチャットに貼る文をコピーできます。チェックはこのブラウザだけに保存されます。</div>
<div class="panel row tabs" id="tabs"></div>
<div class="panel" id="ctl"></div>
<div class="panel wrap"><table><thead><tr><th>✓</th><th>番号</th><th>ナビ</th><th>マップ</th><th>X</th><th>Y</th><th>メモ</th></tr></thead><tbody id="rows"></tbody></table></div>
<div class="panel row" id="tools"></div>
<footer>
出典: スプレッドシート「2610ハロウィン」・RO忘備録(sites.google.com/view/romemo)。作成者の同意を得て、身内向けに公開しています。URL は他の人に広めないでください。<br>
ナビ = <code>/navi2 マップID X/Y 1/1/1</code>(チャットに貼ると経路案内)。マップ ID が分からない所は「マップ名 X/Y」をコピーします。「推定」のマップ ID は、通らないことがあります。
</footer>
</main>
<div class="toast" id="toast"></div>
<script>
"use strict";
const RAW = __DATA__;
const GRID = __GRID__;
const LINKS = __LINKS__;
const IDS = {}; RAW.m.forEach((nm, i) => { if (RAW.i[i]) IDS[nm] = RAW.i[i]; });
const DATA = { ids: IDS, lantern: RAW.L.map(([n, m, x, y, memo, e]) => ({ n, map: RAW.m[m], x, y, memo, e })), more: RAW.M.map(([n, m, x, y, memo, e]) => ({ n, map: RAW.m[m], x, y, memo, e })) };
const AREAS = [["all", "すべて"], ["town", "街・室内(1〜301)"], ["field", "フィールド(302〜600)"], ["sp", "特殊(601〜650)"]];
const SETS = [["lantern", "ランタン・ハント"], ["more", "もっとランタン・ハント"]];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const norm = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 96));
// ---- 回る順: 公式ワールドマップの並び(GRID)で隣のマップを順にたどる。出発点から、いちばん近い(隣をたどって少ない)マップへ、を繰り返す ----
const STARTS = [["prontera", "プロンテラ"], ["izlude", "イズルード"], ["geffen", "ゲフェン"], ["payon", "フェイヨン"], ["morocc", "モロク"], ["alberta", "アルベルタ"], ["aldebaran", "アルデバラン"], ["yuno", "ジュノー"], ["einbroch", "アインブロック"], ["lighthalzen", "リヒタルゼン"], ["hugel", "フィゲル"], ["rachel", "ラヘル"], ["veins", "ベインス"], ["comodo", "コモド"], ["umbala", "ウンバラ"]];
const CELLS = {}, CELLOF = {}, ALIAS = {};
for (const id in GRID) { const g = GRID[id]; if (typeof g === "string") ALIAS[id] = g; else { CELLOF[id] = g; CELLS[g.join(":")] = id; } }
// 行き来できる組(LINKS)は、公式ワールドマップの図の矢印から読み取ったもの(隣のマスでも矢印が無い所は行き来できない)。例外は CUT(切る)・ADD(足す)に書く
const LINK_CUT = [];
const LINK_ADD = [];
const NB = {};
function addNb(a, b) { (NB[a] = NB[a] || []).push(b); (NB[b] = NB[b] || []).push(a); }
for (const l of LINKS.concat(LINK_ADD)) if (!LINK_CUT.some((c) => (c[0] === l[0] && c[1] === l[1]) || (c[0] === l[1] && c[1] === l[0]))) addNb(l[0], l[1]);
function nbrs(id) { return NB[id] || []; }
function bfs(from) { const d = {}; d[from] = 0; const q = [from]; for (let i = 0; i < q.length; i++) for (const n of nbrs(q[i])) if (!(n in d)) { d[n] = d[q[i]] + 1; q.push(n); } return d; }
// 町やフィールドの名前でない場所(城内・ギルド・空港など)を、いちばん近い町やマップに結びつける(座標はそのマップのものではないので、その町の最後に回す)
const NAME_TOWN = { "プロンテラ城内": "prontera", "プロンテラ聖堂内": "prontera", "プロンテラ中央宮": "prontera", "プロンテラ離宮": "prontera", "プロンテラ東図書館": "prontera", "王家の記憶の間": "prontera", "過去の王家の記憶の間": "prontera", "侵攻されたプロンテラ避難地": "prontera", "聖カピトリーナ修道院": "prt_monk",
  "モロク城内": "morocc", "アサシンギルド": "morocc", "シーフギルド": "morocc", "楽園団01": "morocc", "ジャワイ室内": "jawaii", "錬金術師ギルド": "aldebaran", "レッケンベル本社": "lighthalzen", "リヒタルゼン空港": "lighthalzen",
  "ウェルス発掘地": "yuno", "特殊警戒地域コル": "yuno", "実験棟-OPTATIO": "yuno", "研究棟-WISH": "yuno", "ウェルス中央広場": "yuno", "フレイヤ大神殿": "rachel", "フレイヤ大神殿室内": "rachel", "ナビ号船内": "malangdo",
  "連合軍駐屯地": "mid_camp", "連合軍駐屯地内部": "mid_camp", "スプレンディッド": "splendide", "スプレンディッド内部01": "splendide", "スプレンディッド内部02": "splendide", "マヌク": "manuk", "マヌク内部": "manuk", "エルディカスティス": "dicastes01", "エルディカスティス室内": "dicastes01", "モーラ": "mora", "エクラージュ": "eclage", "エクラージュ通路": "eclage", "エクラージュ内部": "eclage", "ラザーニャ": "eclage",
  "スプレンディットフィールド01": "spl_fild01", "スプレンディットフィールド02": "spl_fild02", "スプレンディットフィールド03": "spl_fild03", "カミダル山脈01": "dic_fild01", "カミダル山脈02": "dic_fild02", "カミダルトンネル": "dic_fild01",
  "ブラジリスフィールド": "bra_fild01", "デワタフィールド": "dew_fild01", "バリオ・マワヒガ": "ma_fild01", "沈没船付近の島": "alb2trea", "コモド小劇場": "comodo", "ゲフェン中央塔": "geffen", "教室棟A": "geffen", "教室棟B": "geffen", "教室棟ホール": "geffen", "エントランスホール": "geffen", "図書室（アカデミー）": "geffen",
  "ジュノー空港": "yuno", "空港": "einbroch", "アルベルタ船舶の中": "alberta", "次元の狭間03": "moc_fild20" };
function cellId(name) { let id = (DATA.ids[name] || [])[0]; id = ALIAS[id] || id; return id && CELLOF[id] ? id : null; }
function navName(it) { return it.e ? RAW.m[it.e[0]] : it.map; }
function navPos(it) { return it.e ? [it.e[1], it.e[2]] : [it.x, it.y]; }
function inNode(arr, from, to) {   // 同じマップの中: 前のマップがある側から入って、近い順
  const g = CELLOF[to], f = from ? CELLOF[from] : null; let px = 200, py = 200;
  if (f && f[0] === g[0] && (f[1] !== g[1] || f[2] !== g[2])) { const dr = g[1] - f[1], dc = g[2] - f[2]; if (Math.abs(dc) >= Math.abs(dr)) { px = dc > 0 ? 0 : 400; } else { py = dr > 0 ? 400 : 0; } }
  const rest = arr.slice(), o = [];
  while (rest.length) { let bi = 0, bd = 1e9; rest.forEach((it, i) => { const p = navPos(it), dd = (p[0] - px) * (p[0] - px) + (p[1] - py) * (p[1] - py); if (dd < bd) { bd = dd; bi = i; } }); const it = rest.splice(bi, 1)[0]; o.push(it); px = navPos(it)[0]; py = navPos(it)[1]; }
  return o;
}
function dmat(keys) {         // マップどうしの「歩く数」(隣をたどる数)。つながっていない所は、遠さ(+罰)で近い順に並ぶようにする
  const D = {};
  for (const a of keys) { const d = bfs(a); D[a] = {}; for (const b of keys) D[a][b] = b in d ? d[b] : 40 + Math.abs(CELLOF[a][1] - CELLOF[b][1]) + Math.abs(CELLOF[a][2] - CELLOF[b][2]) + (CELLOF[a][0] !== CELLOF[b][0] ? 30 : 0); }
  return D;
}
function pathCost(o, D) { let c = 0; for (let i = 1; i < o.length; i++) c += D[o[i - 1]][o[i]]; return c; }
function improve(order, D) {   // 往復をへらす: 入れ替え(2-opt)と、1つを別の場所へ移す(or-opt)を、よくならなくなるまで。先頭(出発)は動かさない
  let better = true, guard = 0;
  while (better && guard++ < 60) {
    better = false;
    for (let i = 1; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
      const a = order[i - 1], b = order[i], c = order[j], d = order[j + 1];
      const before = D[a][b] + (d ? D[c][d] : 0), after = D[a][c] + (d ? D[b][d] : 0);
      if (after < before) { const seg = order.slice(i, j + 1).reverse(); order.splice(i, j - i + 1, ...seg); better = true; }
    }
    for (let i = 1; i < order.length; i++) {
      const n = order[i], rest = order.slice(0, i).concat(order.slice(i + 1)); let bc = pathCost(order, D), bp = -1;
      for (let p = 1; p <= rest.length; p++) { const c = pathCost(rest.slice(0, p).concat([n], rest.slice(p)), D); if (c < bc) { bc = c; bp = p; } }
      if (bp >= 0) { const t = rest.slice(0, bp).concat([n], rest.slice(bp)); order.splice(0, order.length, ...t); better = true; }
    }
  }
  return order;
}
function pathBetween(a, b) {   // aからbへ、隣をたどる近道の途中のマップ(a, ..., b)。つながっていなければ null
  const par = { [a]: null }, q = [a];
  for (let i = 0; i < q.length; i++) { if (q[i] === b) break; for (const n of nbrs(q[i])) if (!(n in par)) { par[n] = q[i]; q.push(n); } }
  if (!(b in par)) return null;
  const p = []; for (let x = b; x !== null; x = par[x]) p.push(x);
  return p.reverse();
}
function compact(order, has) {   // 次のマップへの道中に、まだの(アイテムのある)マップがあれば、通るついでに先に回る(あとで戻らない)
  const done = new Set(), out = [];
  const visit = (k) => { if (!done.has(k)) { done.add(k); out.push(k); } };
  visit(order[0]);
  for (let i = 1; i < order.length; i++) {
    const b = order[i]; if (done.has(b)) continue;
    const p = pathBetween(out[out.length - 1], b);
    if (p) for (const n of p.slice(1, -1)) if (has[n]) visit(n);
    visit(b);
  }
  return out;
}
function routeSort(list) {
  const dir = {}, fb = {}, rest = [];
  for (const it of list) {
    const k = cellId(navName(it));
    if (k) { (dir[k] = dir[k] || []).push(it); continue; }
    const k2 = cellId(navName(it).replace(/(室内|内部)[0-9]*$/, "")) || NAME_TOWN[navName(it)] || null;      // 室内の名前から町を探す(座標は町のものではないので、その町の最後に)
    if (k2) (fb[k2] = fb[k2] || []).push(it); else rest.push(it);
  }
  const left = new Set(Object.keys(dir).concat(Object.keys(fb))), out = [], start = CELLOF[ST.start] ? ST.start : "prontera";
  const keys = [...new Set([start].concat([...left]))], D = dmat(keys);
  left.delete(start);
  let order = [start], cur = start;
  while (left.size) {                       // まず、いちばん近い所へ順に(欲張り)
    let best = null, bd = 1e9;
    for (const k of left) { if (D[cur][k] < bd) { bd = D[cur][k]; best = k; } }
    order.push(best); left.delete(best); cur = best;
  }
  order = improve(order, D);                // そのうえで、往復をへらす
  const has = {}; for (const k in dir) has[k] = 1; for (const k in fb) has[k] = 1;
  order = compact(order, has);              // 道中のマップも通るついでに
  let prev = null;
  for (let i = 0; i < order.length; i++) {
    const k = order[i]; if (i === 0 && !dir[k] && !fb[k]) { prev = k; continue; }
    const from = i === 0 ? null : order[i - 1];
    for (const it of inNode(dir[k] || [], from, k)) out.push(it);
    for (const it of (fb[k] || []).sort((a, b) => a.n - b.n)) out.push(it);
    prev = k;
  }
  const first = {}; for (const it of rest) if (!(it.map in first) || it.n < first[it.map]) first[it.map] = it.n;      // 残り(隣が分からない所)は、同じマップをまとめて、番号の早い順
  return out.concat(rest.sort((a, b) => first[a.map] - first[b.map] || a.n - b.n));
}
function orderCtl() {
  return '<select id="order"><option value="n"' + (ST.order === "n" ? " selected" : "") + '>番号順</option><option value="route"' + (ST.order === "route" ? " selected" : "") + '>回る順(隣のマップへ)</option></select>'
    + (ST.order === "route" ? '<label>出発: <select id="start">' + STARTS.map((s) => '<option value="' + s[0] + '"' + (ST.start === s[0] ? " selected" : "") + '>' + s[1] + '</option>').join("") + '</select></label>' : "");
}
let ST = { set: store.get("lnt_set") || "lantern", area: "all", q: "", todo: false, order: store.get("lnt_order") || "n", start: store.get("lnt_start") || "prontera" };
if (!DATA[ST.set]) ST.set = "lantern";
const loadChecks = (set) => { try { return new Set(JSON.parse(store.get("lnt_chk_" + set) || "[]")); } catch { return new Set(); } };
const saveChecks = (set, c) => store.set("lnt_chk_" + set, JSON.stringify([...c].sort((a, b) => a - b)));
let CHK = { lantern: loadChecks("lantern"), more: loadChecks("more") };
let toastT = 0;
function toast(t) { const e = $("#toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove("on"), 1800); }
async function copy(t) {
  try { await navigator.clipboard.writeText(t); }
  catch { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch {} a.remove(); }
  toast("コピーしました: " + t);
}
function navi(it) { const nm = it.e ? RAW.m[it.e[0]] : it.map, x = it.e ? it.e[1] : it.x, y = it.e ? it.e[2] : it.y, id = (DATA.ids[nm] || [])[0]; return id ? `/navi2 ${id} ${x}/${y} 1/1/1` : `${nm} ${x}/${y}`; }
function visible() {
  const items = DATA[ST.set], chk = CHK[ST.set], q = norm(ST.q);
  return items.filter((it) => (ST.set !== "lantern" || ST.area === "all" || (ST.area === "town" ? it.n <= 301 : ST.area === "field" ? it.n >= 302 && it.n <= 600 : it.n >= 601))
    && (!q || norm(it.map + " " + it.memo).includes(q)) && (!ST.todo || !chk.has(it.n)));
}
function draw() {
  $("#tabs").innerHTML = SETS.filter(([k]) => DATA[k] && DATA[k].length).map(([k, l]) => `<button data-set="${k}" class="${ST.set === k ? "on" : ""}">${l}(${DATA[k].length})</button>`).join("");
  const items = DATA[ST.set], chk = CHK[ST.set], list = ST.order === "route" ? routeSort(visible()) : visible(), done = items.filter((it) => chk.has(it.n)).length, nextIt = list.find((it) => !chk.has(it.n));
  $("#ctl").innerHTML = `<div class="row"><b>見つけた ${done} / ${items.length}</b><span class="bar"><i style="width:${Math.round(done * 100 / items.length)}%"></i></span></div>
    <div class="row" style="margin-top:8px">${ST.set === "lantern" ? `<select id="area">${AREAS.map(([v, l]) => `<option value="${v}" ${ST.area === v ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
    ${orderCtl()}<input id="q" type="search" placeholder="マップ名・メモで絞る" value="${esc(ST.q)}"><label><input type="checkbox" id="todo" ${ST.todo ? "checked" : ""}> 未発見だけ</label>
    ${nextIt ? `<button class="pri" data-cp="${esc(navi(nextIt))}">次の未発見をコピー(${nextIt.n}番)</button>` : ""}<span class="mid">${list.length} 件を表示</span></div>`;
  $("#rows").innerHTML = list.map((it) => { const m = { id: (DATA.ids[it.map] || [])[0], how: (DATA.ids[it.map] || [])[1] }, on = chk.has(it.n);
    return `<tr class="${on ? "done" : ""}"><td><input type="checkbox" data-ck="${it.n}" ${on ? "checked" : ""}></td><td class="n">${it.n}</td><td><button data-cp="${esc(navi(it))}" title="${esc(it.e ? "入口: " + RAW.m[it.e[0]] + " " + it.e[1] + "/" + it.e[2] : "")}">${m.id ? "/navi2" : "コピー"}</button></td>
      <td>${esc(it.map)}${m.id ? ` <span class="mid">${esc(m.id)}${m.how === "推" ? "?" : ""}</span>` : ""}</td><td class="x">${it.x}</td><td class="y">${it.y}</td><td class="memo">${esc(it.memo)}</td></tr>`; }).join("");
  $("#tools").innerHTML = `<button id="exp">チェックを書き出す</button><button id="imp">チェックを読み込む</button><span class="mid">別の端末に移すとき用(文字をコピー・貼り付け)</span>`;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("button, input"); if (!t) return;
  if (t.dataset.set) { ST.set = t.dataset.set; store.set("lnt_set", ST.set); return draw(); }
  if (t.dataset.cp) return copy(t.dataset.cp);
  if (t.id === "exp") return copy(JSON.stringify({ lantern: [...CHK.lantern], more: [...CHK.more] }));
  if (t.id === "imp") {
    const s = prompt("書き出した文字を貼り付けてください(いまのチェックに足されます)"); if (!s) return;
    try { const o = JSON.parse(s); for (const k of ["lantern", "more"]) for (const n of o[k] || []) if (Number.isInteger(n)) CHK[k].add(n); saveChecks("lantern", CHK.lantern); saveChecks("more", CHK.more); draw(); toast("読み込みました"); } catch { toast("読み込めませんでした"); }
    return;
  }
  if (t.dataset.ck) { const n = +t.dataset.ck, c = CHK[ST.set]; if (t.checked) c.add(n); else c.delete(n); saveChecks(ST.set, c); draw(); }
});
document.addEventListener("input", (e) => { if (e.target.id === "q") { ST.q = e.target.value; const p = e.target.selectionStart; draw(); const q = $("#q"); q.focus(); q.setSelectionRange(p, p); } });
document.addEventListener("change", (e) => { if (e.target.id === "order") { ST.order = e.target.value; store.set("lnt_order", ST.order); draw(); } if (e.target.id === "start") { ST.start = e.target.value; store.set("lnt_start", ST.start); draw(); } if (e.target.id === "area") { ST.area = e.target.value; draw(); } if (e.target.id === "todo") { ST.todo = e.target.checked; draw(); } });
draw();
</script>
</body>
</html>
'''


def main(args):
    if len(args) != 3:
        sys.exit(__doc__)
    csvdir, offp, outdir = args
    files = sorted(glob.glob(os.path.join(csvdir, "*.csv")))
    more_f = [f for f in files if os.path.basename(f).startswith("more")]
    main_f = [f for f in files if f not in more_f]
    items = lantern_core.parse_text("\n".join(open(f, encoding="utf-8").read() for f in main_f))
    more = lantern_core.parse_text("\n".join(open(f, encoding="utf-8").read() for f in more_f))
    items = lantern_core.fix_items(items)                       # 利用者が確かめて直した座標
    maplist = json.load(open(offp, encoding="utf-8")).get("maplist") or []
    names = []
    for it in items + more:
        if it["map"] not in names:
            names.append(it["map"])
    ids0 = lantern_core.resolve_ids(names, maplist, {})
    for it in items + more:                                  # メモに座標がある室内は、親マップの入口へナビする(室内のIDが確かなら室内のまま: lantern_core.entrance_for)
        e = lantern_core.entrance_for(it["map"], it["memo"], ids0)
        if e:
            if e[0] not in names:
                names.append(e[0])
    ids = {k: {"id": v["id"], "how": v.get("how", "")} for k, v in lantern_core.resolve_ids(names, maplist, {}).items() if v.get("id")}
    mi = {nm: i for i, nm in enumerate(names)}

    def pack(L):
        out = []
        for it in L:
            row = [it["n"], mi[it["map"]], it["x"], it["y"], it["memo"]]
            e = lantern_core.entrance_for(it["map"], it["memo"], ids0)
            if e:
                row.append([mi[e[0]], e[1], e[2]])
            out.append(row)
        return out
    data = {"m": names, "L": pack(items), "M": pack(more), "i": [([ids[nm]["id"], "推" if ids[nm]["how"] == "推定" else ""] if nm in ids else 0) for nm in names]}
    html = PAGE.replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    html = html.replace("__GRID__", open(os.path.join(HERE, "world_grid.json"), encoding="utf-8").read().strip())
    html = html.replace("__LINKS__", open(os.path.join(HERE, "world_links.json"), encoding="utf-8").read().strip())         # 図の矢印から読み取った、行き来できるマップの組          # 公式ワールドマップのマスの並び(隣のマップを調べる用)
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("ランタン {} か所・もっと {} か所・マップ ID {} 件 → {} ({} バイト)".format(len(items), len(more), len(ids), outdir, len(html.encode("utf-8"))))


if __name__ == "__main__":
    main(sys.argv[1:])
