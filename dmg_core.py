# -*- coding: utf-8 -*-
"""
被ダメージの記録(だれの・どの技で・どれくらい受けたか)。

  0x08C8  通常攻撃   src(4) target(4) 時刻(4) 速度(4) 速度(4) ダメージ(4) SP(1) ヒット数(2) 種類(1) 左手(4)
  0x01DE  スキル     スキルID(2) src(4) target(4) 時刻(4) 速度(4) 速度(4) ダメージ(4) Lv(2) ヒット数(2) 種類(1)
  0x09FD/0x09FE/0x09FF  まわりに出てきたもの(モンスターなど)。名前は決まった位置から最後まで(長さは名前しだい)
                        jRO の実際の通信で確かめた位置: 09FD=90 / 09FE=83 / 09FF=84
  0x0095/0x0A30         名前の返事(ID + 名前)
  0x0ADF                名前の返事(新しい形: ID + グループID + 名前)

自分あて(target が自分のアカウントID)だけを数える。
MDごと・キャラごとに「相手|技」でまとめて、回数・最大・合計・最後の時刻を覚える。

あとで直せるように:
  - seen  … 受けたスキルの番号ごとのまとめ(名前がわからない技を見つける・名前を付ける用)
  - fix   … 手で付けたスキル名(スキル名の手直し.json)。ラトリオのデータより優先
  - raw   … 通信そのもの(16進)と読み取った値。通信の形が合っているか確かめる用

種類と属性(skill_info.json = rAthena のスキルデータから。通信には入っていないので技の番号から決める):
  - 魔法 / 固定 / 物理 は技で決まる。モンスターの通常攻撃は 物理・無属性
  - 物理の近接/遠距離は、当たったときの距離(3セルより遠いと遠距離)で決まる。
    罠・射程3以下の技など技だけで決まるものはそれで、ほかは位置の通信から距離を出して決める(推定)
  - 「武器」属性の技は、モンスターが使うと無属性
"""
import json
import struct
import time

OP_ACT = 0x08C8
OP_SKILL = 0x01DE
OP_SPAWN = (0x09FD, 0x09FE, 0x09FF)
SPAWN_NAME_AT = {0x09FD: 90, 0x09FE: 83, 0x09FF: 84}   # 名前が始まる位置(その前は HP・ボスかどうか・体の見た目)
OP_NAME = 0x0095
OP_NAME_ALL = 0x0A30
OP_NAME_TITLE = 0x0ADF
OP_POS = {0x0086: "相手が動いた", 0x0087: "自分が動いた", 0x0088: "止まった", 0x01FF: "飛ばされた",
          0x0091: "マップ移動", 0x0092: "マップ移動(サーバー)", 0x02EB: "ログイン位置", 0x0080: "消えた"}
# 位置の読み方(jRO の実際の通信で確かめたもの)
#   0087 自分の移動 [時刻 4][移動 6]      0088/01FF [ID 4][x 2][y 2]      0091 [マップ名 16][x 2][y 2]
#   09FF/09FE 位置は 63 から3バイト   09FD 移動は 66 から6バイト・開始時刻は 37・速さは 13
SPAWN_POS_AT = {0x09FE: 63, 0x09FF: 63}
SPAWN_MOVE_AT = 66
SPAWN_TICK_AT = 37
NEAR = 3                # これ以下(セル)なら近接
SELF_SPEED = 150        # 自分の歩く速さ(ミリ秒/セル)。わからないのでふつうの値
OPS = {OP_ACT, OP_SKILL, OP_NAME, OP_NAME_ALL, OP_NAME_TITLE} | set(OP_SPAWN) | set(OP_POS)
POS_RAW_MAX = 60        # 位置の通信(距離で近接/遠距離を決めるための下調べ用)
UNKNOWN_NAME = "名前不明"

RECENT_MAX = 300
MOBS_MAX = 20000
SAMPLE_MAX = 8          # 確かめ用に動作ログへ出す数(通信の種類ごと)
RAW_MAX = 150           # 確認用データに残す数(通信の種類ごと・新しいものを残す)
RAW_UNKNOWN_MAX = 300   # 名前がわからない技の通信は別に多めに残す


def good_name(s):
    """名前として読める文字だけか(化けた文字・制御文字・外字があればダメ)。"""
    if not s or len(s) > 24:
        return False
    for ch in s:
        o = ord(ch)
        if o < 0x20 or 0x7F <= o <= 0x9F or 0xE000 <= o <= 0xF8FF or o == 0xFFFD:
            return False
    return True


