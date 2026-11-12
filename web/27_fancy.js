"use strict";
// ---------- ファンシーパーティー(イベントタブのサブタブ「ファンシー」) ----------
// 納品物の数を、表に出ているキャラの持ち物 + そのアカウントの倉庫(インベントリと同じ /api/inv)から数える。
// 一覧は 23rd アニバーサリー公式の「ファンシーパーティー」納品(全23ミッション)。24th の発表で変わったら FANCY を差しかえる。
// 入手のめやす(4つ目)は、利用者からもらったまとめ表(2512アニバ「ファ納」)の書き方のまま。
// ミッションの「納品した」印はこの PC の画面だけに覚える(md_fancy_done)。
const FANCY = [[1, [["ニンジン", 20, 515, "イベントホール（消耗品）"], ["赤いきのこワイン", 2, 12076, "フェイヨン守護兵"], ["チーズ", 10, 548, "天邪仙人"], ["穀物", 10, 577, "イベントホール（消耗品）"]]], [2, [["バジル", 1, 22985, "スーベニアショップ（ファンシー 245,225）"], ["いも", 10, 516, "野菜商人"], ["ぴしゃりハーブ", 5, 12814, "ペタルなど／交換"]]], [3, [["美味しいお肉", 10, 11616, "イベントホール（ペット）"], ["料理用鉄串", 15, 6250, "錬金術師ギルド"]]], [4, [["アサイーの実", 20, 11516, "イベントホール（消耗品）"], ["モーラオレンジ", 5, 11520, "ミミミの報酬"], ["吸血植物の種", 5, 6211, "ジェネティックの製作"], ["赤いトゲの実", 5, 587, "ホドレムリンなど"], ["トゲの実", 10, 576, "ビホルダーなど"], ["ピンギキュラの果実ジャム", 3, 12344, "クエストの交換"]]], [5, [["エビ", 10, 567, "イベントホール（消耗品）"], ["レモン", 5, 568, "イベントホール（特殊用品）"], ["冷たい出汁", 20, 6262, "錬金術師ギルド"], ["レッドチリ", 10, 7286, "クラベン"], ["緑ハーブ", 20, 511, "緑色草など"], ["ココナッツの実", 3, 6263, "ガラパゴなど"], ["素麺", 20, 6261, "錬金術師ギルド"]]], [6, [["穀物", 20, 577, "イベントホール（消耗品）"], ["レモン", 10, 568, "イベントホール（特殊用品）"], ["スルメイカパック", 1, 12638, "缶詰の交換"], ["エビ", 10, 567, "イベントホール（消耗品）"], ["貝のむきみ", 5, 966, "深海のお化け貝など"]]], [7, [["いも", 20, 516, "野菜商人"], ["さわやかな液体", 15, 1001085, "変異キメラヴァニラクス"], ["ミルク", 20, 519, "イベントホール（消耗品）"], ["ビタタ500", 5, 12436, "ジェネティックの製作"], ["海洋深層水", 10, 6573, "ドフレ"]]], [8, [["ドラゴンの鱗", 10, 1036, "グラウンドデリーターなど"], ["小さい竜の骨", 10, 25766, "ボーンペロスなど"], ["ドラゴンの皮", 10, 7123, "グラウンドデリーターなど"], ["ドラゴンの尻尾", 10, 1037, "グラウンドデリーターなど"], ["ドラゴンの牙", 10, 1035, "グラウンドデリーターなど"], ["竜のたてがみ", 5, 6073, "ドラコ"], ["蛍光色の液体", 15, 7326, "アクアエレメンタルなど"], ["緑ハーブ", 15, 511, "緑色草など"], ["龍の歯", 15, 7266, "小龍舞"], ["龍の角", 5, 7265, "小龍舞"]]], [9, [["放電する触角", 2, 6574, "アンカーなど"], ["ハーピーの羽", 15, 7115, "ハーピー"]]], [10, [["貝のむきみ", 10, 966, "深海のお化け貝など"], ["鍋", 10, 7482, "SPエンチャ"], ["モロク果実酒", 1, 12049, "フェイヨン警備兵"], ["食用油", 20, 7457, "SPエンチャ"]]], [11, [["レッドチリ", 10, 7286, "クラベン"], ["美味しいお肉", 20, 11616, "イベントホール（ペット）"], ["マステラ酒", 1, 12050, "狂暴な警備犬"], ["黄色い香辛料", 10, 7452, "SPエンチャ"], ["赤い香辛料", 10, 7456, "SPエンチャ"]]], [12, [["チーズ", 10, 548, "天邪仙人"], ["美味しいお肉", 10, 11616, "イベントホール（ペット）"], ["食用油", 5, 7457, "SPエンチャ"], ["バジル", 1, 22985, "スーベニアショップ（ファンシー 245,225）"], ["白い皿", 10, 736, "プレゼント商人"], ["カラピー", 10, 1000824, "カラマリン"], ["レモン", 5, 568, "イベントホール（特殊用品）"], ["軟らかい草の葉", 10, 7194, "フェアリーフなど"]]], [13, [["オレンジ", 10, 582, "子デザートウルフなど"], ["リンゴ", 20, 512, "イベントホール（消耗品）"], ["とてもかたい桃", 10, 7164, "人面桃樹"], ["ブドウ", 5, 514, "ポポリンなど"], ["まだ熟してないリンゴ", 1, 619, "ポリン"], ["モロク果実酒", 1, 12049, "フェイヨン警備兵"]]], [14, [["いも", 20, 516, "野菜商人"], ["まかじき", 1, 6049, "釣り"], ["おいしい魚", 30, 579, "イベントホール（消耗品）"], ["青魚", 10, 6096, "イベントホール（ペット）"], ["卵", 1, 574, "ウッドゴブリン"], ["グリーンピタヤの尻尾", 1, 1000096, "ピタヤ"], ["イエローピタヤの尻尾", 1, 1000094, "ピタヤ"], ["パープルピタヤの尻尾", 1, 1000097, "ピタヤ"], ["ブルーピタヤの尻尾", 1, 1000095, "ピタヤ"], ["レッドピタヤの尻尾", 1, 1000093, "ピタヤ"]]], [15, [["ぴしゃりハーブ", 5, 12814, "ペタルなど／交換"], ["ドロセラの触手", 5, 6259, "ドロセラ"], ["ニンジン", 10, 515, "イベントホール（消耗品）"], ["アロエの葉", 15, 521, "老人参など"]]], [16, [["にく", 25, 517, "イベントホール（消耗品）"], ["美味しいお肉", 10, 11616, "イベントホール（ペット）"], ["レッドチリ", 10, 7286, "クラベン"], ["さわやかな液体", 15, 1001085, "変異キメラヴァニラクス"], ["食用油", 10, 7457, "SPエンチャ"], ["黒い杓子", 10, 737, "イベントホール（触媒）"]]], [17, [["魚の尻尾", 50, 1023, "フェンなど"], ["深海のズワイガニ", 10, 25896, "深海の半魚人"], ["深海のエッセンス", 10, 25899, "深海の半魚人など"], ["オレンジ", 30, 582, "子デザートウルフなど"]]], [18, [["パン", 15, 580, "SPエンチャ"], ["新鮮なサラダ", 2, 6112, "イベントホール（ペット）"], ["柔らかい羽毛", 15, 7063, "オウルデュークなど"], ["すこし塩辛いぷにぷに蛍光細胞", 15, 1001232, "天使ウミウシ"], ["闇のルーン", 10, 7511, "スケゴルトブラウンなど"]]], [19, [["にく", 20, 517, "イベントホール（消耗品）"], ["燃えた木", 5, 7068, "ヒートタートルなど"], ["パン", 15, 580, "SPエンチャ"], ["ミルク", 10, 519, "イベントホール（消耗品）"], ["ニンジン", 10, 515, "イベントホール（消耗品）"]]], [20, [["思念体の血", 10, 25128, "生体2"], ["思念体の心臓", 10, 25131, "生体5"], ["思念体の爪", 10, 25129, "生体3"], ["思念体の髪", 10, 25127, "生体1"], ["思念体の髑髏", 10, 25130, "生体4"], ["ミルク", 20, 519, "イベントホール（消耗品）"]]], [21, [["マンドラゴラの鉢植え", 10, 6217, "マスプキラーなど"], ["ニンジン", 20, 515, "イベントホール（消耗品）"], ["美味しいお肉", 10, 11616, "イベントホール（ペット）"], ["にく", 20, 517, "イベントホール（消耗品）"]]], [22, [["パン", 15, 580, "SPエンチャ"], ["穀物", 15, 577, "イベントホール（消耗品）"], ["食用油", 10, 7457, "SPエンチャ"], ["チーズ", 10, 548, "天邪仙人"], ["バジル", 1, 22985, "スーベニアショップ（ファンシー 245,225）"], ["食用キノコ", 10, 581, "SPエンチャ"]]], [23, [["白い皿", 3, 736, "プレゼント商人"], ["ひとくちケーキ", 10, 539, "ババヤガなど"], ["フルーツバスケット", 5, 12573, "ポムスパイダー"]]]];      // [ミッション, [[品の名前, 個数, 番号, 入手のめやす]]]
let FANCY_DONE = (() => { try { return JSON.parse(store.get("md_fancy_done") || "{}"); } catch { return {}; } })();
let FANCY_HIDE = store.get("md_fancy_hide") === "1";
const FANCY_ID = new Map(FANCY.flatMap(([, its]) => its.map(([nm, , id]) => [nm, id])));
const FANCY_HINT = new Map(FANCY.flatMap(([, its]) => its.map(([nm, , , w]) => [nm, w || ""])));
function fancyId(nm, have) {      // 品の名前 → 番号(持っていればその番号、なければ一覧の番号)
  const e = have.get(nm);
  return (e && e.id) || FANCY_ID.get(nm) || "";
}
function fancyLinks(nm, have) {      // 入手先: 公式ツールのアイテムページ(落とすモンスター・マップ)と、露店の相場
  const id = fancyId(nm, have);
  const w = FANCY_HINT.get(nm);
  return (w ? `<span class="muted">${esc(w)}</span> ` : "") + (id ? `<a href="https://rotool.gungho.jp/item/${encodeURIComponent(id)}/" target="_blank" rel="noopener" title="RO公式ツールで、落とすモンスター・出るマップを見る">入手</a> <button class="ghost mk" data-mk="${id}" data-mkn="${esc(nm)}" title="公式ツールの露店の取引履歴(相場)を見る">相場</button>` : "");
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
  h += `<details class="panel evbox" open><summary><b>まとめ（残りのミッションに必要な数）</b></summary><div class="tablewrap"><table class="invt"><thead><tr><th>納品物</th><th class="n">必要</th><th class="n">ある</th><th class="n">足りない</th><th>入手</th></tr></thead><tbody>`;
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
  h += `<p class="hint">入手のめやすは、まとめ表（2512アニバ）の書き方のままです（「イベントホール」「SPエンチャ」などは NPC・交換、ほかは落とすモンスターなど）。「入手」は RO公式ツールのページで、落とすモンスターと出るマップが見られます。「相場」は露店の取引履歴です。数にカーソルを合わせると、どこに何個あるかが出ます。ミッションの印はこの PC の画面にだけ覚えます。倉庫は、ゲームで一度開いたものだけ数えます。</p>`;
  $("#view").innerHTML = h;
  document.querySelectorAll("#view [data-mk]").forEach((b) => b.onclick = () => mktOpen(b.dataset.mk, b.dataset.mkn));
  const hide = $("#fchide"); if (hide) hide.onchange = () => { FANCY_HIDE = hide.checked; store.set("md_fancy_hide", FANCY_HIDE ? "1" : "0"); render(); };
  document.querySelectorAll("[data-fcdone]").forEach((b) => b.onchange = () => {
    if (b.checked) FANCY_DONE[b.dataset.fcdone] = 1; else delete FANCY_DONE[b.dataset.fcdone];
    store.set("md_fancy_done", JSON.stringify(FANCY_DONE)); render();
  });
}
