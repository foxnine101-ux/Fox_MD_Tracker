"use strict";
// ---------- インベントリ(持ち物・倉庫 4つ・W倉庫)と相場 ----------
// 中身は通信から読んだもの(char_core の 0B09/0B39。ゲームで持ち物・倉庫を開くたびに最新になる)。/api/inv で読む。
// 相場は公式ツールの露店の取引履歴(market_core。/api/market。この PC に保存)。
let INV = null, INV_T = -1, INV_LOADING = false;      // /api/inv の返事・読んだときの inv_t
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
  fetch("/api/inv").then((r) => r.json()).then((d) => { INV = d; }).catch(() => { INV = INV || { chars: {}, stores: {}, names: {} }; })
    .finally(() => { INV_LOADING = false; if (TAB === "inv") render(); });
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

function invStoreSlots(c) {
  const S = invStores(c), list = Object.entries(S).map(([k, v]) => ({ k, ...v })).sort((a, b) => (a.inv - b.inv) || String(a.title).localeCompare(String(b.title), "ja", { numeric: true }));
  const normal = list.filter((x) => x.inv === 2), w = list.filter((x) => x.inv === 4), guild = list.filter((x) => x.inv === 3);
  const slots = [];
  for (let i = 0; i < Math.max(4, normal.length); i++) slots.push(normal[i] ? { id: normal[i].k, label: normal[i].title || `倉庫${i + 1}`, st: normal[i] } : { id: "n" + i, label: `倉庫${i + 1}`, st: null });
  slots.push(w[0] ? { id: w[0].k, label: "W倉庫", st: w[0] } : { id: "w", label: "W倉庫", st: null });
  if (guild[0]) slots.push({ id: guild[0].k, label: "ギルド倉庫", st: guild[0] });
  return slots;
}

function invRows(items, eq) {
  const q = INV_Q.trim().toLowerCase();
  const rows = [];
  for (const x of items || []) rows.push({ id: x.itemId, name: invName(x.itemId), count: x.count, eq: false });
  for (const e of eq || []) {
    const cards = (e.cards || []).map((c) => c.name).filter(Boolean).join(" / ");
    rows.push({ id: e.itemId, name: (e.refine ? `+${e.refine} ` : "") + (e.name || invName(e.itemId)), base: e.name || invName(e.itemId), count: 1, eq: true, sub: [cards, e.slot ? `装備中: ${e.slot}` : ""].filter(Boolean).join("　"), opts: (e.options || []).map((o) => o.text).filter(Boolean).join(" / ") });
  }
  const f = q ? rows.filter((r) => (r.name + (r.sub || "")).toLowerCase().includes(q)) : rows;
  f.sort((a, b) => INV_SORT === "count" ? (b.count - a.count) || a.name.localeCompare(b.name, "ja") : a.eq - b.eq || a.name.localeCompare(b.name, "ja", { numeric: true }));
  return f;
}
function invTable(rows) {
  if (!rows.length) return `<div class="muted" style="padding:10px">該当する品はありません。</div>`;
  return `<div class="tablewrap"><table class="invt"><thead><tr><th>アイテム</th><th class="n">個数</th><th></th></tr></thead><tbody>${rows.map((r) =>
    `<tr><td>${esc(r.name)}${r.sub ? `<div class="sub">${esc(r.sub)}</div>` : ""}${r.opts ? `<div class="sub">${esc(r.opts)}</div>` : ""}</td><td class="n">${r.eq ? "" : fmtN(r.count)}</td><td><button class="ghost mk" data-mk="${r.id}" data-mkn="${esc(r.base || r.name)}" title="公式ツールの露店の取引履歴(相場)を見る">相場</button></td></tr>`).join("")}</tbody></table></div>`;
}

