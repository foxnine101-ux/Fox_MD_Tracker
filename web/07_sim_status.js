"use strict";
// ---- ASPD・無詠唱の維持(旧「ステ振りの相談」と「装備セットごとの確認」を1つにまとめたもの) ----
// 選んだ装備スロット × シャドウのスロットの全部を、いまのキャラ(ステータス・支援・習得スキルは「いまのまま」)に着せて、ラトリオの計算で ASPD・詠唱を並べる。
// ラトリオの計算なので、装備の ASPD・変動詠唱の効果、セット効果、エンチャント、カード、ランダムオプション、精錬も、実際に着ているときと同じ状態で入る
// 【習】= 習得スキルのレベルで効果が変わる装備・カード(ラトリオが候補の名前の先頭に付ける)。着せ替えても習得スキルは「いまのキャラのもの」がそのまま使われる(装備セットには入っていない)ので、
// 習得スキルが入っていないと効果が出ない → 維持の確認で、どの装備が【習】か・習得スキルが何個入っているかを出す
function simcLearnedList(m) {
  const out = [], job = m.status.jobId;
  try {
    for (const [r, l] of SIMC_REGIONS) {
      const id = m.equip[r]; if (!id || simcIsNone(r, id)) continue;
      const o = simcItemOpts(job, r, true).find((x) => x.v === id); if (o && /^【習】/.test(o.t || "")) out.push(`${l} ${simcItemName(id)}`);
      const copts = simcCardOpts(r, id); SIMC_CARD[r].forEach((cr, i) => { const v = m.card[cr]; if (!v) return; const o2 = (copts[i] || []).find((x) => x.v === v); if (o2 && /^【習】/.test(o2.t || "")) out.push(`${l} ${simcCardName(v)}`); });
    }
    for (const [r, l] of SIMC_SHADOW) { const id = (m.shadowEquip.itemId || [])[r]; if (!id) continue; const o = simcItemOpts(job, r, true).find((x) => x.v === id); if (o && /^【習】/.test(o.t || "")) out.push(`${l} ${simcItemName(id)}`); }
  } catch (e) { /* 判定できなければ出さない */ }
  return out;
}
const simcLearnedCount = (m) => { const sc = simcSchema(m); return sc ? sc.filter((it) => it.g === "learn" && Number((m[it.f] || [])[it.i]) > 0).length : null; };
// 入らなかった装備・カードの一覧(どれが入らなかったか)。「選ぶ」でラトリオの候補に結びつけると、次から入る
const simcMissHtml = (rows, ri) => rows && rows.length ? `<div class="missdet" title="ラトリオの候補に同じ名前が無くて、計算に入っていません（その分、数字が実際と違います）。「選ぶ」で候補に結びつけると、次から入ります">入らなかった: ${rows.slice(0, 5).map((x, j) => `${esc(x.slot || "")} ${esc(x.name)}${ri === undefined ? "" : ` <button class="ghost" data-kfix="${ri}:${j}">選ぶ</button>`}`).join("、")}${rows.length > 5 ? ` ほか ${rows.length - 5} 件` : ""}</div>` : "";
// ---- ステータスポイント ----
// 使うポイント = ラトリオの GetStatusTotalCost(値) の合計。もらえるポイント = 48(転生職は 100。養子は 48) + Lv ごとの GetEarningStatusPoint
function simcPoints(m) {
  try {
    const st = m.status, hm = ENG.hm, used = ["str", "agi", "vit", "int", "dex", "luk"].reduce((a, k) => a + hm.GetStatusTotalCost(st[k] || 1), 0);
    let earned = ENG.x.jobh.IsReincarnatedJob(+st.jobId) && !(m.buff8 || [])[13] ? 100 : 48;
    for (let lv = 1; lv <= (st.baseLv || 1); lv++) earned += hm.GetEarningStatusPoint(lv);
    return { used, earned, remain: earned - used };
  } catch (e) { return null; }
}
const simcPointsHtml = (m) => { const P = simcPoints(m); return P ? `残りステータスポイント <b class="${P.remain < 0 ? "warn" : ""}">${P.remain}</b> <span class="muted">（${P.earned} のうち ${P.used} を使用）</span>` : ""; };
// ---- ステ振りの相談: AGI・DEX は ASPD に、DEX・INT は変動詠唱に同時に効く。条件を満たす振り方のうち、使うポイントがいちばん少ないものを探す ----
// DEX を上から1ずつ下げながら「その DEX で 193 に要る最小の AGI」をたどる(AGI は増える一方なので、階段をなぞるだけで済む)。
// 変動詠唱は 詠唱の値 = (DEX+補正)×2 + (INT+補正) ≥ 530 から、その DEX で要る INT が決まる。補正はセットごとに計算係で測る。最後に計算係で確かめる
// ステ振りの相談の対象: 選んだ装備スロット × 選んだシャドウのスロット(「いまの装備」「いまのシャドウ」は、計算機にいま入っているもの)
const SIMC_OPT_COMBO_MAX = 16;
function simcOptSel(m) {
  const O = SIMC.opt, okM = new Set(simcSetList(m, false).tabs.map((x) => x.sid)), okS = new Set(simcSetList(m, true).tabs.map((x) => x.sid));
  O.mainSel = O.mainSel.filter((x) => x === "now" || okM.has(x)); if (!O.mainSel.length) O.mainSel = ["now"];
  O.shSel = O.shSel.filter((x) => x === "now" || okS.has(x)); if (!O.shSel.length) O.shSel = ["now"];
  return { main: O.mainSel, sh: O.shSel };
}
function simcOptColors(m) {                    // 選んだ装備パターンの色(重ならない順)。複数なら、色のしまの枠になる
  const sel = simcOptSel(m), out = []; let n = 0;
  for (const a of sel.main) for (const sh of sel.sh) { if (++n > SIMC_OPT_COMBO_MAX) break; for (const c of [simcSetColor(false, a === "now" ? m.foxSet : a), simcSetColor(true, sh === "now" ? m.foxShadow : sh)]) if (c && !out.includes(c)) out.push(c); }
  return out;
}
function simcOptSets(m) {
  const sel = simcOptSel(m), tabM = Object.fromEntries(simcSetList(m, false).tabs.map((x) => [x.sid, x.st])), tabS = Object.fromEntries(simcSetList(m, true).tabs.map((x) => [x.sid, x.st]));
  const apply = (mm, st, shadow) => { if (st.sim) { simcApplyFrag(mm, st.sim, shadow); return []; } const rows = simcWear(mm, st.items || [], shadow); rows.forEach((x) => { x.mm = mm; }); return rows; };
  const out = [];
  for (const a of sel.main) for (const s of sel.sh) {
    if (out.length >= SIMC_OPT_COMBO_MAX) break;
    const mm = simcClone(m); const missRows = [];
    if (a !== "now") missRows.push(...apply(mm, tabM[a], false));
    if (s !== "now") missRows.push(...apply(mm, tabS[s], true));
    const la = a === "now" ? "いまの装備" : tabM[a].tag, ls = s === "now" ? "" : tabS[s].tag;
    out.push({ label: a === "now" && s === "now" ? "いまの装備" : ls ? (a === "now" ? "いまの装備" : la) + "・" + ls : la, mm, miss: missRows.length, missRows, colors: [simcSetColor(false, a === "now" ? m.foxSet : a), simcSetColor(true, s === "now" ? m.foxShadow : s)].filter(Boolean) });
  }
  return out;
}
// 届かないとき: 上限(130)まで振った場合にどれだけ足りないか、と、上限を超えてでもいくつ要るか(AGI だけ / DEX だけ / INT だけ)
function stpSbKind(mm, cfg, mt) {              // このスキルが物理か魔法か(物理ダメージ+100% / 魔法ダメージ+100% を足して、数字が動くほう)
  const key = "stpk:" + JSON.stringify([mm.status.jobId, mt.skill, mt.src, cfg.kind, cfg.race, cfg.ele, cfg.lv, cfg.size, SERE_SKILLS.has(mt.skill) ? mm.passiveSkill : 0]);
  if (ENG.cache[key]) return ENG.cache[key];
  const run = (fx) => { const r = engSandbag(mm, cfg, Object.assign({}, mt, { fx })); return r ? r.per.avg || 0 : 0; };
  const b = run([]), ph = run([[ATK_AT, 5, 100]]) > b * 1.001, ma = run([[ATK_AT, 14, 100]]) > b * 1.001;
  return ENG.cache[key] = ph && !ma ? "p" : ma && !ph ? "m" : "b";
}
function stpSbMt(m) {                           // サンドバックマンの設定(スキル・Lv・追加設定)から、計算に渡す形
  const cfg = simcSbCfg(m), methods = engAttackMethods(m), item = sbPickItem(methods, cfg);
  if (!item) return null;
  const chain = sbChain(item.tree, cfg.vals); cfg.full = item.full; cfg.vals = chain.map((c) => c.v);
  return { cfg, methods, item, chain, mt: { skill: item.skill, src: item.src, lv: chain[0] ? +chain[0].v : 1, opts: chain.slice(1).map((c) => +c.v), name: item.name } };
}
// サンドバックマンの設定のメインスキルで、ステータスを over にしたときの1回のダメージ(平均)。useFx = オンにしている時限効果(真理の解放など)を足す。結果は覚える
function simcSbAvg(m, over, useFx) {
  try {
    if (!ENG.sb) return null;
    const mm = simcClone(m); Object.assign(mm.status, over || {}); stpFoldTrait(mm);
    const key = "sbd:" + (useFx ? atkFxSig() : "-") + JSON.stringify(mm);
    if (ENG.cache[key] !== undefined) return ENG.cache[key];
    const T = stpSbMt(mm); if (!T) return null;
    const mt = Object.assign({}, T.mt);
    const r = useFx ? atkEval(mm, T.cfg, mt, T.cfg.kind === 1, stpSbKind(mm, T.cfg, mt)).r : engSandbag(mm, T.cfg, mt);
    return ENG.cache[key] = r ? { avg: r.per.avg, dps: r.perSec || 0, castV: r.castVary || 0, castF: r.castFixed || 0, ivl: r.atkIvl || 0, ground: !!r.ground, name: T.item.name } : null;
  } catch (e) { return null; }
}
// ---- ダメージの表示: 数が大きいので K / M で、増減は実数と % の両方 ----
const stpKM = (v) => v === null || v === undefined || Number.isNaN(v) ? "-" : Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + "G" : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(Math.round(v));
function stpDelta(v, base) {
  if (v === null || v === undefined || base === null || base === undefined) return "";
  const d = v - base, p = base ? d / base * 100 : 0, cls = Math.abs(p) < 0.005 ? "muted" : d > 0 ? "good" : "warn";
  return `<span class="${cls}">${d >= 0 ? "+" : "−"}${stpKM(Math.abs(d))}（${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(2)}%）</span>`;
}
const stpDmgSig = (m) => JSON.stringify([simcSbCfg(m), atkFxSig()]);
// ================= ステータスシミュレーター(旧「ステ振りの相談」+「装備セットごとの確認」を作り直したもの) =================
// ラトリオの ASPD の式(status/stallcalc-magic-dmg-aspd.js)。AGI・DEX は「補正(装備・支援)込みの合計」:
//   素 = 武器の基本 + √(AGI×(10+10/111) + DEX×9/49)×(…)  ← DEX は AGI の約 1/55 しか効かない
//   → ポーション・スキル等で (200−素)×T、装備の「攻撃速度+%」で (200−x)×U、最後に装備の「ASPD+」を足す。上限は 193(BaseLv100 以上)
//   つまり 合計(上限前 = core.aspdRaw) = C + k×√(AGI×AW + DEX×DW)(k・C は装備・支援で決まる)。2点を計算すれば k・C が出て、必要な AGI・DEX が式で解ける(実測と誤差 0 を確認)
// 無詠唱 = 詠唱の値(DEX×2+INT。補正込みの合計)≧ 530。ポイントは GetStatusTotalCost(値) の合計(値が大きいほど1ポイントあたりの要求が増える)
// 条件で効果が出る装備(「AGI 100 以上で…」など)があるので、式の答えは最後にラトリオの計算で確かめる(足りなければ1ずつ足す)
const STP_AW = 10 + 10 / 111, STP_DW = 9 / 49, STP_KEYS = ["agi", "dex", "int", "vit", "str", "luk"], STP_LABEL = { agi: "AGI", dex: "DEX", int: "INT", vit: "VIT", str: "STR", luk: "LUK" };
// 特性ステータス(試算に入れる。素点は model.pureStatus[6..11])。状態異常の持続時間・耐性・RES/MRES に効く(ラトリオの式)
const STP_TRAIT = ["pow", "sta", "wis", "spl", "con", "crt"], STP_TLABEL = { pow: "POW", sta: "STA", wis: "WIS", spl: "SPL", con: "CON", crt: "CRT" }, STP_TMAX = 200;
// 状態異常ごとに、何のステータスが効くか(ラトリオ engine/ui/CExtraInfoAreaComponentManagerCalc.js の式から)
const STP_AILSTAT = { "毒": "VIT", "スタン": "VIT", "凍結": "MDEF（無視を除く）", "呪い": "LUK", "暗黒": "INT", "睡眠": "AGI", "沈黙": "INT", "混乱": "LUK", "出血": "AGI", "石化": "MDEF（無視を除く）",
  "冷凍": "VIT（時間）", "氷結": "VIT（時間）", "発火": "BaseLv・AGI", "恐怖": "BaseLv・INT", "深い眠り": "INT・LUK", "精神衝撃": "VIT・LUK", "魅了": "不明", "狂乱": "不明",
  "無気力": "POW（時間）", "漆黒": "STA（時間）", "強毒": "STA（時間）", "激流": "WIS（時間）", "憂鬱": "WIS（時間）", "静寂": "SPL（時間）", "火災": "SPL（時間）", "急冷": "CRT（時間）", "結晶化": "CRT（時間）", "不幸": "CRT（時間）" };
