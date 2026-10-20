"use strict";
// ---------------- モンスター情報: 被ダメを受けた場所・見かけた場所ごとの、出てくるモンスター ----------------
// 出どころ: 被ダメ(実際に攻撃を受けた)/ 見かけた(通信で見えた)/ 公式(公式サイトのマップの出現一覧)。Lv・属性などは公式サイト(この PC に集めたもの)→ ラトリオの順。
const MONP = { d: null, place: store.get("md_monplace") || "", busy: false, q: "" };
function renderMons() {
  if ($("#monp")) { monpFill(); return; }
  $("#view").innerHTML = `<div id="monp"><div class="panel" style="padding:10px"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
    <label>場所 <select id="monsel" style="max-width:360px"></select></label>
    <input id="monq" type="search" placeholder="モンスター名で絞る" style="width:200px">
    <label>技から見る <select id="monsk" style="max-width:260px"></select></label>
    <button class="ghost" id="monrun" title="公式サイトから、足りないモンスター・マップの情報を（時間をあけて）集めます">足りない情報を公式サイトから集める</button>
    <span id="monst" class="muted"></span></div>
    <p class="hint" style="margin:6px 0 0">被ダメを受けた場所・通信で見かけた場所ごとに、出てくるモンスターを表示します。出どころの「被ダメ」は実際に攻撃を受けた相手、「見かけた」は通信で見えた相手、「公式」は公式サイトのマップの出現一覧です。公式サイトの情報はこの PC の中にだけ集めます。</p></div>
    <div id="monguide"></div><div id="monbody"></div><div id="monskill"></div></div>`;
  $("#monsel").onchange = (e) => { MONP.place = e.target.value; store.set("md_monplace", MONP.place); monpFill(); };
  $("#monq").oninput = (e) => { MONP.q = e.target.value; monpBody(); };
  $("#monrun").onclick = async () => {
    $("#monrun").disabled = true;
    await mapvJson("/api/official", { run: 1 }).catch(() => {});
    $("#monst").textContent = "裏で集めています。しばらくしてから「更新」を押してください。";
    setTimeout(() => { const b = $("#monrun"); if (b) b.disabled = false; }, 4000);
  };
  { const sk = ((DATA || {}).dmg_skills || []).filter((x) => x.n).sort((a, b) => b.n - a.n); $("#monsk").innerHTML = `<option value="">（受けた技を選ぶ）</option>` + sk.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}（${fmtN(x.n)}回）${x.borrow ? " ・" + esc(x.borrow) : ""}</option>`).join(""); $("#monsk").onchange = (e) => { if (e.target.value) monpSkill(e.target.value); }; }
  $("#monp").onclick = (e) => { const b = e.target.closest("[data-msk]"); if (b) monpSkill(b.dataset.msk); };
  monpFill();
}
const MON_ST = { "確認ずみ": ["#00796b", "資料(MOB専用スキルの解説)と実測で確かめた定義です"], "確定": ["#2e7d32", "通常スキルと種類・属性が同じで、ヒット数も実測と合いました"], "借り": ["#b7791f", "定義が無いので、「M」を外した通常スキルから種類・属性を借りています（ヒット数で確かめられていません）"],
  "一致": ["#2a6fb0", "もともとの定義が、通常スキルの種類・属性と同じです"], "食い違い": ["#c0392b", "もともとの定義が、通常スキルの種類・属性と違います（どちらかが誤りの可能性）"] };
async function monpSkill(name) {
  const el = $("#monskill"); if (!el) return;
  el.innerHTML = `<div class="panel" style="padding:10px;margin-top:8px"><div class="busybar">${esc(name)} を調べています</div></div>`;
  let v; try { v = await mapvJson("/api/skillview?name=" + encodeURIComponent(name)); } catch (e) { el.innerHTML = ""; return; }
  const G = gearSets();
  const st = v.state ? `<span class="tag" style="background:${MON_ST[v.state][0]};color:#fff" title="${esc(MON_ST[v.state][1])}">${esc(v.state)}</span>` : "";
  const norm = (m) => (v.kind === "魔法" ? m.matk : /物理/.test(v.kind) ? m.atk : null);
  const num = (x) => (typeof x === "number" ? x : null);
  const tot = v.near + v.far;
  const head = `<b style="font-size:15px">${esc(v.name)}</b> ${v.kind || v.ele ? `<span class="tag">${esc(v.kind || "種類不明")}・${esc(v.ele || "属性不明")}</span>` : `<span class="muted">種類・属性はまだ分かりません</span>`} ${st}`;
  const info = [];
  if (v.base) info.push(`通常スキル「${esc(v.base)}」${v.base_kind && v.base_kind.length ? `（${esc(v.base_kind.join("・"))}）` : ""}と比較`);
  if (v.hits_exp != null) info.push(`ヒット数: 通常 ${v.hits_exp} ／ 実測 ${v.hits_meas == null ? "-" : v.hits_meas}（${fmtN(v.uses)}回）`);
  else if (v.hits_meas != null) info.push(`実測ヒット数: 1回 ${v.hits_meas}`);
  if (tot && /物理/.test(v.kind)) info.push(`近接 ${Math.round(100 * v.near / tot)}% ／ 遠距離 ${Math.round(100 * v.far / tot)}%（ダメージの合計で）`);
  const cnt = v.counter.length ? `<details style="margin-top:8px" open><summary>この技のダメージを減らす装備・カード（${v.counter.length}件。ラトリオの説明文から）</summary><div class="tablewrap"><table><tbody>${v.counter.map(([k, n, t]) => `<tr><td class="l"><span class="tag">${esc(k)}</span> ${esc(n)}</td><td class="l muted">${esc(t)}</td></tr>`).join("")}</tbody></table></div></details>` : "";
  const rows = v.rows.map((r) => {
    const m = r.mob || {}, nv = norm(m);
    return `<tr><td class="l">${esc(r.who)}</td><td class="l muted">${esc(r.where)}</td><td class="l">${gearTag(G, r.set)}</td><td>${esc(m.lv ?? "-")}</td><td>${esc(m.atk != null ? (num(m.atk) ? fmtN(m.atk) : m.atk) : "-")}</td><td>${esc(m.matk != null ? (num(m.matk) ? fmtN(m.matk) : m.matk) : "-")}</td><td>${esc(m.def ?? "-")}/${esc(m.mdef ?? "-")}</td><td>${esc(m.ele || "-")}</td><td>${fmtN(r.n)}</td><td class="dm-max">${fmtN(r.max)}</td><td>${fmtN(r.avg)}</td><td>${num(nv) ? (r.max / nv).toFixed(2) : "-"}</td></tr>`;
  }).join("");
  el.innerHTML = `<div class="panel" style="padding:10px;margin-top:8px">${head}<div class="muted" style="margin:4px 0">${info.join(" ・ ")}</div>${cnt}
    ${v.rows.length ? `<h3 style="margin:12px 2px 4px">敵・装備ごとのダメージ</h3><p class="hint" style="margin:0 0 4px">同じ技でも敵によってダメージが変わります。右端は「最大ダメージ ÷ 敵の${v.kind === "魔法" ? "MATK" : /物理/.test(v.kind) ? "ATK" : "ATK/MATK（技の種類が不明で出せません）"}」で、敵の強さの違いを除いて比べるための目安です。同じ装備(記号)どうしで見ると、装備の違いも除けます。</p><div class="panel tablewrap"><table><thead><tr><th class="l">敵</th><th class="l">場所</th><th class="l">装備</th><th>敵Lv</th><th>ATK</th><th>MATK</th><th>DEF/MDEF</th><th>敵の属性</th><th>回数</th><th>最大</th><th>平均</th><th>最大÷${v.kind === "魔法" ? "MATK" : "ATK"}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="hint">この技は、まだ受けた記録がありません。</p>`}</div>`;
}
async function monpFill() {
  if (MONP.busy) return; MONP.busy = true;
  try { MONP.d = await mapvJson("/api/mobplaces"); } catch (e) { MONP.busy = false; return; }
  MONP.busy = false;
  const sel = $("#monsel"); if (!sel) return;
  const places = Object.keys((MONP.d || {}).places || {}).sort((a, b) => (a.startsWith("フィールド") - b.startsWith("フィールド")) || a.localeCompare(b, "ja"));
  if (!places.includes(MONP.place)) MONP.place = places[0] || "";
  sel.innerHTML = places.map((w) => `<option value="${esc(w)}" ${w === MONP.place ? "selected" : ""}>${esc(w)}（${MONP.d.places[w].length}）</option>`).join("");
  const o = (MONP.d || {}).official;
  $("#monst").textContent = o ? `公式サイトから集めた情報: モンスター ${o.mobs} 体（詳細 ${o.details}）${o.state === "working" ? " ・取得中…" : ""}` : "";
  monpBody();
  monpGuide();
}
async function monpGuide() {
  const el = $("#monguide"); if (!el || !MONP.place) { if (el) el.innerHTML = ""; return; }
  const w = MONP.place;
  let g; try { g = await mapvJson("/api/placeguide?where=" + encodeURIComponent(w)); } catch (e) { return; }
  if (w !== MONP.place || !$("#monguide")) return;
  el.innerHTML = monpGuideHtml(g);
}
function monpGuideHtml(g) {
  const D = g.damage || {}, T = D.total || 0;
  const pct = (v) => (T ? Math.round(100 * v / T) : 0);
  const bars = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).filter(([, v]) => pct(v) > 0).map(([k, v]) => `<span class="tag" title="${esc(k)} ${fmtN(v)}">${esc(k)} ${pct(v)}%</span>`).join(" ");
  const stat = (a) => a.label && STP_AILSTAT[a.label] ? `${esc(STP_AILSTAT[a.label])}${a.est ? ` <span title="ゲームの表示名と違うため、推定の対応です（ラトリオでは「${esc(a.label)}」）">※</span>` : ""}` : "";
  const got = (g.got || []).map((a) => `<tr><td class="l"><b>${esc(a.name)}</b></td><td>${fmtN(a.n)}</td><td class="l">${stat(a)}</td><td class="l muted">${a.src.map(([w, s, c]) => w ? `${esc(w)}（${esc(s)}）×${c}` : `原因不明 ×${c}`).join("、")}</td></tr>`).join("");
  const warn = (g.warn || []).filter((a) => !a.got).map((a) => `<tr><td class="l"><b>${esc(a.name)}</b></td><td class="l muted">${a.mobs.map(([m, s]) => `${esc(m)}（${esc(s.join("・"))}）`).join("、")}</td></tr>`).join("");
  const cnt = Object.entries(g.counter || {}).filter(([, v]) => v.length).map(([k, v]) => `<div style="margin:6px 0 2px"><b>${esc(k)}</b> <span class="muted">${esc(STP_AILSTAT[k] || "")}</span></div><div>${v.map(([kind, n, val, cond]) => `<span class="tag" title="${esc(kind)}${cond ? "・" + esc(cond) : ""}">${esc(n)} ${val >= 100 ? "無効" : val + "%"}${cond ? "*" : ""}</span>`).join(" ")}</div>`).join("");
  const top = (g.top || []).map(([n, c, mx, k, e]) => `<tr><td class="l"><button class="ghost mskill" data-msk="${esc(n)}">${esc(n)}</button></td><td class="l">${esc(k)}・${esc(e)}</td><td>${fmtN(c)}</td><td class="dm-max">${fmtN(mx)}</td></tr>`).join("");
  if (!got && !warn && !T) return `<div class="panel" style="padding:10px;margin-top:8px"><b>この場所の対策</b> <span class="muted">まだ記録がありません</span></div>`;
  return `<div class="panel" style="padding:10px;margin-top:8px"><b style="font-size:15px">この場所の対策</b> <span class="muted">（実測の被ダメ・状態異常と、公式サイトの敵のスキルから）</span>
    ${T ? `<div style="margin:8px 0 2px"><b>受けたダメージの内訳</b>（合計 ${fmtN(T)}）</div><div>種類: ${bars(D.kind)}</div><div style="margin-top:3px">属性: ${bars(D.ele)}</div>${D.near + D.far ? `<div class="muted" style="margin-top:3px">物理: 近接 ${Math.round(100 * D.near / (D.near + D.far))}% ／ 遠距離 ${Math.round(100 * D.far / (D.near + D.far))}%</div>` : ""}` : ""}
    ${got ? `<div style="margin:10px 0 2px"><b>受けた状態異常</b>（実測）</div><div class="panel tablewrap"><table><thead><tr><th class="l">状態異常</th><th>回数</th><th class="l" title="この状態異常に効くステータス（ラトリオの式。※は名前が違うため推定の対応）">効くステータス</th><th class="l">原因（相手の技）</th></tr></thead><tbody>${got}</tbody></table></div>` : ""}
    ${warn ? `<div style="margin:10px 0 2px"><b>警戒する状態異常</b>（まだ受けていないが、この場所の敵が使う技から）</div><div class="panel tablewrap"><table><thead><tr><th class="l">状態異常</th><th class="l">使う敵（技）</th></tr></thead><tbody>${warn}</tbody></table></div>` : ""}
    ${cnt ? `<details style="margin-top:8px"><summary>この場所の状態異常に効く装備・カード（${Object.keys(g.counter).filter((k) => g.counter[k].length).length}種類。ラトリオのデータから）</summary>${cnt}</details>` : ""}
    ${top ? `<details style="margin-top:8px"><summary>よく受けた・強い技（${g.top.length}）</summary><div class="tablewrap"><table><thead><tr><th class="l">技</th><th class="l">種類・属性</th><th>回数</th><th>最大</th></tr></thead><tbody>${top}</tbody></table></div></details>` : ""}
    <p class="hint" style="margin:8px 0 0">いまのキャラの状態異常の耐性は、「計算機」の「耐性」の枠（状態異常）で確認できます。</p></div>`;
}
function monpBody() {
  const el = $("#monbody"); if (!el) return;
  const rows = (((MONP.d || {}).places || {})[MONP.place] || []).filter((r) => !MONP.q || r.name.includes(MONP.q));
  if (!MONP.place) { el.innerHTML = `<div class="panel empty">まだ記録がありません。ROで戦うと、受けた場所ごとにここに出ます。</div>`; return; }
  const tag = (s) => `<span class="tag" style="${s === "被ダメ" ? "background:#c0392b;color:#fff" : s === "公式" ? "background:#2a6fb0;color:#fff" : ""}">${esc(s)}</span>`;
  const noOff = rows.filter((r) => !r.official).length;
  el.innerHTML = `<div class="panel tablewrap" style="margin-top:8px"><table><thead><tr><th class="l">モンスター</th><th>Lv</th><th>HP</th><th>属性</th><th>種族</th><th>サイズ</th><th>種類</th><th class="l">使うスキル</th><th class="l">出どころ</th></tr></thead><tbody>${
    rows.map((r) => `<tr><td class="l"${r.aegis ? ` title="公式のID名: ${esc(r.aegis)}"` : ""}>${esc(r.name)}</td><td>${r.lv ? esc(r.lv) : "-"}</td><td>${r.hp ? esc(typeof r.hp === "number" ? fmtN(r.hp) : r.hp) : "-"}</td><td>${esc(r.ele || "-")}</td><td>${esc(r.race || "-")}</td><td>${esc(r.size || "-")}</td><td>${r.boss ? "ボス" : r.lv ? "一般" : "-"}</td><td class="l muted" style="max-width:380px">${r.skills.length ? r.skills.map((x) => `<button class="ghost mskill" data-msk="${esc(x)}" title="この技の種類・属性・軽減する装備・敵ごとのダメージを見る">${esc(x)}</button>`).join(" ") : r.official ? "-" : `<span title="公式サイトから集めると出ます">未取得</span>`}</td><td class="l">${r.src.map(tag).join(" ")}</td></tr>`).join("")}</tbody></table></div>
    ${noOff ? `<p class="hint">公式サイトの情報が未取得のモンスターが ${noOff} 体います。「足りない情報を公式サイトから集める」で、時間をあけて少しずつ集めます。</p>` : ""}`;
}

