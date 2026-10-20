"use strict";
// ---------- アップデート(この PC のツールだけ) ----------
let UPDATE = null;
async function checkUpdate(force) {
  try {
    const r = await fetch("/api/update", force ? { method: "POST" } : {});
    UPDATE = await r.json();
  } catch { UPDATE = null; }
  drawUpdate();
}
function drawUpdate() {
  let el = $("#updbar");
  if (!el) { $("#tabs").insertAdjacentHTML("beforebegin", `<div id="updbar"></div>`); el = $("#updbar"); }
  const u = UPDATE;
  if (!u || !["available", "downloading", "ready"].includes(u.state) && !(u.state === "error" && u.error && u.latest)) { el.innerHTML = ""; return; }
  const v = u.latest ? "v" + u.latest.version : "";
  let h = `<div class="panel updbar">`;
  if (u.state === "available") h += `<b>新しい版 ${esc(v)} があります</b>（いまは v${esc(u.current)}）`
    + (u.can_install ? ` <button id="upgo">今すぐアップデート</button>` : ` <span class="muted">exe 版のときにここから更新できます</span>`)
    + (u.latest.notes ? `<details><summary>変更点</summary><pre>${esc(u.latest.notes)}</pre></details>` : "");
  else if (u.state === "downloading") h += `<b>${esc(v)} をダウンロード中… ${u.progress}%</b>`;
  else if (u.state === "ready") h += `<b>入れ替えて起動し直しています…</b> 少し待つと新しい版で開き直します。`;
  else h += `<b>アップデートできませんでした</b> ${esc(u.error)} <button id="upgo">もう一度</button>`;
  el.innerHTML = h + `</div>`;
  const b = $("#upgo");
  if (b) b.onclick = async () => {
    b.disabled = true;
    try { UPDATE = await (await fetch("/api/update?do=install", { method: "POST" })).json(); } catch {}
    drawUpdate();
    const t = setInterval(async () => { await checkUpdate(); if (!UPDATE || !["downloading"].includes(UPDATE.state)) clearInterval(t); }, 1000);
  };
}
