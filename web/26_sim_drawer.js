// 右端の引き出し「ミニサンドバックマン」(最初に作ったときの形の小窓)。キャラシミュレーターを開いているあいだ、スクロールしても右側についてくる。
//  ・スキル(Lv・追加設定)と敵の設定 = サンドバックマンの枠・「ダメージの目安」と同じ設定(m.foxSb)
//  ・時限バフ = いまの装備に付いているものだけ。オン/オフのみ(個数・発動率は与ダメシミュと共通の設定のまま)
//  ・比較 = 「測定」で数字を保存 → 装備を替える → また「測定」。表示している装備の数字は、いつも自動で計算して出す
// 画面の本体(#view)とは別の要素(document.body 直下)なので、描き直しでスクロールが動かない。描き直しのあとに render() から sbdSync() が呼ばれる。
const SBD = { open: store.get("md_sbd") === "1", sig: "", live: null, timer: 0, enemy: false };
const sbdRowsAll = () => { try { return JSON.parse(store.get("md_sbdrows") || "{}") || {}; } catch (e) { return {}; } };
const sbdRows = () => sbdRowsAll()[SIMC.cur] || [];
function sbdSaveRows(rows) { const a = sbdRowsAll(); a[SIMC.cur] = rows.slice(-8); store.set("md_sbdrows", JSON.stringify(a)); }
function sbdCss() {
  if (document.getElementById("sbdcss")) return;
  const st = document.createElement("style"); st.id = "sbdcss";
  st.textContent = `.sbd{position:fixed;right:0;top:88px;z-index:900;display:flex;align-items:flex-start;max-height:calc(100vh - 104px)}
.sbd-tab{writing-mode:vertical-rl;letter-spacing:.15em;padding:10px 5px;border:1px solid var(--line);border-right:0;border-radius:8px 0 0 8px;background:var(--panel);color:var(--ink);cursor:pointer;font-size:13px;box-shadow:-2px 2px 10px rgba(0,0,0,.18)}
.sbd-body{display:none;width:240px;max-height:calc(100vh - 104px);overflow:auto;overscroll-behavior:contain;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-right:0;border-radius:0 0 0 8px;padding:8px 10px;font-size:12px;box-shadow:-2px 2px 14px rgba(0,0,0,.25)}
.sbd.open .sbd-body{display:block}
.sbd h4{margin:8px 0 4px;font-size:12px}.sbd h4:first-child{margin-top:0}
.sbd select,.sbd input{font:inherit;font-size:12px;max-width:100%;box-sizing:border-box}
.sbd .sbd-row{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;margin:3px 0}
.sbd .sbd-row label{display:flex;align-items:center;gap:3px}
.sbd .sbd-fx{display:inline-block;padding:2px 7px;border:1px solid var(--line);border-radius:10px;cursor:pointer;user-select:none}
.sbd .sbd-fx.on{background:var(--accent,#3b5bdb);color:#fff;border-color:transparent}
.sbd table{border-collapse:collapse;width:100%}.sbd td,.sbd th{padding:2px 4px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}.sbd td:first-child,.sbd th:first-child{text-align:left;white-space:normal}
.sbd .sbd-en{cursor:pointer;opacity:.75}.sbd .sbd-live td{font-weight:700}.sbd .sbd-x{cursor:pointer;opacity:.6}`;
  document.head.appendChild(st);
}
// 計算の条件(スキル・Lv・敵・時限効果)。条件がちがう測定どうしは、差を出さない
function sbdCond(T) { const c = T.cfg; return JSON.stringify([T.item.name, T.mt.lv, T.mt.opts, c.kind, c.race, c.ele, c.lv, c.size, atkFxSig()]); }
// 装備セットに登録する前の「試している途中」の装備なので、測定の名前は「前の測定からの変更点」にする(最初の1つは登録ずみの記号か「いまの装備」)
function sbdGearMap(m) {
  const o = {};
  for (const [r, l] of SIMC_REGIONS) { const id = simcItemAt(m, r); if (simcIsNone(r, id)) continue; const rf = SIMC_REFINE[r]; o[l] = { id, k: [id, rf ? (m[rf[0]] || {})[rf[1]] || 0 : 0].concat((SIMC_CARD[r] || []).map((c) => m.card[c] || 0)).join(":") }; }
  for (const [r, l] of SIMC_SHADOW) { const id = simcItemAt(m, r); if (simcIsNone(r, id)) continue; o[l] = { id, k: [id, ((m.shadowEquip || {}).refined || [])[r] || 0].concat((SIMC_SHCARD[r] || []).map((c) => m.card[c] || 0)).join(":") }; }
  return o;
}
function sbdGearLabel(m, prev) {
  const EQ = DATA.equip || {}, tag = [((EQ.sets || {})[m.foxSet] || {}).tag, ((EQ.shadows || {})[m.foxShadow] || {}).tag].filter(Boolean).join("・");
  const cur = sbdGearMap(m);
  if (!prev) return tag && !simcDirty(m, false) && !simcDirty(m, true) ? tag : "いまの装備";
  const ch = [];
  for (const l of new Set(Object.keys(cur).concat(Object.keys(prev)))) {
    const a = prev[l], b = cur[l]; if ((a && a.k) === (b && b.k)) continue;
    ch.push(a && b && a.id === b.id ? `${l}(強化・カード)` : `${l} ${b ? simcItemName(b.id) : "外す"}`);
  }
  return ch.length ? (ch.length > 2 ? `${ch.slice(0, 2).join("、")} ほか${ch.length - 2}` : ch.join("、")) : "変更なし";
}
function sbdFxToggle(m, kind) {      // 時限バフは1つのスイッチ。オン = いまの装備に付いている時限効果を全部オン / オフ = それを全部オフ
  const owned = atkOwnedNames(m), list = atkFxAll().filter((e) => (e.kind === "b" || e.kind === kind || kind === "b") && !e.custom && atkFxCount(owned, e) > 0);
  if (!list.length) return "";
  const on = list.filter((e) => atkCount(e.id) > 0).length;
  return `<span class="sbd-fx${on ? " on" : ""}" data-sbd="fxall" title="${esc(list.map((e) => e.name).join("\n"))}">時限バフ ${on ? "オン" : "オフ"}<span style="opacity:.75"> (${list.length})</span></span>`;
}
function sbdHtml(m) {
  let T; try { T = stpSbMt(m); } catch (e) { T = null; }
  if (!T) return `<div class="muted">いまの職業では使えません</div>`;
  const cfg = T.cfg, sel = (k, arr, cur) => `<select data-sbd="${k}">${arr.map((t, i) => `<option value="${i}" ${i === cur ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  let kind = "b"; try { kind = stpSbKind(simcClone(m), cfg, T.mt); } catch (e) { /* 判定できなければ両方 */ }
  const rows = sbdRows(), last = rows[rows.length - 1], cond = sbdCond(T), lv = SBD.live;
  const dTxt = (d) => d === null ? "" : `<span class="${Math.abs(d) < 0.005 ? "muted" : d > 0 ? "good" : "warn"}">${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}%</span>`;
  let prev = null;
  const body = rows.map((r, i) => {
    const d = prev && prev.cond === r.cond && prev.avg ? (r.avg - prev.avg) / prev.avg * 100 : null; prev = r;
    return `<tr title="${esc(r.time)}　DPS ${stpKM(r.dps)}${r.fx ? "（時限効果込み）" : ""}"><td>${esc(r.label)}</td><td>${stpKM(r.avg)}</td><td>${i && d === null ? `<span class="muted">条件違い</span>` : dTxt(d)}</td><td><span class="sbd-x" data-sbd="del:${i}" title="消す">✕</span></td></tr>`;
  }).join("");
  const ld = last && lv && last.cond === cond && last.avg ? (lv.avg - last.avg) / last.avg * 100 : null;
  const enemy = `${SB_KINDS[cfg.kind]}・${SB_RACES[cfg.race]}・${SB_ELES[cfg.ele]}${cfg.lv}・${SB_SIZES[cfg.size]}`;
  return `<div class="sbd-row"><select data-sbd="full" style="max-width:150px">${T.methods.filter((x) => x.skill !== 0 || T.methods.length === 1).map((x) => `<option value="${esc(x.full)}" ${x.full === cfg.full ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
      ${T.chain.map((c, i) => c.ol.type === 0 ? `<select data-sbd="o:${i}" title="${esc(i === 0 ? "Lv" : c.ol.label || "設定")}">${c.ol.opts.map((o) => `<option value="${esc(o[0])}" ${o[0] === c.v ? "selected" : ""}>${esc(i === 0 ? "Lv" + o[1] : o[1])}</option>`).join("")}</select>` : `<input type="number" data-sbd="o:${i}" value="${esc(c.v)}" title="${esc(c.ol.label || "設定")}" style="width:4.5em">`).join("")}</div>
    <div class="sbd-row"><span class="sbd-en" data-sbd="enemy" title="敵の設定を開く・閉じる">敵: ${esc(enemy)} ${SBD.enemy ? "▴" : "▾"}</span></div>
    ${SBD.enemy ? `<div class="sbd-row">${sel("kind", SB_KINDS, cfg.kind)}${sel("race", SB_RACES, cfg.race)}${sel("ele", SB_ELES, cfg.ele)}<select data-sbd="lv">${[1, 2, 3, 4].map((i) => `<option value="${i}" ${i === cfg.lv ? "selected" : ""}>Lv${i}</option>`).join("")}</select>${sel("size", SB_SIZES, cfg.size)}</div>` : ""}
    <div class="sbd-row">${sbdFxToggle(m, kind)}</div>
    <table>${body}<tr class="sbd-live"><td title="${esc(T.item.name)} Lv${T.mt.lv}">表示中${last ? `<div class="muted" style="font-size:11px">${esc(sbdGearLabel(m, last.gear))}</div>` : ""}</td><td>${lv ? stpKM(lv.avg) : `<span class="muted">…</span>`}</td><td>${ld === null ? "" : dTxt(ld)}</td><td></td></tr></table>
    <div class="sbd-row" style="margin-top:6px"><button data-sbd="measure" ${lv ? "" : "disabled"} title="表示中の装備の数字を保存します。装備を替えてもう一度押すと、前との差が出ます">測定</button>${rows.length ? `<button class="ghost" data-sbd="clear">消す</button>` : ""}</div>`;
}
function sbdEl() {
  let el = document.getElementById("sbdrawer");
  if (el) return el;
  sbdCss();
  el = document.createElement("div"); el.id = "sbdrawer"; el.className = "sbd";
  el.innerHTML = `<button class="sbd-tab" data-sbd="toggle" title="ミニサンドバックマンを開く・閉じる">ミニサンドバックマン</button><div class="sbd-body"></div>`;
  document.body.appendChild(el);
  el.onclick = (e) => {
    const b = e.target.closest("[data-sbd]"); if (!b || b.tagName === "SELECT" || b.tagName === "INPUT") return;
    const k = b.dataset.sbd, ch = simcCur(); if (!ch) return;
    if (k === "toggle") { SBD.open = !SBD.open; store.set("md_sbd", SBD.open ? "1" : "0"); el.classList.toggle("open", SBD.open); if (SBD.open) sbdSync(true); return; }
    if (k === "measure" && SBD.live) {
      const T = stpSbMt(ch.model), rows = sbdRows(), d = new Date(), p = (n) => String(n).padStart(2, "0");
      const prevRow = rows[rows.length - 1]; rows.push({ gear: sbdGearMap(ch.model), label: sbdGearLabel(ch.model, prevRow && prevRow.gear), time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, avg: SBD.live.avg, dps: SBD.live.dps, fx: atkActiveIds(null).length > 0, skill: T.item.name, cond: sbdCond(T) });
      sbdSaveRows(rows); sbdSync(true); return;
    }
    if (k === "enemy") { SBD.enemy = !SBD.enemy; sbdSync(true); return; }
    if (k === "clear") { sbdSaveRows([]); sbdSync(true); return; }
    if (k.startsWith("del:")) { const rows = sbdRows(); rows.splice(+k.slice(4), 1); sbdSaveRows(rows); sbdSync(true); return; }
    if (k === "fxall") {
      const m = ch.model, T = stpSbMt(m); let kind = "b"; try { kind = stpSbKind(simcClone(m), T.cfg, T.mt); } catch (e2) { /* 両方 */ }
      const owned = atkOwnedNames(m), list = atkFxAll().filter((e) => (e.kind === "b" || e.kind === kind || kind === "b") && !e.custom && atkFxCount(owned, e) > 0), anyOn = list.some((e) => atkCount(e.id) > 0);
      list.forEach((e) => { if (anyOn) delete atkFxSet().on[e.id]; else if (!atkCount(e.id)) atkFxBump(e.id, 1); });
      saveSettings(); atkFxRefresh(); return;
    }
    if (k.startsWith("fx:")) { const id = k.slice(3); if (atkCount(id)) { delete atkFxSet().on[id]; saveSettings(); } else atkFxBump(id, 1); atkFxRefresh(); return; }
  };
  el.onchange = (e) => {
    const t = e.target.closest("[data-sbd]"); if (!t || (t.tagName !== "SELECT" && t.tagName !== "INPUT")) return;
    const ch = simcCur(); if (!ch) return; const m = ch.model, k = t.dataset.sbd, cfg = simcSbCfg(m);
    if (k === "full") { cfg.full = t.value; cfg.vals = []; }
    else if (k.startsWith("o:")) { const n = +k.slice(2), T = stpSbMt(m); cfg.vals = (T ? T.chain.map((c) => c.v) : []).slice(0, n); cfg.vals[n] = Number.isNaN(+t.value) ? t.value : +t.value; }
    else cfg[k] = +t.value;
    const S = SIMC.stp; if (S) { S.sugSig = ""; S.effSig = ""; S.swSig = ""; }
    simcSave(); SBD.sig = ""; render();
  };
  return el;
}
// 表示している装備の数字を、少しあとに計算して出す(画面の描き直しを待たせない)
function sbdSync(force) {
  const ch = typeof simcCur === "function" ? simcCur() : null;
  const show = TAB === "sim" && typeof SIMV !== "undefined" && SIMV === "chara" && ch && SIMC.chars && ENG.ready && ENG.sb;
  const old = document.getElementById("sbdrawer");
  if (!show) { if (old) old.remove(); clearTimeout(SBD.timer); return; }
  const el = sbdEl(); el.classList.toggle("open", SBD.open);
  if (!SBD.open) return;
  if (!force && el.contains(document.activeElement) && /^(SELECT|INPUT)$/.test(document.activeElement.tagName)) return;      // 選んでいる途中は作り直さない
  const m = ch.model, body = el.querySelector(".sbd-body"), top = body.scrollTop;
  const sig = JSON.stringify([SIMC.cur, simcFragSig(m, false), simcFragSig(m, true), m.foxSb, m.status && m.status.jobId, atkFxSig(), sbdRows().length]);
  if (!force && sig === SBD.sig && SBD.live) { return; }
  const same = sig === SBD.sig; SBD.sig = sig; if (!same) SBD.live = null;
  body.innerHTML = sbdHtml(m); body.scrollTop = top;
  if (SBD.live) return;
  clearTimeout(SBD.timer);
  SBD.timer = setTimeout(() => {
    try {
      const c2 = simcCur(); if (!c2 || c2.model !== m || !document.getElementById("sbdrawer")) return;
      const r = simcSbAvg(m, {}, atkActiveIds(null).length > 0);
      SBD.live = r ? { avg: r.avg, dps: r.dps } : { avg: 0, dps: 0 };
      const b2 = document.querySelector("#sbdrawer .sbd-body"); if (b2 && !(b2.contains(document.activeElement) && /^(SELECT|INPUT)$/.test(document.activeElement.tagName))) { const t2 = b2.scrollTop; b2.innerHTML = sbdHtml(m); b2.scrollTop = t2; }
    } catch (e) { console.warn("sbdrawer", e); }
  }, 40);
}
