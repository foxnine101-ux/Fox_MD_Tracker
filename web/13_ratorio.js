"use strict";
// ---------- 計算機(ROラトリオHub) ----------
// ラトリオ本体は、アプリがフォーク(GitHub)から取り込んでこの PC に置き、/ratorio/… で配る(この PC で見ているときだけ)。
// 中身は本家そのまま。Fox は外から入力欄を動かすだけなので、本家が更新されてもこのしくみは変わらない
let RAT = null, RAT_TIMER = null, RAT_FRAME_VER = "";
async function ratStatus(check) {
  try { RAT = await fetch("/api/ratorio" + (check ? "?check=1" : "")).then((r) => r.json()); } catch { RAT = { state: "error", error: "この PC の Fox_MD_Tracker につながりません" }; }
  if (RAT.state === "downloading" && !RAT_TIMER) RAT_TIMER = setInterval(async () => { await ratStatus(); if (RAT.state !== "downloading") { clearInterval(RAT_TIMER); RAT_TIMER = null; } if (TAB === "calc") render(); }, 800);
  return RAT;
}
async function ratUpdate() { RAT = await fetch("/api/ratorio", { method: "POST" }).then((r) => r.json()); await ratStatus(); render(); }
function renderCalc(chars) {
  const bar = $("#calcbar"), body = $("#calcbody");
  if (!(typeof LOCAL !== "undefined" && LOCAL)) {
    bar.innerHTML = ""; body.innerHTML = `<div class="panel empty">計算機は、Fox_MD_Tracker を動かしている PC の画面でだけ使えます。</div>`;
    return;
  }
  if (!RAT) { body.innerHTML = `<div class="panel empty"><span class="spin">確認中…</span></div>`; ratStatus().then(render); return; }
  const st = RAT;
  const credit = `<span class="muted">計算機は <a href="https://github.com/roratorio-hub/ratorio" target="_blank" rel="noopener">ROラトリオHub</a>（PolyForm Noncommercial License）をそのまま使っています。</span>`;
  if (!st.installed) {
    const h = st.state === "downloading" ? `<b class="spin">取り込み中… ${st.progress}%</b>`
      : `<button id="ratget">ラトリオを取り込む（約13MB）</button>${st.error ? `<div class="err">${esc(st.error)}</div>` : ""}`;
    bar.innerHTML = "";
    const html = `<div class="panel empty">ステータス・ダメージ計算機（ROラトリオHub）を、この PC に取り込んで使います。<br>最初に1回だけダウンロードします（インターネットが必要です）。<br><br>${h}<br><br>${credit}</div>`;
    if (body.dataset.h !== html) { body.innerHTML = html; body.dataset.h = html; }
    if ($("#ratget")) $("#ratget").onclick = ratUpdate;
    return;
  }
  // 上の帯: 版と更新
  const upd = st.state === "downloading" ? `<b>更新中… ${st.progress}%</b>`
    : st.newer ? `<b>新しい版があります（${esc(st.latest.date)}）</b> <button class="ghost" id="ratupd">取り込む</button>`
    : `<button class="ghost" id="ratchk">更新を確認</button>${st.latest ? ` <span class="muted">最新です</span>` : ""}`;
  const barHtml = ratFillBar(chars) + `<span style="flex:1"></span><b>ROラトリオHub</b> <span class="muted">${esc(st.date)} 版</span> ${upd}
    ${st.error ? `<span class="err">${esc(st.error)}</span>` : ""}`;
  if (bar.dataset.h !== barHtml) { bar.innerHTML = barHtml; bar.dataset.h = barHtml; bindRatFillBar(); }
  renderRatReport();
  if ($("#ratchk")) $("#ratchk").onclick = async () => { $("#ratchk").textContent = "確認中…"; await ratStatus(true); render(); };
  if ($("#ratupd")) $("#ratupd").onclick = ratUpdate;
  // 計算機そのもの(版が変わったときだけ読み込み直す)
  if (RAT_FRAME_VER !== st.commit && st.state !== "downloading") {
    RAT_FRAME_VER = st.commit;
    body.dataset.h = "";
    body.innerHTML = `<iframe id="calcframe" title="ROラトリオHub" src="${esc(st.entry)}?v=${esc(st.commit)}"></iframe>`;
  }
}

