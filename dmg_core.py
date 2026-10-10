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
from collections import deque

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
# 状態異常(自分の頭の上のアイコン)と、ダメージの無い技
#   0983 [番号2][ID4][オン1][全体4][残り4][値4×3]  043F [番号2][ID4][オン1][残り4][値4×3]  0196 [番号2][ID4][オン1]
#   0229 [ID4][体の状態2][健康の状態2][効果4][PK1]   (石化・凍結・スタン・睡眠 / 毒・呪い・沈黙・混乱・暗闇・出血・猛毒・恐怖)
#   09CB [技2][Lv4][相手ID4][使った人ID4][結果1]  011A [技2][Lv2][相手ID4][使った人ID4][結果1]
#   07FB [使った人4][相手4][x2][y2][技2][属性4][詠唱時間4][..]   (詠唱開始)
OP_ICON = {0x0983: 9, 0x043F: 9, 0x0196: 9}     # 値: オン/オフの位置は 8
OP_OPT = 0x0229
OP_USE = {0x09CB: "<HiIIb", 0x011A: "<HhIIb"}
OP_CAST = 0x07FB
# 技の設置物(地面に置く技: ライトニングランド・Mストームガストなど)の出現 [op2][長さ2][設置物ID4][置いた人ID4][x2][y2][種類4]…
# 設置物の技の当たり(01DE)は、使った人が設置物IDになる → 置いた人の名前で記録する(jRO のリプレイで確認)
OP_UNIT = 0x09CA
# アイコン番号(rAthena の EFST_*) → 名前。状態異常・弱体化だけ
AILMENT_ICON = {
    875: "石化", 880: "石化", 876: "凍結", 877: "スタン", 878: "睡眠", 881: "火傷", 882: "拘束",
    883: "毒", 884: "呪い", 885: "沈黙", 886: "混乱", 887: "暗闇", 124: "出血", 890: "猛毒", 891: "恐怖",
    435: "深い眠り", 470: "ハウリング(マンドラゴラ)", 437: "冷凍", 351: "フロストミスティ",
    50: "武器脱衣", 51: "盾脱衣", 52: "鎧脱衣", 53: "兜脱衣", 420: "アクセ脱衣",
    8: "クァグマイア", 282: "スローキャスト", 286: "致命傷", 22: "レックスエーテルナ", 354: "マーシュオブアビス",
    45: "アンクルスネア", 129: "スパイダーウェブ", 737: "火傷",
    637: "回復不可", 1205: "深い暗闇", 1206: "深い沈黙", 1207: "倦怠", 1208: "凍傷", 1209: "気絶",
    1210: "感電", 1211: "結晶化", 1212: "発火", 1213: "不運", 1214: "致死毒", 1215: "憂鬱", 1216: "聖火",
}
OPT1_NAMES = {1: "石化", 2: "凍結", 3: "スタン", 4: "睡眠", 6: "石化", 7: "火傷", 8: "拘束"}
OPT2_NAMES = {0x0001: "毒", 0x0002: "呪い", 0x0004: "沈黙", 0x0008: "混乱", 0x0010: "暗闇", 0x0040: "出血",
              0x0080: "猛毒", 0x0100: "恐怖"}
CAUSE_SEC = 3           # 状態異常になる前この秒数以内に受けた技を「原因」とみなす
OPS = ({OP_ACT, OP_SKILL, OP_NAME, OP_NAME_ALL, OP_NAME_TITLE, OP_OPT, OP_CAST, OP_UNIT} | set(OP_SPAWN) | set(OP_POS)
       | set(OP_ICON) | set(OP_USE))
POS_RAW_MAX = 60        # 位置の通信(距離で近接/遠距離を決めるための下調べ用)
UNKNOWN_NAME = "名前不明"
NO_NAME = "名前の無い相手"   # 名前が「#」から始まるもの(「#」の前が空)
RING_MAX = 400          # 名前がわからない相手を調べる用に、接続ごとに覚えておく最近の通信の数

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


