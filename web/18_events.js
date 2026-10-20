"use strict";
// ---------- イベント ----------
// ツールがゲームのデータ(アイコンがイベント用 ico_ev)から見分けて、キャラごとに ev: {ID: [イベント名, 種類]} で送ってくる
function eventIds() {
  const s = new Set();
  for (const c of Object.values(DATA.chars || {})) for (const id of Object.keys(c.ev || {})) s.add(id);
  return s;
}
function eventGroups(chars) {
  const G = new Map();
  for (const c of chars) {
    const ch = DATA.chars[c] || {}, q = ch.quests || {};
    for (const [id, [g, kind]] of Object.entries(ch.ev || {})) {
      if (!(id in q)) continue;
      let E = G.get(g);
      if (!E) { E = { name: g, rows: new Map(), chars: new Set() }; G.set(g, E); }
      const t = (DATA.titles || {})[id] || `クエスト${id}`;
      const done = t.startsWith("【報告済】");
      const title = done ? t.slice(5) : t;
      let R = E.rows.get(title);
      if (!R) { R = { title, kind: done ? "" : kind, cells: {} }; E.rows.set(title, R); }
      if (!done && kind) R.kind = kind;
      const prev = R.cells[c];
      // 同じ名前で「受けてる」と「報告済」の両方があったら報告済を優先
      if (!prev || done) R.cells[c] = { end: q[id] || 0, done };
      E.chars.add(c);
    }
  }
  const nyar = (n) => /ニャル様/.test(n) ? 1 : 0;
  return [...G.values()].sort((a, b) => (nyar(a.name) - nyar(b.name)) || (b.chars.size - a.chars.size) || a.name.localeCompare(b.name, "ja"));
}
let EV_OPEN = (() => { try { return JSON.parse(store.get("md_evopen") || "{}"); } catch { return {}; } })();
function renderEvents(chars, now) {
  const evs = eventGroups(chars);
  if (!evs.length) {
    const anyEv = Object.values(DATA.chars || {}).some((c) => c.ev);
    $("#view").innerHTML = `<div class="panel empty">${anyEv ? "いま受けているイベントのクエストはありません。" :
      "まだイベントの記録がありません。<br>Fox_MD_Trackerを起動したままROにログインすると出ます。"}</div>`;
    return;
  }
  let h = `<div class="opts"><span>イベント用のクエスト（クエストウィンドウの「イベント」アイコンのもの）をイベントごとにまとめています。終わったイベントは、各キャラのログイン時に自動で消えます。</span></div>`;
  for (const E of evs) {
    const cs = chars.filter((c) => E.chars.has(c));
    const open = EV_OPEN[E.name] ?? !/ニャル様/.test(E.name);
    const rows = [...E.rows.values()].sort((a, b) => a.title.localeCompare(b.title, "ja", { numeric: true }));
    h += `<details class="panel evbox" data-ev="${esc(E.name)}" ${open ? "open" : ""}><summary><b>${esc(E.name)}</b>
      <span class="evmeta">${rows.length}クエスト・${cs.length}キャラ</span></summary>`;
    if (/ニャル様/.test(E.name)) h += `<p class="hint" style="margin:6px 12px">回数や報告の状況は「ニャル様」タブのほうが見やすいよ。</p>`;
    h += `<div class="tablewrap"><table><thead><tr><th class="char evq">クエスト</th><th>種類</th>`;
    for (const c of cs) h += `<th title="${esc(cn(c))}">${esc(cn(c))}</th>`;
    h += `</tr></thead><tbody>`;
    for (const R of rows) {
      const short = R.title.startsWith(E.name) && R.title.length > E.name.length + 1 ? R.title.slice(E.name.length).replace(/^[\s　：:]+/, "") : R.title;
      h += `<tr><td class="char evq" title="${esc(R.title)}">${esc(short)}</td><td class="evk">${esc(R.kind || "")}</td>`;
      for (const c of cs) {
        const x = R.cells[c];
        if (!x) h += `<td class="cell none">ー</td>`;
        else if (x.done) h += `<td class="cell okc">報告済</td>`;
        else if (x.end > now) h += `<td class="cell ${x.end - now < 3 * 3600 ? "soon" : "wait"}">${remain(x.end - now)}<span class="when">${when(x.end)}</span></td>`;
        else if (x.end > 0) h += `<td class="cell okc">●</td>`;
        else h += `<td class="cell evon">受注中</td>`;
      }
      h += `</tr>`;
    }
    h += `</tbody></table></div></details>`;
  }
  h += `<p class="hint">受注中 = クエストを受けている ／ 報告済 = 報告まで終わった ／ 時間 = 期限やCTの残り ／ ● = CTが明けた ／ ー = 受けていない</p>`;
  $("#view").innerHTML = h;
  for (const d of document.querySelectorAll("details.evbox")) d.ontoggle = () => {
    EV_OPEN[d.dataset.ev] = d.open; store.set("md_evopen", JSON.stringify(EV_OPEN));
  };
}
