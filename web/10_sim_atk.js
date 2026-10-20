"use strict";
// ==================== 与ダメシミュレーター(サブタブ「与ダメシミュ」) ====================
// ラトリオの本物のモンスター(約2500体)に、メインスキルを使ったときのダメージを出す。ランダム発動の時限効果(豪傑・覇王・真理の解放・暴走した魔力 など)は、
// ラトリオにオンオフが無いので、ここでオンオフにして足す(性能カスタマイズの欄 = model.confCustomStatus / confCustomAtk / confCustomSpecStatus に足して計算)。
const ATK_ST = "confCustomStatus", ATK_AT = "confCustomAtk", ATK_SP = "confCustomSpecStatus";
const ATK_FIELDS = [   // 「自分で追加」で選べる項目: [名前, 欄, 番号]
  ["STR+", ATK_ST, 7], ["AGI+", ATK_ST, 8], ["VIT+", ATK_ST, 9], ["INT+", ATK_ST, 10], ["DEX+", ATK_ST, 11], ["LUK+", ATK_ST, 12], ["HIT+", ATK_ST, 13], ["FLEE+", ATK_ST, 14], ["CRI+", ATK_ST, 15],
  ["ASPD+%", ATK_ST, 17], ["変動詠唱短縮%", ATK_ST, 19], ["固定詠唱短縮%", ATK_ST, 20], ["ディレイ短縮%", ATK_ST, 21],
  ["ATK+", ATK_AT, 4], ["MATK+", ATK_AT, 13], ["物理ダメージ+%", ATK_AT, 5], ["魔法ダメージ+%", ATK_AT, 14], ["物理 ボス・一般へ +%", ATK_AT, 22], ["魔法 ボス・一般へ +%", ATK_AT, 23],
  ["クリティカルダメージ+%", ATK_AT, 10], ["命中物理ダメージ+%", ATK_AT, 27], ["全種族DEF無視%", ATK_AT, 12], ["全種族MDEF無視%", ATK_AT, 19],
  ["POW+", ATK_SP, 1], ["STA+", ATK_SP, 2], ["WIS+", ATK_SP, 3], ["SPL+", ATK_SP, 4], ["CON+", ATK_SP, 5], ["CRT+", ATK_SP, 6], ["P.ATK+", ATK_SP, 7], ["S.MATK+", ATK_SP, 8]];
const ATK_FX = [   // ランダム発動の時限効果。kind: p = 物理 / m = 魔法 / b = どちらも。fx: [欄, 番号, 足す値]。数字はラトリオの説明文(card.dat.js)から。HP/SP が減る・変身などは計算に入らない
  { id: "gouketsu", name: "豪傑", kind: "p", text: "物理攻撃命中で10秒: ボスへのダメージ+100%(敵がボスのときだけ計算に入れる)", fx: [[ATK_AT, 22, 100, "B"]] },
  { id: "hao", name: "覇王", kind: "p", text: "物理攻撃命中で10秒: STR+200", fx: [[ATK_ST, 7, 200]] },
  { id: "kuma", name: "熊の力", kind: "p", text: "被弾で5秒: STR+200(毎秒HP-500)", fx: [[ATK_ST, 7, 200]] },
  { id: "washi", name: "大鷲の眼光", kind: "p", text: "物理攻撃命中で10秒: DEX+200(毎秒SP-50)", fx: [[ATK_ST, 11, 200]] },
  { id: "kosoku", name: "光速", kind: "p", text: "物理攻撃命中で5秒: 攻撃速度+100%・FLEE+100(毎秒HP-400・SP-40)", fx: [[ATK_ST, 17, 100]] },
  { id: "gouwan", name: "剛腕", kind: "p", text: "物理攻撃命中で5秒: ATK+100", fx: [[ATK_AT, 4, 100]] },
  { id: "satk", name: "S-Atk(精錬7以上)", kind: "p", text: "物理攻撃命中で3秒: ATK+150", fx: [[ATK_AT, 4, 150]] },
  { id: "tpow", name: "T-PowerBoost(精錬7以上)", kind: "p", text: "物理攻撃命中で3秒: ATK+100", fx: [[ATK_AT, 4, 100]] },
  { id: "munen", name: "無念無想", kind: "p", text: "物理攻撃命中で10秒: CRI+100・クリティカルダメージ+100%", fx: [[ATK_ST, 15, 100], [ATK_AT, 10, 100]] },
  { id: "yumi", name: "魔弓の弦音", kind: "p", text: "物理攻撃命中で10秒: HIT+150・攻撃速度+100%", fx: [[ATK_ST, 13, 150], [ATK_ST, 17, 100]] },
  { id: "inu", name: "冥犬の共吠え", kind: "p", text: "物理攻撃命中で10秒: 命中物理ダメージ+50%", fx: [[ATK_AT, 27, 50]] },
  { id: "shinri", name: "真理の解放", kind: "m", text: "魔法攻撃命中で10秒: ボスへの魔法ダメージ+100%(敵がボスのときだけ計算に入れる)", fx: [[ATK_AT, 23, 100, "B"]] },
  { id: "boso", name: "暴走した魔力", kind: "m", text: "魔法攻撃命中で10秒: INT+200(毎秒SP-200)", fx: [[ATK_ST, 10, 200]] },
  { id: "smatk", name: "S-Matk(精錬7以上)", kind: "m", text: "魔法攻撃命中で3秒: MATK+150", fx: [[ATK_AT, 13, 150]] },
  { id: "tmagic", name: "T-MagicBoost(精錬7以上)", kind: "m", text: "魔法攻撃命中で3秒: MATK+100", fx: [[ATK_AT, 13, 100]] },
  { id: "squick", name: "S-Quick(精錬7以上)", kind: "m", text: "魔法攻撃命中で3秒: 詠唱-100%・ディレイ-100%", fx: [[ATK_ST, 19, 100], [ATK_ST, 20, 100], [ATK_ST, 21, 100]] },
  { id: "cutie", name: "CUTIE", kind: "m", text: "魔法攻撃命中で30秒: 攻撃速度+100%", fx: [[ATK_ST, 17, 100]] },
  { id: "isira", name: "アイシラ", kind: "m", text: "魔法攻撃で5秒: 詠唱-50%・FLEE+30", fx: [[ATK_ST, 19, 50], [ATK_ST, 14, 30]] },
  { id: "tenchi", name: "天地", kind: "b", text: "10秒: 詠唱-70%・ディレイ-70%・敵のDEF/MDEF 100%無視", fx: [[ATK_ST, 19, 70], [ATK_ST, 20, 70], [ATK_ST, 21, 70], [ATK_AT, 12, 100], [ATK_AT, 19, 100]] },
  { id: "shippu", name: "疾風", kind: "b", text: "10秒: 攻撃速度+70%・詠唱-70%・ディレイ-70%", fx: [[ATK_ST, 17, 70], [ATK_ST, 19, 70], [ATK_ST, 20, 70], [ATK_ST, 21, 70]] },
  { id: "kokuyoku", name: "黒翼の使徒", kind: "b", text: "10秒: 攻撃速度+100%・固定詠唱-100%", fx: [[ATK_ST, 17, 100], [ATK_ST, 20, 100]] },
  { id: "suiten", name: "水天", kind: "b", text: "10秒: 詠唱-70%・ディレイ-70%(SP消費-70%は計算に入れない)", fx: [[ATK_ST, 19, 70], [ATK_ST, 20, 70], [ATK_ST, 21, 70]] },
  { id: "hyakka", name: "百火", kind: "b", text: "10秒: 詠唱-70%・ディレイ-70%・全属性の敵へのダメージ+70%(目安)", fx: [[ATK_ST, 19, 70], [ATK_ST, 20, 70], [ATK_ST, 21, 70], [ATK_AT, 5, 70], [ATK_AT, 14, 70]] },
  { id: "makui", name: "魔喰いの顎", kind: "b", text: "10秒: 詠唱-100%", fx: [[ATK_ST, 19, 100], [ATK_ST, 20, 100]] },
  { id: "xstr", name: "S-/X-OverPower", kind: "b", text: "4秒: STR+50", fx: [[ATK_ST, 7, 50]] },
  { id: "xagi", name: "S-/X-FatalFlash", kind: "b", text: "4秒: AGI+50", fx: [[ATK_ST, 8, 50]] },
  { id: "xdex", name: "S-/X-FiringShot", kind: "b", text: "4秒: DEX+50", fx: [[ATK_ST, 11, 50]] },
  { id: "xint", name: "S-/X-SpellBuster", kind: "b", text: "4秒: INT+50", fx: [[ATK_ST, 10, 50]] },
  { id: "xluk", name: "S-/X-LuckyStrike", kind: "b", text: "4秒: LUK+50", fx: [[ATK_ST, 12, 50]] },
  { id: "pow", name: "魔獣の爪牙", kind: "p", text: "10秒: POW+100(物理のダメージが上がる特性ステータス)", fx: [[ATK_SP, 1, 100]] },
  { id: "sta", name: "不滅の肉体", kind: "b", text: "10秒: STA+100", fx: [[ATK_SP, 2, 100]] },
  { id: "wis", name: "叡知の王冠", kind: "b", text: "10秒: WIS+100", fx: [[ATK_SP, 3, 100]] },
  { id: "spl", name: "根源への到達", kind: "m", text: "10秒: SPL+100(魔法のダメージが上がる特性ステータス)", fx: [[ATK_SP, 4, 100]] },
  { id: "con", name: "蒼穹の覇者", kind: "b", text: "10秒: CON+100", fx: [[ATK_SP, 5, 100]] },
  { id: "crt", name: "天与の才", kind: "p", text: "10秒: CRT+100(クリティカル系の特性ステータス)", fx: [[ATK_SP, 6, 100]] }];
