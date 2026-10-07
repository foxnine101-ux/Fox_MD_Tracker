# -*- coding: utf-8 -*-
"""char_core.py — ROの通信からキャラのステータスと装備を拾って貯める。

MDトラッカー(md_tracker.py)に相乗りする前提。向こうはもう常駐して通信を読んでいるので、
同じパケットをこっちにも流してもらうだけで、キャラごとのステ・装備が勝手に最新になる。

単体でも使える(調査・テスト用):
    python char_core.py packet_dump_*.jsonl

読むパケット:
    0x0141  基礎値 + 装備ボーナス (STR〜LUK, POW〜CRT)
    0x00BD  ステータス一括 (残ステータスポイント, ATK/MATK/DEF など)
    0x00B0  派生値の変化 (HP/SP/ASPD など)
    0x0B39  装備一覧 (アイテムID・精錬・★グレード・エンチャ4枠・ランダムOP)
"""
import json
import os
import struct
import time

WANT_OPS = {0x0141, 0x00BD, 0x00B0, 0x0B39}

STAT_NAMES = {
    13: "STR", 14: "AGI", 15: "VIT", 16: "INT", 17: "DEX", 18: "LUK",
    219: "POW", 220: "STA", 221: "WIS", 222: "SPL", 223: "CON", 224: "CRT",
}
DERIVED_NAMES = {
    5: "HP", 6: "MaxHP", 7: "SP", 8: "MaxSP",
    41: "ATK", 42: "ATK2", 43: "MATKmin", 44: "MATKmax",
    45: "DEF", 46: "DEF2", 47: "MDEF", 48: "MDEF2",
    49: "HIT", 50: "FLEE", 51: "FLEE2", 52: "CRIT", 53: "ASPD",
}
# 装備位置のビット (rAthena の EQP_*)
LOC_NAMES = {
    1: "頭下段", 2: "武器", 4: "肩", 8: "アクセ左", 16: "鎧", 32: "盾",
    64: "靴", 128: "アクセ右", 256: "頭上段", 512: "頭中段",
    1024: "C頭上", 2048: "C頭中", 4096: "C頭下", 8192: "C肩",
    65536: "S鎧", 131072: "S武器", 262144: "S盾", 524288: "S靴",
    1048576: "Sアクセ右", 2097152: "Sアクセ左",
}
UNKNOWN = "(キャラ不明)"
EQUIP_SIZE = 68


