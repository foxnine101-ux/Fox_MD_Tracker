"use strict";
// ---------- 計算機: キャラ・装備のシミュレーター(改良版ラトリオ) ----------
// 計算は、裏に隠した ROラトリオHub のページ(計算係)の「画面なしの計算の入口」を直接呼ぶ:
//   _ratorioReg.calcCoreFromModel(model) … model = キャラの設定(職業・Lv・ステータス・装備・支援…をまとめたデータ)
// 入力欄を外から操作するわけではないので、1回 約0.1秒で返る。計算の中身とデータベースは本家そのまま
// (本家が更新されたら「ラトリオを更新」で取り込むだけ)。キャラはこの PC に保存する(計算機のキャラ.json)
let SIMV = store.get("md_simv") || "chara";
function simNav() {
  return `<div class="simnav"><button data-simv="chara" class="${SIMV === "chara" ? "on" : ""}">キャラシミュレーター</button><button data-simv="atk" class="${SIMV === "atk" ? "on" : ""}">与ダメシミュ</button><button data-simv="dmg" class="${SIMV === "dmg" ? "on" : ""}">被ダメシミュ</button><button data-simv="sb" class="${SIMV === "sb" ? "on" : ""}">サンドバックマン</button></div>`;
}
function bindSimNav() { $("#view").querySelectorAll("[data-simv]").forEach((b) => b.onclick = () => { SIMV = b.dataset.simv; store.set("md_simv", SIMV); render(); }); }
function renderSim(chars) { simcFollowBoxes(); return SIMV === "dmg" ? renderSimDmg(chars) : SIMV === "atk" ? renderAtkTab() : SIMV === "sb" ? renderSandbagTab() : renderSimChara(); }

