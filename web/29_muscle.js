"use strict";
// ---------- マッスルマーチ(タブ「アニバ」のサブタブ。24thアニバーサリー) ----------
// 20分サイクル(UNIX時間を1200秒で割った余り): 0〜5分 受付・待機 / 5〜15分 訓練実施 / 15〜20分 休憩。サイトのタイマーと同じ(Python 側 muscle_core.py と同じ式)。
// 通知は Python 側(md_tracker の _muscle_loop)が Windows の通知で出す。画面を閉じていても鳴る。ここは時計の表示と、通知の「オン/ミュート」の切りかえだけ。
// 切りかえは SETTINGS.mmNotify(表示の設定.json に保存。初期はミュート = オフ)。
let MM_TIMER = null;
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
  return SETTINGS.mmNotify ? "🔔 通知オン（押すとミュート）" : "🔕 通知ミュート中（押すと通知オン）";
}
function renderMuscle() {
  const h = `<div class="opts"><span>マッスルマーチの20分サイクルの時計です。訓練開始の1分前と開始に、Windowsの通知を出せます（画面を閉じていても、ツールが動いていれば鳴ります）。</span></div>
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
    <div style="margin-top:12px"><button id="mmMute" style="padding:8px 14px;font-size:14px;cursor:pointer">${esc(mmBtnText())}</button>
      <span class="muted" style="margin-left:8px">初期はミュート。通知は右下のアイコンから出ます。</span></div>
    <p class="hint">時間帯: 毎時 00〜05分 受付・待機 → 05〜15分 訓練 → 15〜20分 休憩（20分ごとにくり返し）。参考: rotool bootcamp。</p>`;
  $("#view").innerHTML = `<div id="mmroot">${h}</div>`;
  const b = document.getElementById("mmMute");
  b.onclick = () => { SETTINGS.mmNotify = !SETTINGS.mmNotify; saveSettings(); b.textContent = mmBtnText(); };
  mmTick();
  if (!MM_TIMER) MM_TIMER = setInterval(mmTick, 500);
}