const stpExtraV = (v) => Math.floor((v || 0) / 10) + ((v || 0) >= 110 ? 5 : 0);
ATK_FX.push(
  { id: "extstr", name: "ExtraStr", kind: "p", text: "素STR 10ごとに物理ダメージ+1%・STR110以上でさらに+5%（常時）", cards: ["ExtraStr"], dyn: (st) => [[ATK_AT, 5, stpExtraV(st.str)]] },
  { id: "extagi", name: "ExtraAgi", kind: "p", text: "素AGI 10ごとに必中攻撃+1%・AGI110以上でさらに+5%（常時）", cards: ["ExtraAgi"], dyn: (st) => [[ATK_AT, 11, stpExtraV(st.agi)]] },
  { id: "extvit", name: "ExtraVit", kind: "b", text: "素VIT 10ごとに回復量+1%・VIT110以上でさらに+5%（ダメージには関係なし）", cards: ["ExtraVit"], dyn: () => [] },
  { id: "extint", name: "ExtraInt", kind: "m", text: "素INT 10ごとに魔法ダメージ+1%・INT110以上でさらに+5%（常時）", cards: ["ExtraInt"], dyn: (st) => [[ATK_AT, 14, stpExtraV(st.int)]] },
  { id: "extdex", name: "ExtraDex", kind: "p", text: "素DEX 10ごとに遠距離ダメージ+1%・DEX110以上でさらに+5%（常時。目安）", cards: ["ExtraDex"], dyn: (st) => [[ATK_AT, 9, stpExtraV(st.dex)]] },
  { id: "extluk", name: "ExtraLuk", kind: "p", text: "素LUK 10ごとにクリティカルダメージ+1%・LUK110以上でさらに+5%（常時。目安）", cards: ["ExtraLuk"], dyn: (st) => [[ATK_AT, 10, stpExtraV(st.luk)]] });
