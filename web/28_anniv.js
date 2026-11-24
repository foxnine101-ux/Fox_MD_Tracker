"use strict";
// ---------- アニバ(イベントタブのサブタブ「アニバ」): 24thアニバーサリーを、実機のクエスト一覧から自動でチェックする ----------
// 見るもの(どれもゲームがクエスト一覧として送ってくる通信から。サーバーに問い合わせたりはしない):
//   ・夏美の討伐クエスト(30件) … 一覧から消えた = 報告して終わった。受注CT(130945)= 今日の分は受けた
//   ・ファンシーの討伐クエスト(ミッション1〜24) … ミッションNの討伐が一覧に出た = 1〜N-1 は終わっている(納品まで済んで次へ進んだ)
//   ・ファロス・ライトハウス・アドベンチャー … 「入場時間制限」(134953)が付いている = 今週入った(期限は次の火曜12時)
// 番号とミッションの対応は DATA.anniv(Python の md_core が持っている表)から受け取る。「現れた/消えた」の記録は各キャラの anniv(md_state.json に保存)。
// 消えた理由が「消える通信を見た」(del)でなく「一覧から無くなっていた」(sync)のものは推定(受注を放棄しても消える)。
const AN_PH_RETRY = 134954;      // ファロス: 再入場可能時間
const AN_NAT_CT = 130945;       // 夏美: 討伐クエスト再受注時間
let AN_LAST = "";

function anInfo() { return (DATA && DATA.anniv) || null; }
function anChar(c) {
  const ch = (DATA.chars || {})[c] || {};
  const A = ch.anniv || {};
  return { q: ch.quests || {}, seen: A.seen || {}, gone: A.gone || {}, acc: ch.account };
}
// ミッション番号 → [クエスト番号…]
function anFancyMissions() {
  const I = anInfo(), M = new Map();
  if (!I) return M;
  for (const [q, m] of Object.entries(I.fancy || {})) { if (!M.has(m)) M.set(m, []); M.get(m).push(q); }
  for (const a of M.values()) a.sort((x, y) => x - y);
  return M;
}
// 各キャラの、ファンシーの到達ミッション(討伐が一覧に出たことのある一番大きいミッション)
function anReached(c, M) {
  const { q, seen, gone } = anChar(c);
  let top = 0;
  for (const [m, qs] of M) if (m > top && qs.some((id) => id in q || id in seen || id in gone)) top = m;
  return top;
}
// 27_fancy から呼ぶ: 自動で「納品まで終わった」と分かるミッション番号(到達ミッション未満)の Set
function anFancyAutoDone(chars) {
  const M = anFancyMissions(), s = new Set();
  let top = 0;
  for (const c of chars) top = Math.max(top, anReached(c, M));
  for (let m = 1; m < top; m++) s.add(m);
  return s;
}

