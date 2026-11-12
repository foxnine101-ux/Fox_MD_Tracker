"""家計簿: キャラごとのゼニーの増減と、そのとき動いた品物を記録する(この PC だけ。どこにも送らない)。

確かめてある通信だけを土台にする:
  ゼニー 00B1/0ACB(変数20) ・ 持ち物に増えた 0B41 ・ 持ち物から消えた 07FA(倉庫・カートへの移動は除く)
1回分の記録 = ゼニーが1回動いたこと + その前後 WIN 秒に動いた品物。
「何で動いたか」(露店で売れた・買取露店・メールなど)は、前後に届いた通信からの見立て(未確認。動作ログに中身を残して確かめる)。
"""
import json
import os
import struct
import threading
import time
from collections import deque

WIN = 1.2            # ゼニーの変化と品物の変化を、同じ取引とみなす前後の秒数
KEEP_ROWS = 30000    # 明細の上限(古いものから捨てる)
KEEP_DAYS = 400
SHOP_SEC = 600       # 露店の品の一覧を見てから、この秒数のうちの購入は「露店で買った」とみなす
NPC_SEC = 300
ITEM_SIZES = (34, 31, 27)
EQUIP_SIZE = 68

# 見立てに使う通信(形は rAthena から。jRO では未確認なので、最初の数回は中身を動作ログに残す)
OP_VEND_SOLD = (0x0137, 0x09E5)        # 自分の露店で売れた [カートの番号2][個数2](09E5 は +買った人・時刻・金額)
OP_CART_DEL = 0x0125                   # カートから消えた [番号2][個数4]
OP_MY_VEND = 0x0136                    # 自分の露店の品の一覧(値段つき)
OP_SHOP = (0x0133, 0x0800, 0x0B3D, 0x0B62)   # 人の露店の品の一覧(値段つき。jRO は 0B3D(先頭12)・0B62(先頭17)。RO Storage Manager の実測)
OP_SEARCH_RES = 0x0B64                 # 露店検索の結果(N鯖の販売アイテム検索)。先頭7 + 142バイト×n: 品@88・1個の値段@93・個数@97(RO Storage Manager の実測)
OP_BS_BOUGHT = (0x081B, 0x09E6)        # 自分の買取露店が買い取った
OP_BS_SOLD = 0x081C                    # 人の買取露店に売った [持ち物の番号2][個数2][金額4]
OP_BS_VIEW = (0x0818, 0x0813)          # 買取露店の一覧(人の・自分の)
OP_NPC = (0x00C6, 0x00C7, 0x00C4)      # NPC のお店の一覧(買う・売る・選ぶ)
OP_NPC_RES = (0x00CA, 0x00CB)
OP_MAIL_Z, OP_MAIL_I = 0x09F2, 0x09F4  # メールからゼニー・品を受け取った
OP_MAIL = (0x09EB, 0x0AC2, 0x09F0, 0x0A7D, 0x09E7)     # メールを読んだ・一覧・新着
OP_TRADE = (0x00F0, 0x00E9, 0x00EC)    # 取引(成立・品が足された・始まった)
OP_SEARCH = (0x0836, 0x0837, 0x083A, 0x083D, OP_SEARCH_RES)   # 露店検索(結果・見つからない・窓を開いた・品を押した)
CART_SEC = 15.0                        # 自分の露店で売れたとき、カートから消えた(0125)のあと、ゼニーが増えるまでの待ち(jRO の実測で 6秒)
OP_LIST = (0x0B08, 0x0B09, 0x0B39, 0x0B0B)
WATCH = set(OP_VEND_SOLD + (OP_CART_DEL, OP_MY_VEND) + OP_SHOP + OP_BS_BOUGHT + (OP_BS_SOLD,) + OP_BS_VIEW + OP_NPC + OP_NPC_RES
            + (OP_MAIL_Z, OP_MAIL_I) + OP_MAIL + OP_TRADE + OP_SEARCH)