const ATK = { mobQ: "", mons: null, rank: null, rankBy: "per", msg: "", fxForm: { name: "", kind: "b", rows: [[0, 0]] } };
const ATKS = (() => { try { return Object.assign({ mob: 0, full: "", vals: [], recent: [] }, JSON.parse(store.get("md_atk") || "{}")); } catch (e) { return { mob: 0, full: "", vals: [], recent: [] }; } })();
const atkSave = () => store.set("md_atk", JSON.stringify(ATKS));
const atkFxSet = () => { SETTINGS.atkFx = SETTINGS.atkFx || { on: {}, custom: [] }; SETTINGS.atkFx.on = SETTINGS.atkFx.on || {}; SETTINGS.atkFx.custom = SETTINGS.atkFx.custom || []; return SETTINGS.atkFx; };
const atkFxAll = () => ATK_FX.concat(atkFxSet().custom);
async function atkMons() {
  if (ATK.mons) return ATK.mons;
  const w = ENG.frame.contentWindow, mod = await w.eval(`import("${engBase()}engine/monster/monster.dat.js")`);
  ATK.mons = (mod.MonsterObjNew || []).filter(Boolean).map((r) => ({ id: r[0], name: String(r[1]), lv: r[2], hp: r[3], def: r[13], mdef: r[14], size: r[17], ele: r[18], race: r[19], boss: r[20], kana: String(r[23] || "") }));
  ATK.byId = new Map(ATK.mons.map((x) => [x.id, x]));
  return ATK.mons;
}
const atkMobDesc = (x) => `Lv${x.lv}・HP ${fmtN(x.hp)}・DEF ${x.def}/MDEF ${x.mdef}・${x.boss ? "BOSS" : "一般"}・${SB_RACES[x.race] ?? "?"}・${SB_ELES[Math.floor(x.ele / 10)] ?? "?"}${x.ele % 10}・${SB_SIZES[x.size] ?? "?"}`;
// 個数: SETTINGS.atkFx.on[id] = 個数(昔の「1」= オンは 1個)。左クリックで +1・右クリックで −1(0 でオフ)
const atkCount = (id) => { const v = +atkFxSet().on[id]; return v > 0 ? Math.round(v) : 0; };
// いまの装備に付いている個数を数えるための名前(エンチャント・カード)
function atkOwnedNames(m) { try { return Object.values(m.card || {}).filter(Boolean).map((v) => simcCardName(v)); } catch (e) { return null; } }
const atkFxKeys = (e) => e.cards || (e.id === "xstr" ? ["S-OverPower", "X-OverPower"] : e.id === "xagi" ? ["S-FatalFlash", "X-FatalFlash"] : e.id === "xdex" ? ["S-FiringShot", "X-FiringShot"] : e.id === "xint" ? ["S-SpellBuster", "X-SpellBuster"] : e.id === "xluk" ? ["S-LuckyStrike", "X-LuckyStrike"] : [e.name.replace(/[（(].*$/, "")]);
function atkFxCount(names, e) { if (!names || e.custom) return 0; const keys = atkFxKeys(e); return names.filter((n) => keys.some((k) => String(n || "").includes(k))).length; }
const atkFxOwned = (names, e) => !names || e.custom || atkFxCount(names, e) > 0;      // 付いていなければ、選べるけれど文字をグレーに。見分けがつかない効果(自分で追加したもの)は「付いている」扱い
function atkFxApplied(fxIds, boss, st, m) {                          // 選んだ効果の [欄, 番号, 足す値] を全部。4つ目が "B" のものは、敵がボスのときだけ(ラトリオの欄は「ボス／一般」の区別なく全部に効くため)。
  // dyn は素のステータス st で値が変わる常時の効果(Extra系)。装備している分はラトリオの計算にもう入っているので、選んだ個数のうち装備の個数を超えた分だけ足す。時限効果は個数で値は増えない(個数は発動率に効く)
  const all = atkFxAll(), out = [], names = m ? atkOwnedNames(m) : null;
  for (const id of fxIds) {
    const e = all.find((x) => x.id === id); if (!e) continue;
    const add = e.dyn ? Math.max(0, (atkCount(id) || 1) - atkFxCount(names, e)) : 1;
    const list = e.dyn ? e.dyn(st || {}).map((f) => [f[0], f[1], f[2] * add].concat(f.slice(3))) : e.fx;
    out.push(...list.filter((f) => f[3] !== "B" || boss));
  }
  return out;
}
// オンにしている効果のうち、この技(kind: p/m/b)に関係あるもの。kind が null なら全部
function atkActiveIds(kind) {
  const on = atkFxSet().on;
  return atkFxAll().filter((e) => on[e.id] && (!kind || kind === "b" || e.kind === "b" || e.kind === kind)).map((e) => e.id);
}
// ---- 期待値(発動率で平均した数字)。出典: ロスめろさんのブログ https://lawcemelo-n.com/the-liberation-of-truth-and-runaway-magic/ (真理の解放 1%・暴走した魔力 1.5% が1個あたり。個数分を足す。10秒間続く)。
// ほかの効果は発動率が分からない(ラトリオの説明は「一定確率」)ので、自分で入れるまで「かかっている」扱い。1回のダメージ判定ごとに、発動率の確率でかかると数える(目安)
const ATK_RATE = { shinri: 1, boso: 1.5 };
const atkRateOf = (id) => { const r = (atkFxSet().rate || {})[id]; if (r !== undefined && r !== "" && !Number.isNaN(+r)) return +r; return ATK_RATE[id] !== undefined ? ATK_RATE[id] : null; };
const atkDur = (e) => { const mm = /(\d+)秒/.exec(e.text || ""); return mm ? +mm[1] : 10; };
const atkFxSig = () => { const F = atkFxSet(); return JSON.stringify([F.on, F.mode || "exp", F.T || 60, F.rate || {}]); };
function atkUptime(p, hps, D, T) {            // 1回の判定で確率 p でかかり、D 秒続く(かかり直すと延ばす)。戦闘 T 秒のあいだ、かかっている時間の割合(最初は0から立ち上がる)
  if (!(p > 0) || !(hps > 0)) return 0; if (p >= 1) return 1;
  const q = Math.log(1 - p), steps = Math.max(20, Math.min(600, Math.round(T * 4))), dt = T / steps; let acc = 0;
  for (let i = 0; i < steps; i++) acc += 1 - Math.exp(q * hps * Math.min((i + 0.5) * dt, D));
  return acc / steps;
}
// 時限効果を足して計算する。「かかったとき(最大)」はそのまま1回。「期待値」は、発動率の分かる効果ごとに
// 「その効果だけ足したときの比」を出し、かかっている割合 u で 1 + u×(比−1) にして掛け合わせる(効果どうしの重なりも入る目安。計算は 効果の数+1 回)
// → {r: engSandbag の結果(期待値モードなら 1回の平均・DPS を期待値にしたもの), exp: {info:[…], T, hps} か null}
function atkEval(m, cfg, mt, boss, kind, idsOver) {
  const F = atkFxSet(), ids = idsOver || atkActiveIds(kind), all = atkFxAll();
  const run = (list) => engSandbag(m, cfg, Object.assign({}, mt, { fx: atkFxApplied(list, boss, m.status, m) }));
  if ((F.mode || "exp") !== "exp") return { r: run(ids), exp: null };
  const proc = ids.filter((id) => { const e = all.find((x) => x.id === id); return e && !e.dyn && atkRateOf(id) !== null; }).slice(0, 5), fixed = ids.filter((id) => !proc.includes(id));
  const base = run(fixed); if (!base) return { r: null, exp: null };
  if (!proc.length) return { r: base, exp: null };
  const T = F.T || 60, hits = Math.max(1, (base.hits && base.hits[1]) || 1), iv = base.ground ? base.atkIvl : base.interval, hps = iv > 0 ? hits / iv : 0;
  let ea = base.per.avg, es = base.perSec; const info = [];
  for (const id of proc) {
    const e = all.find((x) => x.id === id), n = atkCount(id) || 1, p = Math.min(1, n * atkRateOf(id) / 100), dur = atkDur(e), u = atkUptime(p, hps, dur, T);
    const r1 = base.per.avg > 0 ? run(fixed.concat(id)) : null;
    const ra = r1 && base.per.avg ? r1.per.avg / base.per.avg : 1, rs = r1 && base.perSec ? r1.perSec / base.perSec : 1;
    ea *= 1 + u * (ra - 1); es *= 1 + u * (rs - 1);
    info.push({ id, name: e.name, n, p, u, dur, ratio: ra });
  }
  return { r: Object.assign({}, base, { per: Object.assign({}, base.per, { avg: Math.round(ea), min: Math.round(base.per.min * ea / base.per.avg), max: Math.round(base.per.max * ea / base.per.avg) }), perSec: Math.round(es) }), exp: { info, T, hps } };
}
// 個数を変える(左クリック +1 / 右クリック −1)。最初の +1 は、いまの装備に付いている個数から(付いていなければ 1)
function atkFxBump(id, d) {
  const F = atkFxSet(), e = atkFxAll().find((x) => x.id === id); if (!e) return;
  const ch = simcCur(), own = ch && e ? atkFxCount(atkOwnedNames(ch.model), e) : 0;
  let n = atkCount(id); n = d > 0 ? (n ? n + 1 : Math.max(1, own + (e.dyn ? 1 : 0))) : Math.max(0, n - 1);
  if (n) F.on[id] = Math.min(n, 12); else delete F.on[id];
  saveSettings();
}
function atkFxRefresh() { if (typeof ATK !== "undefined") ATK.rank = null; const S = SIMC.stp; if (S) { S.sugSig = ""; S.effSig = ""; S.swSig = ""; } render(); }
document.addEventListener("click", (e) => {
  const dl = e.target.closest && e.target.closest("[data-afxdel]"); if (dl) { e.preventDefault(); const F = atkFxSet(); F.custom = F.custom.filter((x) => x.id !== dl.dataset.afxdel); delete F.on[dl.dataset.afxdel]; saveSettings(); atkFxRefresh(); return; }
  const b = e.target.closest && e.target.closest("[data-afxc]"); if (b) { e.preventDefault(); atkFxBump(b.dataset.afxc, 1); atkFxRefresh(); return; }
  const mo = e.target.closest && e.target.closest("[data-afxm]"); if (mo) { atkFxSet().mode = mo.dataset.afxm; saveSettings(); atkFxRefresh(); }
});
document.addEventListener("contextmenu", (e) => { const b = e.target.closest && e.target.closest("[data-afxc]"); if (!b) return; e.preventDefault(); atkFxBump(b.dataset.afxc, -1); atkFxRefresh(); });
document.addEventListener("change", (e) => {
  const t = e.target.closest && e.target.closest("[data-afxt]"); if (t) { atkFxSet().T = +t.value || 60; saveSettings(); atkFxRefresh(); return; }
  const r = e.target.closest && e.target.closest("[data-afxr]"); if (r) { const F = atkFxSet(); F.rate = F.rate || {}; if (r.value === "" || Number.isNaN(+r.value)) delete F.rate[r.dataset.afxr]; else F.rate[r.dataset.afxr] = Math.max(0, Math.min(100, +r.value)); saveSettings(); atkFxRefresh(); }
});
// 時限効果のチップ(与ダメシミュ・小型サンドバックマン共通)。左クリックで個数 +1、右クリックで −1
function atkChip(e, owned, cls = "", tip = "") {
  const n = atkCount(e.id), own = atkFxCount(owned, e), has = atkFxOwned(owned, e);
  return `<span class="afx${n ? " on" : ""}${cls}${has ? "" : " dim"}" data-afxc="${esc(e.id)}" title="${esc(e.text)}${e.custom ? "" : "\n(ラトリオの説明文から。目安)"}${tip}${has ? (own ? `\nいまの装備に ${own} 個付いています` : "") : "\nいまの装備には付いていません（試したいときは選べます）"}\n左クリックで個数 +1、右クリックで −1（0 でオフ）${e.dyn ? "\n常時の効果です。装備している分はラトリオの計算にもう入っているので、装備の個数を超えた分だけ足します" : "\n個数は発動率に関わります（期待値のとき）"}">${esc(e.name)}${n > 1 ? `<b class="afxn">×${n}</b>` : ""}${e.custom ? `<a data-afxdel="${esc(e.id)}" title="この効果を消す">×</a>` : ""}</span>`;
}
// 数字の出し方(かかったとき/期待値)・戦闘時間・発動率の入力。info = 期待値の計算で出た、効果ごとの「かかっている割合」(あれば)
function atkFxCtlHtml(info) {
  const F = atkFxSet(), exp = (F.mode || "exp") === "exp", all = atkFxAll(), act = atkActiveIds(null).map((id) => all.find((e) => e.id === id)).filter((e) => e && !e.dyn);
  let h = `<div class="settabs" style="margin:4px 0"><span class="muted">数字の出し方</span><button class="settab${exp ? "" : " on"}" data-afxm="peak" title="オンにした効果が、全部かかっているときの数字">かかったとき（最大）</button><button class="settab${exp ? " on" : ""}" data-afxm="exp" title="発動率と持続時間から、戦闘中にかかっている割合で平均した数字">期待値（発動率で平均）</button>${exp ? `<span class="muted">戦闘時間</span><select data-afxt>${[10, 30, 60, 180, 300].map((t) => `<option value="${t}" ${(F.T || 60) === t ? "selected" : ""}>${t}秒</option>`).join("")}</select>` : ""}</div>`;
  if (exp && act.length) {
    h += `<table class="multi afxrate"><tr><th>効果</th><th>個数</th><th title="エンチャント1個あたりの発動率。個数をかけたものが、1回のダメージ判定でかかる確率">発動率（1個・%）</th><th>持続</th><th>かかっている割合</th></tr>` + act.map((e) => {
      const n = atkCount(e.id), r = atkRateOf(e.id), u = info && (info.info || []).find((x) => x.id === e.id);
      return `<tr><td>${esc(e.name)}</td><td class="v">${n}</td><td class="v"><input type="number" step="0.1" min="0" max="100" data-afxr="${esc(e.id)}" value="${r === null ? "" : r}" placeholder="未設定" style="width:5em"></td><td class="v">${atkDur(e)}秒</td>
        <td>${r === null ? `<span class="muted">発動率が未設定なので、かかっている扱い</span>` : u ? `<b>${Math.round(u.u * 100)}%</b> <span class="muted">（1判定 ${(u.p * 100).toFixed(1)}%）</span>` : `<span class="muted">（結果を出すと表示）</span>`}</td></tr>`;
    }).join("") + `</table><div class="muted" style="font-size:12px">1回のダメージ判定ごとに、発動率の確率でかかる、と数えた目安です（判定の回数はスキルの当たり数から出しています）。発動率は 真理の解放 1%・暴走した魔力 1.5%（ロスめろさんのブログより）のほかは分からないので、分かるものは入れてください。</div>`;
  }
  return h;
}
function atkKind(m, mobId, mt) {                                        // この技が物理か魔法か: 物理ダメージ+100% / 魔法ダメージ+100% を足して、数字が動くほうで判定
  const key = "atkk:" + JSON.stringify([m.status.jobId, mt.skill, mt.src, mobId, SERE_SKILLS.has(mt.skill) ? m.passiveSkill : 0]);
  if (ENG.cache[key]) return ENG.cache[key];
  const base = engSandbag(m, { mobId }, mt), p = engSandbag(m, { mobId }, Object.assign({}, mt, { fx: [[ATK_AT, 5, 100]] })), q = engSandbag(m, { mobId }, Object.assign({}, mt, { fx: [[ATK_AT, 14, 100]] }));
  const b = base ? base.per.avg || 0 : 0, ph = p && (p.per.avg || 0) > b * 1.001, ma = q && (q.per.avg || 0) > b * 1.001;
  return ENG.cache[key] = ph && !ma ? "p" : ma && !ph ? "m" : "b";
}
function atkMethod(m) {                                                // 選んでいるスキルと、設定の鎖
  const methods = engAttackMethods(m);
  const item = methods.find((x) => x.full === ATKS.full) || methods.find((x) => x.skill !== 0) || methods[0];
  if (!item) return null;
  ATKS.full = item.full;
  const chain = sbChain(item.tree, ATKS.vals); ATKS.vals = chain.map((c) => c.v);
  const lv = chain[0] ? +chain[0].v : 1, opts = chain.slice(1).map((c) => +c.v);
  return { methods, item, chain, mt: { skill: item.skill, src: item.src, lv, opts, name: item.name } };
}
function atkRank(m, mobId, boss) {                                            // 全スキルを、いまの敵・時限効果で比べる(各スキルは最大Lv・ほかの設定は初期値)
  const methods = engAttackMethods(m), rows = [];
  for (const it of methods) {
    if (it.skill === 0) continue;
    try {
      const vals = []; if (it.tree && it.tree.type === 0 && it.tree.opts.length) vals[0] = it.tree.opts[it.tree.opts.length - 1][0];
      const chain = sbChain(it.tree, vals), mt = { skill: it.skill, src: it.src, lv: chain[0] ? +chain[0].v : 1, opts: chain.slice(1).map((c) => +c.v), name: it.name };
      const kind = atkKind(m, mobId, mt), r = atkEval(m, { mobId }, mt, boss, kind).r;
      if (r && r.per.avg > 0) rows.push({ full: it.full, name: `${it.name} Lv${mt.lv}`, kind, per: r.per.avg, sec: r.perSec || 0, interval: r.interval });
    } catch (e) { /* 計算できない技は飛ばす */ }
  }
  return rows;
}
function atkBars(rows, fmt, curKey) {
  const mx = Math.max(1, ...rows.map((r) => r.v));
  return rows.map((r) => `<div class="abar${r.key && r.key === curKey ? " cur" : ""}"${r.key ? ` data-apick="${esc(r.key)}"` : ""}><span class="an">${esc(r.label)}</span><span class="aw"><i style="width:${Math.max(1, Math.round(r.v / mx * 100))}%"></i></span><span class="av">${fmt(r.v)}</span>${r.note ? `<span class="muted an2">${esc(r.note)}</span>` : ""}</div>`).join("");
}
function renderAtkTab() {
  const V = $("#view");
  if (!(typeof LOCAL !== "undefined" && LOCAL)) { V.innerHTML = simNav() + `<div class="panel empty">与ダメシミュは、Fox_MD_Tracker を動かしている PC の画面でだけ使えます。</div>`; bindSimNav(); return; }
  if (!RAT) { V.innerHTML = simNav() + `<div class="panel empty"><span class="spin">確認中…</span></div>`; bindSimNav(); ratStatus().then(render); return; }
  if (!RAT.installed) { V.innerHTML = simNav() + `<div class="panel empty">ラトリオの計算を使います。先に「ラトリオ」タブで「ラトリオを取り込む」を押してください。</div>`; bindSimNav(); return; }
  if (!SIMC.chars) { V.innerHTML = simNav() + simcLoadingHtml(); bindSimNav(); simcLoadingBind(); if (!SIMC.loadErr) simcLoad().then(render); return; }
  if (ENG.err && !ENG.loading && !ENG.retried) { ENG.retried = true; ENG.err = ""; }
  if (!ENG.ready && !ENG.loading && !ENG.err) engInit().then(render);
  const ids = Object.keys(SIMC.chars), ch = simcCur();
  let h = simNav() + `<div class="panel simbox"><div class="opts"><b>与ダメシミュ</b>
    <label>キャラ(スロット) <select id="atkslot">${ids.length ? ids.map((id, i) => `<option value="${esc(id)}" ${id === SIMC.cur ? "selected" : ""}>${i + 1}: ${esc(SIMC.chars[id].name)}</option>`).join("") : `<option>（スロットがありません）</option>`}</select></label>
    <span class="muted">${!ENG.ready ? (ENG.err ? `<span class="err">${esc(ENG.err)}</span>` : "計算係を起動中…（初回は1分ほどかかります）") : "キャラ・装備は「キャラシミュレーター」で整えたものを使います。"}</span></div></div>`;
  if (!ch) { V.innerHTML = h + `<div class="panel empty">キャラシミュレーターでスロットを作ってください(「現在のキャラで新しいスロットを作成」が早いです)。</div>`; bindSimNav(); atkBind(); return; }
  if (!ENG.ready || !ENG.sb) { V.innerHTML = h + (ENG.ready ? `<div class="warn">計算の入口が見つかりません（ラトリオの更新で変わった可能性があります）。</div>` : ""); bindSimNav(); atkBind(); return; }
  if (!ATK.mons) { V.innerHTML = h + `<div class="panel empty"><span class="spin">モンスターの一覧を読み込み中…</span></div>`; bindSimNav(); atkBind(); atkMons().then(render).catch((e) => { ATK.mons = []; ATK.byId = new Map(); ATK.msg = "モンスターの一覧を読めませんでした: " + e.message; render(); }); return; }
  const m = ch.model, mob = (ATK.byId || new Map()).get(ATKS.mob);
  // --- 敵 ---
  h += `<div class="panel simbox"><div class="opts"><b>敵</b><input type="text" id="atkmq" placeholder="モンスター名で探す（例: ベルゼブブ）" value="${esc(ATK.mobQ)}" style="width:20em"> ${(ATKS.recent || []).map((id) => (ATK.byId.get(id) ? `<button class="ghost" data-amob="${id}">${esc(ATK.byId.get(id).name)}</button>` : "")).join("")}</div>
    <div id="atkmres" class="atkmres"></div>
    ${mob ? `<div class="atkmob"><b>${esc(mob.name)}</b> <span class="muted">${esc(atkMobDesc(mob))}</span></div>` : `<div class="muted">敵を選ぶと計算します。</div>`}</div>`;
  if (ATK.msg) h += `<div class="warn">${esc(ATK.msg)}</div>`;
  if (!mob) { V.innerHTML = h; bindSimNav(); atkBind(); atkMobList(); return; }
  // --- スキル ---
  let M = null, res = null, kind = "b", err = "";
  try { M = atkMethod(m); } catch (e) { err = "攻撃方法の一覧を作れませんでした: " + e.message; }
  if (M) {
    kind = atkKind(m, mob.id, M.mt);
    h += `<div class="panel simbox"><div class="bfbar"><label>スキル <select data-asel="full">${M.methods.filter((x) => x.skill !== 0 || M.methods.length === 1).map((x) => `<option value="${esc(x.full)}" ${x.full === ATKS.full ? "selected" : ""}>${esc(atkMethodLabel(x))}</option>`).join("")}</select></label>
      ${M.chain.map((c, i) => c.ol.type === 0
        ? `<label>${esc(i === 0 ? "Lv" : c.ol.label || "設定")} <select data-aopt="${i}">${c.ol.opts.map((o) => `<option value="${esc(o[0])}" ${o[0] === c.v ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select></label>`
        : `<label>${esc(c.ol.label || "設定")} <input type="number" data-aopt="${i}" value="${esc(c.v)}" style="width:6em"></label>`).join("")}
      <span class="tag">${kind === "p" ? "物理" : kind === "m" ? "魔法" : "物理・魔法"}</span></div>${sereHtml(m, M.item.skill)}</div>`;
  }
  // --- 時限効果 ---
  // 結果(期待値のとき、かかっている割合を時限効果の枠に出すので、先に計算する)
  let expInfo = null;
  if (M) {
    try { const ev = atkEval(m, { mobId: mob.id }, M.mt, mob.boss, kind); res = ev.r; expInfo = ev.exp; } catch (e) { err = "計算できませんでした: " + e.message; }
    if (!res && !err) err = "このスキルは、この敵に対して計算できませんでした";
  }
  const FX = atkFxSet(), owned = atkOwnedNames(m), grp = (k, t) => `<div class="atkfxg"><div class="muted atkfxt">${t}</div><div class="atkfxl">${atkFxAll().filter((e) => e.kind === k).map((e) => {
    const rel = kind === "b" || k === "b" || k === kind;
    return atkChip(e, owned, rel ? "" : " off", rel ? "" : "\nこの技には関係しないので、計算には入りません");
  }).join("") || `<span class="muted">なし</span>`}</div></div>`;
  const nOn = atkActiveIds(null).length;
  h += simcFold("atkfx", "ランダム発動の時限効果", `<div class="muted" style="font-size:12px;margin-bottom:6px">装備のエンチャントなどで一定確率で数秒〜数十秒かかる効果です。ラトリオにはオンオフが無いので、ここで選んで計算します。<b>左クリックで個数 +1、右クリックで −1</b>（0 でオフ）。個数は「発動率」に関わります（エンチャントを複数付けると発動率が足されます）。Extra系は常時の効果で、個数ぶん効果が増えます（装備している分はもう入っています）。技に関係しない効果（物理の技に魔法用など）は薄くなり、計算に入りません。マウスを乗せると中身が出ます。</div>
    ${atkFxCtlHtml(expInfo)}${grp("p", "物理")}${grp("m", "魔法")}${grp("b", "どちらも")}
    <details class="atkadd"><summary class="muted">＋ 自分で効果を追加（根源の魔力など、ここに無いもの）</summary>
      <div class="opts"><input type="text" id="afxn" placeholder="名前" value="${esc(ATK.fxForm.name)}" style="width:12em"><select id="afxk">${[["p", "物理"], ["m", "魔法"], ["b", "どちらも"]].map(([k, t]) => `<option value="${k}" ${ATK.fxForm.kind === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      ${ATK.fxForm.rows.map((r, i) => `<div class="opts"><select data-afxf="${i}">${ATK_FIELDS.map((f, j) => `<option value="${j}" ${r[0] === j ? "selected" : ""}>${esc(f[0])}</option>`).join("")}</select><input type="number" data-afxv="${i}" value="${r[1]}" style="width:6em"></div>`).join("")}
      <div class="opts"><button class="ghost" id="afxrow">＋ 項目を足す</button><button id="afxadd">この効果を追加</button></div></details>`,
    ` <span class="muted">オン ${nOn} 個${nOn ? ": " + atkActiveIds(null).map((id) => { const e = atkFxAll().find((x) => x.id === id) || {}; return e.name + (atkCount(id) > 1 ? "×" + atkCount(id) : ""); }).slice(0, 6).join("、") : ""}${nOn ? ((FX.mode || "exp") === "exp" ? " ／ 期待値" : " ／ かかったとき") : ""}</span>`, false);
  // --- 結果 ---
  if (err) h += `<div class="warn">${esc(err)}</div>`;
  if (res) {
    const avg = res.per.avg || 0, n = (v, f = 0) => simcNum(v, f);
    const need = avg ? Math.ceil(mob.hp / avg) : 0, secs = need && res.interval ? need * res.interval : 0;
    const act = atkActiveIds(kind);
    const contrib = act.map((id) => {
      const r2 = atkEval(m, { mobId: mob.id }, M.mt, mob.boss, kind, act.filter((x) => x !== id)).r;
      const e = atkFxAll().find((x) => x.id === id); return { label: e.name, v: avg - (r2 ? r2.per.avg || 0 : 0), note: r2 && r2.per.avg ? `無しだと ${n(r2.per.avg)}` : "" };
    }).filter((r) => r.v !== 0);
    h += `<div class="panel simbox"><div class="atkbig"><div><div class="muted">1回の使用（平均${expInfo ? "・期待値" : ""}）</div><b>${n(avg)}</b><div class="muted">最小 ${n(res.per.min)} ／ 最大 ${n(res.per.max)}</div></div>
      <div><div class="muted">DPS（1秒あたり${expInfo ? "・期待値" : ""}）</div><b>${n(res.perSec)}</b><div class="muted">変動詠唱 ${n(res.castVary, 2)} ＋ 固定詠唱 ${n(res.castFixed, 2)} ＋ ディレイ・間隔 ${n(res.atkIvl, 2)} ＝ ${n(res.interval, 2)} 秒${res.ground ? "（設置スキル: 詠唱を数えず間隔で割る）" : ""}</div></div>
      <div><div class="muted">倒すまで（HP ${fmtN(mob.hp)}）</div><b>${avg ? n(need) + " 回" : "-"}</b><div class="muted">${secs ? "約 " + n(secs, 1) + " 秒" : ""}</div></div></div>
      ${res.hits && res.hits[1] !== undefined ? `<div class="muted" style="font-size:12px">1ヒット ${n((res.unit || [])[1])}（ヒット数 ${n(res.hits[1])}）</div>` : ""}
      ${res.per.avg === 0 && !res.noDmg ? `<div class="warn">ダメージが 0 です。属性の相性か、「自分のスキル」の設定（精霊の召喚など）が要る技かもしれません。</div>` : ""}</div>`;
    h += simcFold("atkct", "時限効果ごとの上がり幅", contrib.length ? `<div class="atkbars">${atkBars(contrib, (v) => "+" + n(v), "")}</div><div class="muted" style="font-size:12px">それぞれを外したときと比べた、1回の使用あたりの差です。</div>` : `<div class="muted">オンにしている時限効果が、この技に効いていません。上の「ランダム発動の時限効果」でオンにしてください。</div>`, "", true);
    const rk = ATK.rank && ATK.rank.sig === JSON.stringify([SIMC.cur, mob.id, atkFxSig()]) ? ATK.rank : null;
    let rb = `<div class="opts"><button id="atkrank">${rk ? "もう一度比べる" : "全スキルを比べる"}</button>
      <label><input type="radio" name="atkrb" value="per" ${ATK.rankBy === "per" ? "checked" : ""}> 1回の使用</label><label><input type="radio" name="atkrb" value="sec" ${ATK.rankBy === "sec" ? "checked" : ""}> 1秒あたり</label>
      <span class="muted">各スキルは最大Lv・ほかの設定は初期値で、いまの敵・時限効果で計算します。バーを押すとそのスキルに切りかえます。</span></div>`;
    if (rk) { const rows = rk.rows.slice().sort((a, b) => (ATK.rankBy === "sec" ? b.sec - a.sec : b.per - a.per)).map((r) => ({ key: r.full, label: r.name, v: ATK.rankBy === "sec" ? r.sec : r.per, note: ATK.rankBy === "sec" ? `1回 ${n(r.per)}` : `1秒 ${n(r.sec)}` })); rb += `<div class="atkbars">${atkBars(rows, (v) => n(v), ATKS.full)}</div>`; }
    h += simcFold("atkrk", "スキルの比較", rb, "", false);
  }
  V.innerHTML = h; bindSimNav(); atkBind(); atkMobList();
}
function atkMobList() {                                              // 検索の結果(入力のたびに、この一覧だけ作り直す)
  const box = $("#atkmres"); if (!box || !ATK.mons) return;
  const q = pickNorm(ATK.mobQ); if (!q) { box.innerHTML = ""; return; }
  const hit = ATK.mons.filter((x) => pickNorm(x.name).includes(q) || pickNorm(x.kana).includes(q)).slice(0, 40);
  box.innerHTML = hit.length ? hit.map((x) => `<button class="ghost" data-amob="${x.id}" title="${esc(atkMobDesc(x))}">${esc(x.name)} <span class="muted">Lv${x.lv}</span></button>`).join("") : `<span class="muted">見つかりません。</span>`;
  box.querySelectorAll("[data-amob]").forEach((b) => b.onclick = () => atkPickMob(+b.dataset.amob));
}
function atkPickMob(id) { ATKS.mob = id; ATKS.recent = [id].concat((ATKS.recent || []).filter((x) => x !== id)).slice(0, 8); atkSave(); ATK.mobQ = ""; ATK.rank = null; render(); }
function atkBind() {
  const V = $("#view"), on = (sel, ev, fn) => V.querySelectorAll(sel).forEach((el) => el[ev] = () => fn(el));
  on("#atkslot", "onchange", (el) => { simcSelect(el.value); ATK.rank = null; render(); });
  const q = V.querySelector("#atkmq"); if (q) q.oninput = () => { ATK.mobQ = q.value; atkMobList(); };
  on("[data-amob]", "onclick", (el) => atkPickMob(+el.dataset.amob));
  on("[data-asel]", "onchange", (el) => { ATKS.full = el.value; ATKS.vals = []; atkSave(); render(); });
  on("[data-aopt]", "onchange", (el) => { const i = +el.dataset.aopt; ATKS.vals[i] = isNaN(+el.value) ? el.value : +el.value; ATKS.vals.length = i + 1; atkSave(); render(); });
  on("[data-apick]", "onclick", (el) => { ATKS.full = el.dataset.apick; ATKS.vals = []; atkSave(); render(); });
  on("input[name=atkrb]", "onchange", (el) => { ATK.rankBy = el.value; render(); });
  on("#atkrank", "onclick", (el) => {
    el.disabled = true; el.textContent = "計算中…";
    setTimeout(() => { try { const ch = simcCur(), mob = ATK.byId.get(ATKS.mob); ATK.rank = { sig: JSON.stringify([SIMC.cur, mob.id, atkFxSig()]), rows: atkRank(ch.model, mob.id, mob.boss) }; } catch (e) { ATK.msg = "比べられませんでした: " + e.message; } render(); }, 30);
  });
  on("#afxn", "onchange", (el) => { ATK.fxForm.name = el.value; });
  on("#afxk", "onchange", (el) => { ATK.fxForm.kind = el.value; });
  on("[data-afxf]", "onchange", (el) => { ATK.fxForm.rows[+el.dataset.afxf][0] = +el.value; });
  on("[data-afxv]", "onchange", (el) => { ATK.fxForm.rows[+el.dataset.afxv][1] = +el.value; });
  on("#afxrow", "onclick", () => { ATK.fxForm.rows.push([0, 0]); render(); });
  on("#afxadd", "onclick", () => {
    const f = ATK.fxForm, name = f.name.trim(); if (!name) { ATK.msg = "効果の名前を入れてください"; render(); return; }
    const fx = f.rows.filter((r) => r[1]).map((r) => [ATK_FIELDS[r[0]][1], ATK_FIELDS[r[0]][2], r[1]]); if (!fx.length) { ATK.msg = "値が 0 の項目しかありません"; render(); return; }
    const F = atkFxSet(); F.custom.push({ id: "u" + Date.now().toString(36), name, kind: f.kind, fx, custom: true, text: fx.map((x) => (ATK_FIELDS.find((a) => a[1] === x[0] && a[2] === x[1]) || [x[0] + x[1]])[0] + " " + (x[2] > 0 ? "+" : "") + x[2]).join("・") });
    ATK.fxForm = { name: "", kind: "b", rows: [[0, 0]] }; ATK.msg = ""; saveSettings(); render();
  });
}
// 枠(details)の開け閉めを覚える。描き直した直後に勝手に飛んでくる toggle は、中身が変わっていないので無視する
function foldBind(root, after) {
  root.querySelectorAll("details[data-fold]").forEach((el) => {
    let was = el.open;
    el.ontoggle = () => {
      if (el.open === was) return;
      was = el.open;
      const st = simcFoldState(); st[el.dataset.fold] = el.open; store.set("md_simfold", JSON.stringify(st));
      if (after) after(el);
    };
  });
}
// たためる枠。開け閉めは覚えておく(md_simfold = {枠の名前: 開いているか})
const simcFoldState = () => { try { return JSON.parse(store.get("md_simfold") || "{}"); } catch (e) { return {}; } };
// 装備に関係する項目(枠)は、いま選んでいる装備スロット・シャドウのスロットの色の枠にする(複数の色はしま。「比べる」で選んだ装備スロットの色も、比べられる枠に足す)
const SIMC_FOLDCOL = { res: "all", key: "cmp", opt: "all", resist: "cmp", x: "cmp", sb: "all", eq: "main", sh: "shadow" };
function simcFoldColors(key) {
  const k = SIMC_FOLDCOL[key], c = k && SIMV === "chara" ? simcCur() : null; if (!c) return [];
  const m = c.model, main = simcSetColor(false, m.foxSet), sh = simcSetColor(true, m.foxShadow);
  const cs = k === "main" ? [main] : k === "shadow" ? [sh] : [main, sh];
  if (k === "cmp") for (const sid of SIMC.cmp || []) cs.push(simcSetColor(false, sid));
  return cs.filter((x, i, a) => x && a.indexOf(x) === i);
}
function simcFold(key, title, body, head = "", openDefault = true) {
  const st = simcFoldState(), open = st[key] === undefined ? openDefault : st[key], cs = simcFoldColors(key);
  return `<details class="panel fold${cs.length ? " setframe" : ""}" ${cs.length ? `style="--fc:${simcGrad(cs)}" ` : ""}data-fold="${key}" ${open ? "open" : ""}><summary><b>${title}</b>${head}</summary>${body}</details>`;
}
const simcXKinds = () => { try { const v = JSON.parse(store.get("md_simx") || "[5]"); return Array.isArray(v) ? v.filter((k) => ENG_XKINDS.some(([id]) => id === k)) : [5]; } catch (e) { return [5]; } };
function simcExtraHtml(r) {
  const on = simcXKinds();
  return `<div class="settabs" style="margin-bottom:6px">${ENG_XKINDS.map(([id, t]) => `<button class="settab${on.includes(id) ? " on" : ""}" data-xk="${id}">${t}</button>`).join("")}</div>`
    + `<div class="xwrap" id="sccx">${simcExtraBody(r)}</div>`;
}
const simcAllKinds = () => simcXKinds().concat(ENG_RKINDS.map(([id]) => id));
const simcResistBody = (r) => ENG_RKINDS.map(([id, t]) => `<div class="xinfo"><div class="xttl">${t}</div>${(r.x || {})[id] || `<span class="muted">-</span>`}</div>`).join("");
// 耐性の枠をたたんだときに見出しへ出す1行: いちばん高い耐性と、無効にできている状態異常。ラトリオが作った表から読む
function simcResistSum(r) {
  const rows = (id) => { const d = document.createElement("div"); d.innerHTML = (r.x || {})[id] || ""; return [...d.querySelectorAll("tr")].filter((tr) => !tr.querySelector("table")).map((tr) => [...tr.cells].map((c) => c.textContent.trim())); };
  const num = (t) => { const mm = String(t || "").match(/-?[\d.]+/g); return mm ? parseFloat(mm[mm.length - 1]) : NaN; };
  const top = (list) => { const mx = Math.max(0, ...list.map((x) => x[1])); return mx > 0 ? `${list.filter((x) => x[1] === mx).map((x) => x[0]).join("・")} ${mx}%` : ""; };
  let sec = ""; const dmg = [];
  for (const c of rows(7)) { if (c.length === 1) { sec = c[0]; continue; } if (c.length >= 2 && /%$/.test(c[1]) && !/^\(/.test(c[1])) dmg.push([(sec === "ボス" || sec === "特殊" ? "" : sec) + c[0], num(c[1])]); }
  const num1 = (t) => { const mm = String(t || "").match(/-?[\d.]+/); return mm ? parseFloat(mm[0]) : NaN; };      // 「95% [過 10%]」のように後ろに別の数字が付くので、先頭の数字
  const ele = rows(6).slice(1).map((c) => [c[0], num1(c[1])]);
  const immune = rows(8).slice(1).filter((c) => num(c[1]) >= 100 || num(c[2]) >= 100).map((c) => c[0])
    .concat(rows(9).slice(1).filter((c) => num(c[1]) >= 100 || num(c[2]) >= 100).map((c) => c[0]));
  const a = top(dmg), b = top(ele);
  return [a ? `ダメージ耐性の最高: ${a}` : "", b ? `属性耐性の最高: ${b}` : "", `状態異常の無効: ${immune.length ? immune.join("・") : "なし"}`].filter(Boolean).join(" ／ ");
}
function simcExtraBody(r) {               // 「比べる」で装備スロットを選んでいるときは、同じ表を横に並べる
  const on = simcXKinds(), c = simcCur(), m = c && c.model;
  if (!on.length) return `<span class="muted">上のボタンで、見たい表を選んでください（いくつでも）。</span>`;
  const cmpOn = m && simcCmpIds(m).length, R = cmpOn && SIMC.cmpRes && SIMC.cmpRes.sig === simcCmpSig(m) ? SIMC.cmpRes : null;
  const block = (title, html, who) => `<div class="xinfo"><div class="xttl">${title}${who ? ` <span class="xwho">${who}</span>` : ""}</div>${html || `<span class="muted">-</span>`}</div>`;
  return ENG_XKINDS.filter(([id]) => on.includes(id)).map(([id, t]) => `<div class="xrow">${block(t, (r.x || {})[id], cmpOn ? "いまの計算機の装備" : "")}`
    + (R ? R.cols.map((x) => block(t, (x.r.x || {})[id], `<span class="settab on" style="--c:${tagColor(x.st)};cursor:default">${esc(x.st.tag)}</span>${x.miss ? ` <span class="warn">未装備 ${x.miss}</span>` : ""}`)).join("") : cmpOn ? `<div class="muted">比べています…</div>` : "") + `</div>`).join("");
}
function simcWearSet(sid, shadow) {       // sid = 装備セット(登録・履歴)の ID、または "now:キャラ名"(いまゲームで着ている装備)
  const ch = simcCur(), EQ = DATA.equip || {}; if (!ch) return;
  const m = ch.model, old = SIMC.report && SIMC.report.id === SIMC.cur ? SIMC.report.rows.filter((x) => (x.region >= 14) !== shadow) : [];
  let rows = [], link = sid;
  SIMC.rndMiss = []; SIMC.rndOk = 0;
  if (sid.startsWith("now:")) {
    const e = (EQ.chars || {})[sid.slice(4)]; if (!e) return;
    const items = (e.now || []).filter((i) => (shadow ? i.wear >= 65536 : i.wear & 1023));
    rows = simcWear(m, items, shadow); link = (shadow ? e.shadow : e.cur) || "";
  } else {
    const st = (EQ[shadow ? "shadows" : "sets"] || {})[sid]; if (!st) return;
    if (st.sim) simcApplyFrag(m, st.sim, shadow);
    else rows = simcWear(m, st.items || [], shadow);
  }
  if (shadow) { m.foxShadow = link; m.foxShadowSig = simcFragSig(m, true); } else { m.foxSet = link; m.foxSetSig = simcFragSig(m, false); }
  if (sid.startsWith("now:") && !shadow) { const e = (EQ.chars || {})[sid.slice(4)], st = e && e.status || {}; ch.name = simcSlotName(sid.slice(4), { lv: m.status.baseLv || st.lv, jobName: (ENG.jobs.find(([v]) => String(v) === String(m.status.jobId)) || [])[1] || st.jobName }, ((EQ.sets || {})[e && e.cur] || {}).tag); }
  SIMC.report = { id: SIMC.cur, rows: old.concat(rows), rnd: SIMC.rndMiss.length, rndOk: SIMC.rndOk, rndMiss: SIMC.rndMiss.slice(0, 12) };
  // 装備を替えると、装備で数字が変わる枠は計算し直しでガクガク動く → 閉じる(見たいときに開くと、そのとき計算する)
  const fs = simcFoldState(); ["res", "key", "resist", "x", "stppat", "stpsb", "stpsw", "stpeff", "stpgame"].forEach((k) => { fs[k] = false; }); store.set("md_simfold", JSON.stringify(fs));
  SIMC.res = null; simcSave(); render();
}
async function simcRegister(shadow, take) {     // いまの計算機の装備を装備セットに登録する(take = 上書きする相手の ID)
  const ch = simcCur(); if (!ch) return;
  const links = {}; Object.entries(SETTINGS.ratLinks || {}).forEach(([id, nm]) => { if (/^\d+$/.test(id) && nm) links[String(nm).replace(/\s*[(（]\+\d+以上[)）]\s*$/, "")] = +id; });
  const m = ch.model; SIMC.busy = "装備スロットに登録しています…"; render();
  const r = await postSet({ sim: { shadow, items: simcFragItems(m, shadow), data: simcGearFrag(m, shadow) }, take: take || "", links });
  SIMC.busy = "";
  if (!r.sid) { SIMC.msg = "登録できませんでした。"; render(); return; }
  if (shadow) { m.foxShadow = r.sid; m.foxShadowSig = simcFragSig(m, true); } else { m.foxSet = r.sid; m.foxSetSig = simcFragSig(m, false); }
  simcSave(); SIMC.msg = (take ? "装備セットを上書きしました。" : "装備セットに登録しました。") + (r.unlinked ? `ゲームのアイテムと結びつかなかった装備が ${r.unlinked} 個あります（装備セットタブで結びつけられます）。` : ""); await load(); render();
}