// ---------------- マップ読み込み(歯車): 公式サイト(RO公式ツール)のマップ情報を、この PC に取り込んで見る ----------------
// 公式サイトに負荷をかけないよう、取り込みは「読み込む」を押したときだけ・1つのマップずつ・3秒以上あけて動く。取り込んだものはこの PC にだけ置く(配らない)。
// 将来: ファロス(やっぱROのマッピング)の map 形式との互換。いまは公式のマップ画像・マップの設定・出現モンスターを見るところまで。
const MAPV = { q: "", file: "", cur: null, d: null, sig: "", timer: 0, msg: "" };
const mapvJson = (u, body) => fetch(u, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then((r) => r.json());
function renderMapView() {
  if ($("#mapv")) { mapvCur(); if (MAPV.file) mapvPoll(); return; }          // 作ってあるときは作り直さない(画像・検索欄・読み込みの表示が消えないように)。ほかのタブから戻ったときは、現在地と読み込みの様子だけ読み直す
  $("#view").innerHTML = `<div id="mapv"><h2>マップ読み込み</h2>
    <p class="hint">RO公式ツール（rotool.gungho.jp）のマップ情報（マップ画像・マップの設定・出現モンスター）を、この PC に取り込んで見ます。サイトに負荷をかけないよう、「読み込む」を押したときだけ、1つずつ時間をあけて取ります。取り込んだ内容はこの PC の中だけに置かれます（配布・公開はしません）。</p>
    <div class="panel" style="padding:10px"><div id="mvcur" class="muted">いまいるマップを調べています…</div>
      <div style="margin-top:8px"><input id="mvq" class="mvq" type="search" placeholder="マップ名・ファイル名で探す（例: ファロス / 星座 / 1@ct0）" style="width:min(420px,100%)"></div>
      <div id="mvres" style="margin-top:6px"></div></div>
    <div id="mvbody"></div></div>`;
  $("#mvq").value = MAPV.q;
  $("#mvq").oninput = (e) => { MAPV.q = e.target.value; mapvSearch(); };
  $("#mapv").onclick = (e) => {
    const b = e.target.closest("[data-mvsel]"); if (b) return mapvSelect(b.dataset.mvsel);
    if (e.target.closest("#mvload")) return mapvLoad();
  };
  mapvCur(); mapvSearch(); if (MAPV.file) mapvSelect(MAPV.file);
}
async function mapvCur() {
  let c; try { c = await mapvJson("/api/mapcur"); } catch (e) { return; }
  const el = $("#mvcur"); if (!el) return;
  if (c.off) { el.textContent = "公式サイトの機能が使えません。"; return; }
  MAPV.cur = c;
  if (!c.map) { el.innerHTML = "いまいるマップ: <span class=\"muted\">まだ分かりません（ROにログインしてマップを移動すると出ます）</span>"; return; }
  const btn = (c.files || []).map(([f, n]) => `<button class="ghost" data-mvsel="${esc(f)}" title="${esc(f)}">${esc(n)} を見る</button>`).join(" ");
  el.innerHTML = `いまいるマップ: <b>${esc(cn(c.char))}</b>${c.live ? "" : " <span class=\"muted\">（最後にいた場所）</span>"} <span class="tag">${esc(c.map)}</span> ${btn || "<span class=\"muted\">公式サイトのマップ一覧にまだ見つかりません。下の検索から（一覧が無ければ、どれか1つ読み込むと取れます）</span>"}`;
}
let MAPV_SEQ = 0;
async function mapvSearch() {
  const my = ++MAPV_SEQ;
  let r; try { r = await mapvJson("/api/maps?q=" + encodeURIComponent(MAPV.q)); } catch (e) { return; }
  const el = $("#mvres"); if (!el || my !== MAPV_SEQ) return;      // 遅れて届いた古い結果では上書きしない
  if (!r.have) { el.innerHTML = `<span class="muted">マップの一覧がまだありません。どれか1つ「読み込む」と、いっしょに一覧も取り込みます。</span> <button class="ghost" data-mvsel="1@23inf">ファロス（入口）から試す</button>`; return; }
  el.innerHTML = r.rows.length ? r.rows.map(([f, n, have]) => `<button class="ghost" data-mvsel="${esc(f)}" title="${esc(f)}">${have ? "● " : ""}${esc(n)} <span class="muted">${esc(f)}</span></button>`).join(" ") + (r.rows.length >= 60 ? ` <span class="muted">…ほかにもあります（もう少し絞ってください）</span>` : "") : `<span class="muted">見つかりません。</span>`;
}
async function mapvSelect(f) {
  MAPV.file = f; MAPV.d = null; MAPV.sig = ""; MAPV.msg = "";
  await mapvPoll();
}
async function mapvLoad() {
  if (!MAPV.file) return;
  const r = await mapvJson("/api/map", { file: MAPV.file }).catch(() => ({}));
  MAPV.msg = r.started === false ? "いま別のマップを読み込み中です。終わるまでお待ちください。" : "";
  MAPV.sig = "";
  await mapvPoll();
}
async function mapvPoll() {
  clearTimeout(MAPV.timer);
  if (TAB !== "mapview" || !MAPV.file) return;
  let d; try { d = await mapvJson("/api/map?file=" + encodeURIComponent(MAPV.file)); } catch (e) { return; }
  const body = $("#mvbody"); if (!body) return;
  const job = d.job && d.job.file === MAPV.file ? d.job : null;
  const sig = JSON.stringify([d.map, job && job.state, MAPV.msg]);      // 進み具合の数字(job.done など)は含めない(帯だけ書きかえる)
  if (sig !== MAPV.sig) {
    const wasOpen = body.querySelector("details")?.open;
    MAPV.sig = sig; MAPV.d = d; body.innerHTML = mapvBodyHtml(d);
    const dt = body.querySelector("details"); if (dt && wasOpen) dt.open = true;
    if (d.map) { mapvSearch(); mapvCur(); }
  }
  const bar = $("#mvbar"); if (bar) bar.innerHTML = mapvBarHtml(d);      // 変わったときだけ描き直す(画像がちらつかないように)
  if (d.job && d.job.file === MAPV.file && d.job.state === "loading") MAPV.timer = setTimeout(mapvPoll, 2500);
}
function mapvBarHtml(d) {
  const job = d.job && d.job.file === MAPV.file ? d.job : null;
  return job && job.state === "loading" ? `<div class="busybar">${esc(job.msg || "読み込み中")}${job.total ? `（${job.done}/${job.total}）` : ""}</div>`
    : job && job.state === "error" ? `<div class="busybar" style="background:#ffb4a8;color:#4a0d00">${esc(job.msg)}</div>` : "";
}
const MV_BGM = ["BGM No", "BGM Name", "アーティスト情報"];
function mapvBodyHtml(d) {
  const f = MAPV.file, job = d.job && d.job.file === f ? d.job : null, loading = !!job && job.state === "loading";
  const st = d.status || {};
  const bar = `<div id="mvbar">${mapvBarHtml(d)}</div>`;
  const msg = MAPV.msg ? `<div class="hint warn">${esc(MAPV.msg)}</div>` : "";
  const m = d.map;
  const loadBtn = `<button id="mvload" class="${m ? "ghost" : ""}" ${loading ? "disabled" : ""}>${m ? "公式サイトから読み込み直す" : "公式サイトから読み込む"}</button>`;
  if (!m) return `<div class="panel" style="padding:12px;margin-top:10px"><b>${esc(f)}</b> はまだ取り込んでいません。<div style="margin-top:8px">${loadBtn}</div>${bar}${msg}${st.paused_until ? `<div class="hint">サイトの調子が悪かったので、しばらく休んでいます。</div>` : ""}</div>`;
  const bgm = m.props.filter(([k]) => MV_BGM.includes(k)).map(([, v]) => v).filter(Boolean).join(" / ");
  const rows = m.props.filter(([k]) => !MV_BGM.includes(k));
  const mons = m.mons.length
    ? `<div class="panel tablewrap" style="margin-top:8px"><table><thead><tr><th class="l">モンスター</th><th>Lv</th><th>HP</th><th>属性</th><th>種族</th><th>サイズ</th><th>種類</th><th class="l">使うスキル</th></tr></thead><tbody>${
      m.mons.map((x) => `<tr><td class="l"><a href="https://rotool.gungho.jp/monster/${encodeURIComponent(x.id)}" target="_blank" rel="noopener">${esc(x.jname)}</a>${x.d ? "" : ` <span class="muted" title="まだ詳細を取っていません">…</span>`}</td><td>${x.lv ? fmtN(x.lv) : "-"}</td><td>${x.hp ? fmtN(x.hp) : "-"}</td><td>${esc(x.ele || "-")}</td><td>${esc(x.race || "-")}</td><td>${esc(x.size || "-")}</td><td>${esc(x.cls || "-")}</td><td class="l muted" style="max-width:360px">${esc((x.skills || []).join("、"))}</td></tr>`).join("")}</tbody></table></div>
      ${m.small ? "" : `<p class="hint">出現モンスターが多いマップなので、詳細（Lv・属性など）は取り込んでいません。名前を押すと公式サイトのページが開きます。</p>`}`
    : `<p class="hint">公式サイトに、このマップの出現モンスターの情報はありませんでした（ファロスのようなマップは載っていないことがあります）。</p>`;
  return `<div class="panel" style="padding:12px;margin-top:10px"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><b style="font-size:16px">${esc(m.title || m.name)}</b>
      <span class="muted">${bgm ? "♪ " + esc(bgm) + " ・ " : ""}取り込み ${when(m.t)}</span> ${loadBtn} <a href="https://rotool.gungho.jp/map/${encodeURIComponent(f)}" target="_blank" rel="noopener">公式で開く</a></div>${bar}${msg}
    ${m.img ? `<div style="margin-top:10px"><img src="/mapimg/${encodeURIComponent(m.img)}" alt="" style="max-width:100%;height:auto;border-radius:6px;background:#0002"></div>` : ""}
    <details style="margin-top:10px"><summary>マップの設定（${rows.length + m.blocked.length}項目）</summary><div class="tablewrap"><table><tbody>${rows.map(([k, v]) => `<tr><td class="l">${esc(k)}</td><td class="l">${esc(v)}</td></tr>`).join("")}${m.blocked.map(([k, items]) => `<tr><td class="l">${esc(k)}</td><td class="l muted">${items.length ? esc(items.join("、")) : "-"}</td></tr>`).join("")}</tbody></table></div></details></div>
    <h3 style="margin:14px 2px 0">出現モンスター（${m.mons.length}）</h3>${mons}`;
}

function renderSettings(groups) {
  const KO = { weekly: 0, daily: 1, other: 2, hide: 3 };
  groups.sort((a, b) => (KO[a.kind] - KO[b.kind]) || (a.order - b.order) || a.label.localeCompare(b.label, "ja"));
  const mdNames = groups.map((G) => G.name);
  const md = SETTINGS.md || {};
  let top = "";      // いちばん上に出す枠(アップデート・共有の結びつけ・2台の同期・記録の引っ越し)
  if (typeof LOCAL !== "undefined" && LOCAL) {
    const u = UPDATE || {};
    top += `<h2>アップデート</h2><div class="panel list"><div class="row"><span class="nm">いまの版 v${esc(u.current || DATA.version || "?")}${DATA.edition ? "（" + esc(DATA.edition) + "）" : ""}
      <span class="muted">${u.state === "none" ? "（最新です）" : u.state === "available" ? `（新しい版 v${esc(u.latest.version)} があります）` : u.state === "error" ? "（" + esc(u.error) + "）" : ""}</span></span>
      <button class="ghost" id="upchk">アップデートを確認</button></div></div>`;
  }
  if (typeof LOCAL !== "undefined" && LOCAL && LICST.state !== "off") {
    const mine = Object.keys(myUnsharedLinks()).length, n = Object.keys(SHARED.links || {}).length;
    const when = SHARED.t ? new Date(SHARED.t * 1000).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "まだ取っていません";
    top += `<h2>共有の結びつけ</h2><div class="panel list"><div class="row"><span class="nm">ゲームのアイテムと計算機の名前の結びつけを、みんなで共有します。<span class="muted">（共有の表: ${n}件・最後に更新 ${esc(when)}。自分で決めた結びつけが先に使われます）</span></span>
      <button class="ghost" id="lnkref">今すぐ更新</button></div>
      <div class="row"><span class="nm">自分で結びつけたもののうち、共有の表にまだ無いもの: <b>${mine}件</b> <span class="muted">（提案すると、配布元が確認してから全員に配られます。名前の組だけが送られます）</span></span>
      <button class="ghost" id="lnkprop" ${mine ? "" : "disabled"}>提案する</button></div><div class="muted" id="lnkmsg" style="padding:4px 8px"></div></div>`;
  }
  if (LOCAL && LICST.state !== "off") top += syncSettingsHtml();
  let h = `<h2>MDの分類と表示名</h2><p class="hint">「自動」は、名前に「週間」がある・明ける時刻がちょうど12:00・CTが26時間より長い → 週次、それ以外 → デイリー で分けています。違っていたらここで直してね。⋮⋮ をつかんで上下に動かすと、表の列の並びが変わります。</p>
    <div class="sortbar"><button class="ghost" id="mdreset">MDの並びを名前順に戻す</button></div><div class="panel list" id="mdlist">`;
  for (const G of groups) {
    const s = md[G.name] || {};
    const autoL = { weekly: "週次", daily: "デイリー", other: "クエスト" }[G.auto];
    h += `<div class="row" data-g="${esc(G.name)}"><span class="nm"><span class="grip" title="つかんで上下に動かすと並び替え">⋮⋮</span>${iconImg(G.name, true)}${esc(G.name)}</span>
      <input class="lbl" data-label="${esc(G.name)}" placeholder="表示名" value="${esc(s.label || "")}">
      <select data-kind="${esc(G.name)}">
        ${[["auto", `自動（${autoL}）`], ["weekly", "週次"], ["daily", "デイリー"], ["other", "クエスト"], ["hide", "表示しない"]]
          .map(([v, l]) => `<option value="${v}" ${(s.kind || "auto") === v ? "selected" : ""}>${l}</option>`).join("")}
      </select></div>`;
  }
  h += `</div><h2>キャラ</h2>
    <div class="sortbar"><span class="muted">並べかえ:</span>
      <button class="ghost" data-sort="name">名前順</button>
      <button class="ghost" data-sort="lv">Lvが高い順</button>
      <button class="ghost" data-sort="job">職業ごと</button>
      <button class="ghost" data-sort="account">アカウントごと</button>
      <button class="ghost" data-sort="seen">最近ログインした順</button>
      <span class="muted">（⋮⋮ をつかんで上下に動かしても変えられます）</span></div>
    <div class="panel list" id="charlist">`;
  const all = Object.keys(DATA.chars || {}).filter(inServer);
  const order = SETTINGS.charOrder || [];
  all.sort((a, b) => (charIdx(order, a) - charIdx(order, b)) || cn(a).localeCompare(cn(b), "ja"));
  const hidden = new Set(SETTINGS.hiddenChars || []);
  all.forEach((c, i) => {
    const seen = DATA.chars[c].seen;
    h += `<div class="row" data-char="${esc(c)}"><span class="nm"><span class="grip" title="つかんで上下に動かすと並び替え">⋮⋮</span>${esc(cn(c))} <span class="muted">最終確認 ${seen ? when(seen) : "-"}</span></span>
      <button class="ghost" data-up="${i}" ${i ? "" : "disabled"}>↑</button>
      <button class="ghost" data-down="${i}" ${i < all.length - 1 ? "" : "disabled"}>↓</button>
      <label class="muted"><input type="checkbox" data-hide="${esc(c)}" ${isHiddenChar(c, hidden) ? "checked" : ""}> 隠す</label>
      <button class="ghost" data-del="${esc(c)}">記録を消す</button></div>`;
  });
  h += `</div>`;
  // サーバー(この PC で見ているときだけ)。露店用など、記録しないサーバーを選べる
  const SV = DATA.servers || [];
  if (typeof LOCAL !== "undefined" && LOCAL && SV.length) {
    const ign = new Set(SETTINGS.ignoreServers || []);
    h += `<h2>サーバー</h2><div class="panel list">${SV.map((v) => `<div class="row"><span class="nm"><b>${esc(serverLabel(v.ip))}</b> <span class="muted">${esc(v.ip)}</span>
      <input class="lbl srvname" data-srvname="${esc(v.ip)}" style="width:140px;margin-left:6px" placeholder="${esc(worldName(v.ip) || "表示名")}" value="${esc((SETTINGS.serverNames || {})[v.ip] || "")}" title="表示名（空欄 = ログインのときに届いたワールド名）"><br>
      <span class="muted">${v.chars.length ? "遊んだキャラ: " + esc([...new Set(v.chars.map(cn))].join("、")) : "キャラはまだわかりません"} ・ 最後 ${v.last ? when(v.last) : "-"}</span></span>
      <label class="muted"><input type="checkbox" data-srv="${esc(v.ip)}" ${ign.has(v.ip) ? "checked" : ""}> 記録しない</label></div>`).join("")}</div>
      <p class="hint">キャラ選択のときにつないだサーバー（ワールド）ごとに分けています。名前は、ログインのときに届いたワールド名を使います（入力欄に書くと、その名前に変えられます）。露店用のサーバーなど「記録しない」にしたサーバーは、そこで遊んでいる間の通信を読み飛ばします（MDのクールタイム・被ダメ・装備などに入りません）。すでに入った記録は消えないので、いらなければ上のキャラの「記録を消す」で消してください。</p>`;
  }
  h += `<h2>耐性シート</h2><div class="panel list"><div class="row"><span class="nm">GoogleスプレッドシートのURL（空欄 = 最初に作った「MD耐性一覧」）</span>
    <input class="lbl" id="rzsheet" style="flex:1;min-width:240px" placeholder="https://docs.google.com/spreadsheets/d/…" value="${esc(SETTINGS.resistSheet || "")}"></div></div>`;
  h = top + h + `<div class="err" id="serr"></div>`;
  $("#view").innerHTML = h;
  syncBind();
  if ($("#lnkref")) $("#lnkref").onclick = async () => { $("#lnkmsg").textContent = "更新中…"; try { const j = await (await fetch("/api/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: 1 }) })).json(); await sharedLoad(); render(); const m = $("#lnkmsg"); if (m) m.textContent = j.ok ? (j.msg || "") : "できませんでした: " + (j.error || ""); } catch (e) { $("#lnkmsg").textContent = "つながりませんでした。"; } };
  if ($("#lnkprop")) $("#lnkprop").onclick = async () => { $("#lnkmsg").textContent = "送信中…"; try { const j = await (await fetch("/api/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propose: myUnsharedLinks() }) })).json(); $("#lnkmsg").textContent = j.ok ? `提案しました(新しく ${j.added} 件)。承認されると全員に配られます。` : "できませんでした: " + (j.error || ""); } catch (e) { $("#lnkmsg").textContent = "つながりませんでした。"; } };
  if ($("#upchk")) $("#upchk").onclick = async () => { $("#upchk").textContent = "確認中…"; await checkUpdate(true); render(); };
  $("#rzsheet").onchange = (e) => { SETTINGS.resistSheet = e.target.value.trim(); saveSettings(); RZ.t = 0; };

  document.querySelectorAll("[data-kind]").forEach((el) => el.onchange = () => {
    const m = SETTINGS.md = SETTINGS.md || {};
    m[el.dataset.kind] = { ...(m[el.dataset.kind] || {}), kind: el.value };
    saveSettings();
  });
  document.querySelectorAll("[data-label]").forEach((el) => el.onchange = () => {
    const m = SETTINGS.md = SETTINGS.md || {};
    m[el.dataset.label] = { ...(m[el.dataset.label] || {}), label: el.value.trim() };
    saveSettings();
  });
  const move = (i, d) => {
    const arr = all.slice(); const [x] = arr.splice(i, 1); arr.splice(i + d, 0, x);
    saveCharOrder(arr);
  };
  makeSortable($("#charlist"), ".row[data-char]", all);
  makeSortable($("#mdlist"), ".row[data-g]", mdNames, (arr) => saveMdOrder(arr, mdNames));
  $("#mdreset").onclick = () => {
    for (const v of Object.values(SETTINGS.md || {})) delete v.order;
    saveSettings(); render();
  };
  const C = DATA.chars;
  const byName = (a, b) => a.localeCompare(b, "ja", { numeric: true });
  const SORTS = {
    name: byName,
    lv: (a, b) => ((C[b].lv || 0) - (C[a].lv || 0)) || byName(a, b),
    job: (a, b) => ((C[a].job ?? 1e9) - (C[b].job ?? 1e9)) || ((C[b].lv || 0) - (C[a].lv || 0)) || byName(a, b),
    account: (a, b) => String(accOfChar(a) ?? "~").localeCompare(String(accOfChar(b) ?? "~"), "ja", { numeric: true }) || all.indexOf(a) - all.indexOf(b),
    seen: (a, b) => ((C[b].seen || 0) - (C[a].seen || 0)) || byName(a, b),
  };
  document.querySelectorAll("[data-sort]").forEach((el) => el.onclick = () => saveCharOrder(all.slice().sort(SORTS[el.dataset.sort])));
  document.querySelectorAll("[data-up]").forEach((el) => el.onclick = () => move(+el.dataset.up, -1));
  document.querySelectorAll("[data-down]").forEach((el) => el.onclick = () => move(+el.dataset.down, 1));
  document.querySelectorAll("input[data-srvname]").forEach((el) => {
    el.onchange = () => {
      SETTINGS.serverNames = SETTINGS.serverNames || {};
      const v = el.value.trim();
      if (v) SETTINGS.serverNames[el.dataset.srvname] = v; else delete SETTINGS.serverNames[el.dataset.srvname];
      saveSettings(); render();
    };
    el.onkeydown = (ev) => { if (ev.key === "Enter") el.blur(); };
  });
  document.querySelectorAll("[data-srv]").forEach((el) => el.onchange = () => {
    const s = new Set(SETTINGS.ignoreServers || []);
    el.checked ? s.add(el.dataset.srv) : s.delete(el.dataset.srv);
    SETTINGS.ignoreServers = [...s]; saveSettings();
  });
  document.querySelectorAll("[data-hide]").forEach((el) => el.onchange = () => {
    const s = new Set(SETTINGS.hiddenChars || []);
    el.checked ? s.add(el.dataset.hide) : (s.delete(el.dataset.hide), s.delete(cn(el.dataset.hide)));
    SETTINGS.hiddenChars = [...s]; saveSettings();
  });
  document.querySelectorAll("[data-del]").forEach((el) => el.onclick = async () => {
    if (el.dataset.confirm !== "1") { el.dataset.confirm = "1"; el.textContent = "本当に消す？"; return; }
    await api("DELETE", "?char=" + encodeURIComponent(el.dataset.del));
    await load();
  });
}