// ---------- 計算機に キャラ × 装備セット を入れる(つなぎ役) ----------
// 通信で読んだもの(職業・Lv・ステータス・装備の番号)を、ラトリオの入力欄(OBJID_…)に外から入れる。
//   装備は「番号 → 名前(id2name) → ラトリオの選択肢の名前」でつなぐ。つながらないものは、
//   ラトリオの選択肢から手で選んで結びつける(SETTINGS.ratLinks = {番号: 選択肢の名前}。次からは自動)
// [場所のビット, 装備の欄, カードの欄の頭, 精錬あり]
const RAT_MAIN = [[256, "HEAD_TOP", "HEAD_TOP", 1], [512, "HEAD_MID", "HEAD_MID", 0], [1, "HEAD_UNDER", "HEAD_UNDER", 0], [16, "BODY", "BODY", 1],
  [2, "ARMS_RIGHT", "ARMS_RIGHT", 1], [32, "SHIELD", "SHIELD", 1], [4, "SHOULDER", "SHOULDER", 1], [64, "SHOES", "SHOES", 1],
  [8, "ACCESSORY_1", "ACCESSORY_1", 0], [128, "ACCESSORY_2", "ACCESSORY_2", 0]];
const RAT_SHADOW = [[65536, "SHADOW_BODY", "SHADOW_BODY", 1], [131072, "SHADOW_WEAPON", "SHADOW_ARMS_RIGHT", 1], [262144, "SHADOW_SHIELD", "SHADOW_SHIELD", 1],
  [524288, "SHADOW_SHOESE", "SHADOW_SHOES", 1], [1048576, "SHADOW_ACCESSORY1", "SHADOW_ACCESSORY-1", 1], [2097152, "SHADOW_ACCESSORY2", "SHADOW_ACCESSORY-2", 1]];
