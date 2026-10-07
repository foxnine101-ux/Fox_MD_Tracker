# -*- coding: utf-8 -*-
"""
被ダメージの記録(だれの・どの技で・どれくらい受けたか)。

  0x08C8  通常攻撃   src(4) target(4) 時刻(4) 速度(4) 速度(4) ダメージ(4) SP(1) ヒット数(2) 種類(1) 左手(4)
  0x01DE  スキル     スキルID(2) src(4) target(4) 時刻(4) 速度(4) 速度(4) ダメージ(4) Lv(2) ヒット数(2) 種類(1)
  0x09FD/0x09FE/0x09FF  まわりに出てきたもの(モンスターなど)。最後の24バイトが名前
  0x0095/0x0A30         名前の返事(ID + 名前)

自分あて(target が自分のアカウントID)だけを数える。
MDごと・キャラごとに「相手|技」でまとめて、回数・最大・合計・最後の時刻を覚える。
"""
import json
import os
import struct
import time

OP_ACT = 0x08C8
OP_SKILL = 0x01DE
OP_SPAWN = (0x09FD, 0x09FE, 0x09FF)
OP_NAME = 0x0095
OP_NAME_ALL = 0x0A30
OPS = {OP_ACT, OP_SKILL, OP_NAME, OP_NAME_ALL} | set(OP_SPAWN)

RECENT_MAX = 300
MOBS_MAX = 20000
SAMPLE_MAX = 8          # 確かめ用に動作ログへ出す数(通信の種類ごと)


def _cstr(b):
    b = b.split(b"\x00", 1)[0]
    try:
        return b.decode("cp932")
    except UnicodeDecodeError:
        return b.decode("cp932", "replace")


def load_skill_names(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {int(k): v for k, v in json.load(f).items()}
    except Exception:
        return {}


class DmgCore(object):
    def __init__(self, md, skill_names=None, log=None):
        self.md = md                        # md_core.MDCore(キャラ名・いる場所・自分のIDを借りる)
        self.skills = skill_names or {}
        self.log = log or (lambda *a: None)
        self.names = {}                     # 相手のID -> 名前
        self.stats = {}                     # キャラ -> MD -> "相手|技" -> [回数, 合計, 最大, 最後, ヒット数合計]
        self.recent = []                    # 最近の被ダメ
        self.samples = {}
        self.changed = False

    # ---------------- 保存 ----------------
    def snapshot(self):
        return {"stats": self.stats, "recent": self.recent[-RECENT_MAX:]}

    def restore(self, d):
        if d:
            self.stats = d.get("stats") or {}
            self.recent = d.get("recent") or []

    def clear(self, char=None):
        if char:
            self.stats.pop(char, None)
            self.recent = [r for r in self.recent if r.get("char") != char]
        else:
            self.stats, self.recent = {}, []
        self.changed = True

    # ---------------- 通信 ----------------
    def _sample(self, op, pkt):
        n = self.samples.get(op, 0)
        if n < SAMPLE_MAX:
            self.samples[op] = n + 1
            self.log("[被ダメ確認用] {:04X} 長さ{} {}".format(op, len(pkt), pkt[:64].hex()))

    def _mine(self, key, aid):
        c = self.md.conn.get(key) or {}
        return aid in self.md.account_aids or (c.get("aid") is not None and aid == c.get("aid"))

    def _where(self, key):
        c = self.md.conn.get(key) or {}
        m = c.get("map") or ""
        if "@" in m:
            return c.get("md") or ("MD " + m.split("@", 1)[1])
        return ("フィールド " + m) if m else "不明"

    def feed(self, key, pkt):
        if len(pkt) < 2:
            return
        op = pkt[0] | (pkt[1] << 8)
        if op not in OPS:
            return
        try:
            if op in OP_SPAWN:
                self._spawn(op, pkt)
            elif op == OP_NAME and len(pkt) >= 30:
                aid = struct.unpack_from("<I", pkt, 2)[0]
                self._name(aid, _cstr(pkt[6:30]))
            elif op == OP_NAME_ALL and len(pkt) >= 30:
                aid = struct.unpack_from("<I", pkt, 2)[0]
                self._name(aid, _cstr(pkt[6:30]))
            elif op == OP_ACT and len(pkt) >= 34:
                self._sample(op, pkt)
                src, tgt = struct.unpack_from("<II", pkt, 2)
                dmg = struct.unpack_from("<i", pkt, 22)[0]
                div = struct.unpack_from("<h", pkt, 27)[0]
                kind = pkt[29]
                left = struct.unpack_from("<i", pkt, 30)[0]
                if kind in (0, 4, 8, 9, 10) and self._mine(key, tgt) and src != tgt:
                    self._hit(key, src, 0, dmg + max(left, 0), div, kind == 10)
            elif op == OP_SKILL and len(pkt) >= 33:
                self._sample(op, pkt)
                skid = struct.unpack_from("<H", pkt, 2)[0]
                src, tgt = struct.unpack_from("<II", pkt, 4)
                dmg = struct.unpack_from("<i", pkt, 24)[0]
                lv, div = struct.unpack_from("<hh", pkt, 28)
                if self._mine(key, tgt) and src != tgt:
                    self._hit(key, src, skid, dmg, div, False, lv)
        except struct.error:
            pass

    def _name(self, aid, name):
        if name and len(name) <= 24 and all(ord(ch) >= 0x20 for ch in name):
            if len(self.names) > MOBS_MAX:
                self.names.clear()
            self.names[aid] = name

    def _spawn(self, op, pkt):
        # 0x09FD〜FF: [op 2][長さ 2][種類 1][ID 4][GID 4] … [名前 24](最後)
        if len(pkt) < 4 + 1 + 8 + 24:
            return
        self._sample(op, pkt)
        aid = struct.unpack_from("<I", pkt, 5)[0]
        self._name(aid, _cstr(pkt[-24:]))

    def _hit(self, key, src, skid, dmg, div, crit, lv=0):
        if dmg <= 0:
            return
        name = self.md.name_for(key)
        if not name:
            return
        who = self.names.get(src) or "ID{}".format(src)
        if skid:
            skill = self.skills.get(skid) or "スキル{}".format(skid)
        else:
            skill = "通常攻撃"
        where = self._where(key)
        now = int(time.time())
        k = "{}|{}".format(who, skill)
        st = self.stats.setdefault(name, {}).setdefault(where, {}).setdefault(k, [0, 0, 0, 0, 0])
        st[0] += 1
        st[1] += dmg
        st[2] = max(st[2], dmg)
        st[3] = now
        st[4] += max(div, 1)
        self.recent.append({"t": now, "char": name, "md": where, "src": who, "skill": skill,
                            "skid": skid, "lv": lv, "dmg": dmg, "hits": max(div, 1), "crit": 1 if crit else 0})
        del self.recent[:-RECENT_MAX]
        self.changed = True

    # ---------------- ウェブ用 ----------------
    def for_char(self, name, top=40):
        """キャラの被ダメまとめ(MDごと、最大ダメージ順に top 件)。"""
        out = {}
        for where, d in (self.stats.get(name) or {}).items():
            rows = sorted(d.items(), key=lambda kv: -kv[1][2])[:top]
            out[where] = {k: v for k, v in rows}
        return out
