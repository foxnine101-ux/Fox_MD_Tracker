"use strict";
// ---- サンドバックマン(ゲームのお試し道場のモンスター) ----
// ラトリオの「手入力モンスター」(ID 929)を、サンドバッグマンの固定の強さ(Lv1・HP 10億・DEF 600・MDEF 100)にして、メインスキルのダメージを計算する。
//   種類(一般/BOSS)・種族・属性・属性Lv・サイズは自由。草・プレイヤーの種類は扱わない。RES・MRES はゲームの画面に出ないので 0 とする。
//   計算の間だけ「手入力モンスターが選ばれている」ことにして、終わったら元に戻す(キャラの計算に影響を残さない)
const SB_FIXED = { lv: 1, hp: 1000000000, def: 600, mdef: 100 };
const SB_KINDS = ["一般", "BOSS"], SB_RACES = ["無形", "不死", "動物", "植物", "昆虫", "魚貝", "悪魔", "人間", "天使", "竜族"], SB_ELES = ["無", "水", "地", "火", "風", "毒", "聖", "闇", "念", "不死"], SB_SIZES = ["小", "中", "大"];
const SB_DEFAULT = { kind: 1, race: 0, ele: 0, lv: 2, size: 1, full: "", vals: [] };      // 初期値はゲームの画面の例(BOSS・無形・無2・中)
const SB_MOB_KEYS = ["LV", "HP", "STR", "INT", "VIT", "DEX", "AGI", "LUK", "ATK", "MATK", "RANGE", "DEF", "MDEF", "BASE_EXP", "JOB_EXP", "SIZE", "ELEMENT", "RACE", "BOSS_TYPE", "GRASS_TYPE", "RES", "MRES"];
function simcSbCfg(m) { m.foxSb = Object.assign({}, SB_DEFAULT, m.foxSb || {}); if (!Array.isArray(m.foxSb.vals)) m.foxSb.vals = []; return m.foxSb; }
async function engSbInit() {
  if (ENG.sb) return ENG.sb;
  const w = ENG.frame.contentWindow, imp = (p) => w.eval(`import("${engBase()}engine/${p}")`);
  ENG.sb = { CM: (await imp("monster/CMonsterMapAreaComponentManager.js")).CMonsterMapAreaComponentManager, MC: await imp("monster/CMobConfInput.js"), EN: await imp("const/EnumMobConfId.js"),
    mon: (await imp("monster/monster.dat.js")).MONSTER_ID_MONSTER_TENYURYOKU, AM: (await imp("battle/CAttackMethodAreaComponentManager.js")).CAttackMethodAreaComponentManager,
    G: await imp("runtime/global.js"), kJob: (await imp("const/EnumConstDataKind.js")).CONST_DATA_KIND_JOB, sereId: (await imp("skill/skill.dat.js")).SKILL_ID_SERE };
  return ENG.sb;
}
// そのキャラが使える攻撃方法(メインスキルの候補)。職業・装備ごとにラトリオが決める。各方法は「レベル → ほかの設定…」の選択の鎖(tree)を持つ
function engAttackMethods(model) {
  const S = ENG.sb, key = "atkm:" + JSON.stringify([model.status.jobId, model.equip, model.card, (model.weapon || {}).type, model.learnedSkill, (model.shadowEquip || {}).itemId]);
  if (ENG.cache[key]) return ENG.cache[key];
  engCalc(model);                                         // 計算係の中の職業・装備を model に合わせる(攻撃方法の一覧は、そのときの状態から作られる)
  const lst = (ol) => {
    if (!ol) return null;
    const o = { label: ol.GetLabel(), type: ol.GetType(), def: ol.GetDefaultOptionDataValue(), attrs: ol.GetHtmlAttrArrayArray() || [], opts: [], next: null };
    ol.ForEachOptionData((d) => { o.opts.push([d.GetValue(), d.GetLabel(), lst(d.GetNextOptionList())]); });
    o.next = lst(ol.GetNextOptionList());
    return o;
  };
  // 攻撃倍率 = ラトリオのスキル定義の Power(最大Lv)。計算の直後(= 計算係の状態が model と合っているとき)にしか正しく読めない。式の中で決まるスキル(アースグレイヴなど)は 0 以下 → 倍率なし(いちばん後ろ)
  const powOf = (a, tree) => { try { const mx = tree && tree.type === 0 && tree.opts.length ? Math.max(...tree.opts.map((o) => +o[0])) : 1, p = Number(S.G.g_skillManager.GetPower(a.GetSkillId(), mx, null)); return isFinite(p) && p > 0 ? p : 0; } catch (e) { return 0; } };
  const arr = S.AM.GetEffectiveAttackMethodDataArray().map((a) => { const tree = lst(a.GetNextOptionList()); return { full: String(a.GetFullId()), skill: a.GetSkillId(), src: a.GetSourceType(), name: a.GetDispName(), tree, pow: powOf(a, tree) }; });
  arr.sort((a, b) => (b.skill !== 0) - (a.skill !== 0) || (b.pow > 0) - (a.pow > 0) || b.pow - a.pow);
  return ENG.cache[key] = arr;
}
const atkMethodLabel = (x) => x.name + (x.pow ? `（倍率 ${fmtN(Math.round(x.pow))}%）` : "");
// ---- 精霊(エレメンタルバスターなど): 「召喚中の精霊」はキャラの状態(passiveSkill)。ここで選ぶと、「支援・アイテム・スキル」の「(仮)精霊」と同じ場所を書きかえる ----
// エレメンタルバスターは、四次職の精霊(13〜17)が召喚されていないと「使用不可」でダメージ 0。精霊の種類で属性と威力が決まる(ラトリオ 5b-elemental-master.js)
const SERE_SKILLS = new Set([1157]);
const SERE_OPTS = [[13, "火（アルドール）"], [14, "水（ディルビオ）"], [15, "風（プロセラ）"], [16, "地（テレモトゥス）"], [17, "毒（サーペンス）"]];
function engSereIdx(job) {
  const k = "sereidx" + job; if (ENG.cache[k] !== undefined) return ENG.cache[k];
  let ix = -1; try { ix = Array.from(ENG.reg.g_constDataManager.GetDataObject(ENG.sb.kJob, +job).GetPassiveSkillIdArray()).indexOf(ENG.sb.sereId); } catch (e) { /* 取れなければ -1 */ }
  return ENG.cache[k] = ix;
}
function sereHtml(m, skill) {
  if (!SERE_SKILLS.has(skill) || !ENG.sb) return "";
  const ix = engSereIdx(m.status.jobId); if (ix < 0) return "";
  const cur = +(m.passiveSkill || [])[ix] || 0, ok = cur >= 13 && cur <= 17;
  return `<div class="settabs sere" style="margin:4px 0"><span class="muted">召喚中の精霊（属性と威力が決まる）</span>${SERE_OPTS.map(([v, t]) => `<button class="settab${cur === v ? " on" : ""}" data-sere="${v}">${t}</button>`).join("")}</div>`
    + (ok ? "" : `<div class="warn">四次職の精霊が召喚されていないので、このスキルは使えず、ダメージが 0 になります。上から選ぶと計算できます（「支援・アイテム・スキル」の「(仮)精霊」と同じ設定です）。</div>`);
}
document.addEventListener("click", (e) => {      // ゲームの表示との照合の「ジョンダのサポート魔法をオンにする」
  const b = e.target.closest && e.target.closest("[data-jonda]"); if (!b) return;
  const ch = simcCur(); if (!ch) return; ch.model.buff8 = ch.model.buff8 || []; ch.model.buff8[22] = 4; SIMC.res = null; simcSave(); if (SIMC.stp) { SIMC.stp.sugSig = ""; SIMC.stp.effSig = ""; SIMC.stp.swSig = ""; } render();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-sere]"); if (!b) return;
  const ch = simcCur(); if (!ch) return; const m = ch.model, ix = engSereIdx(m.status.jobId); if (ix < 0) return;
  m.passiveSkill = m.passiveSkill || []; m.passiveSkill[ix] = +b.dataset.sere; SIMC.res = null; simcSave(); if (typeof ATK !== "undefined") ATK.rank = null; if (SIMC.stp) { SIMC.stp.sugSig = ""; SIMC.stp.effSig = ""; SIMC.stp.swSig = ""; } render();
});
function sbChain(root, vals) {                            // 選んだ値(vals)で、設定の鎖をたどる。値が合わなければ初期値にする。[{ol, v}]
  const out = []; let ol = root, i = 0;
  while (ol && i < 12) {
    let v = vals[i];
    if (ol.type === 0) { if (!ol.opts.some((o) => o[0] === v)) v = ol.opts.some((o) => o[0] === ol.def) ? ol.def : (ol.opts[0] ? ol.opts[0][0] : 0); }
    else if (v === undefined || v === null || Number.isNaN(+v)) v = ol.def;
    out.push({ ol, v });
    const o = ol.type === 0 ? ol.opts.find((x) => x[0] === v) : null;
    ol = (o && o[2]) || ol.next; i++;
  }
  return out;
}
function engSandbag(model, cfg, mt, dbg) {                     // {per:{min,avg,max}, unit:[…], hits:[…], cast, delay, cool, interval, perSec, hitRate, noDmg} か、計算できなければ null
  const S = ENG.sb, E = S.EN, mk = (k) => E["MOB_CONF_INPUT_DATA_INDEX_" + k];
  const old = SB_MOB_KEYS.map((k) => S.MC.GetMobConfInput(mk(k))), origId = S.CM.GetMonsterId, before = ENG.sw.map((x) => x.m[x.get]);
  // ダメージの計算は、補助情報の表が読む値(物理特化の STR・DEX の分 `STRDEX_BONUS` など = `dispDataMap`)も書きかえる。キャラの計算に残さないよう、終わったら元に戻す
  const dm = ENG.xinfo && ENG.xinfo.dispDataMap, dmSnap = dm ? new Map(dm) : null;
  const set = { LV: SB_FIXED.lv, HP: SB_FIXED.hp, STR: 1, INT: 1, VIT: 1, DEX: 1, AGI: 1, LUK: 1, ATK: 1, MATK: 1, RANGE: 1, DEF: SB_FIXED.def, MDEF: SB_FIXED.mdef, BASE_EXP: 1, JOB_EXP: 1,
    SIZE: cfg.size, ELEMENT: cfg.ele * 10 + cfg.lv, RACE: cfg.race, BOSS_TYPE: cfg.kind ? 1 : 0, GRASS_TYPE: 0, RES: 0, MRES: 0 };
  const real = cfg.mobId !== undefined;                          // 与ダメシミュ: ラトリオの本物のモンスター(手入力の値は使わない)
  let r = null;
  try {
    if (!real) SB_MOB_KEYS.forEach((k) => S.MC.SetMobConfInput(mk(k), set[k]));
    S.CM.GetMonsterId = () => (real ? cfg.mobId : S.mon);
    ENG.sw.forEach((x) => x.m[x.set](true));
    engRndReset(model.foxRnd);
    const mm = JSON.parse(JSON.stringify(model));
    mm.attackMethod = { skillId: mt.skill, sourceType: mt.src, skillLv: mt.lv, optionValueArray: mt.opts };
    for (const [k, i, v] of (mt.fx || [])) { mm[k] = (mm[k] || []).slice(); mm[k][i] = (+mm[k][i] || 0) + v; }      // 時限効果(性能カスタマイズに足す)
    r = ENG.reg.calcFromModel(mm);
    const a = (r.activeResultArray || [])[0];
    if (!a) return null;
    const g = (n) => { try { return r[n](); } catch (e) { return null; } };
    return { mob: dbg ? (r.mobData || []).slice() : undefined, per: { min: g("GetDamageSummaryMinPerAtk"), avg: g("GetDamageSummaryAvePerAtk"), max: g("GetDamageSummaryMaxPerAtk") },
      unit: ((a.dmgUnitArray || [])[0] || []).slice(0, 3), hits: ((a.hitCountArray || [])[0] || []).slice(0, 3),
      cast: g("GetCastTime"), delay: g("GetDelayTime"), cool: g("GetCoolTime"), interval: g("GetAttackInterval"), perSec: g("GetDamageSummaryAvePerSec"), perSecActual: g("GetDamageSummaryAvePerSecActual"), hitRate: a.hitRate, noDmg: !!a.bNoDamage,
      castVary: a.castVary, castFixed: a.castFixed, atkIvl: a.attackInterval, ground: !!a.bGroundInstallation, delayMotion: a.delayMotion, delaySkill: a.delaySkill, coolT: a.coolTime, life: a.objectLifeTime, dmgIv: a.damageInterval };
  } finally {
    S.CM.GetMonsterId = origId;
    if (dm) { dm.clear(); dmSnap.forEach((v, k) => dm.set(k, v)); }
    SB_MOB_KEYS.forEach((k, i) => S.MC.SetMobConfInput(mk(k), old[i]));
    ENG.sw.forEach((x, i) => x.m[x.set](before[i]));
  }
}
const hash53 = (s) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16); };
const SBX = { recs: null, focus: "", open: {} };
async function sbxLoad() { SBX.recs = await fetch("/api/sandbag").then((r) => r.json()).then((d) => d.records || []).catch(() => []); }
const sbPost = (body) => fetch("/api/sandbag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}));
const sbDesc = (cfg) => `${SB_KINDS[cfg.kind]}・${SB_RACES[cfg.race]}・${SB_ELES[cfg.ele]}${cfg.lv}・${SB_SIZES[cfg.size]}`;
function simcSbState(m) {                                 // 枠を開いているときだけ。攻撃方法の一覧・選んだ方法・計算結果を用意する
  const S = SIMC.sb, cfg = simcSbCfg(m);
  S.err = "";
  try {
    S.methods = engAttackMethods(m);
    let item = S.methods.find((x) => x.full === cfg.full) || S.methods.find((x) => x.skill !== 0) || S.methods[0];
    if (!item) { S.item = null; S.res = null; S.err = "この職業の攻撃スキルが見つかりません"; return; }
    cfg.full = item.full;
    const chain = sbChain(item.tree, cfg.vals); cfg.vals = chain.map((c) => c.v);
    const lv = chain[0] ? +chain[0].v : 1, opts = chain.slice(1).map((c) => +c.v);
    const optText = chain.slice(1).map((c) => (c.ol.label ? c.ol.label + ":" : "") + (c.ol.type === 0 ? ((c.ol.opts.find((o) => o[0] === c.v) || [])[1] ?? c.v) : c.v)).join(" ");
    S.item = item; S.chain = chain; S.mt = { skill: item.skill, src: item.src, lv, opts, name: item.name, optText };
    const sig = JSON.stringify([simcStripSb(m), cfg.kind, cfg.race, cfg.ele, cfg.lv, cfg.size, item.full, cfg.vals]);
    if (S.sig !== sig) {
      S.res = engSandbag(m, cfg, S.mt); S.sig = sig; S.key = hash53(sig); S.zero = "";
      if (!S.res) S.err = "このスキルは、サンドバッグマンに対して計算できませんでした";
      else if (!S.res.per.avg && !S.res.noDmg) {      // 0 のとき: 別の属性(火1。いまが火なら水1)なら出るか → 出るなら属性の相性、出ないなら「自分のスキル」の設定
        const alt = Object.assign({}, cfg, cfg.ele === 3 ? { ele: 1, lv: 1 } : { ele: 3, lv: 1 }), r2 = engSandbag(m, alt, S.mt);
        S.zero = r2 && r2.per.avg > 0 ? "elem" : "buff";
      }
    }
    // 時限効果(与ダメシミュ・小型サンドバックマンと共通のオン・オフ)を入れた結果。オンの効果が無いときは出さない
    try { S.kind = stpSbKind(simcClone(m), cfg, S.mt); } catch (e) { S.kind = "b"; }
    if (S.res && atkActiveIds(null).length) {
      const fs = S.sig + "|" + atkFxSig();
      if (S.fsig !== fs) { const ev = atkEval(m, cfg, S.mt, cfg.kind === 1, S.kind); S.resF = ev.r; S.expInfo = ev.exp; S.fsig = fs; }
    } else { S.resF = null; S.expInfo = null; S.fsig = ""; }
  } catch (e) { S.err = "計算できませんでした: " + e.message; S.res = null; S.resF = null; }
}
function simcSbNums(res) {                                // 数字の表(画面と記録で同じ形)
  const n = (v, f = 0) => simcNum(v, f), row = (l, v, note = "") => `<tr><td>${l}</td><td class="v">${v}</td><td class="muted">${note}</td></tr>`;
  const [u0, u1, u2] = res.unit || [], [h0, h1, h2] = res.hits || [], avg = res.per.avg || 0;
  const rng = (a, b2, c, f = 0) => (a === c ? n(a, f) : `${n(a, f)} ～ ${n(c, f)}`);
  return `<table>${row("1回の使用の合計ダメージ（平均）", `<b>${n(avg)}</b>`, res.per.min !== res.per.max ? `最小 ${n(res.per.min)} ／ 最大 ${n(res.per.max)}` : "")}
    ${row("1ヒットのダメージ", u1 === undefined ? "-" : rng(u0, u1, u2), "ヒット数 " + (h1 === undefined ? "-" : rng(h0, h1, h2)))}
    ${row("DPS（1秒あたり・平均）", `<b>${n(res.perSec)}</b>`, res.castVary === undefined ? "" : res.ground ? "設置スキル: 詠唱を数えず、ダメージの間隔で割る" : "= 1回の平均 ÷ (変動詠唱 + 固定詠唱 + ディレイ・間隔)")}
    ${row("時間の内訳", res.castVary === undefined ? `${n(res.cast, 2)} / ${n(res.delay, 2)} / ${n(res.interval, 2)} 秒` : `変動詠唱 ${n(res.castVary, 2)} + 固定詠唱 ${n(res.castFixed, 2)} + ディレイ・間隔 ${n(res.atkIvl, 2)} = ${n(res.interval, 2)} 秒`, res.cool ? `クールタイム ${n(res.cool, 2)} 秒` : "")}
    ${res.perSecActual ? row("DPS（実際に打てる回数で数えた場合）", n(res.perSecActual), "ラトリオの「DPS実測」と同じ数え方") : ""}
    ${row("HP 10億を削るのに", avg ? `約 ${n(Math.ceil(SB_FIXED.hp / avg))} 回` : "-", avg && res.interval ? `約 ${n(Math.ceil(SB_FIXED.hp / avg) * res.interval, 1)} 秒` : "")}</table>`;
}
function simcSbHtml(m) {
  const cfg = simcSbCfg(m), S = SIMC.sb;
  const sel = (id, arr, cur) => `<select data-sbc="${id}">${arr.map((t, i) => `<option value="${i}" ${i === cur ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  let h = `<div class="muted" style="margin-bottom:6px">ゲームのお試し道場の「サンドバッグマン」と同じ設定のモンスターに、メインスキルを使ったときのダメージを、簡易に計算します（数字のみ・目安）。固定の強さ: <b>Lv ${SB_FIXED.lv} ／ HP ${fmtN(SB_FIXED.hp)} ／ DEF ${SB_FIXED.def} ／ MDEF ${SB_FIXED.mdef}</b>（RES・MRES はゲームの画面に出ないので 0 として計算）。キャラは、いま開いているスロットのものです。</div>
    <div class="bfbar"><label>種類 ${sel("kind", SB_KINDS, cfg.kind)}</label><label>種族 ${sel("race", SB_RACES, cfg.race)}</label><label>属性 ${sel("ele", SB_ELES, cfg.ele)}</label>
      <label>属性Lv <select data-sbc="lv">${[1, 2, 3, 4].map((i) => `<option value="${i}" ${i === cfg.lv ? "selected" : ""}>Lv${i}</option>`).join("")}</select></label><label>サイズ ${sel("size", SB_SIZES, cfg.size)}</label></div>`;
  if (!ENG.sb) return `<div class="warn">サンドバックマンは使えません（ラトリオの更新で、計算の入口が変わった可能性があります）。ほかの機能はふつうに使えます。</div>`;
  if (!(simcFoldState().sb)) return h + `<div class="muted">この枠を開くと、メインスキルを選んで計算できます。</div>`;
  simcSbState(m);
  if (S.methods && S.item) {
    h += `<div class="bfbar"><label>メインスキル <select data-sbc="full">${S.methods.filter((x) => x.skill !== 0 || S.methods.length === 1).map((x) => `<option value="${esc(x.full)}" ${x.full === cfg.full ? "selected" : ""}>${esc(atkMethodLabel(x))}</option>`).join("")}</select></label>
      ${(S.chain || []).map((c, i) => c.ol.type === 0
        ? `<label>${esc(i === 0 ? "Lv" : c.ol.label || "設定")} <select data-sbo="${i}">${c.ol.opts.map((o) => `<option value="${esc(o[0])}" ${o[0] === c.v ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select></label>`
        : `<label>${esc(c.ol.label || "設定")} <input type="number" data-sbo="${i}" value="${esc(c.v)}" style="width:6em"></label>`).join("")}</div>${sereHtml(m, S.item.skill)}`;
  }
  if (S.err) h += `<div class="warn">${esc(S.err)}</div>`;
  if (S.res) {
    const kind = S.kind || "b", fx = atkFxAll().filter((e) => e.kind === "b" || e.kind === kind || kind === "b"), owned = atkOwnedNames(m);
    h += `${atkFxCtlHtml(S.expInfo)}<div class="atkfxl" style="margin:4px 0"><span class="muted">時限効果（「時限効果込み」に出します。「与ダメシミュ」「ステータスシミュレーター」と共通。左クリックで個数 +1・右クリックで −1。グレーの文字は、いまの装備に付いていません）</span>${fx.map((e) => atkChip(e, owned)).join("")}</div>`;
  }
  if (S.res) {
    const known = (SBX.recs || []).find((x) => x.key === S.key);
    h += `<div class="sbres">${simcSbNums(S.res)}</div>`
      + (S.resF ? `<div class="sbres" style="margin-top:8px"><div class="muted" style="margin-bottom:2px"><b>時限効果込み</b>（${(atkFxSet().mode || "exp") === "exp" ? "発動率と持続時間から出した期待値" : "オンの効果が全部かかっているとき"}）</div>${simcSbNums(S.resF)}</div>` : "")
      + (S.res.per.avg === 0 && !S.res.noDmg ? (S.zero === "elem"
        ? `<div class="warn">ダメージが 0 になりました。このスキルの属性は、いまのサンドバッグマンの属性（${esc(sbDesc(cfg))}）には効きません（属性の相性）。別の属性を選ぶと出ます。</div>`
        : `<div class="warn">ダメージが 0 になりました。このスキルは、「支援・アイテム・スキル」の「自分のスキル」の設定（エレメンタルマスターなら精霊の召喚など）が要る場合があります。</div>`) : "")
      + `<div class="opts"><button id="sbrec">${known ? "もう一度記録する（日時を更新）" : "この結果を記録する"}</button>${known ? `<button class="ghost" data-sbgo="${esc(known.id)}">記録を見る →</button>` : ""}<span class="muted">記録は「サンドバックマン」のタブで見られます。</span></div>`;
    h += `<div id="sccsbcmp" class="cmpbox">${simcSbCmpHtml(m)}</div>`;
    simcSbCmpKick(m);
  }
  return h;
}
// 比べる: いまの設定(スキル・敵・時限効果)のまま、選んだ装備スロットに入れかえて、サンドバックマンのダメージを並べる
const simcSbCmpSig = (m) => { const S = SIMC.sb; return JSON.stringify([simcCmpIds(m), S.sig, S.fsig]); };
function simcSbCmpHtml(m) {
  if (!simcCmpIds(m).length) return "";
  const R = SIMC.sbCmp, S = SIMC.sb; if (!S.res) return "";
  if (!R || R.sig !== simcSbCmpSig(m)) return `<div class="muted">比べています…</div>`;
  const dl = (v, b) => { const d = (v || 0) - (b || 0); return d ? ` <span class="${d > 0 ? "good" : "warn"}">(${d > 0 ? "+" : ""}${simcNum(d)}${b ? "・" + (d > 0 ? "+" : "") + (100 * d / b).toFixed(1) + "%" : ""})</span>` : ""; };
  const rows = [["1回の平均ダメージ", (x) => x.per.avg], ["1回の最大", (x) => x.per.max], ["DPS", (x) => x.perSec]];
  const part = (title, base, key) => `<tr class="cmpk"><td colspan="${2 + R.cols.length}"><b>${title}</b></td></tr>` + rows.map(([l, f]) => `<tr><td>${l}</td><td class="v">${simcNum(f(base))}</td>${R.cols.map((c) => { const r = c[key]; return `<td class="v">${r ? simcNum(f(r)) + dl(f(r), f(base)) : "-"}</td>`; }).join("")}</tr>`).join("");
  return `<table class="multi cmp">${simcCmpHead(R.cols)}${part("メインスキル1回（時限効果なし）", S.res, "r")}${S.resF ? part("時限効果込み", S.resF, "rf") : ""}</table><div class="muted" style="font-size:12px">いまの設定（スキル・敵・時限効果）のまま、装備スロットだけを入れかえて計算しています。</div>`;
}
function simcSbCmpFill(m) { const el = $("#sccsbcmp"); if (el) el.innerHTML = simcSbCmpHtml(m); }
function simcSbCmpKick(m) {
  const S = SIMC.sb; if (!simcFoldState().sb || !ENG.sb || !S.res || !S.mt || !simcCmpIds(m).length) return;
  const sig = simcSbCmpSig(m); if (SIMC.sbCmp && SIMC.sbCmp.sig === sig) return;
  clearTimeout(SIMC.sbCmpT);
  SIMC.sbCmpT = setTimeout(async () => {
    const cols = [], T = (DATA.equip || {}).sets || {}, cfg = simcSbCfg(m), mt = S.mt, boss = cfg.kind === 1, kind = S.kind, withFx = !!S.resF;
    for (const sid of SIMC.cmp.slice()) {
      const st = T[sid]; if (!st) continue;
      const mm = JSON.parse(JSON.stringify(m)); let missRows = [];
      if (st.sim) simcApplyFrag(mm, st.sim, false); else missRows = simcWear(mm, st.items || [], false);
      await sleep(0);
      const c = simcCur(); if (!c || simcSbCmpSig(c.model) !== sig) return;
      try { engCalc(mm); cols.push({ sid, st, missRows, r: engSandbag(mm, cfg, mt), rf: withFx ? atkEval(mm, cfg, mt, boss, kind).r : null }); } catch (e) { console.warn("sbcmp", e); }
    }
    SIMC.sbCmp = { sig, cols }; simcSbCmpFill(m);
  }, 300);
}
async function simcSbRecord(m) {
  const S = SIMC.sb, cfg = simcSbCfg(m); if (!S.res || !S.mt) return;
  const ch = simcCur(), model = simcClone(m);
  const rec = { key: S.key, slot: { id: SIMC.cur, name: ch ? ch.name : "" }, job: simcJobName(m), model,
    sb: { cfg: { kind: cfg.kind, race: cfg.race, ele: cfg.ele, lv: cfg.lv, size: cfg.size }, full: cfg.full, vals: cfg.vals.slice(), skill: S.mt.name, skillLv: S.mt.lv, optText: S.mt.optText }, res: S.res };
  const r = await sbPost({ add: rec });
  await sbxLoad(); SIMC.msg = r.id ? "サンドバックマンの記録に追加しました。" : "記録できませんでした。"; render();
}
function sbxGo(id) { SBX.focus = id; SIMV = "sb"; store.set("md_simv", SIMV); TAB = "sim"; store.set("md_tab", TAB); render(); }
async function sbxApply(id) {
  const r = (SBX.recs || []).find((x) => x.id === id); if (!r) return;
  let ch = simcCur();
  if (ch && !(await askOnce("sbapply", `スロット「${ch.name}」の作業中の内容を、この記録のときのキャラ・装備・サンドバッグマンの設定で置きかえます。\n保存していない変更は消えます（保存してあれば「ロード」で戻せます）。`, "反映する"))) return;
  if (!ch) { const nid = "c" + Date.now().toString(36); ch = SIMC.chars[nid] = { name: "記録: " + (r.slot.name || r.job), model: simcClone(r.model), saved: simcClone(r.model) }; simcSelect(nid); await simcPut(nid); }
  else { ch.model = simcClone(r.model); simcSbCfg(ch.model); simcSave(); }
  SIMC.res = null; SIMC.report = null; SIMC.sb.sig = "";
  const st = simcFoldState(); st.sb = true; store.set("md_simfold", JSON.stringify(st));
  SIMV = "chara"; store.set("md_simv", SIMV); TAB = "sim"; store.set("md_tab", TAB); render();
  setTimeout(() => { const el = $("#view").querySelector('details[data-fold="sb"]'); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 400);
}
function renderSandbagTab() {
  if (!(typeof LOCAL !== "undefined" && LOCAL)) { $("#view").innerHTML = simNav() + `<div class="panel empty">サンドバックマンは、Fox_MD_Tracker を動かしている PC の画面でだけ使えます。</div>`; bindSimNav(); return; }
  if (!SBX.recs) { $("#view").innerHTML = simNav() + `<div class="panel empty"><span class="spin">読み込み中…</span></div>`; bindSimNav(); sbxLoad().then(render); return; }
  if (RAT && RAT.installed && !ENG.ready && !ENG.loading && !ENG.err) engInit().then(render);
  const R = SBX.recs, f = (v, d = 0) => simcNum(v, d);
  let h = simNav() + `<div class="panel simbox"><div class="opts"><b>サンドバックマン</b><span class="muted">キャラシミュレーターの「サンドバックマン」の枠で記録した計算結果です（新しい順・最大200件）。「この設定をキャラシミュに反映してジャンプ」で、そのときのキャラ・装備・設定を、いまのスロットに入れて開きます。</span></div></div>`;
  if (!R.length) h += `<div class="panel empty">まだ記録がありません。キャラシミュレーターの「サンドバックマン」の枠で、メインスキルを選んで「この結果を記録する」を押してください。</div>`;
  h += R.map((r) => {
    const cfg = r.sb.cfg, res = r.res, st = r.model.status || {}, open = SBX.open[r.id], avg = res.per.avg || 0;
    const det = open ? `<div class="sbdet"><div class="muted">${esc(r.job)}　BaseLv ${st.baseLv} / JobLv ${st.jobLv}　STR ${st.str} AGI ${st.agi} VIT ${st.vit} INT ${st.int} DEX ${st.dex} LUK ${st.luk}</div>
      ${ENG.ready ? `<table class="eqt">${SIMC_REGIONS.concat(SIMC_SHADOW).map(([i, l]) => { const id = simcItemAt(r.model, i); return simcIsNone(i, id) ? "" : `<tr><td class="muted">${l}</td><td>${esc(simcItemName(id))}</td></tr>`; }).join("")}</table>` : `<div class="muted">装備の名前は、計算係の起動後に出ます…</div>`}
      <div class="sbres">${simcSbNums(res)}</div></div>` : "";
    return `<div class="panel sbrec${SBX.focus === r.id ? " mx-flash" : ""}" data-sbr="${esc(r.id)}"><div class="opts"><b>${esc(r.sb.skill)} Lv${esc(r.sb.skillLv)}${r.sb.optText ? " " + esc(r.sb.optText) : ""}</b>
      <span class="tag">${esc(sbDesc(cfg))}</span><span class="muted">${when(r.t)} ／ ${esc(r.slot.name || "")}（${esc(r.job)} Lv${st.baseLv}）</span></div>
      <div class="opts"><span>1回の平均 <b>${f(avg)}</b></span><span class="muted">（最小 ${f(res.per.min)} ／ 最大 ${f(res.per.max)}）</span><span>1秒あたり <b>${f(res.perSec)}</b></span><span class="muted">詠唱 ${f(res.cast, 2)} ／ ディレイ ${f(res.delay, 2)} 秒</span></div>
      <div class="opts"><input class="sbnote" data-sbn="${esc(r.id)}" value="${esc(r.note || "")}" placeholder="メモ" style="width:18em"><button data-sbapply="${esc(r.id)}">この設定をキャラシミュに反映してジャンプ</button>
        <button class="ghost" data-sbdetail="${esc(r.id)}">${open ? "詳細をとじる" : "詳細"}</button><button class="ghost" data-sbdel="${esc(r.id)}">削除</button></div>${det}</div>`;
  }).join("");
  $("#view").innerHTML = h; bindSimNav();
  const V = $("#view");
  V.querySelectorAll("[data-sbapply]").forEach((el) => el.onclick = () => sbxApply(el.dataset.sbapply));
  V.querySelectorAll("[data-sbdetail]").forEach((el) => el.onclick = () => { SBX.open[el.dataset.sbdetail] = !SBX.open[el.dataset.sbdetail]; render(); });
  V.querySelectorAll("[data-sbdel]").forEach((el) => el.onclick = async () => { if (await askOnce("sbdel", "この記録を削除します。", "削除")) { await sbPost({ delete: el.dataset.sbdel }); await sbxLoad(); render(); } });
  V.querySelectorAll("input.sbnote").forEach((el) => { el.onkeydown = (e) => { if (e.key === "Enter") el.blur(); }; el.onchange = async () => { await sbPost({ note: [el.dataset.sbn, el.value] }); const r = R.find((x) => x.id === el.dataset.sbn); if (r) r.note = el.value; }; });
  if (SBX.focus) { const el = V.querySelector(`[data-sbr="${CSS.escape(SBX.focus)}"]`); SBX.focus = ""; if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => el.classList.remove("mx-flash"), 2500); } }
}