const CALC = { char: "", set: "", shadow: "", busy: false, report: null };
const ratNorm = (t) => String(t ?? "").normalize("NFKC").replace(/\s+/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ratDoc() { const f = $("#calcframe"); const d = f && f.contentDocument; return d && (d.querySelector("#OBJID_SELECT_JOB")?.options.length || 0) > 5 ? d : null; }
function ratSet(d, id, value) {            // 入力欄に値を入れて、ラトリオに「変わった」と知らせる
  const el = d.getElementById("OBJID_" + id);
  if (!el) return false;
  if (el.type === "checkbox") { if (el.checked !== !!value) el.click(); return true; }
  if (el.tomselect) el.tomselect.setValue(String(value), true);
  el.value = String(value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
function ratNone(sel) {                    // 「なし」の選択肢(検索つきの欄は先頭が「なし」とは限らない)
  const opts = [...sel.options];
  return opts.find((o) => o.value === "0") || opts.find((o) => /装備なし/.test(o.text)) || opts[0] || null;
}
function ratFindOption(sel, name, gameId, isCard) {   // 選択肢を探す: 結びつけ → 同じ名前 → [3] などを外して同じ → カードは「カード」を外して
  if (!sel) return null;
  const opts = [...sel.options], link = (SETTINGS.ratLinks || {})[gameId], shared = (SHARED.links || {})[gameId];
  if (link) { const o = opts.find((x) => x.text === link); if (o) return o; }
  const tv = itemLinkOf(gameId, isCard); if (tv) { const o = opts.find((x) => +x.value === tv); if (o) return o; }
  const viaShared = () => (shared && opts.find((x) => x.text === shared)) || null;      // 共有の表は、名前で見つからなかったときだけ
  const n = ratNorm(name);
  if (!n || /^ID\d+$/.test(n)) return viaShared();
  const bare = n.replace(/^\[[^\]]*\]/, "");        // 先頭の「[シャドウ]」などを外した名前(ラトリオ側に付いていないものがある)
  const base = (t) => ratNorm(String(t).replace(/\s*[(（]\+\d+以上[)）]\s*$/, "").replace(/\[\d\]$/, ""));   // 「 (+10以上)」「[3]」を外した名前
  return opts.find((o) => ratNorm(o.text) === n) || opts.find((o) => base(o.text) === n)
    || (bare !== n ? opts.find((o) => base(o.text) === bare) : null)
    || (isCard ? opts.find((o) => base(o.text) === n.replace(/カード$/, "")) : null) || viaShared();
}
function ratFillBar(chars) {
  const EQ = DATA.equip || {}, E = EQ.chars || {};
  const names = chars.filter((c) => E[c]);
  if (!names.length) return `<span class="muted">キャラにログインすると、ここからキャラと装備セットを計算機に入れられます。</span>`;
  if (!names.includes(CALC.char)) CALC.char = names.find((c) => E[c].cur) || names[0];
  const opt = (T, cur, here) => `<option value="">いま着ている装備</option>` + Object.entries(T || {}).sort((a, b) => (a[1].first || 0) - (b[1].first || 0))
    .map(([sid, st]) => `<option value="${esc(sid)}" ${sid === cur ? "selected" : ""}>${esc(setLabel(st))}: ${esc(st.name || st.auto)}${sid === here ? "（着用中）" : ""}</option>`).join("");
  return `<label>キャラ <select id="ratc">${names.map((c) => `<option value="${esc(c)}" ${c === CALC.char ? "selected" : ""}>${esc(cn(c))}</option>`).join("")}</select></label>
    <label>装備セット <select id="rats">${opt(EQ.sets, CALC.set, E[CALC.char].cur)}</select></label>
    <label>シャドウ <select id="ratsh">${opt(EQ.shadows, CALC.shadow, E[CALC.char].shadow)}</select></label>
    <button id="ratfill" ${CALC.busy ? "disabled" : ""}>${CALC.busy ? "入れています…" : "計算機に入れる"}</button>`;
}
function bindRatFillBar() {
  if ($("#ratc")) $("#ratc").onchange = (e) => { CALC.char = e.target.value; render(); };
  if ($("#rats")) $("#rats").onchange = (e) => { CALC.set = e.target.value; };
  if ($("#ratsh")) $("#ratsh").onchange = (e) => { CALC.shadow = e.target.value; };
  if ($("#ratfill")) $("#ratfill").onclick = ratFill;
}
async function ratFill() {
  const d = ratDoc();
  if (!d || CALC.busy) { if (!d) { CALC.report = { err: "計算機の読み込みがまだ終わっていません。少し待ってからもう一度押してください。" }; render(); } return; }
  const EQ = DATA.equip || {}, e = (EQ.chars || {})[CALC.char];
  if (!e) return;
  CALC.busy = true; CALC.report = null; render();
  const rows = [];        // {slot, name, ok, note, id(欄), gameId, isCard}
  try {
    const mainSet = (EQ.sets || {})[CALC.set], shSet = (EQ.shadows || {})[CALC.shadow];
    const now = e.now || [];
    const items = (mainSet ? mainSet.items : now.filter((i) => i.wear & 1023)).concat(shSet ? shSet.items : now.filter((i) => i.wear >= 65536));
    // ステータスは、その装備セットをこのキャラが着ていたときのもの(無ければいまのもの)
    const st = (mainSet && (mainSet.chars || {})[CALC.char] && mainSet.chars[CALC.char].status) || e.status || {};
    // 1. 職業
    const job = d.getElementById("OBJID_SELECT_JOB"), jo = [...job.options].find((o) => o.text === st.jobName);
    if (jo) { ratSet(d, "SELECT_JOB", jo.value); await sleep(600); }
    rows.push({ slot: "職業", name: st.jobName || "?", ok: !!jo, note: jo ? "" : "計算機に同じ名前の職業がありません" });
    // 2. Lv(BaseLv の自動調整は切る)
    ratSet(d, "CHECK_AUTO_BASE_LEVEL", false);
    if (st.lv) ratSet(d, "SELECT_BASE_LEVEL", st.lv);
    const jl = d.getElementById("OBJID_SELECT_JOB_LEVEL");
    if (st.jobLv) ratSet(d, "SELECT_JOB_LEVEL", st.jobLv);
    else if (jl && jl.max) ratSet(d, "SELECT_JOB_LEVEL", jl.max);       // JobLv が通信で読めていないときは、その職業の最大にしておく
    await sleep(200);
    // 3. 装備(先に装備、あとでステータス)
    const used = new Set();
    for (const [bit, eqId, cardId, hasRefine] of RAT_MAIN.concat(RAT_SHADOW)) {
      const it = items.find((i) => (i.wear & bit) && !used.has(i));
      const sel = d.getElementById("OBJID_" + eqId);
      if (!sel) continue;
      const slotName = it ? it.slot : "";
      if (!it) { const no = ratNone(sel); if (no) ratSet(d, eqId, no.value); continue; }   // その場所は空
      used.add(it);
      let o = ratFindOption(sel, it.name, it.itemId, false);
      if (!o && eqId === "ARMS_RIGHT") {        // 武器は「武器の種類」を選ばないと選択肢に出ない → 種類を順に試す
        const ty = d.getElementById("OBJID_ARMS_TYPE_RIGHT");
        for (const t of ty ? [...ty.options] : []) {
          ratSet(d, "ARMS_TYPE_RIGHT", t.value); await sleep(120);
          o = ratFindOption(d.getElementById("OBJID_ARMS_RIGHT"), it.name, it.itemId, false);
          if (o) break;
        }
      }
      if (o) { ratSet(d, eqId, o.value); await sleep(150); }
      rows.push({ slot: slotName, name: (it.refine ? `+${it.refine} ` : "") + it.name, ok: !!o, id: eqId, gameId: it.itemId, isCard: false });
      if (!o) continue;
      if (hasRefine) ratSet(d, eqId + "_REFINE", it.refine || 0);
      if (d.getElementById("OBJID_" + eqId + "_TRANSCENDENCE")) ratSet(d, eqId + "_TRANSCENDENCE", it.grade || 0);
      await sleep(250);        // 精錬値で選べるエンチャントが変わる → 選択肢が作り直されるのを待つ
      // カード・エンチャント。Fox は空の枠を詰めて覚えているので、枠の番号では決めず、
      // 4つの枠のうち「その名前が選択肢にある、まだ使っていない枠」に入れる
      const cards = (it.cards || []).filter((c) => c && c.id), free = [1, 2, 3, 4].filter((n) => d.getElementById("OBJID_" + cardId + "_CARD_" + n));
      for (const c of cards) {
        let hit = null;
        for (const n of free) { const co = ratFindOption(d.getElementById("OBJID_" + cardId + "_CARD_" + n), c.name, c.id, true); if (co) { hit = [n, co]; break; } }
        if (hit) { ratSet(d, cardId + "_CARD_" + hit[0], hit[1].value); free.splice(free.indexOf(hit[0]), 1); }
        rows.push({ slot: slotName + " のカード・エンチャント", name: c.name, ok: !!hit, id: free.length ? cardId + "_CARD_" + free[0] : "", ids: free.map((n) => cardId + "_CARD_" + n), gameId: c.id, isCard: true });
      }
      for (const n of free) { const no = ratNone(d.getElementById("OBJID_" + cardId + "_CARD_" + n)); if (no) ratSet(d, cardId + "_CARD_" + n, no.value); }   // 残りの枠は空に
      await sleep(60);
    }
    // 4. ステータス(素の値)
    for (const k of ["STR", "AGI", "VIT", "INT", "DEX", "LUK", "POW", "STA", "WIS", "SPL", "CON", "CRT"]) {
      const v = (st.stats || {})[k];
      if (v && v.base !== undefined) ratSet(d, "SELECT_STATUS_" + k, v.base);
    }
    await sleep(200);
    CALC.report = { rows, char: CALC.char, t: Date.now(), opts: (st.jobName ? "" : "") };
    const notes = [];
    if (!st.jobLv) notes.push("JobLv は通信で読めていないので、その職業の最大にしています（キャラ選択からログインし直すと読めます）。");
    if (items.some((i) => (i.options || []).length)) notes.push("ランダムオプションは、まだ自動では入りません（計算機の「性能カスタマイズ」などで足してください）。");
    CALC.report.note = notes.join(" ");
  } catch (err) {
    CALC.report = { err: "入れている途中で止まりました: " + err.message, rows };
  }
  CALC.busy = false; render();
}
function renderRatReport() {
  const box = $("#calcreport"), r = CALC.report;
  let h = "";
  if (r && r.err) h = `<div class="panel" style="padding:8px 12px"><span class="err">${esc(r.err)}</span></div>`;
  else if (r) {
    const miss = r.rows.filter((x) => !x.ok), ok = r.rows.length - miss.length;
    const d = ratDoc();
    h = `<div class="panel" style="padding:8px 12px"><b>${esc(cn(r.char))}</b> を計算機に入れました：<b>${ok}</b>個が入り、<b>${miss.length}</b>個が入りませんでした。
      <button class="ghost" id="ratrepx">とじる</button>${r.note ? `<div class="muted">${esc(r.note)}</div>` : ""}`
      + miss.map((x, i) => {
        const sels = d ? (x.ids || (x.id ? [x.id] : [])).map((id) => d.getElementById("OBJID_" + id)).filter(Boolean) : [];
        const sel = sels[0] || null;
        const texts = [...new Set(sels.flatMap((q) => [...q.options].map((o) => o.text)))].slice(0, 4000);
        const list = sel ? `<datalist id="ratdl${i}">${texts.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>` : "";
        return `<div class="rr"><span class="muted">${esc(x.slot)}</span> <b>${esc(x.name)}</b>${x.note ? ` <span class="muted">${esc(x.note)}</span>` : ""}
          ${sel ? `<input class="ratpick" list="ratdl${i}" data-i="${i}" placeholder="計算機の項目を選ぶ（文字を打つと絞り込み）">${list}<button class="ghost" data-ratlink="${i}">結びつける</button>` : ""}</div>`;
      }).join("")
      + (miss.some((x) => x.id) ? `<div class="muted" style="margin-top:4px">入らなかったものは、計算機の項目を選んで「結びつける」と、次からは自動で入ります（名前がわからなかったアイテムには、その名前も付きます）。</div>` : "") + `</div>`;
  }
  if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
  if ($("#ratrepx")) $("#ratrepx").onclick = () => { CALC.report = null; render(); };
  box.querySelectorAll("[data-ratlink]").forEach((b) => b.onclick = async () => {
    const miss = CALC.report.rows.filter((x) => !x.ok), x = miss[+b.dataset.ratlink];
    const text = box.querySelector(`input.ratpick[data-i="${b.dataset.ratlink}"]`).value.trim();
    const d = ratDoc(), sels = d ? (x.ids || [x.id]).map((id) => d.getElementById("OBJID_" + id)).filter(Boolean) : [];
    if (!text || !sels.some((q) => [...q.options].some((o) => o.text === text))) { b.textContent = "一覧から選んでね"; return; }
    SETTINGS.ratLinks = SETTINGS.ratLinks || {};
    SETTINGS.ratLinks[x.gameId] = text; saveSettings();
    if (/^(\+\d+ )?ID\d+$/.test(x.name))           // 名前がわからなかったアイテム → 名前も付ける
      await fetch("/api/itemname", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: String(x.gameId), name: text.replace(/\[\d\]$/, "") }) });
    await load(); ratFill();
  });
}