OPS = WATCH | {0x00B1, 0x0ACB, 0x0B41, 0x07FA} | set(OP_LIST)
# 前後の通信を書き出すとき省く、いつも流れているもの(移動・出現・HP など)
NOISE = {0x0087, 0x0088, 0x0080, 0x0086, 0x09FD, 0x09FE, 0x09FF, 0x01DE, 0x08C8, 0x0ADF, 0x0095, 0x0A30, 0x00B0, 0x0A36,
         0x0B1B, 0x01FF, 0x0196, 0x0983, 0x0229, 0x0119, 0x007F, 0x0360, 0x0187, 0x00B4, 0x00B5, 0x02E1, 0x0A37, 0x0B4B}

KINDS = {      # 種類 -> 画面の名前
    "vend_sell": "露店で売れた", "vend_buy": "露店で買った", "vend_buy_mail": "露店で買った(品はメール)",
    "bs_sell": "買取露店に売った", "bs_buy": "買取露店で買い取った",
    "mail": "メールで受け取った", "mail_item": "メールで品を受け取った",
    "npc_buy": "NPCで買った", "npc_sell": "NPCに売った", "trade": "取引",
    "buy": "買った", "sell": "売った", "other_in": "その他の収入", "other_out": "その他の支出",
    "unseen": "見ていない間の増減",
}


