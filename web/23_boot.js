"use strict";
if (LOCAL) {
  PW = "local";
  checkUpdate(); setInterval(() => checkUpdate(), 60000);
  $("#logout").hidden = true;
  document.querySelector("#app h1").insertAdjacentHTML("afterend", `<span class="tag on" title="この PC のツールから直接表示しています">この PC</span>`);
  setInterval(() => { if (!document.hidden && TAB !== "settings") load(true); }, 5000);
  load();
} else if (PW) load(); else showLogin("");
// アプリを開いたら、計算係(ラトリオ)を前もって起動しておく(計算機タブを開いたときに待たなくて済む。ラトリオを取り込んである PC だけ)
setTimeout(() => {
  const go = () => { try { if (typeof LOCAL !== "undefined" && LOCAL) ratStatus().then(() => { if (RAT && RAT.installed && !ENG.ready && !ENG.loading && !ENG.err) engInit().then(() => { if (TAB === "sim") render(); }); }).catch(() => { }); } catch (e) { } };
  if (!document.hidden) go(); else document.addEventListener("visibilitychange", function once() { if (!document.hidden) { document.removeEventListener("visibilitychange", once); go(); } });     // 窓をしまったまま起動したときは、窓を出したときに
}, 3000);
