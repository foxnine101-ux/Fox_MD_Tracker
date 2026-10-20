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
const IDS = {}; RAW.m.forEach((nm, i) => { if (RAW.i[i]) IDS[nm] = RAW.i[i]; });
const DATA = { ids: IDS, lantern: RAW.L.map(([n, m, x, y, memo]) => ({ n, map: RAW.m[m], x, y, memo })), more: RAW.M.map(([n, m, x, y, memo]) => ({ n, map: RAW.m[m], x, y, memo })) };
const AREAS = [["all", "すべて"], ["town", "街・室内(1〜301)"], ["field", "フィールド(302〜600)"], ["sp", "特殊(601〜650)"]];
const SETS = [["lantern", "ランタン・ハント"], ["more", "もっとランタン・ハント"]];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const norm = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 96));
let ST = { set: store.get("lnt_set") || "lantern", area: "all", q: "", todo: false };
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
function navi(it) { const id = (DATA.ids[it.map] || [])[0]; return id ? `/navi2 ${id} ${it.x}/${it.y} 1/1/1` : `${it.map} ${it.x}/${it.y}`; }
function visible() {
  const items = DATA[ST.set], chk = CHK[ST.set], q = norm(ST.q);
  return items.filter((it) => (ST.set !== "lantern" || ST.area === "all" || (ST.area === "town" ? it.n <= 301 : ST.area === "field" ? it.n >= 302 && it.n <= 600 : it.n >= 601))
    && (!q || norm(it.map + " " + it.memo).includes(q)) && (!ST.todo || !chk.has(it.n)));
}
function draw() {
  $("#tabs").innerHTML = SETS.filter(([k]) => DATA[k] && DATA[k].length).map(([k, l]) => `<button data-set="${k}" class="${ST.set === k ? "on" : ""}">${l}(${DATA[k].length})</button>`).join("");
  const items = DATA[ST.set], chk = CHK[ST.set], list = visible(), done = items.filter((it) => chk.has(it.n)).length, nextIt = list.find((it) => !chk.has(it.n));
  $("#ctl").innerHTML = `<div class="row"><b>見つけた ${done} / ${items.length}</b><span class="bar"><i style="width:${Math.round(done * 100 / items.length)}%"></i></span></div>
    <div class="row" style="margin-top:8px">${ST.set === "lantern" ? `<select id="area">${AREAS.map(([v, l]) => `<option value="${v}" ${ST.area === v ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
    <input id="q" type="search" placeholder="マップ名・メモで絞る" value="${esc(ST.q)}"><label><input type="checkbox" id="todo" ${ST.todo ? "checked" : ""}> 未発見だけ</label>
    ${nextIt ? `<button class="pri" data-cp="${esc(navi(nextIt))}">次の未発見をコピー(${nextIt.n}番)</button>` : ""}<span class="mid">${list.length} 件を表示</span></div>`;
  $("#rows").innerHTML = list.map((it) => { const m = { id: (DATA.ids[it.map] || [])[0], how: (DATA.ids[it.map] || [])[1] }, on = chk.has(it.n);
    return `<tr class="${on ? "done" : ""}"><td><input type="checkbox" data-ck="${it.n}" ${on ? "checked" : ""}></td><td class="n">${it.n}</td><td><button data-cp="${esc(navi(it))}">${m.id ? "/navi2" : "コピー"}</button></td>
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
document.addEventListener("change", (e) => { if (e.target.id === "area") { ST.area = e.target.value; draw(); } if (e.target.id === "todo") { ST.todo = e.target.checked; draw(); } });
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
    maplist = json.load(open(offp, encoding="utf-8")).get("maplist") or []
    names = []
    for it in items + more:
        if it["map"] not in names:
            names.append(it["map"])
    ids = {k: {"id": v["id"], "how": v.get("how", "")} for k, v in lantern_core.resolve_ids(names, maplist, {}).items() if v.get("id")}
    mi = {nm: i for i, nm in enumerate(names)}
    pack = lambda L: [[it["n"], mi[it["map"]], it["x"], it["y"], it["memo"]] for it in L]
    data = {"m": names, "L": pack(items), "M": pack(more), "i": [([ids[nm]["id"], "推" if ids[nm]["how"] == "推定" else ""] if nm in ids else 0) for nm in names]}
    html = PAGE.replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("ランタン {} か所・もっと {} か所・マップ ID {} 件 → {} ({} バイト)".format(len(items), len(more), len(ids), outdir, len(html.encode("utf-8"))))


if __name__ == "__main__":
    main(sys.argv[1:])
