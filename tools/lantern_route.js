// ---- 回る順: 公式ワールドマップの並び(GRID)で隣のマップを順にたどる。出発点から、いちばん近い(隣をたどって少ない)マップへ、を繰り返す ----
const STARTS = [["prontera", "プロンテラ"], ["izlude", "イズルード"], ["geffen", "ゲフェン"], ["payon", "フェイヨン"], ["morocc", "モロク"], ["alberta", "アルベルタ"], ["aldebaran", "アルデバラン"], ["yuno", "ジュノー"], ["einbroch", "アインブロック"], ["lighthalzen", "リヒタルゼン"], ["hugel", "フィゲル"], ["rachel", "ラヘル"], ["veins", "ベインス"], ["comodo", "コモド"], ["umbala", "ウンバラ"]];
const CELLS = {}, CELLOF = {}, ALIAS = {};
for (const id in GRID) { const g = GRID[id]; if (typeof g === "string") ALIAS[id] = g; else { CELLOF[id] = g; CELLS[g.join(":")] = id; } }
// 行き来の例外(利用者に教わったもの): CUT = マスは隣でも地続きでない(別のマップを経由する)・ADD = マスは隣でなくても行き来できる
const LINK_CUT = [["um_fild02", "um_fild04"], ["um_fild02", "comodo"]];      // ウンバラ2は、ウンバラ3の先(ウンバラ3 → 2 → 1 → 4 → ウンバラ)にある
const LINK_ADD = [["um_fild01", "um_fild04"]];
const CUTSET = new Set(), ADDS = {};
for (const l of LINK_CUT) { CUTSET.add(l[0] + "|" + l[1]); CUTSET.add(l[1] + "|" + l[0]); }
for (const l of LINK_ADD) { (ADDS[l[0]] = ADDS[l[0]] || []).push(l[1]); (ADDS[l[1]] = ADDS[l[1]] || []).push(l[0]); }
function nbrs(id) { const g = CELLOF[id], o = []; for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const n = CELLS[g[0] + ":" + (g[1] + d[0]) + ":" + (g[2] + d[1])]; if (n && !CUTSET.has(id + "|" + n)) o.push(n); } return o.concat(ADDS[id] || []); }
function bfs(from) { const d = {}; d[from] = 0; const q = [from]; for (let i = 0; i < q.length; i++) for (const n of nbrs(q[i])) if (!(n in d)) { d[n] = d[q[i]] + 1; q.push(n); } return d; }
// 町やフィールドの名前でない場所(城内・ギルド・空港など)を、いちばん近い町やマップに結びつける(座標はそのマップのものではないので、その町の最後に回す)
const NAME_TOWN = { "プロンテラ城内": "prontera", "プロンテラ聖堂内": "prontera", "プロンテラ中央宮": "prontera", "プロンテラ離宮": "prontera", "プロンテラ東図書館": "prontera", "王家の記憶の間": "prontera", "過去の王家の記憶の間": "prontera", "侵攻されたプロンテラ避難地": "prontera", "聖カピトリーナ修道院": "prt_monk",
  "モロク城内": "morocc", "アサシンギルド": "morocc", "シーフギルド": "morocc", "楽園団01": "morocc", "ジャワイ室内": "jawaii", "錬金術師ギルド": "aldebaran", "レッケンベル本社": "lighthalzen", "リヒタルゼン空港": "lighthalzen",
  "ウェルス発掘地": "yuno", "特殊警戒地域コル": "yuno", "実験棟-OPTATIO": "yuno", "研究棟-WISH": "yuno", "ウェルス中央広場": "yuno", "フレイヤ大神殿": "rachel", "フレイヤ大神殿室内": "rachel", "ナビ号船内": "malangdo",
  "連合軍駐屯地": "mid_camp", "連合軍駐屯地内部": "mid_camp", "スプレンディッド": "splendide", "スプレンディッド内部01": "splendide", "スプレンディッド内部02": "splendide", "マヌク": "manuk", "マヌク内部": "manuk", "エルディカスティス": "dicastes01", "エルディカスティス室内": "dicastes01", "モーラ": "mora", "エクラージュ": "eclage", "エクラージュ通路": "eclage", "エクラージュ内部": "eclage", "ラザーニャ": "eclage",
  "スプレンディットフィールド01": "spl_fild01", "スプレンディットフィールド02": "spl_fild02", "スプレンディットフィールド03": "spl_fild03", "カミダル山脈01": "dic_fild01", "カミダル山脈02": "dic_fild02", "カミダルトンネル": "dic_fild01",
  "ブラジリスフィールド": "bra_fild01", "デワタフィールド": "dew_fild01", "バリオ・マワヒガ": "ma_fild01", "沈没船付近の島": "alb2trea", "コモド小劇場": "comodo", "ゲフェン中央塔": "geffen", "教室棟A": "geffen", "教室棟B": "geffen", "教室棟ホール": "geffen", "エントランスホール": "geffen", "図書室（アカデミー）": "geffen",
  "ジュノー空港": "yuno", "空港": "einbroch", "アルベルタ船舶の中": "alberta", "次元の狭間03": "moc_fild20" };
