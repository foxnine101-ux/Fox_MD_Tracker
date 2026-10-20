"use strict";
// ---------- 計算機: 被ダメの検証 ----------
// 「あのときの攻撃は、この装備なら耐えられたか」。実際に受けたダメージと、そのときの装備から逆算する:
//   軽減前のダメージ = (受けたダメージ + 引かれる分) ÷ そのときの軽減   →   別の装備の軽減をかけ直す
// 軽減に入れるもの: 鎧の属性の相性・属性耐性・種族・ボス/一般・サイズ・遠距離/魔法・DEF/MDEF・RES/MRES・補助
// (データはラトリオ = jRO 準拠。セット効果・ランダムオプションの一部・条件つきの効果は入らないので目安)
const SIM = { char: "", md: "", key: "", base: "", manual: false, dmg: 0, kind: "魔法", ele: "無", race: "", size: "", boss: "", sets: null, shadow: "",
  buffB: { ec: 0, cut: 0, extra: 0 }, buffT: { ec: 0, cut: 0, extra: 0 }, hp: 0, eleOv: "" };
const SIM_RACES = ["無形", "不死", "動物", "植物", "昆虫", "魚貝", "悪魔", "人間", "天使", "竜"], SIM_ELES = ["無", "水", "地", "火", "風", "毒", "聖", "闇", "念", "不死"];
const SIM_CUTS = [[0, "なし"], [20, "20%カット"], [40, "40%カット（アンチマジックなど）"], [60, "60%カット（うずくまる）"], [80, "80%カット（金剛）"], [90, "90%カット"]];
const first = (v) => String(v ?? "").split("/")[0];
function simProfile(mainId, shadowId) {        // 装備セット + シャドウセットの軽減を足したもの
  const EQ = DATA.equip || {}, m = ((EQ.sets || {})[mainId] || {}).prof || {}, sh = ((EQ.shadows || {})[shadowId] || {}).prof || {};
  const add = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v; return o; };
  return { armor: m.armor || "無", res: add(m.res, sh.res), x: add(m.x, sh.x) };
}
function simStatus(c, mainId) {                // そのキャラがその装備セットを着ていたときのステータス(無ければいまの)
  const EQ = DATA.equip || {}, st = ((((EQ.sets || {})[mainId] || {}).chars || {})[c] || {}).status;
  return (st && st.derived && Object.keys(st.derived).length ? st : ((EQ.chars || {})[c] || {}).status) || {};
}
// 軽減の段階: [名前, かける倍率, 説明]。sub = 最後に引かれる分(ステータスの DEF/MDEF)
function simStages(atk, prof, st, buff) {
  const d0 = (st && st.derived) || {}, out = [], d = {};
  for (const k of ["DEF", "DEF2", "MDEF", "MDEF2", "RES", "MRES"]) d[k] = d0[k] > 0 && d0[k] < 30000 ? d0[k] : 0;    // 壊れた値(マイナス・大きすぎ)は 0 として扱う
  const pct = (v) => Math.max(0, 1 - (v || 0) / 100);
  const phys = atk.kind.startsWith("物理"), magic = atk.kind === "魔法", fixed = atk.kind === "固定";
  let sub = 0;
  if (!fixed) {
    const tbl = (((DATA.calc || {}).ele || {})[prof.armor] || {})[atk.ele];
    out.push([`鎧の属性（${prof.armor}鎧に${atk.ele}）`, (tbl ?? 100) / 100, `${tbl ?? 100}%`]);
    const r = Math.min(prof.res[atk.ele] || 0, 95);
    out.push([`${atk.ele}属性の耐性`, pct(r), `${prof.res[atk.ele] || 0}%${(prof.res[atk.ele] || 0) > 95 ? "（上限95%）" : ""}`]);
    if (atk.race) out.push([`${atk.race}形からの耐性`, pct(prof.x["種族:" + atk.race]), `${prof.x["種族:" + atk.race] || 0}%`]);
    if (atk.boss !== "") { const k = atk.boss ? "ボス" : "一般"; out.push([`${k}モンスターからの耐性`, pct(prof.x[k]), `${prof.x[k] || 0}%`]); }
    if (atk.size) out.push([`${atk.size}型からの耐性`, pct(prof.x["サイズ:" + atk.size]), `${prof.x["サイズ:" + atk.size] || 0}%`]);
    if (atk.kind === "物理・遠距離") out.push(["遠距離物理の耐性", pct(prof.x["遠距離"]), `${prof.x["遠距離"] || 0}%`]);
    if (magic) out.push(["魔法の耐性", pct(prof.x["魔法"]), `${prof.x["魔法"] || 0}%`]);
    if (phys) {
      const hard = d.DEF2 || 0, res = d.RES || 0;
      out.push([`DEF（装備 ${hard}）`, (4000 + hard) / (4000 + hard * 10), ""]);
      out.push([`RES（${res}）`, (2000 + res) / (2000 + res * 5), ""]);
      sub = d.DEF || 0;
    } else if (magic) {
      const hard = d.MDEF2 || 0, res = d.MRES || 0;
      out.push([`MDEF（装備 ${hard}）`, (1000 + hard) / (1000 + hard * 10), ""]);
      out.push([`MRES（${res}）`, (2000 + res) / (2000 + res * 5), ""]);
      sub = d.MDEF || 0;
    }
  }
  if (buff.ec) out.push(["エナジーコート", pct(buff.ec), `${buff.ec}%`]);
  if (buff.cut) out.push(["ダメージ減少スキル", pct(buff.cut), `${buff.cut}%`]);
  if (buff.extra) out.push(["そのほかの軽減", pct(buff.extra), `${buff.extra}%`]);
  return { list: out, mult: out.reduce((a, x) => a * x[1], 1), sub };
}
function renderSimDmg(chars) {
  const EQ = DATA.equip || {}, E = EQ.chars || {}, S = EQ.sets || {}, SH = EQ.shadows || {};
  const names = chars.filter((c) => E[c] || Object.keys((DATA.chars[c] || {}).dmg || {}).length);
  if (!names.length || !Object.keys(S).length) {
    $("#view").innerHTML = simNav() + `<div class="panel empty">被ダメシミュには、装備セットの記録が要ります。<br>メイン装備10か所をつけてログインすると装備セットが記録され、ここで「あの攻撃は別の装備なら耐えられたか」を試せます。</div>`;
    return;
  }
  if (!names.includes(SIM.char)) SIM.char = names.find((c) => Object.keys((DATA.chars[c] || {}).dmg || {}).length) || names[0];
  const c = SIM.char, dmg = (DATA.chars[c] || {}).dmg || {}, dmgG = (DATA.chars[c] || {}).dmg_g || {};
  const mds = Object.keys(dmg);
  if (!mds.length) SIM.manual = true;
  if (!SIM.manual && !dmg[SIM.md]) SIM.md = mds.sort((a, b) => Math.max(...Object.values(dmg[b]).map((v) => v[3])) - Math.max(...Object.values(dmg[a]).map((v) => v[3])))[0];
  const rows = SIM.manual ? [] : Object.entries(dmg[SIM.md] || {}).filter(([k]) => kindOf(k.split("|")[1])[1] !== "属性なし").sort((a, b) => b[1][2] - a[1][2]);
  if (!SIM.manual && !rows.some(([k]) => k === SIM.key)) SIM.key = rows.length ? rows[0][0] : "";
  // 攻撃の中身
  let atk, baseDmg, baseOpts = [];
  if (SIM.manual) {
    atk = { who: "（手で入力）", skill: "", kind: SIM.kind, ele: SIM.ele, race: SIM.race, size: SIM.size, boss: SIM.boss === "" ? "" : SIM.boss === "1" };
    baseDmg = +SIM.dmg || 0;
  } else {
    const [who, skill] = SIM.key.split("|"), row = (dmg[SIM.md] || {})[SIM.key] || [0, 0, 0];
    const [kd, el] = rowKind(skill, row), mob = (DATA.dmg_mobs || {})[who];
    // 属性: 実際に受けたときの記録(最近受けた攻撃)にあればそれ。無ければ技の表(Lv で変わる技は先頭)。手で選び直せる
    const seen = [...(DATA.dmg_recent || [])].reverse().find((r) => r.src === who && r.skill === skill && r.md === SIM.md && r.ele && !r.ele.includes("/"));
    const autoEle = (seen && seen.ele) || first(el) || "無";
    SIM.autoEle = autoEle;
    atk = { who, skill, kind: kd === "物理・近/遠" || kd === "物理" ? "物理・近接" : kd || "魔法", ele: SIM.eleOv || autoEle,
      race: mob ? first(mob.race) : "", size: mob ? first(mob.size) : "", boss: mob ? first(mob.boss) === "1" : "" };
    // 受けたときの装備: その攻撃を受けた記録がある装備(最大ダメージつき)
    baseOpts = Object.entries(dmgG[SIM.md] || {}).filter(([id, g]) => g[SIM.key] && S[gearMain(id)]).map(([id, g]) => [id, g[SIM.key][2]]).sort((a, b) => b[1] - a[1]);
    if (!baseOpts.some(([id]) => id === SIM.base) && !(SIM.base && S[gearMain(SIM.base)] && !baseOpts.length)) SIM.base = baseOpts.length ? baseOpts[0][0] : (E[c] && E[c].cur ? E[c].cur + (E[c].shadow ? "+" + E[c].shadow : "") : Object.keys(S)[0]);
    baseDmg = (baseOpts.find(([id]) => id === SIM.base) || [0, row[2]])[1];
  }
  if (SIM.manual && !S[gearMain(SIM.base)]) SIM.base = E[c] && E[c].cur ? E[c].cur + (E[c].shadow ? "+" + E[c].shadow : "") : Object.keys(S)[0];
  const baseMain = gearMain(SIM.base), baseSh = gearShadow(SIM.base);
  if (!SIM.sets) SIM.sets = new Set(Object.keys(S).filter((id) => (S[id].chars || {})[c]));
  const cmp = Object.keys(S).filter((id) => SIM.sets.has(id) && id !== baseMain).sort((a, b) => (S[a].first || 0) - (S[b].first || 0));
  const shFor = SIM.shadow && SH[SIM.shadow] ? SIM.shadow : baseSh;
  // 逆算
  const B = simStages(atk, simProfile(baseMain, baseSh), simStatus(c, baseMain), SIM.buffB);
  const raw = B.mult > 0 ? (baseDmg + B.sub) / B.mult : 0;
  const cols = [[baseMain, baseSh, B, baseDmg, true]].concat(cmp.map((id) => { const T = simStages(atk, simProfile(id, shFor), simStatus(c, id), SIM.buffT); return [id, shFor, T, Math.max(0, Math.round(raw * T.mult - T.sub)), false]; }));
  const hpOf = (id) => +SIM.hp || (simStatus(c, id).derived || {}).MaxHP || 0;
  const selOpt = (arr, cur) => arr.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("");
  const buffRow = (id, b, label) => `<div class="opts"><span class="muted" style="min-width:9.5em">${label}</span>
      <label>エナジーコート <select data-buff="${id}.ec">${selOpt([[0, "なし"], [6, "6%"], [12, "12%"], [18, "18%"], [24, "24%"], [30, "30%"]], b.ec)}</select></label>
      <label>ダメージ減少スキル <select data-buff="${id}.cut">${selOpt(SIM_CUTS, b.cut)}</select></label>
      <label>そのほかの軽減 <input type="number" min="0" max="100" data-buff="${id}.extra" value="${b.extra || ""}" placeholder="0"> %</label></div>`;
  const setLabel = (id, sh) => `${S[id] ? tagChip(S[id]) : ""}${sh && SH[sh] ? tagChip(SH[sh]) : ""}`;
  let h = simNav() + `<div class="panel simbox"><div class="opts"><b>1. 攻撃を選ぶ</b>
      <label>キャラ <select id="simc">${selOpt(names.map((x) => [x, cn(x)]), c)}</select></label>
      <label><input type="checkbox" id="simman" ${SIM.manual ? "checked" : ""} ${mds.length ? "" : "disabled"}> 手で入れる</label></div>`;
  if (SIM.manual) {
    h += `<div class="opts"><label>受けたダメージ <input type="number" id="simdmg" min="0" value="${SIM.dmg || ""}" placeholder="例 250000"></label>
      <label>種類 <select id="simkind">${selOpt(["物理・近接", "物理・遠距離", "魔法", "固定"].map((x) => [x, x]), SIM.kind)}</select></label>
      <label>属性 <select id="simele">${selOpt(SIM_ELES.map((x) => [x, x]), SIM.ele)}</select></label>
      <label>相手の種族 <select id="simrace">${selOpt([["", "わからない"]].concat(SIM_RACES.map((x) => [x, x])), SIM.race)}</select></label>
      <label>サイズ <select id="simsize">${selOpt([["", "わからない"], ["小", "小"], ["中", "中"], ["大", "大"]], SIM.size)}</select></label>
      <label>ボス <select id="simboss">${selOpt([["", "わからない"], ["1", "ボス"], ["0", "一般"]], SIM.boss)}</select></label></div>`;
  } else {
    h += `<div class="opts"><label>場所 <select id="simmd">${selOpt(mds.map((x) => [x, x]), SIM.md)}</select></label>
      <label>攻撃 <select id="simkey" style="max-width:420px">${selOpt(rows.map(([k, v]) => [k, `${k.split("|")[0]} の ${k.split("|")[1]}（最大 ${fmtN(v[2])}・${v[0]}回）`]), SIM.key)}</select></label></div>
      <div class="opts"><span class="muted">${esc(atk.who)} ${mobTag(atk.who)}　${kindTag(atk.kind)} ${eleTag(atk.ele)}</span>
        <label>属性 <select id="simeleov">${selOpt([["", `自動（${SIM.autoEle}）`]].concat(SIM_ELES.map((x) => [x, x])), SIM.eleOv)}</select></label></div>`;
  }
  h += `</div><div class="panel simbox"><div class="opts"><b>2. 受けたときの装備</b>
      <label><select id="simbase">${baseOpts.length
        ? selOpt(baseOpts.map(([id, mx]) => [id, `${(S[gearMain(id)] || {}).tag || "?"}${shadowTagOf(id) ? "・" + shadowTagOf(id) : ""}: ${equipSetName(id)}（このときの最大 ${fmtN(mx)}）`]), SIM.base)
        : selOpt(Object.entries(S).map(([id, st]) => [id + (baseSh && gearMain(SIM.base) === id ? "+" + baseSh : ""), `${setLabel(st)}: ${st.name || st.auto}`]), SIM.base)}</select></label>
      ${!SIM.manual && !baseOpts.length ? `<span class="muted">この攻撃を受けたときの装備の記録が無いので、着ていた装備を選んでください</span>` : ""}</div>
    ${buffRow("B", SIM.buffB, "そのときの補助")}</div>
    <div class="panel simbox"><div class="opts"><b>3. 比べる装備セット</b>
      ${Object.entries(S).filter(([id]) => id !== baseMain).sort((a, b) => (a[1].first || 0) - (b[1].first || 0)).map(([id, st]) => `<label class="simset"><input type="checkbox" data-simset="${esc(id)}" ${SIM.sets.has(id) ? "checked" : ""}>${tagChip(st)} ${esc(st.name || st.auto)}</label>`).join("") || `<span class="muted">ほかの装備セットがまだありません</span>`}</div>
      <div class="opts"><label>シャドウ <select id="simsh">${selOpt([["", "受けたときと同じ"]].concat(Object.entries(SH).map(([id, st]) => [id, `${setLabel(st)}: ${st.name || st.auto}`])), SIM.shadow)}</select></label>
      <label>最大HP <input type="number" id="simhp" min="0" value="${SIM.hp || ""}" placeholder="${hpOf(baseMain) || "自動"}"></label><span class="muted">（空欄 = その装備を着ていたときの最大HP）</span></div>
    ${buffRow("T", SIM.buffT, "比べる側の補助")}</div>`;
  // 結果
  const stageNames = [...new Set(cols.flatMap(([, , T]) => T.list.map((x) => x[0].replace(/（.*）$/, ""))))];
  const cell = (T, name) => { const x = T.list.find((y) => y[0].replace(/（.*）$/, "") === name); return x ? `×${(Math.round(x[1] * 1000) / 1000).toFixed(3)}${x[2] ? ` <span class="muted">${esc(x[2])}</span>` : ""}${/（/.test(x[0]) ? ` <span class="muted">${esc(x[0].match(/（(.*)）$/)[1])}</span>` : ""}` : "-"; };
  h += `<h2>結果</h2><div class="panel tablewrap"><table class="sim-t"><thead><tr><th></th>${cols.map(([id, sh, , , base]) => `<th class="${base ? "base" : ""}">${setLabel(id, sh)}${base ? `<br><span class="muted">受けたとき</span>` : ""}</th>`).join("")}</tr></thead><tbody>`
    + stageNames.map((n) => `<tr><td>${esc(n)}</td>${cols.map(([, , T, , base]) => `<td class="${base ? "base" : ""}">${cell(T, n)}</td>`).join("")}</tr>`).join("")
    + `<tr><td>引かれる分（ステータスの DEF/MDEF）</td>${cols.map(([, , T, , base]) => `<td class="${base ? "base" : ""}">${T.sub ? "−" + fmtN(T.sub) : "-"}</td>`).join("")}</tr>
      <tr class="big"><td>ダメージ</td>${cols.map(([, , , d, base]) => `<td class="${base ? "base" : ""}">${fmtN(d)}${base ? "" : ` <span class="muted" style="font-size:12px">${baseDmg ? (d <= baseDmg ? "−" : "+") + Math.abs(Math.round((d - baseDmg) * 100 / baseDmg)) + "%" : ""}</span>`}</td>`).join("")}</tr>
      <tr><td>最大HP</td>${cols.map(([id, , , , base]) => `<td class="${base ? "base" : ""}">${hpOf(id) ? fmtN(hpOf(id)) : "-"}</td>`).join("")}</tr>
      <tr class="big"><td>判定</td>${cols.map(([id, , , d, base]) => { const hp = hpOf(id); return `<td class="${base ? "base" : ""}">${!hp ? "-" : d < hp ? `<span class="sim-ok">耐える</span> <span class="muted" style="font-size:12px">残り ${fmtN(hp - d)}</span>` : `<span class="sim-ng">倒れる</span> <span class="muted" style="font-size:12px">あと ${fmtN(d - hp + 1)}</span>`}</td>`; }).join("")}</tr>
    </tbody></table></div>
    <p class="hint">受けたダメージ（${fmtN(baseDmg)}）と、そのときの装備の軽減から、軽減前のダメージ（約 ${fmtN(Math.round(raw))}）を逆算して、ほかの装備の軽減をかけ直しています。表の「×0.250」などは、その段階で残る割合です。耐性のデータは ROラトリオHub（jRO 準拠）から。<b>目安です</b>：セット効果・ランダムオプションの一部・条件つきの効果（精錬以外）・支援や料理は入っていません。DEF/MDEF・RES/MRES・最大HP は、その装備を最後に着ていたときの値です。判定は1回の攻撃（1ヒットぶんの合計）で見ています。属性耐性は上限95%で計算します。</p>`;
  $("#view").innerHTML = h;
  bindSimNav();
  const on = (id, fn) => { const el = $("#" + id); if (el) el.onchange = (e) => { fn(e.target); render(); }; };
  on("simc", (t) => { SIM.char = t.value; SIM.sets = null; SIM.base = ""; SIM.key = ""; SIM.md = ""; });
  on("simman", (t) => { SIM.manual = t.checked; SIM.base = ""; });
  on("simmd", (t) => { SIM.md = t.value; SIM.key = ""; SIM.base = ""; SIM.eleOv = ""; });
  on("simkey", (t) => { SIM.key = t.value; SIM.base = ""; SIM.eleOv = ""; });
  on("simeleov", (t) => { SIM.eleOv = t.value; });
  on("simbase", (t) => { SIM.base = t.value; });
  on("simsh", (t) => { SIM.shadow = t.value; });
  on("simhp", (t) => { SIM.hp = +t.value || 0; });
  on("simdmg", (t) => { SIM.dmg = +t.value || 0; });
  on("simkind", (t) => { SIM.kind = t.value; }); on("simele", (t) => { SIM.ele = t.value; });
  on("simrace", (t) => { SIM.race = t.value; }); on("simsize", (t) => { SIM.size = t.value; }); on("simboss", (t) => { SIM.boss = t.value; });
  $("#view").querySelectorAll("[data-simset]").forEach((el) => el.onchange = () => { el.checked ? SIM.sets.add(el.dataset.simset) : SIM.sets.delete(el.dataset.simset); render(); });
  $("#view").querySelectorAll("[data-buff]").forEach((el) => el.onchange = () => { const [w, k] = el.dataset.buff.split("."); (w === "B" ? SIM.buffB : SIM.buffT)[k] = Math.min(100, Math.max(0, +el.value || 0)); render(); });
}
