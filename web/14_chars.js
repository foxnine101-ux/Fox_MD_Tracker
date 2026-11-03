"use strict";
// ---------- キャラ ----------
// このワールドのキャラの一覧。クリックで開いて、ベース/ジョブ・ステータス・スキルを見る(装備は「装備セット」タブ)
let CH_OPEN = "", CH_FOCUS = "";
// 公式スキルツリー(rotool.gungho.jp/character_skill_tree/<系統>?<スキルID名>=Lv&…)のURL。対応表は同梱の skill_tree.json(/api/sktree)
let SKTREE = null;
async function skTreeUrl(job, sk) {
  if (!SKTREE) SKTREE = await fetch("/api/sktree").then((r) => r.json()).catch(() => ({}));
  const N = DATA.skill_names || {}, names = Object.entries(sk || {}).map(([id, lv]) => [N[id], +lv]).filter(([n, lv]) => n && lv > 0);
  let best = null;
  for (const [fam, t] of Object.entries(SKTREE)) {          // 職業名が入っている系統のうち、覚えているスキルが一番多く当たるもの(一次職は複数の系統に入っている)
    const hit = names.filter(([n]) => t.skills[n]).length, inJob = (t.jobs || []).includes(job);
    const score = (inJob ? 1000 : 0) + hit;
    if (!best || score > best.score) best = { fam, t, score, hit };
  }
  if (!best || !best.hit) return null;
  const q = names.filter(([n]) => best.t.skills[n]).map(([n, lv]) => best.t.skills[n] + "=" + lv);
  const miss = names.filter(([n]) => !best.t.skills[n]).map(([n]) => n);
  return { url: `https://rotool.gungho.jp/character_skill_tree/${best.fam}?${q.join("&")}&reincarnation=false`, n: q.length, miss };
}
function skillsHtml(sk, c, job) {
  const L = Object.entries(sk || {}).sort((a, b) => +a[0] - +b[0]);
  if (!L.length) return `<h3 style="margin:10px 0 2px;font-size:13px">スキル</h3><div class="muted">まだ読めていません（マップを移動するか、ログインし直すと読めます）。</div>`;
  const N = DATA.skill_names || {};
  return `<h3 style="margin:10px 0 2px;font-size:13px">スキル（${L.length}） <button class="ghost" data-sktree="${esc(c)}" data-job="${esc(job || "")}" style="font-size:12px">公式スキルツリーのURLをコピー</button> <span class="muted sktmsg" data-c="${esc(c)}" style="font-weight:400"></span></h3><div class="sk-list">${L.map(([id, lv]) => `<span class="sk" title="スキル番号 ${esc(id)}">${esc(N[id] || "スキル" + id)}<b>${lv}</b></span>`).join("")}</div>`;
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
      ${open ? `<div class="ch-body">${e ? statusHtmlEq({ ...st, lv, jobLv: jlv, jobName: job }) + carryHtml(c) + skillsHtml(e.skills, c, job) + charSetsHtml(c) : `<div class="muted" style="padding-top:8px">まだステータスを読めていません。このキャラでログインすると出ます。</div>`}</div>` : ""}</div>`;
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
  $("#view").querySelectorAll("button[data-sktree]").forEach((b) => b.onclick = async (e) => {
    e.stopPropagation(); const c = b.dataset.sktree, msg = $("#view").querySelector(`.sktmsg[data-c="${CSS.escape(c)}"]`);
    const r = await skTreeUrl(b.dataset.job, ((E[c] || {}).skills) || {});
    if (!r) { msg.textContent = "公式のスキルツリーに合うスキルが見つかりませんでした。"; return; }
    let ok = false; try { await navigator.clipboard.writeText(r.url); ok = true; } catch (_) {}
    msg.innerHTML = (ok ? "コピーしました。" : "コピーできませんでした。") + ` ${r.n}個のスキルを入れました。` + (r.miss.length ? `公式のツリーに無くて入れなかったもの: ${esc(r.miss.join("、"))}。` : "") + ` <a href="${esc(r.url)}" target="_blank" rel="noopener">開く</a>`;
  });
  $("#view").querySelectorAll("a[data-gs]").forEach((a) => a.onclick = (e) => { e.preventDefault(); GS_OPEN[a.dataset.gs] = true; GS_FOCUS = a.dataset.gs; TAB = "gsets"; store.set("md_tab", TAB); render(); });
  if (CH_FOCUS) {            // MD の表から来たキャラを見せる
    const el = [...$("#view").querySelectorAll(".ch-h")].find((x) => x.dataset.ch === CH_FOCUS);
    CH_FOCUS = "";
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
