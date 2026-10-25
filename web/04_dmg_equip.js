"use strict";
// ---------- 被ダメ ----------
// ツールが記録した「だれの・どの技で・どれくらい受けたか」。キャラごと・MDごとに [回数, 合計, 最大, 最後, ヒット数]
let DMG_CHAR = "", DMG_MD = "", DMG_GEAR = "";
// 装備セット(当たったときの 鎧の属性・属性耐性・DEF・MDEF)。見つかった順に A, B, C…
// 装備セット・シャドウセットの記号(A, B… / S1…)の色。自分で決めた色(color)が無ければ、記号の文字から自動で決める
const TAG_COLORS = ["#3b5bdb", "#e8590c", "#2f9e44", "#c2255c", "#1098ad", "#9c36b5", "#f08c00", "#5c7cfa", "#d6336c", "#0ca678", "#7048e8", "#e03131"];
function tagColor(st) {
  if (st && st.color) return st.color;
  let h = 0;
  for (const ch of String((st && st.tag) || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
const tagChip = (st) => st.tag ? `<span class="tag stag" style="background:${tagColor(st)}">${esc(st.tag)}</span>` : `<span class="tag" title="記号を付けていない装備（履歴）">履歴</span>`;
// 被ダメの記録の装備は「装備セット+シャドウセット」の ID。絞り込みや記号は装備セット(メイン)でまとめる
const gearMain = (id) => String(id || "").split("+")[0];
const gearShadow = (id) => String(id || "").split("+")[1] || "";
function gearSets() {      // {装備セットID: {letter(記号), name, p(最新の鎧の属性・耐性・DEF・MDEF), n, first, last}}
  const S = DATA.dmg_sets || {}, EQ = DATA.equip || {};
  const out = {};
  for (const [id, v] of Object.entries(S)) {
    const m = gearMain(id), x = out[m] = out[m] || { n: 0, first: v.first, last: 0 };
    x.n += v.n || 0; x.first = Math.min(x.first || v.first, v.first || x.first);
    if ((v.last || 0) >= x.last) { x.last = v.last || 0; x.p = v.p; }
  }
  // 前の版の記録(共通の装備セットになる前の ID)は「旧1, 旧2…」
  const old = Object.keys(out).filter((m) => !(EQ.sets || {})[m]).sort((a, b) => (out[a].first || 0) - (out[b].first || 0));
  for (const [m, x] of Object.entries(out)) {
    const st = (EQ.sets || {})[m];
    x.letter = st ? st.tag || "履歴" : "旧" + (old.indexOf(m) + 1);
    x.color = st ? tagColor(st) : "";
    x.name = st ? (st.name || st.auto || "") : "";
  }
  return out;
}
const shadowTagOf = (id) => { const sh = ((DATA.equip || {}).shadows || {})[gearShadow(id)]; return sh ? sh.tag : ""; };
const equipSetName = (sid) => { const st = ((DATA.equip || {}).sets || {})[gearMain(sid)]; return st ? (st.name || st.auto) : ""; };
function gearText(p) {
  if (!p) return "";
  const res = Object.entries(p.res || {}).map(([e, v]) => `${e}${v}%`).join(" ");
  return `${p.armor}鎧・耐性 ${res || "なし"}・DEF ${p.def.join("+")}・MDEF ${p.mdef.join("+")}`;
}
const gearTag = (G, id) => { const g = G[gearMain(id)]; if (!g) return ""; const sh = shadowTagOf(id);
  return `<span class="tag ${g.color ? "stag" : ""}" ${g.color ? `style="background:${g.color}"` : ""} title="${esc((g.name ? g.name + "\n" : "") + gearText(g.p))}">${esc(g.letter)}${sh ? "・" + esc(sh) : ""}</span>`; };

// ---------- 装備 ----------
// キャラ × 装備セット。全部の場所(衣装をのぞく)がうまったときの装備を「装備セット」として覚えている
let EQ_CHAR = "";
const UNL = `<span class="unl" title="ゲームのアイテムと結びついていません（耐性のまとめに入りません）">?</span>`;
function itemLine(it, sim) {
  const head = `${it.refine ? `+${it.refine} ` : ""}${it.grade ? `[★${it.grade}] ` : ""}${it.name}`;
  const cards = (it.cards || []).map((c) => esc(c.name) + (sim && c.id == null ? UNL : ""));
  return `<span class="eq-name">${esc(head)}</span>${sim && it.itemId == null ? UNL : ""}${cards.length ? ` <span class="muted">（${cards.join("，")}）</span>` : ""}`
    + ((it.options || []).length ? `<div class="eq-opt">${it.options.map((o) => esc(o.text)).join(" ／ ")}</div>` : "");
}
// ---- 装備の外し忘れ: ログアウト(または別のキャラへ)したあとも、装備を持ったままのキャラに印を付ける ----
const CARRY_ON = true;        // 外し忘れの表示。「持ったまま」の判定が甘いので、直すまで画面に出さない(通信の記録 = char_core の carry・[倉庫] ログは続けている)
const carryKey = (it) => it.itemId + ":" + (it.refine || 0);       // 「数えない」装備の見分け(アイテム番号と精錬値)
const carryIgnored = (c) => new Set(((SETTINGS.carryIgnore || {})[c]) || []);
const carryAll = (c) => { if (!CARRY_ON) return null; const e = ((DATA.equip || {}).chars || {})[c], k = e && e.carry; return k && k.known ? k : null; };
function carryOf(c) {                    // 「いつも持つスペア」(数えない)を引いた、持ったままの装備
  const k = carryAll(c); if (!k) return null;
  const ig = carryIgnored(c); if (!ig.size) return k;
  const items = k.items.filter((it) => !ig.has(carryKey(it)));
  return { ...k, items, n: items.length, worn: items.filter((it) => it.slot !== "持ち物（着ていない）").length, bag: items.filter((it) => it.slot === "持ち物（着ていない）").length };
}
function carryChip(c, always) {         // MD の表のキャラの横。いまログインしているキャラは、ふつうは装備を着ているので出さない(always で出す)
  const k = carryOf(c); if (!k || !k.n || (!always && (DATA.now_chars || []).includes(c))) return "";
  const names = k.items.slice(0, 6).map((it) => it.name).join("、") + (k.n > 6 ? ` ほか ${k.n - 6} 点` : "");
  // 着ている装備が記号つきの装備セット(A・B…)なら、その記号(色つき)。そうでなければ服のアイコン(個数はマウスを置くと出る)
  const EQ = DATA.equip || {}, st = k.set && (EQ.sets || {})[k.set], sh = k.shadow && (EQ.shadows || {})[k.shadow];
  // 通常装備が未登録(記号なし)なら 👕 だけ。シャドウの記号は出さない(👕 と同じ「持ったまま」の印なので)。登録ずみ(A・B…)なら、シャドウも登録ずみ(S1…)のときだけ並べる
  const tags = (k.set && !(st && st.tag)) ? [] : [st && st.tag ? st : null, sh && sh.tag ? sh : null].filter(Boolean);
  const label = tags.length ? tags.map((x) => `<span class="ctag" style="background:${tagColor(x)}">${esc(x.tag)}</span>`).join("") : "👕";
  return `<span class="carry${tags.length ? " set" : ""}${k.stale ? " stale" : ""}" title="${esc(`装備を持ったままです（着ている ${k.worn}・持ち物 ${k.bag}）${tags.length ? "。着ているのは装備スロット " + tags.map((x) => x.tag).join("・") : ""}: ${names}${k.stale ? "。このログインでは装備の一覧が読めていないので、古い記録です" : ""}。クリックでキャラ詳細`)}">${label}</span>`;
}
function carryHtml(c) {                 // キャラ詳細: 倉庫に入れていない(持ったままの)装備
  const all = carryAll(c);
  if (!CARRY_ON) return "";
  if (!all) return `<div class="carry-box"><h3>倉庫に入れていない装備</h3><div class="muted">まだ装備を読めていません（このキャラでログインすると読めます）。</div></div>`;
  const ig = carryIgnored(c), k = carryOf(c), gone = (all.gone || []).slice().reverse();
  const rows = all.items.map((it) => { const off = ig.has(carryKey(it)); return `<tr class="${off ? "dim" : ""}"><th>${esc(it.slot)}</th><td>${itemLine(it)} <button class="ghost cig" data-cig="${esc(c)}" data-cigk="${esc(carryKey(it))}" title="${off ? "また数えます" : "いつも持っている装備(スペア)は、外し忘れの数に入れません"}">${off ? "数える" : "数えない"}</button></td></tr>`; }).join("");
  return `<div class="carry-box"><h3>倉庫に入れていない装備（持ったまま ${k.n}点${all.n !== k.n ? `・数えないもの ${all.n - k.n}点` : ""}）</h3>
    ${all.stale ? `<div class="warn" style="margin:4px 0">このログインでは装備の一覧（ログイン時に届く通信）を受け取れていないので、下は古い記録です。</div>` : ""}
    ${all.n ? `<table class="eq-t"><tbody>${rows}</tbody></table>` : `<div class="muted">持ったままの装備はありません（着ている装備も、持ち物の装備もありません）。</div>`}
    <div class="muted" style="font-size:12px;margin-top:4px">着ている装備（衣装は除く）と、着ていない持ち物の装備です。いつも持っているスペアは「数えない」で、数から外せます（同じ名前・同じ精錬値のものが全部対象。キャラごとの設定）。持ち物から消えた装備は、倉庫に入れたとみなします（途中で取り出して持ったままにした分は、取り出しの通信を読めたときだけ反映されます）。${gone.length ? `<br>最後に持ち物から外れた装備: ${gone.map((g) => `${esc(g.refine ? "+" + g.refine + " " : "")}${esc(g.name)}（${when(g.t)}）`).join("、")}` : ""}</div></div>`;
}
function itemsTable(items, sim) {
  return `<table class="eq-t"><tbody>${items.map((it) => `<tr><th>${esc(it.slot)}</th><td>${itemLine(it, sim)}</td></tr>`).join("")}</tbody></table>`;
}
// 計算機で作った装備セットの中で、ゲームのアイテム番号と結びついていない名前(装備・カード・エンチャント)
const simUnlinked = (st) => { const out = []; for (const it of st.items || []) { if (it.itemId == null) out.push(it.name); for (const c of it.cards || []) if (c.id == null) out.push(c.name); } return [...new Set(out)]; };
let ITEMDB = null;                        // [{v: 番号, t: 名前（番号）}] 結びつける相手の候補(/api/itemnames)
async function loadItemDb() {
  if (!ITEMDB) { const d = await fetch("/api/itemnames").then((r) => r.json()).catch(() => ({})); ITEMDB = Object.entries(d).filter(([k]) => /^\d+$/.test(k)).map(([k, v]) => ({ v: +k, t: `${v}（${k}）` })); }
  return ITEMDB;
}
function statusHtmlEq(st) {
  if (!st) return "";
  const s = st.stats || {}, d = st.derived || {};
  const sv = (k) => s[k] ? `${s[k].base}${s[k].plus ? "+" + s[k].plus : ""}` : "-";
  const two = (a, b) => d[a] === undefined ? "-" : `${d[a]}${d[b] ? " + " + d[b] : ""}`;
  const cell = (l, v) => `<div><span class="muted">${l}</span> <b>${esc(String(v))}</b></div>`;
  return `<div class="eq-st">
    ${cell("Lv", `${st.lv ?? "-"}${st.jobLv ? " / Job " + st.jobLv : ""}`)}${cell("職業", st.jobName || "-")}
    ${cell("HP", d.MaxHP ?? "-")}${cell("SP", d.MaxSP ?? "-")}${d.MaxAP !== undefined ? cell("AP", d.MaxAP) : ""}</div>
    <div class="eq-st">${["STR", "AGI", "VIT", "INT", "DEX", "LUK"].map((k) => cell(k, sv(k))).join("")}</div>
    ${s.POW ? `<div class="eq-st">${["POW", "STA", "WIS", "SPL", "CON", "CRT"].map((k) => cell(k, sv(k))).join("")}</div>` : ""}
    <div class="eq-st">${cell("Atk", two("ATK", "ATK2"))}${cell("Matk", d.MATKmin !== undefined ? `${d.MATKmin} + ${d.MATKmax}` : "-")}${cell("Def", two("DEF", "DEF2"))}${cell("Mdef", two("MDEF", "MDEF2"))}${cell("Hit", d.HIT ?? "-")}${cell("Flee", two("FLEE", "FLEE2"))}${cell("Critical", d.CRIT ?? "-")}</div>
    ${d["P.ATK"] !== undefined || d.RES !== undefined ? `<div class="eq-st">${["P.ATK", "S.MATK", "RES", "MRES", "H.PLUS", "C.RATE"].map((k) => cell(k, d[k] ?? "-")).join("")}</div>` : ""}`;
}