function renderInventory(chars) {
  if (!INV || INV_T !== ((DATA && DATA.inv_t) || 0)) invLoad();
  if (!INV) { $("#view").innerHTML = `<div class="panel empty">読み込んでいます…</div>`; return; }
  const cur = nowChar() || lastChar();
  if (!INV_CHAR || !chars.includes(INV_CHAR)) INV_CHAR = cur && chars.includes(cur) ? cur : (chars.find((c) => INV.chars[c]) || chars[0] || "");
  const slots = invStoreSlots(INV_CHAR);
  if (INVSUB !== "bag" && !slots.some((s) => s.id === INVSUB)) INVSUB = "bag";
  const nav = `<div class="simnav" id="invnav"><button data-invsub="bag" class="${INVSUB === "bag" ? "on" : ""}">持ち物</button>${slots.map((s) => `<button data-invsub="${esc(s.id)}" class="${INVSUB === s.id ? "on" : ""}" ${s.st ? "" : `style="opacity:.55"`}>${esc(s.label)}</button>`).join("")}</div>`;
  let head = "", body = "", rowsFn = null;
  const bar = (extra) => `<div class="invbar">${extra}<input type="search" class="invq" placeholder="名前で絞り込み" value="${esc(INV_Q)}"><select id="invsort"><option value="name" ${INV_SORT === "name" ? "selected" : ""}>名前順</option><option value="count" ${INV_SORT === "count" ? "selected" : ""}>個数が多い順</option></select></div>`;
  if (INVSUB === "bag") {
    const C = INV.chars[INV_CHAR], isNow = INV_CHAR === nowChar();
    const sel = `<select id="invchar">${chars.map((c) => `<option value="${esc(c)}" ${c === INV_CHAR ? "selected" : ""}>${esc(cn(c))}${c === nowChar() ? "（いまログイン中）" : ""}</option>`).join("")}</select>`;
    head = bar(sel);
    if (!C) body = `<div class="panel empty">このキャラの持ち物は、まだ読めていません。<br>ツールを動かしたままログインすると出ます。</div>`;
    else body = `<div class="muted" style="margin-bottom:6px">${isNow ? "いまログイン中のキャラの持ち物です。" : "最後に読めた持ち物です。"}${C.has && C.t ? `　最終確認 ${when(C.t)}` : "　（装備ではない品は、まだ一覧を読めていません。ログインし直すと読めます）"}　個数は、ゲームの一覧を読んだあと、拾う・消えるを反映した値です（使った・売った分は次にログインしたときに直ります）。</div>` + `<div id="invtbl"></div>`; if (C) rowsFn = () => invRows(C.has ? C.items : [], C.eq);
  } else {
    const s = slots.find((x) => x.id === INVSUB);
    head = bar(`<span class="muted">${esc(cn(INV_CHAR))} のアカウントの倉庫</span>`);
    if (!s || !s.st) body = `<div class="panel empty">「${esc(s ? s.label : "")}」は、まだ読めていません。<br>ゲームで、その倉庫を開くと記録されます（ツールを動かしたまま）。</div>`;
    else body = `<div class="muted" style="margin-bottom:6px">「${esc(s.st.title || s.label)}」　最終確認 ${when(s.st.t)}（${esc(cn(s.st.by || ""))} が開いたとき）　品 ${s.st.items.length}・装備 ${(s.st.eq || []).length}${invChk(s.st)}　倉庫の中身は、開いたときの状態です（出し入れは、次に開くまで反映されません）。</div>` + `<div id="invtbl"></div>`; if (s && s.st) rowsFn = () => invRows(s.st.items, s.st.eq);
  }
  $("#view").innerHTML = `${nav}${head}${body}`;
  $("#view").querySelectorAll("[data-invsub]").forEach((b) => b.onclick = () => { INVSUB = b.dataset.invsub; store.set("md_invsub", INVSUB); render(); });
  const ic = $("#invchar"); if (ic) ic.onchange = () => { INV_CHAR = ic.value; render(); };
  const fill = () => { const t = $("#invtbl"); if (!t || !rowsFn) return; t.innerHTML = invTable(rowsFn()); t.querySelectorAll("[data-mk]").forEach((b) => b.onclick = () => mktOpen(b.dataset.mk, b.dataset.mkn)); };
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
        <div class="muted" style="font-size:12px">単価 = 取引金額 ÷ 個数。Noatun価格は、その値を 1000 で割ったもの（公式ページと同じ計算）。全 ${fmtN(r.total)} 件のうち新しい ${r.trades.length} 件を保存しています。</div>
        <div class="tablewrap" style="max-height:340px;overflow:auto"><table class="invt"><thead><tr><th>日時</th><th class="n">単価</th><th class="n">個数</th><th>精錬</th><th>場所</th><th>ワールド</th></tr></thead><tbody>${r.trades.map((t) =>
          `<tr><td>${esc(t.d)}</td><td class="n">${mktYen(t.p / t.n)}</td><td class="n">${fmtN(t.n)}</td><td>${t.r ? "+" + t.r : ""}${t.g ? " ★" + t.g : ""}</td><td>${esc(t.map)}</td><td>${esc(t.w)}</td></tr>`).join("")}</tbody></table></div>`;
    }
  }
  box.innerHTML = h + `</div>`;
  $("#mktx").onclick = mktClose;
  $("#mktre").onclick = () => mktFetch(true, true);
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#mktbox")) mktClose(); });
