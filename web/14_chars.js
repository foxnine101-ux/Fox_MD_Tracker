"use strict";
// ---------- キャラ ----------
// このワールドのキャラの一覧。クリックで開いて、ベース/ジョブ・ステータス・スキルを見る(装備は「装備セット」タブ)
let CH_OPEN = "", CH_FOCUS = "";
function skillsHtml(sk) {
  const L = Object.entries(sk || {}).sort((a, b) => +a[0] - +b[0]);
  if (!L.length) return `<h3 style="margin:10px 0 2px;font-size:13px">スキル</h3><div class="muted">まだ読めていません（マップを移動するか、ログインし直すと読めます）。</div>`;
  const N = DATA.skill_names || {};
  return `<h3 style="margin:10px 0 2px;font-size:13px">スキル（${L.length}）</h3><div class="sk-list">${L.map(([id, lv]) => `<span class="sk" title="スキル番号 ${esc(id)}">${esc(N[id] || "スキル" + id)}<b>${lv}</b></span>`).join("")}</div>`;
}
function charSetsHtml(c) {
  const EQ = DATA.equip || {};
  const pick = (T) => Object.entries(T || {}).filter(([, st]) => st.tag && (st.chars || {})[c])
    .sort((a, b) => ((b[1].chars[c].n || 0) - (a[1].chars[c].n || 0)) || ((b[1].chars[c].last || 0) - (a[1].chars[c].last || 0))).slice(0, 8);
  const L = pick(EQ.sets).concat(pick(EQ.shadows));
  if (!L.length) return "";
  return `<h3 style="margin:10px 0 2px;font-size:13px">よく使う装備セット</h3><div class="sk-list">${L.map(([sid, st]) =>
    `<a class="tag stag" data-gs="${esc(sid)}" style="background:${tagColor(st)}" title="${esc((st.name || st.auto || "") + "（" + (st.chars[c].n || 0) + "回着た・最後 " + when(st.chars[c].last) + "）クリックで装備セットへ")}">${esc(st.tag)}</a>`).join("")}</div>`;
}
function renderChars(chars) {
  const E = (DATA.equip || {}).chars || {};
  if (!chars.length) {
    $("#view").innerHTML = `<div class="panel empty">まだキャラの記録がありません。<br>Fox_MD_Tracker を起動したままキャラ選択画面まで進むと、ここに出ます。</div>`;
    return;
  }
  if (CH_OPEN && !chars.includes(CH_OPEN)) CH_OPEN = "";
  let h = "";
  for (const c of chars) {
    const info = DATA.chars[c] || {}, e = E[c], st = (e && e.status) || {}, d = st.derived || {};
    const lv = st.lv ?? info.lv, jlv = st.jobLv ?? info.jobLv, job = (st.jobName && !/^職業/.test(st.jobName) ? st.jobName : info.jobName) || st.jobName || "";
    const open = c === CH_OPEN;
    h += `<div class="panel ch-row"><div class="ch-h" data-ch="${esc(c)}"><span class="ch-name">${esc(cn(c))}</span>${carryChip(c, true)}
        <span class="ch-lv">Base <b>${lv ?? "-"}</b> / Job <b>${jlv ?? "-"}</b></span><span>${jobChip(job)} ${esc(job)}</span>
        ${d.MaxHP !== undefined ? `<span class="muted">HP ${fmtN(d.MaxHP)}　SP ${fmtN(d.MaxSP)}</span>` : ""}
        <span style="flex:1"></span><span class="muted">${e && Object.keys(e.skills || {}).length ? `スキル ${Object.keys(e.skills).length}` : ""}　最終確認 ${info.seen ? when(info.seen) : "-"}　${open ? "▾" : "▸"}</span></div>
      ${open ? `<div class="ch-body">${e ? statusHtmlEq({ ...st, lv, jobLv: jlv, jobName: job }) + carryHtml(c) + skillsHtml(e.skills) + charSetsHtml(c) : `<div class="muted" style="padding-top:8px">まだステータスを読めていません。このキャラでログインすると出ます。</div>`}</div>` : ""}</div>`;
  }
  h += `<p class="hint">キャラをクリックすると、ベース/ジョブLv・ステータス・覚えているスキルが開きます（通信から読んだもの。装備は「装備セット」タブ）。ベース/ジョブLv はキャラ選択画面から、ステータスとスキルはログインしたときに読みます。</p>`;
  $("#view").innerHTML = h;
  $("#view").querySelectorAll(".ch-h").forEach((el) => el.onclick = () => { CH_OPEN = CH_OPEN === el.dataset.ch ? "" : el.dataset.ch; render(); });
  $("#view").querySelectorAll("button.cig").forEach((b) => b.onclick = (e) => {        // 外し忘れ: スペアを「数えない」・また「数える」
    e.stopPropagation(); const c = b.dataset.cig, k = b.dataset.cigk; SETTINGS.carryIgnore = SETTINGS.carryIgnore || {};
    const set = new Set(SETTINGS.carryIgnore[c] || []); set.has(k) ? set.delete(k) : set.add(k);
    if (set.size) SETTINGS.carryIgnore[c] = [...set]; else delete SETTINGS.carryIgnore[c];
    saveSettings(); render();
  });
  $("#view").querySelectorAll("a[data-gs]").forEach((a) => a.onclick = (e) => { e.preventDefault(); GS_OPEN[a.dataset.gs] = true; GS_FOCUS = a.dataset.gs; TAB = "gsets"; store.set("md_tab", TAB); render(); });
  if (CH_FOCUS) {            // MD の表から来たキャラを見せる
    const el = [...$("#view").querySelectorAll(".ch-h")].find((x) => x.dataset.ch === CH_FOCUS);
    CH_FOCUS = "";
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
