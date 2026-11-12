"use strict";
// ---------- インベントリ(持ち物・倉庫 4つ・W倉庫)と相場 ----------
// 中身は通信から読んだもの(char_core の 0B09/0B39。ゲームで持ち物・倉庫を開くたびに最新になる)。/api/inv で読む。
// 相場は公式ツールの露店の取引履歴(market_core。/api/market。この PC に保存)。
let INV = null, INV_T = -1, INV_LOADING = false, MKB = {}, INV_FILL = null;      // MKB = 覚えている相場の要約 {番号: [取った時刻, 直近の売価, 日時, 中央値]}      // /api/inv の返事・読んだときの inv_t
// ゲーム内の倉庫と同じ分類。品の種類(通信の type)から。装備は着る場所から(右手=武器、それ以外=防具)
const INV_CATS = [["all", "全て"], ["use", "消費アイテム"], ["special", "スペシャルアイテム"], ["armor", "防具"], ["weapon", "武器"], ["costume", "衣装"], ["ammo", "矢など消耗品"], ["card", "カード"], ["etc", "その他"]];
// 衣装 = 見た目だけの装備(着る場所が衣装の枠)。スペシャル = 「〜の箱」「〜チケット」など(ゲームの sp タブの見本から。名前での判定なので、ずれた品は教えてもらって直す)
const INV_COSTUME = 1024 | 2048 | 4096 | 8192, INV_SPECIAL = /の箱$|チケット|引換券|ボックス|の宝箱/;
const invCatOf = (r) => r.eq ? (r.costume ? "costume" : r.weapon ? "weapon" : "armor")
  : r.type === 18 || ((r.type == null || r.type === 2 || r.type === 0) && INV_SPECIAL.test(r.base || r.name)) ? "special"
  : ({ 0: "use", 2: "use", 11: "use", 4: "armor", 5: "weapon", 10: "ammo", 6: "card" })[r.type] || "etc";
let INV_CAT = store.get("md_invcat") || "all";
let INVSUB = store.get("md_invsub") || "bag", INV_CHAR = "", INV_Q = "", INV_SORT = "name";
const MKT = { id: 0, name: "", view: null, timer: 0 };
(function () {
  const st = document.createElement("style");
  st.textContent = `.invbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 8px}.invbar input[type=search]{padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}
.invt{width:100%;border-collapse:collapse}.invt td,.invt th{padding:3px 8px;border-bottom:1px solid var(--line);text-align:left}.invt td.n,.invt th.n{text-align:right;font-variant-numeric:tabular-nums}
.invt .sub{color:var(--muted);font-size:11px}.invt .mk{padding:1px 8px;font-size:12px}
#mktbox{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto}
#mktbox .mk-in{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:14px 16px;max-width:760px;width:100%}
#mktbox .mk-sum{display:flex;gap:18px;flex-wrap:wrap;margin:8px 0}#mktbox .mk-sum div{min-width:120px}#mktbox .mk-sum b{display:block;font-size:18px}`;
  document.head.appendChild(st);
})();

function invLoad() {
  if (INV_LOADING) return;
  INV_LOADING = true; INV_T = (DATA && DATA.inv_t) || 0;
  fetch("/api/market?brief=1").then((r) => r.json()).then((b) => { MKB = b || {}; }).catch(() => {});
  fetch("/api/inv").then((r) => r.json()).then((d) => { INV = d; }).catch(() => { INV = INV || { chars: {}, stores: {}, names: {} }; })
    .finally(() => { INV_LOADING = false; if (TAB === "inv" || (TAB === "event" && EVSUB === "fancy")) render(); });
}
const invName = (id) => (INV && INV.names && INV.names[String(id)]) || (DATA.item_names || {})[String(id)] || `ID${id}`;

// 倉庫は「アカウント」の持ち物。いま見ているキャラのアカウントの倉庫を探す(アカウントが分からなければ、キャラの名前で)
function invStores(c) {
  const S = (INV && INV.stores) || {}, raw = c ? ((DATA.chars || {})[c] || {}).account : null, acc = c ? accOfChar(c) : null;      // 通信で見たアカウントと、手で決めたアカウントの両方で探す
  const own = (raw && S[String(raw)]) || (acc && S[String(acc)]) || S[c] || null;
  if (own) return own;
  const all = Object.values(S);
  return !raw && !acc && all.length === 1 ? all[0] : {};      // アカウントが分からず、持ち主が1つしか無ければ、それ
}
function invChk(st) {      // 自己採点: ゲームが教える「入っている数」と読めた数の照らし合わせ
  const k = st && st.chk;
  if (!k || !k.fin) return "";
  return k.ok ? `　<span class="ok" title="ゲームが教える数(${k.want})と、読めた数が一致しました">✔数が一致(${k.want})</span>`
    : `　<span class="warn" title="ゲームが教える数 ${k.want} / 読めた数 ${k.got}">⚠数がちがいます(ゲーム ${k.want}・読めた ${k.got})。取りこぼしの可能性</span>`;
}

