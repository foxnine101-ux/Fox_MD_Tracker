"use strict";
// ---- 装備の編集 ----
// 場所の番号はラトリオの EQUIP_REGION_ID(0 右手 … 10 アクセ2、14〜23 シャドウ)。カード・エンチャントは model.card[カードの場所の番号]
const SIMC_REGIONS = [[0, "武器"], [2, "兜上段"], [3, "兜中段"], [4, "兜下段"], [5, "盾"], [6, "鎧"], [7, "肩にかける物"], [8, "靴"], [9, "アクセサリー(1)"], [10, "アクセサリー(2)"]];
const SIMC_SHADOW = [[14, "シャドウ武器"], [15, "シャドウ盾"], [19, "シャドウ鎧"], [21, "シャドウ靴"], [22, "シャドウアクセ(右)"], [23, "シャドウアクセ(左)"]];
const SIMC_REFINE = { 0: ["weapon", "atkPlus"], 2: ["defPlus", "head"], 5: ["defPlus", "shield"], 6: ["defPlus", "body"], 7: ["defPlus", "shoulder"], 8: ["defPlus", "shoes"] };
const SIMC_TRANS = { 0: ["weapon", "transcendence"], 2: ["defTranscendence", "head"], 5: ["defTranscendence", "shield"], 6: ["defTranscendence", "body"], 7: ["defTranscendence", "shoulder"], 8: ["defTranscendence", "shoes"] };
const SIMC_PREFIX = { 0: "ARMS_RIGHT", 1: "ARMS_LEFT", 2: "HEAD_TOP", 3: "HEAD_MID", 4: "HEAD_UNDER", 5: "SHIELD", 6: "BODY", 7: "SHOULDER", 8: "SHOES", 9: "ACCESSORY_1", 10: "ACCESSORY_2" };
const SIMC_KINDS = { 2: [50], 3: [51], 4: [52], 5: [61], 6: [60], 7: [62], 8: [63], 9: [64, 65], 10: [64, 66], 14: [72], 15: [73], 19: [77], 21: [80], 22: [82], 23: [83] };   // その場所に着けられるアイテムの種類(ITEM_KIND)
const SIMC_CARD = { 0: [0, 1, 2, 3], 1: [4, 5, 6, 7], 2: [8, 26, 27, 28], 3: [9, 29, 30, 31], 4: [16, 33, 34, 35], 5: [10, 36, 37, 38], 6: [11, 39, 40, 41], 7: [12, 42, 43, 44], 8: [13, 45, 46, 47], 9: [14, 48, 49, 50], 10: [15, 51, 52, 53] };
const SIMC_SHCARD = { 14: [54, 55, 56], 15: [57, 58, 59], 19: [60, 61, 62], 21: [63, 64, 65], 22: [66, 67, 68], 23: [69, 70, 71] };
const SIMC_WKIND = { 1: "短剣", 2: "片手剣", 3: "両手剣", 4: "片手槍", 5: "両手槍", 6: "片手斧", 7: "両手斧", 8: "鈍器", 9: "杖", 10: "弓", 11: "カタール", 12: "本", 13: "爪", 14: "楽器", 15: "鞭", 16: "風魔手裏剣", 17: "ハンドガン", 18: "ライフル", 19: "ショットガン", 20: "ガトリングガン", 21: "グレネードガン", 22: "両手杖" };
const simcItemName = (id) => { const it = id && ENG.items && ENG.items[id]; return it ? String(it[8]) : ""; };
const simcCardName = (id) => { const c = id && ENG.reg.CardObjNew && ENG.reg.CardObjNew[id]; return c ? String(c[2]) : ""; };
const simcNoneId = (region) => (region >= 14 ? ENG.blankShadow[region] : ENG.blank[region]) || 0;
const simcItemAt = (m, region) => (region >= 14 ? ((m.shadowEquip || {}).itemId || [])[region] : (m.equip || [])[region]) || 0;
const simcIsNone = (region, id) => !id || id === simcNoneId(region) || /装備なし|^[(（]?なし[)）]?$/.test(simcItemName(id));
function simcItemOpts(jobId, region, any) {    // その職業が、その場所に着けられるアイテム。武器は種類をまたいで全部(選ぶと武器の種類も合わせる)。any = 職業の制限を外す
  const key = (any ? "ia:" : "i" + jobId + ":") + region; if (ENG.cache[key]) return ENG.cache[key];
  const kinds = SIMC_KINDS[region], none = simcNoneId(region), out = [];
  for (const it of ENG.items) {
    if (!it) continue;
    const k = it[1];
    if (region === 0 ? !(k >= 1 && k <= 22) : !kinds.includes(k)) continue;
    if (it[0] === none || (!any && !ENG.x.job(it[0], +jobId))) continue;
    const n = ENG.x.nm.GetFlagAppendedItemName(it[0]);
    out.push({ v: it[0], n, t: (region === 0 ? `[${SIMC_WKIND[k] || "武器"}] ` : "") + n, k: String(it[9] || "") });
  }
  out.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  out.unshift({ v: none, t: "（なし）", k: "" });
  if (!any && out.length === 1) return ENG.cache[key] = simcItemOpts(jobId, region, true);      // その職業には1つも無い場所(ノービスのシャドウなど)は、制限を外して出す
  return ENG.cache[key] = out;
}
function simcCardOpts(region, itemId) {   // その装備の4つの枠(カード・エンチャント)の候補。ラトリオに枠を作らせて、できた選択肢を読む
  const key = "c" + region + ":" + itemId; if (ENG.cache[key]) return ENG.cache[key];
  const d = ENG.frame.contentDocument, C = ENG.reg.CardObjNew || [];
  try { ENG.x.card(region, itemId); } catch (e) { console.warn("card opts", region, itemId, e); return [[], [], [], []]; }
  return ENG.cache[key] = [1, 2, 3, 4].map((n) => {
    const sel = d.getElementById(`OBJID_${SIMC_PREFIX[region]}_CARD_${n}`);
    const o = sel ? [...sel.options].map((x) => { const c = C[+x.value]; return { v: +x.value, t: x.text, k: c ? String(c[3] || "") : "", d: c && +x.value ? String(c[4] || "").replace(/<br\s*\/?>/gi, " ／ ").replace(/<[^>]+>/g, "") : "" }; }) : [];
    const z = o.findIndex((x) => x.v === 0); if (z > 0) o.unshift(o.splice(z, 1)[0]);
    return o;
  });
}
function simcRndLists(itemId) {           // その装備の、ランダムオプションの枠ごとの候補リスト番号(付かない装備は空)
  const it = ENG.items[itemId]; if (!it) return [];
  const ty = ENG.x.rndTypeId(it[4]);
  return ty > 0 && ENG.x.rndTypes[ty] ? (ENG.x.rndTypes[ty][ENG.x.rndListIdx] || []) : [];
}
function simcRndSel(key, fill) { if (ENG.cache[key]) return ENG.cache[key]; const sel = ENG.frame.contentDocument.createElement("select"); try { fill(sel); } catch (e) { console.warn("rnd opts", key, e); } return ENG.cache[key] = [...sel.options].map((x) => ({ v: +x.value, t: x.text })); }
const simcRndKinds = (listId) => simcRndSel("rk" + listId, (sel) => ENG.x.ro.SetUpRndOptKind(sel, listId));
const simcRndVals = (rndId) => simcRndSel("rv" + rndId, (sel) => ENG.x.ro.SetUpRndOptValue(sel, rndId));
function simcRndArr(m, region) {
  const five = () => Array.from({ length: 5 }, () => [0, 0]);
  if (region >= 14) { const sh = m.shadowEquip; sh.rndOpt = sh.rndOpt || []; return sh.rndOpt[region] = sh.rndOpt[region] || five(); }
  m.foxRnd = m.foxRnd || engRndBlank(); return m.foxRnd[region] = m.foxRnd[region] || five();
}
function simcSetItem(m, region, id) {     // 装備を替える。合わなくなったカード・エンチャントと、ランダムオプションは外す
  if (region >= 14) {
    const sh = m.shadowEquip; sh.itemId = sh.itemId || []; sh.refined = sh.refined || []; sh.rndOpt = sh.rndOpt || [];
    sh.itemId[region] = id; sh.refined[region] = sh.refined[region] || 0; sh.rndOpt[region] = Array.from({ length: 5 }, () => [0, 0]);
    SIMC_SHCARD[region].forEach((cr) => { m.card[cr] = 0; });
    return;
  }
  m.equip[region] = id;
  if (region === 0) { const k = (ENG.items[id] || [])[1]; m.weapon.type = k >= 1 && k <= 22 ? k : 0; }
  const opts = simcCardOpts(region, id);
  const off = simcIsNone(region, id);      // はずしたときは、カード・エンチャントも全部外す(「なし」にもカードの枠があるので、残すと計算に入ってしまう)
  SIMC_CARD[region].forEach((cr, i) => { if (off || !opts[i].some((o) => o.v === m.card[cr])) m.card[cr] = 0; });
  m.foxRnd = m.foxRnd || engRndBlank(); m.foxRnd[region] = Array.from({ length: 5 }, () => [0, 0]);
}
function simcSetRefine(m, region, refine, grade) {
  if (region >= 14) { m.shadowEquip.refined = m.shadowEquip.refined || []; m.shadowEquip.refined[region] = refine; return; }
  const rf = SIMC_REFINE[region], tr = SIMC_TRANS[region];
  if (rf) m[rf[0]][rf[1]] = refine;
  if (tr && grade !== undefined) m[tr[0]][tr[1]] = grade;
}
function simcEquipHtml(m, shadow) {
  const numSel = (attr, cur, max, label) => `<select ${attr}>${Array.from({ length: max + 1 }, (_, i) => `<option value="${i}" ${i === (cur || 0) ? "selected" : ""}>${label(i)}</option>`).join("")}</select>`;
  const rndHtml = (region, itemId, cur) => simcRndLists(itemId).map((lid, i) => {
    if (!lid) return "";
    const c = (cur || [])[i] || [0, 0], kinds = simcRndKinds(lid), vals = c[0] ? simcRndVals(c[0]) : [];
    return `<span class="eqrnd"><select data-rk="${region}:${i}">${kinds.map((o) => `<option value="${o.v}" ${o.v === c[0] ? "selected" : ""}>${esc(o.t)}</option>`).join("")}</select>`
      + (c[0] ? `<select data-rv="${region}:${i}">${vals.map((o) => `<option value="${o.v}" ${o.v === c[1] ? "selected" : ""}>${esc(o.t)}</option>`).join("")}</select>` : "") + `</span>`;
  }).join("");
  const row = (region, label) => {
    const sh = region >= 14, id = simcItemAt(m, region), none = simcIsNone(region, id), rf = SIMC_REFINE[region], tr = SIMC_TRANS[region];
    let h = `<tr><td class="muted">${label}</td><td><div class="eqrow"><span class="eqrf${sh ? " sh" : ""}">`;
    if (sh) h += numSel(`data-rf="${region}"`, ((m.shadowEquip || {}).refined || [])[region], 10, (i) => "+" + i);
    else { if (rf) h += numSel(`data-rf="${region}"`, (m[rf[0]] || {})[rf[1]], 10, (i) => "+" + i); if (tr) h += numSel(`data-tr="${region}"`, (m[tr[0]] || {})[tr[1]], 4, (i) => (i ? "★" + i : "-")); }
    h += `</span><button class="pk${none ? " none" : ""}" data-item="${region}">${none ? "（なし）" : esc(simcItemName(id))}</button>`;
    if (!none) {
      if (!sh) {
        const opts = simcCardOpts(region, id), cs = SIMC_CARD[region];
        h += opts.map((o, i) => { if (o.length < 2) return ""; const v = m.card[cs[i]] || 0, hit = o.find((x) => x.v === v); return `<button class="pk sm${v ? "" : " none"}" data-card="${region}:${i}">${esc(v ? (hit ? hit.t : simcCardName(v)) : (o[0] || {}).t || "なし")}</button>`; }).join("");
      } else {
        const en = SIMC_SHCARD[region].map((cr) => simcCardName(m.card[cr])).filter(Boolean);
        if (en.length) h += `<span class="muted">${en.map(esc).join(" ／ ")}</span>`;
      }
      h += rndHtml(region, id, sh ? ((m.shadowEquip || {}).rndOpt || [])[region] : (m.foxRnd || [])[region]);
    }
    return h + `</div></td></tr>`;
  };
  if (shadow) return `<table class="eqt">` + SIMC_SHADOW.map(([i, l]) => row(i, l)).join("") + `</table>`;
  let h = `<table class="eqt">` + SIMC_REGIONS.map(([i, l]) => row(i, l)).join("");
  if (!simcIsNone(1, (m.equip || [])[1])) h += `<tr><td class="muted">左手(武器)</td><td>${esc(simcItemName(m.equip[1]))} <span class="muted">（二刀流の左手は、まだここでは替えられません）</span></td></tr>`;
  return h + `</table>`;
}
// 装備欄の右上に並べる「装備セットのタブ」。通信で読んで登録された装備セット(A, B… / S1…)を押すと、いまのキャラに着せかえる
// 装備セットのタブに出すのは、手で登録したもの(記号つき)だけ。通信で読んだ組み合わせ(履歴)と、いまゲームで着ている装備は「ゲームの装備から」で選ぶ
// 装備セット・シャドウセットの色(記号の色)。大枠・表の行に使う。複数のときは、色を等分した斜めのしま(2色なら半分ずつ)
const simcGrad = (cs) => !cs.length ? "" : cs.length === 1 ? `linear-gradient(${cs[0]},${cs[0]})` : `linear-gradient(135deg, ${cs.map((c, i) => `${c} ${Math.round(i * 100 / cs.length)}% ${Math.round((i + 1) * 100 / cs.length)}%`).join(", ")})`;
const simcSetColor = (shadow, sid) => { const st = (((DATA.equip || {})[shadow ? "shadows" : "sets"]) || {})[sid]; return st && st.tag ? tagColor(st) : ""; };
// ---- 装備スロット(A・B…)は「箱」: 箱の中身が変わったら(上書き・ゲームの装備の登録など)、その箱を使っている全部のキャラスロットに自動で反映する(「反映」を押さなくてよい) ----
// 箱の中身は「装備セット(中身のハッシュの ID)」で、上書きすると記号(A)が新しい ID に移る → キャラスロットは ID の他に記号(foxSetTag / foxShadowTag)を覚えておいて、記号が指す最新の中身に追従する。
// 未保存の変更(＊)があるキャラスロットは、作業中の内容を守るため追従しない(装備欄に「更新されています」と出す。記号を押せば最新にできる)。ENG が使えるとき(装備を着せるのに必要)だけ
function simcBoxLatest(m, shadow) {      // [記号, 最新の中身の ID, その中身] / 追従する箱が無ければ null
  const sk = shadow ? "foxShadow" : "foxSet", T = (DATA.equip || {})[shadow ? "shadows" : "sets"] || {}, tag = m[sk + "Tag"]; if (!tag) return null;
  const hit = Object.entries(T).find(([, st]) => st.tag === tag); return hit ? [tag, hit[0], hit[1]] : null;
}
const simcPutSlot = (id) => { const c = (SIMC.chars || {})[id]; if (c) fetch("/api/simchars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name: c.name, model: c.model, saved: c.saved }) }); };
function simcFollowBoxes() {
  if (!ENG.ready || !SIMC.chars || !DATA.equip) return;
  for (const [id, c] of Object.entries(SIMC.chars)) try {      // 1つのスロットでエラーが出ても、ほかを巻き込まない
    const m = c.model, wasDirty = simcDirtySlot(c); let any = false;
    for (const shadow of [false, true]) {
      const sk = shadow ? "foxShadow" : "foxSet", T = (DATA.equip || {})[shadow ? "shadows" : "sets"] || {}, cur = m[sk];
      if (cur && T[cur] && T[cur].tag && m[sk + "Tag"] !== T[cur].tag) { m[sk + "Tag"] = T[cur].tag; any = true; }      // いまの箱の記号を覚える
      const L = simcBoxLatest(m, shadow); if (!L || L[1] === cur || simcDirty(m, shadow)) continue;
      try { if (L[2].sim) simcApplyFrag(m, L[2].sim, shadow); else simcWear(m, L[2].items || [], shadow); } catch (e) { console.warn("follow", e); continue; }
      m[sk] = L[1]; m[sk + "Sig"] = simcFragSig(m, shadow); any = true;
    }
    if (!any) continue;
    if (!wasDirty) c.saved = simcClone(m);                 // 追従は「変更」に数えない(＊を付けない)
    SIMC.res = null;
    if (id === SIMC.cur) simcSave(); else simcPutSlot(id);
  } catch (e) { console.warn("follow", id, e); reportJsError("箱の追従: " + e.message, e.stack); }
}
function simcSetList(m, shadow) {
  const EQ = DATA.equip || {}, T = EQ[shadow ? "shadows" : "sets"] || {}, cur = shadow ? m.foxShadow : m.foxSet;
  const all = Object.entries(T).map(([sid, st]) => ({ sid, st }));
  return { tabs: all.filter((x) => x.st.tag).sort((a, b) => String(a.st.tag).localeCompare(String(b.st.tag), "ja", { numeric: true })), rest: all.filter((x) => !x.st.tag).sort((a, b) => (b.st.last || 0) - (a.st.last || 0)), cur };
}
// 計算機の装備の「中身」(装備セットとして登録するとき・着せ直すときの形。番号はラトリオのもの)
function simcGearFrag(m, shadow) {
  if (shadow) {
    const sh = m.shadowEquip || {}, d = { itemId: {}, refined: {}, rndOpt: {}, card: {} };
    for (const [r] of SIMC_SHADOW) { d.itemId[r] = (sh.itemId || [])[r] || 0; d.refined[r] = (sh.refined || [])[r] || 0; d.rndOpt[r] = ((sh.rndOpt || [])[r] || []).map((x) => [x[0] || 0, x[1] || 0]); SIMC_SHCARD[r].forEach((cr) => { d.card[cr] = m.card[cr] || 0; }); }
    return d;
  }
  const d = { equip: (m.equip || []).slice(0, 11).map((v) => v || 0), card: {}, weapon: Object.assign({}, m.weapon), defPlus: Object.assign({}, m.defPlus), defTranscendence: Object.assign({}, m.defTranscendence),
    rnd: Array.from({ length: 11 }, (_, r) => Array.from({ length: 5 }, (_, i) => { const x = ((m.foxRnd || [])[r] || [])[i] || [0, 0]; return [x[0] || 0, x[1] || 0]; })) };
  Object.values(SIMC_CARD).flat().forEach((cr) => { d.card[cr] = m.card[cr] || 0; });
  return d;
}
function simcApplyFrag(m, d, shadow) {
  if (shadow) {
    const sh = m.shadowEquip; sh.itemId = sh.itemId || []; sh.refined = sh.refined || []; sh.rndOpt = sh.rndOpt || [];
    for (const [r] of SIMC_SHADOW) { sh.itemId[r] = (d.itemId || {})[r] || 0; sh.refined[r] = (d.refined || {})[r] || 0; sh.rndOpt[r] = Array.from({ length: 5 }, (_, i) => { const x = ((d.rndOpt || {})[r] || [])[i] || [0, 0]; return [x[0] || 0, x[1] || 0]; }); }
  } else {
    (d.equip || []).forEach((v, r) => { m.equip[r] = v || simcNoneId(r); });
    Object.assign(m.weapon, d.weapon || {}); Object.assign(m.defPlus, d.defPlus || {}); Object.assign(m.defTranscendence, d.defTranscendence || {});
    m.foxRnd = JSON.parse(JSON.stringify(d.rnd || engRndBlank()));
  }
  Object.entries(d.card || {}).forEach(([cr, v]) => { m.card[+cr] = v || 0; });
}
const simcFragSig = (m, shadow) => JSON.stringify(simcGearFrag(m, shadow));
function simcFragItems(m, shadow) {       // 装備セットタブに出す用の一覧(名前・精錬・カードの名前)
  const bitOf = Object.fromEntries((shadow ? SIMC_FOXSH : SIMC_FOXBITS).map(([b, r]) => [r, b])), out = [];
  for (const [r, label] of shadow ? SIMC_SHADOW : SIMC_REGIONS) {
    const id = simcItemAt(m, r); if (simcIsNone(r, id)) continue;
    const rf = SIMC_REFINE[r], tr = SIMC_TRANS[r], rnd = shadow ? ((m.shadowEquip.rndOpt || [])[r] || []) : ((m.foxRnd || [])[r] || []), lists = simcRndLists(id);
    out.push({ slot: label, wear: bitOf[r] || 0, name: simcItemName(id), refine: shadow ? ((m.shadowEquip.refined || [])[r] || 0) : rf ? ((m[rf[0]] || {})[rf[1]] || 0) : 0, grade: tr ? ((m[tr[0]] || {})[tr[1]] || 0) : 0,
      cards: (shadow ? SIMC_SHCARD[r] : SIMC_CARD[r]).map((cr) => simcCardName(m.card[cr])).filter(Boolean).map((name) => ({ name })),
      options: rnd.map((x, i) => { if (!x || !x[0]) return null; const k = lists[i] ? simcRndKinds(lists[i]).find((o) => o.v === x[0]) : null; return { text: (k ? k.t : "OP" + x[0]) + x[1] }; }).filter(Boolean) });
  }
  return out;
}
const simcDirty = (m, shadow) => { const sig = shadow ? m.foxShadowSig : m.foxSetSig; return !!sig && sig !== simcFragSig(m, shadow); };
function simcSetTabs(m, shadow) {         // 装備スロット: 記号を押すとメニュー(反映 = 計算機に入れる / 上書き = いまの計算機の装備を保存 / 名前 / 登録を外す)
  const L = simcSetList(m, shadow), dirty = simcDirty(m, shadow), sh = shadow ? 1 : 0, nc = lastChar(), E = (DATA.equip || {}).chars || {};
  const hasNow = nc && (E[nc].now || []).some((i) => (shadow ? i.wear >= 65536 : i.wear & 1023));
  const SL = simcBoxLatest(m, shadow), stale = SL && SL[1] !== L.cur && dirty ? `<span class="warn" title="未保存の変更があるので、自動では入れ替えていません。記号を押すと、最新の中身に切りかわります">「${esc(SL[0])}」の中身が更新されています</span> ` : "";
  return stale + `<span class="muted">${shadow ? "シャドウのスロット" : "装備スロット"}</span>`
    + L.tabs.map(({ sid, st }) => `<button class="settab${sid === L.cur ? " on" : ""}" data-slot="${esc(sid)}" data-sh="${sh}" style="--c:${tagColor(st)}" title="${esc(st.name || st.auto || "")}（押すと、このスロットの装備に切りかえます。右クリックで、上書き・名前の変更など）${sid === L.cur && dirty ? "\n＊ 反映したあとに、手で変えたところがあります" : ""}">${esc(st.tag)}${sid === L.cur && dirty ? "＊" : ""}</button>`).join("")
    + `<button class="settab more" data-simreg="${sh}" title="いまの計算機の${shadow ? "シャドウ装備" : "装備"}を、新しいスロットに保存します">＋新しいスロットに保存</button>`
    + `<button class="settab more" data-wearnow="${sh}" ${hasNow ? "" : "disabled"} title="${hasNow ? `${esc(charWho())}「${esc(cn(nc))}」が着ている${shadow ? "シャドウ装備" : "装備"}を、計算機に入れます` : "ゲームにログインして装備を読み込むと使えます"}">いま着ている装備を反映</button>`
    + `<button class="settab more" data-wearmore="${sh}" title="これまでに着たことのある組み合わせ（履歴）から選んで、計算機に入れます">保存した装備から ▾</button>`;
}
// ---- 支援・アイテム・スキル(数が多いので: 分類のタブ + 目的のしぼり込み + 検索 + 「オンのもの」) ----
const SIMC_BGROUPS = [["on", "オンのもの"], ["self", "自分のスキル"], ["learn", "習得スキル"], ["item", "アイテム・食品"], ["other", "他職の支援"], ["guild", "ギルド・その他"], ["debuff", "状態異常"]];
const SIMC_BPURPOSE = [["", "すべて"], ["a", "ASPD"], ["c", "詠唱・ディレイ"], ["f", "火力"], ["d", "耐久"], ["s", "ステータス"]];
const simcBuffKey = (it) => it.f + ":" + it.i;
const simcBuffVal = (m, it) => (m[it.f] || [])[it.i];
const simcBuffOn = (m, it) => { const v = simcBuffVal(m, it); return !!v && v !== "0"; };
const simcSchema = (m) => ENG.cache && ENG.cache["schema" + m.status.jobId];
function simcBuffSet(m, it, v) {
  m[it.f] = m[it.f] || [];
  m[it.f][it.i] = it.type === "c" ? (it.f.startsWith("conf") ? (v ? 1 : 0) : !!v) : (Number(v) || 0);
}
// ASPD ポーション(どれか1つ)。ラトリオの SpeedPotName(スピードアップ・ハイスピード・バーサーク)。ASPD が 10 / 15 / 20 % 増える。m.status.speedPot 0〜3 が唯一の持ち主(支援の一覧には無い)。ステータスシミュレーター・「支援・アイテム・スキル」・「ASPDに効く支援」で同じものを出す
const STP_POTS = ["なし", "スピードアップポーション（攻撃速度増加）", "ハイスピードポーション", "バーサークポーション"];
function simcPotHtml(m) {
  const otp = +((m.buff8 || [])[22]) || 0;
  return `<div class="settabs simpot" style="margin:4px 0"><span class="muted">ASPD ポーション（どれか1つ）${otp >= 2 ? `<span class="good">　ジョンダのサポート魔法がオンなので、使える最上位のポーションが自動で入ります（ここは大きいほうが採用）</span>` : ""}</span>${STP_POTS.map((t, i) => `<button class="settab${(m.status.speedPot || 0) === i ? " on" : ""}" data-stpot="${i}" title="${i ? ["", "ASPD +10%", "ASPD +15%（Lv40以上・使える職）", "ASPD +20%（Lv85以上・使える職）"][i] : "ポーションを使わない"}">${t}</button>`).join("")}</div>`;
}
function simcBuffSum(m) {                 // たたんだときに見出しへ出す: オンにしているもの
  const sc = simcSchema(m); if (!sc) return "";
  const on = sc.filter((it) => it.g !== "learn" && simcBuffOn(m, it));
  const pot = (m.status.speedPot || 0) ? STP_POTS[m.status.speedPot] : "";
  return on.length || pot ? `オン ${on.length + (pot ? 1 : 0)}個: ${on.map((it) => simcBuffLabel(it)).concat(pot ? [pot] : []).slice(0, 8).join("、")}${on.length + (pot ? 1 : 0) > 8 ? " ほか" : ""}` : "オンにしているものはありません";
}
const simcTagStoreKey = (m) => `md_simtags:${(RAT || {}).date || ""}:${m.status.jobId}`;
function simcTags(m) { try { return JSON.parse(store.get(simcTagStoreKey(m)) || "null"); } catch (e) { return null; } }
function simcBuffListHtml(m) {
  const potH = (SIMC.bf.tab === "item" || SIMC.bf.tab === "on" || SIMC.bf.purpose === "a") && !SIMC.bf.q ? simcPotHtml(m) : "";
  return potH + simcBuffListHtml0(m);
}
function simcBuffListHtml0(m) {
  const sc = simcSchema(m), B = SIMC.bf, tags = simcTags(m) || {}, q = pickNorm(B.q);
  let list = sc.filter((it) => (q ? true : B.tab === "on" ? simcBuffOn(m, it) && it.g !== "learn" : it.g === B.tab));
  if (q) list = list.filter((it) => pickNorm(it.label).includes(q) || (it.opts || []).some((o) => pickNorm(o[1]).includes(q)));
  if (!q && B.tab === "other" && B.sub) list = list.filter((it) => it.sub === B.sub);
  if (B.purpose) list = list.filter((it) => (tags[simcBuffKey(it)] || "").includes(B.purpose));
  if (B.onOnly && B.tab !== "on") list = list.filter((it) => simcBuffOn(m, it));
  if (!list.length) return `<div class="muted" style="padding:6px">${q ? "見つかりません。" : B.tab === "on" ? "オンにしているものはありません。上のタブから選んでオンにしてください。" : B.purpose && !Object.keys(tags).length ? "目的別のしぼり込みは、効果を調べ終わると使えます（下に進み具合が出ます）。" : "当てはまるものがありません。"}</div>`;
  const gname = Object.fromEntries(SIMC_BGROUPS);
  return `<div class="bfgrid">` + list.map((it) => {
    const k = simcBuffKey(it), v = simcBuffVal(m, it), on = simcBuffOn(m, it), pre = (q || B.tab === "on") ? `<span class="bfg">${gname[it.g]}${it.sub ? "・" + it.sub : ""}</span>` : (B.tab === "other" && !B.sub ? `<span class="bfg">${it.sub}</span>` : "");
    if (it.f === "buff8" && it.i === 22) return `<label class="bfi${on ? " on" : ""}" title="${esc(JONDA_TIP)}">${pre}<span class="bfl">${esc(simcBuffLabel(it))}</span><select data-bf="${k}">${it.opts.map((o) => `<option value="${o[0]}" ${o[0] === (Number(v) || 0) ? "selected" : ""}>${esc(o[0] === 0 ? "なし" : o[1])}</option>`).join("")}</select></label>`;
    if (it.type === "c") return `<label class="bfi${on ? " on" : ""}"><input type="checkbox" data-bf="${k}" ${on ? "checked" : ""}>${pre}<span class="bfl">${esc(simcBuffLabel(it))}</span></label>`;
    if (it.type === "n") return `<label class="bfi${on ? " on" : ""}">${pre}<span class="bfl">${esc(simcBuffLabel(it))}</span><input type="number" min="0" max="${it.max}" data-bf="${k}" value="${Number(v) || 0}"></label>`;
    return `<label class="bfi${on ? " on" : ""}">${pre}<span class="bfl">${esc(simcBuffLabel(it))}</span><select data-bf="${k}">${it.opts.map((o) => `<option value="${o[0]}" ${o[0] === (Number(v) || 0) ? "selected" : ""}>${esc(o[0] === 0 && o[1].replace(/\s*なし$/, "").replace(/^■/, "") === it.label ? "なし" : o[1])}</option>`).join("")}</select></label>`;
  }).join("") + `</div>`;
}
// よく使う支援: 濃縮サラマインジュース(ASPD)・ブレッシング・速度増加。「ASPD・詠唱・ディレイに効く支援」の一覧で先頭に出す(画面の上の専用の枠は、利用者の指示で削除)
const SIMC_QUICK = [["buff8", 22], ["buff7", 22], ["confIchizi", 0], ["confIchizi", 1]];
// ジョンダのサポート魔法 = ラトリオの「OTP ログインボーナス」のレインボー(ラトリオの説明: 「ジョンダパスはOTPレインボー」)。経験値+5%・最上位のASPDポーション・HIT+10/FLEE+10・MaxHP/SP+20% が入る(公式: 重複しない・戦闘不能で解除)。ゲームの表示と照合で、HP・SP・HIT・FLEE が完全に一致することを確認ずみ
const JONDA_TIP = "ジョンダのサポート魔法（ラトリオでは『OTP ログインボーナス』のレインボー）: 経験値+5%・攻撃速度ポーション（職業・BaseLv で使える最上位）・HIT+10/FLEE+10・MaxHP+20%/MaxSP+20%。移動速度増加は計算に関係しません";
const simcBuffLabel = (it) => (it.f === "buff8" && it.i === 22 ? "ジョンダのサポート魔法" : it.label);
function simcBuffHtml(m) {
  const sc = simcSchema(m);
  if (!sc) { simcSchemaKick(m); return `<div class="muted" style="padding:6px">${SIMC.bfErr ? esc(SIMC.bfErr) : "支援・アイテム・スキルの一覧を読み込んでいます…"}</div>`; }
  const B = SIMC.bf, nOn = sc.filter((it) => it.g !== "learn" && simcBuffOn(m, it)).length;
  const chip = (attr, v, t, on) => `<button class="settab${on ? " on" : ""}" ${attr}="${v}">${t}</button>`;
  return `<div class="bfbar"><div class="settabs">${SIMC_BGROUPS.map(([k, t]) => chip("data-bft", k, t + (k === "on" ? `（${nOn}）` : ""), !B.q && B.tab === k)).join("")}</div>
      <input type="text" id="sccbq" placeholder="名前で探す（全部の分類から）" value="${esc(B.q)}"></div>
    <div class="bfbar"><div class="settabs"><span class="muted">目的</span>${SIMC_BPURPOSE.map(([k, t]) => chip("data-bfp", k, t, B.purpose === k)).join("")}</div>
      ${B.tab === "other" && !B.q ? `<div class="settabs"><span class="muted">職</span>${[["", "すべて"], ["一次職", "一次"], ["二次職", "二次"], ["三次職", "三次"], ["四次職", "四次"]].map(([k, t]) => chip("data-bfs", k, t, B.sub === k)).join("")}</div>` : ""}
      ${B.tab !== "on" ? `<label class="muted"><input type="checkbox" id="sccbon" ${B.onOnly ? "checked" : ""}> オンのものだけ</label>` : ""}</div>
    ${simcPresetBar(m)}<div id="sccbuffs">${simcBuffListHtml(m)}</div><div class="muted" id="sccbprog" style="font-size:12px"></div>`;
}
// よく使うオンオフの組み合わせ(SETTINGS.simPresets = [{name, job, on: {"欄:添字": 値}}])。習得スキルは入れない。
// 自分のスキル(固有自己支援)は職業ごとに中身が違うので、同じ職業のときだけ当てる
const simcBuffItems = (m) => (simcSchema(m) || []).filter((it) => it.g !== "learn");
function simcOnMap(m) { const out = {}; simcBuffItems(m).forEach((it) => { if (simcBuffOn(m, it)) out[simcBuffKey(it)] = simcBuffVal(m, it); }); return out; }
function simcPresetApply(m, p, only) {
  const list = simcBuffItems(m);
  if (only) list.forEach((it) => simcBuffSet(m, it, 0));
  list.forEach((it) => { const v = (p.on || {})[simcBuffKey(it)]; if (v !== undefined && (it.f !== "passiveSkill" || String(p.job) === String(m.status.jobId))) simcBuffSet(m, it, v === true ? 1 : v); });
}
function simcPresetBar(m) {
  const P = SETTINGS.simPresets || [];
  return `<div class="bfbar"><div class="settabs"><span class="muted">よく使う組み合わせ</span>${P.map((x, i) => `<button class="settab" data-bpre="${i}" title="押すと、この組み合わせをオンにします（いまのオンに足します）。右クリックで「これだけにする」・上書き・名前の変更・消す\n${esc(Object.keys(x.on || {}).length + "個")}">${esc(x.name)}</button>`).join("")}
    <button class="settab more" id="sccbsave" title="いまオンにしているものを、名前を付けて保存します">＋いまのオンを保存</button><button class="settab more" id="sccboff">全部オフ</button></div></div>`;
}
// 被ダメタブの「検証」: その攻撃を選んだ状態で、計算機の「被ダメの検証」の枠を開く
function simcGoDmg(char, md, src, skill, base) {
  Object.assign(SIM, { char, md, key: src + "|" + skill, manual: false, base: base || "", eleOv: "", sets: null });
  TAB = "sim"; store.set("md_tab", TAB); SIMV = "dmg"; store.set("md_simv", SIMV); render();     // 被ダメシミュ(サブタブ)を、その攻撃を選んだ状態で開く
}
document.addEventListener("click", (e) => {       // 維持の表の「選ぶ」: 入らなかった装備・カードを、ラトリオの候補に結びつける(次からは自動)
  const b = e.target.closest && e.target.closest("[data-kfix]"); if (!b) return;
  const [ri, j] = b.dataset.kfix.split(":").map(Number), x = (((SIMC.keepView || [])[ri] || {}).missRows || [])[j], c = simcCur(); if (!x || !c) return;
  const mm = x.mm || c.model;
  const opts = x.isCard ? (() => { const seen = new Set(); return simcCardOpts(x.region, mm.equip[x.region]).flat().filter((o) => o.v && !seen.has(o.v) && seen.add(o.v)); })() : simcItemOpts(mm.status.jobId, x.region, true).filter((o) => o.v !== simcNoneId(x.region));
  pickOpen(b, opts, null, (v, o) => { SETTINGS.ratLinks = SETTINGS.ratLinks || {}; SETTINGS.ratLinks[x.gameId] = o.n || o.t; saveSettings(); if (SIMC.stp) { SIMC.stp.patSig = ""; SIMC.stp.rowSig = ""; SIMC.stp.sugSig = ""; SIMC.stp.effSig = ""; } SIMC.cmpRes = null; render(); });
});
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-simgo]"); if (b) { try { simcGoDmg(...JSON.parse(b.dataset.simgo)); } catch (err) { console.warn(err); } } });
function simcSchemaKick(m) {
  if (SIMC.bfBusy || SIMC.busy || SIMC.bfErr || !ENG.ready) return;
  SIMC.bfBusy = true; SIMC.bfErr = "";
  engSchema(m.status.jobId).catch((e) => { SIMC.bfErr = "一覧を読み込めませんでした: " + e.message; }).finally(() => { SIMC.bfBusy = false; render(); });
}
// 目的別のしぼり込み用に、1つずつオンにして計算し、何が変わるかで分ける(a ASPD / c 詠唱・ディレイ / f 火力 / d 耐久 / s ステータス)。
// 職業ごとに1回(結果は覚えておく)。ASPD が上限 193 に張りつくと差が出ないので、AGI・DEX を 1 にした写しで調べる
async function simcTagKick(m) {
  const sc = simcSchema(m); if (!sc || SIMC.tagBusy || simcTags(m)) return;
  SIMC.tagBusy = true;
  const job = m.status.jobId, base = JSON.parse(JSON.stringify(m)); base.status.agi = 1; base.status.dex = 1;
  const pick = (r) => ({ a: [r.c[37]], c: [r.core.n_CastCutForDisp, r.c[41], r.core.delayDownForDisp], f: [r.c[25], r.c[26], r.c[27], r.c[28], r.c[33], r.c[35]], d: [r.c[23], r.c[29], r.c[30], r.c[31], r.c[32], r.c[34], r.c[36]], s: Object.values(r.tot) });
  const specD = (sp) => JSON.stringify([sp.slice(50, 70), sp.slice(77, 80), sp.slice(190, 193), sp[264]]);
  const out = {};
  try {
    const r0 = engCalc(base), p0 = pick(r0), s0 = JSON.stringify(r0.spec), d0 = specD(r0.spec);
    for (let n = 0; n < sc.length; n++) {
      const it = sc[n], t = JSON.parse(JSON.stringify(base)), on = simcBuffOn(base, it);
      simcBuffSet(t, it, on ? 0 : it.type === "c" ? 1 : it.type === "n" ? Math.min(it.max, 10) : it.opts[it.opts.length - 1][0]);
      let tag = "";
      try {
        const r = engCalc(t), p = pick(r);
        for (const k of "acfds") if (JSON.stringify(p[k]) !== JSON.stringify(p0[k])) tag += k;
        if (/s/.test(tag) && !/c/.test(tag) && (r.tot.DEX !== r0.tot.DEX || r.tot.INT !== r0.tot.INT)) tag += "c";
        const sj = JSON.stringify(r.spec);
        if (sj !== s0) { if (specD(r.spec) !== d0) { if (!tag.includes("d")) tag += "d"; } else if (!tag) tag = "f"; }
      } catch (e) { }
      out[simcBuffKey(it)] = tag;
      if (n % 8 === 7) {
        await sleep(0);
        const cur = simcCur(); if (!cur || String(cur.model.status.jobId) !== String(job)) throw new Error("changed");
        const el = $("#sccbprog"); if (el) el.textContent = `目的別のしぼり込み用に、効果を調べています… ${n + 1} / ${sc.length}`;
      }
    }
    store.set(simcTagStoreKey(m), JSON.stringify(out));
  } catch (e) { }
  SIMC.tagBusy = false;
  const el = $("#sccbprog"); if (el) el.textContent = "";
  render();
}
