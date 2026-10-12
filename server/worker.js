// Fox_MD_Tracker 利用キーの確認サーバー(Cloudflare Worker + KV)
// KV 名: LICENSES   /   秘密: ADMIN_TOKEN(キーの発行・停止用。wrangler secret put ADMIN_TOKEN)
// KV の中身: "key:<キー>" = {name, status: "active"|"revoked", limit, pcs: [{pcid, pcname, first, last}], created}
// 個人情報は集めない(PC識別子はアプリ側でハッシュにしたもの)。

const J = { "content-type": "application/json; charset=utf-8" };
const out = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: J });
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";      // 見間違えやすい文字(0/O・1/I)を除く

function newKey() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const s = Array.from(b, (x) => ALPHA[x % ALPHA.length]).join("");
  return "FOX-" + s.match(/.{4}/g).join("-");
}
const norm = (k) => String(k || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
const getRec = async (env, key) => {
  const t = await env.LICENSES.get("key:" + key);
  return t ? JSON.parse(t) : null;
};
const putRec = (env, key, rec) => env.LICENSES.put("key:" + key, JSON.stringify(rec));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    let b = {};
    if (req.method === "POST") {
      try { b = await req.json(); } catch (e) { return out({ error: "bad json" }, 400); }
    }

    // ---- 管理(発行・停止・一覧) ----
    if (url.pathname.startsWith("/admin/")) {
      if (!env.ADMIN_TOKEN || req.headers.get("authorization") !== "Bearer " + env.ADMIN_TOKEN) return out({ error: "forbidden" }, 403);
      if (url.pathname === "/admin/issue") {
        const key = newKey();
        const rec = { name: String(b.name || "").slice(0, 40), status: "active", limit: Math.min(5, Math.max(1, +b.limit || 2)), pcs: [], created: Date.now() };
        await putRec(env, key, rec);
        return out({ key, ...rec });
      }
      if (url.pathname === "/admin/revoke" || url.pathname === "/admin/restore") {
        const key = norm(b.key), rec = await getRec(env, key);
        if (!rec) return out({ error: "not found" }, 404);
        rec.status = url.pathname === "/admin/revoke" ? "revoked" : "active";
        await putRec(env, key, rec);
        return out({ key, status: rec.status });
      }
      if (url.pathname === "/admin/release") {       // PC を1台はずす(買い替え・故障)
        const key = norm(b.key), rec = await getRec(env, key);
        if (!rec) return out({ error: "not found" }, 404);
        rec.pcs = rec.pcs.filter((p) => p.pcid !== String(b.pcid || ""));
        await putRec(env, key, rec);
        return out({ key, pcs: rec.pcs.length });
      }
      if (url.pathname === "/admin/list") {
        const l = await env.LICENSES.list({ prefix: "key:" });
        const rows = [];
        for (const k of l.keys) {
          const r = JSON.parse((await env.LICENSES.get(k.name)) || "{}");
          rows.push({ key: k.name.slice(4), name: r.name, status: r.status, limit: r.limit, pcs: (r.pcs || []).map((p) => ({ pcname: p.pcname, last: p.last })) });
        }
        return out({ rows });
      }
      return out({ error: "not found" }, 404);
    }

    // ---- アプリから: 登録(初回) / 確認(起動時・1日1回) / 解除(この PC をはずす) ----
    if (req.method === "POST" && ["/activate", "/check", "/release"].includes(url.pathname)) {
      const key = norm(b.key), pcid = String(b.pcid || "").slice(0, 64);
      if (!key || !pcid) return out({ ok: false, reason: "bad request" }, 400);
      const rec = await getRec(env, key);
      if (!rec) return out({ ok: false, reason: "unknown" });           // 存在しないキー
      if (rec.status !== "active") return out({ ok: false, reason: "revoked" });
      const now = Date.now();
      const me = rec.pcs.find((p) => p.pcid === pcid);
      if (url.pathname === "/release") {
        rec.pcs = rec.pcs.filter((p) => p.pcid !== pcid);
        await putRec(env, key, rec);
        return out({ ok: true });
      }
      if (me) {
        me.last = now;
        if (b.pcname) me.pcname = String(b.pcname).slice(0, 40);
      } else {
        if (url.pathname === "/check") return out({ ok: false, reason: "notregistered" });   // 解除された PC
        if (rec.pcs.length >= rec.limit) return out({ ok: false, reason: "limit", limit: rec.limit, pcs: rec.pcs.map((p) => p.pcname || "PC") });
        rec.pcs.push({ pcid, pcname: String(b.pcname || "").slice(0, 40), first: now, last: now });
      }
      await putRec(env, key, rec);
      return out({ ok: true, name: rec.name, limit: rec.limit, pcs: rec.pcs.length });
    }
    return out({ error: "not found" }, 404);
  },
};
