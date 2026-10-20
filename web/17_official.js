"use strict";
// ---- 公式モンスター情報(RO公式ツールから、この PC に集める) / 名前の分からない相手(ID○○)の紐付け ----
function officialHtml() {
  const O = DATA.official;
  if (!O || !(typeof LOCAL !== "undefined" && LOCAL)) return "";
  const st = O.state === "working" ? "調べています…" : O.state === "paused" ? `サイトの調子が悪いので休み中（${when(O.paused_until)} まで）` : O.enabled ? "待機中（アプリを開いてしばらくしたあと、30分おきに足りない分を調べます）" : "オフ";
  return `<div class="panel simbox"><div class="opts"><b>公式モンスター情報</b>
      <span class="muted">RO公式ツールから、入った MD で見かけたモンスターの情報（Lv・HP・属性・種族・サイズ・使うスキルなど）を、この PC に集めています。1件ずつ3秒以上あけて、サイトに負荷をかけないようにしています。集めたものは、この PC の中だけに置きます。</span></div>
    <div class="opts"><span>集めた <b>${fmtN(O.mobs)}</b> 体（詳しい情報つき ${fmtN(O.details)}）／ これから調べる ${fmtN(O.pending)} 件 ／ ${esc(st)}</span>
      <label><input type="checkbox" id="offon" ${O.enabled ? "checked" : ""}> 自動で集める</label>
      <button class="ghost" id="offrun" ${O.state === "working" || O.state === "paused" || !O.enabled ? "disabled" : ""}>今すぐ調べる</button>${O.error ? ` <span class="warn">${esc(O.error)}</span>` : ""}</div></div>`;
}
const MG_SEL = {};
const mgKey = (g) => g.where + "|" + (g.named || []).join(",") + "|" + (g.skills.length ? "" : g.ids[0]);
function mobGroupsHtml() {
  const G = DATA.mob_groups || [];
  if (!G.length || !(typeof LOCAL !== "undefined" && LOCAL)) return "";
  const names = DATA.official_names || [];
  return `<h2>名前が分からない攻撃者（${G.length} グループ）</h2><div class="panel simbox">
    <div class="muted" style="margin-bottom:6px">通信で名前を受け取れなかった相手は「ID○○」と出ます（1体ごとの番号で、出会うたびに変わります）。同じ場所で同じ技を使う相手をまとめて、使われた技から候補を出しました。候補を選んで「紐付ける」を押すと、このグループ全部がその名前になります（元には戻せません）。「次からも自動」にチェックすると、この場所でこれらの技を使う相手は、次から自動でその名前にします。
      ${names.length ? "" : "（公式モンスター情報がまだ集まっていないので、候補は少ないです。しばらくすると増えます）"}</div>
    <datalist id="mgnames">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    ${G.map((g, i) => {
      const k = mgKey(g), fulls = g.cands.filter((c) => c.total && c.match === c.total && c.known), sel = MG_SEL[k] !== undefined ? MG_SEL[k] : (g.auto || (fulls.length === 1 ? fulls[0].name : ""));      // 最初から選んでおくのは、決まっているときだけ(迷うときは自分で選ぶ)
      return `<div class="mgcard" data-mgi="${i}"><div class="opts"><span class="tag">${esc(g.where)}</span> <b>ID ${g.ids.length} 体</b><span class="muted">${fmtN(g.hits)} 回</span>
        <span>${g.skills.map(([s, n]) => `<span class="mgsk${g.named.includes(s) ? "" : " dim"}">${esc(s)} ×${n}</span>`).join("")}</span></div>
        <div class="mgtabs">${g.cands.length ? g.cands.map((c) => `<button class="mgtab${c.name === sel ? " on" : ""}${c.name === g.auto ? " auto" : ""}" data-mgi="${i}" data-name="${esc(c.name)}" title="${c.seen ? "この場所で見かけたモンスター" : "この場所の出現モンスター一覧にある"}${c.known ? "" : "（使うスキルの情報はまだ無い）"}">${esc(c.name)}<small>${c.total ? `技 ${c.match}/${c.total}` : ""}${c.seen ? " ・見かけた" : ""}</small></button>`).join("") : `<span class="muted">候補がありません（下の欄に名前を入れてください）</span>`}</div>
        <div class="opts"><input class="mglink" data-mgi="${i}" list="mgnames" placeholder="ほかの名前を入れる" value="${esc(sel)}" style="width:18em">
          ${g.named.length ? `<label><input type="checkbox" data-mgrem="${i}"> 次からも自動（この場所でこの技）</label>` : ""}
          <button data-mgdo="${i}">紐付ける</button>${g.auto ? ` <span class="muted">（「${esc(g.auto)}」だけが全部の技に当てはまるので、自動で紐付けます）</span>` : ""}</div></div>`;
    }).join("")}</div>`;
}
function bindMobGroups() {
  const G = DATA.mob_groups || [], v = $("#view");
  v.querySelectorAll(".mgtab").forEach((b) => b.onclick = () => {
    const g = G[+b.dataset.mgi]; if (!g) return;
    MG_SEL[mgKey(g)] = b.dataset.name;
    const card = b.closest(".mgcard"); card.querySelectorAll(".mgtab").forEach((x) => x.classList.toggle("on", x === b));
    card.querySelector("input.mglink").value = b.dataset.name;
  });
  v.querySelectorAll("input.mglink").forEach((el) => el.oninput = () => { const g = G[+el.dataset.mgi]; if (g) MG_SEL[mgKey(g)] = el.value; });
  v.querySelectorAll("[data-mgdo]").forEach((b) => b.onclick = async () => {
    const g = G[+b.dataset.mgdo]; if (!g) return;
    const card = b.closest(".mgcard"), name = card.querySelector("input.mglink").value.trim();
    if (!name) { card.querySelector("input.mglink").focus(); return; }
    const rem = !!(card.querySelector("[data-mgrem]") || {}).checked;
    if (!(await askOnce("moblink", `「${g.where}」の名前が分からない相手 ${g.ids.length} 体（${g.named.slice(0, 3).join("・") || "技の手がかりなし"}）を、「${name}」にします。\n記録の名前が書きかわるので、元には戻せません。`, "紐付ける"))) return;
    await fetch("/api/moblink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ where: g.where, ids: g.ids, name, remember: rem, skills: g.named }) });
    delete MG_SEL[mgKey(g)]; load();
  });
  const on = $("#offon"), run = $("#offrun"), post = (b) => fetch("/api/official", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  if (on) on.onchange = async () => { await post({ enabled: on.checked }); load(); };
  if (run) run.onclick = async () => { run.disabled = true; await post({ run: 1 }); setTimeout(load, 1500); };
}
function dmgByGear(cs, w, W, G) {
  const groups = {};                      // 装備セットID -> {"相手|技": dmgMerge と同じ形の行, [10] = 最新のときの 装備+シャドウ の ID}
  for (const c of cs) for (const [id, d] of Object.entries(((DATA.chars[c] || {}).dmg_g || {})[w] || {})) {
    const known = !!((DATA.equip || {}).sets || {})[gearMain(id)];
    if (DMG_GEAR && gearMain(id) !== DMG_GEAR) continue;
    const gm = known || DMG_GEAR ? gearMain(id) : "_old";      // 装備セットのしくみになる前の記録(旧1, 旧2…)は、1つにまとめる
    const Gp = groups[gm] = groups[gm] || { rows: {}, full: id, last: 0 };
    for (const [k, v] of Object.entries(d)) {
      const x = Gp.rows[k] = Gp.rows[k] || [0, 0, 0, 0, 0, new Set(), 0, 0, 0, ""];
      if (v[7] && (v[3] >= x[3] || !x[8])) { x[8] = v[7]; x[9] = c; }
      if (v[3] >= Gp.last) { Gp.last = v[3]; Gp.full = id; }
      x[0] += v[0]; x[1] += v[1]; x[2] = Math.max(x[2], v[2]); x[3] = Math.max(x[3], v[3]); x[4] += v[4] || v[0]; x[5].add(c); x[6] += v[5] || 0; x[7] += v[6] || 0;
    }
  }
  const ids = Object.keys(groups).sort((a, b) => (a === "_old") - (b === "_old") || groups[b].last - groups[a].last);
  if (!ids.length) return dmgTable(W, !DMG_CHAR, 0, { md: w, gear: "" });
  let h = ids.map((gm) => {
    if (gm === "_old") return `<div class="dm-gear"><div class="dm-gh"><span class="tag">前の記録</span> <span class="muted">装備セットのしくみになる前の記録（まとめて表示）</span></div>${dmgTable(groups[gm].rows, !DMG_CHAR, 0, { md: w, gear: "" })}</div>`;
    const g = G[gm] || { letter: "?", p: {} }, p = g.p || {};
    return `<div class="dm-gear"><div class="dm-gh"><span class="tag ${g.color ? "stag" : ""}" ${g.color ? `style="background:${g.color}"` : ""}>${esc(g.letter)}</span> ${g.name ? `<b>${esc(g.name)}</b>` : ""}
      <span class="muted">${p.armor ? `${eleTag(p.armor)}鎧　` : ""}${Object.keys(p.res || {}).length ? "耐性 " + Object.entries(p.res).map(([e, v]) => `${eleTag(e)}${v}%`).join(" ") : ""}　最後 ${when(groups[gm].last)}</span></div>
      ${dmgTable(groups[gm].rows, !DMG_CHAR, 0, { md: w, gear: groups[gm].full })}</div>`;
  }).join("");
  if (!DMG_GEAR) {                         // 装備の記録が無いときの攻撃(前の版の記録や、装備がそろっていなかったとき)
    const seen = new Set(ids.flatMap((gm) => Object.keys(groups[gm].rows))), rest = Object.fromEntries(Object.entries(W).filter(([k]) => !seen.has(k)));
    if (Object.keys(rest).length) h += `<div class="dm-gear"><div class="dm-gh"><span class="tag">装備の記録なし</span></div>${dmgTable(rest, !DMG_CHAR, 0, { md: w, gear: "" })}</div>`;
  }
  return h;
}
let DMG_CHAR_AUTO = true;                 // キャラを自分で選ぶまでは、いまログインしているキャラを出す
function renderDmg(chars, now) {
  const withDmg = chars.filter((c) => Object.keys((DATA.chars[c] || {}).dmg || {}).length);
  if (DMG_CHAR_AUTO) { const nc = nowChar(); if (nc && withDmg.includes(nc)) DMG_CHAR = nc; }
  if (DMG_CHAR && !withDmg.includes(DMG_CHAR)) DMG_CHAR = "";
  const G = gearSets();
  // 選んでいるキャラ・場所で使った装備セット
  const usedGear = new Set();
  for (const c of DMG_CHAR ? [DMG_CHAR] : withDmg) for (const [w, g] of Object.entries((DATA.chars[c] || {}).dmg_g || {}))
    if (!DMG_MD || w === DMG_MD) Object.keys(g).forEach((id) => usedGear.add(gearMain(id)));
  if (DMG_GEAR && !usedGear.has(DMG_GEAR)) DMG_GEAR = "";
  const merged = dmgMerge(DMG_CHAR ? [DMG_CHAR] : withDmg, DMG_GEAR);
  const mds = Object.entries(merged).map(([w, W]) => [w, W, Math.max(...Object.values(W).map((v) => v[3]))]).sort((a, b) => b[2] - a[2]);
  if (DMG_MD && !merged[DMG_MD]) DMG_MD = "";
  let h = `<div class="opts"><label>キャラ <select id="dmc"><option value="">すべて</option>${withDmg.map((c) => `<option value="${esc(c)}" ${c === DMG_CHAR ? "selected" : ""}>${esc(cn(c))}</option>`).join("")}</select></label>
    <label>場所 <select id="dmm"><option value="">すべて</option>${mds.map(([w]) => `<option ${w === DMG_MD ? "selected" : ""}>${esc(w)}</option>`).join("")}</select></label>
    ${usedGear.size ? `<label>装備 <select id="dmgear"><option value="">すべて</option>${[...usedGear].filter((id) => G[id]).sort((a, b) => G[a].letter.localeCompare(G[b].letter, undefined, { numeric: true })).map((id) => `<option value="${esc(id)}" ${id === DMG_GEAR ? "selected" : ""}>${G[id].letter}: ${esc(G[id].name ? G[id].name + "（" + gearText(G[id].p) + "）" : gearText(G[id].p))}</option>`).join("")}</select></label>` : ""}
    ${typeof LOCAL !== "undefined" && LOCAL ? `<button class="ghost" id="dmclear">${DMG_CHAR ? esc(cn(DMG_CHAR)) + " の" : "全部の"}記録を消す</button>` : ""}</div>`;
  h = officialHtml() + h;          // 名前が分からない攻撃者(mobGroupsHtml)は、表のいちばん下に出す
  if (!mds.length) {
    h += `<div class="panel empty">まだ被ダメの記録がありません。<br>Fox_MD_Tracker v2.0.0 以上を起動したまま狩りをすると、受けた攻撃がここにたまります。</div>`;
    $("#view").innerHTML = h + mobGroupsHtml() + skillFixHtml(); bindDmg(); return;
  }
  for (const [w, W] of mds) {
    if (DMG_MD && w !== DMG_MD) continue;
    const E = resistMatch(RZ.entries, "", w) || resistFind(RZ.entries, w);
    h += `<div class="panel dm-box"><div class="dm-h"><b>${esc(w)}</b><span class="muted">${Object.keys(W).length}種類・装備セットごと・最大ダメージ順</span>${E ? `<a href="#" class="dm-rz" data-rzn="${esc(E.name)}">耐性を見る</a>` : ""}</div>${dmgMix(W)}${statusHtml(DMG_CHAR ? [DMG_CHAR] : withDmg, w)}${dmgByGear(DMG_CHAR ? [DMG_CHAR] : withDmg, w, W, G)}</div>`;
  }
  const rec = (DATA.dmg_recent || []).filter((r) => (!DMG_CHAR || r.char === DMG_CHAR) && (!DMG_MD || r.md === DMG_MD) && (!DMG_GEAR || gearMain(r.gear) === DMG_GEAR)).slice(-60).reverse();
  if (usedGear.size) {
    h += `<h2>装備セット</h2><div class="panel list">${[...usedGear].filter((id) => G[id]).sort((a, b) => G[a].letter.localeCompare(G[b].letter, undefined, { numeric: true })).map((id) =>
      `<div class="row"><span class="tag ${G[id].color ? "stag" : ""}" ${G[id].color ? `style="background:${G[id].color}"` : ""}>${esc(G[id].letter)}</span><span class="nm">${G[id].name ? `<b>${esc(G[id].name)}</b>　` : ""}${eleTag(G[id].p.armor)}鎧　耐性 ${Object.entries(G[id].p.res || {}).map(([e, v]) => `${eleTag(e)}${v}%`).join(" ") || "なし"}　DEF ${G[id].p.def.join("+")}　MDEF ${G[id].p.mdef.join("+")}</span><span class="muted">${fmtN(G[id].n)}回 ・ 最後 ${when(G[id].last)}</span></div>`).join("")}</div>
      <p class="hint">攻撃を受けたときの装備です。上の「装備」で選ぶと、その装備のときの被ダメだけを見られます（装備を比べるとき用）。DEF・MDEFは通信の値。鎧の属性と耐性は、着ている装備・カード・エンチャント・ランダムオプションから出した目安です（セット効果・精錬などの条件つきの効果、スキルや薬・属性付与などの一時的な効果は入りません）。</p>`;
  }
  if (rec.length) {
    h += `<h2>最近受けた攻撃</h2><div class="panel tablewrap"><table class="dm-t"><thead><tr><th>時刻</th><th class="l">キャラ</th><th class="l">場所</th><th class="l">相手</th><th class="l">技</th><th class="l">種類</th><th class="l">属性</th><th>ダメージ</th><th>装備</th><th></th></tr></thead><tbody>`;
    for (const r of rec) h += `<tr><td class="muted">${when(r.t)}</td><td class="l">${esc(cn(r.char))}</td><td class="l muted">${esc(r.md)}</td><td class="l">${esc(r.src)}${mobTag(r.src)}</td><td class="l">${esc(r.skill)}${r.lv > 0 ? ` <span class="muted">Lv${r.lv}</span>` : ""}</td><td class="l">${kindTag(r.kind ?? kindOf(r.skill)[0], r.est ? `距離${r.dist}セルから` : "")}</td><td class="l">${eleTag(r.ele ?? kindOf(r.skill)[1])}</td><td>${fmtN(r.dmg)}${r.hits > 1 ? ` <span class="muted">(${r.hits}ヒット)</span>` : ""}${r.crit ? ' <span class="tag">クリ</span>' : ""}</td><td>${gearTag(G, r.gear)}</td><td>${typeof LOCAL !== "undefined" && LOCAL ? `<button class="ghost simgo" data-simgo="${esc(JSON.stringify([r.char, r.md, r.src, r.skill]))}" title="この攻撃を選んだ状態で、計算機の「被ダメシミュ」を開きます（別の装備なら耐えられたか）">検証</button>` : ""}</td></tr>`;
    h += `</tbody></table></div>`;
  }
  h += `<p class="hint">自分のキャラが受けたダメージだけを、通信から記録しています（耐性で減ったあとの数字）。相手の名前は画面に出てきたときの名前（横の「人間・大型 闇4」などはラトリオのモンスターデータ。マウスを乗せると Lv・HP）、技の名前はラトリオのデータから。種類（物理・魔法など）と属性は通信に入っていないので、技の番号からスキルのデータ（rAthena）で出しています。モンスターの通常攻撃は物理・無属性。物理の近接/遠距離は当たったときの距離（3セルより遠いと遠距離）で決まるので、技だけで決まらないものは位置の通信から出した距離で決めています（<sup>*</sup>付き＝距離からの推定。ずれることもあります）。位置がわからなかったものは「物理」と出ます。状態変化で属性が変わっているときは反映されません。「受けた状態異常」は自分の頭の上のアイコンから数えていて、なる直前（3秒以内）に受けた技を原因としています（マウスを乗せると原因の内訳）。「ダメージの無い技」は脱衣・クァグマイアなど、自分に使われたけどダメージが無かった技です。</p>`;
  $("#view").innerHTML = h + mobGroupsHtml() + skillFixHtml();
  bindDmg();
}
// 受けたスキルの一覧。名前がわからない技(「スキル123」)に名前を付けられる(この PC で見ているときだけ)
let SK_ALL = false;
const SK_KINDS = ["物理", "物理・近接", "物理・遠距離", "魔法", "固定"];
const SK_ELES = ["無", "水", "地", "火", "風", "毒", "聖", "闇", "念", "不死", "属性なし"];
function skillFixHtml() {
  const list = DATA.dmg_skills;
  if (!list || !list.length || typeof LOCAL === "undefined" || !LOCAL) return "";
  const unk = list.filter((r) => !r.known).length;
  const rows = SK_ALL ? list : list.filter((r) => !r.known || r.fixed || Object.keys(r.efix || {}).length);
  let h = `<h2>受けた技の一覧（名前の手直し）</h2>
    <div class="opts"><span>${list.length}種類のうち、名前がわからない技 <b>${unk}</b>種類</span>
    <label><input type="checkbox" id="skall" ${SK_ALL ? "checked" : ""}> 名前がわかっている技も出す</label></div>`;
  if (!rows.length) return h + `<div class="panel empty">名前がわからない技はいまのところありません。</div>`;
  h += `<div class="panel tablewrap"><table class="dm-t"><thead><tr><th class="l">番号</th><th class="l">名前（入力して Enter で保存・空にすると元に戻す）</th><th class="l">元のデータ</th><th class="l">種類</th><th class="l">属性</th><th>回数</th><th>最大</th><th class="l">相手</th><th class="l">最後に受けた場所</th><th>最後</th></tr></thead><tbody>`;
  for (const r of rows) {
    h += `<tr class="${r.known ? "" : "sk-unk"}"><td class="l">${r.id}</td>
      <td class="l"><input class="skfix" data-sk="${r.id}" value="${esc(r.fixed || r.known ? r.name : "")}" placeholder="${esc(r.name)}"></td>
      <td class="l muted">${esc(r.base || "（なし）")}</td>
      <td class="l"><select class="skattr" data-sk="${r.id}" data-k="kind">${[["", `自動（${r.akind || "不明"}）`], ...SK_KINDS.map((x) => [x, x])].map(([v, l]) => `<option value="${esc(v)}" ${(r.efix.kind || "") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></td>
      <td class="l"><select class="skattr" data-sk="${r.id}" data-k="ele">${[["", `自動（${r.aele || "不明"}）`], ...SK_ELES.map((x) => [x, x])].map(([v, l]) => `<option value="${esc(v)}" ${(r.efix.ele || "") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></td>
      <td>${fmtN(r.n)}</td><td>${fmtN(r.max)}</td>
      <td class="l">${esc(r.src || "")}${r.lv > 0 ? ` <span class="muted">Lv${r.lv}</span>` : ""}</td><td class="l muted">${esc(r.where || "")}</td><td class="muted">${r.last ? when(r.last) : ""}</td></tr>`;
  }
  h += `</tbody></table></div><p class="hint">名前を付けると、これまでの記録の名前も付けかわります。種類・属性がデータと違っていたら（モンスターの技はサーバーごとに違うことがあります）、ここで選んで直せます。付けた名前・直した種類と属性はフォルダの「スキル名の手直し.json」に、通信の中身は「被ダメ_確認用データ.json」にたまります（名前や数字がおかしいときは、この2つを見せてもらえると直せます）。</p>`;
  return h;
}
function bindSkillFix() {
  const a = $("#skall");
  if (a) a.onchange = () => { SK_ALL = a.checked; render(); };
  $("#view").querySelectorAll("input.skfix").forEach((el) => {
    const save = async () => {
      if (el.value === el.defaultValue) return;
      try {
        const r = await fetch("/api/skillname", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: +el.dataset.sk, name: el.value.trim() }) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        el.defaultValue = el.value; el.classList.add("saved");
        setTimeout(() => load(), 300);
      } catch (e) { alert("保存できませんでした: " + e.message); }
    };
    el.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } };
    el.onchange = save;
  });
  // 種類・属性を手で直す(データと違ったとき)
  $("#view").querySelectorAll("select.skattr").forEach((el) => el.onchange = async () => {
    try {
      const r = await fetch("/api/skillname", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: +el.dataset.sk, [el.dataset.k]: el.value }) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      load();
    } catch (e) { alert("保存できませんでした: " + e.message); }
  });
}
function bindDmg() {
  bindSkillFix();
  bindMobGroups();
  const c = $("#dmc"), m = $("#dmm"), x = $("#dmclear");
  if (c) c.onchange = () => { DMG_CHAR = c.value; DMG_CHAR_AUTO = false; render(); };
  if (m) m.onchange = () => { DMG_MD = m.value; render(); };
  const g = $("#dmgear");
  if (g) g.onchange = () => { DMG_GEAR = g.value; render(); };
  if (x) x.onclick = async () => {
    if (x.dataset.ok !== "1") { x.dataset.ok = "1"; x.textContent = "本当に消す？"; return; }
    await fetch("/api/dmg" + (DMG_CHAR ? "?char=" + encodeURIComponent(DMG_CHAR) : ""), { method: "DELETE" });
    load();
  };
  $("#view").querySelectorAll(".dm-rz").forEach((a) => a.onclick = (e) => { e.preventDefault(); goResist(a.dataset.rzn); });
}
