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
    0x0999  装備した (index・場所・結果 0=成功)
    0x099A  装備を外した (index・場所・結果 0=成功)

被ダメ用に「いまの装備」のまとめ(鎧の属性・属性耐性・DEF・MDEF)も出す(gear_profile)。
鎧の属性と耐性は通信に無いので、着ている装備・カード・エンチャ・ランダムOP から
gear_info.json(ラトリオ=jRO 準拠のアイテムデータ。無いものは rAthena)で出した目安。
"""
import hashlib
import json
import re
import os
import struct
import time

WANT_OPS = {0x0141, 0x00BD, 0x00B0, 0x0B39, 0x0999, 0x099A, 0x0B32, 0x010F, 0x010E}
# スキルの一覧(覚えているスキルと Lv)。jRO のリプレイで確かめた形:
#   0x0B32 [op2][長さ2] + 15バイト×n: スキル番号2 種類4 Lv2 SP2 射程2 上げられる1 Lv(2)2
#   0x010F [op2][長さ2] + 37バイト×n: スキル番号2 種類4 Lv2 SP2 射程2 名前24 上げられる1
#   0x010E [op2] スキル番号2 Lv2 SP2 射程2 上げられる1   (1つ上がった)
SKILL_ENTRY = {0x0B32: 15, 0x010F: 37}
ELES = ("無", "水", "地", "火", "風", "毒", "聖", "闇", "念", "不死")
# ランダムオプションの番号 → 耐性の属性(rAthena item_randomopt_db: ATTR_TOLERACE_*)
RANDOPT_RES = {25: "無", 26: "水", 27: "地", 28: "火", 29: "風", 30: "毒", 31: "聖", 32: "闇", 33: "念", 34: "不死"}
RANDOPT_RES_ALL_BUT_NEUTRAL = 35
RANDOPT_RES_ALL = 193
RANDOPT_BODY = {76 + i: e for i, e in enumerate(ELES)}   # 鎧の属性になるランダムオプション(BODY_ATTR_*)
RANDOPT_WEAPON = {175 + i: e for i, e in enumerate(ELES)}  # 武器の属性になるランダムオプション(WEAPON_ATTR_*)


# 全角カタカナ → 半角(装備セットの短い名前用)
_HALF = dict(zip("アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョーヴ・",
                 "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｯｬｭｮｰｳﾞ･"))
_HALF.update({k: _HALF[v] + "ﾞ" for k, v in zip("ガギグゲゴザジズゼゾダヂヅデドバビブベボ", "カキクケコサシスセソタチツテトハヒフヘホ")})
_HALF.update({k: _HALF[v] + "ﾟ" for k, v in zip("パピプペポ", "ハヒフヘホ")})


def slot_key(it):
    """装備の場所の順(兜上段 → … → シャドウアクセ)。"""
    w = it.get("wear", 0)
    return min([SLOT_ORDER.index(b) for b in SLOT_ORDER if w & b] or [99])


def items_sig(items):
    """装備の中身(場所・アイテム・精錬・★・カード・ランダムOP)。同じなら同じセット。"""
    return json.dumps([[it.get("wear", 0) & ~COSTUME_BITS, it.get("itemId"), it.get("refine", 0), it.get("grade", 0),
                        [c.get("id") for c in it.get("cards") or []],
                        [[o.get("index"), o.get("value")] for o in it.get("options") or []]]
                       for it in sorted(items, key=slot_key)])


def combo_id(mid, shid):
    """被ダメの記録に使う ID: 装備セット + シャドウセット(シャドウが無ければ装備セットだけ)。"""
    return "{}+{}".format(mid, shid) if mid and shid else mid


def tag_label(i, prefix):
    if prefix == "s":
        return "S{}".format(i + 1)
    s = ""
    i += 1
    while i:                       # A..Z, AA, AB…
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def next_tag(table, prefix):
    """まだ使っていないいちばん若いタグ(装備セットは A, B…、シャドウセットは S1, S2…)。"""
    used = {s.get("tag") for s in table.values()}
    i = 0
    while tag_label(i, prefix) in used:
        i += 1
    return tag_label(i, prefix)


def short_item(name, refine=0):
    """「+10ｾﾚｽ」: 精錬値 + 名前の頭3文字(カタカナは半角)。漢字で始まる名前は頭2文字(「星座」)。"""
    name = re.sub(r"^\s*[\[［][^\]］]*[\]］]\s*", "", name or "")    # 先頭の「[シャドウ]」「[衣装]」などは外す
    n = 2 if name and ("\u4e00" <= name[0] <= "\u9fff" or "\u3400" <= name[0] <= "\u4dbf") else 3
    head = "".join(_HALF.get(c, c) for c in name[:n])
    return ("+{}".format(refine) if refine else "") + head


def top_res(res):
    """いちばん高い耐性「聖念50」(同じ値は全部)。無ければ ""。"""
    res = {e: v for e, v in (res or {}).items() if v > 0}
    if not res:
        return ""
    top = max(res.values())
    return "".join(e for e in ELES if res.get(e) == top) + str(top)


def job_name(job):
    return JOB_NAMES.get(job) or ("職業{}".format(job) if job is not None else "")

STAT_NAMES = {
    13: "STR", 14: "AGI", 15: "VIT", 16: "INT", 17: "DEX", 18: "LUK",
    219: "POW", 220: "STA", 221: "WIS", 222: "SPL", 223: "CON", 224: "CRT",
}
DERIVED_NAMES = {
    5: "HP", 6: "MaxHP", 7: "SP", 8: "MaxSP",
    41: "ATK", 42: "ATK2", 43: "MATKmin", 44: "MATKmax",
    45: "DEF", 46: "DEF2", 47: "MDEF", 48: "MDEF2",
    49: "HIT", 50: "FLEE", 51: "FLEE2", 52: "CRIT", 53: "ASPD",
    11: "BaseLv", 55: "JobLv",
    225: "P.ATK", 226: "S.MATK", 227: "RES", 228: "MRES", 229: "H.PLUS", 230: "C.RATE", 232: "AP", 233: "MaxAP",
}
# 装備セット: この場所が全部うまっているときだけ「装備セット」とみなす(衣装 C頭上〜C肩 は数えない)
MAIN_SLOTS = [(256, "兜上段"), (512, "兜中段"), (1, "兜下段"), (16, "鎧"), (2, "右手"), (32, "左手"),
              (4, "肩にかける物"), (64, "靴"), (8, "アクセサリー(1)"), (128, "アクセサリー(2)")]
SHADOW_SLOTS = [(65536, "シャドウ鎧"), (131072, "シャドウ武器"), (262144, "シャドウ盾"), (524288, "シャドウ靴"),
                (1048576, "シャドウアクセ(右)"), (2097152, "シャドウアクセ(左)")]
COSTUME_BITS = 1024 | 2048 | 4096 | 8192
REQUIRED_BITS = sum(b for b, _ in MAIN_SLOTS + SHADOW_SLOTS)
MAIN_BITS = sum(b for b, _ in MAIN_SLOTS)          # 装備セット(メイン10か所)
SHADOW_BITS = sum(b for b, _ in SHADOW_SLOTS)      # シャドウセット(6か所)
SLOT_ORDER = [b for b, _ in MAIN_SLOTS + SHADOW_SLOTS]
# 職業(3次・4次など。それ以外は番号のまま)
JOB_NAMES = {
    0: "ノービス", 1: "ソードマン", 2: "マジシャン", 3: "アーチャー", 4: "アコライト", 5: "マーチャント", 6: "シーフ",
    7: "ナイト", 8: "プリースト", 9: "ウィザード", 10: "ブラックスミス", 11: "ハンター", 12: "アサシン",
    14: "クルセイダー", 15: "モンク", 16: "セージ", 17: "ローグ", 18: "アルケミスト", 19: "バード", 20: "ダンサー",
    23: "スーパーノービス", 24: "ガンスリンガー", 25: "忍者",
    4008: "ロードナイト", 4009: "ハイプリースト", 4010: "ハイウィザード", 4011: "ホワイトスミス", 4012: "スナイパー",
    4013: "アサシンクロス", 4015: "パラディン", 4016: "チャンピオン", 4017: "プロフェッサー", 4018: "チェイサー",
    4019: "クリエイター", 4020: "クラウン", 4021: "ジプシー", 4046: "テコンキッド", 4047: "拳聖", 4049: "ソウルリンカー",
    4054: "ルーンナイト", 4055: "ウォーロック", 4056: "レンジャー", 4057: "アークビショップ", 4058: "メカニック",
    4059: "ギロチンクロス", 4066: "ロイヤルガード", 4067: "ソーサラー", 4068: "ミンストレル", 4069: "ワンダラー",
    4070: "修羅", 4071: "ジェネティック", 4072: "シャドウチェイサー", 4211: "影狼", 4212: "朧", 4215: "リベリオン",
    4218: "サモナー", 4239: "星帝", 4240: "ソウルリーパー", 4190: "拡張スーパーノービス",
    4252: "ドラゴンナイト", 4253: "マイスター", 4254: "シャドウクロス", 4255: "アークメイジ", 4256: "カーディナル",
    4257: "ウィンドホーク", 4258: "インペリアルガード", 4259: "バイオロ", 4260: "アビスチェイサー",
    4261: "エレメンタルマスター", 4262: "インクイジター", 4263: "トルバドゥール", 4264: "トルヴェール",
    4302: "天帝", 4303: "ソウルアセティック", 4304: "蜃気楼", 4305: "不知火", 4306: "ナイトウォッチ",
    4307: "ハイパーノービス", 4308: "スピリットハンドラー",
}
# 転生・騎乗などの別番号 → もとの職業
JOB_ALIAS = dict([(4060 + i, 4054 + i) for i in range(6)] + [(4073 + i, 4066 + i) for i in range(7)] +
                 [(4080, 4054), (4081, 4054), (4082, 4066), (4083, 4066), (4084, 4056), (4085, 4056),
                  (4086, 4058), (4087, 4058), (4243, 4239), (4278, 4257), (4279, 4253), (4280, 4252),
                  (4281, 4258), (4316, 4302)])
for _a, _b in JOB_ALIAS.items():
    JOB_NAMES.setdefault(_a, JOB_NAMES.get(_b, ""))
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


def load_option_names(folder=None):
    folder = folder or os.path.dirname(os.path.abspath(__file__))
    try:
        with open(os.path.join(folder, "option_names.json"), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def load_gear_info(folder=None):
    folder = folder or os.path.dirname(os.path.abspath(__file__))
    try:
        with open(os.path.join(folder, "gear_info.json"), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def load_id2name(folder=None):
    """アイテムID→日本語名の対応表。ratorio の items_part*.json から作ったもの(id2name.json)に、
    ラトリオに無いアイテムの手直し表(item_names_fix.json)を重ねる。"""
    folder = folder or os.path.dirname(os.path.abspath(__file__))
    out = {}
    for fn in ("id2name.json", "item_names_fix.json"):
        try:
            with open(os.path.join(folder, fn), "r", encoding="utf-8") as f:
                out.update({k: v for k, v in json.load(f).items() if not k.startswith("_")})
        except (OSError, ValueError):
            pass
    return out


class CharCore(object):
    def __init__(self, md=None, id2name=None, log=None):
        self.md = md                      # md_core.MDCore (キャラ名を借りる)。無くても動く
        self.id2name = id2name if id2name is not None else load_id2name()
        self.gear_info = load_gear_info()
        self.opt_names = load_option_names()
        self.log = log or (lambda *a: None)
        self.chars = {}
        self.sets = {}         # 装備セット(メイン10か所): ID -> {items, name, tag, first, last, worn, chars: {キャラ: {last, status}}}
        self.shadows = {}      # シャドウセット(6か所): 同じ形(タグは S1, S2…)
        self.set_map = {}      # 前の版の「キャラ:中身」の装備セットID -> 新しいID(被ダメの記録の付けかえ用)
        self.changed = False

    # ---------- 外から呼ぶ ----------
    def feed(self, conn_key, pkt):
        if len(pkt) < 2:
            return
        (op,) = struct.unpack_from("<H", pkt, 0)
        if op not in WANT_OPS:
            return
        self._key = conn_key
        was = self.changed
        self.changed = False
        try:
            self._handle(op, pkt)
            if self.changed:
                name = self._name()
                ch = self.chars.get(name)
                if ch is not None and name != UNKNOWN and ch.get("equips"):
                    self._update_set(name, ch)
        except (struct.error, IndexError):
            pass
        self.changed = self.changed or was

    def snapshot(self):
        return {"chars": self.chars, "sets": self.sets, "shadows": self.shadows, "updated": int(time.time())}

    def restore(self, data):
        if data:
            self.chars = data.get("chars", {})
            self.sets = data.get("sets") or {}
            self.shadows = data.get("shadows") or {}
            self._migrate_sets()
            self._refresh_names()

    def _refresh_names(self):
        """覚えてある装備セットの中で「ID123」のままの名前を、いまの名前の表で直す(あとから名前がわかったもの)。"""
        for table in (self.sets, self.shadows):
            for s in table.values():
                for it in s.get("items") or []:
                    for x, key in [(it, "itemId")] + [(c, "id") for c in it.get("cards") or []]:
                        n = self.id2name.get(str(x.get(key)))
                        if n and x.get("name") != n and str(x.get("name") or "").startswith("ID"):
                            x["name"] = n
                            self.changed = True

    def _migrate_sets(self):
        """前の版の「キャラごとの装備セット」(ch["sets"])を、共通の装備セット・シャドウセットにまとめる。"""
        old = []
        for name, ch in self.chars.items():
            for sid, s in (ch.pop("sets", None) or {}).items():
                old.append((s.get("first") or 0, name, ch, sid, s))
        for _, name, ch, sid, s in sorted(old, key=lambda x: x[0]):
            items = s.get("items") or []
            mid = self._register(self.sets, "m", [i for i in items if i.get("wear", 0) & MAIN_BITS], name, s)
            shid = self._register(self.shadows, "s", [i for i in items if i.get("wear", 0) & SHADOW_BITS], name, s)
            self.set_map[sid] = combo_id(mid, shid)
            if ch.get("cur_set") == sid:
                ch["cur_set"], ch["cur_shadow"] = mid, shid
        for ch in self.chars.values():                     # 前の版の ID のままの着用中は外す
            if ch.get("cur_set") and ch["cur_set"] not in self.sets:
                ch["cur_set"] = ""
        if old:
            self.changed = True
            self.log("[キャラ] 装備セットを共通の形にまとめました: {}個 → 装備セット {}個・シャドウセット {}個".format(
                len(old), len(self.sets), len(self.shadows)))

    def _register(self, table, prefix, items, name, src=None):
        """装備(メインかシャドウの分だけ)を表に登録して ID を返す。同じ中身は同じ ID。src は前の版のセット(引き継ぐ値)。"""
        if not items:
            return ""
        sid = prefix + hashlib.sha1(items_sig(items).encode("utf-8")).hexdigest()[:10]
        now = int(time.time())
        s = table.get(sid)
        if s is None:
            s = table[sid] = {"items": [self._item_view(i) if "slot" not in i else i for i in sorted(items, key=slot_key)],
                              "name": "", "tag": next_tag(table, prefix), "first": (src or {}).get("first") or now,
                              "last": 0, "worn": 0, "chars": {}}
            if src is None:
                self.log("[キャラ] {} の新しい{}: {}".format(name, "装備セット" if prefix == "m" else "シャドウセット", s["tag"]))
        if src is not None:                                 # 前の版から引き継ぐ
            s["name"] = s.get("name") or src.get("name") or ""
            s["first"] = min(s.get("first") or now, src.get("first") or now)
            s["last"] = max(s.get("last") or 0, src.get("last") or 0)
            s["worn"] = s.get("worn", 0) + (src.get("worn") or 0)
            c = s["chars"].setdefault(name, {})
            if (src.get("last") or 0) >= (c.get("last") or 0):
                c.update({"last": src.get("last") or 0, "status": src.get("status")})
        return sid

    def rename_char(self, old, new):
        """キャラの名前を付けかえる(サーバーを分ける前の記録を「名前@サーバー」へ引き継ぐ用)。"""
        if old in self.chars:
            if new not in self.chars:
                self.chars[new] = self.chars.pop(old)
            else:
                self.chars.pop(old)
        for table in (self.sets, self.shadows):
            for s in table.values():
                cs = s.get("chars") or {}
                if old in cs:
                    v = cs.pop(old)
                    if (v.get("last") or 0) >= ((cs.get(new) or {}).get("last") or 0):
                        cs[new] = v
        self.changed = True

    def gear_profile(self, name):
        """被ダメ用: いまの装備のまとめ。{"armor": 鎧の属性, "res": {属性: %}, "def": [..], "mdef": [..]}"""
        ch = self.chars.get(name)
        if not ch:
            return None
        armor, res = "無", {}
        for it in ch.get("equips") or []:
            if it.get("wear", 0) & COSTUME_BITS and not it.get("wear", 0) & ~COSTUME_BITS:
                continue                              # 衣装は耐性に関係ない
            _, de, r = self.item_attrs(it)
            armor = de or armor
            for e, v in r.items():
                res[e] = res.get(e, 0) + v
        d = ch.get("derived") or {}
        mid = ch.get("cur_set") or ""
        sid = combo_id(mid, ch.get("cur_shadow") or "") if mid else ""
        return {"armor": armor, "res": {e: res[e] for e in ELES if res.get(e)},
                "def": [d.get("DEF", 0), d.get("DEF2", 0)], "mdef": [d.get("MDEF", 0), d.get("MDEF2", 0)],
                "known": bool(ch.get("equips")), "sid": sid,
                "set_name": (self.sets.get(mid) or {}).get("name", "")}

    # ---------- 装備セット(メイン10か所)・シャドウセット(6か所)。キャラをまたいで共通 ----------
    def _worn(self, ch):
        """衣装を除いた、いま着ている装備(場所の順)。"""
        worn = [it for it in ch.get("equips") or [] if it.get("wear", 0) & ~COSTUME_BITS]
        return sorted(worn, key=lambda it: min([SLOT_ORDER.index(b) for b in SLOT_ORDER if it.get("wear", 0) & b] or [99]))

    def _item_view(self, it):
        bits = it.get("wear", 0) & ~COSTUME_BITS
        slots = [n for b, n in MAIN_SLOTS + SHADOW_SLOTS if bits & b]
        return {"slot": "・".join(slots), "wear": bits, "itemId": it.get("itemId"),
                "name": self._item_name(it.get("itemId")), "refine": it.get("refine", 0), "grade": it.get("grade", 0),
                "cards": [{"id": c.get("id"), "name": self._item_name(c.get("id"))} for c in it.get("cards") or []],
                "options": [{"index": o.get("index"), "value": o.get("value"),
                             "text": (self.opt_names.get(str(o.get("index"))) or "OP{} {{v}}".format(o.get("index"))).replace("{v}", str(o.get("value")))}
                            for o in it.get("options") or []]}

    def _status_view(self, name, ch):
        info = {}
        if self.md is not None and hasattr(self.md, "char_info"):
            info = self.md.char_info.get(name) or {}
        d = dict(ch.get("derived") or {})
        job = info.get("job")
        return {"lv": d.get("BaseLv") or info.get("lv"), "jobLv": d.get("JobLv") or info.get("jobLv"), "job": job, "jobName": job_name(job),
                "stats": {k: dict(v) for k, v in (ch.get("stats") or {}).items()}, "derived": d}

    def _update_set(self, name, ch):
        """メイン10か所が全部うまったら装備セット、シャドウ6か所が全部うまったらシャドウセットとして覚える。
        同じ中身は(キャラが違っても)同じセット。衣装は数えない。"""
        worn = self._worn(ch)
        bits = 0
        for it in worn:
            bits |= it.get("wear", 0)
        ch["missing"] = [n for b, n in MAIN_SLOTS + SHADOW_SLOTS if not bits & b]
        now = int(time.time())
        status = None
        for table, prefix, req, key in ((self.sets, "m", MAIN_BITS, "cur_set"), (self.shadows, "s", SHADOW_BITS, "cur_shadow")):
            if bits & req != req:
                ch[key] = ""
                continue
            sid = self._register(table, prefix, [it for it in worn if it.get("wear", 0) & req], name)
            s = table[sid]
            c = s.setdefault("chars", {}).setdefault(name, {})
            if ch.get(key) != sid:
                s["worn"] = s.get("worn", 0) + 1
                c["n"] = c.get("n", 0) + 1               # このキャラが着た回数(よく使う装備セットの順に使う)
            s["last"] = now
            status = status or self._status_view(name, ch)
            c.update({"last": now, "status": status})   # このキャラが着ていたときの Lv・ステータス(最新)
            ch[key] = sid

    def item_attrs(self, it):
        """装備1つ(カード・エンチャ・ランダムOP込み)の 武器の属性・鎧の属性・属性耐性。"""
        ae, de, res = "", "", {}
        ids = [it.get("itemId")] + [c.get("id") for c in it.get("cards") or []]
        refine = it.get("refine", 0) or 0
        for iid in ids:
            g = self.gear_info.get(str(iid)) or {}
            ae = g.get("ae") or ae
            de = g.get("de") or de
            for e, v in (g.get("re") or {}).items():
                res[e] = res.get(e, 0) + v
            for over, by, e, v in g.get("rr") or []:      # 精錬が over 以上なら v × (精錬÷by)。by=0 は1回だけ
                if refine >= over:
                    res[e] = res.get(e, 0) + v * (refine // by if by else 1)
        for o in it.get("options") or []:
            oi, v = o.get("index"), o.get("value", 0)
            if oi in RANDOPT_RES:
                res[RANDOPT_RES[oi]] = res.get(RANDOPT_RES[oi], 0) + v
            elif oi in (RANDOPT_RES_ALL_BUT_NEUTRAL, RANDOPT_RES_ALL):
                for e in (ELES[1:] if oi == RANDOPT_RES_ALL_BUT_NEUTRAL else ELES):
                    res[e] = res.get(e, 0) + v
            elif oi in RANDOPT_BODY:
                de = RANDOPT_BODY[oi]
            elif oi in RANDOPT_WEAPON:
                ae = RANDOPT_WEAPON[oi]
        return ae, de, res

    def item_extra(self, it):
        """装備1つ(カード・エンチャ込み)の、属性のほかの軽減 {"種族:悪魔": %, "ボス": %, "サイズ:大": %, "遠距離": %, "魔法": %}。"""
        out = {}
        refine = it.get("refine", 0) or 0
        for iid in [it.get("itemId")] + [c.get("id") for c in it.get("cards") or []]:
            g = self.gear_info.get(str(iid)) or {}
            for k, v in (g.get("x") or {}).items():
                out[k] = out.get(k, 0) + v
            for over, by, k, v in g.get("xr") or []:
                if refine >= over:
                    out[k] = out.get(k, 0) + v * (refine // by if by else 1)
        return out

    def items_profile(self, items):
        """装備のあつまり(装備セットなど)の軽減のまとめ: {"armor": 鎧の属性("" = この中に鎧が無い), "res": {属性: %}, "x": {…}}"""
        armor, res, x = "", {}, {}
        for it in items or []:
            w = it.get("wear", 0)
            if w & COSTUME_BITS and not w & ~COSTUME_BITS:
                continue
            _, de, r = self.item_attrs(it)
            if w & 16:
                armor = de or "無"
            elif de:
                armor = armor or de
            for e, v in r.items():
                res[e] = res.get(e, 0) + v
            for k, v in self.item_extra(it).items():
                x[k] = x.get(k, 0) + v
        return {"armor": armor, "res": {e: res[e] for e in ELES if res.get(e)}, "x": {k: v for k, v in x.items() if v}}

    def _auto_names(self, sets, bits=(2, 16, 4)):
        """装備セットの自動の名前「+10ｾﾚｽ聖/+10ﾖﾙｽ毒/+7ｽﾃﾗ聖念50」
        (武器+武器の属性 / 鎧+鎧の属性 / 肩+いちばん高い耐性)。同じになったら (2) など。
        シャドウセットは シャドウ武器 / シャドウ鎧 / シャドウ盾 で同じように作る。"""
        used = {}
        for sid in sorted(sets, key=lambda k: sets[k].get("first", 0)):
            items = sets[sid].get("items") or []
            parts = []
            for bit in bits:
                i = next((i for i in items if i.get("wear", 0) & bit), None)
                if not i:
                    continue
                ae, de, res = self.item_attrs(i)
                tag = ae if bit in (2, 131072) else (de if de and de != "無" else top_res(res)) if bit in (16, 65536) else top_res(res)
                parts.append(short_item(i.get("name"), i.get("refine", 0)) + tag)
            base = "/".join(parts) or "装備セット"
            used[base] = used.get(base, 0) + 1
            sets[sid]["auto"] = base if used[base] == 1 else "{} ({})".format(base, used[base])

    def equip_view(self):
        """画面用: {"chars": キャラごとのいまの装備, "sets": 装備セット, "shadows": シャドウセット}"""
        self._auto_names(self.sets)
        self._auto_names(self.shadows, (131072, 65536, 262144))
        for table in (self.sets, self.shadows):          # 軽減のまとめ(計算機の被ダメの検証用。毎回いまの耐性の表で出す)
            for s in table.values():
                s["prof"] = self.items_profile(s.get("items"))
        chars = {}
        for name, ch in self.chars.items():
            if name == UNKNOWN or not (ch.get("equips") or ch.get("stats") or ch.get("skills")):
                continue
            chars[name] = {"cur": ch.get("cur_set") or "", "shadow": ch.get("cur_shadow") or "",
                           "missing": ch.get("missing") or [], "has_equip": bool(ch.get("equips")),
                           "now": [self._item_view(it) for it in self._worn(ch)], "status": self._status_view(name, ch),
                           "skills": ch.get("skills") or {}, "updated": ch.get("updated") or 0}
        return {"chars": chars, "sets": self.sets, "shadows": self.shadows, "unknown": self.unknown_items()}

    def set_item_name(self, iid, name):
        """アイテムの名前を付ける(名前がわからないアイテム用)。覚えてある装備セットの中身の名前も直す。"""
        iid, name = str(iid), (name or "").strip()[:40]
        if not iid.isdigit() or not name:
            return False
        self.id2name[iid] = name
        for table in (self.sets, self.shadows):
            for s in table.values():
                for it in s.get("items") or []:
                    if str(it.get("itemId")) == iid:
                        it["name"] = name
                    for c in it.get("cards") or []:
                        if str(c.get("id")) == iid:
                            c["name"] = name
        self.changed = True
        return True

    def unknown_items(self):
        """名前がわからないアイテム(いま着ている装備と、覚えてある装備セットの中): [{id, slot}]"""
        seen = {}

        def look(it, slot):
            for iid in [it.get("itemId")] + [c.get("id") for c in it.get("cards") or []]:
                if iid and str(iid) not in self.id2name and str(iid) not in seen:
                    seen[str(iid)] = slot if iid == it.get("itemId") else slot + "のカード・エンチャント"
        for ch in self.chars.values():
            for it in self._worn(ch):
                look(it, self._item_view(it)["slot"])
        for table in (self.sets, self.shadows):
            for s in table.values():
                for it in s.get("items") or []:
                    look(it, it.get("slot") or "")
        return [{"id": k, "slot": v} for k, v in seen.items()]

    def _table(self, sid):
        return self.shadows if str(sid).startswith("s") else self.sets

    def rename_set(self, name, sid, new):
        s = self._table(sid).get(sid)
        if s is not None:
            s["name"] = (new or "").strip()[:40]
            self.changed = True

    def set_tag(self, sid, tag):
        s = self._table(sid).get(sid)
        if s is not None:
            s["tag"] = (tag or "").strip()[:8] or next_tag(self._table(sid), "s" if sid.startswith("s") else "m")
            self.changed = True

    def set_color(self, sid, color):
        """記号の色(#rrggbb)。空にすると自動の色に戻す。"""
        s = self._table(sid).get(sid)
        color = (color or "").strip()
        if s is not None and (not color or re.match(r"^#[0-9a-fA-F]{6}$", color)):
            if color:
                s["color"] = color.lower()
            else:
                s.pop("color", None)
            self.changed = True

    def delete_set(self, name, sid):
        if self._table(sid).pop(sid, None) is not None:
            for ch in self.chars.values():
                for key in ("cur_set", "cur_shadow"):
                    if ch.get(key) == sid:
                        ch[key] = ""
            self.changed = True

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

        elif op in SKILL_ENTRY:                          # スキルの一覧(まるごと入れかえ)
            size, body = SKILL_ENTRY[op], pkt[4:]
            if len(body) >= size and len(body) % size == 0:
                skills = {}
                for i in range(len(body) // size):
                    skid, _typ, lv = struct.unpack_from("<HIH", body, i * size)
                    if skid and 0 < lv <= 100:
                        skills[str(skid)] = lv
                ch = self._ch()
                if ch.get("skills") != skills:
                    ch["skills"] = skills
                    self.changed = True

        elif op == 0x010E and len(pkt) >= 6:             # スキルが1つ上がった
            skid, lv = struct.unpack_from("<HH", pkt, 2)
            if skid and 0 < lv <= 100:
                ch = self._ch()
                ch.setdefault("skills", {})[str(skid)] = lv
                self.changed = True

        elif op == 0x0999 and len(pkt) >= 11:            # 装備した(結果 0 = 成功)
            idx, loc = struct.unpack_from("<HI", pkt, 2)
            if pkt[10] == 0:
                self._wear(idx, loc, True)

        elif op == 0x099A and len(pkt) >= 9:             # 外した(結果 0 = 成功)
            idx, loc = struct.unpack_from("<HI", pkt, 2)
            if pkt[8] == 0:
                self._wear(idx, loc, False)

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

    def _wear(self, idx, loc, on):
        """装備した/外した。0x0B39 の一覧(equips と bag)の中で入れかえる。"""
        ch = self._ch()
        eq, bag = ch.setdefault("equips", []), ch.setdefault("bag", [])
        item = next((x for x in eq + bag if x.get("inventoryIndex") == idx), None)
        if item is None:
            return
        if item in eq:
            eq.remove(item)
        if item in bag:
            bag.remove(item)
        if on:
            for x in [x for x in eq if x.get("wear", 0) & loc]:   # 同じ場所の装備は外れる
                eq.remove(x)
                x["wear"], x["slot"] = 0, ""
                bag.append(x)
            item["wear"], item["slot"] = loc, LOC_NAMES.get(loc, str(loc))
            eq.append(item)
        else:
            item["wear"], item["slot"] = 0, ""
            bag.append(item)
        ch["updated"] = int(time.time())
        self.changed = True

    def _equip(self, e):
        """装備1件 68バイト。精錬と★は末尾にある(先頭ではない)。"""
        idx, itid = struct.unpack_from("<HI", e, 0)
        loc, wear = struct.unpack_from("<II", e, 7)
        cards = struct.unpack_from("<4I", e, 15)
        # e[39] はランダムOPの数(使わない。5件ぶん全部見て、番号が0のものは飛ばす)
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
