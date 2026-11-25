"use strict";
// ---------- マッスルマーチ(タブ「アニバ」のサブタブ。24thアニバーサリー) ----------
// 20分サイクル(UNIX時間を1200秒で割った余り): 0〜5分 受付・待機 / 5〜15分 訓練実施 / 15〜20分 休憩。サイトのタイマーと同じ(Python 側 muscle_core.py と同じ式)。
// 通知は Python 側(md_tracker の _muscle_loop)が Windows の通知で出す。画面を閉じていても鳴る。ここは時計の表示と、通知の「オン/ミュート」の切りかえだけ。
// 切りかえは SETTINGS.mmNotify(表示の設定.json に保存。初期はミュート = オフ)。鳴らす時刻は SETTINGS.mmWhen(キーの一覧。無ければ「訓練開始の1分前」と「訓練の開始」)。
// 会場は rag_fes1 と jro22ani1 の2種類。参加の回数・もらった経験値は md_core が数えて(キャラごと ch.muscle = {n, exp, items{アイテム番号:個数}, hist[{t,cycle,exp,cnt,items}]})、ここで見せる。
// MM_POINTS のキーは Python 側 muscle_core.NOTIFY_POINTS と同じ。
const MM_POINTS = [["wait", "受付の開始", 0], ["pre1", "訓練開始の1分前", 240], ["start", "訓練の開始", 300], ["end1", "訓練終了の1分前", 840], ["rest", "休憩の開始", 900]];
const MM_DEFAULT = ["pre1", "start"];
let MM_TIMER = null, MM_LAST = "";
function mmWhen() { return Array.isArray(SETTINGS.mmWhen) ? SETTINGS.mmWhen : MM_DEFAULT; }
function mmItems(o) {      // {アイテム番号: 個数} → 「名前 ×個数」の並び(コインなどの報酬)
  const a = Object.entries(o || {}).sort((x, y) => y[1] - x[1]).map(([id, n]) => `${esc(typeof invName === "function" ? invName(Number(id)) : "ID" + id)} ×${fmtN(n)}`);
  return a.length ? a.join("、") : `<span class="muted">なし</span>`;
}
function mmHist(chars) {      // 参加の履歴(キャラごとの回数・累計 / 新しい順の履歴)
  const rows = [], hist = [];
  for (const c of chars) {
    const m = ((DATA.chars || {})[c] || {}).muscle;
    if (!m || !m.n) continue;
    rows.push({ c, n: m.n, exp: m.exp || 0, items: m.items || {}, last: (m.hist[m.hist.length - 1] || {}).t || 0 });
    for (const x of m.hist || []) hist.push({ c, ...x });
  }
  hist.sort((a, b) => b.t - a.t);
  return { rows, hist };
}
function mmPhase(sec) {
  const t = ((Math.floor(sec) % 1200) + 1200) % 1200;
  if (t < 300) return { key: "wait", name: "受付・待機", t, remain: 300 - t, next: "訓練実施" };
  if (t < 900) return { key: "train", name: "訓練実施", t, remain: 900 - t, next: "休憩" };
  return { key: "rest", name: "休憩", t, remain: 1200 - t, next: "受付・待機" };
}
function mmTick() {
  const nm = document.getElementById("mmName");
  if (!nm) { clearInterval(MM_TIMER); MM_TIMER = null; return; }      // 別のタブへ移った
  const now = Date.now() / 1000, p = mmPhase(now);
  const col = { wait: "var(--wait, #c90)", train: "var(--ok, #3a3)", rest: "#888" }[p.key];
  nm.textContent = p.name; nm.style.color = col;
  document.getElementById("mmCd").textContent = `${String(Math.floor(p.remain / 60)).padStart(2, "0")}:${String(p.remain % 60).padStart(2, "0")}`;
  const at = new Date((Math.floor(now) + p.remain) * 1000);
  document.getElementById("mmNext").textContent = `次: ${p.next} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}:${String(at.getSeconds()).padStart(2, "0")} 開始`;
  document.getElementById("mmPos").style.left = `calc(${p.t / 12}% - 2px)`;
}
function mmBtnText() {
  return SETTINGS.mmNotify ? "🔔 通知オン（押すとミュート）" : "🔕 ミュート中（押すと通知オン）";
}
// 画面の上(「更新」の左)の通知スイッチ。どのタブからでも切りかえられる(SETTINGS.mmNotify。初期はミュート)
function mmBellUpdate() {
  const b = document.getElementById("mmbell");
  if (!b) return;
  const on = !!SETTINGS.mmNotify;
  const t = on ? "🔔 通知オン" : "🔕 ミュート中";
  if (b.textContent !== t) b.textContent = t;
  b.style.color = on ? "#fff" : "";
  b.style.background = on ? "#2e8b57" : "";          // オン = 緑のぬりつぶし / ミュート = ふつうのボタン(目立たせない)
  b.style.borderColor = on ? "#2e8b57" : "";
  b.title = on ? "マッスルマーチの通知: オン（押すとミュート）" : "マッスルマーチの通知: ミュート中（押すと通知オン）";
  const m = document.getElementById("mmMute");
  if (m) { if (m.textContent !== mmBtnText()) m.textContent = mmBtnText(); m.style.background = on ? "#2e8b57" : ""; m.style.color = on ? "#fff" : ""; m.style.borderColor = on ? "#2e8b57" : ""; }
}
function mmToggle() { SETTINGS.mmNotify = !SETTINGS.mmNotify; saveSettings(); mmBellUpdate(); }
(() => { const b = document.getElementById("mmbell"); if (b) b.onclick = mmToggle; setInterval(mmBellUpdate, 700); })();
async function mmTest(btn) {
  btn.disabled = true; const o = btn.textContent; btn.textContent = "送っています…";
  try {
    const r = await fetch("/api/muscle-test", { method: "POST", headers: { "x-password": PW }, cache: "no-store" }).then((x) => x.json());
    btn.textContent = r.ok ? "送りました（右下に出ましたか？ 出ないときは Windows の集中モードを確認）" : "送れませんでした: " + r.err;
  } catch (e) { btn.textContent = "失敗: " + e.message; }
  setTimeout(() => { btn.disabled = false; btn.textContent = o; }, 6000);
}
function renderMuscle(chars) {
  chars = chars || [];
  const H = mmHist(chars), W = new Set(mmWhen());
  const h = `<div class="opts"><span>マッスルマーチの20分サイクルの時計です。選んだ時刻に、Windowsの通知を出せます（画面を閉じていても、ツールが動いていれば鳴ります）。</span></div>
    <div class="panel" style="padding:14px 16px;max-width:560px">
      <div id="mmName" style="font-size:20px;font-weight:700">--</div>
      <div id="mmCd" style="font-size:44px;font-weight:700;font-variant-numeric:tabular-nums">--:--</div>
      <div id="mmNext" class="muted"></div>
      <div style="position:relative;height:14px;margin:12px 0 2px;border-radius:7px;overflow:hidden;display:flex">
        <span style="flex:25;background:#c90a"></span><span style="flex:50;background:#3a3a"></span><span style="flex:25;background:#8888"></span>
        <b id="mmPos" style="position:absolute;top:0;bottom:0;width:4px;background:#fff;box-shadow:0 0 0 1px #000"></b>
      </div>
      <div class="muted" style="display:flex;justify-content:space-between;font-size:12px"><span>受付 0-5分</span><span>訓練 5-15分</span><span>休憩 15-20分</span></div>
    </div>
    <div style="margin-top:12px"><b>通知する時刻</b>（複数えらべます）<div style="margin:4px 0 8px">${MM_POINTS.map(([k, nm, at]) => `<label style="margin-right:14px;white-space:nowrap"><input type="checkbox" data-mmw="${k}" ${W.has(k) ? "checked" : ""}> ${esc(nm)}<span class="muted">（毎時 ${String(at / 60 | 0).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}・20分ごと）</span></label>`).join("")}</div></div>
    <div><button id="mmMute" style="padding:8px 14px;font-size:14px;cursor:pointer">${esc(mmBtnText())}</button>
      <label style="margin-left:12px;white-space:nowrap"><input type="checkbox" id="mmSound" ${SETTINGS.mmSound === false ? "" : "checked"}> 通知と一緒に音も鳴らす</label>
      <button id="mmTest" class="ghost" style="margin-left:8px;padding:8px 12px">通知のテスト</button>
      <span class="muted" style="margin-left:8px">初期はミュート（上の時刻は、ミュートを外したときに鳴ります）。通知は右下のアイコンから出ます。</span></div>
    <div class="panel" style="padding:10px 14px;margin-top:12px;max-width:760px"><b>参加の記録</b>（会場 rag_fes1・jro22ani1。訓練の報酬の経験値が届いたら1回と数えます）
      ${H.rows.length ? `<div class="tablewrap"><table><thead><tr><th class="char">キャラ</th><th>参加回数</th><th>Base経験値の累計</th><th>コイン等の累計</th><th>最後</th></tr></thead><tbody>${H.rows.map((r) => `<tr><td class="char">${esc(cn(r.c))}</td><td class="n">${fmtN(r.n)}</td><td class="n">${fmtN(r.exp)}</td><td>${mmItems(r.items)}</td><td>${esc(when(r.last))}</td></tr>`).join("")}</tbody></table></div>
      <details data-mmh style="margin-top:6px" ${store.get("md_mmhist") === "1" ? "open" : ""}><summary>報酬の履歴（新しい順・${H.hist.length}件）</summary><div class="tablewrap"><table><thead><tr><th>日時</th><th class="char">キャラ</th><th>Base経験値</th><th>コイン等</th></tr></thead><tbody>${H.hist.slice(0, 100).map((x) => `<tr><td>${esc(when(x.t))}</td><td class="char">${esc(cn(x.c))}</td><td class="n">${fmtN(x.exp)}</td><td>${mmItems(x.items)}</td></tr>`).join("")}</tbody></table></div></details>`
      : `<div class="muted" style="margin-top:6px">まだ記録がありません。マッスルマーチ(rag_fes1・jro22ani1)で訓練の報酬をもらうと、ここに溜まります。</div>`}
      <div class="muted" style="margin-top:6px;font-size:12px">経験値は順位に応じて分けて届くので、その合計を数えます。コインなどのアイテムは、会場で報酬のあとに持ち物へ入ったものを数えます（名前はゲームの持ち物と同じ表から出します）。ツールを起動している間の参加だけが対象です。</div></div>
    <p class="hint">時間帯: 毎時 00〜05分 受付・待機 → 05〜15分 訓練 → 15〜20分 休憩（20分ごとにくり返し）。参考: rotool bootcamp。</p>`;
  const v = $("#view");
  if (h === MM_LAST && v.querySelector("#mmroot")) return;      // 中身が前と同じなら、画面はそのまま(時計は mmTick が動かす)
  MM_LAST = h;
  v.innerHTML = `<div id="mmroot">${h}</div>`;
  v.querySelectorAll("[data-mmw]").forEach((c) => c.onchange = () => {
    const on = new Set(mmWhen());
    if (c.checked) on.add(c.dataset.mmw); else on.delete(c.dataset.mmw);
    SETTINGS.mmWhen = MM_POINTS.map((p) => p[0]).filter((k) => on.has(k)); saveSettings();
  });
  const dt = v.querySelector("details[data-mmh]"); if (dt) dt.ontoggle = () => store.set("md_mmhist", dt.open ? "1" : "0");
  const b = document.getElementById("mmMute");
  b.onclick = mmToggle;
  const sd = document.getElementById("mmSound"); if (sd) sd.onchange = () => { SETTINGS.mmSound = sd.checked; saveSettings(); };
  const tb = document.getElementById("mmTest"); if (tb) tb.onclick = () => mmTest(tb);
  mmTick();
  if (!MM_TIMER) MM_TIMER = setInterval(mmTick, 500);
}
