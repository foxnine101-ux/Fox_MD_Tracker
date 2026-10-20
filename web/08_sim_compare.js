"use strict";
// ---- 装備セットを並べて比べる(ASPD・詠唱・ディレイ / 耐性 / 補助情報 の3つの枠で共通) ----
// 見出しの右の「比べる」で選んだ装備セットを、いまのキャラに着せた場合を横に並べる。ステータス・シャドウ装備・支援はいまのまま
const simcKeySum = (r) => `ASPD ${simcNum(r.c[37], 1)} ／ 詠唱の値 ${simcNum((r.tot.DEX || 0) * 2 + (r.tot.INT || 0))} ／ 変動詠唱 −${simcNum(r.core.n_CastCutForDisp)}% ／ 固定詠唱 −${simcNum(r.c[41])}% ／ ディレイ −${simcNum(r.core.delayDownForDisp)}%`;
function simcCmpIds(m) { const ok = new Set(simcSetList(m, false).tabs.map((x) => x.sid)); SIMC.cmp = SIMC.cmp.filter((sid) => ok.has(sid)); return SIMC.cmp; }
function simcCmpChips(m) {
  const tabs = simcSetList(m, false).tabs; if (!tabs.length) return "";
  const on = simcCmpIds(m);
  return `<span class="settabs right"><span class="muted">比べる</span>${tabs.map(({ sid, st }) => `<button class="settab${on.includes(sid) || sid === stpNowSid(m, false) ? " on" : ""}" data-cmp="${esc(sid)}" style="--c:${tagColor(st)}" title="${esc(st.name || st.auto || "")}（押すと、いまの装備と、このスロットの装備を着た場合を、横に並べます。複数選べます）">${esc(st.tag)}</button>`).join("")}</span>`;
}
const simcCmpSig = (m) => simcCmpIds(m).join(",") + "|" + simcAllKinds().join(",") + "|" + JSON.stringify(m);
function simcCmpKick(m) {
  if (!simcCmpIds(m).length) return;
  const sig = simcCmpSig(m);
  if (SIMC.cmpRes && SIMC.cmpRes.sig === sig) return;
  clearTimeout(SIMC.cmpT);
  SIMC.cmpT = setTimeout(async () => {
    const cols = [], T = (DATA.equip || {}).sets || {};
    for (const sid of SIMC.cmp) {
      const st = T[sid]; if (!st) continue;
      const mm = JSON.parse(JSON.stringify(m)); let missRows = [];
      if (st.sim) simcApplyFrag(mm, st.sim, false); else missRows = simcWear(mm, st.items || [], false);
      await sleep(0);
      const c = simcCur(); if (!c || simcCmpSig(c.model) !== sig) return;
      try { cols.push({ sid, st, miss: missRows.length, missRows, r: engCalc(mm, simcAllKinds()) }); } catch (e) { console.warn("cmp", e); }
    }
    SIMC.cmpRes = { sig, cols };
    simcCmpFill(m);
  }, 300);
}
function simcXParse(html, hasHeader) {    // ラトリオの表 → [{k: 見出し|項目, sec, label, val, hdr}]
  const d = document.createElement("div"); d.innerHTML = html || "";
  let sec = "", first = true; const out = [];
  for (const tr of d.querySelectorAll("tr")) {
    if (tr.querySelector("table")) continue;
    const c = [...tr.cells].map((x) => x.textContent.trim());
    if (c.length === 1) { if (c[0]) sec = c[0]; continue; }
    if (!c[0]) continue;
    out.push({ k: sec + "|" + c[0], sec, label: c[0], val: c.slice(1).join(" ／ "), hdr: hasHeader && first });
    first = false;
  }
  return out;
}
function simcCmpHead(cols) { return `<tr><th></th><th>いまの装備</th>${cols.map((x) => `<th><span class="settab on" style="--c:${tagColor(x.st)};cursor:default">${esc(x.st.tag)}</span>${simcMissHtml(x.missRows)}</th>`).join("")}</tr>`; }
function simcCmpKeyHtml(m, r) {
  const R = SIMC.cmpRes; if (!simcCmpIds(m).length) return "";
  if (!R || R.sig !== simcCmpSig(m)) return `<div class="muted">比べています…</div>`;
  const rows = [["ASPD", (x) => x.c[37], 1], ["詠唱の値（DEX×2+INT）", (x) => (x.tot.DEX || 0) * 2 + (x.tot.INT || 0), 0], ["変動詠唱の短縮 %", (x) => x.core.n_CastCutForDisp, 0], ["固定詠唱の短縮 %", (x) => x.c[41], 0], ["スキルディレイの短縮 %", (x) => x.core.delayDownForDisp, 0],
    ["最大HP", (x) => x.c[23], 0], ["最大SP", (x) => x.c[24], 0], ["ATK", (x) => (x.c[25] || 0) + (x.c[26] || 0), 0], ["MATK", (x) => (x.c[27] || 0) + (x.c[28] || 0), 0], ["DEF", (x) => (x.c[29] || 0) + (x.c[30] || 0), 0], ["MDEF", (x) => (x.c[31] || 0) + (x.c[32] || 0), 0]];
  return `<table class="multi cmp">${simcCmpHead(R.cols)}${rows.map(([label, f, dig]) => { const b = f(r); return `<tr><td>${label}</td><td class="v">${simcNum(b, dig)}</td>${R.cols.map((x) => { const v = f(x.r), d = Math.round(((v || 0) - (b || 0)) * 10) / 10; return `<td class="v${d ? " cmpd" : ""}">${simcNum(v, dig)}${d ? ` <span class="${d > 0 ? "good" : "warn"}">${d > 0 ? "+" : "−"}${simcNum(Math.abs(d), dig)}</span>` : ""}</td>`; }).join("")}</tr>`; }).join("")}</table>`;
}
function simcCmpXHtml(m, r, kinds) {      // kinds = [[番号, 名前]]。違いのある行だけ(「同じ行も出す」で全部)
  const R = SIMC.cmpRes; if (!simcCmpIds(m).length) return "";
  if (!R || R.sig !== simcCmpSig(m)) return `<div class="muted">比べています…</div>`;
  let h = `<table class="multi cmp">${simcCmpHead(R.cols)}`;
  for (const [id, title] of kinds) {
    const hasH = [6, 8, 9].includes(id), base = simcXParse((r.x || {})[id], hasH), others = R.cols.map((x) => Object.fromEntries(simcXParse((x.r.x || {})[id], hasH).map((y) => [y.k, y.val])));
    const body = base.filter((y) => !y.hdr).map((y) => { const vs = others.map((o) => o[y.k] ?? "-"), diff = vs.some((v) => v !== y.val); return diff || SIMC.cmpAll ? `<tr><td>${y.sec ? `<span class="muted">${esc(y.sec)}</span> ` : ""}${esc(y.label)}</td><td class="v">${esc(y.val)}</td>${vs.map((v) => `<td class="v${v !== y.val ? " cmpd" : ""}">${esc(v)}</td>`).join("")}</tr>` : ""; }).join("");
    const hd = base.find((y) => y.hdr);
    h += `<tr class="cmpk"><td colspan="${2 + R.cols.length}"><b>${title}</b>${hd ? ` <span class="muted">（${esc(hd.val)}）</span>` : ""}${body ? "" : ` <span class="muted">違いなし</span>`}</td></tr>` + body;
  }
  return h + `</table><label class="muted" style="font-size:12px"><input type="checkbox" data-cmpall ${SIMC.cmpAll ? "checked" : ""}> 同じ行も出す</label>`;
}
function simcDmgBind(m) {
  const box = $("#sccdmg"); if (!box) return;
  const redo = () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); simcDmgFill(m); };
  box.querySelectorAll("[data-sd]").forEach((el) => el.onchange = () => {
    const k = el.dataset.sd, v = el.type === "checkbox" ? el.checked : el.value;
    if (k === "char") { SIM.char = v; SIM.sets = null; SIM.base = ""; SIM.key = ""; SIM.md = ""; }
    else if (k === "manual") { SIM.manual = v; SIM.base = ""; }
    else if (k === "md") { SIM.md = v; SIM.key = ""; SIM.base = ""; SIM.eleOv = ""; }
    else if (k === "key") { SIM.key = v; SIM.base = ""; SIM.eleOv = ""; }
    else if (k === "dmg") SIM.dmg = +v || 0;
    else SIM[k] = v;
    redo();
  });
  box.querySelectorAll("[data-sdbuff]").forEach((el) => el.onchange = () => { const [w, k] = el.dataset.sdbuff.split("."); (w === "B" ? SIM.buffB : SIM.buffT)[k] = Math.min(100, Math.max(0, +el.value || 0)); redo(); });
  const mk = $("#sdmake"); if (mk) mk.onclick = () => { const P = simAtkPick(); if (!P) return; SIMC.fox = { char: P.c, set: P.baseMain, shadow: P.baseSh }; simcFromFox(true); };
}
function simcDmgFill(m) {
  const r = SIMC.res, box = $("#sccdmg"); if (!r || !box) return;
  box.innerHTML = simcDmgHtml(m, r); const sm = $("#sccdsum"); if (sm) sm.textContent = simcDmgSum(m, r);
  simcDmgBind(m);
}
function simcCmpFill(m) {
  const r = SIMC.res; if (!r) return;
  simcDmgFill(m);
  const set = (id, html) => { const el = $("#" + id); if (el) el.innerHTML = html; };
  set("scckeycmp", simcCmpKeyHtml(m, r)); set("sccresistcmp", simcCmpXHtml(m, r, ENG_RKINDS)); set("sccx", simcExtraBody(r)); set("sccxcmp", "");
  $("#view").querySelectorAll("[data-cmpall]").forEach((el) => el.onchange = () => { SIMC.cmpAll = el.checked; simcCmpFill(m); });
}
// ---- その枠に効く支援・アイテム・スキルを、枠の中でもオンオフできるようにする(「支援・アイテム・スキル」の枠と同じもの = 同期) ----
// 効くかどうかは目的別のしぼり込みと同じ印(simcTags: a ASPD / c 詠唱・ディレイ / d 耐久)。選ぶ式のものは、オン = いちばん上の値
function simcRelHtml(m, letters, key, title) {
  const sc = simcSchema(m), tags = simcTags(m);
  if (!sc || !tags) return `<div class="muted relnote">${title}は、効果を調べ終わるとここに並びます…</div>`;
  const list = sc.filter((it) => it.g !== "learn" && it.type !== "n" && [...letters].some((l) => (tags[simcBuffKey(it)] || "").includes(l)));
  if (!list.length) return "";
  const qi = (it) => SIMC_QUICK.findIndex(([f, i]) => it.f === f && it.i === i);       // よく使うものは、いちばん上に
  list.sort((a, b) => (qi(b) >= 0) - (qi(a) >= 0) || (qi(a) >= 0 && qi(b) >= 0 ? qi(a) - qi(b) : 0) || simcBuffOn(m, b) - simcBuffOn(m, a));
  const nOn = list.filter((it) => simcBuffOn(m, it)).length, st = simcFoldState(), open = st[key] === undefined ? true : st[key];
  const potH = letters.includes("a") ? simcPotHtml(m) : "";
  return `<details class="relbox" data-fold="${key}" ${open ? "open" : ""}><summary><span>${title}</span> <span class="muted">（オン ${nOn} ／ ${list.length}。「支援・アイテム・スキル」の枠と同じものです）</span></summary>${potH}<div class="relgrid">${list.map((it) => {
    const on = simcBuffOn(m, it), v = simcBuffVal(m, it), ot = it.type === "s" && on ? (it.opts.find((o) => o[0] === Number(v)) || [])[1] : "";
    return `<label class="bfi sm sw${on ? " on" : ""}" title="${esc(it.f === "buff8" && it.i === 22 ? JONDA_TIP : it.label)}"><input type="checkbox" data-rel="${simcBuffKey(it)}" ${on ? "checked" : ""}><span class="swt"></span><span class="bfl">${esc(simcBuffLabel(it))}</span>${ot ? `<span class="bfg">${esc(ot)}</span>` : ""}</label>`;
  }).join("")}</div></details>`;
}
// ---- 被ダメの検証(計算機のキャラで): 被ダメの記録の攻撃を、いまシミュレートしているキャラが受けたらどうなるか ----
// 軽減前のダメージは、これまでの「被ダメの検証」と同じ逆算(受けたダメージと、そのときの装備の軽減から)。
// かけ直す側の軽減は、計算係(ラトリオ)の結果から取る: 属性は「属性倍率」の表、種族・ボス・サイズ・遠距離は「ダメージ耐性」の表、
// DEF/MDEF は charaData[7,8](除算・減算)/[9,10]、RES/MRES は 装備の分(specData[254,255]) + STA・WIS の分。選ぶ中身(SIM)は「被ダメの検証」の画面と共通
function simAtkPick() {
  const EQ = DATA.equip || {}, E = EQ.chars || {}, S = EQ.sets || {};
  const names = Object.keys(DATA.chars || {}).filter((c) => Object.keys((DATA.chars[c] || {}).dmg || {}).length);
  if (!names.length) return null;
  if (!names.includes(SIM.char)) SIM.char = names[0];
  const c = SIM.char, dmg = (DATA.chars[c] || {}).dmg || {}, dmgG = (DATA.chars[c] || {}).dmg_g || {}, mds = Object.keys(dmg);
  if (!SIM.manual && !dmg[SIM.md]) SIM.md = mds.slice().sort((a, b) => Math.max(...Object.values(dmg[b]).map((v) => v[3])) - Math.max(...Object.values(dmg[a]).map((v) => v[3])))[0];
  const rows = SIM.manual ? [] : Object.entries(dmg[SIM.md] || {}).filter(([k]) => kindOf(k.split("|")[1])[1] !== "属性なし").sort((a, b) => b[1][2] - a[1][2]);
  if (!SIM.manual && !rows.some(([k]) => k === SIM.key)) SIM.key = rows.length ? rows[0][0] : "";
  let atk, baseDmg, baseOpts = [];
  if (SIM.manual) {
    atk = { who: "（手で入力）", skill: "", kind: SIM.kind, ele: SIM.ele, race: SIM.race, size: SIM.size, boss: SIM.boss === "" ? "" : SIM.boss === "1" };
    baseDmg = +SIM.dmg || 0;
  } else {
    const [who, skill] = SIM.key.split("|"), row = (dmg[SIM.md] || {})[SIM.key] || [0, 0, 0];
    const [kd, el] = rowKind(skill, row), mob = (DATA.dmg_mobs || {})[who];
    const seen = [...(DATA.dmg_recent || [])].reverse().find((r) => r.src === who && r.skill === skill && r.md === SIM.md && r.ele && !r.ele.includes("/"));
    SIM.autoEle = (seen && seen.ele) || first(el) || "無";
    atk = { who, skill, kind: kd === "物理・近/遠" || kd === "物理" ? "物理・近接" : kd || "魔法", ele: SIM.eleOv || SIM.autoEle, race: mob ? first(mob.race) : "", size: mob ? first(mob.size) : "", boss: mob ? first(mob.boss) === "1" : "" };
    baseOpts = Object.entries(dmgG[SIM.md] || {}).filter(([id, g]) => g[SIM.key] && S[gearMain(id)]).map(([id, g]) => [id, g[SIM.key][2]]).sort((a, b) => b[1] - a[1]);
    if (!baseOpts.some(([id]) => id === SIM.base) && !(SIM.base && S[gearMain(SIM.base)] && !baseOpts.length)) SIM.base = baseOpts.length ? baseOpts[0][0] : (E[c] && E[c].cur ? E[c].cur + (E[c].shadow ? "+" + E[c].shadow : "") : Object.keys(S)[0] || "");
    baseDmg = (baseOpts.find(([id]) => id === SIM.base) || [0, row[2]])[1];
  }
  if (SIM.manual && !S[gearMain(SIM.base)]) SIM.base = E[c] && E[c].cur ? E[c].cur + (E[c].shadow ? "+" + E[c].shadow : "") : Object.keys(S)[0] || "";
  return { names, c, mds, rows, atk, baseDmg, baseOpts, baseMain: gearMain(SIM.base), baseSh: gearShadow(SIM.base) };
}
const SIMC_RACE_RAT = { "魚貝": "魚類", "竜": "竜族" };
function simcDmgStages(atk, r, buff) {    // 計算係の結果から作る軽減の段階(simStages と同じ形・同じ名前)
  const out = [], pct = (v) => Math.max(0, 1 - (v || 0) / 100), nums = (t) => (String(t || "").match(/-?[\d.]+/g) || []).map(Number);
  const phys = atk.kind.startsWith("物理"), magic = atk.kind === "魔法", fixed = atk.kind === "固定";
  let sub = 0;
  if (!fixed) {
    const e6 = simcXParse((r.x || {})[6], true).find((y) => y.label === atk.ele), v6 = e6 ? nums(e6.val) : [];      // [属性耐性, 属性倍率(鎧の属性の相性), 最終倍率]
    out.push(["鎧の属性", (v6[1] ?? 100) / 100, `${v6[1] ?? 100}%`]);
    out.push([`${atk.ele}属性の耐性`, pct(Math.min(v6[0] || 0, 95)), `${v6[0] || 0}%`]);
    const t7 = simcXParse((r.x || {})[7], false), get = (sec, label) => { const y = t7.find((z) => z.sec === sec && z.label === label); return y ? (nums(y.val)[0] || 0) : 0; };
    if (atk.race) { const v = get("種族", SIMC_RACE_RAT[atk.race] || atk.race); out.push([`${atk.race}形からの耐性`, pct(v), `${v}%`]); }
    if (atk.boss !== "") { const k = atk.boss ? "ボス" : "一般", v = get("ボス", k); out.push([`${k}モンスターからの耐性`, pct(v), `${v}%`]); }
    if (atk.size) { const v = get("サイズ", atk.size + "型"); out.push([`${atk.size}型からの耐性`, pct(v), `${v}%`]); }
    if (atk.kind === "物理・遠距離") { const v = get("特殊", "遠距離"); out.push(["遠距離物理の耐性", pct(v), `${v}%`]); }
    const sp = r.spec || [], tr = (k) => r.tot[k] || 0;
    if (phys) {
      const hard = Math.max(0, r.c[7] || 0), res = (sp[254] || 0) + tr("STA") + Math.floor(tr("STA") / 3) * 5;
      out.push([`DEF（装備 ${hard}）`, (4000 + hard) / (4000 + hard * 10), ""]); out.push([`RES（${res}）`, (2000 + res) / (2000 + res * 5), ""]);
      sub = Math.max(0, r.c[8] || 0);
    } else if (magic) {
      const hard = Math.max(0, r.c[9] || 0), res = (sp[255] || 0) + tr("WIS") + Math.floor(tr("WIS") / 3) * 5;
      out.push([`MDEF（装備 ${hard}）`, (1000 + hard) / (1000 + hard * 10), ""]); out.push([`MRES（${res}）`, (2000 + res) / (2000 + res * 5), ""]);
      sub = Math.max(0, r.c[10] || 0);
    }
  }
  if (buff.ec) out.push(["エナジーコート", pct(buff.ec), `${buff.ec}%`]);
  if (buff.cut) out.push(["ダメージ減少スキル", pct(buff.cut), `${buff.cut}%`]);
  if (buff.extra) out.push(["そのほかの軽減", pct(buff.extra), `${buff.extra}%`]);
  return { list: out, mult: out.reduce((a, x) => a * x[1], 1), sub };
}
// 受けたときに近い写し: このスロットのキャラに、そのときのステータス(通信で読んだ値)と装備セットを入れて、計算係で計算したもの。
// 計算係は RES/MRES などを全部は再現できないので、ダメージは「記録のダメージ × (いまの軽減 ÷ この写しの軽減)」で出す(計算係のくせは打ち消し合い、装備・ステータス・支援の差だけが効く)。
// 職業が違うスロットでは写しを作れない → 記録の表(gear_info)からの逆算にもどす
function simcDmgBase(m, P) {
  const EQ = DATA.equip || {}, st = simStatus(P.c, P.baseMain), key = JSON.stringify([m, P.c, P.baseMain, P.baseSh, simcAllKinds()]);
  if (SIMC.dmgBase && SIMC.dmgBase.key === key) return SIMC.dmgBase.r;
  let r = null;
  if (st.jobName && simcJobName(m) === st.jobName) {
    try {
      const mm = simcClone(m);
      if (st.lv) mm.status.baseLv = st.lv;
      ["str", "agi", "vit", "int", "dex", "luk"].forEach((k) => { const v = (st.stats || {})[k.toUpperCase()]; if (v && v.base !== undefined) mm.status[k] = v.base; });
      ["POW", "STA", "WIS", "SPL", "CON", "CRT"].forEach((k, n) => { const v = (st.stats || {})[k]; if (v && v.base !== undefined) mm.pureStatus[6 + n] = v.base; });
      const wear = (T, sid, shadow) => { const x = (T || {})[sid]; if (!x) return; if (x.sim) simcApplyFrag(mm, x.sim, shadow); else simcWear(mm, x.items || [], shadow); };
      wear(EQ.sets, P.baseMain, false); wear(EQ.shadows, P.baseSh, true);
      r = engCalc(mm, simcAllKinds());
    } catch (e) { console.warn("dmg base", e); r = null; }
  }
  SIMC.dmgBase = { key, r };
  return r;
}
function simcDmgCalc(m, r) {              // {P: 選んだ攻撃, base: 受けたときの列, raw, rel: 写しを使えたか, cols: [{label, T, dmg, hp, st}]}
  const P = simAtkPick(); if (!P) return null;
  const B = simStages(P.atk, simProfile(P.baseMain, P.baseSh), simStatus(P.c, P.baseMain), SIM.buffB);
  const none = { ec: 0, cut: 0, extra: 0 }, bm = (b) => [b.ec, b.cut, b.extra].reduce((a, v) => a * Math.max(0, 1 - (v || 0) / 100), 1);
  const rB = simcFoldState().dmg ? simcDmgBase(m, P) : (SIMC.dmgBase || {}).r || null, EB = rB ? simcDmgStages(P.atk, rB, none) : null;
  const rel = !!(EB && EB.mult > 0 && bm(SIM.buffB) > 0);
  const raw = rel ? (P.baseDmg + B.sub) / (EB.mult * bm(SIM.buffB)) : B.mult > 0 ? (P.baseDmg + B.sub) / B.mult : 0;
  const col = (label, rr, st) => {
    const T = simcDmgStages(P.atk, rr, SIM.buffT);
    const sub = rel ? Math.max(0, B.sub + T.sub - EB.sub) : T.sub;       // 引かれる分: 記録の値に、計算係での差を足す
    return { label, st, T: { list: T.list, mult: T.mult, sub }, dmg: Math.max(0, Math.round(raw * T.mult - sub)), hp: rr.c[23] || 0 };
  };
  const cols = [col("この計算機のキャラ", r)];
  const R = SIMC.cmpRes; if (R && simcCmpIds(m).length && R.sig === simcCmpSig(m)) for (const x of R.cols) cols.push(col(x.st.tag, x.r, x.st));
  const base = { label: "受けたとき", base: true, st: ((DATA.equip || {}).sets || {})[P.baseMain], dmg: P.baseDmg, hp: (simStatus(P.c, P.baseMain).derived || {}).MaxHP || 0,
    T: rel ? { list: simcDmgStages(P.atk, rB, SIM.buffB).list, sub: B.sub } : B };
  return { P, B, raw, rel, base, cols };
}
function simcDmgSum(m, r) {
  const D = simcDmgCalc(m, r); if (!D || !D.P.baseDmg) return "";
  const c = D.cols[0];
  return `${D.P.atk.who}${D.P.atk.skill ? " の " + D.P.atk.skill : ""}: 受けたとき ${fmtN(D.P.baseDmg)} → このキャラなら ${fmtN(c.dmg)}（${c.dmg < c.hp ? "耐える・残り " + fmtN(c.hp - c.dmg) : "倒れる・HP " + fmtN(c.hp)}）`;
}
function simcDmgHtml(m, r) {
  const D = simcDmgCalc(m, r);
  if (!D) return `<div class="muted">被ダメの記録がまだありません。ゲームで攻撃を受けると、ここで「この装備なら耐えられたか」を試せます。</div>`;
  const { P, raw, cols } = D, S = (DATA.equip || {}).sets || {}, atk = P.atk;
  const selOpt = (arr, cur) => arr.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("");
  const buffRow = (id, b, label) => `<div class="opts"><span class="muted" style="min-width:9.5em">${label}</span>
      <label>エナジーコート <select data-sdbuff="${id}.ec">${selOpt([[0, "なし"], [6, "6%"], [12, "12%"], [18, "18%"], [24, "24%"], [30, "30%"]], b.ec)}</select></label>
      <label>ダメージ減少スキル <select data-sdbuff="${id}.cut">${selOpt(SIM_CUTS, b.cut)}</select></label>
      <label>そのほかの軽減 <input type="number" min="0" max="100" data-sdbuff="${id}.extra" value="${b.extra || ""}" placeholder="0"> %</label></div>`;
  let h = `<div class="opts"><b>攻撃</b><label>受けたキャラ <select data-sd="char">${selOpt(P.names.map((x) => [x, cn(x)]), P.c)}</select></label>
      <label><input type="checkbox" data-sd="manual" ${SIM.manual ? "checked" : ""}> 手で入れる</label>`;
  if (SIM.manual) {
    h += `<label>受けたダメージ <input type="number" data-sd="dmg" min="0" value="${SIM.dmg || ""}" placeholder="例 250000" style="width:8em"></label>
      <label>種類 <select data-sd="kind">${selOpt(["物理・近接", "物理・遠距離", "魔法", "固定"].map((x) => [x, x]), SIM.kind)}</select></label>
      <label>属性 <select data-sd="ele">${selOpt(SIM_ELES.map((x) => [x, x]), SIM.ele)}</select></label>
      <label>種族 <select data-sd="race">${selOpt([["", "わからない"]].concat(SIM_RACES.map((x) => [x, x])), SIM.race)}</select></label>
      <label>サイズ <select data-sd="size">${selOpt([["", "わからない"], ["小", "小"], ["中", "中"], ["大", "大"]], SIM.size)}</select></label>
      <label>ボス <select data-sd="boss">${selOpt([["", "わからない"], ["1", "ボス"], ["0", "一般"]], SIM.boss)}</select></label></div>`;
  } else {
    h += `<label>場所 <select data-sd="md">${selOpt(P.mds.map((x) => [x, x]), SIM.md)}</select></label>
      <label>攻撃 <select data-sd="key" style="max-width:380px">${selOpt(P.rows.map(([k, v]) => [k, `${k.split("|")[0]} の ${k.split("|")[1]}（最大 ${fmtN(v[2])}・${v[0]}回）`]), SIM.key)}</select></label></div>
      <div class="opts"><span class="muted">${esc(atk.who)} ${mobTag(atk.who)}　${kindTag(atk.kind)} ${eleTag(atk.ele)}</span>
        <label>属性 <select data-sd="eleOv">${selOpt([["", `自動（${SIM.autoEle}）`]].concat(SIM_ELES.map((x) => [x, x])), SIM.eleOv)}</select></label></div>`;
  }
  h += `<div class="opts"><b>受けたときの装備</b><label><select data-sd="base">${P.baseOpts.length
      ? selOpt(P.baseOpts.map(([id, mx]) => [id, `${(S[gearMain(id)] || {}).tag || "履歴"}${shadowTagOf(id) ? "・" + shadowTagOf(id) : ""}: ${equipSetName(id)}（このときの最大 ${fmtN(mx)}）`]), SIM.base)
      : selOpt(Object.entries(S).filter(([, st]) => !st.sim).map(([id, st]) => [id + (P.baseSh && P.baseMain === id ? "+" + P.baseSh : ""), `${setLabel(st)}: ${st.name || st.auto}`]), SIM.base)}</select></label>
      ${S[P.baseMain] && !S[P.baseMain].sim ? `<button class="ghost" id="sdmake" title="この攻撃を受けたときのキャラ（職業・Lv・ステータス）と装備で、新しいスロットを作ります">このときのキャラ・装備でスロットを作る</button>` : ""}</div>
    ${buffRow("B", SIM.buffB, "そのときの補助")}${buffRow("T", SIM.buffT, "計算機のキャラの補助")}`;
  const all = [D.base].concat(cols);
  const names = [...new Set(all.flatMap((x) => x.T.list.map((y) => y[0].replace(/（.*）$/, ""))))];
  const cell = (T, name) => { const x = T.list.find((y) => y[0].replace(/（.*）$/, "") === name); return x ? `×${(Math.round(x[1] * 1000) / 1000).toFixed(3)}${x[2] ? ` <span class="muted">${esc(x[2])}</span>` : ""}${/（/.test(x[0]) ? ` <span class="muted">${esc(x[0].match(/（(.*)）$/)[1])}</span>` : ""}` : `<span class="muted">-</span>`; };
  h += `<table class="multi cmp" style="margin-top:8px"><tr><th></th>${all.map((x) => `<th>${x.base ? "受けたとき" : x.st ? `<span class="settab on" style="--c:${tagColor(x.st)};cursor:default">${esc(x.label)}</span>` : esc(x.label)}${x.base && x.st ? " " + tagChip(x.st) : ""}</th>`).join("")}</tr>
    ${names.map((n) => `<tr><td>${esc(n)}</td>${all.map((x) => `<td>${cell(x.T, n)}</td>`).join("")}</tr>`).join("")}
    <tr><td>引かれる分（ステータスの DEF/MDEF）</td>${all.map((x) => `<td>${x.T.sub ? "−" + fmtN(x.T.sub) : "-"}</td>`).join("")}</tr>
    <tr class="cmpk"><td><b>ダメージ</b></td>${all.map((x) => `<td class="v"><b>${fmtN(x.dmg)}</b>${x.base || !P.baseDmg ? "" : ` <span class="${x.dmg <= P.baseDmg ? "good" : "warn"}">${x.dmg <= P.baseDmg ? "−" : "+"}${Math.abs(Math.round((x.dmg - P.baseDmg) * 100 / P.baseDmg))}%</span>`}</td>`).join("")}</tr>
    <tr><td>最大HP</td>${all.map((x) => `<td class="v">${x.hp ? fmtN(x.hp) : "-"}</td>`).join("")}</tr>
    <tr><td><b>判定</b></td>${all.map((x) => `<td>${!x.hp ? "-" : x.dmg < x.hp ? `<span class="sim-ok">耐える</span> <span class="muted">残り ${fmtN(x.hp - x.dmg)}</span>` : `<span class="sim-ng">倒れる</span> <span class="muted">${fmtN(x.dmg - x.hp)} 足りない</span>`}</td>`).join("")}</tr></table>
    <div class="muted" style="font-size:12px;margin-top:4px">${D.rel ? `「受けたとき」の列は、このスロットのキャラに、そのときのステータスと装備セットを入れて計算したものです。記録のダメージ（${fmtN(P.baseDmg)}）に「いまの軽減 ÷ 受けたときの軽減」をかけて出しているので、装備・ステータス・支援を変えた分だけが数字に効きます（軽減前は約 ${fmtN(Math.round(raw))}）。` : `<span class="warn">このスロットの職業が、攻撃を受けたキャラと違うので、「受けたとき」の列は記録の表からの逆算です（軽減前は約 ${fmtN(Math.round(raw))}）。数字のずれが大きくなります。「このときのキャラ・装備でスロットを作る」で作ったスロットだと、より正確です。</span>`}見出しの右の「比べる」で装備セットを選ぶと、横に並びます。魔法ダメージそのものへの耐性と、エナジーコートなどは自動では入らないので、上の「補助」で選んでください。目安です。</div>`;
  return h;
}