function renderAnniv(chars, now) {
  const I = anInfo();
  if (!I || !chars.length) {
    $("#view").innerHTML = `<div class="panel empty">${I ? "表に出ているキャラがいません。" : "まだ記録がありません。Fox_MD_Trackerを起動したままROにログインすると出ます。"}</div>`;
    return;
  }
  const M = anFancyMissions();
  const natFirst = I.nat[0], natN = I.nat[1];
  let h = `<div class="opts"><span>24thアニバーサリーの進み具合を、ログインやマップ移動のたびにゲームが送ってくるクエスト一覧から自動でチェックします（チェックは手で付けなくて大丈夫）。</span></div>`;

  // ---- ファロス ----
  h += `<details class="panel evbox" open><summary><b>ファロス・ライトハウス・アドベンチャー</b>`;
  const ph = chars.map((c) => ({ c, e: anChar(c).q[I.pharos] || 0, r: anChar(c).q[AN_PH_RETRY] || 0 }));
  const usedN = ph.filter((x) => x.e > now).length;
  h += `<span class="evmeta">今週入ったキャラ: ${usedN}（入っていないキャラ: ${chars.length - usedN}）</span></summary><div class="tablewrap"><table><thead><tr><th class="char evq">キャラ</th><th>今週</th><th>次に入れる</th></tr></thead><tbody>`;
  for (const x of ph) {
    h += `<tr><td class="char evq">${esc(cn(x.c))}</td>`;
    h += x.e > now ? `<td class="cell okc">入場済<span class="when">${when(x.e)} にリセット</span></td>` : `<td class="cell none">まだ</td>`;
    h += x.r > now ? `<td class="cell wait">${remain(x.r - now)}<span class="when">${when(x.r)}</span></td>` : `<td class="cell ${x.e > now ? "none" : "okc"}">${x.e > now ? "来週" : "入れる"}</td>`;
    h += `</tr>`;
  }
  h += `</tbody></table></div></details>`;

  // ---- 夏美 ----
  const natDoneAny = new Set();
  const natRows = chars.map((c) => {
    const { q, gone, seen } = anChar(c);
    const cells = [];
    let done = 0, held = 0, est = 0;
    for (let i = 0; i < natN; i++) {
      const id = natFirst + i, k = String(id);
      let st = "none";
      if (k in gone) { st = gone[k].by === "del" ? "done" : "est"; done++; if (st === "est") est++; natDoneAny.add(i); }
      else if (id in q) { st = "held"; held++; }
      else if (k in seen) st = "none";
      cells.push(st);
    }
    return { c, cells, done, held, est, ct: q[AN_NAT_CT] || 0 };
  });
  h += `<details class="panel evbox" open><summary><b>夏美の討伐クエスト</b><span class="evmeta">全キャラの合計で ${natDoneAny.size} / ${natN} 件が報告済み</span></summary>
    <div class="tablewrap"><table><thead><tr><th class="char evq">キャラ</th><th>報告済</th><th>受けている</th><th>今日の分</th><th>1〜${natN}（■ 報告済 / □ 受けている / ・ なし）</th></tr></thead><tbody>`;
  const natShow = natRows.filter((r) => r.done || r.held || r.ct > now);
  for (const r of natShow) {
    const g = r.cells.map((s, i) => `<span title="#${i + 1}${s === "done" ? " 報告済" : s === "est" ? " 報告済(推定)" : s === "held" ? " 受けている" : ""}" style="color:${s === "done" ? "var(--ok,#3a3)" : s === "est" ? "var(--wait,#c90)" : s === "held" ? "inherit" : "#999"}">${s === "done" || s === "est" ? "■" : s === "held" ? "□" : "・"}</span>`).join("");
    h += `<tr><td class="char evq">${esc(cn(r.c))}</td><td class="n">${r.done}${r.est ? `<span class="when">うち推定${r.est}</span>` : ""}</td><td class="n">${r.held}</td>`;
    h += r.ct > now ? `<td class="cell wait">受注済<span class="when">${when(r.ct)} から</span></td>` : `<td class="cell none">ー</td>`;
    h += `<td style="letter-spacing:1px;font-size:12px;white-space:nowrap">${g}</td></tr>`;
  }
  h += `</tbody></table></div>${natRows.length > natShow.length ? `<p class="hint" style="margin:6px 12px">討伐クエストの記録がないキャラ ${natRows.length - natShow.length} 人は省いています（まだ夏美から受けていないか、ログインを見ていません）。</p>` : ""}</details>`;

  // ---- ファンシー ----
  const tops = chars.map((c) => ({ c, t: anReached(c, M) }));
  const top = Math.max(0, ...tops.map((x) => x.t));
  h += `<details class="panel evbox" open><summary><b>ファンシーパーティー（討伐）</b><span class="evmeta">${top ? (top > 1 ? `いまミッション ${top}（1〜${top - 1} は納品まで終わっています）` : "いまミッション 1（まだ納品まで終わったものはありません）") : "まだ受けているミッションがありません"}</span></summary>
    <div class="tablewrap"><table><thead><tr><th class="char evq">キャラ</th><th>いまのミッション</th><th>討伐 報告済 / 件数</th></tr></thead><tbody>`;
  for (const x of tops) {
    const { q, gone } = anChar(x.c);
    if (!x.t) continue;
    const qs = M.get(x.t) || [];
    const dn = qs.filter((id) => id in gone).length, hd = qs.filter((id) => id in q).length;
    h += `<tr><td class="char evq">${esc(cn(x.c))}</td><td class="cell ${x.t === top ? "evon" : "wait"}">ミッション ${x.t}</td><td class="cell ${dn === qs.length ? "okc" : "wait"}">${dn} / ${qs.length}<span class="when">受けている ${hd}</span></td></tr>`;
  }
  h += `</tbody></table></div><p class="hint" style="margin:6px 12px">ミッションを受けていないキャラは省いています。ミッションNの討伐が一覧に出たら、1〜N-1 は納品まで終わったとみなして、「ファンシー」タブのチェックに自動で付けます。</p></details>`;

  h += `<p class="hint">推定 = 「消える通信」ではなく、次のログインの一覧から無くなっていたもの（受注を放棄しても同じになります）。バルムント・ブレイン・タワー・ホーンテッドの回数は、ゲームの一覧からは分からないので自動では数えません。</p>`;

  const v = $("#view");
  if (h === AN_LAST && v.querySelector("#anroot") && v.querySelector("#evnav")) return true;      // 中身が前と同じ → 画面はそのまま
  AN_LAST = h;
  v.innerHTML = `<div id="anroot">${h}</div>`;
}