function invSlotNo(title) {      // メイン倉庫 = 0・サブ倉庫N = N(それ以外は -1)
  const t = String(title || "");
  if (/^メイン/.test(t)) return 0;
  const m = t.match(/^サブ倉庫\s*([0-9０-９]+)/);
  return m ? +m[1].replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)) : -1;
}
function invStoreSlots(c) {
  const S0 = invStores(c), sv = c ? srvOf(c) : "", multi = new Set(Object.values(S0).map((v) => v.srv ?? srvOf(v.by))).size > 1;
  const S = !sv || !multi ? S0 : Object.fromEntries(Object.entries(S0).filter(([, v]) => (v.srv ?? srvOf(v.by)) === sv));      // 倉庫はワールドごとに別。見ているキャラのワールドの分だけ
  const list = Object.entries(S).map(([k, v]) => ({ k, ...v }));
  list.sort((a, b) => (a.inv - b.inv) || String(a.title).localeCompare(String(b.title), "ja", { numeric: true }));
  const normal = list.filter((x) => x.inv === 2), w = list.filter((x) => x.inv === 4), guild = list.filter((x) => x.inv === 3);
  const slots = [], arr = [null, null, null, null], rest = [];
  for (const x of normal) { const i = invSlotNo(x.title); if (i >= 0 && i < 4 && !arr[i]) arr[i] = x; else rest.push(x); }      // 名前で枠を決める(メイン倉庫=1つ目・サブ倉庫1=2つ目 …)
  for (const x of rest) { const j = arr.indexOf(null); if (j >= 0) arr[j] = x; else arr.push(x); }
  const DEF = ["メイン倉庫", "サブ倉庫1", "サブ倉庫2", "サブ倉庫3"];
  if (normal.length && !normal.some((x) => x.title)) {      // 名前が1つも届かないワールド(ノアトゥーンなど): 名前なしの倉庫を、そのワールドの倉庫として1つだけ出す
    const x = normal[0], wn = (typeof worldName === "function" && worldName(x.srv || (sv || ""))) || "";
    slots.push({ id: x.k, label: `${wn ? wn + "の" : ""}倉庫`, st: x });
    slots.push(w[0] ? { id: w[0].k, label: "W倉庫", st: w[0] } : { id: "w", label: "W倉庫", st: null });
    return slots;
  }
  arr.forEach((x, i) => slots.push(x ? { id: x.k, label: x.title || `倉庫${i + 1}（名前不明）`, st: x } : { id: "n" + i, label: DEF[i] || `倉庫${i + 1}`, st: null }));
  slots.push(w[0] ? { id: w[0].k, label: "W倉庫", st: w[0] } : { id: "w", label: "W倉庫", st: null });
  if (guild[0]) slots.push({ id: guild[0].k, label: "ギルド倉庫", st: guild[0] });
  return slots;
}

