"use strict";
// ---------- ファンシーパーティー(イベントタブのサブタブ「ファンシー」) ----------
// 納品物の数を、表に出ているキャラの持ち物 + そのアカウントの倉庫(インベントリと同じ /api/inv)から数える。
// 一覧は 23rd アニバーサリー公式の「ファンシーパーティー」納品(全23ミッション)。24th の発表で変わったら FANCY を差しかえる。
// ミッションの「納品した」印はこの PC の画面だけに覚える(md_fancy_done)。
const FANCY = [[1, [["ニンジン", 20, 515], ["赤いきのこワイン", 2, 12076], ["チーズ", 10, 548], ["穀物", 10, 577]]], [2, [["バジル", 1, 22985], ["いも", 10, 516], ["ぴしゃりハーブ", 5, 12814]]], [3, [["美味しいお肉", 10, 11616], ["料理用鉄串", 15, 6250]]], [4, [["アサイーの実", 20, 11516], ["モーラオレンジ", 5, 11520], ["吸血植物の種", 5, 6211], ["赤いトゲの実", 5, 587], ["トゲの実", 10, 576], ["ピンギキュラの果実ジャム", 3, 12344]]], [5, [["エビ", 10, 567], ["レモン", 5, 568], ["冷たい出汁", 20, 6262], ["レッドチリ", 10, 7286], ["緑ハーブ", 20, 511], ["ココナッツの実", 3, 6263], ["素麺", 20, 6261]]], [6, [["穀物", 20, 577], ["レモン", 10, 568], ["スルメイカパック", 1, 12638], ["エビ", 10, 567], ["貝のむきみ", 5, 966]]], [7, [["いも", 20, 516], ["さわやかな液体", 15, 1001085], ["ミルク", 20, 519], ["ビタタ500", 5, 12436], ["海洋深層水", 10, 6573]]], [8, [["ドラゴンの鱗", 10, 1036], ["小さい竜の骨", 10, 25766], ["ドラゴンの皮", 10, 7123], ["ドラゴンの尻尾", 10, 1037], ["ドラゴンの牙", 10, 1035], ["竜のたてがみ", 5, 6073], ["蛍光色の液体", 15, 7326], ["緑ハーブ", 15, 511], ["龍の歯", 15, 7266], ["龍の角", 5, 7265]]], [9, [["放電する触角", 2, 6574], ["ハーピーの羽", 15, 7115]]], [10, [["貝のむきみ", 10, 966], ["鍋", 10, 7482], ["モロク果実酒", 1, 12049], ["食用油", 20, 7457]]], [11, [["レッドチリ", 10, 7286], ["美味しいお肉", 20, 11616], ["マステラ酒", 1, 12050], ["黄色い香辛料", 10, 7452], ["赤い香辛料", 10, 7456]]], [12, [["チーズ", 10, 548], ["美味しいお肉", 10, 11616], ["食用油", 5, 7457], ["バジル", 1, 22985], ["白い皿", 10, 736], ["カラピー", 10, 1000824], ["レモン", 5, 568], ["軟らかい草の葉", 10, 7194]]], [13, [["オレンジ", 10, 582], ["リンゴ", 20, 512], ["とてもかたい桃", 10, 7164], ["ブドウ", 5, 514], ["まだ熟してないリンゴ", 1, 619], ["モロク果実酒", 1, 12049]]], [14, [["いも", 20, 516], ["まかじき", 1, 6049], ["おいしい魚", 30, 579], ["青魚", 10, 6096], ["卵", 1, 574], ["グリーンピタヤの尻尾", 1, 1000096], ["イエローピタヤの尻尾", 1, 1000094], ["パープルピタヤの尻尾", 1, 1000097], ["ブルーピタヤの尻尾", 1, 1000095], ["レッドピタヤの尻尾", 1, 1000093]]], [15, [["ぴしゃりハーブ", 5, 12814], ["ドロセラの触手", 5, 6259], ["ニンジン", 10, 515], ["アロエの葉", 15, 521]]], [16, [["にく", 25, 517], ["美味しいお肉", 10, 11616], ["レッドチリ", 10, 7286], ["さわやかな液体", 15, 1001085], ["食用油", 10, 7457], ["黒い杓子", 10, 737]]], [17, [["魚の尻尾", 50, 1023], ["深海のズワイガニ", 10, 25896], ["深海のエッセンス", 10, 25899], ["オレンジ", 30, 582]]], [18, [["パン", 15, 580], ["新鮮なサラダ", 2, 6112], ["柔らかい羽毛", 15, 7063], ["すこし塩辛いぷにぷに蛍光細胞", 15, 1001232], ["闇のルーン", 10, 7511]]], [19, [["にく", 20, 517], ["燃えた木", 5, 7068], ["パン", 15, 580], ["ミルク", 10, 519], ["ニンジン", 10, 515]]], [20, [["思念体の血", 10, 25128], ["思念体の心臓", 10, 25131], ["思念体の爪", 10, 25129], ["思念体の髪", 10, 25127], ["思念体の髑髏", 10, 25130], ["ミルク", 20, 519]]], [21, [["マンドラゴラの鉢植え", 10, 6217], ["ニンジン", 20, 515], ["美味しいお肉", 10, 11616], ["にく", 20, 517]]], [22, [["パン", 15, 580], ["穀物", 15, 577], ["食用油", 10, 7457], ["チーズ", 10, 548], ["バジル", 1, 22985], ["食用キノコ", 10, 581]]], [23, [["白い皿", 3, 736], ["ひとくちケーキ", 10, 539], ["フルーツバスケット", 5, 12573]]]];      // [ミッション, [[品の名前, 個数, 番号(id2name.json で名前から引いたもの)]]]
let FANCY_DONE = (() => { try { return JSON.parse(store.get("md_fancy_done") || "{}"); } catch { return {}; } })();
let FANCY_HIDE = store.get("md_fancy_hide") === "1";
const FANCY_ID = new Map(FANCY.flatMap(([, its]) => its.map(([nm, , id]) => [nm, id])));
function fancyId(nm, have) {      // 品の名前 → 番号(持っていればその番号、なければ一覧の番号)
  const e = have.get(nm);
  return (e && e.id) || FANCY_ID.get(nm) || "";
}
function fancyLinks(nm, have) {      // 入手先: 公式ツールのアイテムページ(落とすモンスター・マップ)と、露店の相場
  const id = fancyId(nm, have);
  return id ? `<a href="https://rotool.gungho.jp/item/${encodeURIComponent(id)}/" target="_blank" rel="noopener" title="RO公式ツールで、落とすモンスター・出るマップを見る">入手</a> <button class="ghost mk" data-mk="${id}" data-mkn="${esc(nm)}" title="公式ツールの露店の取引履歴(相場)を見る">相場</button>` : "";
}
function fancyCount(chars) {      // 品の名前 → {n: 合計, where: [[場所, 個数]]}
  const have = new Map(), seen = new Set();
  const add = (id, n, where) => {
    const nm = invName(id); let e = have.get(nm);
    if (!e) have.set(nm, e = { n: 0, where: [], id });
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
  h += `<details class="panel evbox" open><summary><b>まとめ（残りのミッションに必要な数）</b></summary><div class="tablewrap"><table class="invt"><thead><tr><th>納品物</th><th class="n">必要</th><th class="n">ある</th><th class="n">足りない</th><th></th></tr></thead><tbody>`;
  for (const [nm, n] of [...need].sort((a, b) => (Math.max(0, b[1] - got(b[0]).n) > 0) - (Math.max(0, a[1] - got(a[0]).n) > 0) || a[0].localeCompare(b[0], "ja"))) {
    const g = got(nm).n, lack = Math.max(0, n - g);
    h += `<tr><td title="${esc(tip(nm))}">${esc(nm)}</td><td class="n">${fmtN(n)}</td><td class="n" title="${esc(tip(nm))}">${fmtN(g)}</td><td class="n">${lack ? `<span class="warn">${fmtN(lack)}</span>` : `<span class="ok">✔</span>`}</td><td>${fancyLinks(nm, have)}</td></tr>`;
  }
  h += `</tbody></table></div></details>`;
  for (const [no, its] of FANCY) {
    const done = !!FANCY_DONE[no];
    if (done && FANCY_HIDE) continue;
    const ok = its.every(([nm, n]) => got(nm).n >= n);
    h += `<div class="panel" style="padding:8px 12px;${done ? "opacity:.55" : ""}"><label><input type="checkbox" data-fcdone="${no}" ${done ? "checked" : ""}> <b>ミッション${no}</b></label>
      <span class="muted" style="margin-left:8px">${done ? "納品した" : ok ? `<span class="ok">全部そろっています</span>` : "足りない品があります"}</span>
      <div class="tablewrap"><table class="invt"><tbody>${its.map(([nm, n]) => { const g = got(nm).n; return `<tr><td title="${esc(tip(nm))}">${esc(nm)}</td><td class="n">${fmtN(g)} / ${fmtN(n)}</td><td>${done ? "" : g >= n ? `<span class="ok">✔</span>` : `<span class="warn">あと ${fmtN(n - g)}</span>`}</td><td>${fancyLinks(nm, have)}</td></tr>`; }).join("")}</tbody></table></div></div>`;
  }
  h += `<p class="hint">「入手」はRO公式ツールのアイテムのページ（落とすモンスター・出るマップ）を開きます。NPC のお店で買える場所は公式ツールに載っていないので、ここには出せません。「相場」は露店の取引履歴です。数にカーソルを合わせると、どこに何個あるかが出ます。ミッションの印はこの PC の画面にだけ覚えます。倉庫は、ゲームで一度開いたものだけ数えます。</p>`;
  $("#view").innerHTML = h;
  document.querySelectorAll("#view [data-mk]").forEach((b) => b.onclick = () => mktOpen(b.dataset.mk, b.dataset.mkn));
  const hide = $("#fchide"); if (hide) hide.onchange = () => { FANCY_HIDE = hide.checked; store.set("md_fancy_hide", FANCY_HIDE ? "1" : "0"); render(); };
  document.querySelectorAll("[data-fcdone]").forEach((b) => b.onchange = () => {
    if (b.checked) FANCY_DONE[b.dataset.fcdone] = 1; else delete FANCY_DONE[b.dataset.fcdone];
    store.set("md_fancy_done", JSON.stringify(FANCY_DONE)); render();
  });
}
