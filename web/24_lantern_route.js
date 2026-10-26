"use strict";
// ランタンの「回る順」(隣のマップをたどる並べ替え)。tools/make_app_route.py が tools/lantern_route.js から作る(直接は直さない)。
const LNTROUTE = (() => {
const GRID = {"sch_gld":[0,2,8],"yuno":[0,2,9],"hu_fild01":[0,2,11],"hu_fild02":[0,2,12],"hu_fild03":[0,2,13],"hugel":[0,2,14],"cave":[0,3,8],"ein_fild01":[0,3,9],"yuno_fild05":[0,3,10],"yuno_fild06":[0,3,11],"hu_fild04":[0,3,12],"hu_fild05":[0,3,13],"hu_fild06":[0,3,14],"ra_fild01":[0,4,4],"ein_fild02":[0,4,9],"yuno_fild04":[0,4,10],"yuno_fild03":[0,4,11],"yuno_fild02":[0,4,12],"hu_fild07":[0,4,13],"ra_fild02":[0,5,2],"ra_fild03":[0,5,3],"ra_fild04":[0,5,4],"ra_fild05":[0,5,5],"ra_fild06":[0,5,6],"ein_fild03":[0,5,7],"ein_fild04":[0,5,8],"ein_fild05":[0,5,9],"ein_fild06":[0,5,10],"yuno_fild07":[0,5,11],"yuno_fild08":[0,5,12],"yuno_fild09":[0,5,13],"yuno_fild10":[0,5,14],"ra_fild07":[0,6,2],"ra_temple":[0,6,3],"ra_fild08":[0,6,4],"ra_fild09":[0,6,5],"lhz_fild01":[0,6,6],"lhz_fild02":[0,6,7],"einbroch":[0,6,8],"einbech":[0,6,9],"ein_fild07":[0,6,10],"yuno_fild11":[0,6,11],"yuno_fild12":[0,6,12],"yuno_fild01":[0,6,13],"xmas":[0,6,15],"ra_fild10":[0,7,1],"ra_fild11":[0,7,2],"rachel":[0,7,3],"ra_fild12":[0,7,4],"lighthalzen":[0,7,6],"lhz_fild03":[0,7,7],"ein_fild08":[0,7,8],"ein_fild09":[0,7,9],"ein_fild10":[0,7,10],"alde_gld":[0,7,12],"aldebaran":[0,7,13],"xmas_fild01":[0,7,15],"ve_fild01":[0,8,2],"ve_fild02":[0,8,3],"ra_fild13":[0,8,4],"mjolnir_12":[0,8,13],"ve_fild03":[0,9,1],"ve_fild04":[0,9,2],"aru_gld":[0,9,3],"mjolnir_01":[0,9,9],"mjolnir_02":[0,9,10],"mjolnir_03":[0,9,11],"mjolnir_04":[0,9,12],"mjolnir_05":[0,9,13],"ve_fild05":[0,10,1],"ve_fild06":[0,10,2],"glast_01":[0,10,6],"gef_fild06":[0,10,7],"gef_fild05":[0,10,8],"gef_fild04":[0,10,9],"mjolnir_06":[0,10,10],"mjolnir_07":[0,10,11],"mjolnir_08":[0,10,12],"mjolnir_10":[0,10,13],"mjolnir_11":[0,10,14],"veins":[0,11,2],"gef_fild08":[0,11,7],"gef_fild07":[0,11,8],"geffen":[0,11,9],"gef_fild00":[0,11,10],"prt_fild00":[0,11,11],"mjolnir_09":[0,11,12],"prt_fild01":[0,11,13],"prt_fild02":[0,11,14],"prt_fild03":[0,11,15],"prt_monk":[0,11,16],"ve_fild07":[0,12,2],"gef_fild12":[0,12,7],"prt_gld":[0,12,13],"nameless_n":[0,13,1],"nif_fild01":[0,13,3],"nif_fild02":[0,13,4],"niflheim":[0,13,5],"gef_fild13":[0,13,8],"gef_fild09":[0,13,9],"gef_fild01":[0,13,10],"prt_fild04":[0,13,11],"prt_fild05":[0,13,12],"prontera":[0,13,13],"prt_fild06":[0,13,14],"izlu2dun":[0,13,16],"umbala":[0,14,6],"gef_fild14":[0,14,8],"gef_fild10":[0,14,9],"gef_fild03":[0,14,10],"gef_fild02":[0,14,11],"prt_fild07":[0,14,12],"prt_fild08":[0,14,13],"izlude":[0,14,14],"jawaii":[0,14,17],"ayothaya":[0,14,19],"ayo_fild01":[0,14,20],"ayo_fild02":[0,14,21],"um_fild04":[0,15,6],"gef_fild11":[0,15,9],"prt_fild11":[0,15,10],"prt_fild10":[0,15,11],"prt_fild09":[0,15,12],"moc_fild01":[0,15,13],"pay_fild04":[0,15,14],"pay_arche":[0,15,15],"malangdo":[0,15,18],"um_fild01":[0,16,5],"um_fild02":[0,16,6],"um_fild03":[0,16,7],"moc_ruins":[0,16,10],"moc_fild07":[0,16,11],"moc_fild02":[0,16,13],"pay_gld":[0,16,14],"payon":[0,16,15],"pay_fild08":[0,16,16],"pay_fild09":[0,16,17],"bra_fild01":[0,16,22],"comodo":[0,17,6],"cmd_fild01":[0,17,7],"cmd_fild03":[0,17,8],"cmd_fild05":[0,17,9],"moc_fild19":[0,17,10],"morocc":[0,17,11],"moc_fild20":[0,17,12],"moc_fild13":[0,17,13],"moc_fild03":[0,17,14],"pay_fild01":[0,17,15],"pay_fild07":[0,17,16],"pay_fild10":[0,17,17],"dew_fild01":[0,17,19],"dewata":[0,17,20],"brasilis":[0,17,22],"cmd_fild02":[0,18,7],"cmd_fild04":[0,18,8],"cmd_fild06":[0,18,9],"cmd_fild08":[0,18,10],"moc_fild12":[0,18,11],"moc_fild11":[0,18,12],"pay_fild11":[0,18,14],"pay_fild02":[0,18,15],"pay_fild03":[0,18,16],"alberta":[0,18,17],"moscovia":[0,18,23],"mosk_fild02":[0,18,24],"cmd_fild07":[0,19,9],"cmd_fild09":[0,19,10],"moc_fild18":[0,19,11],"moc_fild17":[0,19,12],"moc_fild16":[0,19,13],"pay_fild05":[0,19,15],"pay_fild06":[0,19,16],"alb2trea":[0,19,20],"tur_dun01":[0,20,17],"louyang":[0,20,19],"gon_fild01":[0,20,22],"gonryun":[0,20,23],"ama_fild01":[0,21,16],"lou_fild01":[0,21,19],"amatsu":[0,22,16],"ma_fild02":[0,22,22],"malaya":[0,23,21],"ma_fild01":[0,23,22],"ma_scene01":[0,24,22],"eclage":[1,1,3],"mora":[1,2,2],"ecl_fild01":[1,2,3],"bif_fild02":[1,3,3],"bif_fild01":[1,4,3],"spl_fild01":[1,4,4],"dicastes02":[1,4,9],"splendide":[1,5,3],"spl_fild02":[1,5,4],"mid_camp":[1,5,5],"man_fild01":[1,5,6],"man_fild02":[1,5,7],"dicastes01":[1,5,9],"spl_fild03":[1,6,4],"man_fild03":[1,6,6],"manuk":[1,6,7],"dic_fild01":[1,6,9],"dic_fild02":[1,7,9],"payon_p":"payon"};
const LINKS = [["alberta","pay_fild03"],["alde_gld","aldebaran"],["aldebaran","mjolnir_12"],["aldebaran","yuno_fild01"],["ama_fild01","amatsu"],["aru_gld","ve_fild02"],["ayo_fild01","ayothaya"],["bif_fild01","bif_fild02"],["bif_fild01","spl_fild01"],["bif_fild01","splendide"],["bif_fild02","ecl_fild01"],["bra_fild01","brasilis"],["cave","ein_fild01"],["cmd_fild01","cmd_fild02"],["cmd_fild01","cmd_fild03"],["cmd_fild01","um_fild03"],["cmd_fild02","cmd_fild04"],["cmd_fild03","cmd_fild04"],["cmd_fild04","cmd_fild06"],["cmd_fild06","cmd_fild07"],["cmd_fild06","cmd_fild08"],["cmd_fild07","cmd_fild09"],["cmd_fild08","cmd_fild09"],["cmd_fild09","moc_fild18"],["dew_fild01","dewata"],["dic_fild01","dic_fild02"],["dic_fild01","dicastes01"],["dicastes01","dicastes02"],["ecl_fild01","eclage"],["ecl_fild01","mora"],["ein_fild01","ein_fild02"],["ein_fild01","yuno"],["ein_fild01","yuno_fild05"],["ein_fild02","ein_fild05"],["ein_fild03","ein_fild04"],["ein_fild03","lhz_fild02"],["ein_fild04","ein_fild05"],["ein_fild04","einbroch"],["ein_fild05","ein_fild06"],["ein_fild06","ein_fild07"],["ein_fild06","yuno_fild04"],["ein_fild06","yuno_fild07"],["ein_fild07","yuno_fild11"],["ein_fild08","ein_fild09"],["ein_fild08","einbroch"],["ein_fild08","lhz_fild03"],["ein_fild09","einbech"],["gef_fild00","geffen"],["gef_fild00","mjolnir_06"],["gef_fild00","prt_fild00"],["gef_fild01","gef_fild09"],["gef_fild01","prt_fild04"],["gef_fild02","gef_fild03"],["gef_fild02","prt_fild07"],["gef_fild02","prt_fild10"],["gef_fild04","gef_fild05"],["gef_fild04","geffen"],["gef_fild04","mjolnir_01"],["gef_fild05","gef_fild06"],["gef_fild06","gef_fild08"],["gef_fild06","glast_01"],["gef_fild07","gef_fild08"],["gef_fild07","gef_fild13"],["gef_fild07","geffen"],["gef_fild09","gef_fild10"],["gef_fild10","gef_fild11"],["gef_fild11","prt_fild11"],["gon_fild01","gonryun"],["hu_fild01","hu_fild02"],["hu_fild01","yuno_fild06"],["hu_fild02","hu_fild04"],["hu_fild04","hu_fild05"],["hu_fild04","yuno_fild02"],["hu_fild04","yuno_fild06"],["hu_fild05","hu_fild06"],["hu_fild06","hugel"],["izlude","prt_fild08"],["lhz_fild01","lhz_fild02"],["lhz_fild01","lighthalzen"],["lhz_fild01","ra_fild06"],["lhz_fild02","lhz_fild03"],["lou_fild01","louyang"],["ma_fild01","ma_fild02"],["ma_fild01","ma_scene01"],["ma_fild01","malaya"],["man_fild01","man_fild02"],["man_fild01","man_fild03"],["man_fild01","mid_camp"],["man_fild02","manuk"],["man_fild03","manuk"],["mid_camp","spl_fild02"],["mjolnir_01","mjolnir_02"],["mjolnir_02","mjolnir_03"],["mjolnir_03","mjolnir_04"],["mjolnir_03","mjolnir_07"],["mjolnir_04","mjolnir_05"],["mjolnir_04","mjolnir_08"],["mjolnir_05","mjolnir_10"],["mjolnir_05","mjolnir_12"],["mjolnir_07","mjolnir_08"],["mjolnir_07","prt_fild00"],["mjolnir_08","mjolnir_09"],["mjolnir_08","mjolnir_10"],["mjolnir_09","prt_fild00"],["mjolnir_09","prt_fild01"],["mjolnir_09","prt_fild05"],["mjolnir_10","mjolnir_11"],["mjolnir_10","prt_fild01"],["mjolnir_11","prt_fild02"],["moc_fild01","moc_fild02"],["moc_fild01","pay_fild04"],["moc_fild01","prt_fild08"],["moc_fild01","prt_fild09"],["moc_fild02","moc_fild07"],["moc_fild02","moc_fild13"],["moc_fild02","pay_gld"],["moc_fild03","pay_fild01"],["moc_fild03","pay_gld"],["moc_fild07","morocc"],["moc_fild11","moc_fild12"],["moc_fild11","moc_fild17"],["moc_fild11","moc_fild20"],["moc_fild12","moc_fild18"],["moc_fild12","morocc"],["moc_fild13","moc_fild20"],["moc_fild16","moc_fild17"],["moc_fild17","moc_fild18"],["moc_fild19","moc_ruins"],["moc_fild19","morocc"],["moc_fild20","morocc"],["moc_fild20","prt_fild09"],["nif_fild01","nif_fild02"],["nif_fild02","niflheim"],["pay_arche","payon"],["pay_fild01","pay_fild02"],["pay_fild01","pay_fild07"],["pay_fild01","payon"],["pay_fild02","pay_fild03"],["pay_fild03","pay_fild06"],["pay_fild03","pay_fild07"],["pay_fild04","pay_gld"],["pay_fild07","pay_fild08"],["pay_fild07","pay_fild10"],["pay_fild08","pay_fild09"],["pay_fild08","payon"],["pay_fild09","pay_fild10"],["pay_gld","payon"],["prontera","prt_fild05"],["prontera","prt_fild06"],["prontera","prt_fild08"],["prontera","prt_gld"],["prt_fild00","prt_fild04"],["prt_fild01","prt_fild02"],["prt_fild01","prt_gld"],["prt_fild02","prt_fild03"],["prt_fild02","prt_fild06"],["prt_fild03","prt_monk"],["prt_fild04","prt_fild05"],["prt_fild05","prt_fild07"],["prt_fild07","prt_fild08"],["prt_fild07","prt_fild09"],["prt_fild09","prt_fild10"],["prt_fild10","prt_fild11"],["ra_fild01","ra_fild04"],["ra_fild03","ra_fild04"],["ra_fild04","ra_fild08"],["ra_fild05","ra_fild06"],["ra_fild08","ra_fild12"],["ra_fild12","rachel"],["ra_temple","rachel"],["rachel","ve_fild02"],["sch_gld","yuno"],["spl_fild01","spl_fild02"],["spl_fild02","spl_fild03"],["spl_fild02","splendide"],["um_fild01","um_fild02"],["um_fild02","um_fild03"],["um_fild02","um_fild04"],["um_fild04","umbala"],["ve_fild01","ve_fild02"],["ve_fild01","ve_fild04"],["ve_fild03","ve_fild04"],["ve_fild03","ve_fild05"],["ve_fild04","ve_fild06"],["ve_fild05","ve_fild06"],["ve_fild06","veins"],["ve_fild07","veins"],["xmas","xmas_fild01"],["yuno_fild01","yuno_fild09"],["yuno_fild01","yuno_fild12"],["yuno_fild02","yuno_fild03"],["yuno_fild02","yuno_fild08"],["yuno_fild03","yuno_fild04"],["yuno_fild03","yuno_fild06"],["yuno_fild03","yuno_fild07"],["yuno_fild04","yuno_fild05"],["yuno_fild07","yuno_fild08"],["yuno_fild07","yuno_fild11"],["yuno_fild08","yuno_fild09"],["yuno_fild08","yuno_fild12"],["yuno_fild11","yuno_fild12"]];
const ST = { get start() { return LNT.start; } };
// ---- 回る順: 公式ワールドマップの並び(GRID)で隣のマップを順にたどる。出発点から、いちばん近い(隣をたどって少ない)マップへ、を繰り返す ----
const STARTS = [["prontera", "プロンテラ"], ["izlude", "イズルード"], ["geffen", "ゲフェン"], ["payon", "フェイヨン"], ["morocc", "モロク"], ["alberta", "アルベルタ"], ["aldebaran", "アルデバラン"], ["yuno", "ジュノー"], ["einbroch", "アインブロック"], ["lighthalzen", "リヒタルゼン"], ["hugel", "フィゲル"], ["rachel", "ラヘル"], ["veins", "ベインス"], ["comodo", "コモド"], ["umbala", "ウンバラ"]];
const CELLS = {}, CELLOF = {}, ALIAS = {};
for (const id in GRID) { const g = GRID[id]; if (typeof g === "string") ALIAS[id] = g; else { CELLOF[id] = g; CELLS[g.join(":")] = id; } }
// 行き来できる組(LINKS)は、公式ワールドマップの図の矢印から読み取ったもの(隣のマスでも矢印が無い所は行き来できない)。例外は CUT(切る)・ADD(足す)に書く
const LINK_CUT = [];
const LINK_ADD = [];
const NB = {};
function addNb(a, b) { (NB[a] = NB[a] || []).push(b); (NB[b] = NB[b] || []).push(a); }
for (const l of LINKS.concat(LINK_ADD)) if (!LINK_CUT.some((c) => (c[0] === l[0] && c[1] === l[1]) || (c[0] === l[1] && c[1] === l[0]))) addNb(l[0], l[1]);
function nbrs(id) { return NB[id] || []; }
function bfs(from) { const d = {}; d[from] = 0; const q = [from]; for (let i = 0; i < q.length; i++) for (const n of nbrs(q[i])) if (!(n in d)) { d[n] = d[q[i]] + 1; q.push(n); } return d; }
// 町やフィールドの名前でない場所(城内・ギルド・空港など)を、いちばん近い町やマップに結びつける(座標はそのマップのものではないので、その町の最後に回す)
const NAME_TOWN = { "プロンテラ城内": "prontera", "プロンテラ聖堂内": "prontera", "プロンテラ中央宮": "prontera", "プロンテラ離宮": "prontera", "プロンテラ東図書館": "prontera", "王家の記憶の間": "prontera", "過去の王家の記憶の間": "prontera", "侵攻されたプロンテラ避難地": "prontera", "聖カピトリーナ修道院": "prt_monk",
  "モロク城内": "morocc", "アサシンギルド": "morocc", "シーフギルド": "morocc", "楽園団01": "morocc", "ジャワイ室内": "jawaii", "錬金術師ギルド": "aldebaran", "レッケンベル本社": "lighthalzen", "リヒタルゼン空港": "lighthalzen",
  "ウェルス発掘地": "yuno", "特殊警戒地域コル": "yuno", "実験棟-OPTATIO": "yuno", "研究棟-WISH": "yuno", "ウェルス中央広場": "yuno", "フレイヤ大神殿": "rachel", "フレイヤ大神殿室内": "rachel", "ナビ号船内": "malangdo",
  "連合軍駐屯地": "mid_camp", "連合軍駐屯地内部": "mid_camp", "スプレンディッド": "splendide", "スプレンディッド内部01": "splendide", "スプレンディッド内部02": "splendide", "マヌク": "manuk", "マヌク内部": "manuk", "エルディカスティス": "dicastes01", "エルディカスティス室内": "dicastes01", "モーラ": "mora", "エクラージュ": "eclage", "エクラージュ通路": "eclage", "エクラージュ内部": "eclage", "ラザーニャ": "eclage",
  "スプレンディットフィールド01": "spl_fild01", "スプレンディットフィールド02": "spl_fild02", "スプレンディットフィールド03": "spl_fild03", "カミダル山脈01": "dic_fild01", "カミダル山脈02": "dic_fild02", "カミダルトンネル": "dic_fild01",
  "ブラジリスフィールド": "bra_fild01", "デワタフィールド": "dew_fild01", "バリオ・マワヒガ": "ma_fild01", "沈没船付近の島": "alb2trea", "コモド小劇場": "comodo", "ゲフェン中央塔": "geffen", "教室棟A": "geffen", "教室棟B": "geffen", "教室棟ホール": "geffen", "エントランスホール": "geffen", "図書室（アカデミー）": "geffen",
  "ジュノー空港": "yuno", "空港": "einbroch", "アルベルタ船舶の中": "alberta", "次元の狭間03": "moc_fild20" };
function cellId(name) { let id = ((((LNT.data || {}).ids) || {})[name] || {}).id; id = ALIAS[id] || id; return id && CELLOF[id] ? id : null; }
function navName(it) { return it.e ? it.e[0] : it.map; }
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
function pathBetween(a, b) {   // aからbへ、隣をたどる近道の途中のマップ(a, ..., b)。つながっていなければ null
  const par = { [a]: null }, q = [a];
  for (let i = 0; i < q.length; i++) { if (q[i] === b) break; for (const n of nbrs(q[i])) if (!(n in par)) { par[n] = q[i]; q.push(n); } }
  if (!(b in par)) return null;
  const p = []; for (let x = b; x !== null; x = par[x]) p.push(x);
  return p.reverse();
}
function compact(order, has) {   // 次のマップへの道中に、まだの(アイテムのある)マップがあれば、通るついでに先に回る(あとで戻らない)
  const done = new Set(), out = [];
  const visit = (k) => { if (!done.has(k)) { done.add(k); out.push(k); } };
  visit(order[0]);
  for (let i = 1; i < order.length; i++) {
    const b = order[i]; if (done.has(b)) continue;
    const p = pathBetween(out[out.length - 1], b);
    if (p) for (const n of p.slice(1, -1)) if (has[n]) visit(n);
    visit(b);
  }
  return out;
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
  const has = {}; for (const k in dir) has[k] = 1; for (const k in fb) has[k] = 1;
  order = compact(order, has);              // 道中のマップも通るついでに
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
return { routeSort, STARTS };
})();