def _cstr(b):
    """名前の24バイトを文字にする。名前ではなさそうなら None。"""
    b = b.split(b"\x00", 1)[0]
    for enc in ("utf-8", "cp932"):    # ふつうは cp932。UTF-8 として正しく読めるときだけ UTF-8
        try:
            s = b.decode(enc)
        except UnicodeDecodeError:
            continue
        if good_name(s):
            return s
    return None


def _posdir(b):
    return (b[0] << 2) | (b[1] >> 6), ((b[1] & 0x3F) << 4) | (b[2] >> 4)


def _movedata(b):
    return ((b[0] << 2) | (b[1] >> 6), ((b[1] & 0x3F) << 4) | (b[2] >> 4),
            ((b[2] & 0x0F) << 6) | (b[3] >> 2), ((b[3] & 0x03) << 8) | b[4])


def where_at(p, tick):
    """p = [x0, y0, x1, y1, 開始時刻, 速さ] の、時刻 tick での位置(歩き途中なら途中の位置)。"""
    x0, y0, x1, y1, st, spd = p
    if not st or not tick or (x0, y0) == (x1, y1):
        return x1, y1
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    total = spd * (max(dx, dy) + 0.4 * min(dx, dy))     # ななめは 1.4 倍かかる
    f = (tick - st) / total if total > 0 else 1
    if f >= 1:
        return x1, y1
    if f <= 0:
        return x0, y0
    return round(x0 + (x1 - x0) * f), round(y0 + (y1 - y0) * f)


def _merge(x, v):
    """記録の行 v を x にまとめる [回数, 合計, 最大, 最後, ヒット, (近接の合計, 遠距離の合計)]"""
    while len(x) < len(v):
        x.append(0)
    x[0] += v[0]; x[1] += v[1]; x[2] = max(x[2], v[2]); x[3] = max(x[3], v[3]); x[4] += v[4]
    for i in range(5, len(v)):
        x[i] += v[i]


