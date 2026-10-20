"use strict";
// ---- Fox のキャラ・装備セットを取り込む(通信で読んだ名前 → ラトリオの候補の名前でつなぐ) ----
const SIMC_FOXBITS = [[256, 2], [512, 3], [1, 4], [16, 6], [2, 0], [32, 5], [4, 7], [64, 8], [8, 9], [128, 10]];     // [Fox の場所のビット, ラトリオの場所]
const SIMC_FOXSH = [[65536, 19], [131072, 14], [262144, 15], [524288, 21], [1048576, 22], [2097152, 23]];
function simcFind(opts, name, gameId, isCard) {   // 候補を探す: 手で結びつけたもの → 同じ名前 → [3] や (+10以上) を外して同じ → 先頭の [シャドウ] を外して → カードは「カード」を外して。候補の名前の先頭の「【習】」などは外して比べる(「【習】デイヴィッドシールド」= ゲームの「デイヴィッドシールド」)。【】の無い候補があれば、そちらを先に選ぶ
  const nm = (o) => o.n || o.t, nmS = (o) => String(nm(o) ?? "").replace(/^【[^】]*】\s*/, ""), link = (SETTINGS.ratLinks || {})[gameId], shared = (SHARED.links || {})[gameId];
  if (link) { const o = opts.find((x) => nm(x) === link); if (o) return o; }
  const tv = itemLinkOf(gameId, isCard); if (tv) { const o = opts.find((x) => x.v === tv); if (o) return o; }
  const viaShared = () => { const o = shared && opts.find((x) => nm(x) === shared); return o || null; };      // 共有の表は、名前で見つからなかったときだけ
  const n = ratNorm(name);
  if (!n || /^ID\d+$/.test(n)) return viaShared();
  const bare = n.replace(/^\[[^\]]*\]/, ""), base = (t) => ratNorm(String(t).replace(/\s*[(（]\+\d+以上[)）]\s*$/, "").replace(/\[\d\]$/, ""));
  const real = opts.filter((o) => o.v), pick = (f) => real.find((o) => !/^【/.test(String(nm(o) ?? "")) && f(o)) || real.find(f);
  return pick((o) => ratNorm(nmS(o)) === n) || pick((o) => base(nmS(o)) === n) || (bare !== n ? pick((o) => base(nmS(o)) === bare) : null)
    || (isCard ? pick((o) => base(nmS(o)) === n.replace(/カード$/, "")) : null) || viaShared();
}
function simcWearCards(m, region, it) {   // Fox は空の枠を詰めて覚えているので、「その名前が候補にある、まだ空いている枠」に入れる
  const rows = [], opts = simcCardOpts(region, m.equip[region]), cs = SIMC_CARD[region], free = [0, 1, 2, 3].filter((i) => opts[i].length > 1);
  for (const c of (it.cards || []).filter((c) => c && c.id)) {
    let hit = null;
    for (const i of free) { const o = simcFind(opts[i], c.name, c.id, true); if (o) { hit = [i, o]; break; } }
    if (hit) { m.card[cs[hit[0]]] = hit[1].v; free.splice(free.indexOf(hit[0]), 1); }
    else rows.push({ slot: (it.slot || "") + " のカード・エンチャント", name: c.name, region, gameId: c.id, isCard: true });
  }
  return rows;
}
// Fox のランダムオプション(ゲームの番号)を、装備の枠のラトリオの選択肢に入れる。対応表は calc_data.json の rndopt(tools/make_rndopt_map.py):
// ゲームの番号 → 効果の種類(SPID)。ラトリオは同じ SPID でも値の範囲ごとに別の選択肢なので、枠の候補のうち「SPID が同じで、値が範囲に入る」ものを選ぶ
function simcWearRnd(m, region, it) {
  const R = (DATA.calc || {}).rndopt, ops = (it.options || []).filter((o) => o.index), miss = SIMC.rndMiss = SIMC.rndMiss || [];
  if (!ops.length) return;
  const id = region >= 14 ? (m.shadowEquip.itemId || [])[region] : m.equip[region], lists = id ? simcRndLists(id) : [];
  const arr = R && lists.length ? simcRndArr(m, region) : null, used = new Set();
  for (const o of ops) {
    const spid = R && R.game[o.index]; let hit = null;
    if (arr && spid !== undefined) {
      for (let i = 0; i < lists.length && !hit; i++) {
        if (used.has(i)) continue;
        const c = simcRndKinds(lists[i]).map((k) => ({ k: k.v, r: R.rat[k.v] })).filter((x) => x.r && x.r[0] === spid && o.value >= x.r[1] && o.value <= x.r[2] && (o.value - x.r[1]) % (x.r[3] || 1) === 0)
          .sort((x, y) => x.r[2] - y.r[2])[0];
        if (c) { arr[i] = [c.k, o.value]; used.add(i); hit = c; }
      }
    }
    if (hit) SIMC.rndOk = (SIMC.rndOk || 0) + 1;
    else miss.push(`${it.slot || ""} ${o.text || ("番号" + o.index)}`);
  }
}
function simcWear(m, items, shadow) {     // 装備セットを着せる。つながらなかったものを返す
  const rows = [], used = new Set();
  for (const [bit, region] of shadow ? SIMC_FOXSH : SIMC_FOXBITS) {
    const it = items.find((i) => (i.wear & bit) && !used.has(i));
    simcSetItem(m, region, simcNoneId(region)); simcSetRefine(m, region, 0, 0);
    if (!it) continue;
    used.add(it);
    const o = simcFind(simcItemOpts(m.status.jobId, region), it.name, it.itemId, false) || simcFind(simcItemOpts(m.status.jobId, region, true), it.name, it.itemId, false);      // 職業に合うものに無ければ、制限を外して探す
    if (!o) { rows.push({ slot: it.slot || "", name: (it.refine ? `+${it.refine} ` : "") + it.name, region, gameId: it.itemId, refine: it.refine || 0, grade: it.grade || 0, cards: it.cards || [] }); continue; }
    simcSetItem(m, region, o.v); simcSetRefine(m, region, it.refine || 0, it.grade || 0);
    try { simcWearRnd(m, region, it); } catch (err) { engLog("ランダムオプションを入れられませんでした: " + err.message); }
    if (!shadow) rows.push(...simcWearCards(m, region, it));
  }
  return rows;
}
// ゲームのキャラが覚えているスキル(Fox の {番号: Lv})を、ラトリオの「習得スキル」に入れる(名前でつなぐ)。パッシブや習得Lvがダメージ・詠唱に効くので、入れないと実測より低く出る
async function simcApplySkills(model, skills) {
  const sc = await engSchema(model.status.jobId), N = DATA.skill_names || {}; if (!sc) return 0;
  const byName = Object.fromEntries(sc.filter((it) => it.g === "learn").map((it) => [it.label, it])); let n = 0;
  for (const [id, lv] of Object.entries(skills || {})) { const it = byName[N[id]]; if (it && lv > 0) { simcBuffSet(model, it, lv); n++; } }
  return n;
}
const SIMC_JOBABBR = { "エレメンタルマスター": "EM", "インペリアルガード": "IG", "ドラゴンナイト": "DK", "シャドウクロス": "SX", "カーディナル": "CD", "ウィンドホーク": "WH", "アークメイジ": "AM", "マイスター": "MT", "アビスチェイサー": "AC", "インクイジター": "IQ", "トルバドゥール": "TR", "トルヴェール": "TV", "バイオロ": "BI", "ソウルアセティック": "SA", "ナイトウォッチ": "NW", "ハイパーノービス": "HN", "スピリットハンドラー": "SH", "ソウルリーパー": "SR", "サモナー": "SM", "リベリオン": "RB", "ルーンナイト": "RK", "ギロチンクロス": "GX", "アークビショップ": "AB", "レンジャー": "RA", "ウォーロック": "WL", "メカニック": "MC", "ロイヤルガード": "RG", "シャドウチェイサー": "SC", "ミンストレル": "MI", "ワンダラー": "WA", "ソーサラー": "SO", "ジェネティック": "GE" };
// スロットの名前: キャラ名_Lv_職業の略称_装備スロットの記号(例: Fox_Thirteen_Lv267_EM_A)。記号が無い(登録していない装備)ときは「いま」
const simcSlotName = (char, st, tag) => `${cn(char)}_Lv${(st && st.lv) || "?"}_${SIMC_JOBABBR[st && st.jobName] || (st && st.jobName) || "?"}_${tag || "いま"}`;
function simcBusyNow(msg) {                   // 画面全体を描き直さず(計算し直さず)、「…しています」の帯だけを先に出す。終わったら普通に描き直す
  const v = $("#view"); if (!v) return;
  let b = v.querySelector(".busyfast"); if (!b) { b = document.createElement("div"); b.className = "busybar busyfast"; v.insertBefore(b, v.children[1] || null); }
  b.textContent = msg;
}
async function simcFromFox(asNew, src) {    // src = {char, set, shadow, full}。full = いまのスロットの中身を、そのキャラ(職業・Lv・ステータス・装備)で置きかえる
  const F = src || SIMC.fox, EQ = DATA.equip || {}, e = (EQ.chars || {})[F.char];
  if (!e) return;
  const mainSet = (EQ.sets || {})[F.set], shSet = (EQ.shadows || {})[F.shadow], now = e.now || [];
  const st = (mainSet && (mainSet.chars || {})[F.char] && mainSet.chars[F.char].status) || e.status || {};
  let ch = simcCur(), id = SIMC.cur;
  SIMC.busy = "キャラを読み込んでいます…"; SIMC.msg = ""; simcBusyNow(SIMC.busy);
  if (!ENG.ready) { await engInit(); if (!ENG.ready) { SIMC.busy = ""; render(); return; } }
  try {
    if (asNew || F.full) {
      const jo = ENG.jobs.find(([, t]) => t === st.jobName);
      if (!jo) throw new Error(st.jobName ? `ラトリオに「${st.jobName}」という職業がありません` : "このキャラの職業がまだ読めていません（キャラ選択からログインし直すと読めます）");
      const model = await engTemplate(jo[0]);
      if (st.lv) model.status.baseLv = st.lv;
      if (st.jobLv) model.status.jobLv = st.jobLv;
      ["str", "agi", "vit", "int", "dex", "luk"].forEach((k) => { const v = (st.stats || {})[k.toUpperCase()]; model.status[k] = v && v.base !== undefined ? v.base : 1; });
      ["POW", "STA", "WIS", "SPL", "CON", "CRT"].forEach((k, i) => { const v = (st.stats || {})[k]; model.pureStatus[6 + i] = v && v.base !== undefined ? v.base : 0; });
      const nm = simcSlotName(F.char, st, mainSet ? mainSet.tag : ((EQ.sets || {})[e.cur] || {}).tag);
      try { await simcApplySkills(model, e.skills); } catch (err) { engLog("習得スキルを入れられませんでした: " + err.message); }
      if (asNew) { id = "c" + Date.now().toString(36); ch = SIMC.chars[id] = { name: nm, model }; }
      else if (ch) { ch.model = model; ch.name = nm; SIMC.res = null; }
    }
    if (!ch) throw new Error("着せる先のキャラがありません");
    const main = mainSet ? mainSet.items : now.filter((i) => i.wear & 1023), shadow = shSet ? shSet.items : now.filter((i) => i.wear >= 65536), rows = [];
    SIMC.rndMiss = []; SIMC.rndOk = 0;
    if (main.length) { rows.push(...simcWear(ch.model, main, false)); ch.model.foxSet = mainSet ? F.set : (e.cur || ""); }
    if (shadow.length) { rows.push(...simcWear(ch.model, shadow, true)); ch.model.foxShadow = shSet ? F.shadow : (e.shadow || ""); }
    SIMC.report = { id, rows, rnd: SIMC.rndMiss.length, rndOk: SIMC.rndOk, rndMiss: SIMC.rndMiss.slice(0, 12) };
    simcSelect(id); await simcPut(id);
    SIMC.msg = asNew ? "新しいスロットを作りました。" : F.full ? `「${cn(F.char)}」を反映しました。` : "装備を反映しました。";
  } catch (err) { SIMC.msg = "取り込めませんでした: " + err.message; }
  SIMC.busy = ""; render();
}
function renderSimChara() {
  if (!(typeof LOCAL !== "undefined" && LOCAL)) { $("#view").innerHTML = simNav() + `<div class="panel empty">キャラ・装備のシミュレーターは、Fox_MD_Tracker を動かしている PC の画面でだけ使えます。</div>`; bindSimNav(); return; }
  if (!RAT) { $("#view").innerHTML = simNav() + `<div class="panel empty"><span class="spin">確認中…</span></div>`; bindSimNav(); ratStatus().then(render); return; }
  if (!RAT.installed) { $("#view").innerHTML = simNav() + `<div class="panel empty">このシミュレーターは、ROラトリオHub のデータと計算を使います。<br>先に「ラトリオ」タブで「ラトリオを取り込む」を押してください。</div>`; bindSimNav(); return; }
  if (!SIMC.chars) { $("#view").innerHTML = simNav() + simcLoadingHtml(); bindSimNav(); simcLoadingBind(); if (!SIMC.loadErr) simcLoad().then(render); return; }
  if (ENG.err && !ENG.loading && !ENG.retried) { ENG.retried = true; ENG.err = ""; }      // 前もっての起動に失敗していたら、タブを開いたときに1回だけ自動でやり直す
  if (!ENG.ready && !ENG.loading && !ENG.err) engInit().then(render);
  const ch = simcCur(), ids = Object.keys(SIMC.chars);
  store.set("md_simused", "1");
  for (const c of Object.values(SIMC.chars)) if (!c.saved) c.saved = simcClone(c.model);      // 前の版のキャラ: いまの中身を「保存した中身」とみなす
  const dirty = simcDirtySlot(ch);
  let h = simNav() + `<div class="panel simbox"><div class="opts">
      <label>スロット <select id="sccsel">${ids.length ? ids.map((id, i) => `<option value="${esc(id)}" ${id === SIMC.cur ? "selected" : ""}>${i + 1}: ${esc(SIMC.chars[id].name)}${simcDirtySlot(SIMC.chars[id]) ? " ＊" : ""}</option>`).join("") : `<option>（まだありません）</option>`}</select></label>
      ${ch ? `<label>名前 <input type="text" id="sccname" value="${esc(ch.name)}" style="width:14em"></label>
        <button id="sccsavebtn" ${dirty ? "" : "disabled"} title="いまの内容を、このスロットに保存します">保存</button>
        <button id="sccrevert" ${dirty ? "" : "disabled"} title="このスロットに保存してある内容を読み込みます（保存していない変更は消えます）">ロード</button>
        <button class="ghost" id="sccdup" title="いまの内容を、新しいスロットに保存します（このスロットはそのまま）">別のスロットに保存</button>
        <button class="ghost" id="sccdel">消す</button>` : ""}
      <span class="muted">${SIMC.busy ? esc(SIMC.busy) : !ENG.ready ? (ENG.err ? `<span class="err">${esc(ENG.err)}</span> <button class="ghost" id="sccretry">もう一度試す</button>` : "計算係を起動中…（初回は1分ほどかかることがあります。2回目からは速くなります）") : esc(SIMC.msg)}</span></div>
      <div class="opts slotmake"><button id="sccnewslot" ${SIMC.busy ? "disabled" : ""} title="空のスロットを作ります。そのあと「現在のキャラを反映」や、下の「保存したキャラから作る」「ラトリオ」で中身を入れられます">＋ 新しいスロットを作成</button>
        <button id="sccnewnow" ${lastChar() && !SIMC.busy ? "" : "disabled"} title="${lastChar() ? `${esc(charWho())}の職業・Lv・ステータス・習得スキル・装備が入った、新しいスロットを作ります（いまのスロットはそのまま。名前は キャラ名_Lv_職業_装備スロット）` : "ゲームにログインして、キャラを読み込むと使えます"}">＋ 現在のキャラで新しいスロットを作成${lastChar() ? `（${esc(charWho())}）` : ""}</button>
        ${ch ? `<button id="sccnow" ${lastChar() && !SIMC.busy ? "" : "disabled"} title="${lastChar() ? `${esc(charWho())}の職業・Lv・ステータス・習得スキル・装備を、このスロットに入れます` : "ゲームにログインすると使えます"}">⟳ 現在のキャラを反映</button>
        <button id="sccnowequip" ${lastChar() && !SIMC.busy ? "" : "disabled"} title="${lastChar() ? `${esc(charWho())}が着ている装備（メインとシャドウ）だけを、このスロットに入れます（職業・ステータスはそのまま）` : "ゲームにログインすると使えます"}">⟳ 現在の装備を反映</button>` : ""}
        ${lastChar() ? (nowChar() ? "" : `<span class="muted">ログインしていないので、最後にログインしていたキャラを使います。</span>`) : `<span class="muted">「現在のキャラ」のボタンは、ゲームにログインしてキャラを読み込むと使えます。</span>`}</div>
      ${SIMC.msg && /できません|取り込めません|作れません/.test(SIMC.msg) ? `<div class="busybar" style="background:#e5484d;color:#fff">${esc(SIMC.msg)}</div>` : ""}
      ${SIMC.busy ? `<div class="busybar">${esc(SIMC.busy)}</div>` : ""}
      ${ch ? `<div class="muted" style="font-size:12px">${dirty ? `<span class="warn">＊ 保存していない変更があります。</span>「保存」でこのスロットに残ります（アプリを閉じても作業中の内容は消えませんが、「ロード」で保存したときの内容に戻せます）。` : "変更は作業中の内容として自動で残ります。区切りのよいところで「保存」すると、あとで「ロード」で戻せます。"}</div>` : ""}</div>`;
  {
    const EQ = DATA.equip || {}, E = EQ.chars || {}, F = SIMC.fox, names = Object.keys(E);
    let game = `<div class="muted">ゲームにログインすると、このツールがキャラ（職業・Lv・ステータス・装備）を覚えます。覚えたキャラから、新しいスロットを作れます。</div>`;
    if (names.length) {
      if (!names.includes(F.char)) F.char = names.slice().sort((x, y) => (E[y].updated || 0) - (E[x].updated || 0))[0];
      const opt = (T, cur, here) => `<option value="">${F.char === nowChar() ? "いま着ている装備" : "最後に着ていた装備"}</option>` + Object.entries(T || {}).filter(([, st]) => st.tag).sort((x, y) => String(x[1].tag).localeCompare(String(y[1].tag), "ja", { numeric: true }))
        .map(([sid, st]) => `<option value="${esc(sid)}" ${sid === cur ? "selected" : ""}>${esc(setLabel(st))}: ${esc(st.name || st.auto)}${sid === here ? "（着用中）" : ""}</option>`).join("");
      game = `<div class="opts"><label>キャラ <select id="sfc">${names.map((c) => `<option value="${esc(c)}" ${c === F.char ? "selected" : ""}>${esc(cn(c))}</option>`).join("")}</select></label>
        <label>装備スロット <select id="sfs">${opt(EQ.sets, F.set, E[F.char].cur)}</select></label>
        <label>シャドウのスロット <select id="sfh">${opt(EQ.shadows, F.shadow, E[F.char].shadow)}</select></label>
        <button id="sfnew" ${SIMC.busy ? "disabled" : ""}>このキャラで新しいスロットを作る</button></div>
        <div class="muted" style="font-size:12px">このツールが覚えている、そのキャラの職業・Lv・ステータスと、装備（精錬・カード・エンチャント）が入ります。ランダムオプションも入ります（ラトリオに無い効果は、入らなかったものとして出ます）。いまログインしているキャラは、上の「現在のキャラを反映」でも入れられます。</div>`;
    }
    const rat = `<div class="opts"><button class="ghost" id="sccnew" ${ENG.ready ? "" : "disabled"}>職業を選んで1から作る</button>
        <button class="ghost" id="sccurl">保存URLから読み込む</button>
        <button class="ghost" id="sccfile" title="ラトリオの「セーブデータの書き出し」で作ったファイル（ratoriohub….txt）">セーブファイルから読み込む</button>
        ${ch ? `<button class="ghost" id="sccexp" ${ENG.ready ? "" : "disabled"} title="いまのスロットを、ROラトリオHub で開ける保存URL にします">保存URLを書き出す</button>` : ""}</div>`;
    h += `<div class="simc simc2" style="margin-bottom:10px">${simcFold("mkchar", "保存したキャラから作る", game, ` <span class="muted">（このツールが覚えている、ゲームのキャラ）</span>`, false)}${simcFold("mkrat", "ラトリオ", rat, ` <span class="muted">（1から作る・保存URL やセーブファイルを読み込む・保存URL を書き出す）</span>`, false)}</div>`;
  }
  if (SIMC.exp && SIMC.exp.id === SIMC.cur) {
    h += `<div class="panel simbox"><div><b>保存URL</b> <span class="muted">ROラトリオHub でそのまま開けます（「保存URLから読み込む」にも貼れます）。${SIMC.exp.copied ? "クリップボードにコピーしました。" : ""}</span></div>
      <div class="opts"><input type="text" id="sccexpurl" readonly value="${esc(SIMC.exp.url)}" style="flex:1;min-width:16em"><button id="sccexpcopy">コピー</button><button class="ghost" id="sccexpclose">閉じる</button></div></div>`;
  }
  if (SIMC.pick) {
    const on = SIMC.pick.slots.filter((x) => x.on).length;
    h += `<div class="panel simbox"><div><b>セーブファイルの中身（${SIMC.pick.slots.length} 件）</b> <span class="muted">読み込むものにチェックを入れてください。1件につき数秒かかります。</span></div>
      <div class="scpick">${SIMC.pick.slots.map((x, i) => `<label><input type="checkbox" data-pick="${i}" ${x.on ? "checked" : ""}> ${esc(x.name)}</label>`).join("")}</div>
      <div class="opts"><button id="scpgo" ${on ? "" : "disabled"}>選んだ ${on} 件を読み込む</button><button class="ghost" id="scpall">すべて選ぶ／外す</button><button class="ghost" id="scpno">やめる</button></div></div>`;
  }
  const rep = SIMC.report && SIMC.report.id === SIMC.cur ? SIMC.report : null;
  if (rep && (rep.rows.length || rep.rnd || rep.rndOk)) {
    h += `<div class="panel simbox"><div><b>${rep.rows.length ? `取り込めなかったもの（${rep.rows.length} 件）` : "取り込みました"}</b>
      <span class="muted">${rep.rows.length ? "ラトリオの候補に、同じ名前が見つかりませんでした。「選ぶ」で結びつけると、次からは自動で入ります。" : ""}${rep.rnd ? ` ランダムオプションは ${rep.rndOk || 0} 件入りました。入らなかった ${rep.rnd} 件（ラトリオに無い効果か、この装備で選べない効果）: ${esc((rep.rndMiss || []).join(" ／ "))}${rep.rnd > (rep.rndMiss || []).length ? " …" : ""}` : ""}</span>
      <button class="ghost" id="sfrclose">閉じる</button></div>
      ${rep.rows.map((x, i) => `<div class="sfrow"><span class="muted">${esc(x.slot)}</span> ${esc(x.name)} <button class="ghost" data-fix="${i}">選ぶ</button></div>`).join("")}</div>`;
  }
  if (!ch) {
    h += `<div class="panel empty">上の「新しいスロットを作成」を押すか、「保存したキャラから作る」「ラトリオ」で、最初のスロットを作ってください。<br>作ったものは、この PC に保存されます。</div>`;
  } else if (!ENG.ready) {
    h += `<div class="panel empty">${ENG.err ? "計算係（ROラトリオHub）を起動できませんでした。上の「もう一度試す」を押してください。" : "計算係（ROラトリオHub）を起動しています…<br>初回は、ラトリオの部品を全部読み込むので1分ほどかかることがあります。2回目からは速くなります。"}</div>`;
  } else {
    const m = ch.model;
    if (!SIMC.res) { try { SIMC.res = engCalc(m, simcAllKinds()); } catch (e) { SIMC.res = null; SIMC.msg = "計算できませんでした: " + e.message; } }
    const r = SIMC.res || { c: [], core: {}, tot: {} };
    const bon = (k, base) => r.tot[k] !== undefined && r.tot[k] !== null ? `<span class="bon" data-bon="${k}">+${(r.tot[k] || 0) - (base || 0)}</span>` : "";
    const stat = (k, key) => `<tr><td>${k}</td><td><input type="number" min="1" max="200" data-st="${key}" value="${m.status[key] ?? 1}">${bon(k, m.status[key])}</td></tr>`;
    const TR = ["POW", "STA", "WIS", "SPL", "CON", "CRT"];
    h += `<div class="simc simc2" id="sccmain">
      <div class="simrow2">${simcFold("base", "基本ステータス", `<table>
          <tr><td>職業</td><td><select id="sccjob">${ENG.jobs.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(m.status.jobId) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></td></tr>
          <tr><td>BaseLv / JobLv</td><td><input type="number" min="1" max="300" data-st="baseLv" value="${m.status.baseLv ?? 1}"> / <input type="number" min="1" max="100" data-st="jobLv" value="${m.status.jobLv ?? 1}"></td></tr>
          ${stat("STR", "str")}${stat("AGI", "agi")}${stat("VIT", "vit")}${stat("INT", "int")}${stat("DEX", "dex")}${stat("LUK", "luk")}</table><div id="sccpt" style="margin-top:6px;font-size:13px">${simcPointsHtml(m)}</div>`)}
        ${simcFold("trait", "特性ステータス", `<table>
          ${TR.map((k, i) => `<tr><td>${k}</td><td><input type="number" min="0" max="200" data-pure="${6 + i}" value="${(m.pureStatus || [])[6 + i] ?? 0}">${bon(k, (m.pureStatus || [])[6 + i])}</td></tr>`).join("")}</table>`)}</div>
      ${simcFold("opt", "ステータスシミュレーター", stpHtml(m), ` <span class="muted">（試算のステータスで、装備・支援の補正込みの ASPD・詠唱・HP を見ながら、いちばん安い振り方を探す）</span>`, true)}
      ${simcFold("res", "ステータス（計算結果）", `<div id="sccres">${simcResultHtml(m, r)}</div>`, ` <span class="muted" id="sccsum">${simcSumText(r)}</span>`, false)}
      ${simcFold("key", "ASPD・詠唱・ディレイ", `<div id="scckey">${simcKeyHtml(m, r)}</div>${simcRelHtml(m, "ac", "relkey", "ASPD・詠唱・ディレイに効く支援・アイテム・スキル")}<div id="scckeycmp" class="cmpbox">${simcCmpKeyHtml(m, r)}</div>`, ` <span class="muted foldsum" id="sccksum">${esc(simcKeySum(r))}</span>${simcCmpChips(m)}`)}
      ${simcFold("resist", "耐性", `<div class="xwrap" id="sccresist">${simcResistBody(r)}</div>${simcRelHtml(m, "d", "relres", "耐久に効く支援・アイテム・スキル")}<div id="sccresistcmp" class="cmpbox">${simcCmpXHtml(m, r, ENG_RKINDS)}</div>`, ` <span class="muted foldsum" id="sccrsum">${esc(simcResistSum(r))}</span>${simcCmpChips(m)}`)}
      ${simcFold("eq", "装備", simcEquipHtml(m, false), ` <span class="muted">（名前を押すと、検索つきの一覧から選べます）</span><span class="settabs right">${simcSetTabs(m, false)}</span>`)}
      ${simcFold("sh", "シャドウ装備", simcEquipHtml(m, true), `<span class="settabs right">${simcSetTabs(m, true)}</span>`)}
      ${simcFold("buff", "支援・アイテム・スキル", simcBuffHtml(m), ` <span class="muted foldsum" id="sccbsum">${esc(simcBuffSum(m))}</span>`)}
      ${simcFold("x", "補助情報", simcExtraHtml(r) + `<div id="sccxcmp" class="cmpbox"></div>`, ` <span class="muted">（ラトリオの「拡張情報」と同じ表）</span>${simcCmpChips(m)}`)}
      ${simcFold("sb", "サンドバックマン", simcSbHtml(m), ` <span class="muted foldsum">${esc(sbDesc(simcSbCfg(m)))}</span>${simcCmpChips(m)}`, false)}</div>
      <p class="hint">計算とデータは ROラトリオHub（${esc(RAT.date)} 版）をそのまま使っています。値や装備を変えると、すぐ計算し直します。キャラはこの PC に自動で保存されます（計算機のキャラ.json）。</p>`;
  }
  $("#view").innerHTML = h;
  bindSimNav();
  const g = (id) => $("#" + id);
  if (g("sccsel")) g("sccsel").onchange = (e) => { simcSelect(e.target.value); render(); };
  if (g("sccname")) g("sccname").onchange = (e) => { ch.name = e.target.value.trim() || "キャラ"; simcSave(); e.target.blur(); render(); };
  if (g("sccnew")) g("sccnew").onclick = (e) => { const r = e.target.getBoundingClientRect(); showCtx(r.left, r.bottom + 4, [{ cap: "職業を選ぶ" }].concat(ENG.jobs.slice().reverse().slice(0, 40).map(([v, t]) => ({ label: t, act: () => simcNew(v, t) })))); };
  if (g("sccurl")) g("sccurl").onclick = () => { const v = prompt("ラトリオの保存URL を貼り付けてください（https://…/calcx.html?〇〇）"); if (v) simcImportUrl(v); };
  if (g("sccfile")) g("sccfile").onclick = () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".txt,text/plain"; inp.onchange = () => { const f = inp.files[0]; if (f) f.text().then(simcOpenFile); }; inp.click(); };
  if (SIMC.pick) {
    $("#view").querySelectorAll("[data-pick]").forEach((el) => el.onchange = () => { SIMC.pick.slots[+el.dataset.pick].on = el.checked; render(); });
    g("scpall").onclick = () => { const all = SIMC.pick.slots.every((x) => x.on); SIMC.pick.slots.forEach((x) => x.on = !all); render(); };
    g("scpno").onclick = () => { SIMC.pick = null; render(); };
    g("scpgo").onclick = simcImportPicked;
  }
  foldBind($("#view"));
  if (g("sccmain") && ch) {
    // 枠の並びは自分で変えられる(見出しの ⋮⋮ をつかんで上下に動かす)。基本ステータスと特性ステータスは、横並びのまま1つとして動く
    const main = g("sccmain"), keyOf = (el) => (el.classList.contains("simrow2") ? "stats" : el.dataset.fold), ord = SETTINGS.simOrder || [];
    const kids = [...main.children].map((el, i) => ({ el, i, k: keyOf(el) })).sort((x, y) => (((ord.indexOf(x.k) + 1) || 99) - ((ord.indexOf(y.k) + 1) || 99)) || x.i - y.i);
    kids.forEach(({ el, k }) => {
      el.dataset.ord = k; main.appendChild(el);
      const sm = el.querySelector("summary");
      if (sm) { sm.insertAdjacentHTML("afterbegin", `<span class="grip fgrip" title="つかんで上下に動かすと、枠の並びを変えられます">⋮⋮</span>`); sm.firstElementChild.onclick = (e) => e.preventDefault(); }
    });
    makeSortable(main, ":scope > [data-ord]", kids.map((x) => x.k), (arr) => { SETTINGS.simOrder = arr; saveSettings(); render(); }, "y");
    // いま表示している装備が、どの装備スロットのものか: そのスロットの色を、枠と各ボックスの縁に出す(手で変えたあとは点線)
    for (const [fold, shadow] of [["eq", false], ["sh", true]]) {
      const el = main.querySelector(`details[data-fold="${fold}"]`), sid = shadow ? ch.model.foxShadow : ch.model.foxSet, st = ((DATA.equip || {})[shadow ? "shadows" : "sets"] || {})[sid];
      if (el && st && st.tag) { el.classList.add("slotc"); el.classList.toggle("dirty", simcDirty(ch.model, shadow)); el.style.setProperty("--slotc", tagColor(st)); }
    }
  }
  if (g("sccnewslot")) g("sccnewslot").onclick = async () => {
    const v = prompt("新しいスロットの名前", "新しいスロット"); if (!v || !v.trim()) return;
    SIMC.busy = "新しいスロットを作っています…"; render();
    try {
      await engInit(); if (!ENG.ready) throw new Error(ENG.err || "計算係を起動できませんでした");
      const model = await engTemplate(0);
      Object.assign(model.status, { baseLv: 1, jobLv: 1, str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 });
      const id = "c" + Date.now().toString(36);
      SIMC.chars[id] = { name: v.trim().slice(0, 40), model, saved: simcClone(model) };
      simcSelect(id); await simcPut(id);
      SIMC.msg = nowChar() ? "空のスロットを作りました。「現在のキャラを反映」で、ログインしているキャラを入れられます。" : "空のスロットを作りました。";
    } catch (e) { SIMC.msg = "作れませんでした: " + e.message; }
    SIMC.busy = ""; render();
  };
  if (g("sccnewnow")) g("sccnewnow").onclick = () => { const c = lastChar(); if (c) simcFromFox(true, { char: c, set: "", shadow: "" }); };
  if (g("sccnowequip")) g("sccnowequip").onclick = async () => {
    const c = lastChar(); if (!c) return;
    if (await askOnce("wear", `計算機の装備とシャドウ装備を、${charWho()}「${cn(c)}」が着ている装備に切りかえます。
スロットに保存していない、いまの装備（変更したところ）は消えます。`, "切りかえる")) { simcWearSet("now:" + c, false); simcWearSet("now:" + c, true); }
  };
  if (g("sccnow")) g("sccnow").onclick = async () => {
    const c = lastChar(); if (!c) return;
    if (await askOnce("nowchar", `スロット「${ch.name}」に、${charWho()}「${cn(c)}」の職業・Lv・ステータスと、いま着ている装備を入れます。\nスロットの作業中の内容は置きかわります（「ロード」で、保存したときの内容に戻せます）。`, "反映する")) simcFromFox(false, { char: c, set: "", shadow: "", full: true });
  };
  if (g("sccretry")) g("sccretry").onclick = () => { ENG.err = ""; engInit().then(render); render(); };
  if (g("sccsavebtn")) g("sccsavebtn").onclick = () => { ch.saved = simcClone(ch.model); simcSave(); SIMC.msg = "保存しました。"; render(); };
  if (g("sccrevert")) g("sccrevert").onclick = async () => { if (await askOnce("revert", `「${ch.name}」に保存してある内容を読み込みます。\n保存していない変更は消えます。`, "ロードする")) { ch.model = simcClone(ch.saved); SIMC.res = null; SIMC.report = null; simcSave(); SIMC.msg = "保存してある内容を読み込みました。"; render(); } };
  if (g("sfc")) {
    g("sfc").onchange = (e) => { SIMC.fox.char = e.target.value; e.target.blur(); render(); };
    g("sfs").onchange = (e) => { SIMC.fox.set = e.target.value; };
    g("sfh").onchange = (e) => { SIMC.fox.shadow = e.target.value; };
    g("sfnew").onclick = () => simcFromFox(true);
  }
  if (g("sfrclose")) g("sfrclose").onclick = () => { SIMC.report = null; render(); };
  simcNeedKick();
  const copyText = async (t) => { try { await navigator.clipboard.writeText(t); return true; } catch (e) { const el = g("sccexpurl"); if (el) { el.focus(); el.select(); try { return document.execCommand("copy"); } catch (e2) { } } return false; } };
  if (g("sccexp")) g("sccexp").onclick = async () => {
    try { const d = await engExportData(ch.model); SIMC.exp = { id: SIMC.cur, url: "https://roratorio-hub.github.io/ratorio/ro4/m/calcx.html?" + d, copied: false }; SIMC.msg = ""; }
    catch (e) { SIMC.msg = "書き出せませんでした: " + e.message; }
    render(); if (SIMC.exp && SIMC.exp.id === SIMC.cur) { SIMC.exp.copied = await copyText(SIMC.exp.url); render(); }
  };
  if (g("sccexpcopy")) g("sccexpcopy").onclick = async () => { SIMC.exp.copied = await copyText(SIMC.exp.url); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); render(); };
  if (g("sccexpclose")) g("sccexpclose").onclick = () => { SIMC.exp = null; render(); };
  if (g("sccexpurl")) g("sccexpurl").onfocus = (e) => e.target.select();
  if (g("sccdup")) g("sccdup").onclick = () => {
    const v = prompt("新しいスロットの名前", ch.name + " (2)"); if (!v || !v.trim()) return;
    const id = "c" + Date.now().toString(36);
    SIMC.chars[id] = { name: v.trim().slice(0, 40), model: simcClone(ch.model), saved: simcClone(ch.model) };
    simcSelect(id); simcSave(); SIMC.msg = "新しいスロットに保存しました。"; render();
  };
  if (g("sccdel")) g("sccdel").onclick = async (e) => {
    if (e.target.dataset.ok !== "1") { e.target.dataset.ok = "1"; e.target.textContent = "本当に消す？"; return; }
    await fetch("/api/simchars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: SIMC.cur, delete: 1 }) });
    delete SIMC.chars[SIMC.cur]; simcSelect(Object.keys(SIMC.chars)[0] || ""); render();
  };
  if (ch && ENG.ready) {
    // 値を変えたら、その場で計算し直して結果だけ描きかえる(入力中の欄はそのまま)
    const recalc = () => {
      try { SIMC.res = engCalc(ch.model, simcAllKinds()); } catch (e) { SIMC.msg = "計算できませんでした: " + e.message; return; }
      if (g("sccx")) g("sccx").innerHTML = simcExtraBody(SIMC.res);
      if (g("sccresist")) { g("sccresist").innerHTML = simcResistBody(SIMC.res); g("sccrsum").textContent = simcResistSum(SIMC.res); }
      if (g("sccksum")) g("sccksum").textContent = simcKeySum(SIMC.res);
      simcCmpFill(ch.model); simcCmpKick(ch.model);
      g("sccres").innerHTML = simcResultHtml(ch.model, SIMC.res); g("scckey").innerHTML = simcKeyHtml(ch.model, SIMC.res); g("sccsum").textContent = simcSumText(SIMC.res); simcNeedKick(); if (g("sccpt")) g("sccpt").innerHTML = simcPointsHtml(ch.model);
      if (g("stp")) { stpRefreshMain(ch.model); stpKick(ch.model); }
      const base = { STR: ch.model.status.str, AGI: ch.model.status.agi, VIT: ch.model.status.vit, INT: ch.model.status.int, DEX: ch.model.status.dex, LUK: ch.model.status.luk };
      ["POW", "STA", "WIS", "SPL", "CON", "CRT"].forEach((k, i) => { base[k] = (ch.model.pureStatus || [])[6 + i] || 0; });
      $("#view").querySelectorAll("[data-bon]").forEach((el) => { const k = el.dataset.bon; el.textContent = "+" + ((SIMC.res.tot[k] || 0) - (base[k] || 0)); });
      simcSave();
    };
    // 装備の編集。替えたら全部描き直す(計算は 0.1秒ほど)
    const m = ch.model, V = $("#view");
    const changed = () => { SIMC.res = null; simcSave(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); render(); };
    // サンドバックマン
    {
      const cfg = simcSbCfg(m), S = SIMC.sb, again = () => { simcSave(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); render(); };
      V.querySelectorAll("[data-sbc]").forEach((el) => el.onchange = () => { const k = el.dataset.sbc; if (k === "full") { cfg.full = el.value; cfg.vals = []; } else cfg[k] = +el.value; again(); });
      V.querySelectorAll("[data-sbo]").forEach((el) => el.onchange = () => { const i = +el.dataset.sbo; cfg.vals = (S.chain || []).map((c) => c.v).slice(0, i); cfg.vals[i] = el.tagName === "SELECT" && !Number.isNaN(+el.value) ? +el.value : +el.value; again(); });
      if (g("sbrec")) g("sbrec").onclick = () => simcSbRecord(m);
      V.querySelectorAll("[data-sbgo]").forEach((el) => el.onclick = () => sbxGo(el.dataset.sbgo));
    }
    // 装備セットを並べて比べる
    V.querySelectorAll("[data-cmp]").forEach((el) => el.onclick = (e) => { e.preventDefault(); const sid = el.dataset.cmp, i = SIMC.cmp.indexOf(sid); if (i >= 0) SIMC.cmp.splice(i, 1); else if (SIMC.cmp.length >= 5) SIMC.msg = "並べられるのは 5 つまでです。"; else SIMC.cmp.push(sid); render(); });      // 並べるのは「いまの装備」+ 選んだ装備スロット(最大5つ)
    simcCmpFill(m); simcCmpKick(m);
    // ステ振りの相談
    if (g("soa")) {
      const O = SIMC.opt, rr = () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); render(); };
      g("soa").onchange = (e) => { O.aspd = e.target.checked; rr(); };
      g("soc").onchange = (e) => { O.cast = e.target.checked; rr(); };
      g("sotg").onchange = (e) => { O.target = Math.max(100, Math.min(193, Math.round((+e.target.value || 193) * 10) / 10)); rr(); };
      const tog = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); rr(); };
      // 枠に色が付いている(= いま着ている装備スロット)チップは、「いまの装備」を選んでいるあいだ選択済みに見える。押すと、「いまの装備」の代わりにこの記号を選ぶ(同じ中身を2回数えない)
      const tog2 = (arr, id, shadow) => { if (id !== "now" && id === stpNowSid(m, shadow) && arr.includes("now") && !arr.includes(id)) { arr.splice(arr.indexOf("now"), 1, id); rr(); } else tog(arr, id); };
      V.querySelectorAll("[data-optm]").forEach((el) => el.onclick = () => tog2(O.mainSel, el.dataset.optm, false));
      V.querySelectorAll("[data-opts]").forEach((el) => el.onclick = () => tog2(O.shSel, el.dataset.opts, true));
      const S = stpState(), me = () => { stpRefreshMain(m); stpKick(m); };
      const setV = (k, v) => { const tr = STP_TRAIT.includes(k); S.d[k] = tr ? Math.max(0, Math.min(STP_TMAX, Math.round(+v || 0))) : Math.max(1, Math.min(SIMC_STMAX, Math.round(+v || 1))); S.touched = true; me(); };
      g("stp").onclick = (e) => {
        const b = e.target.closest("[data-stpd]"); if (b) { const [k, dv] = b.dataset.stpd.split(":"); setV(k, S.d[k] + (+dv)); return; }
        const po = e.target.closest("[data-stpot]"); if (po) { m.status.speedPot = +po.dataset.stpot; changed(); return; }
        const a = e.target.closest("[data-stpapply]"); if (a) { const key = a.dataset.stpapply, c = key[0] === "b" ? (S.sug && S.sug.best || [])[+key.slice(1)] : (S.sug && S.sug.list || [])[+key]; if (c) { S.d.agi = c.agi; S.d.dex = c.dex; S.d.int = c.int; S.touched = true; render(); } return; }
        if (e.target.closest("#stpreflect")) { STP_KEYS.forEach((k) => { m.status[k] = S.d[k]; }); m.pureStatus = m.pureStatus || []; STP_TRAIT.forEach((k, i) => { while (m.pureStatus.length < 12) m.pureStatus.push(0); m.pureStatus[6 + i] = S.d[k]; }); S.touched = false; SIMC.msg = "試算のステータスを、基本ステータスに入れました。"; changed(); return; }
        if (e.target.closest("#stprecalc")) {      // 計算結果を全部捨てて、いまの設定で計算し直す
          Object.keys(ENG.cache).filter((k) => /^(sbd:|stpk:|atkk:)/.test(k)).forEach((k) => delete ENG.cache[k]); if (ENG.calcCache && ENG.calcCache.clear) ENG.calcCache.clear();
          S.rowSig = ""; S.sugSig = ""; S.effSig = ""; S.swSig = ""; S.rows = null; S.sug = null; S.eff = null; S.swR = null; render(); return;
        }
        const as = e.target.closest("[data-stpas]"); if (as) { as.disabled = true; as.textContent = "計算中…"; setTimeout(async () => { try { S.asOn = {}; S.as = await stpAsCalc(m, S); S.asRot = stpRotCalc(m, S, S.as); } catch (err) { S.as = { err: "計算できませんでした: " + err.message }; } const el = $("#stpas"); if (el) el.innerHTML = stpAsHtml(m, S); }, 30); return; }
        const ac = e.target.closest("[data-stpasc]"); if (ac && S.as && !S.as.err) {      // 潜在解放の切りかえ(同じ枠のものは1つだけ)
          const v = +ac.dataset.stpasc, c = S.as.senzai.find((x) => x.v === v); if (!c) return;
          const cur = (x) => (S.asOn && S.asOn[x.v] !== undefined ? S.asOn[x.v] : stpAsBase(m, S).card[x.slot] === x.v), was = cur(c);
          S.asOn = S.asOn || {}; S.as.senzai.filter((x) => x.slot === c.slot).forEach((x) => { S.asOn[x.v] = false; }); S.asOn[v] = !was;
          try { S.asRot = stpRotCalc(m, S, S.as); } catch (err) { S.asRot = null; } const el = $("#stpas"); if (el) el.innerHTML = stpAsHtml(m, S); return;
        }
        const ra = e.target.closest("[data-stprotadd]"); if (ra) {          // ローテーションにスキルを足す・はずす
          const T = stpSbMt(m); if (!T) return; S.rot = S.rot || [];
          const pick = ra.dataset.stprotadd === "cur" ? T.item : T.methods.find((x) => x.skill !== 0 && !S.rot.some((y) => y.full === x.full)) || T.methods.find((x) => x.skill !== 0);
          if (pick) { const lvs = pick.tree && pick.tree.type === 0 ? pick.tree.opts.map((o) => o[0]) : [1]; S.rot.push({ full: pick.full, lv: ra.dataset.stprotadd === "cur" ? T.mt.lv : lvs[lvs.length - 1] }); }
          try { S.asRot = stpRotCalc(m, S, S.as); } catch (err) { S.asRot = null; } const el = $("#stpas"); if (el) el.innerHTML = stpAsHtml(m, S); return;
        }
        const rd = e.target.closest("[data-stprotdel]"); if (rd) { S.rot.splice(+rd.dataset.stprotdel, 1); try { S.asRot = stpRotCalc(m, S, S.as); } catch (err) { S.asRot = null; } const el = $("#stpas"); if (el) el.innerHTML = stpAsHtml(m, S); return; }
        const at = e.target.closest("[data-stpastarget]"); if (at) { SIMC.opt.aspd = true; SIMC.opt.target = +at.dataset.stpastarget; render(); return; }
        if (e.target.closest("#stpreset")) { S.touched = false; render(); }
      };
      g("stp").onchange = (e) => {
        const i = e.target.closest("[data-stpv]"); if (i) { setV(i.dataset.stpv, i.value); return; }
        const rs = e.target.closest("[data-stprot]"); if (rs) {                // ローテーションのスキル・Lv の変更
          const [ix, k] = rs.dataset.stprot.split(":"), row = (S.rot || [])[+ix]; if (!row) return;
          if (k === "full") { row.full = rs.value; const T = stpSbMt(m), it = T && T.methods.find((x) => x.full === rs.value), lvs = it && it.tree && it.tree.type === 0 ? it.tree.opts.map((o) => o[0]) : [1]; row.lv = lvs[lvs.length - 1]; } else row.lv = +rs.value;
          try { S.asRot = stpRotCalc(m, S, S.as); } catch (err) { S.asRot = null; } const el = $("#stpas"); if (el) el.innerHTML = stpAsHtml(m, S); return;
        }
        const sb = e.target.closest("[data-stpsb]"); if (sb) {               // 小型サンドバックマン(サンドバックマンの枠と同じ設定 m.foxSb)
          const k = sb.dataset.stpsb, cfg = simcSbCfg(m);
          if (k === "full") { cfg.full = sb.value; cfg.vals = []; }
          else if (k.startsWith("o:")) { const n = +k.slice(2), T = stpSbMt(m); cfg.vals = (T ? T.chain.map((c) => c.v) : []).slice(0, n); cfg.vals[n] = Number.isNaN(+sb.value) ? sb.value : +sb.value; }
          else cfg[k] = +sb.value;
          S.sugSig = ""; S.effSig = ""; S.swSig = ""; simcSave(); render(); return;
        }
        const sc = e.target.closest("[data-stpswc]"); if (sc) { const k = sc.dataset.stpswc; S.sw[k] = k === "stat" ? sc.value : Math.max(k === "dir" ? -1 : 1, Math.min(k === "n" ? 12 : 50, Math.round(+sc.value) || (k === "dir" ? -1 : 1))); S.swSig = ""; render(); return; }
        const q = e.target.closest("[data-qb],[data-qbs]"); if (q) {         // 支援のスイッチ(「支援・アイテム・スキル」と同期)
          const key = q.dataset.qb || q.dataset.qbs, it = (simcSchema(m) || []).find((x) => simcBuffKey(x) === key); if (!it) return;
          simcBuffSet(m, it, q.dataset.qbs ? (q.checked ? it.opts[it.opts.length - 1][0] : 0) : q.type === "checkbox" ? q.checked : q.value); changed();
        }
      };
      V.querySelectorAll("[data-optmin]").forEach((el) => el.onchange = () => { O.min[el.dataset.optmin] = Math.max(1, Math.min(SIMC_STMAX, Math.round(+el.value || 1))); });
    }
    // 支援・アイテム・スキル
    if (simcSchema(m)) {
      const B = SIMC.bf, sc = simcSchema(m), byKey = Object.fromEntries(sc.map((it) => [simcBuffKey(it), it]));
      const relist = () => { const el = g("sccbuffs"); if (el) el.innerHTML = simcBuffListHtml(m); if (g("sccbsum")) g("sccbsum").textContent = simcBuffSum(m); };
      const nav = (fn) => (e) => { fn(e.currentTarget); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); render(); };
      V.querySelectorAll("[data-bft]").forEach((el) => el.onclick = nav((b) => { B.tab = b.dataset.bft; B.q = ""; }));
      V.querySelectorAll("[data-bfp]").forEach((el) => el.onclick = nav((b) => { B.purpose = b.dataset.bfp; }));
      V.querySelectorAll("[data-bfs]").forEach((el) => el.onclick = nav((b) => { B.sub = b.dataset.bfs; }));
      if (g("sccbon")) g("sccbon").onchange = nav((b) => { B.onOnly = b.checked; });
      if (g("sccbq")) { g("sccbq").oninput = (e) => { B.q = e.target.value; relist(); }; g("sccbq").onkeydown = (e) => { if (e.key === "Escape") { B.q = ""; e.target.blur(); render(); } }; }
      V.querySelectorAll(".relbox .simpot [data-stpot]").forEach((el) => { el.onclick = () => { m.status.speedPot = +el.dataset.stpot; changed(); }; });
      if (g("sccbuffs")) g("sccbuffs").addEventListener("click", (e) => { const po = e.target.closest("[data-stpot]"); if (po) { m.status.speedPot = +po.dataset.stpot; changed(); } });      // 一覧は作り直されるので、押したときの処理は枠に持たせる
      if (g("sccbuffs")) g("sccbuffs").onchange = (e) => {
        const el = e.target.closest("[data-bf]"), it = el && byKey[el.dataset.bf]; if (!it) return;
        simcBuffSet(m, it, el.type === "checkbox" ? el.checked : el.value);
        recalc();
        const cell = el.closest(".bfi"); if (cell) cell.classList.toggle("on", simcBuffOn(m, it));
        if (g("sccbsum")) g("sccbsum").textContent = simcBuffSum(m);
        const tb = V.querySelector('[data-bft="on"]'); if (tb) tb.textContent = `オンのもの（${sc.filter((x) => x.g !== "learn" && simcBuffOn(m, x)).length}）`;
      };
      const names = (p) => { const sc2 = Object.fromEntries(simcBuffItems(m).map((it) => [simcBuffKey(it), it.label])); return Object.keys(p.on || {}).map((k) => sc2[k]).filter(Boolean); };
      V.querySelectorAll("[data-bpre]").forEach((el) => {
        const i = +el.dataset.bpre, P = SETTINGS.simPresets || [], p = P[i]; if (!p) return;
        el.onclick = () => { simcPresetApply(m, p, false); changed(); };
        el.oncontextmenu = (e) => {
          e.preventDefault();
          showCtx(e.clientX, e.clientY, [{ cap: `「${p.name}」 ${names(p).slice(0, 6).join("、")}${names(p).length > 6 ? " ほか" : ""}` },
            { label: "これだけにする（ほかはオフ）", act: async () => { if (await askOnce("bufonly", `オンオフを「${p.name}」だけにします。\nいまオンにしている、ほかのものはオフになります。`, "これだけにする")) { simcPresetApply(m, p, true); changed(); } } },
            { label: "いまのオンで上書き", act: async () => { if (await askOnce("bufover", `「${p.name}」を、いまオンにしているもので上書きします。`, "上書きする")) { p.on = simcOnMap(m); p.job = m.status.jobId; saveSettings(); render(); } } },
            { label: "名前を変える", act: () => { const v = prompt("組み合わせの名前", p.name); if (v && v.trim()) { p.name = v.trim().slice(0, 20); saveSettings(); render(); } } },
            { label: "消す", act: async () => { if (await askOnce("bufdel", `「${p.name}」を消します。`, "消す")) { P.splice(P.indexOf(p), 1); saveSettings(); render(); } } }]);
        };
      });
      if (g("sccbsave")) g("sccbsave").onclick = () => {
        const on = simcOnMap(m); if (!Object.keys(on).length) { SIMC.msg = "オンにしているものがありません。"; render(); return; }
        const v = prompt("この組み合わせの名前（例: 狩り用、ASPD 用）", ""); if (!v || !v.trim()) return;
        SETTINGS.simPresets = SETTINGS.simPresets || []; SETTINGS.simPresets.push({ name: v.trim().slice(0, 20), job: m.status.jobId, on }); saveSettings(); render();
      };
      if (g("sccboff")) g("sccboff").onclick = async () => { if (await askOnce("bufoff", "支援・アイテム・スキルを全部オフにします（習得スキルはそのまま）。", "全部オフ")) { simcBuffItems(m).forEach((it) => simcBuffSet(m, it, 0)); changed(); } };
      simcTagKick(m);                       // 目的別の印は、ASPD・耐性の枠の「効く支援」にも使うので、枠の開け閉めに関係なく調べておく(職業ごとに1回)
      V.querySelectorAll("[data-rel]").forEach((el) => el.onchange = () => {
        const it = byKey[el.dataset.rel]; if (!it) return;
        simcBuffSet(m, it, el.checked ? (it.type === "c" ? 1 : it.opts[it.opts.length - 1][0]) : 0);
        changed();
      });
    }
    const two = (el, key) => el.dataset[key].split(":").map(Number);
    const touched = () => { };                // 手で替えても「どの装備セットを着ているか」は残す(タブに ＊ が付き、右クリックで上書きできる)
    foldBind(V, (el) => { if ((el.dataset.fold === "opt" || el.dataset.fold === "stppat" || el.dataset.fold === "stpeff" || el.dataset.fold === "stpsw") && el.open && g("stp")) stpKick(m); if (el.dataset.fold === "sb" && el.open) { sbxLoad().then(render); } });
    if (g("stp")) stpKick(m);
    const part = (shadow) => (shadow ? "シャドウ装備" : "装備");
    const wearAsk = async (sid, shadow, label) => { if (await askOnce("wear", `計算機の${part(shadow)}を「${label}」に切りかえます。\nスロットに保存していない、いまの${part(shadow)}（変更したところ）は消えます。`, "切りかえる")) simcWearSet(sid, shadow); };
    V.querySelectorAll("[data-slot]").forEach((el) => {
      const sid = el.dataset.slot, shadow = el.dataset.sh === "1", tag = el.textContent.replace("＊", ""), st = ((DATA.equip || {})[shadow ? "shadows" : "sets"] || {})[sid] || {};
      const menu = (x, y) => showCtx(x, y, [{ cap: `スロット「${tag}」 ${st.name || st.auto || ""}` },
        { label: `反映する（「${tag}」を計算機に入れる）`, act: () => wearAsk(sid, shadow, tag) },
        { label: `上書きする（いまの計算機の${part(shadow)}を「${tag}」に保存）`, act: async () => { if (await askOnce("over", `スロット「${tag}」を、いまの計算機の${part(shadow)}で上書きします。\nいまの「${tag}」の中身は履歴に戻ります。`, "上書きする")) simcRegister(shadow, sid); } },
        "-",
        { label: "名前を変える", act: async () => { const v = prompt(`スロット「${tag}」の名前（空にすると自動の名前）`, st.name || ""); if (v !== null) { await postSet({ sid, name: v.trim() }); await load(); render(); } } },
        { label: "記号を変える", act: async () => { const v = prompt("新しい記号（8文字まで）", tag); if (v && v.trim()) { await postSet({ sid, tag: v.trim() }); await load(); render(); } } },
        { label: "登録を外す（履歴に戻す）", act: async () => { if (await askOnce("unreg", `スロット「${tag}」の登録を外します。\n装備の中身は履歴に残るので、あとでまた登録できます。`, "登録を外す")) { await postSet({ sid, unregister: 1 }); await load(); render(); } } }]);
      // 押したら、そのスロットの装備に切りかえる。消えるもの(スロットに保存していない変更・どのスロットにも入れていない装備)があるときだけ確かめる
      el.onclick = (e) => {
        e.preventDefault();
        const cur = shadow ? m.foxShadow : m.foxSet, dirty = simcDirty(m, shadow), linked = !!(((DATA.equip || {})[shadow ? "shadows" : "sets"] || {})[cur] || {}).tag;
        const some = (shadow ? SIMC_SHADOW : SIMC_REGIONS).some(([r]) => !simcIsNone(r, simcItemAt(m, r)));
        if (sid === cur && !dirty) return;
        if (dirty || (!linked && some)) wearAsk(sid, shadow, tag); else simcWearSet(sid, shadow);
      };
      el.oncontextmenu = (e) => { e.preventDefault(); menu(e.clientX, e.clientY); };
    });
    V.querySelectorAll("[data-simreg]").forEach((el) => el.onclick = (e) => { e.preventDefault(); simcRegister(el.dataset.simreg === "1", ""); });
    V.querySelectorAll("[data-wearnow]").forEach((el) => el.onclick = (e) => { e.preventDefault(); const c = lastChar(); if (c) wearAsk("now:" + c, el.dataset.wearnow === "1", cn(c) + " がいま着ている装備"); });
    V.querySelectorAll("[data-wearmore]").forEach((el) => el.onclick = (e) => {
      e.preventDefault();
      const shadow = el.dataset.wearmore === "1", L = simcSetList(m, shadow);
      const hist = L.rest.map(({ sid, st }) => ({ v: sid, t: `${st.sim ? "計算機で作った装備" : "着ていた装備"}: ${st.name || st.auto || ""}${Object.keys(st.chars || {}).length ? `（${Object.keys(st.chars).map(cn).join("、")}）` : ""}`, k: "", label: st.name || st.auto || "保存した装備" }));
      if (!hist.length) { SIMC.msg = "スロットに登録していない装備の履歴は、まだありません。"; render(); return; }
      pickOpen(el, hist, null, (sid, o) => wearAsk(sid, shadow, o.label));
    });
    V.querySelectorAll("[data-xk]").forEach((el) => el.onclick = () => { const id = +el.dataset.xk, on = simcXKinds(), i = on.indexOf(id); if (i >= 0) on.splice(i, 1); else on.push(id); store.set("md_simx", JSON.stringify(on)); SIMC.res = null; render(); });
    V.querySelectorAll("[data-item]").forEach((el) => el.onclick = () => { const region = +el.dataset.item; pickOpen(el, simcItemOpts(m.status.jobId, region), simcItemAt(m, region), (v) => { simcSetItem(m, region, v); touched(region); changed(); }); });
    V.querySelectorAll("[data-card]").forEach((el) => el.onclick = () => { const [region, i] = two(el, "card"), cr = SIMC_CARD[region][i]; pickOpen(el, simcCardOpts(region, m.equip[region])[i], m.card[cr] || 0, (v) => { m.card[cr] = v; touched(region); changed(); }); });
    V.querySelectorAll("[data-rf]").forEach((el) => el.onchange = () => { simcSetRefine(m, +el.dataset.rf, +el.value); touched(+el.dataset.rf); changed(); });
    V.querySelectorAll("[data-tr]").forEach((el) => el.onchange = () => { const tr = SIMC_TRANS[+el.dataset.tr]; m[tr[0]][tr[1]] = +el.value; touched(0); changed(); });
    V.querySelectorAll("[data-rk]").forEach((el) => el.onchange = () => { const [region, i] = two(el, "rk"), k = +el.value, vals = k ? simcRndVals(k) : []; simcRndArr(m, region)[i] = [k, vals.length ? vals[vals.length - 1].v : 0]; touched(region); changed(); });
    V.querySelectorAll("[data-rv]").forEach((el) => el.onchange = () => { const [region, i] = two(el, "rv"); simcRndArr(m, region)[i][1] = +el.value; touched(region); changed(); });
    V.querySelectorAll("[data-fix]").forEach((el) => el.onclick = () => {       // 取り込めなかったものを、手で候補に結びつける(次からは自動)
      const rows = SIMC.report.rows, x = rows[+el.dataset.fix];
      const opts = x.isCard ? (() => { const seen = new Set(); return simcCardOpts(x.region, m.equip[x.region]).flat().filter((o) => o.v && !seen.has(o.v) && seen.add(o.v)); })() : simcItemOpts(m.status.jobId, x.region).filter((o) => o.v !== simcNoneId(x.region));
      pickOpen(el, opts, null, (v, o) => {
        SETTINGS.ratLinks = SETTINGS.ratLinks || {}; SETTINGS.ratLinks[x.gameId] = o.n || o.t; saveSettings();
        rows.splice(rows.indexOf(x), 1);
        if (x.isCard) { const all = simcCardOpts(x.region, m.equip[x.region]), cs = SIMC_CARD[x.region], i = [0, 1, 2, 3].find((n) => !m.card[cs[n]] && all[n].some((c) => c.v === v)); if (i !== undefined) m.card[cs[i]] = v; }
        else { simcSetItem(m, x.region, v); simcSetRefine(m, x.region, x.refine, x.grade); if (x.region < 14) rows.push(...simcWearCards(m, x.region, x)); }
        changed();
      });
    });
    $("#view").querySelectorAll("[data-st]").forEach((el) => el.oninput = () => { const v = Math.max(1, Math.round(+el.value || 1)); ch.model.status[el.dataset.st] = v; recalc(); });
    $("#view").querySelectorAll("[data-pure]").forEach((el) => el.oninput = () => { ch.model.pureStatus[+el.dataset.pure] = Math.max(0, Math.round(+el.value || 0)); recalc(); });
    if (g("sccjob")) g("sccjob").onchange = async (e) => {
      // 職業を変える: その職業のまっさらな model を作り、Lv とステータスだけ引き継ぐ(装備・スキルは職業ごとに違うので引き継がない)
      SIMC.busy = "職業を変えています…"; render();
      const old = ch.model.status, model = await engTemplate(e.target.value);
      Object.assign(model.status, { baseLv: old.baseLv, jobLv: old.jobLv, str: old.str, agi: old.agi, vit: old.vit, int: old.int, dex: old.dex, luk: old.luk });
      ch.model = model; SIMC.res = null; SIMC.busy = ""; simcSave(); render();
    };
  }
}