def load_id2name(folder=None):
    """アイテムID→日本語名の対応表。ratorio の items_part*.json から作ったもの。"""
    folder = folder or os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(folder, "id2name.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


class CharCore(object):
    def __init__(self, md=None, id2name=None, log=None):
        self.md = md                      # md_core.MDCore (キャラ名を借りる)。無くても動く
        self.id2name = id2name if id2name is not None else load_id2name()
        self.log = log or (lambda *a: None)
        self.chars = {}
        self.changed = False

    # ---------- 外から呼ぶ ----------
    def feed(self, conn_key, pkt):
        if len(pkt) < 2:
            return
        (op,) = struct.unpack_from("<H", pkt, 0)
        if op not in WANT_OPS:
            return
        self._key = conn_key
        try:
            self._handle(op, pkt)
        except (struct.error, IndexError):
            pass

    def snapshot(self):
        return {"chars": self.chars, "updated": int(time.time())}

    def restore(self, data):
        if data:
            self.chars = data.get("chars", {})

    # ---------- 中身 ----------
    def _name(self):
        cur = None
        if self.md is not None:
            if hasattr(self.md, "name_for"):
                cur = self.md.name_for(getattr(self, "_key", None))
            else:
                cur = getattr(self.md, "current", None)
        if cur:
            # 名前が分かる前に貯めた分があれば、そっちへ引き継ぐ
            if UNKNOWN in self.chars and cur not in self.chars:
                self.chars[cur] = self.chars.pop(UNKNOWN)
                self.log("[キャラ] {} のデータとして確定".format(cur))
            return cur
        return UNKNOWN

    def _ch(self):
        name = self._name()
        ch = self.chars.get(name)
        if ch is None:
            ch = {"stats": {}, "derived": {}, "statusPoint": None,
                  "equips": [], "updated": 0}
            self.chars[name] = ch
        return ch

    def _item_name(self, iid):
        return self.id2name.get(str(iid)) or "ID{}".format(iid)

    def _handle(self, op, pkt):
        if op == 0x0141:
            t, base, plus = struct.unpack_from("<iii", pkt, 2)
            key = STAT_NAMES.get(t)
            if key:
                ch = self._ch()
                ch["stats"][key] = {"base": base, "plus": plus}
                ch["updated"] = int(time.time())
                self.changed = True

        elif op == 0x00B0:
            vid, val = struct.unpack_from("<Hi", pkt, 2)
            key = DERIVED_NAMES.get(vid)
            if key:
                ch = self._ch()
                ch["derived"][key] = val
                self.changed = True

        elif op == 0x00BD and len(pkt) >= 44:
            ch = self._ch()
            ch["statusPoint"] = struct.unpack_from("<H", pkt, 2)[0]
            vals = pkt[4:16]
            for i, key in enumerate(("STR", "AGI", "VIT", "INT", "DEX", "LUK")):
                cur = ch["stats"].setdefault(key, {"base": 0, "plus": 0})
                cur["base"] = vals[i * 2]
                cur["cost"] = vals[i * 2 + 1]
            names = ("ATK", "ATK2", "MATKmin", "MATKmax", "DEF", "DEF2", "MDEF",
                     "MDEF2", "HIT", "FLEE", "FLEE2", "CRIT", "ASPD_raw")
            for key, v in zip(names, struct.unpack_from("<13h", pkt, 16)):
                ch["derived"][key] = v
            ch["updated"] = int(time.time())
            self.changed = True

        elif op == 0x0B39:
            body = pkt[5:]
            if len(body) < EQUIP_SIZE or len(body) % EQUIP_SIZE:
                return
            items = [self._equip(body[i * EQUIP_SIZE:(i + 1) * EQUIP_SIZE])
                     for i in range(len(body) // EQUIP_SIZE)]
            worn = [e for e in items if e["wear"]]
            if not worn:
                return
            ch = self._ch()
            ch["equips"] = worn
            ch["bag"] = [e for e in items if not e["wear"]]
            ch["updated"] = int(time.time())
            self.changed = True
            self.log("[キャラ] {} の装備 {}点を記録".format(self._name(), len(worn)))

    def _equip(self, e):
        """装備1件 68バイト。精錬と★は末尾にある(先頭ではない)。"""
        idx, itid = struct.unpack_from("<HI", e, 0)
        loc, wear = struct.unpack_from("<II", e, 7)
        cards = struct.unpack_from("<4I", e, 15)
        ocnt = e[39]
        opts = []
        for k in range(5):
            oi, ov = struct.unpack_from("<HH", e, 40 + k * 5)
            param = e[40 + k * 5 + 4]
            if oi or ov:
                opts.append({"index": oi, "value": ov, "param": param})
        return {
            "slot": LOC_NAMES.get(wear, str(wear)) if wear else "",
            "wear": wear,
            "itemId": itid,
            "name": self._item_name(itid),
            "refine": e[65],
            "grade": e[66],
            "cards": [{"id": c, "name": self._item_name(c)} for c in cards if c],
            "options": opts,
            "inventoryIndex": idx,
        }


# ---------------------------------------------------------------
#  単体で動かすとき: 保存した通信ファイルを読んで char_state.json を作る
# ---------------------------------------------------------------
def _split_account_prefix(data, lengths):
    """キャラ選択サーバーは接続直後に「オペコード無しの生4バイト = アカウントID」を送る。
    md_tracker.py の同名関数と同じ判定(ここは単体実行のときだけ使う)。"""
    if len(data) < 4:
        return None, data
    op = data[0] | (data[1] << 8)
    if op in lengths:
        return None, data
    if len(data) == 4 or (len(data) >= 6 and (data[4] | (data[5] << 8)) in lengths):
        aid = int.from_bytes(data[:4], "little")
        if 0 < aid < 0x7FFFFFFF:
            return aid, data[4:]
    return None, data


def replay(path, md=None):
    import guild_packet as gp
    core = CharCore(md=md, log=print)

    class _S(gp.StreamScanner):
        def __init__(self, key):
            gp.StreamScanner.__init__(self, lambda e: None)
            self.key = key

        def _handle(self, pkt):
            if md is not None:
                try:
                    md.feed(self.key, pkt)
                except Exception:
                    pass
            core.feed(self.key, pkt)

    scanners = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            key = (d["src"], d["sport"], d["dst"], d["dport"])
            data = bytes.fromhex(d["hex"])
            seq = d["seq"]
            if key not in scanners:
                scanners[key] = _S(key)
                aid, rest = _split_account_prefix(data, gp.load_lengths())
                if aid is not None:
                    if md is not None:
                        try:
                            md.account(aid)
                        except Exception:
                            pass
                    data, seq = rest, (seq + 4) & 0xFFFFFFFF
                    if not data:
                        scanners[key].next_seq = seq
                        continue
            try:
                scanners[key].feed_segment(seq, data)
            except Exception:
                pass
    return core


def main():
    import sys
    if len(sys.argv) < 2:
        print(__doc__)
        return
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    md = None
    try:
        import md_core
        md = md_core.MDCore({}, log=lambda *a: None)
    except Exception:
        pass
    core = replay(sys.argv[1], md=md)
    out = os.path.join(here, "char_state.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(core.snapshot(), f, ensure_ascii=False, indent=1)
    for name, ch in core.chars.items():
        print("\n===== {} =====".format(name))
        st = ch["stats"]
        line = "  ".join("{} {}+{}".format(k, st[k]["base"], st[k]["plus"])
                         for k in ("STR", "AGI", "VIT", "INT", "DEX", "LUK") if k in st)
        print(" " + line)
        tr = "  ".join("{} {}+{}".format(k, st[k]["base"], st[k]["plus"])
                       for k in ("POW", "STA", "WIS", "SPL", "CON", "CRT") if k in st)
        if tr:
            print(" " + tr)
        if ch.get("statusPoint") is not None:
            print(" 残ステータスポイント: {}".format(ch["statusPoint"]))
        if ch["derived"].get("ASPD") is not None:
            print(" ASPD: {}".format(ch["derived"]["ASPD"]))
        for e in ch.get("equips", []):
            g = " ★{}".format(e["grade"]) if e["grade"] else ""
            print("  [{}] {} +{}{}".format(e["slot"], e["name"], e["refine"], g))
            if e["cards"]:
                print("        " + " / ".join(c["name"] for c in e["cards"]))
    print("\n保存しました:", out)


if __name__ == "__main__":
    main()