def load_skill_info(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {int(k): v for k, v in json.load(f).items()}
    except Exception:
        return {}


def load_skill_names(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {int(k): v for k, v in json.load(f).items()}
    except Exception:
        return {}


class DmgCore(object):
    def __init__(self, md, skill_names=None, log=None, fix=None, info=None):
        self.md = md                        # md_core.MDCore(キャラ名・いる場所・自分のIDを借りる)
        self.skills = skill_names or {}     # ラトリオのデータ(番号 -> 名前)
        self.fix = dict(fix or {})          # 手で付けた名前(番号 -> 名前)。こっちが優先
        self.info = info or {}              # 番号 -> [種類, 属性, 射程, 印](skill_info.json)
        self.seen = {}                      # "番号" -> {n, max, last, where, src, lv}
        self.raw = {}                       # "08C8"/"01DE"/"unknown" -> [{t, char, where, hex, ...}]
        self.pos = {}                       # ID -> [x0, y0, x1, y1, 開始時刻, 速さ](いるマップの中だけ)
        self.me = {}                        # 接続 -> 自分の [x0, y0, x1, y1, 開始時刻, 速さ]
        self.log = log or (lambda *a: None)
        self.names = {}                     # 相手のID -> 名前
        self.stats = {}                     # キャラ -> MD -> "相手|技" -> [回数, 合計, 最大, 最後, ヒット数合計]
        self.recent = []                    # 最近の被ダメ
        self.samples = {}
        self.changed = False

    # ---------------- 保存 ----------------
    def snapshot(self):
        return {"stats": self.stats, "recent": self.recent[-RECENT_MAX:], "seen": self.seen}

    def restore(self, d):
        if d:
            self.stats = d.get("stats") or {}
            self.recent = d.get("recent") or []
            self.seen = d.get("seen") or {}
            self._fix_bad_names()

    def _fix_bad_names(self):
        """前の版で化けたまま記録した相手の名前を「名前不明」にまとめる。"""
        for per_char in self.stats.values():
            for d in per_char.values():
                for k in list(d):
                    who, _, skill = k.partition("|")
                    if who and not good_name(who):
                        v = d.pop(k)
                        nk = UNKNOWN_NAME + "|" + skill
                        if nk in d:
                            x = d[nk]
                            _merge(x, v)
                        else:
                            d[nk] = v
                        self.changed = True
        for r in self.recent:
            if r.get("src") and not good_name(r["src"]):
                r["src"] = UNKNOWN_NAME
                self.changed = True
        for v in self.seen.values():
            if v.get("src") and not good_name(v["src"]):
                v["src"] = UNKNOWN_NAME

    def raw_snapshot(self):
        return {"note": "被ダメの通信の確認用。形が合っているか確かめるときに使います(自動で上書きされます)",
                "skill_names": len(self.skills), "fix": self.fix, "raw": self.raw}

    # ---------------- スキル名 ----------------
    def skill_name(self, skid):
        if not skid:
            return "通常攻撃"
        return self.fix.get(skid) or self.skills.get(skid) or "スキル{}".format(skid)

    def distance(self, key, src, tick):
        """攻撃した相手と自分の距離(セル)。わからなければ None。"""
        a, m = self.pos.get(src), self.me.get(key)
        if not a or not m:
            return None
        ax, ay = where_at(a, tick)
        mx, my = where_at(m, tick)
        return max(abs(ax - mx), abs(ay - my))

    def classify(self, skid, lv=0):
        """技の (種類, 属性)。種類: 魔法/固定/物理・近接/物理・遠距離/物理(距離しだい)/""(不明)"""
        if not skid:
            return "物理", "無"                  # モンスターの通常攻撃
        inf = self.info.get(skid)
        if not inf:
            return "", ""
        t, ele, rng, mark = inf
        if isinstance(ele, list):
            ele = ele[lv - 1] if 0 < lv <= len(ele) else "/".join(dict.fromkeys(ele))
        if "I" in mark:
            ele = "属性なし"
        elif ele in ("武器", "付与"):
            ele = "無"                           # モンスターの武器の属性は無
        if t == "M":
            return "魔法", ele
        if t == "X":
            return "固定", ele
        if t != "W":
            return "", ele
        if "T" in mark or "S" in mark:
            return "物理・近接", ele
        if "L" in mark:
            return "物理・遠距離", ele
        r = max(rng) if isinstance(rng, list) else rng
        if 0 < r < 4:                            # 射程3以下 → 3セル以内でしか当たらない
            return "物理・近接", ele
        return "物理", ele

    def kinds(self):
        """画面用: 技の名前 -> [種類, 属性](記録の表は名前でまとめているので)。"""
        out = {"通常攻撃": list(self.classify(0))}
        for k, v in self.seen.items():
            sk = int(k)
            out[self.skill_name(sk)] = list(self.classify(sk, v.get("lv") or 0))
        return out

    def known(self, skid):
        return skid in self.fix or skid in self.skills

    def seen_list(self):
        """受けたスキルの一覧(画面の「技の一覧」用)。"""
        out = []
        for k, v in self.seen.items():
            sk = int(k)
            kind, ele = self.classify(sk, v.get("lv") or 0)
            out.append(dict(v, id=sk, name=self.skill_name(sk), base=self.skills.get(sk, ""),
                            fixed=sk in self.fix, known=self.known(sk), kind=kind, ele=ele))
        out.sort(key=lambda r: (r["known"], -r.get("last", 0)))
        return out

    def rename(self, skid, name):
        """スキル skid に名前を付ける(空なら手直しをやめる)。これまでの記録の名前も付けかえる。"""
        old = self.skill_name(skid)
        name = (name or "").strip()[:40]
        if name and name != self.skills.get(skid):
            self.fix[skid] = name
        else:
            self.fix.pop(skid, None)
        new = self.skill_name(skid)
        if new == old:
            return False
        tail = "|" + old
        for per_char in self.stats.values():
            for d in per_char.values():
                for k in [k for k in d if k.endswith(tail)]:
                    v = d.pop(k)
                    nk = k[:-len(tail)] + "|" + new
                    if nk in d:              # 同じ名前の行があればまとめる
                        x = d[nk]
                        _merge(x, v)
                    else:
                        d[nk] = v
        for r in self.recent:
            if r.get("skid") == skid:
                r["skill"] = new
        self.changed = True
        return True

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
            self.log("[被ダメ確認用] {:04X} 長さ{} {}".format(op, len(pkt), pkt[:200].hex()))

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
            if op in OP_POS:
                self._pos(key, op, pkt)
                self._move(key, op, pkt)
            elif op in OP_SPAWN:
                self._spawn(op, pkt)
            elif op in (OP_NAME, OP_NAME_ALL) and len(pkt) >= 30:
                aid = struct.unpack_from("<I", pkt, 2)[0]
                self._name(aid, pkt[6:30], op, pkt)
            elif op == OP_NAME_TITLE and len(pkt) >= 34:
                aid = struct.unpack_from("<I", pkt, 2)[0]
                self._name(aid, pkt[10:34], op, pkt)
            elif op == OP_ACT and len(pkt) >= 34:
                self._sample(op, pkt)
                src, tgt = struct.unpack_from("<II", pkt, 2)
                dmg = struct.unpack_from("<i", pkt, 22)[0]
                div = struct.unpack_from("<h", pkt, 27)[0]
                kind = pkt[29]
                left = struct.unpack_from("<i", pkt, 30)[0]
                if self._mine(key, tgt) and src != tgt:
                    tick = struct.unpack_from("<I", pkt, 10)[0]
                    dist = self.distance(key, src, tick)
                    self._raw(key, op, pkt, {"src": src, "dmg": dmg, "div": div, "kind": kind, "left": left,
                                             "dist": dist})
                    if kind in (0, 4, 8, 9, 10):
                        self._hit(key, src, 0, dmg + max(left, 0), div, kind == 10, dist=dist)
            elif op == OP_SKILL and len(pkt) >= 33:
                self._sample(op, pkt)
                skid = struct.unpack_from("<H", pkt, 2)[0]
                src, tgt = struct.unpack_from("<II", pkt, 4)
                dmg = struct.unpack_from("<i", pkt, 24)[0]
                lv, div = struct.unpack_from("<hh", pkt, 28)
                if self._mine(key, tgt) and src != tgt:
                    tick = struct.unpack_from("<I", pkt, 12)[0]
                    dist = self.distance(key, src, tick)
                    self._raw(key, op, pkt, {"skid": skid, "src": src, "dmg": dmg, "lv": lv, "div": div,
                                             "dist": dist}, unknown=not self.known(skid))
                    self._hit(key, src, skid, dmg, div, False, lv, dist=dist)
        except struct.error:
            pass

    def _raw(self, key, op, pkt, parsed, unknown=False):
        """通信そのものを残す(あとで形を確かめる・直す用)。"""
        rec = {"t": int(time.time()), "char": self.md.name_for(key) or "", "where": self._where(key),
               "who": self.names.get(parsed.get("src"), ""), "hex": pkt[:80].hex(), "len": len(pkt)}
        rec.update(parsed)
        for tag, mx in (("{:04X}".format(op), RAW_MAX), ("unknown", RAW_UNKNOWN_MAX) if unknown else (None, 0)):
            if tag:
                lst = self.raw.setdefault(tag, [])
                lst.append(rec)
                del lst[:-mx]

    def _pos(self, key, op, pkt):
        """位置の通信を残すだけ(読み方を確かめてから距離に使う)。MD の中のときだけ。"""
        c = self.md.conn.get(key) or {}
        if "@" not in (c.get("map") or ""):
            return
        lst = self.raw.setdefault("pos_{:04X}".format(op), [])
        lst.append({"t": int(time.time()), "ms": int(time.time() * 1000) % 100000000, "len": len(pkt),
                    "hex": pkt[:40].hex()})
        del lst[:-POS_RAW_MAX]

    def _move(self, key, op, pkt):
        """位置を覚える(距離で近接/遠距離を決める用)。"""
        c = self.md.conn.get(key) or {}
        if op == 0x0087 and len(pkt) >= 12:              # 自分が歩きはじめた
            x0, y0, x1, y1 = _movedata(pkt[6:12])
            self.me[key] = [x0, y0, x1, y1, struct.unpack_from("<I", pkt, 2)[0], SELF_SPEED]
        elif op in (0x0088, 0x01FF) and len(pkt) >= 10:   # 止まった・飛ばされた
            aid, x, y = struct.unpack_from("<IHH", pkt, 2)
            p = [x, y, x, y, 0, 0]
            if self._mine(key, aid) or aid == c.get("gid"):
                self.me[key] = p
            else:
                self.pos[aid] = p
        elif op in (0x0091, 0x0092) and len(pkt) >= 22:   # マップ移動 → 前のマップの位置は捨てる
            x, y = struct.unpack_from("<HH", pkt, 18)
            self.pos.clear()
            self.me[key] = [x, y, x, y, 0, 0]
        elif op == 0x02EB and len(pkt) >= 9:              # ログインした位置
            x, y = _posdir(pkt[6:9])
            self.pos.clear()
            self.me[key] = [x, y, x, y, 0, 0]
        elif op == 0x0080 and len(pkt) >= 6:              # 見えなくなった
            self.pos.pop(struct.unpack_from("<I", pkt, 2)[0], None)

    def _spawn_pos(self, op, pkt, aid):
        try:
            if op == 0x09FD and len(pkt) >= SPAWN_MOVE_AT + 6:
                x0, y0, x1, y1 = _movedata(pkt[SPAWN_MOVE_AT:SPAWN_MOVE_AT + 6])
                tick = struct.unpack_from("<I", pkt, SPAWN_TICK_AT)[0]
                spd = struct.unpack_from("<H", pkt, 13)[0] or 150
                self.pos[aid] = [x0, y0, x1, y1, tick, spd]
            elif op in SPAWN_POS_AT and len(pkt) >= SPAWN_POS_AT[op] + 3:
                x, y = _posdir(pkt[SPAWN_POS_AT[op]:SPAWN_POS_AT[op] + 3])
                self.pos[aid] = [x, y, x, y, 0, 0]
            if len(self.pos) > MOBS_MAX:
                self.pos.clear()
        except struct.error:
            pass

    def _name(self, aid, raw24, op, pkt):
        name = _cstr(raw24)
        tag = "name_ok" if name else "name_bad"      # 名前の通信も残す(読む場所が合っているか確かめる用)
        lst = self.raw.setdefault(tag, [])
        lst.append({"t": int(time.time()), "op": "{:04X}".format(op), "id": aid, "name": name or "",
                    "len": len(pkt), "hex": pkt[:200].hex()})
        del lst[:-(RAW_MAX if name else RAW_UNKNOWN_MAX)]
        if name:
            if len(self.names) > MOBS_MAX:
                self.names.clear()
            self.names[aid] = name

    def _spawn(self, op, pkt):
        # 0x09FD〜FF: [op 2][長さ 2][種類 1][ID 4][GID 4] … [最大HP 4][HP 4][ボス 1][体 2][名前(最後まで)]
        at = SPAWN_NAME_AT[op]
        if len(pkt) <= at:
            return
        self._sample(op, pkt)
        aid = struct.unpack_from("<I", pkt, 5)[0]
        self._spawn_pos(op, pkt, aid)
        self._name(aid, pkt[at:at + 24], op, pkt)

    def _hit(self, key, src, skid, dmg, div, crit, lv=0, dist=None):
        if dmg <= 0:
            return
        name = self.md.name_for(key)
        if not name:
            return
        who = self.names.get(src) or "ID{}".format(src)
        skill = self.skill_name(skid)
        where = self._where(key)
        now = int(time.time())
        if skid:
            sv = self.seen.setdefault(str(skid), {"n": 0, "max": 0, "last": 0})
            sv["n"] += 1
            sv["max"] = max(sv["max"], dmg)
            sv.update(last=now, where=where, src=who, lv=lv)
        k = "{}|{}".format(who, skill)
        st = self.stats.setdefault(name, {}).setdefault(where, {}).setdefault(k, [0, 0, 0, 0, 0])
        st[0] += 1
        st[1] += dmg
        st[2] = max(st[2], dmg)
        st[3] = now
        st[4] += max(div, 1)
        kind, ele = self.classify(skid, lv)
        est = False
        if kind == "物理" and dist is not None:       # 技だけで決まらない物理は、距離で決める(推定)
            kind, est = ("物理・近接" if dist <= NEAR else "物理・遠距離"), True
        if kind.startswith("物理・"):
            while len(st) < 7:
                st.append(0)
            st[5 if kind == "物理・近接" else 6] += dmg  # [5]=近接の合計 [6]=遠距離の合計
        self.recent.append({"t": now, "char": name, "md": where, "src": who, "skill": skill,
                            "skid": skid, "lv": lv, "dmg": dmg, "hits": max(div, 1), "crit": 1 if crit else 0,
                            "kind": kind, "ele": ele, "est": 1 if est else 0, "dist": dist})
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