// ---------- 名前がわからないアイテム ----------
// アイテムの名前は通信に無い(番号だけ)。データに無い新しいアイテムは、ゲームの「アイテムの説明の画面」の
// スクリーンショットから文字を読んで名前を付ける(この PC で見ているときだけ)。手で打ってもよい
const UNK = { vals: {}, sel: "", msg: "", busy: false };
function unknownItemsHtml(list) {
  if (!(typeof LOCAL !== "undefined" && LOCAL) || !list.length) return "";
  if (!list.some((u) => u.id === UNK.sel)) UNK.sel = list[0].id;
  return `<h2>名前がわからないアイテム（${list.length}）</h2><div class="panel eq-box">
    <div class="unk-drop" id="unkdrop">ゲームで<b>アイテムの説明の画面</b>（アイテムを右クリックすると出る、いちばん上に名前がある画面）を出して、そのスクリーンショットを<b>ここに落とす</b>か、<b>Ctrl+V で貼り付けて</b>ください。読み取った名前が、下で選んでいる欄に入ります（手で打ってもOK）。
      ${UNK.busy ? `<div><b>読み取り中…</b></div>` : UNK.msg ? `<div class="muted">${esc(UNK.msg)}</div>` : ""}</div>
    ${list.map((u) => `<div class="eq-use"><label><input type="radio" name="unk" value="${esc(u.id)}" ${u.id === UNK.sel ? "checked" : ""}> <span class="muted">${esc(u.slot)}</span> <b>ID${esc(u.id)}</b></label>
      <input class="unkname" data-id="${esc(u.id)}" value="${esc(UNK.vals[u.id] || "")}" placeholder="アイテムの名前">
      <button class="ghost" data-saveitem="${esc(u.id)}">保存</button></div>`).join("")}
    <p class="hint">保存した名前は、この PC の「アイテム名の手直し.json」に入ります。このファイルを作者に送ってもらえると、次の版からみんなの画面でも名前が出ます。</p></div>`;
}
async function ocrImage(file) {
  if (!file || UNK.busy) return;
  UNK.busy = true; UNK.msg = ""; render();
  try {
    const r = await fetch("/api/ocr", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file }).then((x) => x.json());
    if (!r.ok) UNK.msg = "読めませんでした: " + (r.error || "");
    else if (!r.name) UNK.msg = "文字が見つかりませんでした。アイテムの説明の画面だけが写るように撮ってみてください。";
    else { UNK.vals[UNK.sel] = r.name; UNK.msg = `読み取り: 「${r.name}」（1行目: ${r.lines[0] || ""}）。合っていれば「保存」を押してください。`; }
  } catch (e) { UNK.msg = "読めませんでした: " + e.message; }
  UNK.busy = false; render();
}
const imageOf = (dt) => dt ? [...(dt.files || [])].find((f) => f.type.startsWith("image/")) || [...(dt.items || [])].filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile())[0] : null;
function bindUnknownItems() {
  const drop = $("#unkdrop");
  if (!drop) return;
  const box = drop.parentElement;
  box.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  box.ondragleave = () => drop.classList.remove("over");
  box.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); const f = imageOf(e.dataTransfer); if (f) ocrImage(f); else { UNK.msg = "画像のファイルを落としてください。"; render(); } };
  box.querySelectorAll('input[name="unk"]').forEach((el) => el.onchange = () => { UNK.sel = el.value; });
  box.querySelectorAll("input.unkname").forEach((el) => {
    el.oninput = () => { UNK.vals[el.dataset.id] = el.value; };
    el.onfocus = () => { UNK.sel = el.dataset.id; const r = box.querySelector(`input[name="unk"][value="${CSS.escape(el.dataset.id)}"]`); if (r) r.checked = true; };
    el.onkeydown = (ev) => { if (ev.key === "Enter") box.querySelector(`[data-saveitem="${CSS.escape(el.dataset.id)}"]`).click(); };
  });
  box.querySelectorAll("[data-saveitem]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.saveitem, name = (UNK.vals[id] || "").trim();
    if (!name) { UNK.msg = "名前を入れてから保存してください。"; render(); return; }
    const r = await fetch("/api/itemname", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name }) });
    if (r.ok) { delete UNK.vals[id]; UNK.msg = `ID${id} を「${name}」として覚えました。`; if (document.activeElement) document.activeElement.blur(); load(); }
    else { UNK.msg = "保存できませんでした。"; render(); }
  });
}
// 装備セットタブを開いているときの貼り付け(Win+Shift+S → Ctrl+V)
document.addEventListener("paste", (e) => {
  if (TAB !== "gsets" || !$("#unkdrop")) return;
  const f = imageOf(e.clipboardData);
  if (f) { e.preventDefault(); ocrImage(f); }
});