function cellId(name) { let id = (DATA.ids[name] || [])[0]; id = ALIAS[id] || id; return id && CELLOF[id] ? id : null; }
function navName(it) { return it.e ? RAW.m[it.e[0]] : it.map; }
function navPos(it) { return it.e ? [it.e[1], it.e[2]] : [it.x, it.y]; }
function inNode(arr, from, to) {   // 同じマップの中: 前のマップがある側から入って、近い順
  const g = CELLOF[to], f = from ? CELLOF[from] : null; let px = 200, py = 200;
  if (f && f[0] === g[0] && (f[1] !== g[1] || f[2] !== g[2])) { const dr = g[1] - f[1], dc = g[2] - f[2]; if (Math.abs(dc) >= Math.abs(dr)) { px = dc > 0 ? 0 : 400; } else { py = dr > 0 ? 400 : 0; } }
  const rest = arr.slice(), o = [];
  while (rest.length) { let bi = 0, bd = 1e9; rest.forEach((it, i) => { const p = navPos(it), dd = (p[0] - px) * (p[0] - px) + (p[1] - py) * (p[1] - py); if (dd < bd) { bd = dd; bi = i; } }); const it = rest.splice(bi, 1)[0]; o.push(it); px = navPos(it)[0]; py = navPos(it)[1]; }
  return o;
}
function dmat(keys) {         // マップどうしの「歩く数」(隣をたどる数)。つながっていない所は、遠さ(+罰)で近い順に並ぶようにする
  const D = {};
  for (const a of keys) { const d = bfs(a); D[a] = {}; for (const b of keys) D[a][b] = b in d ? d[b] : 40 + Math.abs(CELLOF[a][1] - CELLOF[b][1]) + Math.abs(CELLOF[a][2] - CELLOF[b][2]) + (CELLOF[a][0] !== CELLOF[b][0] ? 30 : 0); }
  return D;
}
function pathCost(o, D) { let c = 0; for (let i = 1; i < o.length; i++) c += D[o[i - 1]][o[i]]; return c; }
function improve(order, D) {   // 往復をへらす: 入れ替え(2-opt)と、1つを別の場所へ移す(or-opt)を、よくならなくなるまで。先頭(出発)は動かさない
  let better = true, guard = 0;
  while (better && guard++ < 60) {
    better = false;
    for (let i = 1; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
      const a = order[i - 1], b = order[i], c = order[j], d = order[j + 1];
      const before = D[a][b] + (d ? D[c][d] : 0), after = D[a][c] + (d ? D[b][d] : 0);
      if (after < before) { const seg = order.slice(i, j + 1).reverse(); order.splice(i, j - i + 1, ...seg); better = true; }
    }
    for (let i = 1; i < order.length; i++) {
      const n = order[i], rest = order.slice(0, i).concat(order.slice(i + 1)); let bc = pathCost(order, D), bp = -1;
      for (let p = 1; p <= rest.length; p++) { const c = pathCost(rest.slice(0, p).concat([n], rest.slice(p)), D); if (c < bc) { bc = c; bp = p; } }
      if (bp >= 0) { const t = rest.slice(0, bp).concat([n], rest.slice(bp)); order.splice(0, order.length, ...t); better = true; }
    }
  }
  return order;
}
function routeSort(list) {
  const dir = {}, fb = {}, rest = [];
  for (const it of list) {
    const k = cellId(navName(it));
    if (k) { (dir[k] = dir[k] || []).push(it); continue; }
    const k2 = cellId(navName(it).replace(/(室内|内部)[0-9]*$/, "")) || NAME_TOWN[navName(it)] || null;      // 室内の名前から町を探す(座標は町のものではないので、その町の最後に)
    if (k2) (fb[k2] = fb[k2] || []).push(it); else rest.push(it);
  }
  const left = new Set(Object.keys(dir).concat(Object.keys(fb))), out = [], start = CELLOF[ST.start] ? ST.start : "prontera";
  const keys = [...new Set([start].concat([...left]))], D = dmat(keys);
  left.delete(start);
  let order = [start], cur = start;
  while (left.size) {                       // まず、いちばん近い所へ順に(欲張り)
    let best = null, bd = 1e9;
    for (const k of left) { if (D[cur][k] < bd) { bd = D[cur][k]; best = k; } }
    order.push(best); left.delete(best); cur = best;
  }
  order = improve(order, D);                // そのうえで、往復をへらす
  let prev = null;
  for (let i = 0; i < order.length; i++) {
    const k = order[i]; if (i === 0 && !dir[k] && !fb[k]) { prev = k; continue; }
    const from = i === 0 ? null : order[i - 1];
    for (const it of inNode(dir[k] || [], from, k)) out.push(it);
    for (const it of (fb[k] || []).sort((a, b) => a.n - b.n)) out.push(it);
    prev = k;
  }
  const first = {}; for (const it of rest) if (!(it.map in first) || it.n < first[it.map]) first[it.map] = it.n;      // 残り(隣が分からない所)は、同じマップをまとめて、番号の早い順
  return out.concat(rest.sort((a, b) => first[a.map] - first[b.map] || a.n - b.n));
}
function orderCtl() {
  return '<select id="order"><option value="n"' + (ST.order === "n" ? " selected" : "") + '>番号順</option><option value="route"' + (ST.order === "route" ? " selected" : "") + '>回る順(隣のマップへ)</option></select>'
    + (ST.order === "route" ? '<label>出発: <select id="start">' + STARTS.map((s) => '<option value="' + s[0] + '"' + (ST.start === s[0] ? " selected" : "") + '>' + s[1] + '</option>').join("") + '</select></label>' : "");
}