const ENG = { frame: null, ready: false, loading: null, reg: null, state: null, items: null, jobs: [], err: "" };
// ラトリオのファイルは /ratorio/v-<取り込んだ版>/… で読む。この形の URL はブラウザが覚えるので、2回目からは読み直さない(約440ファイル)。
// 計算係の中の import も必ず同じ頭にする(頭が違うと、同じ部品が別物として二重に読み込まれてしまう)
const engLog = (msg) => { try { fetch("/api/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg }) }).catch(() => { }); } catch (e) { } };
const ENG_CACHE_VER = "2";                 // サーバーが配る中身を変えたら上げる(同じ URL はブラウザが覚えたままになるので。2 = 外部の部品を同梱の写しに読みかえ)
const engBase = () => "/ratorio/v-" + ((RAT && RAT.commit) || "0") + "-" + ENG_CACHE_VER + "/";
function engInit(query) {                 // 計算係(隠したラトリオ)を用意する。query を渡すと、その保存データを読み込んだ状態で開き直す
  if (ENG.loading) return ENG.loading;
  if (ENG.ready && !query) return Promise.resolve();
  ENG.ready = false; ENG.err = "";
  ENG.loading = (async () => {
    if (ENG.frame) ENG.frame.remove();
    ENG.sb = null;                           // 前の計算係(消した窓)の部品を持ち越さない
    const f = ENG.frame = document.createElement("iframe");
    f.style.cssText = "position:fixed;left:-4000px;top:0;width:1400px;height:900px;visibility:hidden";
    f.setAttribute("aria-hidden", "true");
    f.src = engBase() + "ro4/m/calcx.html" + (query ? "?" + query : "");
    document.body.appendChild(f);
    // 初回は全部のファイルを読むので時間がかかる(遅い PC で1分以上)。見えている時間で2分半まで待つ(窓をしまっている間は、ブラウザが処理を遅くするので数えない)
    const t0 = Date.now(), errs = [];
    let seen = 0, last = "";
    const look = () => {
      const w = f.contentWindow, d = f.contentDocument, reg = w && w._ratorioReg, job = d && d.querySelector("#OBJID_SELECT_JOB");
      try { if (w && !w.__foxErr) { w.__foxErr = 1; w.addEventListener("error", (e) => { if (errs.length < 5) errs.push(String(e.message || (e.target && (e.target.src || e.target.href)) || "error").slice(0, 150)); }, true); w.addEventListener("unhandledrejection", (e) => { if (errs.length < 5) errs.push(String((e.reason && e.reason.message) || e.reason).slice(0, 150)); }); } } catch (e) { }
      let res = 0; try { res = w.performance.getEntriesByType("resource").length; } catch (e) { }
      last = `読み込み=${d ? d.readyState : "-"}・部品=${reg ? Object.keys(reg).length : "なし"}・職業の欄=${job ? job.options.length : "-"}・読んだファイル=${res}・エラー=${errs.length ? errs.join(" / ") : "なし"}`;
      return reg && reg.calcCoreFromModel && reg.extractModelFromDom && job && job.options.length > 5 ? reg : null;
    };
    let tErr = 0, tries = 0;
    for (let i = 0; seen < 150000; i++) {
      await sleep(250);
      if (!document.hidden) seen += 250;
      const reg = look(), job = f.contentDocument && f.contentDocument.querySelector("#OBJID_SELECT_JOB");
      // 部品を1つでも取りそこねると、ラトリオは最後まで動かない(待っても変わらない)。エラーが出たら、少し待って読み込み直す(取れた分はブラウザが覚えているので、やり直すたびに残りが減る)
      if (!reg && errs.length) {
        if (!tErr) tErr = Date.now();
        else if (Date.now() - tErr > 2500 && tries < 5) { tries++; engLog(`計算係の読み込みをやり直します(${tries}回目): ${last}`); errs.length = 0; tErr = 0; f.src = f.src; continue; }
      }
      if (reg && (!query || +job.value > 0 || i > 40)) { ENG.reg = reg; break; }
    }
    if (!ENG.reg) { engLog(`計算係の起動に失敗(${Math.round((Date.now() - t0) / 1000)}秒): ${last}`); throw new Error("計算係（ラトリオ）の起動に時間がかかりすぎました（様子を動作ログに書きました）"); }
    engLog(`計算係を起動しました(${Math.round((Date.now() - t0) / 100) / 10}秒): ${last}`);
    await sleep(query ? 1200 : 300);
    const w = f.contentWindow;
    ENG.state = await w.eval(`import("${engBase()}engine/runtime/roro-state.js")`);
    // 支援・アイテムの欄は「欄を開いている」印(n_Skill1/4/7/8SW)が立っているときだけ、model から計算に流し込まれる。
    // 計算の間だけ印を立てる(engCalc)。たたんだ欄の値は skillstate.js の配列に入っている(engFullModel で読む)
    ENG.sw = await Promise.all(["BuffJobSpecificSelf.js:setN_Skill1SW:n_Skill1SW", "BuffGuildAndGospel.js:setN_Skill4SW:n_Skill4SW", "BuffItemAndFood.js:setN_Skill7SW:n_Skill7SW", "BuffOtherCategory.js:setN_Skill8SW:n_Skill8SW"]
      .map(async (x) => { const [f, set, get] = x.split(":"), m = await w.eval(`import("${engBase()}engine/ui/${f}")`); return { m, set, get }; }));
    ENG.skill = await w.eval(`import("${engBase()}engine/skill/skillstate.js")`);
    ENG.hm = await w.eval(`import("${engBase()}engine/chara/hmjob.js")`);
    ENG.items = (await w.eval(`import("${engBase()}engine/equip/item.dat.js")`)).ItemObjNew;
    // 装備・カード・ランダムオプションの候補は、ラトリオが自分の画面を作るときの関数をそのまま呼んで作る(本家が変わっても追従する)
    const imp = (p) => w.eval(`import("${engBase()}engine/${p}")`);
    ENG.x = { job: (await imp("data/mig.job.h.js")).IsMatchJobRestrict, nm: await imp("equip/equip-name.js"), card: (await imp("equip/hmcard.js")).RebuildCardSelect,
      ro: await imp("equip/hmrndopt.js"), rnd: await imp("equip/rndopttype.h.js"), rndTypeId: (await imp("equip/item.h.js")).GetRndOptTypeId,
      rndTypes: (await imp("equip/rndopttype.dat.js")).g_rndOptTypeArray, rndListIdx: (await imp("const/EnumRndOptTypeDataIndex.js")).RND_OPT_TYPE_DATA_INDEX_LIST_ID_ARRAY };
    if (!query) { const b = ENG.reg.extractModelFromDom(); ENG.blank = (b.equip || []).slice(); ENG.blankShadow = ((b.shadowEquip || {}).itemId || []).slice(); }   // 「なし」のときの番号(開いた直後の状態)
    ENG.blank = ENG.blank || []; ENG.blankShadow = ENG.blankShadow || [];
    ENG.x.jobh = await imp("data/mig.job.h.js");
    try { await engSbInit(); } catch (e) { ENG.sb = null; engLog("サンドバックマンの部品を読めませんでした(ほかの機能はふつうに使えます): " + e.message); }      // ラトリオの更新で入口の名前が変わっても、計算機は起動する
    try { ENG.xinfo = (await imp("ui/CExtraInfoAreaComponentManager.js")).CExtraInfoAreaComponentManager; } catch (e) { ENG.xinfo = null; }
    ENG.cache = {}; ENG.calcCache = new Map();
    ENG.jobs = [...f.contentDocument.querySelector("#OBJID_SELECT_JOB").options].map((o) => [o.value, o.text]).filter(([, t]) => t);
    ENG.ready = true;
  })().catch((e) => { ENG.err = e.message; }).finally(() => { ENG.loading = null; });
  return ENG.loading;
}
// ラトリオの「拡張情報」の表。ラトリオの表示係(CExtraInfoAreaComponentManager)に、計算係の中の見えない枠へ描かせて、できた表を持ち帰る。
// 表示係は「直前の計算」の値(ラトリオの中の変数)を読むので、必ず engCalc の直後(同じ計算のうち)に呼ぶ
const ENG_XKINDS = [[5, "魔法特化"], [4, "物理特化"]];                                                  // 補助情報の枠で選ぶもの
const ENG_RKINDS = [[7, "ダメージ耐性"], [6, "属性倍率"], [8, "状態異常耐性"], [9, "新状態異常耐性"]];      // 耐性の枠(いつも4つとも出す)
function engExtra(raw, kinds) {
  const out = {};
  if (!ENG.xinfo || !kinds.length) return out;
  const d = ENG.frame.contentDocument, C = ENG.xinfo, inst = C.instanceManager.getInstanceList()[0];
  if (!inst) return out;
  const id = "OBJID_TD_EXTRA_INFO_" + inst.managerInstanceId;
  let td = d.getElementById(id);
  if (!td) { const t = d.createElement("table"); t.style.display = "none"; t.innerHTML = `<tbody><tr><td id="${id}"></td></tr></tbody>`; d.body.appendChild(t); td = d.getElementById(id); }
  C.setReferData(raw.charaData, raw.specData, raw.mobData);
  for (const k of kinds) {
    try {
      inst.selectedInfoId = +k; inst.RebuildDispArea(); inst.RefreshDispArea();
      const c = td.cloneNode(true);
      c.querySelectorAll("select,input,button,script,a").forEach((el) => el.remove());
      c.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      c.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));
      out[k] = c.innerHTML;
    } catch (e) { console.warn("extra info", k, e); }
  }
  inst.selectedInfoId = 0;
  return out;
}
// ラトリオの計算は1回 0.09秒ほどかかる(装備・カードの数にほぼ比例)。結果は覚えておく(最大 80 件。計算係を作り直すとき ENG.calcCache を空にする)。
// engCalc は必ず計算して(計算係の中の状態も model に合わせる)覚える。engCalcCached は、同じ内容を覚えていればそれを返す(結果だけ読む探索・並べる表用。返した結果は書きかえない)
function engCalc(model, xkinds) {
  const r = engCalcRaw(model, xkinds), M = ENG.calcCache || (ENG.calcCache = new Map()), key = JSON.stringify(model);
  M.delete(key); M.set(key, { want: (xkinds || []).slice().sort().join(","), r });
  if (M.size > 80) M.delete(M.keys().next().value);
  return r;
}
function engCalcCached(model, xkinds) {
  const M = ENG.calcCache, key = JSON.stringify(model), want = (xkinds || []).slice().sort().join(","), hit = M && M.get(key);
  if (hit && (!want || hit.want === want)) { M.delete(key); M.set(key, hit); return hit.r; }
  return engCalc(model, xkinds);
}
function engCalcRaw(model, xkinds) {         // 画面なしの計算。{c: 計算結果, core, tot: ステータスの合計, x: 拡張情報の表(頼んだときだけ)}
  const before = ENG.sw.map((x) => x.m[x.get]);
  ENG.sw.forEach((x) => x.m[x.set](true));              // 計算の間だけ「欄を開いている」ことにする → model の支援・アイテムが必ず使われる
  engRndReset(model.foxRnd);
  let r, x = {};
  try { r = ENG.reg.calcCoreFromModel(JSON.parse(JSON.stringify(model))); if (xkinds && xkinds.length) x = engExtra(r, xkinds); }
  finally { ENG.sw.forEach((x, i) => x.m[x.set](before[i])); }
  const st = ENG.state, tot = {};
  for (const k of ["STR", "AGI", "VIT", "INT", "DEX", "LUK"]) tot[k] = st["n_A_" + k];
  const bonus = ENG.hm.g_bonusStatus || [];
  ["POW", "STA", "WIS", "SPL", "CON", "CRT"].forEach((k, i) => { tot[k] = ((model.pureStatus || [])[6 + i] || 0) + (bonus[6 + i] || 0); });   // 特性ステータスは 素点 + 補正
  const dm = ENG.xinfo && ENG.xinfo.dispDataMap;      // 計算の直後に読む(ASPD の内訳: 12 = 装備の攻撃速度+%、101 = 装備・スキルの ASPD+)
  return { c: r.charaData, core: r.coreOutput || {}, tot, x, spec: r.specData || [], aspdU: dm ? dm.get(12) : null, aspdP: dm ? dm.get(101) : null };
}
// ふつうの装備のランダムオプションは model に入らず、ラトリオの中の表(g_equipRndOptTable[場所][枠] = [種類, 値])に残る(これも隠れた状態)。
// Fox では model.foxRnd[場所 0〜10] に持ち、計算のたびに表へ書き戻す。シャドウ装備の分は model.shadowEquip.rndOpt からラトリオが自分で入れる
function engRndReset(rnd) {
  const T = ENG.x.rnd.g_equipRndOptTable;
  for (let r = 0; r < T.length; r++) for (let i = 0; i < T[r].length; i++) { const v = r <= 10 ? ((rnd || [])[r] || [])[i] : null; T[r][i] = v ? [v[0] || 0, v[1] || 0] : [0, 0]; }
}
const engRndBlank = () => Array.from({ length: 11 }, () => Array.from({ length: 5 }, () => [0, 0]));
function engFullModel() {                // いまの計算係の状態を model に取り出す。たたんだ欄(支援・アイテム)の値も、配列から直接読んで入れる
  const model = JSON.parse(JSON.stringify(ENG.reg.extractModelFromDom())), sk = ENG.skill;
  const copy = (arr, len) => Array.from({ length: len }, (_, i) => { const v = arr[i]; return v === undefined || v === null ? 0 : (v === true ? true : v === false ? false : v); });
  model.passiveSkill = Array.from(sk.n_A_PassSkill || []).map((v) => v ?? 0);
  model.buff4 = copy(sk.n_A_PassSkill4 || [], 36);
  model.buff7 = copy(sk.n_A_PassSkill7 || [], 53);
  model.buff8 = copy(sk.n_A_PassSkill8 || [], 28);
  model.foxRnd = ENG.x.rnd.g_equipRndOptTable.slice(0, 11).map((r) => r.map((x) => [x[0] || 0, x[1] || 0]));
  return model;
}
// 支援・アイテム・スキルの欄の一覧(名前と選択肢)。ラトリオに欄を開かせて、できた入力欄を読む(本家が増やしても追従する)。
//   自分のスキル(固有自己支援)と習得スキルは職業ごとに違うので、計算係の職業をその職業にしてから読む。職業ごとに1回だけ(ENG.cache)
// 返すもの: [{g: 分類, sub: 小分類, f: model の欄の名前, i: 添字, label, type: "c" チェック / "s" 選択 / "n" 数値, opts: [[値, 表示]], max}]
const ENG_BUFF_SW = [["OBJID_CHECK_A1_SKILL_SW", "Click_PassSkillSW"], ["OBJID_CHECK_A4_SKILLSW", "Click_Skill4SW"], ["OBJID_CHECK_A7_SKILLSW", "Click_Skill7SW"], ["OBJID_CHECK_A8_SKILLSW", "Click_Skill8SW"]];
const ENG_CONF = [["other", "一次職", "confIchizi"], ["other", "二次職", "confNizi"], ["other", "三次職", "confSanzi"], ["other", "四次職", "confYozi"], ["debuff", "", "confDebuff"]];
async function engSchema(jobId) {
  const key = "schema" + jobId; if (ENG.cache[key]) return ENG.cache[key];
  const d = ENG.frame.contentDocument, w = ENG.frame.contentWindow, out = [];
  if (String(ENG.state.n_A_JOB) !== String(jobId)) { const sel = d.querySelector("#OBJID_SELECT_JOB"); sel.value = String(jobId); sel.dispatchEvent(new Event("change", { bubbles: true })); await sleep(700); }
  const open = (on) => ENG.sw.forEach((x, n) => { try { const cb = d.getElementById(ENG_BUFF_SW[n][0]); if (cb && cb.checked !== on) { cb.checked = on; x.m[ENG_BUFF_SW[n][1]](); } } catch (e) { console.warn("buff panel", n, e); } });
  const labelOf = (e) => {
    const l = e.id && d.querySelector(`label[for="${e.id}"]`); if (l && l.textContent.trim()) return l.textContent.trim();
    let t = "", n = e.previousSibling;
    while (n && !(n.nodeType === 1 && /^(SELECT|INPUT)$/.test(n.tagName))) { t = (n.textContent || "") + t; n = n.previousSibling; }
    t = t.replace(/\s+/g, " ").replace(/[：:]\s*$/, "").trim(); if (t) return t.slice(-40);
    const td = e.closest("td"), prev = td && td.previousElementSibling; if (prev && prev.textContent.trim()) return prev.textContent.trim();
    return e.options && e.options[0] ? e.options[0].text.replace(/\s*なし$/, "").replace(/^■/, "") : "";
  };
  const item = (g, sub, f, i, label, el) => {
    if (!el || !label || label === "-") return;
    if (el.type === "checkbox") { out.push({ g, sub, f, i, label, type: "c" }); return; }
    if (!el.options || el.options.length < 2) return;
    const opts = [...el.options].map((o) => [Number(o.value), o.text]);
    if (opts.some((o) => Number.isNaN(o[0]))) return;
    if (opts.length > 150) out.push({ g, sub, f, i, label, type: "n", max: Math.max(...opts.map((o) => o[0])) });
    else out.push({ g, sub, f, i, label, type: "s", opts });
  };
  try {
    open(true);
    const grab = (re, g, f) => [...d.querySelectorAll("select,input")].forEach((e) => { const mm = re.exec(e.name || e.id || ""); if (mm) item(g, "", f, +mm[1], labelOf(e), e); });
    grab(/^A_skill(\d+)$/, "self", "passiveSkill"); grab(/^A7_Skill(\d+)$/, "item", "buff7"); grab(/^A4_Skill(\d+)$/, "guild", "buff4"); grab(/^A8_Skill(\d+)$/, "guild", "buff8");
    // 他職の支援(一次〜四次)と状態異常: CConfBase の欄。定義(名前)は confDataObj、入力欄は OBJID_CONTROL_CONF_<番号>_ID_<添字>
    const CB = (await w.eval(`import("${engBase()}engine/ui/CConfBase.js")`)).CConfBase;
    ENG_CONF.forEach(([g, sub, f], n) => {
      const t = CB.targetArray[n]; if (!t) return;
      const o = t.objThis; o.BuildUpSelectArea(t.objRoot, true);
      o.confDataObj.forEach((cd) => item(g, sub, f, cd[0], String(cd[1] || ""), d.getElementById(o.GetControlIdString(t.instanceNo, cd[0]))));
      o.BuildUpSelectArea(t.objRoot, false);
    });
    // 習得スキル
    const lcb = d.getElementById("OBJID_SKILL_COLUMN_EXTRACT_CHECKBOX");
    if (lcb) {
      if (!lcb.checked) { lcb.click(); await sleep(200); }
      d.querySelectorAll('select[id^="OBJID_SELECT_LEARNED_SKILL_LEVEL_"]').forEach((e) => { const i = +e.id.slice(33), nm = d.getElementById("OBJID_TD_LEARNED_SKILL_NAME_" + i); item("learn", "", "learnedSkill", i, nm ? nm.textContent.trim() : "", e); });
      if (lcb.checked) lcb.click();
    }
  } finally { open(false); }
  return ENG.cache[key] = out;
}
async function engTemplate(jobId) {       // その職業のまっさらな model(装備なし)。職業を変えたときの下ごしらえはラトリオに任せる。約2.5秒かかるので、職業ごとに覚える(計算係を作り直すと忘れる)
  const key = "tpl" + jobId; if (ENG.cache[key]) return JSON.parse(ENG.cache[key]);
  const d = ENG.frame.contentDocument, sel = d.querySelector("#OBJID_SELECT_JOB");
  const set = async (v) => { sel.value = String(v); sel.dispatchEvent(new Event("change", { bubbles: true })); await sleep(700); };
  if (String(ENG.state.n_A_JOB) === String(jobId)) await set(String(jobId) === "0" ? "1" : "0");   // 同じ職業のままだと、前に読み込んだキャラの装備が残る → いったん別の職業にする
  await set(jobId);
  engRndReset(null);
  const model = engFullModel(); ENG.cache[key] = JSON.stringify(model);
  return model;
}
async function engSettle(max = 4000) {   // ラトリオの中の後片づけ(時間差で動く初期化など)が終わって、取り出した中身が変わらなくなるまで待つ
  let prev = "", t0 = Date.now();
  for (;;) { await sleep(300); const cur = JSON.stringify(engFullModel()); if (cur === prev || Date.now() - t0 > max) return; prev = cur; }
}
// model → ラトリオ互換の保存データ(URL の ? より後ろ)。ラトリオの「保存データを組み立てる部品」(savedata-collect.js)を画面なしで使う:
//   engCalc で model をラトリオの中の変数へ流し込む → extractSaveModelFromState() が変数から保存用の形を作る
//   → 画面の入力欄から読む項目(職業・Lv・ステータス・武器の属性・カード)だけ model の値で上書き → buildSaveDataUnits() → 文字にして圧縮
// 書き出したものを読み込み直すと、元と同じ model に戻ることを確認ずみ
async function engExportData(model) {
  const w = ENG.frame.contentWindow, imp = (p) => w.eval(`import("${engBase()}engine/${p}")`);
  const X = ENG.x.save = ENG.x.save || { col: await imp("savedata/savedata-collect.js"), z: await imp("savedata/zstd-codec.js"), cv: (await imp("savedata/CSaveDataConverter.js")).CSaveDataConverter, kJob: (await imp("const/EnumConstDataKind.js")).CONST_DATA_KIND_JOB };
  engCalc(model);
  const sm = X.col.extractSaveModelFromState(), st = model.status;
  Object.assign(sm, { jobId: +st.jobId, autoAdjustBaseLv: false, baseLv: st.baseLv, jobLv: st.jobLv, statStr: st.str, statAgi: st.agi, statVit: st.vit, statInt: st.int, statDex: st.dex, statLuk: st.luk,
    armsElement: (model.weapon || {}).zokusei || 0, speedPot: st.speedPot || 0 });
  ["Pow", "Sta", "Wis", "Spl", "Con", "Crt"].forEach((k, i) => { sm["stat" + k] = (model.pureStatus || [])[6 + i] || 0; });
  sm.passiveSkillSelfCount = ENG.reg.g_constDataManager.GetDataObject(X.kJob, +st.jobId).GetPassiveSkillIdArray().length;
  sm.equip.itemRegions.forEach((r) => { r.cardIds = SIMC_CARD[r.eqpRgnId].map((c) => model.card[c] || 0); r.cardCategoryIds = null; });
  sm.equip.shadowRegions.forEach((r) => { r.cardIds = SIMC_SHCARD[r.eqpRgnId].map((c) => model.card[c] || 0); });
  let text = "", off = 0;
  for (const u of X.col.buildSaveDataUnits(sm)) { u.doCompaction(); if (u.isEmptyUnit()) continue; [text, off] = u.encodeToURL(text, off); }
  const bytes = ENG.reg.CSaveController.stringToByteArray(JSON.stringify({ base: X.cv.CompressDataTextMIG(text), chart: null }));
  return "dx" + X.z.uint8ArrayToBase64(X.z.zstdCompressSync(bytes));
}
async function engLoadData(q) {          // ラトリオの保存データ(URL の ? より後ろ)を計算係に読み込ませて、model を取り出す。開き直さないので速い
  await engInit();
  if (!ENG.ready) throw new Error(ENG.err || "計算係を起動できませんでした");
  engRndReset(null);                       // 前の計算のランダムオプションが残らないように
  if (!ENG.settled) { await engSettle(); ENG.settled = true; }      // 起動した直後は、ラトリオの初期化がまだ動いていることがある(読み込んだ中身を消される)
  ENG.reg.CSaveController.loadFromURL(q);
  await engSettle(3000);
  return engFullModel();
}
const SIMC = { chars: null, cur: store.get("md_simchar") || "", res: null, busy: "", msg: "", saveT: null, need: null, needT: null, pick: null, sb: { methods: null, res: null, sig: "", err: "", mt: null, item: null, chain: null, recId: "", resF: null, fsig: "", kind: "b", expInfo: null }, dmgBase: null, fox: { char: "", set: "", shadow: "" }, cmp: [], cmpRes: null, cmpT: null, sbCmp: null, sbCmpT: null, cmpAll: false, opt: { aspd: true, cast: true, target: 193, mainSel: ["now"], shSel: ["now"], busy: false, res: null, prog: "", min: { agi: 1, dex: 1, int: 1 } }, multi: null, multiBusy: "", exp: null, bf: { tab: "on", sub: "", purpose: "", q: "", onOnly: false }, bfBusy: false, bfErr: "", tagBusy: false };
const simcCur = () => (SIMC.chars || {})[SIMC.cur];
async function simcLoad() {
  SIMC.chars = await fetch("/api/simchars").then((r) => (r.ok ? r.json() : Promise.reject(new Error("read")))).then((j) => { SIMC.loadErr = ""; return j; }).catch(() => { SIMC.loadErr = SIMC.chars ? "" : "計算機のスロットを読めませんでした。"; return SIMC.chars || null; });      // 読めなかったとき、空の一覧に見せない(新しく作って、ほかを消さないように)
  if (SIMC.chars && !SIMC.chars[SIMC.cur]) SIMC.cur = Object.keys(SIMC.chars)[0] || "";
}
const simcLoadingHtml = () => SIMC.loadErr ? `<div class="panel empty">${esc(SIMC.loadErr)} <button class="ghost" id="simcretry">もう一度読み込む</button> <button class="ghost" id="simcfix" title="読めないファイルを、別の名前にして残し、空のスロットから作り直します">壊れたファイルを別名にして作り直す</button></div>` : `<div class="panel empty"><span class="spin">読み込み中…</span></div>`;
function simcLoadingBind() {
  const b = $("#simcretry"); if (b) b.onclick = () => { SIMC.loadErr = ""; render(); };
  const f = $("#simcfix"); if (f) f.onclick = async () => {
    if (!confirm("計算機のスロットのファイル（計算機のキャラ.json）が読めません。\n\n別の名前（計算機のキャラ.壊れた_日時.json）にして残し、空のスロットから作り直します。よろしいですか?")) return;
    try { const r = await fetch("/api/simchars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quarantine: 1 }) }); if (!r.ok) throw new Error("HTTP " + r.status); SIMC.loadErr = ""; SIMC.chars = null; render(); }
    catch (e) { SIMC.loadErr = "別名にできませんでした: " + e.message; render(); }
  };
}
const simcClone = (x) => JSON.parse(JSON.stringify(x));
// いまログインしているキャラ(複数つながっているときは、いちばん最近動きがあったもの)。「いま着ている装備」は、このキャラの装備だけを指す
// いまログインしているキャラ。キャラ選択画面に戻っている間は空 → 「現在のキャラ」のボタンは、最後にログインしていたキャラ(装備・職業を覚えている中で、いちばん新しいもの)で使えるようにする
function lastChar() { const E = (DATA.equip || {}).chars || {}, n = nowChar(); if (n) return n; return Object.keys(E).filter((c) => (E[c].now || []).length && (E[c].status || {}).jobName).sort((x, y) => (E[y].updated || 0) - (E[x].updated || 0))[0] || ""; }
const charWho = () => { const c = lastChar(); return c ? (nowChar() ? cn(c) : "最後にログインしていた " + cn(c)) : ""; };
function nowChar() { const E = (DATA.equip || {}).chars || {}; return (DATA.now_chars || []).filter((c) => E[c]).sort((x, y) => (E[y].updated || 0) - (E[x].updated || 0))[0] || ""; }
const simcStripSb = (m) => { if (!m || !m.foxSb) return m; const c = Object.assign({}, m); delete c.foxSb; return c; };      // サンドバックマンの設定は「変更」に数えない
const simcDirtySlot = (c) => !!c && !!c.saved && JSON.stringify(simcStripSb(c.model)) !== JSON.stringify(simcStripSb(c.saved));
function simcSave() {                     // 少しまとめてから保存
  clearTimeout(SIMC.saveT);
  SIMC.saveT = setTimeout(() => { SIMC.saveT = null; const c = simcCur(); if (c) fetch("/api/simchars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: SIMC.cur, name: c.name, model: c.model, saved: c.saved }) }).then((r) => { if (!r.ok) SIMC.msg = "計算機のスロットを保存できませんでした（ファイルが読めない状態です）。"; }).catch(() => {}); }, 600);
}
function simcSelect(id) { SIMC.cur = id; store.set("md_simchar", id); SIMC.res = null; }
const simcPut = (id) => fetch("/api/simchars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name: SIMC.chars[id].name, model: SIMC.chars[id].model, saved: SIMC.chars[id].saved || SIMC.chars[id].model }) });
const simcJobName = (model) => (ENG.jobs.find(([v]) => String(v) === String(model.status.jobId)) || [0, "キャラ"])[1];
async function simcNew(jobId, name) {
  SIMC.busy = "キャラを作っています…"; render();
  await engInit();
  const model = await engTemplate(jobId);
  Object.assign(model.status, { baseLv: 200, jobLv: 60, str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 });
  const id = "c" + Date.now().toString(36);
  SIMC.chars[id] = { name: name || "新しいキャラ", model };
  simcSelect(id); simcSave(); SIMC.busy = ""; render();
}
async function simcImportUrl(text) {
  const q = String(text).trim().replace(/^.*\?/, "");
  if (!/^[A-Za-z0-9_\-=%.]{20,}$/.test(q)) { SIMC.msg = "ラトリオの保存URL（…calcx.html?〇〇）を貼り付けてください。"; render(); return; }
  SIMC.busy = "保存URL を読み込んでいます…"; SIMC.msg = ""; render();
  try {
    const model = await engLoadData(q);
    const id = "c" + Date.now().toString(36);
    SIMC.chars[id] = { name: `${simcJobName(model)} Lv${model.status.baseLv}（URLから）`, model };
    simcSelect(id); simcSave();
  } catch (e) { SIMC.msg = "読み込めませんでした: " + e.message; }
  SIMC.busy = ""; render();
}
// ラトリオのセーブファイル(#ratoriohub-savedata#。「名前,保存データ」が ; 区切りで並ぶ)。中身を一覧にして、選んだものだけ読み込む
async function simcOpenFile(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines[0].trim() !== "#ratoriohub-savedata#" || !lines[1]) { SIMC.msg = "ラトリオのセーブファイル（ratoriohub….txt）ではないようです。"; render(); return; }
  await engInit();
  if (!ENG.ready) { render(); return; }
  const SC = ENG.reg.CSaveController;
  const slots = lines[1].split(";").map((x, i) => { const k = x.indexOf(","), n = k < 0 ? "" : x.slice(0, k), d = k < 0 ? "" : x.slice(k + 1).trim(); let name = ""; try { name = n ? SC.decodeSaveName(n) : ""; } catch (e) { } return { i, name: name || `セーブ ${i + 1}`, d, on: true }; })
    .filter((x) => /^[A-Za-z0-9_\-=%.]{20,}$/.test(x.d));
  if (!slots.length) { SIMC.msg = "セーブファイルに、キャラが入っていませんでした。"; render(); return; }
  SIMC.pick = { slots }; SIMC.msg = ""; render();
}
async function simcImportPicked() {
  const list = SIMC.pick.slots.filter((x) => x.on); SIMC.pick = null;
  let ok = 0, last = "";
  for (let i = 0; i < list.length; i++) {
    SIMC.busy = `セーブファイルを読み込んでいます… ${i + 1} / ${list.length}（${list[i].name}）`; render();
    try {
      const model = await engLoadData(list[i].d), id = "c" + Date.now().toString(36) + i;
      SIMC.chars[id] = { name: list[i].name, model }; await simcPut(id); ok++; last = id;
    } catch (e) { console.warn("simc import", list[i].name, e); }
  }
  if (last) simcSelect(last);
  SIMC.busy = ""; SIMC.msg = `${ok} 件を読み込みました。` + (ok < list.length ? `（${list.length - ok} 件は読み込めませんでした）` : ""); render();
}
// 「ASPD 193 まで あといくつ」では動かしようがないので、AGI・DEX をいくつにすれば届くか(届いているなら、いくつまで下げられるか)を出す。
// それぞれ単独で動かした場合。計算係で 1〜上限 を二分探索する(1つのステータスで 8回ほど計算)
const SIMC_ASPD = 193, SIMC_STMAX = 130, SIMC_STTOP = 400;      // 130 = ふつうの上限。必要な値を出すときは 400 まで探す(130 を超えても計算は伸びる)
function simcNeedKick() {
  const ch = simcCur(); if (!ch || !ENG.ready) return;
  const sig = JSON.stringify(ch.model);
  if (SIMC.need && SIMC.need.sig === sig) return;
  clearTimeout(SIMC.needT);
  SIMC.needT = setTimeout(async () => {       // 入力が落ち着いてから(1秒)。1回の計算(0.09秒)ごとに画面の操作を通す
    const out = { sig };
    try {
      for (const k of ["agi", "dex"]) {
        const cur = ch.model.status[k] || 1;
        const at = async (v) => { await sleep(0); const now = simcCur(); if (!now || JSON.stringify(now.model) !== sig) throw new Error("changed"); const m = JSON.parse(sig); m.status[k] = v; return engCalcCached(m).c[37] >= SIMC_ASPD; };
        const top = Math.max(SIMC_STMAX, cur), prev = SIMC.need && k in SIMC.need ? SIMC.need[k] : undefined;      // 前の答えが手がかり(INT・VIT などを触っただけなら、答えは同じなので 2 回前後で済む)
        if (prev === null && !(await at(SIMC_STTOP))) out[k] = null;                                         // 前も届かなかった → 400 でもう一度確かめるだけ
        else if (typeof prev === "number" && prev <= top) out[k] = await simcGallop(at, prev, top);
        else if (typeof prev === "number" && (await at(prev)) && !(await at(prev - 1))) out[k] = prev;      // 上限を超える答えも、同じなら 2 回
        else if (await at(top)) out[k] = await simcGallop(at, cur, top);          // 上限までで届く → いまの値の近くから探す
        else if (!(await at(SIMC_STTOP))) out[k] = null;                      // 400 まで振っても届かない
        else { let lo = top, hi = SIMC_STTOP; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await at(mid)) hi = mid; else lo = mid; } out[k] = hi; }      // 上限を超える分
      }
    } catch (e) { return; }                 // 途中で値が変わった → 新しい値でやり直しが走っている
    SIMC.need = out;
    const el = $("#sccaspd"); if (el) el.innerHTML = simcNeedText(ch.model);
  }, 1000);
}
// ok(v) が「v が大きいほど true」になるとき、初めて true になる v(上限 top まで。届かなければ null)を、cur から広げて探す(近くにあれば少ない回数で済む)
async function simcGallop(ok, cur, top) {
  let lo, hi;
  if (await ok(cur)) { hi = cur; let step = 1; lo = cur - 1; while (lo >= 1 && await ok(lo)) { hi = lo; step *= 2; lo = hi - step; } lo = Math.max(lo, 0); }
  else { lo = cur; let step = 1; hi = cur + 1; while (hi < top && !(await ok(hi))) { lo = hi; step *= 2; hi = lo + step; } if (hi >= top) { hi = top; if (!(await ok(hi))) return null; } }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await ok(mid)) hi = mid; else lo = mid; }
  return hi;
}
function simcNeedText(m) {
  const nd = SIMC.need;
  if (!nd || nd.sig !== JSON.stringify(m)) return `<span class="spin">AGI・DEX の必要な値を計算中…</span>`;
  const reached = (SIMC.res && SIMC.res.c[37]) >= SIMC_ASPD;
  const one = (k, label) => {
    const cur = m.status[k] || 1, v = nd[k];
    if (v === null || v === undefined) return `<span class="warn">${label} だけでは届かない（${SIMC_STTOP} まで振っても）</span>`;
    if (v > SIMC_STMAX) return `<span class="warn">${label} ${cur}→<b>${v}</b>（+${v - cur}。ふつうの上限 ${SIMC_STMAX} を ${v - SIMC_STMAX} 超える）</span>`;
    if (v === cur) return reached ? `${label} ${cur} は削れない` : `${label} ${cur}`;
    return `${label} ${cur}→<b>${v}</b>（${v > cur ? "+" : "−"}${Math.abs(v - cur)}）`;
  };
  return (reached ? `<span class="good">193</span> のまま下げられるのは ` : `193 にするには `) + one("agi", "AGI") + (reached ? " ／ " : " または ") + one("dex", "DEX") + ` <span class="muted">（片方だけ動かした場合）</span>`;
}
// 結果の表(ラトリオのステータス欄に近い並び)
const simcNum = (v, f = 0) => v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toLocaleString("ja-JP", { maximumFractionDigits: f });
const simcRow = (l, v, note = "") => `<tr><td>${l}</td><td class="v">${v}</td><td class="muted">${note}</td></tr>`;
function simcResultHtml(m, r) {           // たたんでおく側(HP・ATK など)
  const c = r.c, n = simcNum, row = simcRow;
  return `<table>
    ${row("最大HP", n(c[23]))}${row("最大SP", n(c[24]))}
    ${row("ATK", `${n(c[25])} + ${n(c[26])}`)}${row("MATK", `${n(c[27])} + ${n(c[28])}`)}
    ${row("DEF", `${n(c[29])} + ${n(c[30])}`)}${row("MDEF", `${n(c[31])} + ${n(c[32])}`)}
    ${row("HIT", n(c[33]))}${row("FLEE", n(c[34]))}${row("完全回避", n(c[36], 1))}${row("クリティカル", n(c[35], 1))}
    ${row("HP回復 / SP回復", `${n(c[38])} / ${n(c[39])}`)}</table>`;
}
const simcSumText = (r) => `HP ${simcNum(r.c[23])} ／ SP ${simcNum(r.c[24])} ／ ATK ${simcNum(r.c[25])}+${simcNum(r.c[26])} ／ MATK ${simcNum(r.c[27])}+${simcNum(r.c[28])} ／ DEF ${simcNum(r.c[29])}+${simcNum(r.c[30])} ／ MDEF ${simcNum(r.c[31])}+${simcNum(r.c[32])}`;
function simcKeyHtml(m, r) {              // いつも見せる側(ASPD・詠唱・ディレイ)
  const c = r.c, n = simcNum, row = simcRow;
  const castP = (r.tot.DEX || 0) * 2 + (r.tot.INT || 0), aspd = c[37];
  return `<table>
    ${row("ASPD", `<span class="${aspd >= 193 ? "good" : ""}">${n(aspd, 1)}</span>`, aspd ? `<span id="sccaspd">${simcNeedText(m)}</span>` : "")}
    ${row("詠唱の値（DEX×2+INT）", `<span class="${castP >= 530 ? "good" : ""}">${n(castP)}</span>`, castP >= 530
      ? `変動詠唱なし（530 以上）。削れるのは DEX ${Math.floor((castP - 530) / 2)} または INT ${castP - 530}`
      : `変動詠唱なしにするには DEX +${Math.ceil((530 - castP) / 2)} または INT +${530 - castP}`)}
    ${row("変動詠唱の短縮", n(r.core.n_CastCutForDisp) + "%")}${row("固定詠唱の短縮", n(c[41]) + "%")}
    ${row("スキルディレイの短縮", n(r.core.delayDownForDisp) + "%")}</table>`;
}
// 検索つきのプルダウン(装備・カードなど数百件から選ぶ用)。opts = [{v: 値, t: 表示, k: 読み, d: 説明}]
const PICK = { el: null, out: null };
const pickNorm = (t) => String(t ?? "").normalize("NFKC").toLowerCase().replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 96)).replace(/\s+/g, "");
function pickClose() { if (PICK.el) { PICK.el.remove(); PICK.el = null; document.removeEventListener("mousedown", PICK.out, true); } }
function pickOpen(anchor, opts, cur, onPick, q0 = "") {
  pickClose();
  const box = PICK.el = document.createElement("div"); box.className = "pick";
  box.innerHTML = `<input type="text" placeholder="名前の一部で探す（空白で区切ると、両方を含むもの）"><div class="pick-list"></div><div class="pick-desc"></div>`;
  document.body.appendChild(box);
  const r = anchor.getBoundingClientRect(), W = Math.min(460, innerWidth - 16);
  box.style.width = W + "px"; box.style.left = Math.max(8, Math.min(r.left, innerWidth - W - 8)) + "px";
  if (innerHeight - r.bottom > 360 || r.top < 360) box.style.top = (r.bottom + 2) + "px"; else box.style.bottom = (innerHeight - r.top + 2) + "px";
  const inp = box.querySelector("input"), list = box.querySelector(".pick-list"), desc = box.querySelector(".pick-desc");
  const idx = opts.map((o) => pickNorm(o.t) + "\n" + pickNorm(o.k));
  let shown = [], at = 0;
  const mark = (scroll) => {
    [...list.querySelectorAll(".pick-o")].forEach((el, i) => el.classList.toggle("at", i === at));
    const el = list.querySelectorAll(".pick-o")[at]; if (scroll && el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    const o = shown[at]; desc.textContent = o && o.d ? o.d : ""; desc.style.display = o && o.d ? "" : "none";
  };
  const draw = () => {
    const terms = inp.value.split(/[\s\u3000]+/).map(pickNorm).filter(Boolean);
    const all = []; for (let i = 0; i < opts.length; i++) if (terms.every((t) => idx[i].includes(t))) all.push(opts[i]);
    shown = all.slice(0, 400); at = terms.length ? 0 : Math.max(0, shown.findIndex((o) => o.v === cur));
    list.innerHTML = (shown.map((o, i) => `<div class="pick-o${o.v === cur ? " cur" : ""}" data-i="${i}">${esc(o.t)}</div>`).join("") || `<div class="muted pick-more">見つかりません</div>`)
      + (all.length > shown.length ? `<div class="muted pick-more">ほか ${all.length - shown.length} 件（名前を入れて絞ってください）</div>` : "");
    mark(true);
  };
  const choose = (o) => { pickClose(); if (o) onPick(o.v, o); };
  inp.oninput = draw;
  inp.onkeydown = (e) => {
    if (e.key === "ArrowDown") { at = Math.min(shown.length - 1, at + 1); mark(true); e.preventDefault(); }
    else if (e.key === "ArrowUp") { at = Math.max(0, at - 1); mark(true); e.preventDefault(); }
    else if (e.key === "Enter") { choose(shown[at]); e.preventDefault(); }
    else if (e.key === "Escape") pickClose();
  };
  list.onmousemove = (e) => { const el = e.target.closest(".pick-o"); if (el && +el.dataset.i !== at) { at = +el.dataset.i; mark(false); } };
  list.onclick = (e) => { const el = e.target.closest(".pick-o"); if (el) choose(shown[+el.dataset.i]); };
  PICK.out = (e) => { if (!box.contains(e.target)) pickClose(); };
  setTimeout(() => document.addEventListener("mousedown", PICK.out, true), 0);
  inp.value = q0; draw(); inp.focus(); inp.select();
}