def shown_name(s):
    """まとめる用の名前。「#」より後ろ(討伐数を数えるサブクエ用の個体番号など)を外す
    (「暴食の変異Hプードル#4」→「暴食の変異Hプードル」)。番号ごとに行が分かれないようにする。"""
    if s and "#" in s:
        return s.split("#", 1)[0].strip() or NO_NAME
    return s


def _cstr(b):
    """名前の24バイトを文字にする。名前ではなさそうなら None。"""
    b = b.split(b"\x00", 1)[0]
    for raw in (b, b[:-1]):             # 長い名前はサーバーが途中(2バイト文字の真ん中)で切ることがある
        for enc in ("utf-8", "cp932"):    # ふつうは cp932。UTF-8 として正しく読めるときだけ UTF-8
            try:
                s = raw.decode(enc)
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


def load_mob_info(path):
    """モンスターの名前 -> {lv, hp, race, size, ele, boss}(mob_info.json = ラトリオのデータから)。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def load_skill_names(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {int(k): v for k, v in json.load(f).items()}
    except Exception:
        return {}


class DmgCore(object):
    def __init__(self, md, skill_names=None, log=None, fix=None, info=None, efix=None, mobs=None):
        self.md = md                        # md_core.MDCore(キャラ名・いる場所・自分のIDを借りる)
        self.skills = skill_names or {}     # ラトリオのデータ(番号 -> 名前)
        self.fix = dict(fix or {})          # 手で付けた名前(番号 -> 名前)。こっちが優先
        self.info = info or {}              # 番号 -> [種類, 属性, 射程, 印](skill_info.json)
        self.efix = dict(efix or {})        # 手で直した種類・属性(番号 -> {"ele":, "kind":})。こっちが優先
        self.mobs = mobs or {}              # モンスターの名前 -> {lv, hp, race, size, ele, boss}(mob_info.json)
        self.id_used = set()                # 名前がわからず「ID○○」で記録した相手(あとで名前がわかったら付けかえる)
        self.seen = {}                      # "番号" -> {n, max, last, where, src, lv}
        self.raw = {}                       # "08C8"/"01DE"/"unknown" -> [{t, char, where, hex, ...}]
        self.gear = None                    # キャラ名 -> いまの装備のまとめ(char_core.CharCore.gear_profile)
        self.sets = {}                      # 装備セットID -> {"p": まとめ, "first": 時刻, "last": 時刻, "n": 回数}
        self.gstats = {}                    # キャラ -> MD -> 装備セットID -> "相手|技" -> 行(stats と同じ形)
        self.ails = {}                      # キャラ -> MD -> "状態異常|相手|技" -> [回数, 最後]
        self.acts = {}                      # キャラ -> MD -> "相手|技" -> [回数, 最後](ダメージの無い技)
        self.active = {}                    # 接続 -> いまかかっている状態異常の名前の集まり
        self.last_act = {}                  # 接続 -> 最後に受けた技 (時刻, 相手, 技)
        self.pos = {}                       # ID -> [x0, y0, x1, y1, 開始時刻, 速さ](いるマップの中だけ)
        self.me = {}                        # 接続 -> 自分の [x0, y0, x1, y1, 開始時刻, 速さ]
        self.log = log or (lambda *a: None)
        self.names = {}                     # 相手のID -> 名前
        self.units = {}                     # 技の設置物のID -> 置いた人のID
        self.ring = {}                      # 接続 -> 最近の通信 [(op, 先頭)](名前がわからない相手を調べる用)
        self.stats = {}                     # キャラ -> MD -> "相手|技" -> [回数, 合計, 最大, 最後, ヒット数合計]
        self.recent = []                    # 最近の被ダメ
        self.samples = {}
        self.changed = False

    # ---------------- 保存 ----------------
    def snapshot(self):
        return {"stats": self.stats, "recent": self.recent[-RECENT_MAX:], "seen": self.seen,
                "sets": self.sets, "gstats": self.gstats, "ails": self.ails, "acts": self.acts}

    def restore(self, d):
        if d:
            self.stats = d.get("stats") or {}
            self.recent = d.get("recent") or []
            self.seen = d.get("seen") or {}
            self.sets = d.get("sets") or {}
            self.gstats = d.get("gstats") or {}
            self.ails = d.get("ails") or {}
            self.acts = d.get("acts") or {}
            # 「ID○○」のままの相手は、名前がわかったら付けかえられるように覚えておく
            for per_char in self.stats.values():
                for dd in per_char.values():
                    for k in dd:
                        who = k.split("|")[0]
                        if who.startswith("ID") and who[2:].isdigit():
                            self.id_used.add(int(who[2:]))
            self._fix_bad_names()
            self._fix_hash_names()

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

    def _fix_hash_names(self):
        """前の版で「#」の後ろまで付けて記録した相手を、画面に出る名前にまとめる(1匹ずつ分かれていたのを1行に)。"""
        olds = set()
        for per_char in self.stats.values():
            for d in per_char.values():
                olds.update(k.split("|")[0] for k in d if "#" in k.split("|")[0])
        for per_char in self.acts.values():
            for d in per_char.values():
                olds.update(k.split("|")[0] for k in d if "#" in k.split("|")[0])
        for per_char in self.ails.values():
            for d in per_char.values():
                olds.update(k.split("|")[1] for k in d if "#" in k.split("|")[1])
        for r in self.recent:
            if "#" in (r.get("src") or ""):
                olds.add(r["src"])
        for old in olds:
            self._rename_who(old, shown_name(old))

    def rename_char(self, old, new):
        """キャラの名前を付けかえる(サーバーを分ける前の記録を「名前@サーバー」へ引き継ぐ用)。"""
        for d in (self.stats, self.gstats, self.ails, self.acts):
            if old not in d:
                continue
            if new not in d:
                d[new] = d.pop(old)
            else:                                        # 両方あれば、新しい方に無い場所だけ足す
                for where, v in d.pop(old).items():
                    d[new].setdefault(where, v)
        for r in self.recent:
            if r.get("char") == old:
                r["char"] = new
        for s in self.sets.values():
            if s.get("char") == old:
                s["char"] = new
        self.changed = True

    def remap_sets(self, mapping):
        """装備セットの ID を付けかえる(前の版の「キャラ:中身」→ 共通の 装備セット+シャドウセット)。同じになった行はまとめる。"""
        if not mapping:
            return
        for old, new in mapping.items():
            if old == new or old not in self.sets:
                continue
            o = self.sets.pop(old)
            n = self.sets.get(new)
            if n is None:
                self.sets[new] = o
            else:
                n["n"] = n.get("n", 0) + o.get("n", 0)
                n["first"] = min(n.get("first") or o.get("first") or 0, o.get("first") or n.get("first") or 0)
                if (o.get("last") or 0) > (n.get("last") or 0):
                    n.update(last=o.get("last"), p=o.get("p"), char=o.get("char"))
        for per_char in self.gstats.values():
            for sets in per_char.values():
                for old in [k for k in sets if k in mapping and mapping[k] != k]:
                    rows = sets.pop(old)
                    tgt = sets.setdefault(mapping[old], {})
                    for k, v in rows.items():
                        if k in tgt:
                            _merge(tgt[k], v)
                        else:
                            tgt[k] = v
        for r in self.recent:
            if r.get("gear") in mapping:
                r["gear"] = mapping[r["gear"]]
        self.changed = True

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
        """技の (種類, 属性)。手で直したものがあればそれ。"""
        kind, ele = self._classify(skid, lv)
        fx = self.efix.get(skid) or {}
        return fx.get("kind") or kind, fx.get("ele") or ele

    def set_attr(self, skid, ele, kind):
        """技の属性・種類を手で直す(空なら自動に戻す)。"""
        fx = {k: v for k, v in (("ele", ele), ("kind", kind)) if v}
        if fx:
            self.efix[skid] = fx
        else:
            self.efix.pop(skid, None)
        for r in self.recent:
            if r.get("skid") == skid:
                k2, e2 = self.classify(skid, r.get("lv") or 0)
                if not (r.get("est") and k2 == "物理"):
                    r["kind"] = k2
                r["ele"] = e2
        self.changed = True

    def _classify(self, skid, lv=0):
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
            akind, aele = self._classify(sk, v.get("lv") or 0)
            out.append(dict(v, id=sk, name=self.skill_name(sk), base=self.skills.get(sk, ""),
                            fixed=sk in self.fix, known=self.known(sk), kind=kind, ele=ele,
                            akind=akind, aele=aele, efix=self.efix.get(sk) or {}))
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
            self.gstats.pop(char, None)
            self.ails.pop(char, None)
            self.acts.pop(char, None)
            self.recent = [r for r in self.recent if r.get("char") != char]
        else:
            self.stats, self.recent, self.gstats, self.sets, self.ails, self.acts = {}, [], {}, {}, {}, {}
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
        if op not in (OP_ACT, OP_SKILL):
            r = self.ring.get(key)
            if r is None:
                r = self.ring[key] = deque(maxlen=RING_MAX)
            r.append((op, bytes(pkt[:200])))
        if op not in OPS:
            return
        try:
            if op in OP_ICON or op == OP_OPT or op in OP_USE or op == OP_CAST:
                self._status(key, op, pkt)
            elif op in OP_POS:
                self._pos(key, op, pkt)
                self._move(key, op, pkt)
            elif op in OP_SPAWN:
                self._spawn(op, pkt)
            elif op == OP_UNIT and len(pkt) >= 12:
                uid, owner = struct.unpack_from("<II", pkt, 4)
                if len(self.units) > MOBS_MAX:
                    self.units.clear()
                self.units[uid] = owner
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

    def _status(self, key, op, pkt):
        """状態異常(自分のアイコン)と、自分に使われたダメージの無い技。"""
        now = time.time()
        tag = "st_{:04X}".format(op)
        if op in OP_ICON and len(pkt) >= 9:
            icon, aid = struct.unpack_from("<HI", pkt, 2)
            if not self._mine(key, aid):
                return
            on = pkt[8] != 0
            name = AILMENT_ICON.get(icon)
            self._raw_st(key, tag, pkt, {"icon": icon, "on": on, "name": name or ""}, keep=bool(name))
            if name:
                self._ailment(key, name, on, now)
        elif op == OP_OPT and len(pkt) >= 15:
            aid, body, health = struct.unpack_from("<IHH", pkt, 2)
            if not self._mine(key, aid):
                return
            self._raw_st(key, tag, pkt, {"body": body, "health": health}, keep=bool(body or health))
            names = {OPT1_NAMES[body]} if body in OPT1_NAMES else set()
            names |= {n for bit, n in OPT2_NAMES.items() if health & bit}
            # 0229 は今の状態の全部なので、ここに無いもの(このしくみで分かるもの)は治った
            for n in set(OPT1_NAMES.values()) | set(OPT2_NAMES.values()):
                self._ailment(key, n, n in names, now, quiet=True)
        elif op in OP_USE and len(pkt) >= struct.calcsize(OP_USE[op]):
            skid, lv, tgt, src, res = struct.unpack_from(OP_USE[op], pkt, 2)
            if not self._mine(key, tgt) or src == tgt or self._mine(key, src):
                return
            self._raw_st(key, tag, pkt, {"skid": skid, "lv": lv, "src": src, "res": res}, keep=True)
            who = self.names.get(src)
            if not who:
                who = "ID{}".format(src)
                self.id_used.add(src)
            skill = self.skill_name(skid)
            self.last_act[key] = (now, who, skill)
            name = self.md.name_for(key)
            if name:
                k = "{}|{}".format(who, skill)
                st = self.acts.setdefault(name, {}).setdefault(self._where(key), {}).setdefault(k, [0, 0])
                st[0] += 1
                st[1] = int(now)
                self.changed = True
        elif op == OP_CAST and len(pkt) >= 16:
            src, tgt = struct.unpack_from("<II", pkt, 2)
            skid = struct.unpack_from("<H", pkt, 14)[0]
            if self._mine(key, tgt) and not self._mine(key, src):
                self._raw_st(key, tag, pkt, {"skid": skid, "src": src}, keep=True)

    def _raw_st(self, key, tag, pkt, parsed, keep):
        if not keep:
            return
        lst = self.raw.setdefault(tag, [])
        rec = {"t": int(time.time()), "hex": pkt[:40].hex(), "len": len(pkt)}
        rec.update(parsed)
        lst.append(rec)
        del lst[:-POS_RAW_MAX]

    def _ailment(self, key, ail, on, now, quiet=False):
        act = self.active.setdefault(key, set())
        if not on:
            act.discard(ail)
            return
        if ail in act:                 # もうかかっている(アイコンと 0229 の両方で届く)
            return
        act.add(ail)
        name = self.md.name_for(key)
        if not name:
            return
        la = self.last_act.get(key)
        who, skill = (la[1], la[2]) if la and now - la[0] <= CAUSE_SEC else ("", "")
        k = "{}|{}|{}".format(ail, who, skill)
        st = self.ails.setdefault(name, {}).setdefault(self._where(key), {}).setdefault(k, [0, 0])
        st[0] += 1
        st[1] = int(now)
        self.changed = True

    def _rename_who(self, old, new):
        """記録の中の相手の名前 old を new に付けかえる(同じ行があればまとめる)。"""
        def rekey(d, sep_first):
            for k in [k for k in d if k.split("|")[sep_first] == old]:
                parts = k.split("|")
                parts[sep_first] = new
                nk = "|".join(parts)
                v = d.pop(k)
                if nk not in d:
                    d[nk] = v
                elif len(v) >= 5:                     # 被ダメの行
                    _merge(d[nk], v)
                else:                                 # [回数, 最後] の行
                    d[nk][0] += v[0]
                    d[nk][1] = max(d[nk][1], v[1])
        for per_char in self.stats.values():
            for d in per_char.values():
                rekey(d, 0)
        for per_char in self.gstats.values():
            for sets in per_char.values():
                for d in sets.values():
                    rekey(d, 0)
        for per_char in self.acts.values():
            for d in per_char.values():
                rekey(d, 0)
        for per_char in self.ails.values():
            for d in per_char.values():
                rekey(d, 1)
        for r in self.recent:
            if r.get("src") == old:
                r["src"] = new
        for v in self.seen.values():
            if v.get("src") == old:
                v["src"] = new
        self.changed = True

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

    def _raw_id(self, key, src):
        """名前がわからない相手のIDが入っている最近の通信を残す(どの通信で名前が来るのか調べる用)。"""
        b = struct.pack("<I", src)
        hits = []
        for op, pkt in reversed(self.ring.get(key) or ()):
            at = pkt.find(b, 2)
            if at >= 0:
                hits.append({"op": "{:04X}".format(op), "at": at, "len": len(pkt), "hex": pkt.hex()})
                if len(hits) >= 6:
                    break
        lst = self.raw.setdefault("id_src", [])
        lst.append({"t": int(time.time()), "id": src, "where": self._where(key), "found": hits})
        del lst[:-60]

    def _name(self, aid, raw24, op, pkt):
        name = _cstr(raw24)
        tag = "name_ok" if name else "name_bad"      # 名前の通信も残す(読む場所が合っているか確かめる用)
        lst = self.raw.setdefault(tag, [])
        lst.append({"t": int(time.time()), "op": "{:04X}".format(op), "id": aid, "name": name or "",
                    "len": len(pkt), "hex": pkt[:200].hex()})
        del lst[:-(RAW_MAX if name else RAW_UNKNOWN_MAX)]
        if name:
            name = shown_name(name)
            if len(self.names) > MOBS_MAX:
                self.names.clear()
            self.names[aid] = name
            if aid in self.id_used:                  # 「ID○○」で記録していた相手の名前がわかった
                self.id_used.discard(aid)
                self._rename_who("ID{}".format(aid), name)

    def _spawn(self, op, pkt):
        # 0x09FD〜FF: [op 2][長さ 2][種類 1][ID 4][GID 4] … [最大HP 4][HP 4][ボス 1][体 2][名前(最後まで)]
        at = SPAWN_NAME_AT[op]
        if len(pkt) <= at:
            return
        self._sample(op, pkt)
        aid = struct.unpack_from("<I", pkt, 5)[0]
        self._spawn_pos(op, pkt, aid)
        self._name(aid, pkt[at:at + 24], op, pkt)

    def _gear_set(self, name, now):
        """いまの装備のまとめを、同じものは同じIDにして覚える。わからなければ ""。"""
        try:
            p = self.gear(name) if self.gear else None
        except Exception:
            p = None
        if not p or not p.get("known") or not p.get("sid"):
            return ""                       # 全部の場所がうまった装備(装備セット)のときだけ
        sid = p["sid"]
        s = self.sets.setdefault(sid, {"first": now, "n": 0})
        s["p"] = {k: p[k] for k in ("armor", "res", "def", "mdef")}   # 鎧属性・耐性・DEF・MDEF(最新)
        s["char"] = name
        s["last"] = now
        s["n"] += 1
        return sid

    def _hit(self, key, src, skid, dmg, div, crit, lv=0, dist=None):
        if dmg <= 0:
            return
        name = self.md.name_for(key)
        if not name:
            return
        if src not in self.names and src in self.units:
            src = self.units[src]                     # 技の設置物の当たり → 置いた人
        who = self.names.get(src)
        if not who:
            who = "ID{}".format(src)
            if src not in self.id_used:
                self._raw_id(key, src)
            self.id_used.add(src)
        skill = self.skill_name(skid)
        where = self._where(key)
        self.last_act[key] = (time.time(), who, skill)
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
        gid = self._gear_set(name, now)
        if gid:                                       # 装備セットごとにも同じ形で数える
            row = [1, dmg, dmg, now, max(div, 1)]
            if kind.startswith("物理・"):
                row += [dmg, 0] if kind == "物理・近接" else [0, dmg]
            g = self.gstats.setdefault(name, {}).setdefault(where, {}).setdefault(gid, {})
            if k in g:
                _merge(g[k], row)
            else:
                g[k] = row
        self.recent.append({"t": now, "char": name, "md": where, "src": who, "skill": skill,
                            "skid": skid, "lv": lv, "dmg": dmg, "hits": max(div, 1), "crit": 1 if crit else 0,
                            "kind": kind, "ele": ele, "est": 1 if est else 0, "dist": dist, "gear": gid})
        del self.recent[:-RECENT_MAX]
        self.changed = True

    # ---------------- ウェブ用 ----------------
    def for_char_gear(self, name, top=40):
        """キャラの被ダメまとめ(MDごと・装備セットごと)。"""
        out = {}
        for where, sets in (self.gstats.get(name) or {}).items():
            for gid, d in sets.items():
                rows = sorted(d.items(), key=lambda kv: -kv[1][2])[:top]
                out.setdefault(where, {})[gid] = {k: v for k, v in rows}
        return out

    def for_char_status(self, name):
        """キャラの状態異常と、ダメージの無い技(MDごと)。"""
        return self.ails.get(name) or {}, self.acts.get(name) or {}

    def mob_view(self):
        """記録にある相手のうち、モンスターのデータがあるものだけ {名前: {lv, hp, race, size, ele, boss}}。"""
        who = {r.get("src") for r in self.recent}
        for per_char in self.stats.values():
            for d in per_char.values():
                who.update(k.split("|")[0] for k in d)
        return {w: self.mobs[w] for w in who if w in self.mobs}

    def for_char(self, name, top=40):
        """キャラの被ダメまとめ(MDごと、最大ダメージ順に top 件)。"""
        out = {}
        for where, d in (self.stats.get(name) or {}).items():
            rows = sorted(d.items(), key=lambda kv: -kv[1][2])[:top]
            out[where] = {k: v for k, v in rows}
        return out