class Ledger(object):
    def __init__(self, path, chars=None, md=None, id2name=None, log=print):
        self.path = path
        self.chars = chars          # char_core.CharCore(持ち物の番号 → 品を引く)
        self.md = md                # md_core(接続 → キャラ名)
        self.id2name = id2name if id2name is not None else (getattr(chars, "id2name", None) or {})
        self.log = log
        self.lock = threading.Lock()
        self.rows = []              # 明細 [{t, c, k, d, b, it:[[品, 個数(+増/-減), 精錬]], p?, ops?}]
        self.last = {}              # キャラ -> 最後に見た所持ゼニー(次のログインで「見ていない間の増減」を出す)
        self.t = 0                  # 最後に変わった時刻(画面が読み直す目安)
        self._c = {}                # 接続 -> 状態
        self._dirty = False
        self._saved = 0.0
        self._diag = {}
        self._nlog = 0
        self._nother = 0
        self.load()

    # ---------- 保存 ----------
    def load(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                d = json.load(f)
            self.rows = d.get("rows") or []
            self.last = d.get("last") or {}
            self.t = d.get("t") or 0
        except (OSError, ValueError):
            pass

    def save(self, force=False):
        with self.lock:
            if not self._dirty or (not force and time.time() - self._saved < 20):
                return
            cut = time.time() - KEEP_DAYS * 86400
            self.rows = [r for r in self.rows if r["t"] >= cut][-KEEP_ROWS:]
            data = json.dumps({"v": 1, "t": self.t, "rows": self.rows, "last": self.last}, ensure_ascii=False, separators=(",", ":"))
            self._dirty = False
            self._saved = time.time()
        tmp = self.path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(data)
            os.replace(tmp, self.path)
        except OSError as e:
            self.log("[家計簿] 保存できませんでした: {}".format(e))

    # ---------- 通信 ----------
    def _st(self, key):
        s = self._c.get(key)
        if s is None:
            s = self._c[key] = {"z": None, "tx": [], "ev": [], "hint": [], "ctx": {}, "cart": {}, "cart_t": 0, "vend": {},
                                "shop": None, "ring": deque(maxlen=200), "d41": None, "d07": None, "cartout": [], "bsl": None}
        return s

    def _name(self, key):
        n = None
        try:
            n = self.md.name_for(key) if self.md is not None else None
        except Exception:
            n = None
        return n or None

    def _iname(self, iid):
        return self.id2name.get(str(iid)) or "ID{}".format(iid)

    def feed(self, key, pkt):
        """届いた通信をすべて渡す(char_core より先に。消えた品の番号を、消える前の持ち物から引くため)。"""
        if len(pkt) < 2:
            return
        op = pkt[0] | (pkt[1] << 8)
        now = time.time()
        with self.lock:
            s = self._st(key)
            if op not in NOISE:
                s["ring"].append((now, op, len(pkt), bytes(pkt[:48])))
            if op not in OPS:
                self._close(key, s, now)
                return
            try:
                self._handle(key, s, op, pkt, now)
            except (struct.error, IndexError):
                pass
            self._close(key, s, now)

    def _raw(self, op, pkt):
        n = self._diag[op] = self._diag.get(op, 0) + 1
        if n <= 4:
            self.log("[家計簿] 確認用 通信 {:04X} {}バイト({}回目): {}".format(op, len(pkt), n, pkt[:64].hex()))

    def _handle(self, key, s, op, pkt, now):
        if (op == 0x00B1 and len(pkt) >= 8) or (op == 0x0ACB and len(pkt) >= 12):
            var, val = struct.unpack_from("<HI", pkt, 2) if op == 0x00B1 else struct.unpack_from("<Hq", pkt, 2)
            if var != 20 or val < 0:
                return
            name = self._name(key)
            if not name:
                s["z"] = None                 # キャラが決まるまでは数えない(決まってからの最初の値を起点にする)
                return
            prev = s["z"]
            s["z"] = val
            if prev is None:
                # この接続で最初の値。ログイン時の所持金はキャラ選択の一覧(0B72)で分かっている(char_core より先に読むので、まだ前の値が残っている)
                info = ((getattr(self.md, "char_info", None) or {}).get(name) or {}) if self.md is not None else {}
                prev = info.get("zeny")
                old = self.last.get(name)
                if prev is not None and old is not None and prev != old:      # 前回見た値との差は「見ていない間」(別の PC・ツールを止めていた間など)
                    self._add({"t": int(now), "c": name, "k": "unseen", "d": prev - old, "b": prev})
            if prev is not None and val != prev:
                s["tx"].append({"t": now, "c": name, "d": val - prev, "b": val})
            if self.last.get(name) != val:
                self.last[name] = val
                self._dirty = True
            return
        if op == 0x0B41 and len(pkt) >= 70:
            idx, cnt, itid = struct.unpack_from("<HHI", pkt, 2)
            sig = (idx, cnt, itid)
            if s["d41"] and s["d41"][0] == sig and now - s["d41"][1] < 0.8:       # 通常の読み取りと拾い直しの二重取り
                return
            s["d41"] = (sig, now)
            if itid:
                eq = bool(struct.unpack_from("<I", pkt, 28)[0])
                s["ev"].append({"t": now, "id": itid, "n": cnt or 1, "r": pkt[68] if eq else 0})
            return
        if op == 0x07FA and len(pkt) >= 8:
            reason, idx, amt = struct.unpack_from("<HHH", pkt, 2)
            if s["d07"] and s["d07"][0] == (idx, reason) and now - s["d07"][1] < 0.8:
                return
            s["d07"] = ((idx, reason), now)
            if reason in (4, 5):               # 倉庫・カートへ動かしただけ(取引ではない)
                return
            it = self._inv_item(key, idx)
            if it:
                s["ev"].append({"t": now, "id": it[0], "n": -(amt or 1), "r": it[1]})
            return
        if op in OP_LIST and len(pkt) >= 5:
            self._cart_list(s, op, pkt, now)
            return
        self._raw(op, pkt)
        if op in OP_VEND_SOLD and len(pkt) >= 6:
            idx, amt = struct.unpack_from("<HH", pkt, 2)
            z = struct.unpack_from("<I", pkt, 14)[0] if op == 0x09E5 and len(pkt) >= 18 else None
            it = s["vend"].get(idx) or s["cart"].get(idx)
            s["hint"].append({"t": now, "k": "vend_sell", "id": it[0] if it else None, "n": -(amt or 1), "r": it[1] if it else 0, "z": z, "idx": idx})
        elif op == OP_CART_DEL and len(pkt) >= 8:
            idx, amt = struct.unpack_from("<HI", pkt, 2)
            it = s["vend"].get(idx) or s["cart"].get(idx)
            # jRO の実測: 自分の露店で売れたとき 0137/09E5 は来ず、0125(カートから消えた)の 6秒ほどあとにゼニーが増える
            s["cartout"].append({"t": now, "id": it[0] if it else None, "n": -(amt or 1), "r": it[1] if it else 0, "idx": idx})
            c = s["cart"].get(idx)
            if c and c[2] is not None:
                c[2] -= amt
                if c[2] <= 0:
                    s["cart"].pop(idx, None)
        elif op == OP_MY_VEND:
            for e in self._shop_entries(pkt):
                s["vend"][e["idx"]] = (e["id"], e.get("r", 0), e["p"])
            s["ctx"]["myvend"] = now
        elif op in OP_SHOP:
            s["shop"] = (now, self._shop_entries(pkt))
            s["ctx"]["shop"] = now
        elif op in OP_BS_BOUGHT and len(pkt) >= 6:
            # jRO の実測(09E6・22バイト): [品4][個数2][1個の値段4]…  / 081B は rAthena の形 [品2][個数2][残りの上限4]
            if op == 0x09E6:
                itid, amt = struct.unpack_from("<IH", pkt, 2)
                z = struct.unpack_from("<I", pkt, 8)[0] if len(pkt) >= 12 else None
            else:
                itid, amt = struct.unpack_from("<HH", pkt, 2)
                z = None
            s["hint"].append({"t": now, "k": "bs_buy", "id": itid or None, "n": amt or 1, "r": 0, "z": z})
        elif op == OP_BS_SOLD and len(pkt) >= 10:
            idx, amt, z = struct.unpack_from("<HHI", pkt, 2)
            it = self._inv_item(key, idx)
            s["hint"].append({"t": now, "k": "bs_sell", "id": it[0] if it else None, "n": -(amt or 1), "r": it[1] if it else 0, "z": z})
        elif op in OP_BS_VIEW:
            s["ctx"]["bs"] = now
            if op == 0x0818:
                # 人の買取露店の一覧: 先頭16 + 11バイト×n [1個の値段4][個数2][種類1][品4](RO Storage Manager の実測)
                ent = []
                for o in range(16, min(len(pkt), struct.unpack_from("<H", pkt, 2)[0] or len(pkt)) - 10, 11):
                    pr, n, _, iid = struct.unpack_from("<IHBI", pkt, o)
                    if not (0 < iid < 2000000 and 0 < pr and 0 < n):
                        break
                    ent.append({"p": pr, "n": n, "id": iid})
                s["bsl"] = (now, ent)
        elif op in OP_NPC:
            s["ctx"]["npc"] = now
        elif op in OP_SEARCH:
            s["ctx"]["search"] = now
            if op == OP_SEARCH_RES and len(pkt) >= 7 + 142:
                end = min(len(pkt), struct.unpack_from("<H", pkt, 2)[0] or len(pkt))
                ent = []
                for o in range(7, end - 141, 142):
                    iid = struct.unpack_from("<I", pkt, o + 88)[0]
                    pr, n = struct.unpack_from("<IH", pkt, o + 93)
                    if 0 < iid < 2000000 and pr > 0:
                        ent.append({"p": pr, "n": n or 1, "id": iid})
                old = s["shop"][1] if s["shop"] and now - s["shop"][0] < SHOP_SEC else []
                s["shop"] = (now, (old + ent)[-300:])     # 検索をくり返したら足していく(どの結果から買ったか分からないため)
        elif op in OP_NPC_RES:
            # 00CA(買った結果)は、NPC のお店の窓を開いていなければ露店検索からの購入(jRO の実測: ノアトゥーンの遠くの露店。品はあとでメール)
            npc = s["ctx"].get("npc") and now - s["ctx"]["npc"] < NPC_SEC and s["ctx"]["npc"] >= s["ctx"].get("search", 0)
            s["hint"].append({"t": now, "k": ("npc_buy" if op == 0x00CA else "npc_sell") if npc or op != 0x00CA else "search_buy"})
        elif op == OP_MAIL_Z:
            s["hint"].append({"t": now, "k": "mail"})
        elif op == OP_MAIL_I:
            s["hint"].append({"t": now, "k": "mail_item"})
            s["tx"].append({"t": now, "c": self._name(key), "d": 0, "b": s["z"], "mailitem": True})
        elif op in OP_MAIL:
            s["ctx"]["mail"] = now
        elif op in OP_TRADE:
            if op == 0x00F0:
                s["hint"].append({"t": now, "k": "trade"})
            s["ctx"]["trade"] = now

    def _inv_item(self, key, idx):
        """持ち物の番号 → (品の番号, 精錬)。char_core の記録から(消える前に引く)。"""
        cc = self.chars
        if cc is None:
            return None
        name = self._name(key)
        ch = cc.chars.get(name) if name else None
        if not ch:
            return None
        for x in ch.get("items") or []:
            if x.get("index") == idx:
                return (x.get("itemId"), 0)
        for e in (ch.get("equips") or []) + (ch.get("bag") or []):
            if e.get("inventoryIndex") == idx:
                return (e.get("itemId"), e.get("refine") or 0)
        return None

    def _cart_list(self, s, op, pkt, now):
        """カートの一覧(0B09/0B39 の種類1)から、カートの番号 → 品 を覚える(露店で売れた品の名前に使う)。"""
        if op == 0x0B08:
            if pkt[4] == 1:
                s["cart"], s["cart_t"] = {}, now
            return
        if op == 0x0B0B or pkt[4] != 1:
            return
        if now - s["cart_t"] > 5.0:
            s["cart"], s["cart_t"] = {}, now
        body = pkt[5:]
        if op == 0x0B09:
            size = next((z for z in ITEM_SIZES if body and len(body) % z == 0), 0)
            for i in range(len(body) // size if size else 0):
                idx, itid = struct.unpack_from("<HI", body, i * size)
                if itid:
                    s["cart"][idx] = [itid, 0, struct.unpack_from("<H", body, i * size + 7)[0] or 1]
        elif op == 0x0B39 and len(body) % EQUIP_SIZE == 0:
            for i in range(len(body) // EQUIP_SIZE):
                e = body[i * EQUIP_SIZE:(i + 1) * EQUIP_SIZE]
                idx, itid = struct.unpack_from("<HI", e, 0)
                if itid:
                    s["cart"][idx] = [itid, e[65], 1]
        s["cart_t"] = now

    def _shop_entries(self, pkt):
        """露店の品の一覧(可変長)を読む。1件の大きさと始まりは、品の番号が名前の表にある並びを探して決める(jRO の形は未確認)。
        1件 = [値段4][個数2][番号2][種類1][品4]…(人の露店)・[値段4][番号2][個数2][種類1][品4]…(自分の露店)"""
        best = None
        for head in (4, 8, 12, 17):
            body = pkt[head:]
            for size in range(20, 120):
                if not body or len(body) % size:
                    continue
                n = len(body) // size
                ok = sum(1 for i in range(n) if str(struct.unpack_from("<I", body, i * size + 9)[0]) in self.id2name)
                if ok == n and (best is None or n > best[2]):
                    best = (head, size, n)
        if not best:
            return []
        head, size, n = best
        body, out = pkt[head:], []
        my = pkt[0] | (pkt[1] << 8) == OP_MY_VEND
        for i in range(n):
            o = i * size
            p = struct.unpack_from("<I", body, o)[0]
            a, b = struct.unpack_from("<HH", body, o + 4)
            amt, idx = (b, a) if my else (a, b)
            out.append({"p": p, "n": amt, "idx": idx, "id": struct.unpack_from("<I", body, o + 9)[0]})
        return out

    # ---------- 取引にまとめる ----------
    def _close(self, key, s, now, force=False):
        s["cartout"] = [h for h in s["cartout"] if now - h["t"] < CART_SEC + WIN and not h.get("used")]
        if not s["tx"]:
            cut = now - 5.0
            s["ev"] = [e for e in s["ev"] if e["t"] > cut]
            s["hint"] = [h for h in s["hint"] if h["t"] > cut]
            return
        keep = []
        for tx in s["tx"]:
            if not force and now - tx["t"] < WIN:
                keep.append(tx)
                continue
            self._finish(s, tx)
        s["tx"] = keep

    def _finish(self, s, tx):
        t0 = tx["t"]
        near = lambda x: abs(x["t"] - t0) <= WIN and not x.get("used")
        ev = [e for e in s["ev"] if near(e)]
        hints = [h for h in s["hint"] if near(h)]
        d = tx["d"]
        if tx.get("mailitem"):
            ev = [e for e in ev if e["n"] > 0 and e["t"] >= t0 - 0.2]
            if not ev or not tx["c"]:
                return
        for x in ev + hints:
            x["used"] = True
        hk = [h["k"] for h in hints]
        ctx = s["ctx"]
        recent = lambda k, sec: ctx.get(k) and t0 - ctx[k] < sec
        its = [[e["id"], e["n"], e["r"]] for e in ev]
        price = None
        if tx.get("mailitem"):
            k = "mail_item"
        elif "vend_sell" in hk:
            k = "vend_sell"
            its = [[h["id"], h["n"], h["r"]] for h in hints if h["k"] == "vend_sell"]
        elif d > 0 and not hk and [h for h in s["cartout"] if 0 <= t0 - h["t"] <= CART_SEC and not h.get("used")]:
            k = "vend_sell"                    # カートから消えた(0125)のあとに増えた = 自分の露店で売れた
            co = [h for h in s["cartout"] if 0 <= t0 - h["t"] <= CART_SEC and not h.get("used")]
            for h in co:
                h["used"] = True
            its = [[h["id"], h["n"], h["r"]] for h in co]
        elif "bs_sell" in hk:
            k = "bs_sell"
            sold = [[h["id"], h["n"], h["r"]] for h in hints if h["k"] == "bs_sell"]
            its = sold if not any(x[1] < 0 for x in its) else its
        elif "bs_buy" in hk:
            k = "bs_buy"                       # 品は 09E6 の中身を正とする(開くときのライセンスの出し入れ・失敗で戻った分を混ぜない)
            its = [[h["id"], h["n"], 0] for h in hints if h["k"] == "bs_buy" and h["id"]] or its
        elif "search_buy" in hk:
            k = "vend_buy" if any(x[1] > 0 for x in its) else "vend_buy_mail"     # 露店検索から買った(品が来なければメールで届く)
            if k == "vend_buy_mail" and s["shop"] and d < 0:
                m = self._match_shop(s["shop"][1], -d)                         # 検索結果の値段 × 個数 = 払った額 の品が1つに決まれば、その品
                if m:
                    its = [[m[0], m[1], 0]]
        elif d > 0 and recent("bs", SHOP_SEC) and s["bsl"] and self._match_shop(s["bsl"][1], d):
            k = "bs_sell"                      # 人の買取露店を見たあと、値段 × 個数 がぴったりの額が増えた(jRO では 081C が来ない)
            m = self._match_shop(s["bsl"][1], d)
            its = [[m[0], -m[1], 0]] if not any(x[1] < 0 for x in its) else its
        elif "mail" in hk:
            k = "mail"
        elif "trade" in hk:
            k = "trade"
        elif "npc_buy" in hk or "npc_sell" in hk or (recent("npc", NPC_SEC) and (ctx.get("npc", 0) >= ctx.get("shop", 0))):
            k = "npc_buy" if d < 0 else "npc_sell"
        elif d < 0 and any(x[1] > 0 for x in its):
            k = "vend_buy" if recent("shop", SHOP_SEC) else "buy"
        elif d < 0 and recent("shop", SHOP_SEC) and s["shop"] and self._match_shop(s["shop"][1], -d):
            k = "vend_buy_mail"                # 品が持ち物に来ない購入(ノアトゥーンの遠くの露店: 品はメールで届く)。見た露店の値段 × 個数が払った額と合う品が1つのときだけ
            m = self._match_shop(s["shop"][1], -d)
            its = [[m[0], m[1], 0]]
        elif d > 0 and any(x[1] < 0 for x in its):
            k = "sell"
        else:
            k = "other_in" if d > 0 else "other_out"
        if d and its:
            n = sum(abs(x[1]) for x in its if x[0])
            ids = {x[0] for x in its if x[0]}
            if n and len(ids) == 1:
                price = abs(d) / n
        row = {"t": int(t0), "c": tx["c"], "k": k, "d": d, "b": tx["b"]}
        if its:
            row["it"] = its
        if price:
            row["p"] = round(price, 2)
        ops = sorted({"{:04X}".format(o) for (t, o, ln, raw) in s["ring"] if t0 - 1.5 <= t <= t0 + WIN and o not in (0x00B1, 0x0ACB)})
        if ops and k.startswith("other"):
            row["ops"] = ops                   # 確認用: 何で動いたか分からなかったときの、前後の通信の種類
        self._add(row)
        self._nlog += 1
        if self._nlog <= 300:
            self.log("[家計簿] {} {:+,}z {}{}{} / 前後の通信: {}".format(
                tx["c"], d, KINDS.get(k, k), (" " + "、".join("{}{}×{}".format("+{} ".format(x[2]) if x[2] else "", self._iname(x[0]) if x[0] else "品不明", abs(x[1])) for x in its)) if its else "",
                " 単価{:,.0f}".format(price) if price else "", ",".join(ops) or "なし"))
        if k.startswith("other") and self._nother < 40:
            # 何で動いたか分からなかったとき: 前後 10秒の通信の中身を残す(jRO で使われる通信を見つけるため)
            self._nother += 1
            for (t, o, ln, raw) in s["ring"]:
                if t0 - 10 <= t <= t0 + WIN and o not in (0x00B1, 0x0ACB):
                    self.log("[家計簿]   確認用 {:+.1f}秒 {:04X} {}バイト: {}".format(t - t0, o, ln, raw.hex()))

    @staticmethod
    def _match_shop(entries, z):
        """露店の一覧から、払った額 z = 値段 × 個数 になる品を探す(1つに決まるときだけ)。"""
        hit = {}
        for e in entries:
            p = e.get("p") or 0
            if p > 0 and z % p == 0 and 1 <= z // p <= (e.get("n") or 1):
                hit.setdefault(e["id"], z // p)
        return next(iter(hit.items())) if len(hit) == 1 else None

    def _add(self, row):
        self.rows.append(row)
        self.t = int(time.time())
        self._dirty = True

    # ---------- 外から ----------
    def tick(self):
        now = time.time()
        with self.lock:
            for key, s in list(self._c.items()):
                self._close(key, s, now)
        self.save()

    def view(self, days=None):
        """画面用: {rows, names, kinds, t}。rows は新しい順。"""
        self.tick()
        with self.lock:
            rows = self.rows
            if days:
                cut = time.time() - days * 86400
                rows = [r for r in rows if r["t"] >= cut]
            rows = list(reversed(rows))
            ids = {str(x[0]) for r in rows for x in r.get("it") or [] if x[0]}
            return {"rows": rows, "names": {i: self.id2name[i] for i in ids if i in self.id2name}, "kinds": KINDS, "t": self.t}