const invIsUnk = (n) => /^ID\d+$/.test(String(n || ""));
function invUnknownIds() {      // 名前がわからない品の番号(持ち物・倉庫すべて)
  const ids = new Set();
  const add = (id, nm) => { if (id && invIsUnk(nm)) ids.add(String(id)); };
  for (const C of Object.values(INV.chars || {})) { (C.items || []).forEach((x) => add(x.itemId, invName(x.itemId))); (C.eq || []).forEach((e) => add(e.itemId, e.name || invName(e.itemId))); }
  for (const st of Object.values(INV.stores || {})) for (const sl of Object.values(st)) { (sl.items || []).forEach((x) => add(x.itemId, invName(x.itemId))); (sl.eq || []).forEach((e) => add(e.itemId, e.name || invName(e.itemId))); }
  return [...ids];
}
let INV_RES = { run: false, left: 0, total: 0 };
async function invResolve() {      // 名前不明の番号を、公式ツールの露店の取引から調べる(1件ずつ・3秒あけて。名前は裏で覚える)
  if (INV_RES.run) return;
  const ids = invUnknownIds().slice(0, 25);
  if (!ids.length) return;
  INV_RES = { run: true, left: ids.length, total: ids.length };
  render();
  for (const id of ids) await fetch(`/api/market?id=${id}&ask=1`).catch(() => null);
  const pend = new Set(ids);
  const tick = async () => {
    for (const id of [...pend]) {
      const r = await fetch(`/api/market?id=${id}`).then((x) => x.json()).catch(() => null);
      if (!r || !r.busy) pend.delete(id);
    }
    INV_RES.left = pend.size;
    const el = $("#invres"); if (el) el.textContent = `調べています… 残り ${pend.size} / ${INV_RES.total} 件`;
    if (pend.size) { setTimeout(tick, 4000); return; }
    INV_RES.run = false; INV_T = -1; if (TAB === "inv") render();
  };
  setTimeout(tick, 3000);
}
async function invNameSet(id) {
  const nm = prompt(`番号 ${id} の品の名前を入れてください（この PC に覚えます）`);
  if (!nm || !nm.trim()) return;
  await fetch("/api/itemname", { method: "POST", body: JSON.stringify({ id: +id, name: nm.trim() }) }).catch(() => null);
  INV_T = -1; render();
}
function mkCells(id, eq) {      // 覚えている相場(「相場」ボタンで取ったもの・身内の共有相場)から、直近の売価と中央値。無い品は空欄
  const b = MKB[String(id)];
  if (!b || (eq && b[4] === "s")) return `<td class="n muted"></td><td class="n muted"></td>`;
  const ago = b[0] ? `取得 ${when(b[0])}` : "", sh = b[4] === "s";      // sh = 身内の共有相場(RO相場自動記録が貯めた日ごとの値)
  const t1 = sh ? `${b[2] || ""} の中央値(身内の共有相場)${ago ? " / " + ago : ""}` : `${b[2] || ""} の取引 / ${ago}`, t2 = sh ? `直近30日の中央値(身内の共有相場)${ago ? " / " + ago : ""}` : ago;
  const mark = sh ? `<span class="sub" title="身内の共有相場">共</span>` : "";
  return `<td class="n" title="${esc(t1)}">${b[1] == null ? "-" : mktYen(b[1])}${mark}</td><td class="n" title="${esc(t2)}">${b[3] == null ? "-" : mktYen(b[3])}${mark}</td>`;
}
function invRows(items, eq, cat = INV_CAT) {
  const q = INV_Q.trim().toLowerCase();
  const rows = [];
  for (const x of items || []) rows.push({ id: x.itemId, name: invName(x.itemId), count: x.count, type: x.type, eq: false, unk: invIsUnk(invName(x.itemId)), base: invName(x.itemId) });
  for (const e of eq || []) {
    const cards = (e.cards || []).map((c) => c.name).filter(Boolean).join(" / ");
    rows.push({ id: e.itemId, name: (e.refine ? `+${e.refine} ` : "") + (e.name || invName(e.itemId)), base: e.name || invName(e.itemId), count: 1, eq: true, costume: !!e.loc && !(e.loc & ~INV_COSTUME), weapon: e.type === 5 || (e.type == null && !!(((e.loc || 0) | (e.wear || 0)) & 2)), unk: invIsUnk(e.name || invName(e.itemId)), sub: [cards, e.slot ? `装備中: ${e.slot}` : ""].filter(Boolean).join("　"), opts: (e.options || []).map((o) => o.text).filter(Boolean).join(" / ") });
  }
  const f = rows.filter((r) => (!q || (r.name + (r.sub || "")).toLowerCase().includes(q)) && (cat === "all" || invCatOf(r) === cat));
  f.sort((a, b) => INV_SORT === "count" ? (b.count - a.count) || a.name.localeCompare(b.name, "ja") : a.eq - b.eq || a.name.localeCompare(b.name, "ja", { numeric: true }));
  return f;
}
function invTable(rows) {
  if (!rows.length) return `<div class="muted" style="padding:10px">該当する品はありません。</div>`;
  return `<div class="tablewrap"><table class="invt"><thead><tr><th>アイテム</th><th class="n">個数</th><th class="n" title="覚えている相場のうち、いちばん新しい取引の単価">直近の売価</th><th class="n" title="公式ツールの中央値(全期間)">中央値</th><th></th></tr></thead><tbody>${rows.map((r) =>
    `<tr><td>${esc(r.name)}${r.sub ? `<div class="sub">${esc(r.sub)}</div>` : ""}${r.opts ? `<div class="sub">${esc(r.opts)}</div>` : ""}</td><td class="n">${r.eq ? "" : fmtN(r.count)}</td>${mkCells(r.id, r.eq)}<td><button class="ghost mk" data-mk="${r.id}" data-mkn="${esc(r.base || r.name)}" title="公式ツールの露店の取引履歴(相場)を見る">相場</button>${r.unk ? ` <button class="ghost nm" data-nm="${r.id}" title="名前を手で付ける">名前</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
}
function invAcct(owner) {      // 倉庫の持ち主(アカウント番号)→ 画面に出す呼び名
  const n = Object.entries((DATA && DATA.chars) || {}).filter(([k, c]) => String(c.account) === String(owner)).map(([k]) => k)[0];
  return n ? `${cnU(n)}のアカウント` : cn(String(owner));
}
function invAllTable() {      // 全部の持ち物・倉庫から探す(同じ品は合計して、どこに何個あるかを並べる)
  if (!INV_Q.trim()) return `<div class="muted" style="padding:12px">探したい品の名前を入れてください（例: 赤ポーション）。全キャラの持ち物と、すべての倉庫から探します。</div>`;
  const g = new Map();
  const add = (r, where) => {
    const key = r.base || r.name; let e = g.get(key);
    if (!e) g.set(key, e = { id: r.id, name: key, total: 0, where: new Map(), unk: r.unk, eq: r.eq });
    const n = r.eq ? 1 : r.count; e.total += n;
    const w = e.where.get(where) || { n: 0, tag: [] }; w.n += n;
    if (r.eq) { const t = r.name.endsWith(key) ? r.name.slice(0, r.name.length - key.length).trim() : ""; if (t) w.tag.push(t); }
    e.where.set(where, w);
  };
  for (const [c, C] of Object.entries(INV.chars || {})) invRows(C.has ? C.items : [], C.eq, "all").forEach((r) => add(r, `${cnU(c)} の持ち物`));
  for (const [owner, st] of Object.entries(INV.stores || {})) for (const sl of Object.values(st)) invRows(sl.items, sl.eq, "all").forEach((r) => add(r, `${invAcct(owner)}　${sl.title || `倉庫（名前不明${sl.by ? "・" + cnU(sl.by) + "で開いた" : ""}）`}${(sl.srv ?? srvOf(sl.by)) ? `（${serverLabel(sl.srv ?? srvOf(sl.by))}）` : ""}`));
  const rows = [...g.values()].sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
  if (!rows.length) return `<div class="muted" style="padding:10px">該当する品はありません。</div>`;
  const cap = rows.slice(0, 300);
  return `<div class="muted" style="margin:4px 0">${rows.length} 種類が見つかりました${rows.length > cap.length ? `（先頭 ${cap.length} 種類を表示）` : ""}。</div><div class="tablewrap"><table class="invt"><thead><tr><th>アイテム</th><th class="n">合計</th><th>どこに（個数）</th><th class="n">直近の売価</th><th class="n">中央値</th><th></th></tr></thead><tbody>${cap.map((e) =>
    `<tr><td>${esc(e.name)}</td><td class="n">${fmtN(e.total)}</td><td>${[...e.where].map(([w, v]) => `${esc(w)} ×${fmtN(v.n)}${v.tag.length ? `<span class="sub">（${esc(v.tag.join("、"))}）</span>` : ""}`).join("<br>")}</td>${mkCells(e.id, e.eq)}<td><button class="ghost mk" data-mk="${e.id}" data-mkn="${esc(e.name)}" title="公式ツールの露店の取引履歴(相場)を見る">相場</button>${e.unk ? ` <button class="ghost nm" data-nm="${e.id}" title="名前を手で付ける">名前</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
}

// ---------- 家計簿(ゼニーの増減と、そのとき動いた品。ledger_core。/api/ledger。この PC だけ) ----------
let LED = null, LED_T = -1, LED_LOADING = false, LED_SRV = "", LED_CHAR = "", LED_DAYS = +(store.get("md_leddays") || 7), LED_KIND = "";
function invNav(slots) {
  return `<div class="simnav" id="invnav"><button data-invsub="all" class="${INVSUB === "all" ? "on" : ""}" title="全キャラの持ち物とすべての倉庫から探す">全部から探す</button><button data-invsub="bag" class="${INVSUB === "bag" ? "on" : ""}">持ち物</button>${slots.map((s) => `<button data-invsub="${esc(s.id)}" class="${INVSUB === s.id ? "on" : ""}" ${s.st ? "" : `style="opacity:.55"`}>${esc(s.label)}</button>`).join("")}<button data-invsub="ledger" class="${INVSUB === "ledger" ? "on" : ""}" title="ゼニーの増減と、そのとき動いた品（露店・買取露店・メールなど）">家計簿</button></div>`;
}
function ledLoad() {
  if (LED_LOADING) return;
  LED_LOADING = true; LED_T = (DATA && DATA.ledger_t) || 0;
  fetch("/api/ledger").then((r) => r.json()).then((d) => { LED = d; }).catch(() => { LED = LED || { rows: [], names: {}, kinds: {} }; })
    .finally(() => { LED_LOADING = false; if (TAB === "inv" && INVSUB === "ledger") render(); });
}
const ledZ = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtN(Math.abs(n))}`;
const ledCls = (n) => n > 0 ? "ok" : n < 0 ? "warn" : "muted";
const ledDay = (t) => { const d = new Date(t * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function ledName(id) { return id ? ((LED && LED.names && LED.names[String(id)]) || (DATA.item_names || {})[String(id)] || `ID${id}`) : "品不明"; }
function ledItems(r) {
  const it = (r.it || []).map((x) => `${x[2] ? "+" + x[2] + " " : ""}${esc(ledName(x[0]))} ×${fmtN(Math.abs(x[1]))}`).join("、");
  return it + (r.p ? `<span class="sub">（1個 ${fmtN(Math.round(r.p))}z）</span>` : "");
}
const ledNoa = (s) => /noatun|ノアトゥーン/i.test(serverLabel(s) || "");
function renderLedger(chars) {
  if (!LED || LED_T !== ((DATA && DATA.ledger_t) || 0)) ledLoad();
  const nav = invNav(invStoreSlots(INV_CHAR || nowChar() || lastChar()));
  if (!LED) { $("#view").innerHTML = `${nav}<div class="panel empty">読み込んでいます…</div>`; ledBind(); return; }
  const K = LED.kinds || {}, all = LED.rows || [];
  if (!all.length) { $("#view").innerHTML = `${nav}<div class="panel empty">まだ記録がありません。<br>ツールを動かしたまま、露店で売り買い・買取露店・メールの受け取りなどをすると記録されます。</div>`; ledBind(); return; }
  // ワールドごとに分ける。「全ワールド」はノアトゥーンの金額を B鯖換算(×1000・公式の為替)にしてから足す
  const srvs = [...new Set(all.map((r) => srvOf(r.c)))];
  const ALLW = srvs.length > 1 && LED_SRV === "*";
  if (!ALLW && !srvs.includes(LED_SRV)) { const cs = srvOf(nowChar() || lastChar() || ""); LED_SRV = srvs.includes(cs) ? cs : (srvs[0] || ""); }
  const noaIn = srvs.some(ledNoa), noaNow = !ALLW && ledNoa(LED_SRV);
  const conv = (r) => (ALLW && ledNoa(srvOf(r.c)) ? { ...r, d: r.d * 1000, b: r.b == null ? r.b : r.b * 1000, p: r.p ? r.p * 1000 : r.p, noa: 1 } : r);
  const inSrv = (ALLW ? all : all.filter((r) => srvOf(r.c) === LED_SRV)).map(conv);
  const cl = [...new Set(inSrv.map((r) => r.c))].sort((a, b) => cn(a).localeCompare(cn(b), "ja"));
  if (LED_CHAR && !cl.includes(LED_CHAR)) LED_CHAR = "";
  const cut = LED_DAYS ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() / 1000 - (LED_DAYS - 1) * 86400; })() : 0;
  const rows0 = inSrv.filter((r) => (!LED_CHAR || r.c === LED_CHAR) && r.t >= cut);
  const rows = rows0.filter((r) => !LED_KIND || r.k === LED_KIND);
  const real = rows0.filter((r) => r.k !== "unseen");
  const inc = real.reduce((a, r) => a + (r.d > 0 ? r.d : 0), 0), out = real.reduce((a, r) => a + (r.d < 0 ? -r.d : 0), 0);
  const byK = new Map();
  for (const r of rows0) { const e = byK.get(r.k) || { n: 0, z: 0 }; e.n++; e.z += r.d; byK.set(r.k, e); }
  const byDay = new Map();
  for (const r of real) { const d = ledDay(r.t), e = byDay.get(d) || { i: 0, o: 0 }; if (r.d > 0) e.i += r.d; else e.o -= r.d; byDay.set(d, e); }
  const opt = (v, cur, l) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
  const bar = `<div class="invbar">${srvs.length > 1 ? `<select id="ledsrv">${srvs.map((s) => opt(s, LED_SRV, serverLabel(s))).join("")}${opt("*", LED_SRV, noaIn ? "全ワールド（B鯖換算）" : "全ワールド")}</select>` : ""}<select id="ledchar">${opt("", LED_CHAR, "全キャラ")}${cl.map((c) => opt(c, LED_CHAR, ALLW ? `${cn(c)}（${serverLabel(srvOf(c))}）` : cn(c))).join("")}</select><select id="leddays">${[[1, "今日"], [7, "7日"], [30, "30日"], [0, "全部"]].map(([v, l]) => `<option value="${v}" ${v === LED_DAYS ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
  const note = `<div class="muted" style="margin-bottom:6px">ツールを動かしているあいだの、ゼニーの増減と、そのとき動いた品の記録です（この PC だけに保存）。「何で」は前後の通信からの見立てです。${ALLW && noaIn ? "ノアトゥーンの金額は B鯖換算（×1000）にして足しています。" : "ワールドごとに分けています。「全ワールド」を選ぶと、ノアトゥーンを B鯖換算（×1000）にして合わせて出します。"}</div>`;
  const big = (l, n, c) => `<div style="min-width:120px">${l}<b class="${c}" style="display:block;font-size:18px">${ledZ(n)} z</b></div>`;
  const sum = `<div style="display:flex;gap:18px;flex-wrap:wrap;margin:8px 0">${big("収入", inc, "ok")}${big("支出", -out, "warn")}${big("差し引き", inc - out, ledCls(inc - out))}${noaNow ? `<div style="min-width:120px" class="muted">B鯖換算（×1000）<b class="${ledCls(inc - out)}" style="display:block;font-size:18px">${ledZ((inc - out) * 1000)} z</b></div>` : ""}</div>`;
  const kinds = [...byK].sort((a, b) => Math.abs(b[1].z) - Math.abs(a[1].z));
  const kt = `<div class="tablewrap"><table class="invt"><thead><tr><th>何で</th><th class="n">回数</th><th class="n">金額</th></tr></thead><tbody>${kinds.map(([k, e]) =>
    `<tr data-ledk="${esc(k)}" style="cursor:pointer${LED_KIND === k ? ";background:var(--line)" : ""}" title="押すと明細をこれだけにします"><td>${esc(K[k] || k)}${k === "unseen" ? `<span class="sub">（収入・支出に入れない）</span>` : ""}</td><td class="n">${fmtN(e.n)}</td><td class="n ${ledCls(e.z)}">${ledZ(e.z)}</td></tr>`).join("")}</tbody></table></div>`;
  const days = [...byDay].sort((a, b) => b[0].localeCompare(a[0]));
  const dt = days.length > 1 ? `<div class="tablewrap" style="margin-top:8px"><table class="invt"><thead><tr><th>日</th><th class="n">収入</th><th class="n">支出</th><th class="n">差し引き</th></tr></thead><tbody>${days.slice(0, 60).map(([d, e]) =>
    `<tr><td>${esc(d.slice(5).replace("-", "/"))}</td><td class="n ok">${ledZ(e.i)}</td><td class="n warn">${ledZ(-e.o)}</td><td class="n ${ledCls(e.i - e.o)}">${ledZ(e.i - e.o)}</td></tr>`).join("")}</tbody></table></div>` : "";
  const cap = rows.slice(0, 300);
  const det = `<div style="margin:12px 0 4px;font-weight:bold">明細${LED_KIND ? `（${esc(K[LED_KIND] || LED_KIND)}だけ <button class="ghost" id="ledkx">全部に戻す</button>）` : ""}<span class="muted" style="font-weight:normal">　${fmtN(rows.length)} 件${rows.length > cap.length ? `（新しい ${cap.length} 件を表示）` : ""}</span></div>
    <div class="tablewrap"><table class="invt"><thead><tr><th>日時</th>${LED_CHAR ? "" : "<th>キャラ</th>"}<th>何で</th><th class="n">金額</th><th>品物</th><th class="n">所持金</th></tr></thead><tbody>${cap.map((r) =>
    `<tr><td>${esc(when(r.t))}</td>${LED_CHAR ? "" : `<td>${esc(cn(r.c))}${r.noa ? `<span class="sub">（N・換算）</span>` : ""}</td>`}<td>${esc(K[r.k] || r.k)}</td><td class="n ${ledCls(r.d)}">${r.d ? ledZ(r.d) : ""}</td><td>${ledItems(r)}</td><td class="n muted">${r.b == null ? "" : fmtN(r.b)}</td></tr>`).join("")}</tbody></table></div>`;
  $("#view").innerHTML = `${nav}${bar}${note}${sum}${kt}${dt}${det}`;
  ledBind();
}
function ledBind() {
  const v = $("#view");
  v.querySelectorAll("[data-invsub]").forEach((b) => b.onclick = () => { INVSUB = b.dataset.invsub; store.set("md_invsub", INVSUB); render(); });
  v.querySelectorAll("[data-ledk]").forEach((tr) => tr.onclick = () => { LED_KIND = LED_KIND === tr.dataset.ledk ? "" : tr.dataset.ledk; render(); });
  const on = (id, f) => { const e = $(id); if (e) e.onchange = () => { f(e.value); render(); }; };
  on("#ledsrv", (x) => { LED_SRV = x; LED_CHAR = ""; });
  on("#ledchar", (x) => { LED_CHAR = x; });
  on("#leddays", (x) => { LED_DAYS = +x; store.set("md_leddays", String(LED_DAYS)); });
  const kx = $("#ledkx"); if (kx) kx.onclick = () => { LED_KIND = ""; render(); };
}

function renderInventory(chars) {
  if (INVSUB === "ledger") { renderLedger(chars); return; }
  if (!INV || INV_T !== ((DATA && DATA.inv_t) || 0)) invLoad();
  if (!INV) { $("#view").innerHTML = `<div class="panel empty">読み込んでいます…</div>`; return; }
  const cur = nowChar() || lastChar();
  if (!INV_CHAR || !chars.includes(INV_CHAR)) INV_CHAR = cur && chars.includes(cur) ? cur : (chars.find((c) => INV.chars[c]) || chars[0] || "");
  const slots = invStoreSlots(INV_CHAR);
  if (INVSUB !== "bag" && INVSUB !== "all" && !slots.some((s) => s.id === INVSUB)) INVSUB = "bag";
  const nav = invNav(slots);
  let head = "", body = "", tblFn = null;
  const unk = invUnknownIds();
  const resBtn = unk.length || INV_RES.run ? `<button class="ghost" id="invres" ${INV_RES.run ? "disabled" : ""} title="公式ツールの露店の取引から、名前を調べます（1件3秒ほど。取引が無い品は分かりません）">${INV_RES.run ? `調べています… 残り ${INV_RES.left} / ${INV_RES.total} 件` : `名前不明 ${unk.length} 件を調べる`}</button>` : "";
  const bar = (extra) => `<div class="invbar">${extra}<input type="search" class="invq" placeholder="名前で絞り込み" value="${esc(INV_Q)}"><select id="invsort"><option value="name" ${INV_SORT === "name" ? "selected" : ""}>名前順</option><option value="count" ${INV_SORT === "count" ? "selected" : ""}>個数が多い順</option></select>${resBtn}</div>`;
  if (INVSUB === "all") {
    head = `<div class="invbar"><input type="search" class="invq" placeholder="品の名前（全部から探す）" value="${esc(INV_Q)}">${resBtn}</div>`;
    body = `<div id="invtbl"></div>`; tblFn = invAllTable;
  } else if (INVSUB === "bag") {
    const C = INV.chars[INV_CHAR], isNow = INV_CHAR === nowChar();
    const sel = `<select id="invchar">${chars.map((c) => `<option value="${esc(c)}" ${c === INV_CHAR ? "selected" : ""}>${esc(cn(c))}${c === nowChar() ? "（いまログイン中）" : ""}</option>`).join("")}</select>`;
    head = bar(sel);
    if (!C) body = `<div class="panel empty">このキャラの持ち物は、まだ読めていません。<br>ツールを動かしたままログインすると出ます。</div>`;
    else body = `<div class="muted" style="margin-bottom:6px">${isNow ? "いまログイン中のキャラの持ち物です。" : "最後に読めた持ち物です。"}${C.has && C.t ? `　最終確認 ${when(C.t)}` : "　（装備ではない品は、まだ一覧を読めていません。ログインし直すと読めます）"}　個数は、ゲームの一覧を読んだあと、拾う・消えるを反映した値です（使った・売った分は次にログインしたときに直ります）。</div>` + `<div id="invtbl"></div>`; if (C) tblFn = () => invTable(invRows(C.has ? C.items : [], C.eq));
  } else {
    const s = slots.find((x) => x.id === INVSUB);
    head = bar(`<span class="muted">${esc(cn(INV_CHAR))} のアカウントの倉庫</span>`);
    if (!s || !s.st) body = `<div class="panel empty">「${esc(s ? s.label : "")}」は、まだ読めていません。<br>ゲームで、その倉庫を開くと記録されます（ツールを動かしたまま）。</div>`;
    else body = `<div class="muted" style="margin-bottom:6px">「${esc(s.st.title || s.label)}」　最終確認 ${when(s.st.t)}（${esc(cnU(s.st.by || ""))} が開いたとき）　品 ${s.st.items.length}・装備 ${(s.st.eq || []).length}${invChk(s.st)}　倉庫の中身は、開いたときの一覧に、そのあとの出し入れを足したものです${s.st.live ? `（最後の出し入れ ${when(s.st.live)}）` : ""}。</div>` + `<div id="invtbl"></div>`; if (s && s.st) tblFn = () => invTable(invRows(s.st.items, s.st.eq));
  }
  const catBar = INVSUB === "all" ? "" : `<div class="simnav" id="invcat">${INV_CATS.map(([k, l]) => `<button data-invcat="${k}" class="${INV_CAT === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  $("#view").innerHTML = `${nav}${head}${catBar}${body}`;
  $("#view").querySelectorAll("[data-invcat]").forEach((b) => b.onclick = () => { INV_CAT = b.dataset.invcat; store.set("md_invcat", INV_CAT); render(); });
  $("#view").querySelectorAll("[data-invsub]").forEach((b) => b.onclick = () => { INVSUB = b.dataset.invsub; store.set("md_invsub", INVSUB); render(); });
  const ic = $("#invchar"); if (ic) ic.onchange = () => { INV_CHAR = ic.value; render(); };
  const fill = INV_FILL = () => { const t = $("#invtbl"); if (!t || !tblFn) return; t.innerHTML = tblFn(); t.querySelectorAll("[data-mk]").forEach((b) => b.onclick = () => mktOpen(b.dataset.mk, b.dataset.mkn)); t.querySelectorAll("[data-nm]").forEach((b) => b.onclick = () => invNameSet(b.dataset.nm)); };
  const rb = $("#invres"); if (rb) rb.onclick = invResolve;
  fill();
  const sq = $("#view").querySelector("input.invq"); if (sq) sq.oninput = () => { INV_Q = sq.value; fill(); };      // 入力中は全体を描き直さず、表だけ作り直す
  const so = $("#invsort"); if (so) so.onchange = () => { INV_SORT = so.value; render(); };
}

// ---------- 相場 ----------
const mktYen = (n) => n == null || isNaN(n) ? "-" : fmtN(Math.ceil(n)) + " z";
function mktClose() { clearTimeout(MKT.timer); const b = $("#mktbox"); if (b) b.remove(); MKT.id = 0; }
async function mktFetch(ask, refresh) {
  const r = await fetch(`/api/market?id=${MKT.id}${ask ? "&ask=1" : ""}${refresh ? "&refresh=1" : ""}`).then((x) => x.json()).catch(() => null);
  if (!MKT.id || (r && String(r.id) !== String(MKT.id))) return;      // 前に開いた品の返事が遅れて届いても使わない
  MKT.view = r; mktDraw();
  if (r && r.rec && r.rec.t && !r.busy) {      // 取れた相場を、一覧の列にも反映する
    const tr = (r.rec.trades || [])[0];
    MKB[String(r.id)] = [r.rec.t, tr ? Math.floor(tr.p / Math.max(1, tr.n)) : null, tr ? tr.d : "", r.rec.summary ? r.rec.summary.median : null];
    if (INV_FILL && TAB === "inv") INV_FILL();
  }
  if (r && r.learned) { INV_T = -1; invLoad(); }      // 公式の品名で、この番号の名前がわかった → 表を読み直す
  clearTimeout(MKT.timer);
  if (r && r.busy) MKT.timer = setTimeout(() => mktFetch(false, false), 2500);      // 取りにいっている間は、2.5秒おきに見にいく
}
function mktOpen(id, name) {
  mktClose();
  MKT.id = +id; MKT.name = name || invName(id); MKT.view = null;
  const box = document.createElement("div"); box.id = "mktbox"; box.onclick = (e) => { if (e.target === box) mktClose(); };
  document.body.appendChild(box); mktDraw();
  mktFetch(true, false);
}
function mktDraw() {
  const box = $("#mktbox"); if (!box) return;
  const v = MKT.view, r = v && v.rec, S = r && r.summary;
  let h = `<div class="mk-in"><div style="display:flex;gap:8px;align-items:center"><b style="font-size:16px;flex:1">${esc(MKT.name)}　の相場</b><button class="ghost" id="mktre">最新に更新</button><button class="ghost" id="mktx">閉じる</button></div>
    <div class="muted" style="font-size:12px">出典: RO公式ツール「露店取引情報」（全ワールド・全期間）。${r && r.t ? `取得 ${when(r.t)}（この PC に保存）` : ""}</div>`;
  if (!v || (v.busy && !r)) h += `<div style="padding:16px">公式ツールから取っています…（サイトに負担をかけないよう、数秒かかります）</div>`;
  else if (!r || (!r.t && r.err)) h += `<div class="warn" style="padding:12px">取れませんでした: ${esc((r && r.err) || "")}<br>少し待って「最新に更新」を押してください。</div>`;
  else {
    if (v.busy) h += `<div class="muted">最新を取り直しています…</div>`;
    if (r.err) h += `<div class="warn" style="font-size:12px">更新に失敗したので、前に取った内容を出しています（${esc(r.err)}）</div>`;
    if (!r.trades.length) h += `<div style="padding:12px">露店の取引は見つかりませんでした。</div>`;
    else {
      const noa = (z) => (z != null && z / 1000 > 1 ? mktYen(z / 1000) : "-");
      h += `<div class="mk-sum"><div>中央値<b>${mktYen(S && S.median)}</b><span class="muted">Noatun価格 ${noa(S && S.median)}</span></div><div>最低値<b>${mktYen(S && S.min)}</b><span class="muted">Noatun価格 ${noa(S && S.min)}</span></div><div>最高値<b>${mktYen(S && S.max)}</b><span class="muted">Noatun価格 ${noa(S && S.max)}</span></div></div>
        <div class="muted" style="font-size:12px">単価 = 取引金額 ÷ 個数。Noatun価格は、その値を 1000 で割ったもの（公式ページと同じ計算）。公式ツール全体で ${fmtN(r.total)} 件。この PC には取り直すたびに足して ${r.trades.length} 件を保存しています（表は新しい 60 件）。</div>
        <div class="tablewrap" style="max-height:340px;overflow:auto"><table class="invt"><thead><tr><th>日時</th><th class="n">単価</th><th class="n">個数</th><th>精錬</th><th>場所</th><th>ワールド</th></tr></thead><tbody>${r.trades.slice(0, 60).map((t) =>
          `<tr><td>${esc(t.d)}</td><td class="n">${mktYen(t.p / t.n)}</td><td class="n">${fmtN(t.n)}</td><td>${t.r ? "+" + t.r : ""}${t.g ? " ★" + t.g : ""}</td><td>${esc(t.map)}</td><td>${esc(t.w)}</td></tr>`).join("")}</tbody></table></div>`;
    }
  }
  box.innerHTML = h + `</div>`;
  $("#mktx").onclick = mktClose;
  $("#mktre").onclick = () => mktFetch(true, true);
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#mktbox")) mktClose(); });
