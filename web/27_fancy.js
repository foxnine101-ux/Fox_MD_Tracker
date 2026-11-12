"use strict";
// ---------- ファンシーパーティー(イベントタブのサブタブ「ファンシー」) ----------
// 納品物の数を、表に出ているキャラの持ち物 + そのアカウントの倉庫(インベントリと同じ /api/inv)から数える。
// 一覧は 23rd アニバーサリー公式の「ファンシーパーティー」納品(全23ミッション)。24th の発表で変わったら FANCY を差しかえる。
// ミッションの「納品した」印はこの PC の画面だけに覚える(md_fancy_done)。
const FANCY = [[1, [["ニンジン", 20], ["赤いきのこワイン", 2], ["チーズ", 10], ["穀物", 10]]], [2, [["バジル", 1], ["いも", 10], ["ぴしゃりハーブ", 5]]], [3, [["美味しいお肉", 10], ["料理用鉄串", 15]]], [4, [["アサイーの実", 20], ["モーラオレンジ", 5], ["吸血植物の種", 5], ["赤いトゲの実", 5], ["トゲの実", 10], ["ピンギキュラの果実ジャム", 3]]], [5, [["エビ", 10], ["レモン", 5], ["冷たい出汁", 20], ["レッドチリ", 10], ["緑ハーブ", 20], ["ココナッツの実", 3], ["素麺", 20]]], [6, [["穀物", 20], ["レモン", 10], ["スルメイカパック", 1], ["エビ", 10], ["貝のむきみ", 5]]], [7, [["いも", 20], ["さわやかな液体", 15], ["ミルク", 20], ["ビタタ500", 5], ["海洋深層水", 10]]], [8, [["ドラゴンの鱗", 10], ["小さい竜の骨", 10], ["ドラゴンの皮", 10], ["ドラゴンの尻尾", 10], ["ドラゴンの牙", 10], ["竜のたてがみ", 5], ["蛍光色の液体", 15], ["緑ハーブ", 15], ["龍の歯", 15], ["龍の角", 5]]], [9, [["放電する触角", 2], ["ハーピーの羽", 15]]], [10, [["貝のむきみ", 10], ["鍋", 10], ["モロク果実酒", 1], ["食用油", 20]]], [11, [["レッドチリ", 10], ["美味しいお肉", 20], ["マステラ酒", 1], ["黄色い香辛料", 10], ["赤い香辛料", 10]]], [12, [["チーズ", 10], ["美味しいお肉", 10], ["食用油", 5], ["バジル", 1], ["白い皿", 10], ["カラピー", 10], ["レモン", 5], ["軟らかい草の葉", 10]]], [13, [["オレンジ", 10], ["リンゴ", 20], ["とてもかたい桃", 10], ["ブドウ", 5], ["まだ熟してないリンゴ", 1], ["モロク果実酒", 1]]], [14, [["いも", 20], ["まかじき", 1], ["おいしい魚", 30], ["青魚", 10], ["卵", 1], ["グリーンピタヤの尻尾", 1], ["イエローピタヤの尻尾", 1], ["パープルピタヤの尻尾", 1], ["ブルーピタヤの尻尾", 1], ["レッドピタヤの尻尾", 1]]], [15, [["ぴしゃりハーブ", 5], ["ドロセラの触手", 5], ["ニンジン", 10], ["アロエの葉", 15]]], [16, [["にく", 25], ["美味しいお肉", 10], ["レッドチリ", 10], ["さわやかな液体", 15], ["食用油", 10], ["黒い杓子", 10]]], [17, [["魚の尻尾", 50], ["深海のズワイガニ", 10], ["深海のエッセンス", 10], ["オレンジ", 30]]], [18, [["パン", 15], ["新鮮なサラダ", 2], ["柔らかい羽毛", 15], ["すこし塩辛いぷにぷに蛍光細胞", 15], ["闇のルーン", 10]]], [19, [["にく", 20], ["燃えた木", 5], ["パン", 15], ["ミルク", 10], ["ニンジン", 10]]], [20, [["思念体の血", 10], ["思念体の心臓", 10], ["思念体の爪", 10], ["思念体の髪", 10], ["思念体の髑髏", 10], ["ミルク", 20]]], [21, [["マンドラゴラの鉢植え", 10], ["ニンジン", 20], ["美味しいお肉", 10], ["にく", 20]]], [22, [["パン", 15], ["穀物", 15], ["食用油", 10], ["チーズ", 10], ["バジル", 1], ["食用キノコ", 10]]], [23, [["白い皿", 3], ["ひとくちケーキ", 10], ["フルーツバスケット", 5]]]];
let FANCY_DONE = (() => { try { return JSON.parse(store.get("md_fancy_done") || "{}"); } catch { return {}; } })();
let FANCY_HIDE = store.get("md_fancy_hide") === "1";
function fancyCount(chars) {      // 品の名前 → {n: 合計, where: [[場所, 個数]]}
  const have = new Map(), seen = new Set();
  const add = (id, n, where) => {
    const nm = invName(id); let e = have.get(nm);
    if (!e) have.set(nm, e = { n: 0, where: [] });
    e.n += n; const w = e.where.find((x) => x[0] === where); if (w) w[1] += n; else e.where.push([where, n]);
  };
  for (const c of chars) {
    const C = (INV.chars || {})[c];
    if (C && C.has) for (const x of C.items || []) add(x.itemId, x.count || 0, `${cnU(c)}の持ち物`);
    for (const s of invStoreSlots(c)) {
      if (!s.st || seen.has(s.st.k)) continue;
      seen.add(s.st.k);
      for (const x of s.st.items || []) add(x.itemId, x.count || 0, s.label);
    }
  }
  return have;
}
function renderFancy(chars) {
  if (!INV || INV_T !== ((DATA && DATA.inv_t) || 0)) invLoad();
  if (!INV) { $("#view").innerHTML = `<div class="panel empty">読み込んでいます…</div>`; return; }
  const have = fancyCount(chars);
  const got = (nm) => (have.get(nm) || { n: 0, where: [] });
  const tip = (nm) => got(nm).where.map(([w, n]) => `${w} ×${fmtN(n)}`).join("\n") || "持ち物・倉庫に見当たりません";
  const left = FANCY.filter(([no]) => !FANCY_DONE[no]);
  const need = new Map();
  for (const [, its] of left) for (const [nm, n] of its) need.set(nm, (need.get(nm) || 0) + n);
  const short = [...need].filter(([nm, n]) => got(nm).n < n).length;
  let h = `<div class="opts"><span>ファンシーパーティーの納品物を、表に出ているキャラの持ち物と、そのアカウントの倉庫から数えます（インベントリタブと同じ記録。ゲームで持ち物・倉庫を開くと最新になります）。一覧は23rdの公式情報です。24thで変わったら直します。</span></div>`;
  h += `<div class="panel" style="padding:10px 12px"><b>残り ${left.length} / ${FANCY.length} ミッション</b>　納品物 ${need.size} 種類のうち <b class="${short ? "warn" : "ok"}">${short} 種類が足りません</b>
    <label style="margin-left:12px"><input type="checkbox" id="fchide" ${FANCY_HIDE ? "checked" : ""}> 納品したミッションを隠す</label></div>`;
  h += `<details class="panel evbox" open><summary><b>まとめ（残りのミッションに必要な数）</b></summary><div class="tablewrap"><table class="invt"><thead><tr><th>納品物</th><th class="n">必要</th><th class="n">ある</th><th class="n">足りない</th></tr></thead><tbody>`;
  for (const [nm, n] of [...need].sort((a, b) => (Math.max(0, b[1] - got(b[0]).n) > 0) - (Math.max(0, a[1] - got(a[0]).n) > 0) || a[0].localeCompare(b[0], "ja"))) {
    const g = got(nm).n, lack = Math.max(0, n - g);
    h += `<tr><td title="${esc(tip(nm))}">${esc(nm)}</td><td class="n">${fmtN(n)}</td><td class="n" title="${esc(tip(nm))}">${fmtN(g)}</td><td class="n">${lack ? `<span class="warn">${fmtN(lack)}</span>` : `<span class="ok">✔</span>`}</td></tr>`;
  }
  h += `</tbody></table></div></details>`;
  for (const [no, its] of FANCY) {
    const done = !!FANCY_DONE[no];
    if (done && FANCY_HIDE) continue;
    const ok = its.every(([nm, n]) => got(nm).n >= n);
    h += `<div class="panel" style="padding:8px 12px;${done ? "opacity:.55" : ""}"><label><input type="checkbox" data-fcdone="${no}" ${done ? "checked" : ""}> <b>ミッション${no}</b></label>
      <span class="muted" style="margin-left:8px">${done ? "納品した" : ok ? `<span class="ok">全部そろっています</span>` : "足りない品があります"}</span>
      <div class="tablewrap"><table class="invt"><tbody>${its.map(([nm, n]) => { const g = got(nm).n; return `<tr><td title="${esc(tip(nm))}">${esc(nm)}</td><td class="n">${fmtN(g)} / ${fmtN(n)}</td><td>${done ? "" : g >= n ? `<span class="ok">✔</span>` : `<span class="warn">あと ${fmtN(n - g)}</span>`}</td></tr>`; }).join("")}</tbody></table></div></div>`;
  }
  h += `<p class="hint">数にカーソルを合わせると、どこに何個あるかが出ます。ミッションの印はこの PC の画面にだけ覚えます。倉庫は、ゲームで一度開いたものだけ数えます。</p>`;
  $("#view").innerHTML = h;
  const hide = $("#fchide"); if (hide) hide.onchange = () => { FANCY_HIDE = hide.checked; store.set("md_fancy_hide", FANCY_HIDE ? "1" : "0"); render(); };
  document.querySelectorAll("[data-fcdone]").forEach((b) => b.onchange = () => {
    if (b.checked) FANCY_DONE[b.dataset.fcdone] = 1; else delete FANCY_DONE[b.dataset.fcdone];
    store.set("md_fancy_done", JSON.stringify(FANCY_DONE)); render();
  });
}