const stpS = (A, D) => Math.sqrt(STP_AW * A + STP_DW * D);
const stpCost = (v) => ENG.hm.GetStatusTotalCost(v);
const stpNonStatSig = (m) => JSON.stringify(Object.assign({}, m, { status: Object.assign({}, m.status, { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 }) })) + "|" + JSON.stringify([SIMC.opt.mainSel, SIMC.opt.shSel]);
const stpTarget = () => Math.max(100, Math.min(193, +SIMC.opt.target || 193));
const stpText = (html) => { const el = document.createElement("div"); el.innerHTML = html || ""; return el.textContent.replace(/\s+/g, " "); };
function stpState() {                           // 試算中のステータス(スロットごと)。触るまでは、基本ステータス欄の値についていく
  const c = simcCur(); if (!c) return null;
  if (!SIMC.stp || SIMC.stp.id !== SIMC.cur) SIMC.stp = { id: SIMC.cur, d: null, touched: false, pats: null, patSig: "", rows: null, rowSig: "", sug: null, sugSig: "", eff: null, effSig: "", sw: { stat: "int", dir: -1, step: 10, n: 8 }, swR: null, swSig: "", tok: 0 };
  const S = SIMC.stp; if (!S.touched || !S.d) S.d = Object.fromEntries(STP_KEYS.map((k) => [k, c.model.status[k] || 1]).concat(STP_TRAIT.map((k, i) => [k, (c.model.pureStatus || [])[6 + i] || 0])));
  return S;
}
function stpFoldTrait(t) {                      // 試算のステータス(d)に混ざっている特性ステータスを、model の素点(pureStatus[6..11])へ移す
  STP_TRAIT.forEach((k, i) => { if (k in t.status) { t.pureStatus = (t.pureStatus || []).slice(); while (t.pureStatus.length < 12) t.pureStatus.push(0); t.pureStatus[6 + i] = t.status[k]; delete t.status[k]; } });
}
function stpEval(pat, d, kinds) {               // 装備パターン pat(の model)に、ステータス d を入れて計算 → ASPD の内訳・詠唱の値など
  const t = simcClone(pat.mm); Object.assign(t.status, d);
  stpFoldTrait(t);
  const r = engCalcCached(t, kinds), raw = r.core.aspdRaw, U = r.aspdU || 0, P = r.aspdP || 0, a2 = raw - P, a1 = U < 100 ? (a2 - 2 * U) / (1 - U / 100) : a2;
  return { r, raw, aspd: r.c[37], U, P, a1, up: a2 - a1, castP: 2 * (r.tot.DEX || 0) + (r.tot.INT || 0), hp: r.c[23], cast: r.core.n_CastCutForDisp, fixed: r.c[41], delay: r.core.delayDownForDisp,
    bonus: Object.fromEntries(STP_KEYS.map((k) => [k, (r.tot[k.toUpperCase()] || 0) - d[k]])) };
}
function stpPats(m, S) {                         // 選んだ装備パターン(装備スロット × シャドウのスロット)。装備を着せた model を作って覚える
  const sig = stpNonStatSig(m);
  if (S.pats && S.patSig === sig) return S.pats;
  S.patSig = sig; S.rowSig = ""; S.sugSig = ""; S.effSig = "";
  return S.pats = simcOptSets(m);
}
function stpCal(pat, d) {                        // k・C と補正(装備・支援の AGI・DEX・INT)を、2回の計算で求める。使えない(ASPD が固定される効果など)ときは null
  if (pat.cal !== undefined) return pat.cal;
  const t0 = simcClone(pat.mm); Object.assign(t0.status, d); const r0 = engCalcCached(t0);
  const t1 = simcClone(t0); t1.status.agi = d.agi + 12; const r1 = engCalcCached(t1);
  const s0 = stpS(r0.tot.AGI, r0.tot.DEX), s1 = stpS(r1.tot.AGI, r1.tot.DEX), k = (r1.core.aspdRaw - r0.core.aspdRaw) / (s1 - s0);
  return pat.cal = k > 0.05 && k < 2 ? { k, C: r0.core.aspdRaw - k * s0, bA: r0.tot.AGI - d.agi, bD: r0.tot.DEX - d.dex, bI: r0.tot.INT - d.int } : null;
}
function stpSolve(cals, MAXV) {                  // AGI・DEX・INT を、全パターンの条件を満たす中でいちばん安く(DEX を 1 ずつ動かして、要る AGI・INT を式で出す)
  const O = SIMC.opt, lim = (k) => Math.max(1, Math.min(MAXV, Math.round(+O.min[k] || 1))), TG = stpTarget(), out = [];
  for (let dx = lim("dex"); dx <= MAXV; dx++) {
    let it = lim("int"), ag = lim("agi");
    if (O.cast) for (const c of cals) it = Math.max(it, 530 - 2 * (dx + c.bD) - c.bI);
    if (O.aspd) for (const c of cals) { const s = (TG - c.C) / c.k; if (s > 0) ag = Math.max(ag, Math.ceil((s * s - STP_DW * (dx + c.bD)) / STP_AW - c.bA - 1e-9)); }
    if (it > MAXV || ag > MAXV) continue;
    ag = Math.max(1, ag); it = Math.max(1, it);
    out.push({ agi: ag, dex: dx, int: it, cost: stpCost(ag) + stpCost(dx) + stpCost(it) });
  }
  return out.sort((a, b) => a.cost - b.cost || b.dex - a.dex);
}
function stpBest(cals, budget, MAXV, label) {      // ポイントの予算の中で、無詠唱を満たしたうえで ASPD(全パターンの最小)がいちばん高くなる AGI・DEX・INT
  const O = SIMC.opt, lim = (k) => Math.max(1, Math.min(MAXV, Math.round(+O.min[k] || 1))), TG = stpTarget();
  const aspdOf = (ag, dx) => Math.min(...cals.map((c) => c.C + c.k * stpS(ag + c.bA, dx + c.bD)));
  let best = null;
  for (let dx = lim("dex"); dx <= MAXV; dx++) {
    let it = lim("int"); if (O.cast) for (const c of cals) it = Math.max(it, 530 - 2 * (dx + c.bD) - c.bI);
    if (it > MAXV) continue; it = Math.max(1, it);
    const left = budget - stpCost(dx) - stpCost(it); if (left < stpCost(lim("agi"))) continue;
    let ag = lim("agi"); while (ag < MAXV && stpCost(ag + 1) <= left) ag++;
    const asp = aspdOf(ag, dx), cost = stpCost(ag) + stpCost(dx) + stpCost(it);
    if (!best || asp > best.asp + 1e-9 || (Math.abs(asp - best.asp) <= 1e-9 && cost < best.cost)) best = { agi: ag, dex: dx, int: it, cost, asp, label };
  }
  if (!best) return null;
  let need = 0; if (O.aspd) for (const c of cals) { const s2 = (TG - c.C) / c.k; if (s2 > 0) need = Math.max(need, Math.ceil((s2 * s2 - STP_DW * (best.dex + c.bD)) / STP_AW - c.bA - 1e-9)); }
  best.need = need; best.more = Math.max(0, need - MAXV);       // 目標に届くのに要る AGI(素)。上限を超える分 = 装備・支援の補正で補う分(「130＋○○」の○○)
  return best;
}
async function stpCheck(pats, c, d, tick) {        // 提案を、全パターンでラトリオの計算で確かめる(ASPD の最小・詠唱の値)
  let minRaw = Infinity, minCast = Infinity;
  for (const P of pats) { await tick(); const e = stpEval(P, Object.assign({}, d, { agi: c.agi, dex: c.dex, int: c.int })); minRaw = Math.min(minRaw, e.raw); minCast = Math.min(minCast, e.castP); }
  c.minRaw = minRaw; c.minCast = minCast; return c;
}
async function stpVerify(pats, c, d, tick) {      // 式の答えを、全パターンでラトリオの計算で確かめる。足りなければ INT / AGI を 1 ずつ足す
  const O = SIMC.opt, TG = stpTarget(), MAXV = SIMC_STMAX; let rows = [];
  for (let guard = 0; guard < 14; guard++) {
    let okA = true, okC = true; rows = [];
    for (const P of pats) { await tick(); const e = stpEval(P, Object.assign({}, d, { agi: c.agi, dex: c.dex, int: c.int })); rows.push(e); if (O.aspd && e.raw < TG) okA = false; if (O.cast && e.castP < 530) okC = false; }
    c.ok = okA && okC; if (c.ok) break;
    if (!okC && c.int < MAXV) c.int++; else if (!okA && c.agi < MAXV) c.agi++; else break;
  }
  c.cost = stpCost(c.agi) + stpCost(c.dex) + stpCost(c.int); c.rows = rows;
  return c;
}
function stpAilBlock(e, e0) {                    // RES/MRES と、状態異常(旧・新)の耐性・持続時間(ラトリオの式。特性ステータスも効く)
  const resOf = (E) => { const r = E.r, sp = r.spec || [], t = (k) => r.tot[k] || 0; return [(sp[254] || 0) + t("STA") + Math.floor(t("STA") / 3) * 5, (sp[255] || 0) + t("WIS") + Math.floor(t("WIS") / 3) * 5]; };
  const [rs, ms] = resOf(e), [rs0, ms0] = resOf(e0), dl = (v, v0, u = "") => { const x = Math.round((v - v0) * 100) / 100; return x ? ` <span class="${x > 0 ? "good" : "warn"}">(${x > 0 ? "+" : ""}${x}${u})</span>` : ""; };
  const num = (x) => { const m = String(x || "").match(/-?[\d.]+/g); return m ? m.map(parseFloat) : []; };
  const tab = (E, k) => Object.fromEntries(simcXParse((E.r.x || {})[k], true).filter((y) => !y.hdr).map((y) => [y.label, num(y.val)]));
  const o8 = tab(e, 8), p8 = tab(e0, 8), o9 = tab(e, 9), p9 = tab(e0, 9);
  const r8 = Object.keys(o8).map((k) => { const a = o8[k], b = p8[k] || [0, 0]; return `<tr><td class="l">${esc(k)}</td><td class="l muted">${esc(STP_AILSTAT[k] || "")}</td><td>${a[0] || 0}%</td><td>${a[1] || 0}%${dl(a[1] || 0, b[1] || 0, "%")}</td></tr>`; }).join("");
  const r9 = Object.keys(o9).map((k) => { const a = o9[k], b = p9[k] || [0, 0, 0]; return `<tr><td class="l">${esc(k)}</td><td class="l muted">${esc(STP_AILSTAT[k] || "")}</td><td>${a[0] || 0}%</td><td>${a[1] || 0}%${dl(a[1] || 0, b[1] || 0, "%")}</td><td>${a[2] || 0}秒${dl(a[2] || 0, b[2] || 0, "秒")}</td></tr>`; }).join("");
  return `<div><div class="muted">RES（物理の状態異常・ダメージ） ／ MRES（魔法）</div><b>${rs}</b>${dl(rs, rs0)} ／ <b>${ms}</b>${dl(ms, ms0)} <span class="muted" style="font-size:12px">（装備 + STA・WIS の分。目安）</span>
    <details style="margin-top:4px"><summary class="muted">状態異常の耐性・持続時間（旧・新。特性ステータスも効きます）</summary>
      <div class="tablewrap"><table class="multi"><tr><th class="l">状態異常</th><th class="l">効くもの</th><th>装備耐性</th><th>ステ耐性</th></tr>${r8}</table></div>
      <div class="tablewrap" style="margin-top:6px"><table class="multi"><tr><th class="l">新状態異常</th><th class="l">効くもの</th><th>装備耐性</th><th>ステ耐性</th><th>持続時間</th></tr>${r9}</table></div>
      <p class="hint" style="margin:4px 0 0">ラトリオの式です。新しい状態異常（無気力・漆黒・強毒など）の耐性は「術者とターゲットのBaseLv差」で決まり、特性ステータスは持続時間を縮めます（開発中のため参考程度）。</p></details></div>`;
}
function stpExtra(r) {                            // 所持限界量・状態異常のステ耐性の合計(ラトリオの表から)
  const w = stpText((r.x || {})[3]).match(/所持限界量\s*([\d,]+)\s*装備品重量合計/), rows = simcXParse((r.x || {})[8], true).filter((y) => !y.hdr);
  const ail = rows.reduce((a, y) => { const p = String(y.val).split("／")[1]; return a + (p ? parseFloat(p) || 0 : 0); }, 0);
  return { weight: w ? +w[1].replace(/,/g, "") : null, ail, ailN: rows.length };
}
// ---- 画面 ----
function stpAspdText(e, TG) {
  const gap = TG - e.raw, a2 = e.a1 + e.up;
  return `<b class="${e.raw >= TG ? "good" : ""}" style="font-size:18px">${simcNum(e.aspd, 1)}</b> <span class="muted">（上限前 ${simcNum(e.raw, 1)}）</span> ${e.raw >= TG ? `<span class="good">目標 ${TG} に届いています</span>` : `<span class="warn">目標 ${TG} まで あと ${simcNum(gap, 1)}</span>`}
    <div class="muted" style="font-size:12px">内訳: 素（武器・AGI・DEX・ポーション等）<b>${simcNum(e.a1, 1)}</b> → 装備の攻撃速度+${simcNum(e.U)}%で <b>+${simcNum(e.up, 1)}</b> → 装備・スキルの ASPD+ <b>${e.P >= 0 ? "+" : ""}${simcNum(e.P, 1)}</b> → 合計 ${simcNum(e.raw, 1)}（表示の上限は 193）</div>`;
}
function stpMainHtml(m, S) {
  const O = SIMC.opt, d = S.d, e = stpEval({ mm: m }, d, [3, 8, 9]), e0 = stpEval({ mm: m }, Object.assign({}, m.status, Object.fromEntries(STP_TRAIT.map((k, i) => [k, (m.pureStatus || [])[6 + i] || 0]))), [3, 8, 9]), ex = stpExtra(e.r), ex0 = stpExtra(e0.r), P = simcPoints(m), TG = stpTarget();
  const used = STP_KEYS.reduce((a, k) => a + stpCost(d[k]), 0), remain = P ? P.earned - used : null, MAXV = SIMC_STMAX;
  const dl = (v, v0, f = 0) => { const x = Math.round((v - v0) * Math.pow(10, f)) / Math.pow(10, f); return x ? ` <span class="${x > 0 ? "good" : "warn"}">(${x > 0 ? "+" : ""}${simcNum(x, f)})</span>` : ""; };
  const row = (k) => { const v = d[k], tot = v + e.bonus[k], base = m.status[k] || 1;
    return `<tr><td><b>${STP_LABEL[k]}</b></td><td class="stpc"><button class="ghost stpbtn" data-stpd="${k}:-10">−10</button><button class="ghost stpbtn" data-stpd="${k}:-1">−</button><input type="number" class="stpin" min="1" max="${MAXV}" data-stpv="${k}" value="${v}"><button class="ghost stpbtn" data-stpd="${k}:1">＋</button><button class="ghost stpbtn" data-stpd="${k}:10">＋10</button></td>
      <td class="v">${e.bonus[k] ? `+${e.bonus[k]}` : "0"}</td><td class="v"><b>${tot}</b></td><td class="v muted">${v < MAXV ? stpCost(v + 1) - stpCost(v) : "-"}</td><td class="v muted">${stpCost(v)}</td><td class="muted">${v !== base ? `基本ステータス ${base}` : ""}</td></tr>`; };
  const trow = (k, i) => { const v = d[k], K = STP_TLABEL[k], bon = (e.r.tot[K] || 0) - v, base = (m.pureStatus || [])[6 + i] || 0;
    return `<tr><td><b>${K}</b></td><td class="stpc"><button class="ghost stpbtn" data-stpd="${k}:-10">−10</button><button class="ghost stpbtn" data-stpd="${k}:-1">−</button><input type="number" class="stpin" min="0" max="${STP_TMAX}" data-stpv="${k}" value="${v}"><button class="ghost stpbtn" data-stpd="${k}:1">＋</button><button class="ghost stpbtn" data-stpd="${k}:10">＋10</button></td>
      <td class="v">${bon ? `+${bon}` : "0"}</td><td class="v"><b>${v + bon}</b></td><td class="muted" colspan="3">${v !== base ? `特性ステータス ${base}` : ""}</td></tr>`; };
  return `<div class="stpmainw"><div><table class="multi"><tr><th>ステータス</th><th>素のステータス（試算）</th><th title="装備・カード・エンチャント・セット効果・支援・アイテムによる分">補正</th><th>合計</th><th title="あと1ポイント上げるのに要るポイント。上げるほど増えます">次の1ptの費用</th><th title="このステータスにここまでで使ったポイント">使用pt</th><th></th></tr>${STP_KEYS.map(row).join("")}<tr><td colspan="7" class="muted" style="padding-top:8px">特性ステータス（状態異常の耐性・持続時間、RES/MRES に効きます。ポイントは別枠のため、費用は出しません）</td></tr>${STP_TRAIT.map(trow).join("")}</table>
    <div class="opts"><span>使うポイント <b>${used}</b> ／ もらえる ${P ? P.earned : "-"} → 余り <b class="${remain !== null && remain < 0 ? "warn" : "good"}">${remain === null ? "-" : remain}</b></span>
      <button id="stpreflect" ${STP_KEYS.every((k) => d[k] === (m.status[k] || 1)) && STP_TRAIT.every((k, i) => d[k] === ((m.pureStatus || [])[6 + i] || 0)) ? "disabled" : ""} title="試算のステータスを、基本ステータスの欄に入れます">基本ステータスに反映</button><button class="ghost" id="stpreset" ${S.touched ? "" : "disabled"}>基本ステータスの値に戻す</button></div></div>
    <div class="stpres"><div><div class="muted">ASPD（装備・支援の補正込み）</div>${O.aspd ? stpAspdText(e, TG) : `<b>${simcNum(e.aspd, 1)}</b>`}${dl(e.aspd, e0.aspd, 1)}</div>
      <div><div class="muted">詠唱の値（DEX×2+INT。補正込み）</div><b class="${e.castP >= 530 ? "good" : ""}" style="font-size:18px">${simcNum(e.castP)}</b> <span class="muted">／ 530 で変動詠唱なし</span>${dl(e.castP, e0.castP)}
        <div class="muted" style="font-size:12px">= DEX ${d.dex}+${e.bonus.dex}（補正）= ${d.dex + e.bonus.dex} の2倍 ＋ INT ${d.int}+${e.bonus.int} = ${d.int + e.bonus.int}</div></div>
      ${stpDmgBlock(m, d)}
      ${stpAilBlock(e, e0)}
      <div><div class="muted">最大HP ／ 所持限界量 ／ 状態異常のステ耐性の合計</div>${simcNum(e.hp)}${dl(e.hp, e0.hp)} ／ ${ex.weight === null ? "-" : simcNum(ex.weight)}${ex.weight !== null && ex0.weight !== null ? dl(ex.weight, ex0.weight) : ""} ／ ${simcNum(ex.ail)}%${dl(ex.ail, ex0.ail)}</div>${stpSurplus(d, e, O)}</div></div>`;
}
function stpDmgBlock(m, d) {                     // ダメージ(サンドバックマン): 試算のステータスと、基本ステータス欄の値(いま)の比べ
  const base = simcSbAvg(m, m.status, false), cur = simcSbAvg(m, d, false), fxOn = atkActiveIds(null).length > 0;
  if (!base || !cur) return "";
  const baseF = fxOn ? simcSbAvg(m, m.status, true) : null, curF = fxOn ? simcSbAvg(m, d, true) : null;
  const f2 = (v) => (Math.round((v || 0) * 100) / 100).toFixed(2), big = (v) => `<b style="font-size:18px">${stpKM(v)}</b>`;
  const one = (c, b) => `1回 ${big(c.avg)} <span class="muted">（基準 ${stpKM(b.avg)}）</span> ${stpDelta(c.avg, b.avg)}<br>DPS ${big(c.dps)} <span class="muted">（基準 ${stpKM(b.dps)}）</span> ${stpDelta(c.dps, b.dps)}`;
  const tm = (c, b) => `<div class="muted" style="font-size:12px">1回の時間 ${f2(c.castV + c.castF + c.ivl)} 秒 = 変動詠唱 ${f2(c.castV)}${c.castV !== b.castV ? `（基準 ${f2(b.castV)}）` : ""} + 固定詠唱 ${f2(c.castF)}${c.castF !== b.castF ? `（基準 ${f2(b.castF)}）` : ""} + ディレイ・間隔 ${f2(c.ivl)}${c.ivl !== b.ivl ? `（基準 ${f2(b.ivl)}）` : ""}${c.ground ? " ／ 設置スキルなので、DPS は詠唱を数えず間隔で割ります" : ""}</div>`;
  return `<div><div class="muted">ダメージと DPS（サンドバックマン ${esc(cur.name)}。比べる相手は、基本ステータス欄の値。DPS はラトリオの計算で、詠唱（変動・固定）とディレイを入れた 1 秒あたり）</div>
    <div>バフなし<br>${one(cur, base)}${tm(cur, base)}</div>
    ${fxOn && curF && baseF ? `<div style="margin-top:6px">時限効果込み<br>${one(curF, baseF)}${tm(curF, baseF)}</div>` : `<div class="muted" style="font-size:12px">時限効果（真理の解放・暴走した魔力など）をオンにすると、「時限効果込み」も出ます（上の小型サンドバックマン）</div>`}</div>`;
}
const stpDd = (a, b) => (a ? `${stpKM(a.avg)} ${b ? stpDelta(a.avg, b.avg) : ""}<div class="muted" style="font-size:11px">DPS ${stpKM(a.dps)} ${b ? stpDelta(a.dps, b.dps) : ""}</div>` : "-");
function stpSurplus(d, e, O) {                   // 詠唱の値が 530 を超えている分は、INT を下げて AGI に回せる
  if (!O.cast || e.castP <= 530) return "";
  const sur = e.castP - 530, it = Math.min(sur, d.int - 1), saved = stpCost(d.int) - stpCost(d.int - it);
  return `<div class="muted" style="font-size:12px">詠唱の値が <b>${sur}</b> 余っています（INT を ${it} 下げても無詠唱のまま。${saved} ポイント浮きます）。<b>「ASPD を最大にする振り方」</b>で、この余りを AGI に回した案が出ます。</div>`;
}
function stpPatsHtml(m, rows, total) {
  SIMC.keepView = rows;
  const n = simcNum, O = SIMC.opt, TG = stpTarget(), sg = (v) => (v > 0 ? "+" : "") + n(v);
  let h = `<div class="muted" style="font-size:12px;margin:4px 0">選んだ装備パターンを、上の試算のステータス・いまの支援のまま着せた結果です。装備・カード・エンチャント・セット効果・ランダムオプション・精錬の効果も、実際に着ているときと同じ状態で入ります（習得スキルはいまのキャラのもの）。</div>
    <div style="overflow-x:auto"><table class="multi"><tr><th>装備パターン</th><th>ASPD</th><th title="武器・AGI・DEX・ポーション等">素</th><th>攻撃速度+%</th><th>ASPD+</th><th>AGI補正</th><th>DEX補正</th><th>INT補正</th><th>詠唱の値</th><th>変動詠唱の短縮</th><th>固定詠唱の短縮</th><th>ディレイ短縮</th><th>最大HP</th><th>判定</th></tr>`
    + rows.map((x, ri) => {
      const okA = !O.aspd || x.raw >= TG, okC = !O.cast || x.castP >= 530;
      return `<tr><td>${x.colors && x.colors.length ? `<span class="setdot" style="background:${simcGrad(x.colors)}"></span>` : ""}${esc(x.label)}${x.learned && x.learned.length ? ` <span class="tag" title="【習】の装備・カード（習得スキルのレベルで効果が変わる）: ${esc(x.learned.join("、"))}">習 ${x.learned.length}</span>` : ""}${simcMissHtml(x.missRows, ri)}</td>
        <td class="v"><b class="${x.raw >= TG ? "good" : ""}">${n(x.aspd, 1)}</b></td><td class="v">${n(x.a1, 1)}</td><td class="v">${n(x.U)}%</td><td class="v">${sg(x.P)}</td>
        <td class="v">${sg(x.bonus.agi)}</td><td class="v">${sg(x.bonus.dex)}</td><td class="v">${sg(x.bonus.int)}</td><td class="v"><span class="${x.castP >= 530 ? "good" : ""}">${n(x.castP)}</span></td>
        <td class="v">${n(x.cast)}%</td><td class="v">${n(x.fixed)}%</td><td class="v">${n(x.delay)}%</td><td class="v">${n(x.hp)}</td>
        <td>${okA && okC ? `<span class="good">維持できる</span>` : `<span class="warn">${[!okA ? "ASPD あと " + n(TG - x.raw, 1) : "", !okC ? "詠唱 あと " + (530 - x.castP) : ""].filter(Boolean).join(" ／ ")}</span>`}</td></tr>`;
    }).join("") + `</table></div>`;
  if (rows.length < total) return h + `<div class="spin">計算中… ${rows.length} / ${total}</div>`;
  const bad = rows.filter((x) => (O.aspd && x.raw < TG) || (O.cast && x.castP < 530));
  return h + `<div class="multisum">${bad.length ? `<span class="warn">いまの試算では、${bad.length} / ${rows.length} パターンで条件を満たせません。</span>` : `<span class="good">選んだ ${rows.length} パターンの全部で、条件を満たしています。</span>`}</div>`;
}
function stpSugHtml(m, S) {
  const R = S.sug && S.sugSig === stpSugSig(m, S) ? S.sug : null, O = SIMC.opt, d = S.d;
  if (!R) return `<div class="spin">いちばん安い振り方を計算中…</div>`;
  const P0 = simcPoints(m), curSpend = stpCost(d.agi) + stpCost(d.dex) + stpCost(d.int), others = stpCost(d.vit) + stpCost(d.str) + stpCost(d.luk);
  let failH = "";
  if (R.fail) {
    const TG = stpTarget(), MAXVv = SIMC_STMAX;
    failH = `<div class="warn">${esc(R.fail)}</div><div class="muted" style="font-size:12px;margin:4px 0">無詠唱（詠唱の値 530）は維持して、AGI を上限まで振った案です。「目標まで」の「AGI 130＋○○」は、<b>AGI を上限 130 まで振っても、装備・支援の補正があと ○○ 足りない</b>という目安です（ASPD ${TG} に届くのに要る AGI から、上限 130 を引いた分）。詠唱の値で余った分（INT・DEX）は、AGI に回しています。</div>
      <table class="multi"><tr><th>振り方</th><th>AGI</th><th>DEX</th><th>INT</th><th>ポイント</th><th>余り</th><th title="ラトリオの計算で全パターンを確かめた、いちばん低い ASPD">ASPD（最小）</th><th>目標まで</th><th>詠唱の値</th><th></th></tr>
      ${R.best.map((c, i) => `<tr><td>${esc(c.label)}</td><td class="v"><b>${c.agi}</b></td><td class="v">${c.dex}</td><td class="v">${c.int}</td><td class="v">${c.cost} <span class="muted">(${c.cost - curSpend >= 0 ? "+" : ""}${c.cost - curSpend})</span></td><td class="v">${P0 ? P0.earned - (c.cost + others) : "-"}</td>
        <td class="v"><b class="${c.minRaw >= TG ? "good" : ""}">${simcNum(c.minRaw, 1)}</b></td><td class="v">${c.minRaw >= TG ? `<span class="good">届く</span>` : `<span class="warn">あと ${simcNum(TG - c.minRaw, 1)}</span> <span class="muted">${c.more ? `= AGI <b>${MAXVv}＋${c.more}</b>（補正があと +${c.more}）` : `= AGI ${c.need} まで振れば届く`}</span>`}</td><td class="v"><span class="${c.minCast >= 530 ? "good" : "warn"}">${simcNum(c.minCast)}</span></td><td><button class="ghost" data-stpapply="b${i}">試算に入れる</button></td></tr>`).join("")}</table>`;
    if (!R.list.length) return failH;
  }
  const cur = stpCost(d.agi) + stpCost(d.dex) + stpCost(d.int), P = simcPoints(m);
  const fxOn = atkActiveIds(null).length > 0, d0 = simcSbAvg(m, d, false), d0f = fxOn ? simcSbAvg(m, d, true) : null;
  const dcell = (c) => `<td class="v">${stpDd(c.dmg, d0)}</td>${fxOn ? `<td class="v">${stpDd(c.dmgF, d0f)}</td>` : ""}`;
  const row = (label, c, i) => { const dd = c.cost - cur, rem = P ? P.earned - (c.cost + stpCost(d.vit) + stpCost(d.str) + stpCost(d.luk)) : null;
    return `<tr><td>${label}</td><td class="v">${c.agi}</td><td class="v">${c.dex}</td><td class="v">${c.int}</td><td class="v">${c.cost} <span class="muted">(${dd === 0 ? "±0" : (dd > 0 ? "+" : "") + dd})</span></td><td class="v">${rem === null ? "-" : rem}</td>
      ${i === undefined ? `<td class="v">${stpDd(d0)}</td>${fxOn ? `<td class="v">${stpDd(d0f)}</td>` : ""}` : dcell(c)}
      <td>${i === undefined ? "" : c.ok === false ? `<span class="warn">確かめると届きません</span>` : `<span class="good">全パターンOK</span>`}</td><td>${i === undefined ? "" : `<button class="ghost" data-stpapply="${i}">試算に入れる</button>`}</td></tr>`; };
  return failH + `<div class="muted" style="font-size:12px;margin:4px 0">条件（${[O.aspd ? "ASPD " + stpTarget() : "", O.cast ? "変動詠唱なし" : ""].filter(Boolean).join(" と ")}）を、選んだ全部の装備パターンで満たす AGI・DEX・INT のうち、使うポイントがいちばん少ない振り方です（式で出して、ラトリオの計算で確かめています）。ポイントは上げるほど1ポイントあたりが重くなるので、ふつうは「条件に要る分だけ」で止めるのが得です。</div>
    <table class="multi"><tr><th>振り方</th><th>AGI</th><th>DEX</th><th>INT</th><th>AGI・DEX・INT に使うポイント<br>（いまの試算との差）</th><th title="この振り方にして、VIT・STR・LUK は試算のままのときの、余りのポイント">余り</th><th title="サンドバックマンのメインスキル1回の平均と DPS。かっこは、いまの試算との差（実数と%）">ダメージ・DPS</th>${fxOn ? `<th title="オンにしている時限効果（真理の解放・暴走した魔力など）がかかったとき">時限効果込み</th>` : ""}<th>確認</th><th></th></tr>
    ${row("いまの試算", { agi: d.agi, dex: d.dex, int: d.int, cost: cur })}${R.list.map((c, i) => row(i === 0 ? "<b>いちばん安い</b>" : "ほかの候補", c, i)).join("")}</table>
    <div class="muted" style="font-size:12px">AGI が効く理由: ASPD の式で AGI は DEX の約55倍効きます。DEX は主に詠唱の値（DEX×2+INT）のために振ります。${R.hint ? esc(R.hint) : ""}</div>`;
}
function stpSwHtml(m, S) {
  const R = S.swR && S.swSig === stpSwSig(m, S) ? S.swR : null;
  if (!R) return `<div class="spin">計算中…（枠を開いたときに計算します）</div>`;
  const B = R.rows[0], fxOn = R.fxOn;
  // 段差: 1刻みあたりの下がり方が、ほかの刻みの 1.8 倍以上のところ(= そのあいだで、ステータスの条件つきの効果が外れた/付いた可能性)
  const drops = R.rows.map((x, i) => (i && R.rows[i - 1].dmg ? Math.abs(x.dmg - R.rows[i - 1].dmg) / R.rows[i - 1].dmg : 0)), srt = drops.slice(1).sort((a, b) => a - b), med = srt.length ? srt[srt.length >> 1] : 0;
  const jump = (i) => i && drops[i] > med * 1.8 && drops[i] - med > 0.004;
  return `<div class="muted" style="font-size:12px;margin:4px 0">${STP_LABEL[S.sw.stat]} を ${S.sw.dir < 0 ? "下げた" : "上げた"}ときの、サンドバックマン（${esc(R.name || "")}）1回の平均ダメージです。増減は、いまの試算の値（先頭の行）との差で、実数と%。条件で効果が出る装備・カード・エンチャント（INT 110 以上で…など）は、ラトリオの計算で自動で入るので、段差があればそこで数字が動きます。詠唱の値が 530 を下回ると、変動詠唱が出ます。</div>
    <table class="multi"><tr><th>${STP_LABEL[S.sw.stat]}</th><th>使うポイント</th><th>ASPD</th><th>詠唱の値</th><th>ダメージ・DPS</th>${fxOn ? "<th>時限効果込み</th>" : ""}<th></th></tr>
    ${R.rows.map((x, i) => `<tr><td><b>${x.v}</b>${i === 0 ? ' <span class="muted">（いまの試算）</span>' : ""}</td><td class="v">${x.cost} ${i ? stpDelta0(x.cost - B.cost) : ""}</td><td class="v">${simcNum(x.aspd, 1)}</td><td class="v"><span class="${x.castP >= 530 ? "" : "warn"}">${simcNum(x.castP)}</span></td>
      <td class="v">${stpSwCell(x.dmg, x.dps, i ? B.dmg : null, i ? B.dps : null)}</td>${fxOn ? `<td class="v">${stpSwCell(x.dmgF, x.dpsF, i ? B.dmgF : null, i ? B.dpsF : null)}</td>` : ""}<td>${jump(i) ? `<span class="warn" title="この刻みだけ、下がり方がほかの刻みより大きいです。ステータスの条件で効果が出る装備・カード・エンチャントが外れた可能性があります（刻みを1にすると、境目が分かります）">⚠ 段差</span>` : ""}</td></tr>`).join("")}</table>`;
}
const stpSwCell = (v, dp, bv, bdp) => v === null || v === undefined ? "-" : `${stpKM(v)} ${bv !== null && bv !== undefined ? stpDelta(v, bv) : ""}<div class="muted" style="font-size:11px">DPS ${stpKM(dp)} ${bdp !== null && bdp !== undefined ? stpDelta(dp, bdp) : ""}</div>`;
const stpDelta0 = (v) => `<span class="muted">(${v >= 0 ? "+" : "−"}${Math.abs(v)})</span>`;
function stpEffHtml(m, S) {
  const R = S.eff && S.effSig === stpEffSig(m, S) ? S.eff : null;
  if (!R) return `<div class="spin">ポイントを足したときの影響を調べています…</div>`;
  const n = simcNum, dl = (v, v0, f = 0) => { const x = Math.round((v - v0) * Math.pow(10, f)) / Math.pow(10, f); return x ? `<span class="${x > 0 ? "good" : "warn"}">${x > 0 ? "+" : ""}${n(x, f)}</span>` : `<span class="muted">±0</span>`; };
  return `<div class="muted" style="font-size:12px;margin:4px 0">各ステータスを +10 したときの変化です（いまの試算が基準）。ポイントは上げるほど重いので、条件（ASPD・無詠唱）に要る分のあとは、費用に見合う効果があるものだけ足すのが得です。${R.dmgName ? `ダメージは、サンドバックマンの枠で選んでいるスキル（${esc(R.dmgName)}）の1回の平均です。` : ""}</div>
    <table class="multi"><tr><th>+10 するステータス</th><th>かかるポイント</th><th>ASPD</th><th>詠唱の値</th><th>最大HP</th><th>所持限界量</th><th>状態異常のステ耐性の合計</th><th>${R.dmgName ? "ダメージ・DPS" : ""}</th>${R.fxOn ? "<th>時限効果込み</th>" : ""}<th>効率</th></tr>
    ${R.rows.map((x) => `<tr><td><b>${STP_LABEL[x.k]}</b> ${x.v}→${x.v + x.step}</td><td class="v">${x.cost}</td><td class="v">${dl(x.aspd, R.base.aspd, 1)}</td><td class="v">${dl(x.castP, R.base.castP)}</td><td class="v">${dl(x.hp, R.base.hp)}</td><td class="v">${x.weight === null ? "-" : dl(x.weight, R.base.weight)}</td><td class="v">${dl(x.ail, R.base.ail)}</td>
      <td class="v">${R.dmgName ? (x.dmg === null || R.base.dmg === null ? "-" : stpSwCell(x.dmg, x.dps, R.base.dmg, R.base.dps)) : ""}</td>${R.fxOn ? `<td class="v">${x.dmgF === null || R.base.dmgF === null ? "-" : stpSwCell(x.dmgF, x.dpsF, R.base.dmgF, R.base.dpsF)}</td>` : ""}
      <td class="muted">${x.hp > R.base.hp ? `HP +${n(((x.hp - R.base.hp) / x.cost) | 0)}/pt` : ""}</td></tr>`).join("")}</table>`;
}
const stpSugSig = (m, S) => stpNonStatSig(m) + "|" + JSON.stringify([SIMC.opt.aspd, SIMC.opt.cast, SIMC.opt.target, SIMC.opt.min, S.d.vit, S.d.str, S.d.luk]) + stpDmgSig(m);
const stpEffSig = (m, S) => stpNonStatSig(m) + "|" + JSON.stringify(S.d) + stpDmgSig(m);
const stpSwSig = (m, S) => stpNonStatSig(m) + "|" + JSON.stringify([S.d, S.sw]) + stpDmgSig(m);
// よく使う支援(濃縮サラマインジュース・ブレッシング・速度増加)のスイッチ。「支援・アイテム・スキル」の枠と同じ値を動かす(同期)
function stpBuffHtml(m) {
  const pot = simcPotHtml(m);
  const sc = simcSchema(m); if (!sc) return pot;
  const items = SIMC_QUICK.map(([f, i]) => sc.find((it) => it.f === f && it.i === i)).filter(Boolean); if (!items.length) return pot;
  return pot + `<div class="opts"><b>支援</b><div class="bfgrid" style="flex:1;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${items.map((it) => {
    const k = simcBuffKey(it), v = simcBuffVal(m, it), on = simcBuffOn(m, it);
    return it.type === "c" ? `<label class="bfi sw${on ? " on" : ""}"><input type="checkbox" data-qb="${k}" ${on ? "checked" : ""}><span class="swt"></span><span class="bfl">${esc(simcBuffLabel(it))}</span></label>`
      : it.f === "buff8" && it.i === 22 ? `<label class="bfi sw${on ? " on" : ""}" title="${esc(JONDA_TIP)}"><input type="checkbox" data-qbs="${k}" ${on ? "checked" : ""}><span class="swt"></span><span class="bfl">${esc(simcBuffLabel(it))}</span><span class="muted" style="font-size:11px">ポーション・HIT/FLEE+10・HP/SP+20%</span></label>`
      : `<label class="bfi sw${on ? " on" : ""}"><input type="checkbox" data-qbs="${k}" ${on ? "checked" : ""}><span class="swt"></span><span class="bfl">${esc(simcBuffLabel(it))}</span><select data-qb="${k}">${it.opts.map((o) => `<option value="${o[0]}" ${o[0] === (Number(v) || 0) ? "selected" : ""}>${esc(o[0] === 0 ? "なし" : o[1])}</option>`).join("")}</select></label>`;
  }).join("")}</div><span class="muted">「支援・アイテム・スキル」の枠と同じものです</span></div>`;
}
// いま着ている装備スロット(記号つきで登録ずみ・手を加えていない)の ID。「いまの装備」はこれと同じ中身なので、この記号のチップも選択済みに見せる
function stpNowSid(m, shadow) { const sid = shadow ? m.foxShadow : m.foxSet; return sid && !simcDirty(m, shadow) && simcSetList(m, shadow).tabs.some((x) => x.sid === sid) ? sid : ""; }
function stpSbCtl(m) {
  if (!ENG.sb) return "";
  let T; try { T = stpSbMt(m); } catch (e) { return ""; }
  if (!T) return "";
  const cfg = T.cfg, sel = (id, arr, cur) => `<select data-stpsb="${id}">${arr.map((t, i) => `<option value="${i}" ${i === cur ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  let kind = "b"; try { kind = stpSbKind(simcClone(m), cfg, T.mt); } catch (e) { /* 判定できなければ両方 */ }
  const fx = atkFxAll().filter((e) => e.kind === "b" || e.kind === kind || kind === "b");
  const owned = atkOwnedNames(m);
  return `<div class="stpsbc"><div class="muted" style="font-size:12px">サンドバックマンの枠と同じ設定です。ステータスを変えたときの、メインスキル1回の平均ダメージ。グレーの文字の効果は、いまの装備に付いていません（試したいときは選べます）</div>
    <div class="bfbar"><label>スキル <select data-stpsb="full">${T.methods.filter((x) => x.skill !== 0 || T.methods.length === 1).map((x) => `<option value="${esc(x.full)}" ${x.full === cfg.full ? "selected" : ""}>${esc(atkMethodLabel(x))}</option>`).join("")}</select></label>
      ${T.chain.map((c, i) => c.ol.type === 0 ? `<label>${esc(i === 0 ? "Lv" : c.ol.label || "設定")} <select data-stpsb="o:${i}">${c.ol.opts.map((o) => `<option value="${esc(o[0])}" ${o[0] === c.v ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select></label>` : `<label>${esc(c.ol.label || "設定")} <input type="number" data-stpsb="o:${i}" value="${esc(c.v)}" style="width:6em"></label>`).join("")}
      <span class="tag">${kind === "p" ? "物理" : kind === "m" ? "魔法" : "物理・魔法"}</span></div>${sereHtml(m, T.item.skill)}
    <div class="bfbar"><label>種類 ${sel("kind", SB_KINDS, cfg.kind)}</label><label>種族 ${sel("race", SB_RACES, cfg.race)}</label><label>属性 ${sel("ele", SB_ELES, cfg.ele)}</label>
      <label>属性Lv <select data-stpsb="lv">${[1, 2, 3, 4].map((i) => `<option value="${i}" ${i === cfg.lv ? "selected" : ""}>Lv${i}</option>`).join("")}</select></label><label>サイズ ${sel("size", SB_SIZES, cfg.size)}</label></div>
    ${atkFxCtlHtml(null)}<div class="atkfxl" style="margin:4px 0"><span class="muted">時限効果（「時限効果込み」に出します。「与ダメシミュ」と共通。左クリックで個数 +1・右クリックで −1）</span>${fx.map((e) => atkChip(e, owned)).join("")}</div></div>`;
}
// ゲームの表示(通信で覚えた、そのキャラの最後のステータス)と、アプリの計算の突き合わせ。差があれば、ゲームで使っている支援・食品・ポーションがアプリで未設定かもしれない
function stpGameCmp(m) {
  const ch = lastChar(), E = ((DATA.equip || {}).chars || {})[ch];
  if (!E || !(E.status || {}).derived) return `<div class="muted">ゲームのキャラのデータがありません（ゲームにログインすると、ステータスを覚えます）。</div>`;
  const g = E.status.derived, gs = E.status.stats || {}, r = engCalc(simcClone(m)), c = r.c, tot = r.tot;
  const gt = (k) => (gs[k] ? (gs[k].base || 0) + (gs[k].plus || 0) : null);
  const aspdG = g.ASPD !== undefined ? Math.round((200 - g.ASPD / 10) * 10) / 10 : null;          // ゲームの ASPD = 200 − amotion/10
  const rows = [["ASPD", aspdG, c[37], 1, 37], ...["STR", "AGI", "VIT", "INT", "DEX", "LUK"].map((k) => [k + "（合計）", gt(k), tot[k], 0, -1]), ["最大HP", g.MaxHP, c[23], 0, 23], ["最大SP", g.MaxSP, c[24], 0, 24],
    ["ATK（ステータス分）", g.ATK, c[25], 0, 25], ["ATK（装備分）", g.ATK2, c[26], 0, 26], ["MATK（大）", g.MATKmax, c[27], 0, 27], ["MATK（小）", g.MATKmin, c[28], 0, 28], ["DEF", g.DEF, c[29], 0, 29], ["DEF（装備分）", g.DEF2, c[30], 0, 30], ["MDEF", g.MDEF, c[31], 0, 31], ["MDEF（装備分）", g.MDEF2, c[32], 0, 32],
    ["HIT", g.HIT, c[33], 0, 33], ["FLEE", g.FLEE, c[34], 0, 34], ["CRI", g.CRIT, c[35], 1, 35]].filter((x) => x[1] !== null && x[1] !== undefined);
  const n = simcNum, diff = rows.filter((x) => Math.abs((x[2] || 0) - (x[1] || 0)) > (x[3] ? 0.15 : 0.5));
  // ASPD の差は、ポーションの違いで説明できることが多い(4通りを試す)
  let hint = "";
  const otp = +((m.buff8 || [])[22]) || 0;
  if (otp < 4) {           // ジョンダのサポート魔法をオンにすると、差がどれだけ減るか
    try {
      const mj = simcClone(m); mj.buff8 = (mj.buff8 || []).slice(); mj.buff8[22] = 4; const c2 = engCalc(mj).c;
      const cnt = (cc) => rows.filter((x) => x[4] >= 0 && Math.abs((cc[x[4]] || 0) - (x[1] || 0)) > (x[3] ? 0.15 : 0.5)).length;
      const n0 = cnt(c), n1 = cnt(c2);
      if (n1 < n0) hint += `<div class="warn">ゲームでは「ジョンダのサポート魔法」がかかっているようです。オンにすると、差のある項目が ${n0} → ${n1} 個に減ります。<button class="ghost" data-jonda="1">ジョンダのサポート魔法をオンにする</button></div>`;
    } catch (e) { /* 照合の補助なので、失敗しても表は出す */ }
  }
  if (aspdG !== null && otp < 2) {
    const hit = STP_POTS.map((t, i) => { const mm = simcClone(m); mm.status.speedPot = i; return { t, i, a: engCalc(mm).c[37] }; }).filter((x) => Math.floor(x.a + 1e-9) === Math.floor(aspdG + 1e-9));
    const now = m.status.speedPot || 0;
    hint += hit.length ? (hit.some((x) => x.i === now) ? `<div class="good">いまのポーションの設定（${esc(STP_POTS[now])}）で、ASPD はゲームと合っています。</div>` : `<div class="warn">ゲームの ASPD ${n(aspdG, 1)} に合うのは、ポーションが <b>${hit.map((x) => esc(x.t) + "（" + n(x.a, 1) + "）").join("、")}</b> のとき。いまの設定は「${esc(STP_POTS[now])}」です。</div>`) : `<div class="warn">ポーションを変えても、ゲームの ASPD ${n(aspdG, 1)} には合いません（ほかの支援・食品・スキルが、ゲームで効いているかもしれません）。</div>`;
  }
  return `<div class="muted" style="font-size:12px;margin:4px 0">ゲームのキャラ「${esc(cn(ch))}」が最後にログインしたときのステータスと、アプリの計算（いまのスロット）を比べます。スロットの装備・支援・ポーションが、ゲームと同じときだけ意味があります。</div>${hint}
    <table class="multi"><tr><th>項目</th><th>ゲーム</th><th>アプリ</th><th>差</th></tr>${rows.map(([l, a, b, f]) => { const d = (b || 0) - (a || 0), ok = Math.abs(d) <= (f ? 0.15 : 0.5);
      return `<tr><td>${l}</td><td class="v">${n(a, f)}</td><td class="v">${n(b, f)}</td><td class="v">${ok ? `<span class="good">一致</span>` : `<span class="warn">${d > 0 ? "+" : "−"}${n(Math.abs(d), f)}</span>`}</td></tr>`; }).join("")}</table>
    <div class="muted" style="font-size:12px">${diff.length ? `${diff.length} 項目に差があります。HP・HIT・FLEE・CRI の差は、ゲームで食べている食品・使っているアイテムが、アプリの「支援・アイテム・スキル」に入っていないためかもしれません。` : "全項目が一致しています。"}</div>`;
}
function stpSbSum(m) { try { const T = stpSbMt(m); if (!T) return ""; const c = T.cfg; return `${T.item.name} Lv${T.mt.lv} ／ ${SB_KINDS[c.kind]}・${SB_RACES[c.race]}・${SB_ELES[c.ele]}${c.lv}・${SB_SIZES[c.size]}${atkActiveIds(null).length ? ` ／ 時限効果 ${atkActiveIds(null).length} 個` : ""}`; } catch (e) { return ""; } }
function stpHtml(m) {
  const S = stpState(), O = SIMC.opt, sel = simcOptSel(m), tM = simcSetList(m, false).tabs, tS = simcSetList(m, true).tabs, combos = sel.main.length * sel.sh.length;
  const chip = (attr, id, text, on, st2) => `<button class="settab${on ? " on" : ""}" ${attr}="${esc(id)}" ${st2 ? `style="--c:${tagColor(st2)}"` : ""}>${esc(text)}</button>`;
  const oc = simcOptColors(m), okRows = S.rows && S.rowSig === stpRowSig(m, S);
  return `<div id="stp"><div class="bfbar"><span class="muted">条件</span>
      <button class="ghost" id="stprecalc" title="シミュレーターの計算結果を全部捨てて、いまの設定で計算し直します（数字が更新されていないと思ったときに）">再計算</button><label><input type="checkbox" id="soa" ${O.aspd ? "checked" : ""}> ASPD を維持</label><label>目標 <input type="number" id="sotg" min="100" max="193" step="0.1" value="${esc(O.target)}" style="width:5.5em"></label>
      <label><input type="checkbox" id="soc" ${O.cast ? "checked" : ""}> 変動詠唱なし（詠唱の値 530）</label>
      <span class="muted" title="これより下げない値。たとえば MATK のために INT は 120 以上にしたいとき">下限</span>${["agi", "dex", "int"].map((k) => `<label>${k.toUpperCase()} <input type="number" min="1" max="${SIMC_STMAX}" data-optmin="${k}" value="${O.min[k] || 1}"></label>`).join("")}</div>
    ${stpBuffHtml(m)}
    <div class="muted" style="font-size:12px;margin:2px 0">想定している支援・アイテム: <b>${esc(simcBuffSum(m).replace(/^オン \d+個: /, "") || "なし")}</b>（「支援・アイテム・スキル」の枠のオンのもの）</div>
    <div id="stpmain">${stpMainHtml(m, S)}</div>
    ${simcFold("stppat", "装備パターンごとの確認", `    <div class="bfbar"><div class="settabs"><span class="muted">装備スロット</span>${chip("data-optm", "now", "いまの装備", sel.main.includes("now"))}${tM.map(({ sid, st: s2 }) => chip("data-optm", sid, s2.tag, sel.main.includes(sid) || (sid === stpNowSid(m, false) && sel.main.includes("now")), s2)).join("")}</div>
      <div class="settabs"><span class="muted">シャドウのスロット</span>${chip("data-opts", "now", "いまのシャドウ", sel.sh.includes("now"))}${tS.map(({ sid, st: s2 }) => chip("data-opts", sid, s2.tag, sel.sh.includes(sid) || (sid === stpNowSid(m, true) && sel.sh.includes("now")), s2)).join("")}</div>
      <span class="muted">${combos} 通り${combos > SIMC_OPT_COMBO_MAX ? `<span class="warn">（多いので先頭の ${SIMC_OPT_COMBO_MAX} 通りだけ）</span>` : ""}</span></div>
    ${(() => { const L = simcLearnedList(m), n = simcLearnedCount(m); return L.length || n === 0 ? `<div class="muted" style="font-size:12px;margin:4px 0">【習】の装備（習得スキルのレベルで効果が変わる）: <b>${L.length ? esc(L.join("、")) : "いまの装備には無し"}</b>。習得スキルは、いまのキャラのものを使います（${n === null ? "確認中" : n === 0 ? `<span class="warn">入っていません。【習】の効果が出ません。「現在のキャラを反映」で入れてください</span>` : n + " 個入っています"}）。</div>` : ""; })()}
    <div id="stppats" class="${oc.length ? "setframe" : ""}" style="--fc:${simcGrad(oc)}">${okRows ? stpPatsHtml(m, S.rows, S.rows.length) : `<div class="spin">計算中…</div>`}</div>
`, ` <span class="muted">（選んだ装備スロット × シャドウのスロットを、いまのステータス・支援で着せた結果）</span>`, true)}
    ${simcFold("stpsb", "ダメージの目安（小型サンドバックマン）", stpSbCtl(m), ` <span class="muted">${esc(stpSbSum(m))}</span>`, false)}
    ${simcFold("stpas", "ASPD の目安（サンドバックマンで選んだスキル）", `<div id="stpas">${stpAsHtml(m, S)}</div>`, ` <span class="muted">（「計算する」を押すと出ます）</span>`, false)}
    ${simcFold("stpgame", "ゲームの表示との照合（ASPD・ステータス・HP など）", simcFoldState().stpgame ? stpGameCmp(m) : `<div class="muted">開くと、ゲームの表示とアプリの計算を比べます。</div>`, ` <span class="muted">（食い違いの確認）</span>`, false)}
    <div class="stph">いちばん安い振り方（提案）</div><div id="stpsug">${stpSugHtml(m, S)}</div>
    ${simcFold("stpsw", "ステータスを変えたときのダメージ（INT を下げたらどれくらい？）", `<div class="bfbar"><label>ステータス <select data-stpswc="stat">${STP_KEYS.map((k) => `<option value="${k}" ${S.sw.stat === k ? "selected" : ""}>${STP_LABEL[k]}</option>`).join("")}</select></label>
        <label>向き <select data-stpswc="dir"><option value="-1" ${S.sw.dir < 0 ? "selected" : ""}>下げる</option><option value="1" ${S.sw.dir > 0 ? "selected" : ""}>上げる</option></select></label>
        <label>刻み <input type="number" min="1" max="50" data-stpswc="step" value="${S.sw.step}" style="width:4.5em"></label><label>回数 <input type="number" min="1" max="12" data-stpswc="n" value="${S.sw.n}" style="width:4em"></label></div>
      <div id="stpsw">${stpSwHtml(m, S)}</div>`, ` <span class="muted">（開くと計算します）</span>`, false)}
    ${simcFold("stpeff", "ポイントを足したときの影響（余りの使い道）", `<div id="stpeff">${stpEffHtml(m, S)}</div>`, ` <span class="muted">（開くと計算します）</span>`, false)}</div>`;
}
// 装備・カード・エンチャントの詳細(ラトリオの「アイテム情報」と同じ文章。効果・セット効果つき)。右クリックで出す
async function engInfoHtml(kind, id) {
  const w = ENG.frame.contentWindow, d = ENG.frame.contentDocument;
  ENG.x.info = ENG.x.info || (await w.eval(`import("${engBase()}engine/equip/CItemInfoManager.js")`)).CItemInfoManager;
  const div = d.createElement("div");
  (kind === "card" ? ENG.x.info.RebuildInfoTableSubCardDetail : ENG.x.info.RebuildInfoTableSubItemDetail)(div, id, false);
  return div.innerHTML;
}
function infoPop(ev, title, htmlPromise) {
  document.querySelectorAll(".infopop").forEach((e) => e.remove());
  const el = document.createElement("div"); el.className = "infopop";
  el.innerHTML = `<div class="infoh"><b>${esc(title)}</b><a class="infox" title="閉じる">×</a></div><div class="infob"><span class="spin">読み込み中…</span></div>`;
  document.body.appendChild(el);
  infoPlace(el, ev);
  el.querySelector(".infox").onclick = () => el.remove();
  Promise.resolve(htmlPromise).then((h) => { el.querySelector(".infob").innerHTML = h || `<span class="muted">説明がありません（ラトリオに効果の記述がないものです）</span>`; infoPlace(el, ev); }).catch((e) => { el.querySelector(".infob").innerHTML = `<span class="warn">読み込めませんでした: ${esc(e.message)}</span>`; infoPlace(el, ev); });
}
// 詳細の窓を、押した位置の近くで、画面の中(下・右にはみ出さない)に置く。高さが足りなければ上へずらし、それでも入らなければ窓の中をスクロールする(.infopop は overflow:auto)
function infoPlace(el, ev) {
  const W = window.innerWidth, H = window.innerHeight, M = 8;
  el.style.maxHeight = (H - 2 * M) + "px";
  const w = el.offsetWidth || 430, h = el.offsetHeight || 120;
  el.style.left = Math.max(M, Math.min(ev.clientX + 8, W - w - M)) + "px";
  el.style.top = Math.max(M, Math.min(ev.clientY + 8, H - h - M)) + "px";
}
document.addEventListener("contextmenu", (e) => {          // ASPD の目安の潜在解放のチップ: どの装備の何枠目につくか + 効果の文章
  const sc = e.target.closest && e.target.closest("[data-stpasc]"); const ch0 = sc && simcCur(), S0 = sc && SIMC.stp;
  if (sc && ch0 && S0 && S0.as && !S0.as.err && ENG.ready) {
    const v = +sc.dataset.stpasc, m = ch0.model, hits = S0.as.senzai.filter((x) => x.v === v); if (!hits.length) return; e.preventDefault();
    if (!hits[0].placeable) {
      infoPop(e, hits[0].name, (async () => { const H = await stpSenzaiHolders(m), mine = H[v] || {}; const h = await engInfoHtml("card", v);
        const rows = Object.entries(mine).map(([r, names]) => `<div><b>${esc((SIMC_REGIONS.find(([i]) => i === +r) || [0, "場所" + r])[1])}</b>: ${esc(names.slice(0, 8).join("、"))}${names.length > 8 ? ` ほか ${names.length - 8} 個` : ""}</div>`).join("");
        return `<div style="margin-bottom:6px"><span class="muted">いまの装備にはつけられません。つけられる装備（このキャラの職業で使えるもの）</span>${rows || "<div>見つかりませんでした</div>"}</div>${h}`; })()); return;
    }
    const where = hits.map((x) => { const lb = (SIMC_REGIONS.find(([i]) => i === x.region) || [0, "場所" + x.region])[1], k = SIMC_CARD[x.region].indexOf(x.slot) + 1, cur = m.card[x.slot]; return `<div><b>${esc(lb)}</b>「${esc(simcItemName(m.equip[x.region]))}」の ${k} 枠目${cur && cur !== v ? `（いまは「${esc(simcCardName(cur))}」が入っています）` : cur === v ? "（いま付けています）" : "（いまは空き）"}</div>`; }).join("");
    infoPop(e, hits[0].name, engInfoHtml("card", v).then((h) => `<div style="margin-bottom:6px"><span class="muted">つく装備</span>${where}</div>${h}`)); return;
  }
  const b = e.target.closest && e.target.closest("button[data-item], button[data-card]"); if (!b || !ENG.ready) return;
  const ch = simcCur(); if (!ch) return; const m = ch.model;
  if (b.dataset.item !== undefined) { const r = +b.dataset.item, id = simcItemAt(m, r); if (!id || simcIsNone(r, id)) return; e.preventDefault(); infoPop(e, simcItemName(id), engInfoHtml("item", id)); return; }
  const [r, i] = b.dataset.card.split(":").map(Number), id = m.card[SIMC_CARD[r][i]]; if (!id) return;
  e.preventDefault(); infoPop(e, simcCardName(id), engInfoHtml("card", id));
});
document.addEventListener("click", (e) => { if (!(e.target.closest && e.target.closest(".infopop"))) document.querySelectorAll(".infopop").forEach((x) => x.remove()); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".infopop").forEach((x) => x.remove()); });
const stpRowSig = (m, S) => stpNonStatSig(m) + "|" + JSON.stringify(S.d);
// ---- ASPD の目安: 撃ったあとの待ち = 攻撃モーション・スキルのディレイ・クールタイムのうち、いちばん長いもの(ラトリオの計算と同じ。資料: 思考の果てに「スキルディレイとモーションディレイ」)。
// ASPD が効くのはモーションだけ。モーション(秒) = (200 − ASPD) × 0.02(ASPD 175 = 0.50 … 193 = 0.14)。ほかの待ち(ディレイ・クールタイム)のほうが長ければ、ASPD を上げても周期は縮まない ----
const STP_MOT = (aspd) => Math.max(0, (200 - aspd) * 0.02);
const stpAsSig = (m, S) => stpNonStatSig(m) + "|" + JSON.stringify([S.d, simcSbCfg(m)]);
// ---- ローテーション(複数のスキルを順に撃つ): 別のスキルのクールタイムは待たなくてよい。待ちは、モーション・そのスキルのディレイだけ(同じスキルをまた撃つときは、そのクールタイムが明けるまで)。
// 1周の時間を、周期が落ち着くまで何周かシミュレーションして出す。items = [{cast, delay, cool, dmg}] ----
function stpRotSim(items, aspd) {
  let t = 0, len = 0; const ready = items.map(() => 0), mot = STP_MOT(aspd);
  for (let loop = 0; loop < 14; loop++) {
    const t0 = t;
    items.forEach((x, i) => { const st = Math.max(t, ready[i]), fin = st + x.cast; ready[i] = fin + x.cool; t = fin + Math.max(mot, x.delay); });
    len = t - t0;
  }
  return len;
}
function stpRotCalc(m, S, R) {
  const T = stpSbMt(m); if (!T || !(S.rot || []).length) return null;
  const mm = R && !R.err ? stpAsVirtualModel(m, S, R) : stpAsBase(m, S), items = [];
  for (const e of S.rot) {
    const it = T.methods.find((x) => x.full === e.full); if (!it) continue;
    const ch = sbChain(it.tree, [e.lv]), r = engSandbag(mm, T.cfg, { skill: it.skill, src: it.src, lv: +ch[0].v, opts: ch.slice(1).map((c) => +c.v) });
    if (!r) continue;
    const ticks = r.ground && r.dmgIv > 0 && r.life > 0 ? r.life / r.dmgIv : 1;           // 設置スキルは、置いてある間のダメージ(ティック×回数)を1回の使用として数える
    items.push({ name: it.name, lv: +ch[0].v, cast: (r.castVary || 0) + (r.castFixed || 0), delay: r.delaySkill || 0, cool: r.coolT || 0, dmg: (r.per.avg || 0) * ticks, ground: !!r.ground });
  }
  if (!items.length) return null;
  const rows = [193, 190, 185, 180, 175, 170, 160, 150].map((a) => { const len = stpRotSim(items, a); return { a, len, dps: items.reduce((q, x) => q + x.dmg, 0) / len }; });
  const L0 = stpRotSim(items, 193); let thr = 193; for (let a = 192; a >= 100; a--) { if (stpRotSim(items, a) <= L0 + 1e-6) thr = a; else break; }
  return { items, rows, thr, L0, aspd: stpAsCore(mm, T) ? null : null };
}
function stpRotHtml(m, S, ok) {
  const T = stpSbMt(m); if (!T) return "";
  const rot = S.rot || [], n2 = (v) => (Math.round(v * 100) / 100).toFixed(2), Rt = S.asRot;
  const lvOpts = (full) => { const it = T.methods.find((x) => x.full === full); return it && it.tree && it.tree.type === 0 ? it.tree.opts.map((o) => o[0]) : [1]; };
  const rowH = rot.map((e, i) => `<div class="opts"><span class="muted">${i + 1}.</span><select data-stprot="${i}:full">${T.methods.filter((x) => x.skill !== 0).map((x) => `<option value="${esc(x.full)}" ${x.full === e.full ? "selected" : ""}>${esc(atkMethodLabel(x))}</option>`).join("")}</select>
    <label>Lv <select data-stprot="${i}:lv">${lvOpts(e.full).map((v) => `<option value="${v}" ${+v === +e.lv ? "selected" : ""}>${v}</option>`).join("")}</select></label><button class="ghost" data-stprotdel="${i}" title="このスキルをはずす">×</button></div>`).join("");
  let h = `<div class="stph" style="margin-top:10px">ローテーション（複数のスキルを順に撃つ）</div><div class="muted" style="font-size:12px;margin:2px 0">別のスキルのクールタイムは待たなくてよいので、順に撃つときの待ちは「モーション・そのスキルのディレイ」だけです（同じスキルをまた撃つときは、そのクールタイムが明けるまで）。この場合 ASPD は、連打のときより効きます。</div>${rowH}
    <div class="opts"><button class="ghost" data-stprotadd="1">＋ スキルを足す</button>${T.item ? `<button class="ghost" data-stprotadd="cur" title="サンドバックマンの枠で選んでいるスキルを足します">＋ いまのスキル</button>` : ""}</div>`;
  if (rot.length && Rt && !Rt.err) {
    h += `<div style="${ok ? "" : "opacity:.5"}"><div style="margin:4px 0">${Rt.thr >= 193 ? `<b>ASPD 193 でも、周期が縮み続けます</b>（待ちがモーションだけのスキルがあります）。` : `<b>ASPD ${Rt.thr} 以上あれば、これ以上上げても1周の時間は変わりません。</b>`}
      <button class="ghost" data-stpastarget="${Rt.thr}" title="「ASPD を維持」の目標を、この境目にします">目標 ASPD を ${Rt.thr} にする</button></div>
      <table class="multi"><tr><th>スキル</th><th>詠唱（変動＋固定）</th><th>ディレイ</th><th>クールタイム</th><th>1回のダメージ</th></tr>${Rt.items.map((x) => `<tr><td>${esc(x.name)} Lv${x.lv}</td><td class="v">${n2(x.cast)}秒</td><td class="v">${n2(x.delay)}秒</td><td class="v">${n2(x.cool)}秒</td><td class="v">${stpKM(x.dmg)}${x.ground ? ' <span class="muted" title="設置スキルは、置いてある間のダメージの合計">（設置）</span>' : ""}</td></tr>`).join("")}</table>
      <table class="multi" style="margin-top:6px"><tr><th>ASPD</th><th>モーション</th><th>1周の時間</th><th>撃つ速さ（ASPD 193 を 100%）</th><th>DPS（目安）</th></tr>
      ${Rt.rows.map((x) => `<tr${x.a === Rt.thr ? ' style="font-weight:700"' : ""}><td>${x.a}</td><td class="v">${n2(STP_MOT(x.a))}秒</td><td class="v">${n2(x.len)}秒</td><td class="v">${Math.round(Rt.L0 / x.len * 100)}%</td><td class="v">${stpKM(x.dps)}</td></tr>`).join("")}</table>
      <div class="muted" style="font-size:12px">1周の DPS = 1周のダメージの合計 ÷ 1周の時間。設置スキル（ライトニングランドなど）は、置いてある間のダメージを全部当てた数字で、重なって積み上がる前提の目安です。時限効果は入れていません。</div></div>`;
  }
  return h;
}
// 1つの構成(mm = ステータス込みの model)の、このスキルの詠唱・待ち・ASPD の境目
function stpAsCore(mm, T) {
  const c = engCalc(mm).c, r = engSandbag(mm, T.cfg, Object.assign({}, T.mt));
  if (!r) return null;
  const other = Math.max(r.delaySkill || 0, r.coolT || 0), aspd = c[37], castV = r.castVary || 0, castF = r.castFixed || 0, cast = castV + castF;
  const cyc = (a) => cast + Math.max(STP_MOT(a), other);
  return { aspd, castV, castF, delay: r.delaySkill || 0, cool: r.coolT || 0, other, need: Math.min(193, Math.ceil(200 - other / 0.02 - 1e-9)), atCap: other < STP_MOT(193) - 1e-9,
    rows: [193, 190, 185, 180, 175, 170, 160, 150].map((a) => ({ a, mot: STP_MOT(a), cyc: cyc(a), rel: cyc(193) / cyc(a) })), cyc };
}
// 潜在解放(エレメンタルマスター)の候補: 装備の場所ごとに、選べるものと入る枠(ラトリオの候補の表から)。同じ番号は1つ
function stpSenzaiList(m) {
  const out = [], seen = new Set();
  for (const [r, slots] of Object.entries(SIMC_CARD)) {
    const itemId = m.equip[r]; if (!itemId) continue;
    let opts; try { opts = simcCardOpts(+r, itemId); } catch (e) { continue; }
    opts.forEach((lst, k) => (lst || []).forEach((o) => { if (o.v && /潜在解放\(エレメンタルマスター/.test(String(o.n || o.t || "")) && !seen.has(o.v + ":" + slots[k])) { seen.add(o.v + ":" + slots[k]); out.push({ v: o.v, slot: slots[k], region: +r, name: String(o.n || o.t) }); } }));
  }
  return out;
}
// 潜在解放(エレメンタルマスター)がつけられる装備を、全装備から調べる(職業ごとに1回だけ約10秒。結果は覚える)
async function stpSenzaiHolders(m) {
  const key = "senzaiH" + m.status.jobId; if (ENG.cache[key]) return ENG.cache[key];
  const H = {}, isS = /潜在解放\(エレメンタルマスター/;
  for (const r of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    await sleep(0);
    for (const o of simcItemOpts(m.status.jobId, r).filter((x) => x.v)) {
      let opts; try { opts = simcCardOpts(r, o.v); } catch (e) { continue; }
      const seen = new Set(); opts.forEach((l) => (l || []).forEach((c) => { if (c.v && isS.test(String(c.n || c.t || "")) && !seen.has(c.v)) { seen.add(c.v); ((H[c.v] = H[c.v] || {})[r] = H[c.v][r] || []).push(String(o.n || o.t)); } }));
    }
  }
  return ENG.cache[key] = H;
}
const stpAsBase = (m, S) => { const mm = simcClone(m); Object.assign(mm.status, S.d); return mm; };
// 選んだ潜在解放(S.asOn: 番号 → オンか。無ければ、いま付いているか)を着けた構成
function stpAsVirtualModel(m, S, R) {
  const mm = stpAsBase(m, S);
  for (const c of R.senzai) {
    const has = c.placeable ? mm.card[c.slot] === c.v : false, on = S.asOn && S.asOn[c.v] !== undefined ? S.asOn[c.v] : has;
    if (on) mm.card[c.slot] = c.v; else if (mm.card[c.slot] === c.v) mm.card[c.slot] = 0;
  }
  return mm;
}
const stpSenzaiLabel = (nm) => { const mm = /エレメンタルマスター([IVX]+)\)\s*(.*)$/.exec(nm); return mm ? "潜在 " + mm[1] + (mm[2] ? " " + mm[2] : "") : nm; };
// 潜在解放(エレメンタルマスター)は全部(ラトリオのカード表から)。いまの装備につけられるもの(placeable)は、その枠。つけられないものは、空いている枠に「仮に」入れて効果を見る(効果は、枠の場所に関係なく、カードがあるかで決まる)
async function stpAsCalc(m, S) {
  const T = stpSbMt(m); if (!T) return { err: "サンドバックマンのスキルを選べません" };
  const base = stpAsBase(m, S), B = stpAsCore(base, T);
  if (!B) return { err: "このスキルは計算できませんでした" };
  const all = Object.entries(ENG.reg.CardObjNew).filter(([, v]) => v && /潜在解放\(エレメンタルマスター/.test(String(v[2]))).map(([id, v]) => ({ v: +id, name: String(v[2]) }));
  const ids = new Set(all.map((c) => c.v)), place = stpSenzaiList(base), pm = {};
  place.forEach((c) => { (pm[c.v] = pm[c.v] || []).push(c); });
  const used = new Set(place.map((c) => c.slot)), free = [];
  for (const [r, slots] of Object.entries(SIMC_CARD)) { if (!base.equip[r]) continue; slots.forEach((sl) => { if (!base.card[sl] && !used.has(sl)) free.push(sl); }); }
  const senzai = []; let fi = 0;
  for (const c of all) {
    await sleep(0);
    const ps = pm[c.v] || [], list = ps.length ? ps : [{ slot: free[fi++], region: -1, placeable: false }];
    for (const q of list) {
      if (q.slot === undefined) continue;
      const m0 = simcClone(base); Object.keys(m0.card).forEach((kk) => { if (m0.card[kk] === c.v) m0.card[kk] = 0; });          // この潜在解放が付いていない状態
      const a = Object.keys(base.card).some((kk) => base.card[kk] === c.v) ? stpAsCore(m0, T) : B;
      const m1 = simcClone(m0); m1.card[q.slot] = c.v; const b = stpAsCore(m1, T);
      if (!a || !b) continue;
      const d = { castV: b.castV - a.castV, castF: b.castF - a.castF, delay: b.delay - a.delay, cool: b.cool - a.cool };
      if (Object.values(d).some((x) => Math.abs(x) > 1e-6)) senzai.push({ v: c.v, name: c.name, slot: q.slot, region: q.region === undefined ? -1 : q.region, placeable: q.placeable !== false, d });
    }
  }
  return { sig: stpAsSig(m, S), name: T.item.name, lv: T.mt.lv, base: B, senzai };
}
function stpAsHtml(m, S) {
  const R = S.as, ok = R && R.sig === stpAsSig(m, S), n2 = (v) => (Math.round(v * 100) / 100).toFixed(2), fx = (v) => `${n2(v)}秒`;
  const btn = `<button id="stpascalc" data-stpas="1">${R ? "計算し直す" : "計算する"}</button>`;
  if (!R) return `<div class="muted" style="font-size:12px;margin:4px 0">サンドバックマンの枠で選んでいるスキルで、「ASPD をどこまで上げれば周期が縮まなくなるか」を出します。そのスキルに効く潜在解放を、1つずつ切りかえて比べられます。</div><div class="opts">${btn}</div>`;
  if (R.err) return `<div class="warn">${esc(R.err)}</div><div class="opts">${btn}</div>`;
  const B = R.base, on = (c) => (S.asOn && S.asOn[c.v] !== undefined ? S.asOn[c.v] : stpAsBase(m, S).card[c.slot] === c.v);
  const dtxt = (d) => [["castV", "変動詠唱"], ["castF", "固定詠唱"], ["delay", "ディレイ"], ["cool", "クールタイム"]].filter(([k]) => Math.abs(d[k]) > 1e-6).map(([k, l]) => `${l} ${d[k] > 0 ? "+" : "−"}${n2(Math.abs(d[k]))}s`).join(" ／ ");
  let V = B, changed = false;
  if (ok) { changed = R.senzai.some((c) => on(c) !== (stpAsBase(m, S).card[c.slot] === c.v)); if (changed) { const T = stpSbMt(m); V = T && stpAsCore(stpAsVirtualModel(m, S, R), T) || B; } }
  const chips = R.senzai.length ? R.senzai.map((c) => `<span class="afx${on(c) ? " on" : ""}${c.placeable ? "" : " dim"}" data-stpasc="${c.v}" title="${esc(c.name)}（${esc(dtxt(c.d))}）。${c.placeable ? "同じ枠に入る潜在解放は、どれか1つです" : "いまの装備にはつけられません（ほかの装備なら付けられます。右クリックで、つけられる装備を調べます）。比べるために、仮に付けた計算をします"}">${esc(stpSenzaiLabel(c.name))}<span class="muted" style="font-size:11px;margin-left:4px">${esc(dtxt(c.d))}</span></span>`).join("") : `<span class="muted">このスキルの詠唱・ディレイ・クールタイムに効く潜在解放は、いまの装備の候補にありません。</span>`;
  const line = (label, X) => `<tr><td>${label}</td><td class="v">${fx(X.castV)}</td><td class="v">${fx(X.castF)}</td><td class="v">${fx(X.delay)}</td><td class="v">${fx(X.cool)}</td><td class="v"><b>${X.atCap ? "193（上限でも足りない）" : X.need}</b></td></tr>`;
  return `<div class="opts">${btn}${ok ? "" : `<span class="warn">条件を変えました。結果は前の設定のものです。「計算し直す」を押してください</span>`}</div>
    <div style="${ok ? "" : "opacity:.5"}"><div class="muted" style="font-size:12px;margin:4px 0">${esc(R.name)} Lv${R.lv}。1回撃つ周期 = 詠唱（変動 + 固定）+ 待ち。待ち = 攻撃モーション・ディレイ・クールタイムのいちばん長いもの。ASPD が効くのはモーションだけです。</div>
    <div class="muted" style="font-size:12px">このスキルに効く潜在解放（全部調べています。薄い文字は、いまの装備にはつけられないもの。押して切りかえ、右クリックで詳細。同じ枠のものは1つだけ）</div><div class="atkfxl" style="margin:4px 0 8px">${chips}</div>
    <table class="multi"><tr><th>構成</th><th>変動詠唱</th><th>固定詠唱</th><th>ディレイ</th><th>クールタイム</th><th>ASPD の境目（これ以上は周期が変わらない）</th></tr>${line("いまの装備", B)}${changed ? line("<b>選んだ構成</b>", V) : ""}</table>
    <div style="margin-top:6px">${V.atCap ? `<b>ASPD 193（上限）でも、攻撃モーション ${fx(STP_MOT(193))} が待ちとして残ります。</b>ASPD は高いほど周期が縮みます。` : `<b>${changed ? "選んだ構成では、" : ""}ASPD ${V.need} 以上あれば、これ以上上げても周期は変わりません</b>（ディレイ・クールタイムの ${fx(V.other)} のほうが、モーションより長くなるため）。`}
      いまの試算の ASPD ${simcNum(V.aspd, 1)} は ${V.aspd >= V.need ? `<span class="good">境目以上です</span>` : `<span class="warn">境目より ${simcNum(V.need - V.aspd, 1)} 低いです</span>`}。
      <button class="ghost" data-stpastarget="${V.need}" title="「ASPD を維持」の目標を、この境目にします">目標 ASPD を ${V.need} にする</button></div>
    <table class="multi" style="margin-top:6px"><tr><th>ASPD</th><th>モーション</th><th>1回の周期</th><th>撃つ速さ（ASPD 193 を 100%）</th></tr>
      ${V.rows.map((x) => `<tr${x.a === V.need ? ' style="font-weight:700"' : ""}><td>${x.a}</td><td class="v">${fx(x.mot)}</td><td class="v">${fx(x.cyc)}</td><td class="v">${Math.round(x.rel * 100)}%</td></tr>`).join("")}</table>
    <div class="muted" style="font-size:12px">ラトリオの計算と資料の表に基づく目安です。潜在解放は、装備の枠にそのまま入れたときの効果です（切りかえは、この比較の中だけで、キャラの装備は変わりません）。設置系や押してすぐ出るスキルはモーションが固定で ASPD の影響を受けない、という情報もあります（ラトリオは全スキルを ASPD で変わるとして数えます）。変身中（真理の解放など）のモーションは別です。時限効果は入れていません。</div>${stpRotHtml(m, S, ok)}</div>`;
}
function stpRefreshMain(m) { const S = stpState(), el = $("#stpmain"); if (S && el) el.innerHTML = stpMainHtml(m, S); }
function stpKick(m) {                            // 重い計算(装備パターンの表 → 提案 → 影響の表)は、入力が落ち着いてから、1回ずつ息つぎしながら
  const mf = $("#view").querySelector('details[data-fold="opt"]'); if (!mf || !mf.open || !$("#stp") || !ENG.ready) return;
  const S = stpState(); if (!S) return;
  const fe = $("#view").querySelector('details[data-fold="stpeff"]'), fw = $("#view").querySelector('details[data-fold="stpsw"]');
  const pf = $("#view").querySelector('details[data-fold="stppat"]');
  const need = (pf && pf.open && !(S.rows && S.rowSig === stpRowSig(m, S))) || !(S.sug && S.sugSig === stpSugSig(m, S)) || (fe && fe.open && !(S.eff && S.effSig === stpEffSig(m, S))) || (fw && fw.open && !(S.swR && S.swSig === stpSwSig(m, S)));
  if (!need || SIMC.busy) return;          // 「反映」などの作業中は計算しない(終わって描き直したあとに始める)
  clearTimeout(S.kt); S.kt = setTimeout(() => stpHeavy(), S.rows ? 1000 : 500);
}
async function stpHeavy() {
  const c = simcCur(), S = stpState(); if (!c || !S) return;
  const m = c.model, tok = ++S.tok, alive = () => SIMC.stp === S && S.tok === tok && simcCur() === c;
  const tick = async () => { await sleep(0); if (!alive()) throw new Error("changed"); };
  const put = (id, html) => { const el = $("#" + id); if (el) el.innerHTML = html; };
  try {
    const pats = stpPats(m, S), d = Object.assign({}, S.d), MAXV = SIMC_STMAX;
    // 1) 装備パターンの表(枠を開いているときだけ)
    const pf = $("#view").querySelector('details[data-fold="stppat"]');
    if (pf && pf.open && !(S.rows && S.rowSig === stpRowSig(m, S))) {
      const rows = [];
      for (const P of pats) { await tick(); const e = stpEval(P, d); rows.push(Object.assign(e, { label: P.label, miss: P.miss, missRows: P.missRows, colors: P.colors, learned: simcLearnedList(P.mm) })); put("stppats", stpPatsHtml(m, rows, pats.length)); }
      S.rows = rows; S.rowSig = stpRowSig(m, S); put("stppats", stpPatsHtml(m, rows, rows.length));
    }
    // 2) いちばん安い振り方
    if (!(S.sug && S.sugSig === stpSugSig(m, S))) {
      const cals = [];
      for (const P of pats) { await tick(); cals.push(stpCal(P, d)); }
      let R;
      if (cals.some((x) => !x)) R = { fail: "ASPD が装備・スキルの効果で固定される（式が使えない）パターンがあります。ステッパーで試算してください。" };
      else {
        const all = stpSolve(cals, MAXV), pick = [];
        for (const c1 of all) { if (pick.every((x) => Math.abs(x.dex - c1.dex) >= 6)) pick.push(Object.assign({}, c1)); if (pick.length >= 4) break; }
        R = { list: [], best: [] };
        const fxOn = atkActiveIds(null).length > 0, dmgOf = async (c) => { await tick(); const dd = Object.assign({}, d, { agi: c.agi, dex: c.dex, int: c.int }); c.dmg = simcSbAvg(pats[0].mm, dd, false); c.dmgF = fxOn ? simcSbAvg(pats[0].mm, dd, true) : null; return c; };
        if (pick.length) { for (const c1 of pick) R.list.push(await dmgOf(await stpVerify(pats, c1, d, tick))); R.list.sort((a, b) => (b.ok - a.ok) || a.cost - b.cost); }
        else R.fail = `AGI・DEX・INT をふつうの上限（${MAXV}）まで振っても、目標を満たせません。`;
        if (!pick.length) {       // 届かない → 無詠唱は維持したまま ASPD を最大にする案(詠唱で余った分を AGI に回す)
          const Pt = simcPoints(m), others = stpCost(d.vit) + stpCost(d.str) + stpCost(d.luk), spend = stpCost(d.agi) + stpCost(d.dex) + stpCost(d.int), bl = [stpBest(cals, spend, MAXV, "いまと同じポイントで ASPD を最大に")];
          if (Pt && Pt.earned - others > spend) bl.push(stpBest(cals, Pt.earned - others, MAXV, "余りのポイントも使って ASPD を最大に"));
          for (const b of bl) if (b && !R.best.some((x) => x.agi === b.agi && x.dex === b.dex && x.int === b.int)) R.best.push(await dmgOf(await stpCheck(pats, b, d, tick)));
        }
      }
      S.sug = R; S.sugSig = stpSugSig(m, S); put("stpsug", stpSugHtml(m, S));
    }
    // 3) ステータスを変えたときのダメージ(掃引。枠を開いているときだけ)
    const fw = $("#view").querySelector('details[data-fold="stpsw"]');
    if (fw && fw.open && !(S.swR && S.swSig === stpSwSig(m, S))) {
      const P0 = pats[0], sw = S.sw, rows = [], fxOn = atkActiveIds(null).length > 0; let name = "";
      for (let i = 0; i <= sw.n; i++) {
        const v = Math.max(1, Math.min(MAXV, d[sw.stat] + sw.dir * sw.step * i)); if (i && rows[rows.length - 1].v === v) break;
        await tick(); const dd = Object.assign({}, d, { [sw.stat]: v }), e = stpEval(P0, dd), a = simcSbAvg(P0.mm, dd, false), f = fxOn ? simcSbAvg(P0.mm, dd, true) : null; if (a) name = a.name;
        rows.push({ v, cost: stpCost(v), aspd: e.aspd, castP: e.castP, dmg: a ? a.avg : null, dmgF: f ? f.avg : null, dps: a ? a.dps : null, dpsF: f ? f.dps : null });
      }
      S.swR = { rows, fxOn, name }; S.swSig = stpSwSig(m, S); put("stpsw", stpSwHtml(m, S));
    }
    // 4) ポイントを足したときの影響(枠を開いているときだけ)
    const fe = $("#view").querySelector('details[data-fold="stpeff"]');
    if (fe && fe.open && !(S.eff && S.effSig === stpEffSig(m, S))) {
      const P0 = pats[0], withX = (dd) => stpEval(P0, dd, [3, 8]), b = withX(d), bx = stpExtra(b.r), sb0 = simcSbAvg(Object.assign(simcClone(P0.mm), { status: Object.assign({}, P0.mm.status, d) }), {}, false);
      const fxOn = atkActiveIds(null).length > 0, sb0f = fxOn ? simcSbAvg(Object.assign(simcClone(P0.mm), { status: Object.assign({}, P0.mm.status, d) }), {}, true) : null;
      const base = { aspd: b.aspd, castP: b.castP, hp: b.hp, weight: bx.weight, ail: bx.ail, dmg: sb0 ? sb0.avg : null, dmgF: sb0f ? sb0f.avg : null, dps: sb0 ? sb0.dps : null, dpsF: sb0f ? sb0f.dps : null }, rows = [];
      for (const k of ["agi", "dex", "int", "vit", "str", "luk"]) {
        await tick(); const step = Math.min(10, MAXV - d[k]); if (step <= 0) continue;
        const dd = Object.assign({}, d, { [k]: d[k] + step }), e = withX(dd), x = stpExtra(e.r), mm = simcClone(P0.mm); Object.assign(mm.status, dd);
        const sb = sb0 ? simcSbAvg(mm, {}, false) : null, sbf = fxOn ? simcSbAvg(mm, {}, true) : null;
        rows.push({ k, v: d[k], step, cost: stpCost(d[k] + step) - stpCost(d[k]), aspd: e.aspd, castP: e.castP, hp: e.hp, weight: x.weight, ail: x.ail, dmg: sb ? sb.avg : null, dmgF: sbf ? sbf.avg : null, dps: sb ? sb.dps : null, dpsF: sbf ? sbf.dps : null });
      }
      S.eff = { base, rows, dmgName: sb0 ? sb0.name : "", fxOn }; S.effSig = stpEffSig(m, S); put("stpeff", stpEffHtml(m, S));
    }
  } catch (err) { if (err.message !== "changed") console.warn("stp", err); }
}
