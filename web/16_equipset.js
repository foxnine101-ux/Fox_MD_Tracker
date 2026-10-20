"use strict";
// ---------- 装備セット ----------
// 装備セット(メイン10か所)・シャドウセット(6か所)。同じ中身はキャラが違っても同じセット。記号(A, B… / S1, S2…)と名前を付けられる
let GS_OPEN = {}, GS_FOCUS = "", GS_ALL = false, GS_NOW = false, GS_HISTALL = false;
const GS_HISTN = 10;
function nowGearHtml(chars) {       // いま着ている装備 = いまログインしているキャラの装備。ここからスロットに登録・上書きできる
  const EQ = DATA.equip || {}, E = EQ.chars || {}, c = nowChar();
  if (c && E[c] && !E[c].has_equip && E[c].inv) return `<h2>いま着ている装備 <span class="muted" style="font-weight:400;font-size:13px">（いまログインしている ${esc(cn(c))}）</span></h2><div class="panel eq-box"><span class="muted">いま着ている装備はありません（全部はずしています）。</span></div>` + unknownItemsHtml(EQ.unknown || []);
  if (!c || !E[c].has_equip) return `<h2>いま着ている装備</h2><div class="panel eq-box"><span class="muted">いまログインしているキャラがいません（ゲームにログインすると、そのキャラが着ている装備がここに出ます）。</span></div>` + unknownItemsHtml(EQ.unknown || []);
  EQ_CHAR = c;
  const e = E[c], S = EQ.sets || {}, SH = EQ.shadows || {};
  const tagOf = (st) => `${tagChip(st)} ${esc(st.name || st.auto)}`;
  const miss = (shadow) => esc((e.missing || []).filter((x) => x.startsWith("シャドウ") === shadow).join("・") || "-");
  const reg = (sid, T, sh) => (T[sid] && !T[sid].tag ? ` <button class="ghost" data-reg="${esc(sid)}" data-sh="${sh}" title="いま着ている${sh ? "シャドウ装備" : "装備"}を、新しいスロットに登録するか、登録ずみのスロットに上書きします">スロットに登録</button>` : "");
  return `<h2>いま着ている装備 <span class="muted" style="font-weight:400;font-size:13px">（いまログインしている ${esc(cn(c))}）</span></h2>${e.stale ? `<div class="warn" style="margin:4px 0">このログインでは装備の一覧（ログイン時に届く通信）を受け取れていないので、着替えが反映されていません。表示は前の記録のままです。ゲームでログインし直す（キャラ選択に戻って入り直す）と取り直します。</div>` : ""}<div class="panel eq-box"><div class="eq-h">
      <span>${S[e.cur] ? `<span class="muted">装備</span> ${tagOf(S[e.cur])}${reg(e.cur, S, 0)}` : `<span class="muted">装備がそろっていません（あいている場所: ${miss(false)}）</span>`}</span>
      <span>${SH[e.shadow] ? `<span class="muted">シャドウ</span> ${tagOf(SH[e.shadow])}${reg(e.shadow, SH, 1)}` : `<span class="muted">シャドウ装備がそろっていません（あいている場所: ${miss(true)}）</span>`}</span>
      <span class="eq-btns"><button class="ghost" id="gsnow">${GS_NOW ? "とじる" : "中身"}</button></span></div>
    ${GS_NOW ? itemsTable(e.now || []) : ""}</div>` + unknownItemsHtml(EQ.unknown || []);
}
function renderGSets(chars) {
  const EQ = DATA.equip || {}, DS = DATA.dmg_sets || {};
  const inWorld = (st) => GS_ALL || Object.keys(st.chars || {}).some(inServer);
  const dmgN = (sid) => Object.entries(DS).filter(([id]) => gearMain(id) === sid || gearShadow(id) === sid).reduce((n, [, v]) => n + (v.n || 0), 0);
  const section = (T, title, isShadow) => {
    // 登録したもの(記号の順) → 履歴。履歴は、スロットに登録していない組み合わせのうち「よく使うもの」を上から GS_HISTN 件だけ出す
    // (よく使う = 着た回数 → 被ダメの記録の数 → 新しさ の順。着がえの途中の組み合わせが下に沈む)
    const use = (sid, st) => [st.worn || 0, dmgN(sid), st.last || 0];
    const all = Object.entries(T).filter(([, st]) => st.tag || inWorld(st));
    const regL = all.filter(([, st]) => st.tag).sort((a, b) => String(a[1].tag).localeCompare(String(b[1].tag), "ja", { numeric: true }));
    const histAll = all.filter(([, st]) => !st.tag).sort((a, b) => { const x = use(...a), y = use(...b); return (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]); });
    const histL = GS_HISTALL ? histAll : histAll.slice(0, GS_HISTN), L = regL.concat(histL), nReg = regL.length;
    let x = `<h2>${isShadow ? "シャドウのスロット" : "装備スロット"}（登録 ${nReg}・履歴 ${histAll.length}）</h2>`, hist = false;
    if (!L.length) return x + `<div class="panel empty">まだありません。${isShadow ? "シャドウ装備6か所" : "兜・鎧・武器・盾・肩・靴・アクセサリー2つ"}が全部うまると記録されます。</div>`;
    for (const [sid, st] of L) {
      const cs = Object.entries(st.chars || {}).sort((a, b) => (b[1].last || 0) - (a[1].last || 0));
      const n = dmgN(sid), open = GS_OPEN[sid];
      if (!st.tag && !hist) { hist = true; x += `<h3 class="gshist">履歴 <span class="muted" style="font-weight:400">（スロットに登録していない組み合わせ。${histAll.length > GS_HISTN ? (GS_HISTALL ? `全部の ${histAll.length} 件` : `よく使う上位 ${GS_HISTN} 件／全部で ${histAll.length} 件`) : "よく使う順"}。残したいものは「登録」でスロットに）</span>${histAll.length > GS_HISTN ? ` <button class="ghost" data-histall>${GS_HISTALL ? "上位だけにする" : "全部見る"}</button>` : ""}</h3>`; }
      x += `<div class="panel eq-box${st.tag ? "" : " hist"}" data-gsid="${esc(sid)}"><div class="eq-h">
          ${st.tag ? `<button class="eqtagb" data-unreg="${esc(sid)}" title="押すと登録を外します（履歴に戻ります）。右クリックで記号を変えられます" style="background:${tagColor(st)};border-color:${tagColor(st)}">${esc(st.tag)}</button>
          <input type="color" class="eqcolor" data-sid="${esc(sid)}" value="${tagColor(st)}" title="記号の色を変える">${st.color ? `<button class="ghost" data-colreset="${esc(sid)}" title="自動の色に戻す">色を戻す</button>` : ""}`
          : `<button class="ghost" data-reg="${esc(sid)}" data-sh="${isShadow ? 1 : 0}" title="この装備を、新しいスロットに登録するか、登録ずみのスロットに上書きします">スロットに登録</button>`}
          ${st.sim ? `<span class="tag" title="計算機で作った装備">計算機</span>` : ""}
          <input class="eqname" data-sid="${esc(sid)}" value="${esc(st.name || "")}" placeholder="${esc(st.auto || "")}">
          <span class="muted">${st.worn || 0}回着た・最後 ${st.last ? when(st.last) : "-"}${n ? `・被ダメ ${fmtN(n)}回` : ""}</span>
          <span class="eq-btns">${n && !isShadow ? `<button class="ghost" data-dmg="${esc(sid)}">被ダメを見る</button>` : ""}
          <button class="ghost" data-open="${esc(sid)}">${open ? "とじる" : "中身"}</button>
          <button class="ghost" data-del="${esc(sid)}">消す</button></span></div>
        <div class="eq-sub muted">使ったキャラ: ${cs.length ? esc(cs.map(([c]) => cn(c)).join("、")) : "-"}</div>
        ${st.sim && simUnlinked(st).length ? `<div class="eq-sub"><span class="muted">ゲームのアイテムと結びついていないもの（耐性のまとめに入りません）:</span> ${simUnlinked(st).map((nm) => `<button class="ghost simlink" data-simlink="${esc(nm)}" title="ゲームのアイテムの一覧から選んで結びつけます（次からは自動）">${esc(nm)}</button>`).join("")}</div>` : ""}
        ${open ? itemsTable(st.items || [], !!st.sim) + cs.map(([c, v]) => `<div class="eq-use"><b>${esc(cn(c))}</b><span class="muted">最後に着た ${when(v.last)}</span></div>${statusHtmlEq(v.status)}`).join("") : ""}</div>`;
    }
    return x;
  };
  let h = nowGearHtml(chars || []);
  h += `<div class="opts"><label><input type="checkbox" id="gsall" ${GS_ALL ? "checked" : ""}> ほかのワールドのキャラが使ったセットも出す</label></div>`;
  h += section(EQ.sets || {}, "装備セット", false) + section(EQ.shadows || {}, "シャドウセット", true);
  h += `<p class="hint">装備セットは、兜・鎧・武器・盾・肩・靴・アクセサリー2つのメイン10か所が全部うまったときの組み合わせ、シャドウセットはシャドウ装備6か所の組み合わせです（衣装は数えません）。精錬・★・カード・エンチャント・ランダムオプションまで同じなら、キャラが違っても同じセットです。着た組み合わせはまず「履歴」に入り、「登録」を押したものだけに記号（A, B… / S1, S2…）が付きます。記号を押すと登録を外せます（右クリックで記号を変更）。色と名前は自由に変えられます（色は自動で分かれます。色の四角を押すと変えられます）（名前が空なら「+10ｾﾚｽ聖/+10ﾖﾙｽ毒/+7ｽﾃﾗ聖念50」のような 武器 / 鎧 / 肩 の自動の名前）。「中身」で、装備とキャラごとの着ていたときのステータスが見られます。被ダメタブの「装備」で、装備セットごとの被ダメを見られます。</p>`;
  $("#view").innerHTML = h;
  $("#gsall").onchange = (ev) => { GS_ALL = ev.target.checked; render(); };
  $("#view").querySelectorAll("[data-histall]").forEach((el) => el.onclick = () => { GS_HISTALL = !GS_HISTALL; render(); });
  if ($("#eqc")) $("#eqc").onchange = (ev) => { EQ_CHAR = ev.target.value; render(); };
  if ($("#gsnow")) $("#gsnow").onclick = () => { GS_NOW = !GS_NOW; render(); };
  bindUnknownItems();
  const post = (body) => fetch("/api/equipset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  $("#view").querySelectorAll("input.eqname").forEach((el) => {
    el.onkeydown = (ev) => { if (ev.key === "Enter") el.blur(); };
    el.onchange = async () => { await post({ sid: el.dataset.sid, name: el.value }); load(); };
  });
  $("#view").querySelectorAll("[data-simlink]").forEach((el) => el.onclick = async () => {
    const name = el.dataset.simlink; el.textContent = "候補を読み込み中…"; el.disabled = true;
    const db = await loadItemDb(); el.textContent = name; el.disabled = false;
    pickOpen(el, db, null, async (id) => {
      await post({ simlink: { name, id } });
      SETTINGS.ratLinks = SETTINGS.ratLinks || {}; SETTINGS.ratLinks[id] = name; saveSettings();     // 逆向き(ゲームの装備 → 計算機)も同じ結びつけを使う
      load();
    }, name.replace(/^\[[^\]]*\]\s*/, "").slice(0, 5));
  });
  $("#view").querySelectorAll("[data-unreg]").forEach((el) => {
    const sid = el.dataset.unreg, tag = el.textContent;
    el.onclick = async () => { if (await askOnce("unreg", `「${tag}」の登録を外します。\n装備の中身は履歴に残るので、あとでまた登録できます。`, "登録を外す")) { await post({ sid, unregister: 1 }); load(); } };
    el.oncontextmenu = (ev) => { ev.preventDefault(); showCtx(ev.clientX, ev.clientY, [{ cap: `「${tag}」` }, { label: "記号を変える", act: async () => { const v = prompt("新しい記号（8文字まで）", tag); if (v && v.trim()) { await post({ sid, tag: v.trim() }); load(); } } }, { label: "登録を外す", act: () => el.onclick() }]); };
  });
  $("#view").querySelectorAll("[data-reg]").forEach((el) => el.onclick = (ev) => {
    const sid = el.dataset.reg, T = (DATA.equip || {})[el.dataset.sh === "1" ? "shadows" : "sets"] || {};
    const reg = Object.entries(T).filter(([, st]) => st.tag).sort((a, b) => (a[1].first || 0) - (b[1].first || 0));
    const r = el.getBoundingClientRect();
    showCtx(r.left, r.bottom + 4, [{ label: "新しいスロットを作成して登録", act: async () => { await post({ sid, register: 1 }); load(); } }]
      .concat(reg.length ? ["-", { cap: "登録ずみのスロットを、この装備で上書き" }] : [])
      .concat(reg.map(([tid, st]) => ({ label: `スロット ${st.tag} に上書き（${st.name || st.auto || ""}）`, act: async () => { if (await askOnce("over", `「${st.tag}」を、この装備で上書きします。\nいまの「${st.tag}」の中身は履歴に戻ります。`, "上書きする")) { await post({ sid, register: 1, take: tid }); load(); } } }))));
  });
  $("#view").querySelectorAll("input.eqcolor").forEach((el) => el.onchange = async () => { await post({ sid: el.dataset.sid, color: el.value }); el.blur(); load(); });
  $("#view").querySelectorAll("[data-colreset]").forEach((b) => b.onclick = async () => { await post({ sid: b.dataset.colreset, color: "" }); load(); });
  $("#view").querySelectorAll("[data-open]").forEach((b) => b.onclick = () => { GS_OPEN[b.dataset.open] = !GS_OPEN[b.dataset.open]; render(); });
  $("#view").querySelectorAll("[data-dmg]").forEach((b) => b.onclick = () => { DMG_CHAR = ""; DMG_CHAR_AUTO = false; DMG_GEAR = b.dataset.dmg; DMG_MD = ""; TAB = "dmg"; store.set("md_tab", TAB); render(); });
  $("#view").querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "本当に消す？"; return; }
    await post({ sid: b.dataset.del, delete: 1 }); load();
  });
  if (GS_FOCUS) {        // キャラタブから来たセットを見せる
    const el = $("#view").querySelector(`[data-gsid="${CSS.escape(GS_FOCUS)}"]`);
    GS_FOCUS = "";
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("mx-flash"); }
  }
}
const fmtN = (n) => Number(n || 0).toLocaleString("ja-JP");
// 同じ装備セット(シャドウ違い)の行をまとめる
function mergeGear(g, gear) {
  const ids = Object.keys(g).filter((id) => gearMain(id) === gear);
  if (!ids.length) return null;
  if (ids.length === 1) return g[ids[0]];
  const out = {};
  for (const id of ids) for (const [k, v] of Object.entries(g[id])) {
    const x = out[k] = out[k] || [0, 0, 0, 0, 0, 0, 0, 0];
    if (v[7] && (v[3] >= x[3] || !x[7])) x[7] = v[7];
    x[0] += v[0]; x[1] += v[1]; x[2] = Math.max(x[2], v[2]); x[3] = Math.max(x[3], v[3]); x[4] += v[4] || 0; x[5] += v[5] || 0; x[6] += v[6] || 0;
  }
  return out;
}
function dmgMerge(chars, gear) {      // {MD: {"相手|技": [回数, 合計, 最大, 最後, ヒット, キャラ集合, 近接の合計, 遠距離の合計]}}
  const out = {};
  const src = (c) => !gear ? (DATA.chars[c] || {}).dmg || {}
    : Object.fromEntries(Object.entries((DATA.chars[c] || {}).dmg_g || {}).map(([w, g]) => [w, mergeGear(g, gear)]).filter(([, d]) => d));
  for (const c of chars) for (const [where, d] of Object.entries(src(c))) {
    const W = out[where] = out[where] || {};
    for (const [k, v] of Object.entries(d)) {
      const x = W[k] = W[k] || [0, 0, 0, 0, 0, new Set(), 0, 0, 0, ""];
      if (v[7] && (v[3] >= x[3] || !x[8])) { x[8] = v[7]; x[9] = c; }      // [8] 最新のダメージ、[9] そのときのキャラ
      x[0] += v[0]; x[1] += v[1]; x[2] = Math.max(x[2], v[2]); x[3] = Math.max(x[3], v[3]); x[4] += v[4] || v[0]; x[5].add(c);
      x[6] += v[5] || 0; x[7] += v[6] || 0;
    }
  }
  return out;
}
// 技の種類・属性(ツールが技の番号から出したもの)。通信には入っていないので、データにない技は空
const KIND_TIP = { "物理": "物理（近接か遠距離かは、当たったときの距離しだい。3セルより遠いと遠距離）", "物理・近接": "物理・近接", "物理・遠距離": "物理・遠距離", "魔法": "魔法", "固定": "固定ダメージ系（物理・魔法の軽減が効かないもの）" };
const kindOf = (skill) => (DATA.dmg_kinds || {})[skill] || ["", ""];
// 相手のモンスターの種族・サイズ・属性・ボス(ラトリオのデータから。同じ名前で強さ違いは「/」でつなぐ)
const mobShort = (v) => { const a = String(v).split("/"); return a.length > 2 ? a.slice(0, 2).join("/") + "…" : a.join("/"); };
function mobTag(who) {
  const m = (DATA.dmg_mobs || {})[who];
  if (!m) return "";
  const ele = String(m.ele || "").split("/").slice(0, 2).map((x) => { const b = x.replace(/\d+$/, ""); return `<span class="ek ek-${esc(b)}">${esc(x)}</span>`; }).join("");
  const tip = `Lv ${m.lv}　HP ${String(m.hp).split("/").map((h) => fmtN(+h)).join(" / ")}\n種族 ${m.race}　サイズ ${m.size}　属性 ${m.ele}${String(m.boss) === "1" ? "　ボス" : String(m.boss).includes("1") ? "　ボスのものもある" : ""}\n（ラトリオのデータ。同じ名前で強さが違うものは / で並べています）`;
  return `<span class="mob" title="${esc(tip)}">${esc(mobShort(m.race))}・${esc(mobShort(m.size))}型 ${ele}${String(m.boss) === "1" ? ' <span class="boss">ボス</span>' : String(m.boss).includes("1") ? ' <span class="boss">ボス?</span>' : ""}</span>`;
}
const eleTag = (e) => e ? e.split("/").map((x) => `<span class="ek ek-${esc(x)}">${esc(x)}</span>`).join("") : "";
const kindTag = (k, tip) => k ? `<span class="kd kd-${esc(k.split("・")[0])}" title="${esc(tip ? k + "（" + tip + "）" : KIND_TIP[k] || k)}">${esc(k)}${tip ? "<sup>*</sup>" : ""}</span>` : "";
// 行の種類: 物理は、記録した近接/遠距離の合計([6][7])があればそれで分ける
function rowKind(skill, v) {
  const [kd, el] = kindOf(skill);
  if (!kd.startsWith("物理") || !(v[6] || v[7])) return [kd, el, ""];
  if (v[6] && !v[7]) return ["物理・近接", el, kd === "物理" ? "当たったときの距離から" : ""];
  if (v[7] && !v[6]) return ["物理・遠距離", el, kd === "物理" ? "当たったときの距離から" : ""];
  return ["物理・近/遠", el, `近接 ${Math.round(v[6] * 100 / (v[6] + v[7]))}% / 遠距離 ${Math.round(v[7] * 100 / (v[6] + v[7]))}%（当たったときの距離から）`];
}
function dmgMix(W) {      // 受けたダメージ(合計)の内訳: 属性ごと・種類ごと
  const ele = {}, kind = {};
  let all = 0;
  const add = (o, k, n) => { if (n > 0) o[k] = (o[k] || 0) + n; };
  for (const [k, v] of Object.entries(W)) {
    const [kd, e] = kindOf(k.split("|")[1]);
    if (e === "属性なし") continue;          // 反射(マックスペインなど)は自分の攻撃が返ってきたものなので除く
    add(ele, e || "?", v[1]); all += v[1];
    if (kd.startsWith("物理")) {            // 物理は近接/遠距離に分ける(わからない分は「物理」)
      add(kind, "物理・近接", v[6]); add(kind, "物理・遠距離", v[7]); add(kind, "物理", v[1] - (v[6] || 0) - (v[7] || 0));
    } else add(kind, kd || "?", v[1]);
  }
  if (!all) return "";
  const fmt = (o, tag) => Object.entries(o).sort((a, b) => b[1] - a[1]).filter(([, n]) => n / all >= 0.01)
    .map(([k, n]) => `<span>${k === "?" ? "不明" : tag(k)} <b>${Math.round(n * 100 / all)}%</b></span>`).join("");
  return `<div class="dm-mix"><span class="muted">合計ダメージの内訳（反射は除く）</span>${fmt(kind, (k) => kindTag(k))}<span class="muted">｜</span>${fmt(ele, eleTag)}</div>`;
}
function dmgTable(W, showChars, limit, go) {       // go = {md, gear}: 各行に「シミュ」(その攻撃・その装備で被ダメシミュを開く)を出す
  const rows = Object.entries(W).sort((a, b) => b[1][2] - a[1][2]).slice(0, limit || 999), sim = go && typeof LOCAL !== "undefined" && LOCAL;
  let h = `<table class="dm-t"><thead><tr><th class="l">相手</th><th class="l">技</th><th class="l">種類</th><th class="l">属性</th><th>回数</th><th>最大</th><th>平均</th><th title="いちばん最近に受けたときのダメージ">最新</th>${showChars ? '<th class="l">キャラ</th>' : ""}<th>最後</th>${sim ? "<th></th>" : ""}</tr></thead><tbody>`;
  for (const [k, v] of rows) {
    const [who, skill] = k.split("|");
    const [kd, el, tip] = rowKind(skill, v);
    h += `<tr><td class="l">${esc(who)}${mobTag(who)}</td><td class="l ${skill === "通常攻撃" ? "muted" : ""}">${esc(skill)}</td><td class="l">${kindTag(kd, tip)}</td><td class="l">${eleTag(el)}</td><td>${fmtN(v[0])}</td><td class="dm-max">${fmtN(v[2])}</td><td>${fmtN(Math.round(v[1] / v[0]))}</td><td>${v[8] ? fmtN(v[8]) : `<span class="muted">-</span>`}</td>${showChars ? `<td class="l muted">${esc([...v[5]].map(cn).join("・"))}</td>` : ""}<td class="muted">${v[3] ? when(v[3]) : ""}</td>${sim ? `<td><button class="ghost simgo" data-simgo="${esc(JSON.stringify([v[9] || [...v[5]][0] || "", go.md, who, skill, go.gear || ""]))}" title="この攻撃を、この装備で受けたものとして、被ダメシミュを開きます（別の装備なら耐えられたか）">シミュ</button></td>` : ""}</tr>`;
  }
  return h + `</tbody></table>`;
}
// 受けた状態異常と、ダメージの無い技(そのMD・選んでいるキャラぶん)
function statusHtml(chars, where) {
  const ail = {}, act = {};
  for (const c of chars) {
    for (const [k, v] of Object.entries(((DATA.chars[c] || {}).ail || {})[where] || {})) { const x = ail[k] = ail[k] || [0, 0]; x[0] += v[0]; x[1] = Math.max(x[1], v[1]); }
    for (const [k, v] of Object.entries(((DATA.chars[c] || {}).act || {})[where] || {})) { const x = act[k] = act[k] || [0, 0]; x[0] += v[0]; x[1] = Math.max(x[1], v[1]); }
  }
  let h = "";
  if (Object.keys(ail).length) {
    // 状態異常ごとにまとめて、原因の技を並べる
    const by = {};
    for (const [k, v] of Object.entries(ail)) { const [a, who, sk] = k.split("|"); (by[a] = by[a] || { n: 0, src: [] }).n += v[0]; by[a].src.push([who, sk, v[0]]); }
    h += `<div class="dm-st"><span class="muted">受けた状態異常</span>${Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([a, o]) =>
      `<span class="ail" title="${esc(o.src.sort((x, y) => y[2] - x[2]).map(([w, sk, n]) => (sk ? `${w}の${sk}` : "原因不明") + ` ${n}回`).join("\n"))}"><b>${esc(a)}</b> ×${o.n}${o.src[0][1] ? ` <span class="muted">${esc(o.src[0][1])}${o.src.length > 1 ? " ほか" : ""}</span>` : ""}</span>`).join("")}</div>`;
  }
  if (Object.keys(act).length) {
    h += `<div class="dm-st"><span class="muted">ダメージの無い技</span>${Object.entries(act).sort((a, b) => b[1][0] - a[1][0]).map(([k, v]) => {
      const [who, sk] = k.split("|");
      return `<span class="ail" title="${esc(who)}"><b>${esc(sk)}</b> ×${v[0]} <span class="muted">${esc(who)}</span></span>`;
    }).join("")}</div>`;
  }
  return h;
}
// 場所ごとの表を、攻撃を受けたときの装備セットごとに分ける(同じ装備セットのシャドウ違いはまとめる)。装備の記録が無い攻撃は「装備の記録なし」
