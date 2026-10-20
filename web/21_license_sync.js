"use strict";
// ---------- 通信 ----------
async function api(method, q = "", body) {
  const r = await fetch("/api/data" + q, {
    method, headers: { "x-password": PW, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
let saveTimer = null, SAVING = false;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null; SAVING = true;
    try { await api("POST", "", SETTINGS); const e = $("#serr"); if (e) e.textContent = ""; }
    catch (e) { const el = $("#serr"); if (el) el.textContent = "保存できませんでした: " + e.message; }
    finally { SAVING = false; }
  }, 400);
}
let LOAD_SIG = "";
async function load(quiet) {      // quiet = 自動の読み直し。前と同じ内容なら画面を描き直さない(開いている枠・入力中の内容がそのまま残る)
  try {
    const j = await api("GET");
    const sig = JSON.stringify([Object.assign({}, j.data, { updated: 0 }), j.settings || {}]);    // updated は毎回変わる(現在時刻)ので比べない。設定も含める
    const same = quiet && DATA && sig === LOAD_SIG;
    LOAD_SIG = sig;
    DATA = j.data;
    if (!saveTimer && !SAVING) SETTINGS = j.settings || {};   // 保存待ちのあいだは手元の設定を使う(並びが一瞬戻らないように)
    $("#login").hidden = true; $("#app").hidden = false;
    store.set("md_pw", PW);
    if (!same) {
      // 重い画面(被ダメなど。1回 60ms 以上)は、自動の読み直しでは 15 秒に1回まで。戦闘中は数秒おきに記録が増え、そのたびに画面が止まるため。操作したときの描き直しは、すぐ行う
      const wait = 15000 - (Date.now() - LAST_RENDER_AT);
      if (quiet && LAST_RENDER_MS > 60 && wait > 0) { if (!RENDER_LATER) RENDER_LATER = setTimeout(() => { RENDER_LATER = 0; render(); }, wait); }
      else render();
    }
    else if ($("#upd")) $("#upd").textContent = DATA.updated ? `最終受信 ${when(DATA.updated)}` : "まだ記録がありません";
  } catch (e) {
    if (e.message === "401") { showLogin(PW ? "合言葉が違います" : ""); PW = ""; store.del("md_pw"); }
    else if (typeof LOCAL !== "undefined" && LOCAL) { if (DATA) $("#upd").textContent = "ツールが止まっているみたい（Fox_MD_Trackerを起動してね）"; else showLogin("Fox_MD_Trackerが起動していません"); }
    else if (DATA) $("#upd").textContent = "通信エラー（あとで自動で再読み込みします）";
    else showLogin("読み込めませんでした: " + e.message);
  }
}
function showLogin(msg) { $("#app").hidden = true; $("#login").hidden = false; $("#lerr").textContent = msg || ""; $("#pw").focus(); }

$("#go").onclick = () => { PW = $("#pw").value.trim(); if (PW) load(); };
$("#pw").onkeydown = (e) => { if (e.key === "Enter") $("#go").click(); };
$("#logout").onclick = () => { store.del("md_pw"); PW = ""; DATA = null; showLogin(""); };
$("#reload").onclick = () => { RZ.t = 0; load(); };   // 更新ボタンは耐性シートも読み直す
// ライセンス・クレジット(ROラトリオHub の PolyForm Noncommercial License の「Required Notice」・RO の著作権表示)。ファイル「ライセンス.txt」と同じ中身
const LICENSE_TEXT = "Fox_MD_Tracker に含まれる・使っているもの\n=========================================\n\nFox_MD_Tracker は、ラグナロクオンラインのファンが作った非公式の個人用ツールです(非営利・無料)。\n\n■ ROラトリオHub(ratorio)\n  計算機の部分(ダメージ・ステータスなどの計算、装備・カード・モンスターのデータ)に使っています。\n  https://github.com/roratorio-hub/ratorio\n  ライセンス: PolyForm Noncommercial License 1.0.0\n  条文: https://polyformproject.org/licenses/noncommercial/1.0.0\n  Copyright (c) 2023 usachoco\n  非営利の目的でだけ使えます。このツールを、お金をとって売ったり、営利目的で使ったりしないでください。\n  ※「ラトリオ」の計算機は、上のライセンスのもとで配られているラトリオ本体を、そのまま取り込んで動かしています。\n\n  Required Notice(ラトリオの LICENSE にある「必須通知」を、そのまま写したものです):\n\n\n  > Required Notice: Copyright Yoyodyne, Inc. (http://example.com)\n\n  ## Changes and New Works License\n\n  The licensor grants you an additional copyright license to\n  make changes and new works based on the software for any\n  permitted purpose.\n\n  ## Patent License\n\n  The licensor grants you a patent license for the software that\n  covers patent claims the licensor can license, or becomes able\n  to license, that you would infringe by using the software.\n\n  ## Noncommercial Purposes\n\n  Any noncommercial purpose is a permitted purpose.\n\n  ## Personal Uses\n\n  Personal use for research, experiment, and testing for\n  the benefit of public knowledge, personal study, private\n  entertainment, hobby projects, amateur pursuits, or religious\n  observance, without any anticipated commercial application,\n  is use for a permitted purpose.\n\n  ## Noncommercial Organizations\n\n  Use by any charitable organization, educational institution,\n  public research organization, public safety or health\n  organization, environmental protection organization,\n  or government institution is use for a permitted purpose\n  regardless of the source of funding or obligations resulting\n  from the funding.\n\n  ## Fair Use\n\n  You may have \"fair use\" rights for the software under the\n  law. These terms do not limit them.\n\n  ## No Other Rights\n\n  These terms do not allow you to sublicense or transfer any of\n  your licenses to anyone else, or prevent the licensor from\n  granting licenses to anyone else.  These terms do not imply\n  any other licenses.\n\n  ## Patent Defense\n\n  If you make any written claim that the software infringes or\n  contributes to infringement of any patent, your patent license\n  for the software granted under these terms ends immediately. If\n  your company makes such a claim, your patent license ends\n  immediately for work on behalf of your company.\n\n  ## Violations\n\n  The first time you are notified in writing that you have\n  violated any of these terms, or done anything with the software\n  not covered by your licenses, your licenses can nonetheless\n  continue if you come into full compliance with these terms,\n  and take practical steps to correct past violations, within\n  32 days of receiving notice.  Otherwise, all your licenses\n  end immediately.\n\n  ## No Liability\n\n  ***As far as the law allows, the software comes as is, without\n  any warranty or condition, and the licensor will not be liable\n  to you for any damages arising out of these terms or the use\n  or nature of the software, under any kind of legal claim.***\n\n  ## Definitions\n\n  The **licensor** is the individual or entity offering these\n  terms, and the **software** is the software the licensor makes\n  available under these terms.\n\n  **You** refers to the individual or entity agreeing to these\n  terms.\n\n  **Your company** is any legal entity, sole proprietorship,\n  or other kind of organization that you work for, plus all\n  organizations that have control over, are under the control of,\n  or are under common control with that organization.  **Control**\n  means ownership of substantially all the assets of an entity,\n  or the power to direct its management and policies by vote,\n  contract, or otherwise.  Control can be direct or indirect.\n\n  **Your licenses** are all the licenses granted to you for the\n  software under these terms.\n\n  **Use** means anything you do with the software requiring one\n  of your licenses.\n\n  ## Required Notice\n\n  - Credit\n\n  We express our sincere gratitude to the many individuals who \n  contributed to the development of this software.\n\n  RORATORIO <http://roratorio.2-d.jp/> took charge of the initial \n  software design and development, making significant contributions \n  to the ongoing provision of the software.\n\n  RORATORIO-HINANJO <https://roratorio-hinanjo.net/> took over \n  the software development in response to the decreased update \n  frequency of RORATORIO, dedicating efforts to its maintenance, \n  updates, and the addition of new features. Furthermore, during \n  their own periods of reduced update frequency, they granted \n  permission for the reuse/publication of the software's source code, \n  enabling continuous updates by volunteer developers.\n\n  Lastly, our heartfelt appreciation goes to the volunteer data \n  contributors. Many of the numerical values and formulas included \n  in the software are based on data provided by these volunteers, \n  who cooperated in data collection and verification, tasks beyond \n  the capacity of the developers.\n\n  - Copyright\n\n  This software is released in accordance with the usage licensing \n  terms of copyrighted materials as indicated in the Ragnarok Online \n  Copyright Guidelines. Ragnarok Online is a copyrighted work of \n  Gravity Co., Ltd., Lee MyoungJin (studio DTDS), and GungHo Online \n  Entertainment, Inc.\n\n  © Gravity Co., Ltd. & Lee MyoungJin(studio DTDS). All rights reserved.\n  © GungHo Online Entertainment, Inc. All Rights Reserved.\n  Reuse of this content (reprinting, distribution, etc.) is prohibited.\n\n■ ラグナロクオンラインの著作権表示\n  RAGNAROK ONLINE は、Gravity Co., Ltd. & Lee MyoungJin(studio DTDS) と GungHo Online Entertainment, Inc. の著作物です。\n  (c) Gravity Co., Ltd. & Lee MyoungJin(studio DTDS). All rights reserved.\n  (c) GungHo Online Entertainment, Inc. All Rights Reserved.\n  このツールは、公式とは関係ありません。\n\n■ そのほか\n  ・モンスターの情報(公式サイト rotool.gungho.jp)は、各自の PC にだけ集めます。このツールに同梱したり、配ったりしません。\n  ・耐性の一覧シートなど、利用者が自分で指定したデータは、それぞれの作者のものです。\n";
function quitApp() {
  if (!confirm("Fox_MD_Tracker を終了します（通信の記録も止まります）。よろしいですか？")) return;
  fetch("/api/quit", { method: "POST" }).catch(() => {});
  $("#view").innerHTML = `<div class="panel empty">終了しました。このウィンドウは閉じてかまいません。</div>`;
}
function showLicense() {
  document.querySelectorAll(".licdlg").forEach((e) => e.remove());
  const d = document.createElement("div"); d.className = "licdlg";
  d.innerHTML = `<div class="licbox"><div class="infoh"><b>ライセンス・クレジット</b><a class="infox" title="閉じる">×</a></div><pre class="licpre">${esc(LICENSE_TEXT)}</pre></div>`;
  d.onclick = (e) => { if (e.target === d || e.target.closest(".infox")) d.remove(); };
  document.body.appendChild(d);
}
// ---------------- 利用キー(初回だけ入力。サーバーで確認。停止・台数超過もここに出る) ----------------
// ---------------- 共有の結びつけ(配布元が承認した 番号 → ラトリオの名前。自分の結びつけが優先) ----------------
let SHARED = { links: {}, v: -1, t: 0 };
// ゲームのアイテム番号 → ラトリオの番号(item_link.json。tools/make_item_link.py が名前の照合を作るときに1回だけやった表)。実行時の名前の照合より先に引き、候補の中にあるときだけ使う
let ITEMLINK = { i: {}, c: {} };
fetch("/api/itemlink").then((r) => r.json()).then((d) => { if (d && d.i) ITEMLINK = d; }).catch(() => {});
const itemLinkOf = (gameId, isCard) => (ITEMLINK[isCard ? "c" : "i"] || {})[gameId];
const ratLinkOf = (id) => (SETTINGS.ratLinks || {})[id] ?? (SHARED.links || {})[id];      // (計算機の装備の引き当てでは使わない: 自分の結びつけ → 名前の一致 → 共有の表、の順にするため。simcFind・ratFindOption を見る)
async function sharedLoad() {
  try { const j = await (await fetch("/api/links")).json(); if (j && j.links) SHARED = j; } catch (e) {}
}
function myUnsharedLinks() {      // 自分の結びつけのうち、共有の表と違うもの(提案できるもの)
  const out = {}; Object.entries(SETTINGS.ratLinks || {}).forEach(([id, nm]) => { if (/^\d+$/.test(id) && nm && (SHARED.links || {})[id] !== nm) out[id] = nm; });
  return out;
}
let LICST = { state: "off" };
const LIC_TEXT = { none: "利用キーを入力してください(初回だけです)。", ok: "確認できています。", grace: "サーバーに確認できていません(オフラインでも猶予の間は使えます)。", expired: "長い間サーバーに確認できていません。ネットにつないで「今すぐ確認」を押してください。", revoked: "このキーは使えなくなっています。配布した人に聞いてください。" };
async function licLoad(show) {
  try { LICST = await (await fetch("/api/license")).json(); } catch (e) { return; }
  if (show && ["none", "revoked", "expired"].includes(LICST.state)) {
    let ok = true;                       // 止めない設定のときは、押し付けない(1日1回だけ出す)
    if (!LICST.enforce) { try { const d = new Date().toDateString(); ok = localStorage.getItem("md_lic_ask") !== d; localStorage.setItem("md_lic_ask", d); } catch (e) {} }
    if (ok) showLicKey();
  }
}
async function licPost(b) {
  try { LICST = await (await fetch("/api/license", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(); } catch (e) { LICST = { ...LICST, msg: "つながりませんでした" }; }
}
let LICMSG = "";      // 押したあとの結果(ダイアログを作り直しても残す)
function showLicKey() {
  document.querySelector(".licdlg.lickey")?.remove();
  if (LICST.state === "off") return;
  const st = LICST.state, bad = ["none", "revoked", "expired"].includes(st);
  const hard = LICST.enforce && bad;      // 止める設定のときは閉じられない
  const has = st !== "none";
  const badge = { none: ["未登録", "#c77d0a"], ok: ["登録済み・確認できています", "#1f9d55"], grace: ["登録済み(サーバーに確認できていません)", "#c77d0a"], expired: ["確認が必要です", "#d64545"], revoked: ["使えなくなっています", "#d64545"] }[st] || ["", "#888"];
  const t = LICST.last_ok ? new Date(LICST.last_ok * 1000).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const d = document.createElement("div"); d.className = "licdlg lickey";
  d.innerHTML = `<div class="licbox" style="max-width:480px"><div class="infoh"><b>利用キー</b>${hard ? "" : '<a class="infox" title="閉じる">×</a>'}</div>
    <div style="padding:12px 16px;line-height:1.7">
    <div style="font-size:15px;font-weight:600;color:${badge[1]}">● ${esc(badge[0])}</div>
    ${has ? `<div class="muted" style="margin:4px 0 10px">登録名: ${esc(LICST.name || "-")}${LICST.key_tail ? `　キー: …${esc(LICST.key_tail)}` : ""}${t ? `<br>最後に確認できた時刻: ${esc(t)}` : ""}${st === "grace" ? `<br>ネットにつながらなくても、あと${LICST.days_left ?? "-"}日は使えます。` : ""}</div>` : `<div class="muted" style="margin:4px 0 10px">配られた利用キーを入れてください(初回だけです)。いまは入れなくても今までどおり使えます。</div>`}
    ${LICST.msg ? `<div style="color:#d64545;margin-bottom:8px">${esc(LICST.msg)}</div>` : ""}
    ${LICMSG ? `<div style="margin-bottom:8px;color:#1f9d55" id="licres">${esc(LICMSG)}</div>` : ""}
    ${has && st !== "revoked" ? "" : `<input id="lickin" placeholder="FOX-XXXX-XXXX-XXXX-XXXX" style="width:100%;box-sizing:border-box;margin-bottom:8px" autocomplete="off"><div style="margin-bottom:10px"><button id="licok" class="pri">登録する</button></div>`}
    ${has ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px"><button id="licchk">サーバーに確認する</button>${hard ? "" : '<button id="licclose">閉じる</button>'}</div>
      <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">別の PC に移したいとき</summary><div class="muted" style="margin:6px 0">この PC の登録を解除します。そのあと別の PC でキーを入れ直してください(1つのキーで使える台数は決まっています)。<br><button id="licrel" style="margin-top:6px">この PC の登録を解除する</button></div></details>` : (hard ? "" : '<button id="licclose">あとで入れる</button>')}
    </div></div>`;
  d.onclick = (e) => { if (e.target === d && !hard || e.target.closest(".infox")) d.remove(); };
  document.body.appendChild(d);
  const redo = async (b, ok) => {
    const btn = d.querySelector("#licok,#licchk"); d.querySelectorAll("button").forEach((x) => (x.disabled = true));
    if (btn) btn.textContent = "確認中…";
    LICMSG = ""; await licPost(b);
    LICMSG = ok(LICST); showLicKey();
  };
  d.querySelector("#licok")?.addEventListener("click", () => redo({ key: d.querySelector("#lickin").value }, (r) => (r.state === "ok" ? "登録しました。" : "")));
  d.querySelector("#lickin")?.addEventListener("keydown", (e) => { if (e.key === "Enter") d.querySelector("#licok").click(); });
  d.querySelector("#licchk")?.addEventListener("click", () => redo({ check: 1 }, (r) => (r.state === "ok" ? "✓ 確認できました(" + new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + ")" : r.state === "revoked" ? "" : "サーバーにつながりませんでした。あとでもう一度試してください。")));
  d.querySelector("#licrel")?.addEventListener("click", () => { if (confirm("この PC の登録を解除します。よろしいですか?")) redo({ release: 1 }, (r) => (r.state === "none" ? "解除しました。" : "")); });
  d.querySelector("#licclose")?.addEventListener("click", () => d.remove());
}
licLoad(true);
$("#gear").onclick = (e) => {      // 歯車: イベント・入場履歴・設定のメニュー
  const r = e.currentTarget.getBoundingClientRect();
  const go = (k) => { TAB = k; store.set("md_tab", TAB); render(); };
  showCtx(Math.max(8, r.right - 200), r.bottom + 4, GEAR_TABS.map(([k, l]) => ({ label: (TAB === k ? "● " : "") + l + (k === "event" && GEAR_EVENTS ? `（${GEAR_EVENTS}件）` : ""), act: () => go(k) })).concat((LICST.state !== "off" ? [{ label: "利用キー", act: showLicKey }] : []), [{ label: "ライセンス・クレジット", act: showLicense }, { label: "アプリを終了", act: quitApp }]));
};
$("#tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; TAB = b.dataset.tab; store.set("md_tab", TAB); render(); };
setInterval(() => { if (DATA && ["weekly", "daily", "other", "nyar", "event", "history", "resist"].includes(TAB)) render(); }, 30000);      // 時間で表示が変わるタブだけ(計算機などは描き直さない)
setInterval(() => { if (DATA && !document.hidden && TAB !== "settings") load(true); }, 120000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && DATA) load(true); });

// この PC のツール(Fox_MD_Tracker)が出しているページなら、合言葉なし・こまめに更新
const LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && location.port === "8788";
if (LOCAL) { sharedLoad().then(() => { if (DATA && TAB === "settings") render(); }); setInterval(sharedLoad, 3600000); }      // 共有の結びつけ(配布元が承認した表)
// ---------------- 2台の同期(同じ利用キーの PC どうし。中身は暗号化して預ける。合言葉を足すと、サーバーの管理者にも読めなくなる) ----------------
// 同期するもの: 表示の設定(並び順・非表示・色・結びつけ など)・計算機のスロット・(選べば)枠の開け閉めなどの画面の記憶
// 混ぜ方: 前に同期したときの内容(md_syncbase = 前回預けた内容)との3者比べ。変えたほうを採用し、両方が変えた所はこの PC を優先(スロットは新しいほう)
// 安全装置: 画面を読み込む前・設定やスロットが空(読み込みの失敗かも)・大量に消える ときは、勝手に同期せず止める(「それでも同期する」で進める)
const SYNC_UI_KEYS = ["md_simfold", "md_simx", "md_evopen", "md_onlyok", "md_simv", "md_atk"];
const SYNC_SLOT_LOCAL = ["foxSet", "foxShadow", "foxSetSig", "foxShadowSig", "foxSetTag", "foxShadowTag"];      // PC ごとに決まる(その PC の装備セットの記号)ので同期しない
const SYNC = { busy: false, msg: "", hold: "", t: +store.get("md_synct") || 0, keyPw: "", keySalt: "", key: null, badPw: false };
const syncOn = () => store.get("md_sync") === "1";
const syncUiOn = () => store.get("md_syncui") === "1";      // 画面の記憶(標準でオフ)
const syncSetOn = () => store.get("md_syncset") !== "0";        // 表示の設定(標準でオン)
const syncSlotsOn = () => store.get("md_syncslots") !== "0";    // 計算機のスロット(標準でオン)
const recDmgOn = () => store.get("md_recdmg") === "1";          // 記録の引っ越しに被ダメの記録も含める(標準でオフ)
const syncJeq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const syncIsObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const syncN = (o) => Object.keys(o || {}).length;
function syncB64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
const syncUnB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
async function syncCryptoKey() {
  const extra = store.get("md_syncpw") || "", secret = (LICST && LICST.sync_secret) || "", salt = (LICST && LICST.salt) || "";
  if (!secret || !salt) throw new Error("利用キーを確認できません");
  const pw = secret + "|" + extra;          // 利用キーから作った秘密 + (入れていれば)合言葉。合言葉なしでも、キーを知らない人には読めない
  if (SYNC.key && SYNC.keyPw === pw && SYNC.keySalt === salt) return SYNC.key;
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  SYNC.key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: new TextEncoder().encode("fox-md-sync-v2|" + salt), iterations: 300000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  SYNC.keyPw = pw; SYNC.keySalt = salt;
  return SYNC.key;
}
async function syncEnc(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await syncCryptoKey(), new TextEncoder().encode(JSON.stringify(obj))));
  return syncB64(iv) + "." + syncB64(ct);
}
async function syncDec(text) {
  if (typeof text !== "string" || !text.includes(".")) throw new Error("サーバーの返事が正しくありません");
  const [a, b] = text.split(".");
  const key = await syncCryptoKey();
  try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: syncUnB64(a) }, key, syncUnB64(b)))); }
  catch (e) { const er = new Error("復号できません。2台の合言葉の有無・内容が合っているか、同じ利用キーか確認してください"); er.badPw = true; throw er; }
}
async function syncApi(body) {
  const r = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.ok !== true && j.reason !== "conflict") throw new Error(j.error || (j.reason ? "同期できません(" + j.reason + ")" : "サーバーの返事が正しくありません"));
  return j;
}
async function syncRawSlots() {          // 読めなかったときは例外(空と区別する)
  const r = await fetch("/api/simchars");
  if (!r.ok) throw new Error("計算機のスロットを読めませんでした");
  const j = await r.json();
  if (!syncIsObj(j)) throw new Error("計算機のスロットを読めませんでした");
  return j;
}
function syncStripSlot(c) {              // 同期する形(PC ごとの印は外す)
  const o = { name: c.name, model: JSON.parse(JSON.stringify(c.model || {})), saved: c.saved ? JSON.parse(JSON.stringify(c.saved)) : undefined, updated: c.updated };
  SYNC_SLOT_LOCAL.forEach((k) => { delete o.model[k]; if (o.saved) delete o.saved[k]; });
  return o;
}
async function syncCollect() {           // いまのこの PC の同期するものを集める
  if (!DATA) throw new Error("画面の読み込みが終わっていません");
  const out = {};
  if (syncSetOn()) out.settings = JSON.parse(JSON.stringify(SETTINGS || {}));      // オフの項目は持たない(預けてある分をそのまま残す)
  if (syncSlotsOn()) { const chars = await syncRawSlots(); const slots = {}; Object.entries(chars).forEach(([id, c]) => { slots[id] = syncStripSlot(c); }); out.simchars = slots; }
  if (syncUiOn()) { out.ui = {}; SYNC_UI_KEYS.forEach((k) => { const v = store.get(k); if (v != null) out.ui[k] = v; }); }      // 画面の記憶を揃えない PC は ui を持たない(相手の ui を消さない)
  return out;
}
function syncMerge3(base, loc, rem, depth, opt) {      // 変えたほうを採用(両方変えた所は loc)。オブジェクトは depth の深さまで項目ごとに混ぜる
  const eq = depth === 0 && opt && opt.eq ? opt.eq : syncJeq;      // 項目そのもの(いちばん下)だけ、専用の比べ方を使う
  if (eq(loc, rem)) return loc;
  if (eq(base, loc)) return rem;
  if (eq(base, rem)) return loc;
  if (depth > 0 && syncIsObj(loc) && syncIsObj(rem)) {
    const out = {}, b = syncIsObj(base) ? base : {};
    for (const k of new Set([...Object.keys(loc), ...Object.keys(rem)])) { const v = syncMerge3(b[k], loc[k], rem[k], depth - 1, opt); if (v !== undefined) out[k] = v; }
    return out;
  }
  if (opt && opt.pick && loc !== undefined && rem !== undefined) return opt.pick(loc, rem);
  return loc;
}
const syncSlotEq = (a, b) => (a === undefined || b === undefined) ? a === b : syncJeq({ n: a.name, m: a.model, s: a.saved }, { n: b.name, m: b.model, s: b.saved });
function syncMergePayload(base, loc, rem) {
  const b = base || { settings: {}, simchars: {}, ui: {} };
  const one = (k, f) => (loc[k] === undefined ? rem[k] : rem[k] === undefined ? loc[k] : f(b[k], loc[k], rem[k]));      // どちらかがその項目を持たないとき(オフ)は、持っているほうをそのまま
  const out = {}, parts = {
    settings: one("settings", (bb, l, r) => syncMerge3(bb, l, r, 2)),
    simchars: one("simchars", (bb, l, r) => syncMerge3(bb, l, r, 1, { eq: syncSlotEq, pick: (x, y) => ((y.updated || 0) > (x.updated || 0) ? y : x) })),
    ui: one("ui", (bb, l, r) => syncMerge3(bb, l, r, 1)),
  };
  Object.entries(parts).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
  return out;
}
// strictUi: 預ける側の比べ方(こちらに画面の記憶があって相手に無ければ「違う」)。ふつうは、どちらかが画面の記憶を揃えない PC なら ui は比べない
const syncPartEq = (x, y, strict, eq) => x === undefined || (y === undefined && !strict) || eq(x, y === undefined ? {} : y);      // その項目を持たない側(オフ)は比べない
const syncSlotsEq = (x, y) => Object.keys({ ...x, ...y }).every((id) => syncSlotEq(x[id], y[id]));
const syncPayloadEq = (a, b, strict) => syncPartEq(a.settings, b.settings, strict, syncJeq) && syncPartEq(a.ui, b.ui, strict, syncJeq) && syncPartEq(a.simchars, b.simchars, strict, syncSlotsEq);
function syncGuard(base, loc, merged, rem) {      // 大事なものが消えそうなら理由を返す(なければ null)
  if (base) {
    if (loc.settings !== undefined && !syncN(loc.settings) && syncN(base.settings)) return "この PC の設定が空になっています(読み込みに失敗した可能性があります)。";
    if (loc.simchars !== undefined && !syncN(loc.simchars) && syncN(base.simchars)) return "この PC の計算機のスロットが空になっています(読み込みに失敗した可能性があります)。";
  }
  const lost = (a, b) => Object.keys(a || {}).filter((k) => !(k in (b || {}))).length;
  // src の項目の半分以上が、混ぜた結果で消える(src = loc: ほかの PC の変更で、この PC のものが減る / src = rem: この PC の削除が、ほかの PC に広がる)
  for (const [src, msg] of [[loc, "ほかの PC の変更で、この PC のスロット・設定が大きく減ります。"], [rem && rem !== base ? rem : null, "この PC で消した分が、ほかの PC からも大きく消えます。"]]) {
    if (!src) continue;
    const ns = syncN(src.simchars), nk = syncN(src.settings);
    if ((src.simchars !== undefined && merged.simchars !== undefined && ns >= 3 && lost(src.simchars, merged.simchars) >= Math.ceil(ns / 2)) || (src.settings !== undefined && merged.settings !== undefined && nk >= 4 && lost(src.settings, merged.settings) >= Math.ceil(nk / 2))) return msg;
  }
  return null;
}
async function syncApply(m, loc) {       // 混ぜた結果を、この PC に書く
  const doSet = syncSetOn() && m.settings !== undefined && loc.settings !== undefined, doSlots = syncSlotsOn() && m.simchars !== undefined && loc.simchars !== undefined;
  if (doSet && !syncJeq(SETTINGS, loc.settings)) throw new Error("設定を操作中だったため、次の同期に回します");
  if (typeof SIMC !== "undefined" && SIMC.saveT) throw new Error("計算機を操作中だったため、次の同期に回します");      // 保存待ちの編集が残っている間は書かない
  if (doSet && !syncJeq(m.settings, loc.settings)) { Object.keys(SETTINGS).forEach((k) => delete SETTINGS[k]); Object.assign(SETTINGS, m.settings); saveSettings(); }
  const raw = doSlots ? await syncRawSlots() : {};
  for (const id of doSlots ? new Set([...Object.keys(m.simchars), ...Object.keys(loc.simchars)]) : []) {
    const a = m.simchars[id], o = loc.simchars[id];
    if (syncSlotEq(a, o)) continue;
    const nowRaw = (await syncRawSlots())[id];       // 書く直前にもう一度読み、集めたあとに変わっていたら止める(操作中の編集を上書きしない)
    if (!syncSlotEq(nowRaw ? syncStripSlot(nowRaw) : undefined, o)) throw new Error("計算機を操作中だったため、次の同期に回します");
    let body;
    if (a) {            // この PC の装備セットの印は、この PC のものを残す
      const keep = (src) => { const x = {}; SYNC_SLOT_LOCAL.forEach((k) => { if (src && src[k] !== undefined) x[k] = src[k]; }); return x; };
      const lc = raw[id] || {};
      body = { id, name: a.name, model: { ...a.model, ...keep(lc.model) }, saved: a.saved ? { ...a.saved, ...keep(lc.saved) } : undefined };
    } else body = { id, delete: 1 };
    const r = await fetch("/api/simchars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("計算機のスロットを書けませんでした");
  }
  if (syncUiOn() && m.ui !== undefined) {
    Object.entries(m.ui).forEach(([k, v]) => { if (SYNC_UI_KEYS.includes(k)) store.set(k, v); });
    Object.keys(loc.ui || {}).forEach((k) => { if (!(k in m.ui)) store.del(k); });
  }
}
async function syncNow(opt) {          // opt.take = 初回だけ「ほかの PC のデータに合わせる」 / opt.force = 安全装置を越えて進める
  if (SYNC.busy || !LOCAL || !DATA) return;
  if (!LICST || LICST.state === "off") await licLoad(false);
  if (!LICST || !["ok", "grace"].includes(LICST.state)) { SYNC.msg = "利用キーが登録されていないため、同期できません。"; syncPaint(); return; }
  SYNC.busy = true; SYNC.msg = "同期中…"; SYNC.hold = ""; syncPaint();
  let changed = false, done = false;
  try {
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const ver = +(store.get("md_syncver") || -1), baseStr = store.get("md_syncbase"), base = baseStr ? JSON.parse(baseStr) : null;
      const r = await syncApi({ op: "get", since: ver });
      const loc = await syncCollect();
      let rem, merged;
      if (r.empty) { rem = null; merged = loc; }
      else if (r.same) { rem = base; merged = { ...loc }; if (base) ["settings", "simchars", "ui"].forEach((k) => { if (loc[k] === undefined && base[k] !== undefined) merged[k] = base[k]; }); }      // オフの項目は、預けてある分をそのまま残す
      else {
        rem = await syncDec(r.data);
        merged = (!base && opt && opt.take) ? rem : syncMergePayload(base, loc, rem);
      }
      const why = !(opt && (opt.force || opt.take)) ? syncGuard(base, loc, merged, rem) : null;      // 「ほかの PC に合わせる」は本人が確認ずみ
      if (why) { SYNC.hold = why; SYNC.msg = "安全のため、同期を止めました。" + why; break; }
      if (!syncPayloadEq(merged, loc)) { await syncApply(merged, loc); changed = true; }
      let newVer = r.v;
      if (!rem || !syncPayloadEq(merged, rem, true)) {
        const p = await syncApi({ op: "put", base: r.empty ? 0 : r.v, data: await syncEnc(merged) });
        if (p.ok === false) continue;           // 先に別の PC が書いた → もう一度(取り込んで混ぜ直す)
        newVer = p.v;
      }
      try { localStorage.setItem("md_syncbase", JSON.stringify(merged)); localStorage.setItem("md_syncver", String(newVer)); }      // 預けた内容(混ぜた結果)を「前回の内容」として覚える
      catch (e) { store.del("md_syncbase"); store.del("md_syncver"); throw new Error("前回の同期の内容を、この画面に保存できませんでした（保存の容量がいっぱいです）。計算機のスロットを整理するか、同期の項目を減らしてください"); }
      SYNC.t = Date.now(); store.set("md_synct", String(SYNC.t)); SYNC.msg = changed ? "ほかの PC の変更を取り込みました。" : "同期しました。"; SYNC.badPw = false; done = true;
    }
    if (!done && !SYNC.hold) SYNC.msg = "混み合っていて同期できませんでした。もう一度試してください。";
  } catch (e) { SYNC.msg = "同期できませんでした: " + e.message; SYNC.badPw = !!e.badPw; }
  SYNC.busy = false; syncPaint();
  if (changed) { try { if (typeof simcLoad === "function") await simcLoad(); await load(); render(); } catch (e) {} }
}
async function syncReset() {           // 合言葉を忘れたとき: この PC の内容で、預けてあるデータを作り直す
  if (!confirm("預けてある同期データを、この PC の内容で作り直します(合言葉・利用キーが合わず読めなくなったときに使います)。\n\nこの PC に無いスロット・設定は、同期している ほかの PC からも消える場合があります(消える前に確認が出ます)。よろしいですか?")) return;
  if (!DATA) return;
  SYNC.busy = true; syncPaint();
  try { const r = await syncApi({ op: "get", since: -1 }); const loc = await syncCollect(); const p = await syncApi({ op: "put", base: r.empty ? 0 : r.v, data: await syncEnc(loc) }); if (p.ok === false) throw new Error("もう一度試してください"); store.set("md_syncver", String(p.v)); store.set("md_syncbase", JSON.stringify(loc)); SYNC.msg = "作り直しました。"; SYNC.badPw = false; SYNC.t = Date.now(); store.set("md_synct", String(SYNC.t)); }
  catch (e) { SYNC.msg = "できませんでした: " + e.message; }
  SYNC.busy = false; syncPaint();
}
function syncBanner() {      // 止まっているときは、どの画面でも気づけるように上に出す
  let b = document.querySelector("#syncbanner");
  if (!SYNC.hold) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement("div"); b.id = "syncbanner"; b.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;background:#7a4b00;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;max-width:90vw;box-shadow:0 2px 8px rgba(0,0,0,.4)"; b.onclick = () => { TAB = "settings"; store.set("md_tab", TAB); render(); }; document.body.appendChild(b); }
  b.textContent = "同期が止まっています: " + SYNC.hold + "（クリックして設定タブで確認）";
}
function syncPaint() { syncBanner(); const el = document.querySelector("#syncmsg"); if (el) { el.innerHTML = syncStatusHtml(); syncBindStatus(); } const b = document.querySelector("#syncnow"); if (b) b.disabled = SYNC.busy; }
function syncStatusHtml() {
  const when = SYNC.t ? new Date(SYNC.t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "まだ";
  return `${SYNC.busy ? '<span class="spin"></span> ' : ""}${esc(SYNC.msg || "")} <span class="muted">（最後に同期: ${esc(when)}）</span>${SYNC.hold ? ' <button class="ghost" id="syncforce">それでも同期する</button>' : ""}${SYNC.badPw ? ' <button class="ghost" id="syncreset">同期データを作り直す</button>' : ""}`;
}
function syncSettingsHtml() {
  const on = syncOn(), ui = syncUiOn();
  return `<h2>2台の同期</h2><div class="panel list">
    <div class="row"><span class="nm">同じ利用キーの PC どうしで、設定・計算機のスロットを揃えます（自動）。<span class="muted">（中身は暗号化して預けます。利用キーを持つ PC だけが読めます。通信の記録（被ダメなど）は対象外です。計算機のスロットに着せた装備セットの記号は、PC ごとのものを使います）</span></span></div>
    <div class="row"><label class="nm"><input type="checkbox" id="synccb" ${on ? "checked" : ""}> 同期する</label></div>
    <div class="row"><span class="nm">合言葉（任意）<span class="muted">（入れると、サーバーの管理者にも読めなくなります。使うなら2台とも同じものを入れます。8文字以上・長めの文章がおすすめ。空のままでも同期できます）</span></span><input class="lbl" type="password" id="syncpw" autocomplete="off" value="${esc(store.get("md_syncpw") || "")}" style="min-width:200px"></div>
    <div class="row"><span class="nm">同期する項目（自動）:</span>
      <label class="nm"><input type="checkbox" id="syncsetcb" ${syncSetOn() ? "checked" : ""}> 表示の設定（並び順・非表示・色・結びつけなど）</label>
      <label class="nm"><input type="checkbox" id="syncslotscb" ${syncSlotsOn() ? "checked" : ""}> 計算機のスロット</label>
      <label class="nm"><input type="checkbox" id="syncuicb" ${ui ? "checked" : ""}> 枠の開け閉めなど画面の記憶</label></div>
    <div class="row"><span class="nm" id="syncmsg">${syncStatusHtml()}</span><button class="ghost" id="syncnow" ${on ? "" : "disabled"}>今すぐ同期</button></div></div>` + `    <h2>記録（キャラ・装備・MD）の引っ越し</h2><div class="panel list">
    <div class="row"><span class="nm">ゲームの通信から集めた記録は、<b>自動では同期しません</b>（同じキャラを2台で別々に遊ぶと、回数などを正しく混ぜられないため）。サブ PC に記録をコピーしたいときは、記録のある PC で「記録を預ける」→ ほかの PC で「足す」か「置きかえる」を押します。取り込む前に、元の記録のバックアップを取ります。被ダメの記録は、標準では対象外です（下のチェックで含められます）。</span></div>
    <div class="row"><label class="nm"><input type="checkbox" id="recdmgcb" ${recDmgOn() ? "checked" : ""}> 被ダメの記録も含める <span class="muted">（標準はオフ。含めるときは、預けるときと取り込むときの両方でオンにします。「足す」では、この PC に無いキャラの分だけ足し、「置きかえる」では被ダメの記録ごと置きかえます）</span></label></div>
    <div class="row"><button class="ghost" id="recput">この PC の記録を預ける</button> <button class="ghost" id="recadd">預けてある記録を足す（無いものだけ）</button> <button class="ghost" id="recrep">預けてある記録で置きかえる</button></div>
    <div class="row"><span class="nm muted" id="recmsg">${esc(REC.msg || "")}</span></div></div>`;
}
function syncBindStatus() { const rs = document.querySelector("#syncreset"); if (rs) rs.onclick = syncReset; const f = document.querySelector("#syncforce"); if (f) f.onclick = () => syncNow({ force: true }); }
function syncBind() {
  const cb = $("#synccb"); if (!cb) return;
  syncBindStatus();
  $("#syncpw").onchange = (e) => {
    const v = e.target.value, old = store.get("md_syncpw") || "";
    if (v && v.length < 8) { alert("合言葉は8文字以上にしてください(使わないときは空にします)。"); e.target.value = old; return; }
    if (v === old) return;
    store.set("md_syncpw", v); SYNC.key = null;
    if (syncOn()) { store.set("md_sync", "0"); store.del("md_syncbase"); store.del("md_syncver"); SYNC.msg = "合言葉を変えたので、同期を止めました。もう一度「同期する」にしてください(ほかの PC のデータと合うか確認します)。"; render(); }
  };
  $("#syncuicb").onchange = (e) => { store.set("md_syncui", e.target.checked ? "1" : "0"); };
  $("#syncsetcb").onchange = (e) => { store.set("md_syncset", e.target.checked ? "1" : "0"); };
  $("#syncslotscb").onchange = (e) => { store.set("md_syncslots", e.target.checked ? "1" : "0"); };
  $("#recdmgcb").onchange = (e) => { store.set("md_recdmg", e.target.checked ? "1" : "0"); };
  cb.onchange = async () => {
    if (!cb.checked) { store.set("md_sync", "0"); SYNC.msg = "同期を止めました。"; render(); return; }
    const pw = $("#syncpw").value; if (pw && pw.length < 8) { cb.checked = false; alert("合言葉は8文字以上にしてください(使わないときは空にします)。"); return; }
    store.set("md_syncpw", pw); SYNC.key = null;
    let take = false;
    try {
      if (!LICST || LICST.state === "off") await licLoad(false);
      const r = await syncApi({ op: "get", since: -1 });
      if (!r.empty) {
        await syncDec(r.data);          // 合言葉が合うか、ここで確かめる(違えば同期は始めない)
        if (!store.get("md_syncbase")) take = confirm("ほかの PC が預けたデータがあります。\n\nこの PC の設定を、そのデータに合わせますか?\n\n［OK］ほかの PC に合わせる（この PC の設定は置きかわります）\n［キャンセル］この PC の設定と混ぜる");
      }
    } catch (e) { cb.checked = false; SYNC.msg = "始められませんでした: " + e.message; SYNC.badPw = !!e.badPw; render(); return; }
    store.set("md_sync", "1"); syncNow({ take });
  };
  $("#syncnow").onclick = () => syncNow();
  $("#recput").onclick = recPut; $("#recadd").onclick = () => recPull("add"); $("#recrep").onclick = () => recPull("replace");
}

// ---- 記録(キャラ・装備・MD の記録)の手動の「預ける」「取り込む」 ----
// 自動では同期しない(同じキャラを2台で別々に遊ぶと、ニャル様の回数などを正しく混ぜる決まりが無く、静かに記録を壊す危険があるため)。
// 向きを選んで行い、取り込む前にバックアップを取る。「足す」= この PC に無いものだけ / 「置きかえる」= 預けてある記録にそろえる。被ダメは対象外。
const REC = { msg: "" };
async function syncRecordsApi(body) {
  const r = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "記録を読めませんでした");
  return j;
}
function recMsg(t) { REC.msg = t; const el = document.querySelector("#recmsg"); if (el) el.textContent = t; }
const recWhen = (t) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
async function recPut() {
  if (!DATA) return;
  try {
    if (!LICST || LICST.state === "off") await licLoad(false);
    recMsg("確認中…");
    const cur = await syncApi({ op: "get", slot: "rec", since: -1 });
    if (!cur.empty) {
      let when = "読めない内容";
      try { const d = await syncDec(cur.data); when = recWhen(d.t); } catch (e) {}
      if (!confirm("預けてある記録（" + when + "）を、この PC の記録で上書きします。よろしいですか?")) { recMsg(""); return; }
    }
    const rj = await syncRecordsApi({ op: "export", dmg: recDmgOn() });
    const p = await syncApi({ op: "put", slot: "rec", base: cur.empty ? 0 : cur.v, data: await syncEnc({ kind: "records", t: Date.now(), records: rj.records }) });
    if (p.ok === false) throw new Error("ほかの PC が同時に預けました。もう一度試してください");
    const c = rj.records;
    recMsg((c.dmg ? "被ダメの記録つきで" : "") + "預けました（キャラ " + Object.keys((c.cs || {}).chars || {}).length + "人・装備セット " + Object.keys((c.cs || {}).sets || {}).length + "個）。ほかの PC で「足す」か「置きかえる」を押すと取り込めます。");
  } catch (e) { recMsg("できませんでした: " + e.message); }
}
async function recPull(mode) {
  if (!DATA) return;
  try {
    if (!LICST || LICST.state === "off") await licLoad(false);
    recMsg("確認中…");
    const r = await syncApi({ op: "get", slot: "rec", since: -1 });
    if (r.empty) { recMsg("預けてある記録がありません。先に、記録のある PC で「記録を預ける」を押してください。"); return; }
    const d = await syncDec(r.data);
    if (!d || !d.records) throw new Error("預けてある記録の形が違います");
    const useDmg = recDmgOn() && !!d.records.dmg;
    const pv = await syncRecordsApi({ op: "preview", remote: d.records, dmg: useDmg });
    let text;
    if (mode === "replace") text = "この PC の記録（キャラ " + pv.local.chars + "人・装備セット " + pv.local.sets + "個）を、預けてある記録（" + recWhen(d.t) + "・キャラ " + pv.remote.chars + "人・装備セット " + pv.remote.sets + "個）で置きかえます。\n\nこの PC だけにあるキャラ・装備セットは消えます（元の記録は「同期前のバックアップ」フォルダに残ります）。この PC だけで作った装備セットを着せていた計算機のスロットは、装備セットとの紐づけが外れることがあります（装備そのものは残ります）。";
    else text = "預けてある記録（" + recWhen(d.t) + "）から、この PC に無いものを足します。\n\n足されるキャラ: " + (pv.n_add_chars ? pv.n_add_chars + "人（" + pv.add_chars.map((n) => n.replace(/@.*$/, "")).slice(0, 8).join("、") + (pv.n_add_chars > 8 ? "…" : "") + "）" : "なし") + "\nこの PC にある記録は変わりません。";
    if (recDmgOn() && !d.records.dmg) text += "\n\n※ 預けてある記録に被ダメの記録は入っていません（預ける側でも「被ダメの記録も含める」をオンにして預け直してください）。";
    if (useDmg) text += mode === "replace" ? "\n\n被ダメの記録（キャラ " + pv.dmg_remote_chars + "人分）も、預けてある記録で置きかえます。この PC の被ダメの記録は、バックアップに残ります。" : "\n\n被ダメの記録は、この PC に無いキャラの分（" + pv.dmg_add_chars + "人）だけ足します。";
    if (mode === "replace" && pv.remote.chars < pv.local.chars) text = "⚠ 預けてある記録のほうが、キャラが少ないです（この PC " + pv.local.chars + "人 → 預けてある記録 " + pv.remote.chars + "人）。置きかえると、差の分のキャラの記録が消えます。\n\n" + text;
    if (pv.live && pv.live.length) text += "\n\n※ いまログイン中のキャラ（" + pv.live.map((n) => n.replace(/@.*$/, "")).join("、") + "）の記録は置きかえません。ゲームを終了している場合は、そのまま進めて大丈夫です。";
    if (!confirm(text + "\n\nよろしいですか?")) { recMsg(""); return; }
    const a = await syncRecordsApi({ op: "apply", mode, remote: d.records, dmg: useDmg });
    recMsg(a.changed ? "取り込みました。" : "変わるものはありませんでした。");
    if (a.changed) { await load(); render(); }
  } catch (e) { recMsg(e.badPw ? "取り込めません: 合言葉の有無・内容、または利用キーが、預けた PC と合いません。" : "できませんでした: " + e.message); }
}
if (LOCAL) {
  setTimeout(() => { if (syncOn()) syncNow(); }, 25000);
  setInterval(() => { if (syncOn() && !document.hidden) syncNow(); }, 180000);
}
