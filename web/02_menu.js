"use strict";
// ---------- 右クリックのメニュー ----------
// items: [{label, act}] / "-"(区切り) / {cap: "見出し"}
function showCtx(x, y, items) {
  let m = $("#ctx");
  if (!m) { document.body.insertAdjacentHTML("beforeend", `<div id="ctx" class="ctx" hidden></div>`); m = $("#ctx"); }
  m.innerHTML = items.map((it, i) => it === "-" ? `<div class="sep"></div>` : it.cap ? `<div class="cap">${esc(it.cap)}</div>` : `<button data-i="${i}">${esc(it.label)}</button>`).join("");
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + "px";
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + "px";
  m.onclick = (e) => { const b = e.target.closest("button[data-i]"); if (!b) return; hideCtx(); items[+b.dataset.i].act(); };
}
// 確認の窓。「次から確認しない」にチェックして進むと、その種類(key)の確認は次から出ない(SETTINGS.noAsk)
function askOnce(key, text, okLabel = "OK") {
  if ((SETTINGS.noAsk || {})[key]) return Promise.resolve(true);
  return new Promise((done) => {
    const bg = document.createElement("div"); bg.className = "askbg";
    bg.innerHTML = `<div class="askbox"><div class="asktext">${esc(text).replace(/\n/g, "<br>")}</div>
      <label class="asknever"><input type="checkbox"> 次から確認しない</label>
      <div class="askbtns"><button class="ghost" data-a="0">やめる</button><button data-a="1">${esc(okLabel)}</button></div></div>`;
    document.body.appendChild(bg);
    const close = (ok) => {
      if (ok && bg.querySelector("input").checked) { SETTINGS.noAsk = SETTINGS.noAsk || {}; SETTINGS.noAsk[key] = true; saveSettings(); }
      bg.remove(); document.removeEventListener("keydown", onKey, true); done(ok);
    };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    document.addEventListener("keydown", onKey, true);
    bg.onclick = (e) => { if (e.target === bg) close(false); const b = e.target.closest("[data-a]"); if (b) close(b.dataset.a === "1"); };
    bg.querySelector('[data-a="1"]').focus();
  });
}
const postSet = (body) => fetch("/api/equipset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}));
const setLabel = (st) => (st && st.tag) || "履歴";
function hideCtx() { const m = $("#ctx"); if (m) m.hidden = true; }
document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#ctx")) hideCtx(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCtx(); });
window.addEventListener("scroll", hideCtx, true);
function setMd(name, patch) {
  const md = SETTINGS.md = SETTINGS.md || {};
  const v = { ...(md[name] || {}), ...patch };
  for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
  md[name] = v; saveSettings(); render();
}
const KIND_L = { weekly: "週次", daily: "デイリー", other: "クエスト" };
function setMdMany(names, patch) {
  const md = SETTINGS.md = SETTINGS.md || {};
  for (const n of names) {
    const v = { ...(md[n] || {}), ...patch };
    for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
    md[n] = v;
  }
  SEL.mds.clear(); saveSettings(); render();
}
function mdMenu(G, canGo, cols) {
  if (SEL.mds.size > 1 && SEL.mds.has(G.name)) {
    const names = [...SEL.mds];
    const labels = names.map((n) => ((cols || []).find((x) => x.name === n) || { label: n }).label);
    const items = [{ cap: `選んだ${names.length}個のMD（${labels.join("、")}）` }];
    for (const k of ["weekly", "daily", "other"]) if (k !== G.kind) items.push({ label: `まとめて${KIND_L[k]}に移す`, act: () => setMdMany(names, { kind: k }) });
    items.push({ label: `選んだ${names.length}個のMDを隠す`, act: () => setMdMany(names, { kind: "hide" }) });
    items.push("-", { label: "選択を解除", act: () => { SEL.mds.clear(); render(); } });
    return items;
  }
  const items = [{ cap: G.label }];
  if (canGo) items.push({ label: "耐性を見る", act: () => goResist(G.name) });
  items.push({ label: "表示名を変える…", act: () => { const v = prompt(`「${G.name}」の表示名（空にすると元の名前）`, G.label === G.name ? "" : G.label); if (v !== null) setMd(G.name, { label: v.trim() || undefined }); } });
  items.push("-");
  for (const k of ["weekly", "daily", "other"]) if (k !== G.kind) items.push({ label: `${KIND_L[k]}に移す`, act: () => setMd(G.name, { kind: k }) });
  items.push({ label: "このMDを隠す", act: () => setMd(G.name, { kind: "hide" }) });
  if (SEL.mds.size) items.push("-", { label: "選択を解除", act: () => { SEL.mds.clear(); render(); } });
  return items;
}
function hiddenMenu(hidden) {
  return [{ cap: "隠したMD（クリックで表示に戻す）" }, ...hidden.map((G) => ({ label: G.label, act: () => setMd(G.name, { kind: undefined }) })),
    ...(hidden.length > 1 ? ["-", { label: "全部表示に戻す", act: () => { for (const G of hidden) delete (SETTINGS.md[G.name] || {}).kind; saveSettings(); render(); } }] : [])];
}

// 職業の略称と色(衣装のイメージ)。略称は EM・AM・DK など、よく使われる書き方。表に無い職業は、名前の頭2文字と灰色
const JOB_ABBR = {
  // 4次職
  "ドラゴンナイト": ["DK", "#c92a2a"], "インペリアルガード": ["IG", "#c99a06"], "アークメイジ": ["AM", "#7048e8"], "エレメンタルマスター": ["EM", "#0c8599"],
  "ウィンドホーク": ["WH", "#1c7ed6"], "トルバドゥール": ["TB", "#e8590c"], "トルヴェール": ["TV", "#f06595"], "カーディナル": ["CD", "#d6336c"],
  "インクイジター": ["IQ", "#364fc7"], "シャドウクロス": ["SX", "#862e9c"], "アビスチェイサー": ["ABC", "#087f5b"], "マイスター": ["MT", "#d9480f"], "バイオロ": ["BO", "#5c940d"],
  // 3次職
  "ルーンナイト": ["RK", "#c92a2a"], "ロイヤルガード": ["RG", "#c99a06"], "ウォーロック": ["WL", "#7048e8"], "ソーサラー": ["SO", "#0c8599"],
  "レンジャー": ["RA", "#1c7ed6"], "ミンストレル": ["MI", "#e8590c"], "ワンダラー": ["WA", "#f06595"], "アークビショップ": ["AB", "#d6336c"],
  "修羅": ["修羅", "#364fc7"], "ギロチンクロス": ["GX", "#862e9c"], "シャドウチェイサー": ["SC", "#087f5b"], "メカニック": ["MC", "#d9480f"], "ジェネティック": ["GN", "#5c940d"],
  // 特殊職
  "天帝": ["天帝", "#f08c00"], "星帝": ["星帝", "#f08c00"], "ソウルアセティック": ["SA", "#5f3dc4"], "ソウルリーパー": ["SR", "#5f3dc4"],
  "蜃気楼": ["蜃", "#1864ab"], "影狼": ["影狼", "#1864ab"], "不知火": ["不", "#e64980"], "朧": ["朧", "#e64980"],
  "ナイトウォッチ": ["NW", "#495057"], "リベリオン": ["RB", "#495057"], "ハイパーノービス": ["HN", "#a0662b"], "拡張スーパーノービス": ["SN", "#a0662b"], "スーパーノービス": ["SN", "#a0662b"],
  "スピリットハンドラー": ["SH", "#37b24d"], "サモナー": ["SM", "#37b24d"], "アリテア": ["AL", "#1098ad"], "カルノス": ["KN", "#1098ad"], "ドルイド": ["DR", "#1098ad"],
};
function jobChip(job) {
  if (!job || /^職業\d+$/.test(job)) return "";
  const [ab, col] = JOB_ABBR[job] || [job.slice(0, 2), "#868e96"];
  return `<span class="jobchip" style="background:${col}" title="${esc(job)}">${esc(ab)}</span>`;
}
function charJob(c) {            // そのキャラの職業名(わかるとき)
  const info = DATA.chars[c] || {}, st = ((((DATA.equip || {}).chars || {})[c]) || {}).status || {};
  return (st.jobName && !/^職業/.test(st.jobName) ? st.jobName : info.jobName) || st.jobName || "";
}
function charLvText(c) {        // 「230/65」(Base/Job)。わからない方は「-」
  const info = DATA.chars[c] || {}, st = ((((DATA.equip || {}).chars || {})[c]) || {}).status || {};
  const lv = st.lv ?? info.lv, jlv = st.jobLv ?? info.jobLv;
  return lv || jlv ? `${lv ?? "-"}/${jlv ?? "-"}` : "";
}
function zenyShort(v) {          // 3けた + 単位(K/M/B)。それより下は切り捨て(1234567 → 1.23M)
  if (v == null || v < 0) return "";
  if (v < 1000) return String(v);
  const U = ["K", "M", "B", "T"]; let i = -1, x = v;
  while (x >= 1000 && i < U.length - 1) { x /= 1000; i++; }
  const f = x >= 100 ? 1 : x >= 10 ? 10 : 100;
  return (Math.floor(x * f) / f).toString() + U[i];
}
const charZeny = (c) => { const z = ((((DATA.equip || {}).chars || {})[c]) || {}).status; return z && z.zeny != null ? z.zeny : null; };
function zenyHtml(c) { const z = charZeny(c); return z == null ? "" : `<span class="zeny" title="所持ゼニー ${z.toLocaleString()} z">${zenyShort(z)}</span>`; }
function zenySum(chars) {         // 表に出ているキャラの所持ゼニーの合計(左上)
  const zs = chars.map(charZeny).filter((z) => z != null); if (!zs.length) return "";
  const t = zs.reduce((a, b) => a + b, 0);
  const hs = Object.keys(DATA.chars || {}).filter((k) => inServer(k) && isHiddenChar(k, new Set(SETTINGS.hiddenChars || []))).map(charZeny).filter((z) => z != null);
  const ht = hs.reduce((a, b) => a + b, 0);       // 隠したキャラの分は、合計に入れず別に出す
  return ` <span class="zeny" title="表に出ているキャラの所持ゼニーの合計 ${t.toLocaleString()} z（${zs.length}キャラぶん）">計 ${zenyShort(t)}</span>`
    + (hs.length ? `<span class="zeny" style="opacity:.7" title="隠したキャラの所持ゼニーの合計 ${ht.toLocaleString()} z（${hs.length}キャラぶん）。上の合計には入っていません">隠 ${zenyShort(ht)}</span>` : "");
}
function renderGrid(groups, chars, now) {
  const hidden = buildGroups().filter((G) => G.kind === "hide").sort((a, b) => a.label.localeCompare(b.label, "ja"));
  const hcs = Object.keys(DATA.chars || {}).filter((k) => inServer(k) && isHiddenChar(k, new Set(SETTINGS.hiddenChars || [])));
  const hiddenBtn = (hidden.length ? ` <button class="ghost" id="mdhidden">隠したMD（${hidden.length}）</button>` : "")
    + (hcs.length ? ` <button class="ghost" id="charhidden">隠したキャラ（${hcs.length}）</button>` : "");
  groups.sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label, "ja"));
  if (!chars.length) {
    $("#view").innerHTML = `<div class="panel empty">まだキャラの記録がありません。<br>PCでツールを動かしたままROにログインすると、ここに出ます。${hiddenBtn}</div>`;
    if (hidden.length) $("#mdhidden").onclick = (e) => { const r = e.target.getBoundingClientRect(); showCtx(r.left, r.bottom + 4, hiddenMenu(hidden)); };
    if (hcs.length) $("#charhidden").onclick = (e) => { const r = e.target.getBoundingClientRect(); showCtx(r.left, r.bottom + 4, hiddenCharMenu(hcs)); };
    return;
  }
  if (!groups.length) {
    $("#view").innerHTML = `<div class="panel empty">この分類のMDはまだありません。<br>「設定」で分類を変えられます。${hiddenBtn}</div>`;
    if (hidden.length) $("#mdhidden").onclick = (e) => { const r = e.target.getBoundingClientRect(); showCtx(r.left, r.bottom + 4, hiddenMenu(hidden)); };
    if (hcs.length) $("#charhidden").onclick = (e) => { const r = e.target.getBoundingClientRect(); showCtx(r.left, r.bottom + 4, hiddenCharMenu(hcs)); };
    return;
  }
  let cols = groups;
  if (ONLY_OK) cols = groups.filter((G) => chars.some((c) => { const e = endOf(c, G); return e !== null && e <= now; }));
  let h = `<div class="opts"><label><input type="checkbox" id="onlyok" ${ONLY_OK ? "checked" : ""}> 行けるMDがある列だけ</label>${hiddenBtn}
    <span>● 行ける ／ 数字 = あと何時間でまた行けるか ／ ー = 記録なし</span></div>`;
  h += `<div class="panel tablewrap"><table><thead><tr><th class="char">キャラ${zenySum(chars)}</th>`;
  loadResistSheet();
  const canGo = new Map(cols.map((G) => [G.name, G.role === "md" || !!resistFind(RZ.entries, G.name)]));
  if (MX_FOCUS && !cols.some((G) => G.name === MX_FOCUS)) cols = groups;   // 戻ってきた列が隠れていたら全部出す
  // 見出し: アイコン(つかんで並び替え・クリックで選択) + MD名。アイコン以外の所は、クリック/なぞって選択
  cols.forEach((G, i) => h += `<th data-ci="${i}" data-g="${esc(G.name)}" class="${SEL.mds.has(G.name) ? "sel" : ""}" title="${esc(G.name)}（クリック・なぞって選択。右クリックでメニュー）"><span class="grip mx-ico" title="つかんで左右に動かすと並び替え。クリックで選択">${iconImg(G.name)}</span><span class="mx-name">${esc(G.label)}</span></th>`);
  h += `</tr></thead><tbody>`;
  for (const c of chars) {
    h += `<tr data-char="${esc(c)}"><td class="char ${SEL.chars.has(c) ? "sel" : ""}" title="${esc(cn(c))}（クリックでキャラ詳細。⋮⋮ をつかんで上下に動かすと並び替え。右クリックで隠す。Ctrl/Shift+クリックで複数選択）"><span class="grip">⋮⋮</span>${esc(cn(c))}${carryChip(c)}<span class="ch-sub">${esc(charLvText(c))}${zenyHtml(c)}${jobChip(charJob(c))}</span></td>`;
    cols.forEach((G, i) => {
      const e = endOf(c, G), ci = `data-ci="${i}"`;
      if (e === null) h += `<td class="cell none" ${ci}>ー</td>`;
      else if (e <= now) h += `<td class="cell okc" ${ci}>●</td>`;
      else {
        const r = e - now;
        h += `<td class="cell ${r < 3 * 3600 ? "soon" : "wait"}" ${ci}>${remain(r)}<span class="when">${when(e)}</span></td>`;
      }
    });
    h += `</tr>`;
  }
  h += `</tbody><tfoot><tr><td class="char">行ける</td>`;
  for (const G of cols) {
    const ok = chars.filter((c) => { const e = endOf(c, G); return e !== null && e <= now; }).length;
    h += `<td>${ok}/${chars.length}</td>`;
  }
  h += `</tr></tfoot></table></div>`;
  h += `<p class="hint">CTは「〇〇入場時間制限」などのクエストの期限から自動で出しています（ログイン・マップ移動のたびに最新になります）。MDの見出しをクリックするか、押したまま横になぞると、MDを選べます（もう一度で解除。見出し以外の所をクリックするか Esc で全部解除）。選んで右クリックすると、まとめて隠す・分類を移すことができます。MDのアイコンは、つかんで左右に動かすと並び替え、クリックで選択です。耐性は、MDを右クリック →「耐性を見る」（耐性のカードをクリックするとここに戻ります）。マスをクリックすると、まだCT中のキャラがグレーになります（グレーの所やほかをクリックすると解除）。キャラ名をクリックするとキャラ詳細へ。キャラ名の左の ⋮⋮ をつかんで上下に動かすと並び替え、右クリックで隠す、Ctrl（または Shift）＋クリックで複数選択です。</p>`;
  $("#view").innerHTML = h;
  makeSortable($("#view").querySelector("tbody"), "tr[data-char]", chars);
  const toggleMd = (n, on) => { (on ?? !SEL.mds.has(n)) ? SEL.mds.add(n) : SEL.mds.delete(n); };
  makeSortable($("#view").querySelector("thead tr"), "th[data-g]", cols.map((G) => G.name),
    (arr) => saveMdOrder(arr, groups.map((G) => G.name)), "x", (th) => { toggleMd(th.dataset.g); if (MX_LOCK) MX_LOCK = ""; render(); });
  // 列を選ぶ → まだCT中(数字)のキャラをグレーに。アイコンやマスのクリックで固定(マウスを乗せたときの下見は複数選択の邪魔なのでやめた)
  const rows = [...$("#view").querySelectorAll("tbody tr")];
  const waitRows = cols.map((G) => new Set(chars.map((c, r) => { const e = endOf(c, G); return e !== null && e > now ? r : -1; }).filter((r) => r >= 0)));
  const ths = [...$("#view").querySelectorAll("thead th[data-ci]")];
  const clearHl = () => $("#view").querySelectorAll(".mx-dim,.hl-col,.mx-lock,.mx-off").forEach((x) => x.classList.remove("mx-dim", "hl-col", "mx-lock", "mx-off"));
  const show = (i, lock) => {
    clearHl();
    if (i < 0 || !ths[i]) return;
    ths[i].classList.add("hl-col");
    if (lock) ths[i].classList.add("mx-lock");
    // 選んだ列以外は全部グレー、選んだ列ではCT中(数字)のキャラをグレー
    ths.forEach((th, j) => { if (j !== i) th.classList.add("mx-off"); });
    $("#view").querySelectorAll("td[data-ci]").forEach((x) => x.classList.add(+x.dataset.ci === i ? "hl-col" : "mx-off"));
    $("#view").querySelectorAll("tfoot td").forEach((x, j) => { if (j > 0 && j - 1 !== i) x.classList.add("mx-off"); });
    rows.forEach((tr, r) => { if (waitRows[i].has(r)) tr.classList.add("mx-dim"); });
  };
  const lockedIdx = () => ths.findIndex((th) => th.dataset.g === MX_LOCK);
  GRID_CLICK = (ev) => {
    if (ev.target.closest("thead th[data-g], td.char")) return;      // 見出しは選択、キャラ名はキャラ詳細に使う
    const hit = ev.target.closest("td.cell[data-ci]");
    const i = hit ? +(hit.closest("[data-ci]").dataset.ci) : -1;
    const grayCell = hit && hit.matches("td") && (hit.classList.contains("mx-off") || hit.closest("tr.mx-dim"));
    if (i >= 0 && !(MX_LOCK && lockedIdx() === i) && !grayCell) { MX_LOCK = ths[i].dataset.g; show(i, true); }
    else { MX_LOCK = ""; clearHl(); }          // グレーの所・同じ列・ほかをクリック → 解除
  };
  if (MX_LOCK) { const i = lockedIdx(); if (i >= 0) show(i, true); else MX_LOCK = ""; }   // 再描画しても固定を保つ
  // 耐性ページから戻ってきた列を見せる(固定した状態にする)
  if (MX_FOCUS) {
    const i = ths.findIndex((x) => x.dataset.g === MX_FOCUS);
    MX_FOCUS = "";
    if (i >= 0) {
      ths[i].scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      const cells = [ths[i], ...$("#view").querySelectorAll(`td[data-ci="${i}"]`)];
      cells.forEach((x) => x.classList.add("mx-flash"));
      MX_LOCK = ths[i].dataset.g; show(i, true);
      setTimeout(() => cells.forEach((x) => x.classList.remove("mx-flash")), 2500);
    }
  }
  // MD名の右クリック → メニュー
  $("#view").querySelectorAll("thead th[data-g]").forEach((th) => {
    th.oncontextmenu = (e) => {
      e.preventDefault();
      const G = cols.find((x) => x.name === th.dataset.g);
      if (G) showCtx(e.clientX, e.clientY, mdMenu(G, canGo.get(G.name), cols));
    };
    // アイコン以外の所: 押すと選択/解除。押したまま横になぞると、同じ向き(選択か解除か)でまとめて切りかえ
    th.onpointerdown = (e) => {
      if (e.button > 0 || e.target.closest(".mx-ico")) return;     // アイコンは「つかむ・クリック」(makeSortable)
      e.preventDefault();
      const on = !SEL.mds.has(th.dataset.g);
      const paint = (x) => { toggleMd(x.dataset.g, on); x.classList.toggle("sel", on); };
      paint(th);
      DRAGGING = true;                                             // なぞっている間は描き直さない
      const onMove = (m) => { const x = document.elementFromPoint(m.clientX, m.clientY)?.closest?.("thead th[data-g]"); if (x && SEL.mds.has(x.dataset.g) !== on) paint(x); };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("pointercancel", onUp);
        DRAGGING = false; SEL_GUARD = Date.now(); if (MX_LOCK) MX_LOCK = ""; render();
      };
      document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp); document.addEventListener("pointercancel", onUp);
    };
  });
  $("#view").querySelectorAll("tbody tr[data-char] td.char").forEach((td) => {
    const c = td.parentElement.dataset.char;
    td.oncontextmenu = (e) => { e.preventDefault(); showCtx(e.clientX, e.clientY, charMenu(c)); };
    td.onclick = (e) => {
      if (e.target.closest(".grip")) return;
      if (multiKey(e)) { SEL.chars.has(c) ? SEL.chars.delete(c) : SEL.chars.add(c); render(); return; }   // Ctrl/Shift+クリックで複数選択
      CH_OPEN = c; CH_FOCUS = c; TAB = "chars"; store.set("md_tab", TAB); render();                                     // クリックでキャラ詳細
    };
  });
  if (hidden.length) $("#mdhidden").onclick = (e) => { const r = e.target.getBoundingClientRect(); showCtx(r.left, r.bottom + 4, hiddenMenu(hidden)); };
  if (hcs.length) $("#charhidden").onclick = (e) => { const r = e.target.getBoundingClientRect(); showCtx(r.left, r.bottom + 4, hiddenCharMenu(hcs)); };
  $("#onlyok").onchange = (ev) => { ONLY_OK = ev.target.checked; store.set("md_onlyok", ONLY_OK ? "1" : "0"); render(); };
}
