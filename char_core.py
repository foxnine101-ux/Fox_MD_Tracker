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
import copy
import hashlib
import unicodedata
import json
import re
import os
import struct
import time

WANT_OPS = {0x0141, 0x00BD, 0x00B0, 0x0B39, 0x0999, 0x099A, 0x0B32, 0x010F, 0x010E, 0x07FA, 0x0B41, 0x00B1, 0x0ACB}
INV_PAGE = 100      # 一覧は100件で区切って届く
STORAGE_OPS = (0x00F4, 0x01C4, 0x0A0A, 0x00F6, 0x00F2, 0x00F8)     # 倉庫まわりの通信(最初の数回だけ中身を記録する・確認用)。00F8 = 倉庫を閉じた(2バイト。取り出しの直後に届くのを実測で確認)
WANT_OPS |= set(STORAGE_OPS)
# 持ち物・倉庫の「装備ではない品」の一覧(RO Storage Manager の読み方と同じ): 0B08 一覧の始まり [op2][長さ2=5][種類1] → 0B09 品 [op2][長さ2][種類1] + 34バイト×n
#   (品: 番号2 アイテム4 種類1 個数2 …)→ 0B39 装備(68バイト×n)→ 0B0B 終わり。種類 0=持ち物・1=カート・2=倉庫・3=ギルド倉庫・4=W倉庫。
#   倉庫の名前(メイン・サブ…)は 0995/0996/0975/0976 の [op2][長さ2][名前24 cp932] で先に届く
LIST_START, LIST_ITEMS, LIST_END = 0x0B08, 0x0B09, 0x0B0B
TITLE_OPS = (0x0995, 0x0996, 0x0975, 0x0976)
WANT_OPS |= {LIST_START, LIST_ITEMS, LIST_END} | set(TITLE_OPS)
ITEM_SIZES = (34, 31, 27)       # 品1件の大きさ(長さが割り切れるものを使う)
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


PRUNE_DAYS = 45       # この日数 着ていない・使われていない・記号なしの履歴は自動で片づける

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
        self.shared_names = {}   # 共有の結びつけ(配布元が承認した 番号 → ラトリオの名前)を裏返した {正規化した名前: 番号}。参照するだけで保存しない
        self.sim_links = {}    # 計算機(ラトリオ)の名前 -> ゲームのアイテム番号。手で結びつけたもの(0 = わざと結びつけない)
        self._name_idx = None  # 名前 -> ゲームのアイテム番号(id2name の逆引き。使うときに作る)
        self.changed = False
        self._diag = {}        # 倉庫まわりの通信(確認用): op -> 受け取った回数
        self._snap = {}        # (持ち主, 倉庫の枠) -> 一覧を受け取り始める前の記録(取りこぼしたときに戻す)
        self._pending = {}     # 接続 -> 名前が決まる前に届いた分の記録(装備の一覧など)。名前が決まったら、そのキャラの記録に合流させる
        self._inv_chunk = {}   # 接続 -> (最後に持ち物の一覧が届いた時刻, その件数)。100件で区切られた続きかを見分ける
        self._recent_add = {}  # 接続 -> [(アイテム番号, 時刻)]。直前に持ち物へ戻った品(失敗した預け入れの見分け用)
        self._recent_any = {}  # 接続 -> [(アイテム番号, 時刻)]。装備でない品も含めて、直前に持ち物へ増えた品(倉庫に入れられなかった品の見分け用)
        self._lend = {}        # 接続 -> 倉庫の一覧を受け取り終えた時刻(その直後の 00F2 だけ、取りこぼしの採点で前の記録に戻してよい)
        self._open = {}        # 接続 -> 倉庫を開いているか(一覧が届いたら開いた・00F8 で閉じた)。閉じているときの出し入れは倉庫に足さない
        self._stor = {}        # 倉庫の装備の一覧(種類 -> 前回・今回の一覧)。増えた品から「倉庫に入れた」を見つける
        self.stores = {}       # 倉庫の中身(装備ではない品+装備): 持ち主(アカウント。分からなければキャラ名) -> {"種類|名前": {inv, title, items:[{itemId,count}], eq:[装備], t}}
        self._lst = {}         # 接続 -> いま受け取り中の一覧 {inv, title, items, eq, t, new}
        self._title = {}       # 接続 -> (倉庫の名前, 時刻)
        self._cnt = {}               # 接続 -> (倉庫に入っている数, 入れられる数, 届いた時刻)(00F2)
        self._lastslot = {}          # 接続 -> (持ち主, キー, 時刻): 最後に書いた倉庫の枠
        self._items_synced = set()   # 持ち物の一覧(0B09 種類0)を受け取った接続(個数の増減を反映してよい)
        self._synced = set()   # 装備一覧(0B39)を受け取った接続。持ち物の番号はログインのたびに変わるので、一覧を受け取っていない接続の「着た/外した」は使わない

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
                if ch is not None and name != UNKNOWN and ch.get("equips") is not None:      # 空(全部外した)でも、いまのセットを更新する
                    self._update_set(name, ch)
        except (struct.error, IndexError):
            pass
        self.changed = self.changed or was

    def known_zeny(self):
        """覚えているゼニーの値([(キャラ, 値)]。確認用: ログイン時にどの通信に入っているか探す)"""
        return []

    def snapshot(self):
        self.flush_pending()
        return {"chars": self.chars, "sets": self.sets, "shadows": self.shadows, "sim_links": self.sim_links, "stores": self.stores, "updated": int(time.time())}

    def restore(self, data):
        if data:
            self.chars = data.get("chars", {})
            self.sets = data.get("sets") or {}
            self.shadows = data.get("shadows") or {}
            self.sim_links = data.get("sim_links") or {}
            if "stores" in data:                       # 記録の取り込み(records_sync)は stores を持たない → 持っているものを消さない
                self.stores = data.get("stores") or {}
            self._tidy_stores()
            self._migrate_sets()
            self.repair_sets()
            self.resolve_sim_all()
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
            s = table[sid] = {"items": [self._snapshot(i) for i in sorted(items, key=slot_key)],
                              "name": "", "tag": "", "first": (src or {}).get("first") or now,
                              "last": 0, "worn": 0, "chars": {}}
            if src is None:
                self.log("[キャラ] {} の新しい{}(履歴に追加)".format(name, "装備の組み合わせ" if prefix == "m" else "シャドウの組み合わせ"))
        if src is not None:                                 # 前の版から引き継ぐ
            s["name"] = s.get("name") or src.get("name") or ""
            s["first"] = min(s.get("first") or now, src.get("first") or now)
            s["last"] = max(s.get("last") or 0, src.get("last") or 0)
            s["worn"] = s.get("worn", 0) + (src.get("worn") or 0)
            c = s["chars"].setdefault(name, {})
            if (src.get("last") or 0) >= (c.get("last") or 0):
                c.update({"last": src.get("last") or 0, "status": src.get("status")})
        return sid

    def _snapshot(self, i):
        """装備セットに入れる1件。**着ている装備(ch["equips"])そのものを入れると、あとで外した/付け替えたとき(_wear が wear=0 に書きかえる)にセットの中身も書きかわる** → 必ずコピーを入れる。"""
        if "slot" not in i:
            return self._item_view(i)
        x = copy.deepcopy(i)
        x.pop("inventoryIndex", None)
        return x

    def repair_sets(self):
        """上の書きかわりで「場所なし(wear=0)」になってしまった、保存ずみの装備セットの装備を直す。
        同じアイテムが別のところ(ほかのセット・着ている装備)で場所つきで見つかればそれを使う。見つからなくて、セットの中で空いている場所が1つ・場所なしの装備が1つなら、そこへ。"""
        known = {}
        def see(it):
            w = it.get("wear", 0) & MAIN_BITS
            if w and not w & (w - 1) and it.get("itemId") is not None:
                known.setdefault(it["itemId"], set()).add(w)
        for t in (self.sets, self.shadows):
            for st in t.values():
                for it in st.get("items") or []:
                    see(it)
        for ch in self.chars.values():
            for it in ch.get("equips") or []:
                see(it)
        fixed = 0
        for st in self.sets.values():
            items = st.get("items") or []
            for it in items:
                if it.pop("inventoryIndex", None) is not None:
                    self.changed = True
            zero = [it for it in items if not it.get("wear", 0) and it.get("itemId") is not None and "sim" not in st]
            for it in list(zero):
                ws = known.get(it.get("itemId")) or set()
                if len(ws) == 1:
                    w = next(iter(ws))
                    it["wear"], it["slot"] = w, LOC_NAMES.get(w, "")
                    zero.remove(it)
                    fixed += 1
            have = 0
            for it in items:
                have |= it.get("wear", 0)
            miss = [b for b, _ in MAIN_SLOTS if not have & b]
            if len(zero) == 1 and len(miss) == 1:
                zero[0]["wear"], zero[0]["slot"] = miss[0], LOC_NAMES.get(miss[0], "")
                fixed += 1
        if fixed:
            self.changed = True
            self.log("[キャラ] 装備セットの壊れていた装備の場所を {}個 直しました".format(fixed))
        return fixed

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
        return {"slot": "・".join(slots), "wear": bits, "loc": it.get("loc") or 0, "type": it.get("type"), "itemId": it.get("itemId"),
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
        return {"zeny": info.get("zeny", ch.get("zeny")), "lv": d.get("BaseLv") or info.get("lv"), "jobLv": d.get("JobLv") or info.get("jobLv"), "job": job, "jobName": job_name(job),
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

    def _auto_names(self, sets, bits=(2, 16, 32, 4)):
        """装備セットの自動の名前「+10ｾﾚｽ聖/+10ﾖﾙｽ毒/+4ﾃﾞｲｳﾞ地・聖念50/+7ｽﾃﾗ聖念50」
        (武器+武器の属性 / 鎧+鎧の属性 / 盾+盾の属性と、いちばん高い耐性の両方 / 肩+いちばん高い耐性)。同じになったら (2) など。
        シャドウセットは シャドウ武器 / シャドウ鎧 / シャドウ盾 で同じように作る(盾は同じく属性と耐性の両方)。"""
        used = {}
        for sid in sorted(sets, key=lambda k: sets[k].get("first", 0)):
            items = sets[sid].get("items") or []
            parts = []
            for bit in bits:
                i = next((i for i in items if i.get("wear", 0) & bit), None)
                if not i:
                    continue
                ae, de, res = self.item_attrs(i)
                if bit in (32, 262144):         # 盾: 属性(鎧の属性が変わるもの)と、いちばん高い耐性の両方。片方だけならその片方
                    tag = "・".join(x for x in (de if de and de != "無" else "", top_res(res)) if x)
                else:
                    tag = ae if bit in (2, 131072) else (de if de and de != "無" else top_res(res)) if bit in (16, 65536) else top_res(res)
                parts.append(short_item(i.get("name"), i.get("refine", 0)) + tag)
            base = "/".join(parts) or "装備セット"
            used[base] = used.get(base, 0) + 1
            sets[sid]["auto"] = base if used[base] == 1 else "{} ({})".format(base, used[base])

    def equip_view(self):
        """画面用: {"chars": キャラごとのいまの装備, "sets": 装備セット, "shadows": シャドウセット}"""
        self.flush_pending()
        self._auto_names(self.sets)
        self._auto_names(self.shadows, (131072, 65536, 262144))
        for table in (self.sets, self.shadows):          # 軽減のまとめ(計算機の被ダメの検証用。毎回いまの耐性の表で出す)
            for s in table.values():
                s["prof"] = self.items_profile(s.get("items"))
        chars = {}
        for name, ch in self.chars.items():
            if name == UNKNOWN or not (ch.get("equips") or "bag" in ch or ch.get("stats") or ch.get("skills")):      # 全部はずしているキャラ(装備が空)も、持ち物の一覧を受け取っていれば出す
                continue
            chars[name] = {"cur": ch.get("cur_set") or "", "shadow": ch.get("cur_shadow") or "",
                           "missing": ch.get("missing") or [], "has_equip": bool(ch.get("equips")), "inv": "bag" in ch, "stale": bool(ch.get("eq_stale")), "moved": ch.get("eq_moved") or None,
                           "now": [self._item_view(it) for it in self._worn(ch)], "carry": self.carry_view(ch), "status": self._status_view(name, ch),
                           "skills": ch.get("skills") or {}, "updated": ch.get("updated") or 0}
        return {"chars": chars, "sets": self.sets, "shadows": self.shadows, "unknown": self.unknown_items()}

    def set_item_name(self, iid, name):
        self._name_idx = None                       # 名前の表が変わる → 逆引きを作り直す
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

    def add_official_names(self, names):
        """公式サイトから集めた名前({番号: 名前})を、名前の表に足す(手で付けた名前・表にある名前は変えない)。足した件数を返す。"""
        n = 0
        for iid, nm in (names or {}).items():
            iid = str(iid)
            if nm and iid.isdigit() and iid not in self.id2name:
                self.id2name[iid] = nm
                n += 1
        if n:
            self._name_idx = None
            for table in (self.sets, self.shadows):                     # 覚えてある装備セットの中身の名前も直す
                for s in table.values():
                    for it in s.get("items") or []:
                        if str(it.get("itemId")) in names and not it.get("name"):
                            it["name"] = names[str(it.get("itemId"))]
                        for c in it.get("cards") or []:
                            if str(c.get("id")) in names and not c.get("name"):
                                c["name"] = names[str(c.get("id"))]
            self.changed = True
        return n

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

    def register_set(self, sid, take=""):
        """履歴の1つを装備セットとして登録する(記号を付ける)。take = 別のセットの ID なら、その記号・名前・色を引き継ぐ(上書き。元は履歴に戻る)。"""
        t = self._table(sid)
        s = t.get(sid)
        if s is None:
            return
        src = t.get(take) if take and take != sid else None
        if src is not None and src.get("tag"):
            s["tag"], s["name"] = src["tag"], src.get("name") or ""
            if src.get("color"):
                s["color"] = src["color"]
            else:
                s.pop("color", None)
            src["tag"], src["name"] = "", ""
            src.pop("color", None)
        elif not s.get("tag"):
            s["tag"] = next_tag(t, "s" if str(sid).startswith("s") else "m")
        self.changed = True

    def unregister_set(self, sid):
        """装備セットの登録を外す(記号を外すだけ。履歴には残る)。"""
        s = self._table(sid).get(sid)
        if s is not None:
            s["tag"] = ""
            self.changed = True

    # ---------- 計算機で作った装備に、ゲームのアイテム番号を割り振る ----------
    # 計算機(ラトリオ)の装備は名前しか持っていない。耐性のまとめ(gear_info)はゲームのアイテム番号で引くので、
    # 名前 → 番号を id2name(ラトリオの items_part から作った表 + 手直し)の逆引きで探す。見つからないものは手で結びつける(sim_links)。
    @staticmethod
    def _norm_name(name):
        s = unicodedata.normalize("NFKC", str(name or ""))
        s = re.sub(r"\s+", "", s)
        return re.sub(r"\[\d\]$", "", s)

    def _name_index(self):
        if self._name_idx is None:
            idx = {}
            for iid, nm in self.id2name.items():
                k = self._norm_name(nm)
                if not k or not str(iid).isdigit():
                    continue
                old = idx.get(k)
                # 同じ名前が複数あるときは、耐性のデータがあるもの → 番号の小さいもの
                if old is None or (str(iid) in self.gear_info and str(old) not in self.gear_info) \
                        or ((str(iid) in self.gear_info) == (str(old) in self.gear_info) and int(iid) < int(old)):
                    idx[k] = int(iid)
            self._name_idx = idx
        return self._name_idx

    def resolve_name(self, name, card=False):
        """計算機の名前 → ゲームのアイテム番号(わからなければ None)。"""
        name = str(name or "")
        if name in self.sim_links:
            return self.sim_links[name] or None
        idx, k = self._name_index(), self._norm_name(name)
        hit = idx.get(k) or idx.get(re.sub(r"^\[[^\]]*\]", "", k)) or idx.get("[シャドウ]" + k)   # ゲーム側だけ頭に [シャドウ] が付く名前がある
        if hit is None and card:
            hit = idx.get(k + "カード")
        if hit is None:
            hit = self.shared_names.get(k)         # 共有の結びつけ(自分の結びつけ・名前の表で見つからないときだけ)
        return hit

    def set_shared_links(self, links):
        """共有の結びつけ {番号: 名前} を、名前 → 番号 に裏返して覚える(同じ名前に複数の番号があるときは小さい番号)。変わったら装備セットを引き直す"""
        rev = {}
        for iid, nm in sorted((links or {}).items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 1 << 60):
            if str(iid).isdigit() and isinstance(nm, str) and nm:
                rev.setdefault(self._norm_name(re.sub(r"\s*[(（]\+\d+以上[)）]\s*$", "", nm)), int(iid))
        if rev != self.shared_names:
            old = self.shared_names
            self.shared_names = rev
            try:
                self.resolve_sim_all()
            except Exception:
                self.shared_names = old          # 途中で失敗したら、次の更新でやり直せるように元に戻す
                raise

    def _resolve_sim(self, s):
        n = 0
        for it in s.get("items") or []:
            for x, key, card in [(it, "itemId", False)] + [(c, "id", True) for c in it.get("cards") or []]:
                new = self.resolve_name(x.get("name"), card)
                if x.get(key) != new:
                    x[key] = new
                    self.changed = True
                n += new is None
        return n

    def resolve_sim_all(self):
        """計算機で作った装備セット全部を、いまの名前の表と結びつけで引き直す。"""
        for table in (self.sets, self.shadows):
            for s in table.values():
                if s.get("sim") is not None:
                    self._resolve_sim(s)

    def link_sim(self, name, iid):
        """計算機の名前を、ゲームのアイテム番号に手で結びつける(iid = 0 で「結びつけない」、None で結びつけを消す)。"""
        name = str(name or "")[:80]
        if not name:
            return
        if iid is None:
            self.sim_links.pop(name, None)
        else:
            self.sim_links[name] = int(iid)
        self.changed = True
        self.resolve_sim_all()

    def put_sim_set(self, shadow, items, data):
        """計算機で作った装備を履歴に入れて ID を返す。items = 画面に出す用(場所・名前・精錬・カードの名前)、data = 計算機が着せ直すための中身。
        ゲームのアイテム番号は無いので、中身(data)が同じなら同じ ID。"""
        t = self.shadows if shadow else self.sets
        sid = ("sx" if shadow else "mx") + hashlib.sha1(json.dumps(data, sort_keys=True).encode("utf-8")).hexdigest()[:10]
        now = int(time.time())
        if sid not in t:
            clean = []
            for it in (items or [])[:12]:
                clean.append({"slot": str(it.get("slot") or "")[:20], "wear": int(it.get("wear") or 0), "itemId": None,
                              "name": str(it.get("name") or "")[:80], "refine": int(it.get("refine") or 0), "grade": int(it.get("grade") or 0),
                              "cards": [{"id": None, "name": str(c.get("name") or "")[:80]} for c in (it.get("cards") or [])[:6]],
                              "options": [{"text": str(o.get("text") or "")[:60]} for o in (it.get("options") or [])[:6]]})
            t[sid] = {"items": clean, "name": "", "tag": "", "first": now, "last": now, "worn": 0, "chars": {}, "sim": data}
        self._resolve_sim(t[sid])
        self.changed = True
        return sid

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

    def prune_sets(self, in_use, now=None, days=PRUNE_DAYS):
        """履歴の自動片づけ: 記号・名前・色が無く、「days」日以上着ていなくて、どこからも使われていない装備セット・シャドウセットを消す。
        in_use = その ID を含む文字列(被ダメの記録・計算機のスロットなど、ほかが参照している中身)。計算機で作ったもの(mx…/sx…)といま着ているものは消さない。消した数を返す。"""
        now = int(now or time.time())
        cur = {ch.get(k) for ch in self.chars.values() for k in ("cur_set", "cur_shadow")}
        n = 0
        for table in (self.sets, self.shadows):
            for sid in list(table):
                s = table[sid]
                if sid.startswith(("mx", "sx")) or sid in cur or s.get("tag") or s.get("name") or s.get("color"):
                    continue
                if now - max(s.get("last") or 0, s.get("first") or 0) < days * 86400 or sid in in_use:
                    continue
                del table[sid]
                n += 1
        if n:
            self.changed = True
            self.log("[キャラ] 使われていない古い装備の履歴を {} 件片づけました({}日以上着ていない・記号なし)".format(n, days))
        return n

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
            key = getattr(self, "_key", None)
            rec = self._pending.pop(key, None)
            if rec is not None:                       # 名前が分かる前に、この接続で貯めた分(装備の一覧など)を、このキャラの記録に合流させる
                self._merge_pending(cur, rec)
            elif UNKNOWN in self.chars and cur not in self.chars:      # 前の版が残した「(キャラ不明)」の分
                self.chars[cur] = self.chars.pop(UNKNOWN)
                self.log("[キャラ] {} のデータとして確定".format(cur))
            return cur
        return UNKNOWN

    def _merge_pending(self, cur, rec):
        """名前待ちの記録 rec を、キャラ cur の記録に合流させる(既にいるキャラでも、新しい分で更新する)。"""
        ch = self.chars.get(cur)
        if ch is None:
            self.chars[cur] = rec
            self.log("[キャラ] {} のデータとして確定".format(cur))
        else:
            ch.setdefault("stats", {}).update(rec.get("stats") or {})
            ch.setdefault("derived", {}).update(rec.get("derived") or {})
            if rec.get("statusPoint") is not None:
                ch["statusPoint"] = rec["statusPoint"]
            if rec.get("skills"):
                ch["skills"] = rec["skills"]
            if "bag" in rec:                          # 持ち物の一覧を受け取っている → 装備の記録は、こちらが新しい
                for k in ("equips", "bag", "eq_stale", "eq_t"):
                    if k in rec:
                        ch[k] = rec[k]
                ch.pop("eq_moved", None)
                if rec.get("gone"):
                    ch["gone"] = ((ch.get("gone") or []) + rec["gone"])[-30:]
            if "items" in rec:
                ch["items"], ch["items_t"] = rec["items"], rec.get("items_t") or 0
            ch["updated"] = max(ch.get("updated") or 0, rec.get("updated") or 0)
            self.log("[キャラ] {} の記録に、名前が決まる前に届いた分({})を合流させました".format(cur, "装備の一覧あり" if "bag" in rec else "装備の一覧なし"))
        self.changed = True

    def _stale_key(self, key):
        """名前待ちの接続 key が、自分の名前を持たず(=「その側のいまのキャラ」に頼っていて)、同じ側に、名前を持つ新しい接続がある → 古い接続。"""
        conn = getattr(self.md, "conn", None)
        if not isinstance(conn, dict) or (conn.get(key) or {}).get("name"):
            return False
        side = self.md._side(key)
        later = False
        for k in conn:
            if later and self.md._side(k) == side and (conn[k] or {}).get("name"):      # 同じ側に、自分の名前を持つ新しい接続がある
                return True
            if k == key:
                later = True
        return False

    def flush_pending(self):
        """名前が決まった接続の名前待ちの記録を、キャラの記録に合流させる(画面や保存の前に呼ぶ。次の通信を待たなくてよい)。"""
        if not self._pending or self.md is None or not hasattr(self.md, "name_for"):
            return
        for key in list(self._pending):
            cur = self.md.name_for(key)
            if cur and self._stale_key(key):
                # 古い接続(キャラ選択画面など)の分。name_for は「その側のいまのキャラ」を返すので、そのまま合流させると、別キャラ/古い一覧(5件など)が新しい一覧(28件など)を上書きしてしまう
                self._pending.pop(key, None)
                self.log("[キャラ] 古い接続の名前待ちの記録を、{} には合流させず捨てました".format(cur))
                continue
            if cur:
                self._merge_pending(cur, self._pending.pop(key))
                ch = self.chars.get(cur)
                if ch is not None and ch.get("equips") is not None:
                    self._update_set(cur, ch)

    def _ch(self):
        name = self._name()
        if name == UNKNOWN:                           # 名前が決まる前: この接続の名前待ちの記録に貯める(別のキャラの分と混ぜない)
            key = getattr(self, "_key", None)
            if len(self._pending) > 20 and key not in self._pending:
                self._pending.pop(next(iter(self._pending)))
            return self._pending.setdefault(key, {"stats": {}, "derived": {}, "statusPoint": None, "equips": [], "updated": 0})
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

        elif (op == 0x00B1 and len(pkt) >= 8) or (op == 0x0ACB and len(pkt) >= 12):      # 数値が変わった(大きい値)。変数 20 = 所持ゼニー
            var, val = struct.unpack_from("<HI", pkt, 2) if op == 0x00B1 else struct.unpack_from("<Hq", pkt, 2)
            if var == 20 and val >= 0:
                ch = self._ch()
                if ch.get("zeny") != val:
                    ch["zeny"] = val
                    self.changed = True
                if self.md is not None and hasattr(self.md, "char_info") and self._name() != UNKNOWN:      # キャラ選択の一覧(md_core)と同じ置き場にも入れる(新しいほうを使う)
                    self.md.char_info.setdefault(self._name(), {})["zeny"] = val
                self._diagzeny = getattr(self, "_diagzeny", 0) + 1
                if self._diagzeny <= 5:
                    self.log("[キャラ] 所持ゼニー {:04X}: {}".format(op, val))

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

        elif op == 0x07FA and len(pkt) >= 8:             # 持ち物から消えた [理由2][番号2][個数2]。装備が消えたなら、倉庫などに入れた(持ったままではなくなった)
            reason, idx, amt = struct.unpack_from("<HHH", pkt, 2)
            now07 = time.time()
            last = getattr(self, "_last07", None)
            self._last07 = (idx, reason, now07)
            if last and last[:2] == (idx, reason) and now07 - last[2] < 0.8:      # 通常の読み取りと拾い直しの二重取り
                return
            self._diag07 = getattr(self, "_diag07", 0) + 1
            if self._diag07 <= 60:       # 確認用: 持ち物から消えた通信(薬なども含めて)の最初の60回。装備の一覧にある番号かも書く
                ch0 = self._ch()
                is_eq = any(x.get("inventoryIndex") == idx for x in (ch0.get("equips") or []) + (ch0.get("bag") or []))
                self.log("[倉庫] 持ち物から消えた(07FA) 理由={} 番号={} 個数={} {}{}".format(
                    reason, idx, amt, "装備の一覧にある" if is_eq else "装備の一覧に無い", "" if getattr(self, "_key", None) in self._synced else "・この接続は一覧を受け取っていない"))
            if reason == 4:
                self._store_deposit(idx, amt)
            self._item_sub(idx, amt)
            self._gone(idx, reason)

        elif op in STORAGE_OPS:                          # 倉庫まわりの通信(本物の形の確認用。最初の数回だけ中身を記録する)
            n = self._diag[op] = self._diag.get(op, 0) + 1
            if n <= 4:
                self.log("[倉庫] 通信 {:04X} {}バイト({}回目): {}".format(op, len(pkt), n, pkt[:48].hex()))
            if op == 0x00F2 and len(pkt) >= 6:           # 倉庫の件数: 開いたとき・出し入れのたびに届く。一覧の数と合うか確かめる(自己採点)
                key = getattr(self, "_key", None)
                self._cnt[key] = (struct.unpack_from("<H", pkt, 2)[0], struct.unpack_from("<H", pkt, 4)[0], time.time())
                le = self._lend.pop(key, None)
                self._verify_last(key, final=self._lst.get(key) is None, restore=bool(le and time.time() - le < 2.5))
            elif op == 0x00F8:                           # 倉庫を閉じた
                key = getattr(self, "_key", None)
                was = self._open.pop(key, False)
                self._nclose = getattr(self, "_nclose", 0) + 1
                if self._nclose <= 200:
                    ls = self._lastslot.get(key)
                    sl = self.stores.get(ls[0], {}).get(ls[1]) if ls else None
                    self.log("[倉庫] 倉庫を閉じた(00F8){}".format("「{}」".format((sl or {}).get("title") or "?") if was else "(開いた記録なし)"))
            elif op == 0x00F6 and len(pkt) >= 8:         # 倉庫から取り出した [倉庫の番号2][個数4]
                idx, amt = struct.unpack_from("<HI", pkt, 2)
                self._store_take(idx, amt)

        elif op == 0x0999 and len(pkt) >= 11:            # 装備した(結果 0 = 成功)
            idx, loc = struct.unpack_from("<HI", pkt, 2)
            self.log("[装備] {} 装備した 結果={} 持ち物の番号={} 場所={}".format(self._name(), pkt[10], idx, loc))
            if pkt[10] == 0:
                self._wear(idx, loc, True)

        elif op == 0x099A and len(pkt) >= 9:             # 外した(結果 0 = 成功)
            idx, loc = struct.unpack_from("<HI", pkt, 2)
            self.log("[装備] {} 外した 結果={} 持ち物の番号={} 場所={}".format(self._name(), pkt[8], idx, loc))
            if pkt[8] == 0:
                self._wear(idx, loc, False)

        elif op == 0x0B39:
            # 種類(pkt[4]): 0 = 自分の持ち物・1 = カート・2〜4 = 倉庫(RO Storage Manager の読み方と、Fox の実測で確認)。持ち物の一覧だけ使う
            kind = pkt[4]
            body = pkt[5:]
            if kind != 0:
                self._diag0b39 = getattr(self, "_diag0b39", 0) + 1
                if self._diag0b39 <= 6:
                    self.log("[装備] 持ち物以外の装備の一覧(0B39 種類={}・全{}件)".format(kind, len(body) // EQUIP_SIZE if len(body) >= EQUIP_SIZE else 0))
                if kind in (2, 3, 4) and len(body) % EQUIP_SIZE == 0:
                    self._list_equip(kind, [self._equip(body[i * EQUIP_SIZE:(i + 1) * EQUIP_SIZE]) for i in range(len(body) // EQUIP_SIZE)])
                    self._storage_list(kind, [self._equip(body[i * EQUIP_SIZE:(i + 1) * EQUIP_SIZE]) for i in range(len(body) // EQUIP_SIZE)])
                return
            if len(body) % EQUIP_SIZE:
                self.log("[装備] 装備の一覧(0B39)の長さが想定と違うので読めません: 全体={}バイト 本体={} 1件={}バイトで割った余り={} 先頭={}".format(
                    len(pkt), len(body), EQUIP_SIZE, len(body) % EQUIP_SIZE, pkt[:24].hex()))
                return
            items = [self._equip(body[i * EQUIP_SIZE:(i + 1) * EQUIP_SIZE]) for i in range(len(body) // EQUIP_SIZE)]
            ch = self._ch()
            key, now = getattr(self, "_key", None), time.time()
            prev = self._inv_chunk.get(key)
            more = bool(prev and prev[1] >= INV_PAGE and now - prev[0] < 3.0 and key in self._synced)      # 100件で区切って届く(倉庫の一覧がそうだった)。前が満杯なら続き
            self._inv_chunk[key] = (now, len(items))
            worn = [e for e in items if e["wear"]]
            bag = [e for e in items if not e["wear"]]
            if more:
                have = {x.get("inventoryIndex") for x in (ch.get("equips") or []) + (ch.get("bag") or [])}
                worn = (ch.get("equips") or []) + [e for e in worn if e.get("inventoryIndex") not in have]
                bag = (ch.get("bag") or []) + [e for e in bag if e.get("inventoryIndex") not in have]
            MAIN = 1023 | 65536 | 131072 | 262144 | 524288 | 1048576 | 2097152      # 衣装(1024〜8192)をのぞく、ふつうの装備・シャドウ装備の場所
            main = [e for e in worn if e["wear"] & MAIN]
            self.log("[装備] 持ち物の装備の一覧(0B39) 全{}件・着ている{}件(ふつうの装備・シャドウ {}・衣装 {})・着ていない{}件{}".format(
                len(items), len(worn), len(main), len(worn) - len(main), len(bag), "・続き" if more else ""))
            self._synced.add(key)                  # 着ているものが無くても(全部倉庫に入れてあっても)、これが持ち物の一覧
            ch["eq_stale"] = False
            ch["equips"] = worn
            ch["bag"] = bag
            ch["updated"] = int(time.time())
            self.changed = True
            if not more:
                self.log("[キャラ] {} の装備 {}点を記録".format(self._name(), len(worn)))
            ch.pop("eq_moved", None)
            ch["eq_t"] = int(time.time())
            if self._own_name() and self._own_name() == self._name():       # この接続が自分で名乗ったキャラのときだけ(2つ動かしているときの取り違えで、正しい持ち主を消さない)
                self._claim(self._name(), worn + bag)

        elif op in TITLE_OPS and len(pkt) >= 28:         # 倉庫の名前(メイン・サブ…)。直後に一覧が届く
            t = pkt[4:28].split(b"\0")[0].decode("cp932", "replace").strip()
            self._title[getattr(self, "_key", None)] = (t, time.time())
            lst = self._lst.get(getattr(self, "_key", None))
            if lst is not None and lst["inv"] >= 2 and time.time() - lst["t"] < 3.0:
                lst["title"] = t
                self._title.pop(getattr(self, "_key", None), None)

        elif op == LIST_START and len(pkt) >= 5:
            key, inv = getattr(self, "_key", None), pkt[4]
            tt = self._title.pop(key, None)                  # 名前は1回使ったら捨てる(次の倉庫に引き継がない)
            self._lstart_n = getattr(self, "_lstart_n", 0) + 1
            if self._lstart_n <= 8:
                self.log("[倉庫] 診断 0B08 の中身: {}".format(pkt[:16].hex()))
            nm = ""
            if inv >= 2 and len(pkt) > 5:                # 実機で確認: 倉庫の名前は 0B08 の後ろに付いてくる(cp932。例: メイン倉庫 / サブ倉庫1)
                nm = pkt[5:].split(b"\0")[0].decode("cp932", "replace").strip()
            if not nm and inv >= 2 and tt and time.time() - tt[1] < 3.0:
                nm = tt[0]
            self._lst[key] = {"inv": inv, "title": nm, "items": [], "eq": [], "t": time.time(), "new": True}
            if inv >= 2:
                self._nlst = getattr(self, "_nlst", 0) + 1
                if self._nlst <= 1000:
                    self.log("[倉庫] 一覧の始まり(0B08 種類={} 名前={!r})".format(inv, self._lst[key]["title"]))

        elif op == LIST_ITEMS and len(pkt) >= 5:         # 装備ではない品の一覧
            self._list_items(pkt)

        elif op == LIST_END:
            lst = self._lst.pop(getattr(self, "_key", None), None)
            if lst is not None:
                if lst["inv"] >= 2:
                    self._lend[getattr(self, "_key", None)] = time.time()
                self._list_commit(lst, final=True)

        elif op == 0x0B41 and len(pkt) >= 70:            # 持ち物への追加(拾った・買った・倉庫から取り出した)。装備なら持ち物の装備に足す
            k41, now41 = getattr(self, "_key", None), time.time()
            self._recent_any[k41] = [r for r in self._recent_any.get(k41, []) if now41 - r[1] < 2.0] + [(struct.unpack_from("<I", pkt, 6)[0], now41)]
            self._inv_add(pkt)
            self._item_add(pkt)

    # ---------- 装備ではない品(持ち物・倉庫の一覧) ----------
    def _list_items(self, pkt):
        key = getattr(self, "_key", None)
        inv = pkt[4]
        body = pkt[5:]
        size = next((z for z in ITEM_SIZES if body and len(body) % z == 0), 0)
        if not size:
            self.log("[倉庫] 品の一覧(0B09 種類={})の長さが読めません: 本体={}バイト".format(inv, len(body)))
            return
        items = []
        self._lit_n = getattr(self, "_lit_n", 0) + 1
        if self._lit_n <= 8:
            self.log("[倉庫] 診断 0B09 種類={} 全体{}バイト・1件{}バイト×{}件 先頭の2件: {}".format(
                inv, len(pkt), size, len(body) // size, " / ".join(body[i * size:i * size + 12].hex() for i in range(min(2, len(body) // size)))))
        for i in range(len(body) // size):
            e = body[i * size:(i + 1) * size]
            idx, itid = struct.unpack_from("<HI", e, 0)
            cnt = struct.unpack_from("<H", e, 7)[0]
            if itid:
                items.append({"index": idx, "itemId": itid, "count": cnt or 1, "type": e[6]})        # type = ゲームの種類(0 回復・2 使う・3 その他・4 防具・5 武器・6 カード・7 ペットの卵・8 ペットの装備・10 矢弾・11 遅延消費・18 キャッシュ)
        lst = self._lst.get(key)
        if lst is None or lst["inv"] != inv:             # 始まり(0B08)を見ていない一覧: ここから受け取る
            lst = self._lst[key] = {"inv": inv, "title": "", "items": [], "eq": [], "t": time.time(), "new": True}
        if time.time() - lst["t"] > 5.0 or (not lst["new"] and lst.get("last_n", 0) < INV_PAGE):
            # 前の一覧から間があいた・前の1本が満杯(100件)ではない = 続きではなく新しい一覧(始まり 0B08 を見ないまま別の倉庫が届くことがある)
            for kk in ("slot", "slot_title", "made"):
                lst.pop(kk, None)
            lst["eq"], lst["title"], lst["new"] = [], "", True
        known = sum(1 for x in items if str(x["itemId"]) in self.id2name)
        if self._lit_n <= 8 and items:
            self.log("[倉庫] 診断 品の番号が名前表にある割合: {}/{}(低いと読み位置が違う)".format(known, len(items)))
        if lst["new"]:
            lst["items"] = items                         # 始まりの直後の最初の1本は置きかえ
        else:                                            # 続きは足す(同じ番号は重ねない)
            have = {x["index"] for x in lst["items"]}
            lst["items"] = lst["items"] + [x for x in items if x["index"] not in have]
        lst["new"] = False
        lst["last_n"] = len(items)
        lst["t"] = time.time()
        self._list_commit(lst)

    def _list_equip(self, kind, eq):
        """倉庫の装備(0B39 種類2〜4)を、いま受け取り中の倉庫の一覧に足す。"""
        key = getattr(self, "_key", None)
        lst = self._lst.get(key)
        if lst is None or lst["inv"] != kind:
            lst = self._lst[key] = {"inv": kind, "title": "", "items": [], "eq": [], "t": time.time(), "new": True}
        have = {x.get("inventoryIndex") for x in lst["eq"]}
        lst["eq"] = lst["eq"] + [e for e in eq if e.get("inventoryIndex") not in have]
        lst["last_n"] = 0                                # 装備まで来たら、このあとの品の一覧(0B09)は新しい一覧
        lst["t"] = time.time()
        self._list_commit(lst)

    def _list_commit(self, lst, final=False):
        """受け取った一覧を記録に書く(届くたびに、そこまでの全部で置きかえる)。持ち物は ch["items"]、倉庫は stores。"""
        now = int(time.time())
        if lst["inv"] == 0:
            ch = self._ch()
            ch["items"] = [dict(x) for x in lst["items"]]
            ch["items_t"] = now
            self._items_synced.add(getattr(self, "_key", None))
            self.changed = True
        elif lst["inv"] in (2, 3, 4):
            name = self._name()
            if name == UNKNOWN:
                # キャラの名前がまだ決まっていない(ログイン時のクエスト一覧が届かなかった等)。アカウントが1つだけなら、倉庫は持ち主(アカウント)で分かるので捨てずに記録する
                aids = getattr(self.md, "account_aids", None) or set()
                if len(aids) != 1:
                    return
                owner, name = str(next(iter(aids))), ""
            else:
                acc = ((getattr(self.md, "char_info", None) or {}).get(name) or {}).get("account")
                owner = str(acc) if acc else name
            slots = self.stores.setdefault(owner, {})
            srv = self._srv() or (name.split("@", 1)[1] if "@" in name else "")       # 倉庫はワールド(サーバー)ごとに別。アカウントが同じでも混ぜない
            pre = srv + "#" if srv else ""
            same = {kk: v for kk, v in slots.items() if self._slot_srv(v) == srv}       # このワールドの枠だけ
            title = lst["title"] or ("W倉庫" if lst["inv"] == 4 else "")
            k = lst.get("slot")
            if title and lst.get("slot_title") != title:         # 名前が分かった(最初から・または後から)
                nk = "{}{}|{}".format(pre, lst["inv"], title)
                if k and k != nk and lst.get("made"):
                    slots.pop(k, None)                          # 先に仮の枠(名前なし)へ書いたぶんは捨てる
                k, lst["made"], lst["slot_title"] = nk, False, title
            elif k is None or lst.get("made"):                   # 名前が無い: 中身が同じ枠へ。無ければ新しい枠(仮の枠のあとから、品が増えて本物の倉庫と分かったら寄せる)
                m = self._match_slot(same, lst, skip=k)
                if m is not None and k is not None and k != m:
                    slots.pop(k, None)                          # 仮の枠は要らない
                    lst["made"] = False
                if m is not None:
                    k = m
                elif k is None:
                    n = 1
                    if lst["inv"] == 2 and not any(v.get("inv") == 2 and v.get("title") for v in same.values()):
                        pass                                    # このワールドに名前つきの普通の倉庫が1つも無い(例: ノアトゥーンの倉庫は名前が届かない)。名前なしは1つの倉庫として扱い、増やさない
                    else:
                        while "{}{}|?{}".format(pre, lst["inv"], n) in slots:
                            n += 1
                    k, lst["made"] = "{}{}|?{}".format(pre, lst["inv"], n), True
            lst["slot"] = k
            if not title:
                title = (slots.get(k) or {}).get("title") or ""
            if lst.get("snap_k") != k:                           # この一覧が、この枠に初めて書く: 前の記録を取っておく(取りこぼした一覧で、良かった記録を失わないため)
                lst["snap_k"] = k
                self._snap[(owner, k)] = json.loads(json.dumps(slots[k])) if k in slots else None
            slots[k] = {"inv": lst["inv"], "title": title, "items": [dict(x) for x in lst["items"]],
                        "eq": [dict(x) for x in lst["eq"]], "t": now, "by": name, "srv": srv}
            if title:                                            # 名前つきの枠ができたら、同じ中身の「名前なし」の仮の枠は片づける(倉庫が増えて見える元)
                for kk in [kk for kk, v in slots.items() if kk != k and v.get("inv") == lst["inv"] and not v.get("title") and self._slot_srv(v) == srv and self._same_store(v, slots[k])]:
                    slots.pop(kk, None)
            named2 = [kk for kk, v in slots.items() if v.get("inv") == 2 and v.get("title") and self._slot_srv(v) == srv]
            if len(named2) >= 4:                                 # 普通の倉庫(メイン+サブ3つ)が名前つきで全部そろったら、名前なしの仮の枠は要らない(倉庫が増えて見える元)
                for kk in [kk for kk, v in slots.items() if v.get("inv") == 2 and not v.get("title") and kk != k and self._slot_srv(v) == srv]:
                    slots.pop(kk, None)
            self.changed = True
            self._lastslot[getattr(self, "_key", None)] = (owner, k, time.time())
            self._open[getattr(self, "_key", None)] = True
            self._verify_last(getattr(self, "_key", None), final=final)
            self._ncommit = getattr(self, "_ncommit", 0) + 1
            if self._ncommit <= 1000:
                self.log("[倉庫] {} の倉庫「{}」(種類{})を記録: 品{}・装備{}".format(owner, title, lst["inv"], len(lst["items"]), len(lst["eq"])))
            if lst["eq"]:
                self._claim(None, lst["eq"], before=now, srv=srv, who="倉庫「{}」".format(title or "名前不明"))

    def _srv(self):
        """いまの接続のワールド(サーバー)。わからなければ空。"""
        q = getattr(self.md, "qual", None)
        try:
            r = q(getattr(self, "_key", None), "x") if q else ""
        except Exception:
            r = ""
        return r.split("@", 1)[1] if "@" in (r or "") else ""

    @staticmethod
    def _slot_srv(v):
        """倉庫の記録のワールド。古い記録(srv なし)は、開いたキャラ(by)の「名前@サーバー」から。"""
        if v.get("srv") is not None:
            return v["srv"]
        by = v.get("by") or ""
        return by.split("@", 1)[1] if "@" in by else ""

    # 倉庫の中身の照合は「品の番号の集まり」で行う。index(持ち物の位置)は倉庫を開くたびに振り直される
    # (同じメイン倉庫が 2 番から・769 番から…と届く)ので、位置を含めると同じ倉庫でも一致が 0% になり、倉庫が増えて見えた。
    SAME_STORE = 0.8

    @staticmethod
    def _ids(items, eq):
        return {x.get("itemId") for x in items or [] if x.get("itemId")} | {x.get("itemId") for x in eq or [] if x.get("itemId")}

    @staticmethod
    def _sim(a, b):
        """品の番号の集まり a・b の重なり(小さい方に対する割合)。どちらかが4種類より少ないときは 0(決めつけない)。"""
        if len(a) < 4 or len(b) < 4:
            return 0.0
        return len(a & b) / float(min(len(a), len(b)))

    @staticmethod
    def _same_store(a, b):
        """2つの倉庫の記録が、同じ倉庫の中身とみなせるか。"""
        return CharCore._sim(CharCore._ids(a.get("items"), a.get("eq")), CharCore._ids(b.get("items"), b.get("eq"))) >= CharCore.SAME_STORE

    @staticmethod
    def _match_slot(slots, lst, skip=None):
        """名前なしの一覧が、すでに覚えている倉庫のどれと同じか。見つからなければ None(skip=調べない枠のキー)"""
        a = CharCore._ids(lst["items"], lst["eq"])
        best, bk = CharCore.SAME_STORE, None
        for k, s in slots.items():
            if k == skip or s.get("inv") != lst["inv"]:
                continue
            r = CharCore._sim(a, CharCore._ids(s.get("items"), s.get("eq")))
            if r >= best:
                best, bk = r, k
        return bk

    def _tidy_stores(self):
        """起動時に倉庫の記録を片づける: ①ワールドの印(srv#)が付く前の古いキーを新しいキーに寄せる(同じなら新しい方を残す)
        ②名前なしの仮の枠のうち、名前つきの枠と同じ中身のものを捨てる。"""
        for owner, slots in self.stores.items():
            for k in [k for k in slots if "#" not in k]:
                v = slots[k]
                srv = self._slot_srv(v)
                if not srv:
                    continue
                nk = srv + "#" + k
                old = slots.pop(k)
                old["srv"] = srv
                cur = slots.get(nk)
                if cur is None or (old.get("t") or 0) > (cur.get("t") or 0):
                    slots[nk] = old
                self.changed = True
            for srv in {self._slot_srv(v) for v in slots.values()}:       # 名前つきの普通の倉庫が無いワールドの名前なし断片は、1つの倉庫にまとめる(品は最も多いもの・装備は最も多いもの)
                if any(v.get("inv") == 2 and v.get("title") for v in slots.values() if self._slot_srv(v) == srv):
                    continue
                fr = [(k, v) for k, v in slots.items() if v.get("inv") == 2 and not v.get("title") and self._slot_srv(v) == srv]
                if len(fr) < 2:
                    continue
                best_i = max((v for _, v in fr), key=lambda v: len(v.get("items") or []))
                best_e = max((v for _, v in fr), key=lambda v: len(v.get("eq") or []))
                merged = dict(max((v for _, v in fr), key=lambda v: v.get("t") or 0))
                merged["items"], merged["eq"] = best_i.get("items") or [], best_e.get("eq") or []
                merged.pop("chk", None)
                for k, _ in fr:
                    slots.pop(k)
                slots[(srv + "#" if srv else "") + "2|?1"] = merged
                self.changed = True
            for k in [k for k, v in slots.items() if v.get("inv") in (2, 3) and not v.get("title")]:
                v = slots[k]
                if any(kk != k and w.get("title") and w.get("inv") == v.get("inv") and self._slot_srv(w) == self._slot_srv(v) and self._same_store(v, w) for kk, w in slots.items()):
                    slots.pop(k)
                    self.changed = True

    def _verify_last(self, key, final=False, restore=None):
        """自己採点: 倉庫を開いたとき届く「入っている数」(00F2)と、読めた一覧(品+装備)の数を比べる。
        00F2 は普通の倉庫(種類2)だけ。一覧と数がちがえば、画面に「取りこぼしの可能性」と出す。"""
        c, ls = self._cnt.get(key), self._lastslot.get(key)
        if not c or not ls or abs(c[2] - ls[2]) > 2.5:
            return
        sl = self.stores.get(ls[0], {}).get(ls[1])
        if not sl or sl.get("inv") != 2:
            return
        got = len(sl["items"]) + len(sl["eq"])
        if not (0 <= c[0] <= max(c[1], 600)):          # 倉庫の個数ではない通信(別の値)を拾った: 採点しない
            return
        chk = {"want": c[0], "max": c[1], "got": got, "ok": got == c[0], "fin": bool(final)}
        if restore is None:                              # 一覧を書き終えたところから呼ばれた = 開いた直後
            restore = final
        if restore and final and not chk["ok"] and got < c[0]:        # 出し入れのあとの件数(00F2)では戻さない(正しく読めた一覧を、古い記録に戻してしまっていた)
            snap = self._snap.get((ls[0], ls[1]))
            if snap and len(snap.get("items") or []) + len(snap.get("eq") or []) > got:
                self.stores[ls[0]][ls[1]] = sl = snap          # 取りこぼしの一覧で、前の(多く読めていた)記録を消さない
                self.log("[倉庫] 「{}」は今回 {} 件しか読めなかった(ゲームは {} 件)ので、前の記録({}件)を残しました".format(
                    sl.get("title") or ls[1], got, c[0], len(snap.get("items") or []) + len(snap.get("eq") or [])))
                self.changed = True
                return
        if sl.get("chk") != chk:
            sl["chk"] = chk
            self.changed = True
            if final:
                self._nchk = getattr(self, "_nchk", 0) + 1
                if self._nchk <= 1000:
                    self.log("[倉庫] 自己採点「{}」: ゲームの数 {} / 読めた数 {}(品{}・装備{}) → {}".format(
                        sl.get("title"), c[0], got, len(sl["items"]), len(sl["eq"]), "一致" if chk["ok"] else "ちがう(取りこぼしの可能性)"))

    def _open_store(self):
        """この接続で最後に開いた倉庫の記録(無ければ None)。"""
        key = getattr(self, "_key", None)
        ls = self._lastslot.get(key)
        if not ls or not self._open.get(key):            # 閉じたあと(00F8)は足さない
            return None
        return self.stores.get(ls[0], {}).get(ls[1])

    def _store_deposit(self, idx, amt):
        """07FA 理由4(倉庫へ): 持ち物の番号 idx の品を、開いている倉庫に足す(持ち物から減らす前に呼ぶ)。倉庫の番号は分からないので None。"""
        key = getattr(self, "_key", None)
        sl = self._open_store()
        if sl is None or (key not in self._items_synced and key not in self._synced):
            return
        ch = self._ch()
        it = next((x for x in ch.get("items") or [] if x.get("index") == idx), None)
        eq = None if it else next((x for x in (ch.get("equips") or []) + (ch.get("bag") or []) if x.get("inventoryIndex") == idx), None)
        src = it or eq
        if src is None:
            return
        itid, now = src.get("itemId"), time.time()
        if any(r[0] == itid and now - r[1] < 1.0 for r in self._recent_any.get(key, [])):
            return                                       # 倉庫に入れられなかった(先に持ち物へ戻っている)
        if it:
            have = next((x for x in sl["items"] if x.get("itemId") == itid), None)
            if have:
                have["count"] = have.get("count", 0) + (amt or 1)
            else:
                sl["items"].append({"index": None, "itemId": itid, "count": amt or 1, "type": it.get("type")})
        else:
            e = json.loads(json.dumps(eq))
            e["inventoryIndex"], e["slot"], e["wear"] = None, "", 0
            sl["eq"].append(e)
        sl["live"] = int(now)
        self.changed = True
        self.log("[倉庫] 倉庫に入れた: {} ×{}(「{}」)".format(self._item_name(itid), amt or 1, sl.get("title") or "?"))

    def _store_take(self, idx, amt):
        """00F6(倉庫から取り出した): 開いている倉庫の、倉庫の番号 idx の品を減らす。"""
        sl = self._open_store()
        if sl is None:
            return
        for x in sl["items"]:
            if x.get("index") == idx:
                x["count"] = x.get("count", 0) - (amt or 1)
                if x["count"] <= 0:
                    sl["items"].remove(x)
                name = self._item_name(x.get("itemId"))
                break
        else:
            e = next((x for x in sl["eq"] if x.get("inventoryIndex") == idx), None)
            if e is None:
                self.log("[倉庫] 取り出した品(倉庫の番号 {})が、記録した一覧にありません".format(idx))
                return
            sl["eq"].remove(e)
            name = self._item_name(e.get("itemId"))
        sl["live"] = int(time.time())
        self.changed = True
        self.log("[倉庫] 倉庫から出した: {} ×{}(「{}」)".format(name, amt or 1, sl.get("title") or "?"))

    def _item_add(self, pkt):
        """0B41(持ち物に増えた)のうち、装備ではない品: 同じ番号の品があれば個数を足す、なければ足す。"""
        key = getattr(self, "_key", None)
        if key not in self._items_synced:
            return
        idx, cnt, itid = struct.unpack_from("<HHI", pkt, 2)
        if not itid or struct.unpack_from("<I", pkt, 28)[0]:
            return                                       # 装備は別(bag)で数える
        ch = self._ch()
        its = ch.setdefault("items", [])
        for x in its:
            if x.get("index") == idx and x.get("itemId") == itid:
                x["count"] = x.get("count", 0) + cnt
                break
        else:
            its[:] = [x for x in its if x.get("index") != idx]
            its.append({"index": idx, "itemId": itid, "count": cnt, "type": pkt[10]})
        ch["items_t"] = int(time.time())
        self.changed = True

    def _item_sub(self, idx, amt):
        """07FA(持ち物から消えた): 装備ではない品の個数を減らす(0 になったら消す)。"""
        if getattr(self, "_key", None) not in self._items_synced:
            return
        ch = self._ch()
        for x in ch.get("items") or []:
            if x.get("index") == idx:
                x["count"] = x.get("count", 0) - (amt or 1)
                if x["count"] <= 0:
                    ch["items"].remove(x)
                ch["items_t"] = int(time.time())
                self.changed = True
                return

    def inv_view(self):
        """画面用(インベントリ): {"chars": {キャラ: {items, eq, t}}, "stores": 持ち主 -> {キー: {…}}, "names": {番号: 名前}}。装備は着ている物+持ち物の装備"""
        self.flush_pending()
        chars = {}
        for name, ch in self.chars.items():
            if name == UNKNOWN or ("items" not in ch and "bag" not in ch):
                continue
            eq = [self._item_view(it) for it in self._worn(ch)] + [self._item_view(it) for it in (ch.get("bag") or [])]
            chars[name] = {"items": ch.get("items") or [], "eq": eq, "t": ch.get("items_t") or 0, "has": "items" in ch}
        ids = {str(x["itemId"]) for c in chars.values() for x in c["items"]}
        for st in self.stores.values():
            for sl in st.values():
                ids |= {str(x["itemId"]) for x in sl["items"]}
        return {"chars": chars, "stores": self.stores, "names": {i: self.id2name[i] for i in ids if i in self.id2name}}

    @staticmethod
    def _ident(e):
        """装備の見分け用(番号・精錬・★・カード・ランダムOP)。倉庫の一覧と持ち物の一覧は同じ形式で届く。"""
        return (e.get("itemId"), e.get("refine"), e.get("grade"), tuple(c.get("id") for c in e.get("cards") or []),
                tuple((o.get("index"), o.get("value")) for o in e.get("options") or []))

    def claim_all(self):
        """起動時に1回: 装備の一覧を受け取った時刻(eq_t)が新しいキャラ・倉庫にある装備が、それより古いキャラの記録にも残っていたら、古いほうから外す。
        eq_t の無い記録(前の版のもの)は、いつの装備か分からないので触らない。"""
        order = sorted(((ch.get("eq_t") or 0, n) for n, ch in self.chars.items() if isinstance(ch, dict) and ch.get("eq_t") and not ch.get("eq_stale")), reverse=True)
        for t, n in order:
            ch = self.chars.get(n) or {}
            if ch.get("eq_stale"):                      # もっと新しいキャラ・倉庫に装備を取られて、古い記録になった
                continue
            self._claim(n, (ch.get("equips") or []) + (ch.get("bag") or []), before=t)
        for owner, slots in (self.stores or {}).items():          # 倉庫に入っている装備も、それより古いキャラの記録には無い
            for v in list((slots or {}).values()):
                if v.get("eq") and v.get("t"):
                    self._claim(None, v["eq"], before=v["t"], srv=self._slot_srv(v), who="倉庫「{}」".format(v.get("title") or "名前不明"))

    def _own_name(self):
        """いまの接続が自分で名乗った名前(同じ PC で2つ動かしているとき「その側のいまのキャラ」は当てにならない)。"""
        conn = getattr(self.md, "conn", None)
        c = conn.get(getattr(self, "_key", None)) if isinstance(conn, dict) else None
        return (c or {}).get("name") or None

    def _live_names(self):
        """いま装備の一覧を受け取って遊んでいる接続のキャラ(自分の通信で記録が保たれているので、ほかから消さない)。"""
        conn = getattr(self.md, "conn", None)
        if not isinstance(conn, dict):
            return set()
        return {(conn.get(k) or {}).get("name") for k in self._synced} - {None}

    def _claim(self, name, items, before=None, srv=None, who=None):
        """name(または倉庫)にある装備と同じ品が、ほかのキャラの古い記録に残っていたら、そちらから外す。
        装備一式を倉庫経由で何人かのキャラで使い回すと、前に着ていたキャラの記録に残り、同じ装備が2人に「分裂」して見えるため。
        見分けは番号・精錬・★・カード・ランダムOP。同じ中身の品がいくつもありうるもの(ランダムOPが無く、精錬とカードのどちらかが無い・
        持ち主の中に同じ中身が2つ以上ある)は対象にしない。いま遊んでいるキャラ・装備の一覧の時刻が新しいキャラからは外さない。"""
        if name == UNKNOWN or not (name or who):
            return
        if srv is None:
            srv = name.rpartition("@")[2]
        who = who or name
        cnt = {}
        for e in items or []:
            k = self._ident(e)
            cnt[k] = cnt.get(k, 0) + 1
        want = {k: 1 for k, v in cnt.items() if v == 1 and k[0] and (k[4] or (k[1] and any(k[3])))}
        if not want:
            return
        live = self._live_names()
        for other, ch in self.chars.items():
            if other == name or other in live or other.rpartition("@")[2] != srv or not isinstance(ch, dict):
                continue
            if before is not None and (not ch.get("eq_t") or ch["eq_t"] >= before):      # 起動時: いつの装備か分からない記録・自分より新しい記録には手を出さない
                continue
            moved, w = 0, dict(want)                    # 同じ品はほかのどのキャラにも無いはず → キャラごとに数え直す
            for fld in ("equips", "bag"):
                keep, hit = [], 0
                for e in ch.get(fld) or []:
                    k = self._ident(e)
                    if w.get(k, 0) > 0:
                        w[k] -= 1
                        hit += 1
                    else:
                        keep.append(e)
                if hit:
                    ch[fld] = keep
                    moved += hit
            if moved:
                ch["eq_stale"] = True
                bits = 0
                for it in self._worn(ch):
                    bits |= it.get("wear", 0)
                ch["missing"] = [n for b, n in MAIN_SLOTS + SHADOW_SLOTS if not bits & b]
                for req, key in ((MAIN_BITS, "cur_set"), (SHADOW_BITS, "cur_shadow")):      # 欠けたセットは、もう着ていない(装備セットの画面で2人に出ないように)
                    if bits & req != req:
                        ch[key] = ""
                mv = ch.get("eq_moved") if isinstance(ch.get("eq_moved"), dict) else {"to": [], "n": 0}
                to = mv.get("to") if isinstance(mv.get("to"), list) else [mv["to"]] if mv.get("to") else []
                ch["eq_moved"] = {"to": to + ([who] if who not in to else []), "t": int(time.time()), "n": (mv.get("n") or 0) + moved}
                self.changed = True
                self.log("[装備] {} にある装備 {}点が {} の古い記録にも残っていたので、{} の記録から外しました(倉庫経由で受け渡したもの)".format(who, moved, other, other))

    def _storage_list(self, kind, items):
        """倉庫の装備の一覧(0B39 種類2〜4)。前に届いた一覧より増えた品が、いま持っている(着ていない)装備と同じなら、倉庫に入れたとみなす。
        控えめに判定する: 増えたのが1〜3種類・各々持ち物に同じ品がある場合だけ。アカウントの切り替えなどで大きく違うときは、一覧を覚え直すだけ。"""
        key, now = getattr(self, "_key", None), time.time()
        st = self._stor.setdefault(kind, {"prev": None, "cur": None, "t": 0.0, "n": 0, "applied": {}})
        if st.get("key") != key:                       # 別の接続(別のキャラ・ログインし直し)の一覧は、前回とくらべない
            st.update({"key": key, "prev": None, "cur": None, "applied": {}})
        if st["cur"] is not None and st["n"] >= INV_PAGE and now - st["t"] < 3.0:       # 100件で区切って届く(続き)
            st["cur"] = st["cur"] + items
        else:
            st["prev"], st["cur"], st["applied"] = st["cur"], list(items), {}
        st["t"], st["n"] = now, len(items)
        prev = st["prev"]
        if prev is None or key not in self._synced:
            return
        from collections import Counter
        a, b = Counter(self._ident(e) for e in prev), Counter(self._ident(e) for e in st["cur"])
        add = {k: v - a.get(k, 0) - st["applied"].get(k, 0) for k, v in b.items() if v - a.get(k, 0) - st["applied"].get(k, 0) > 0}
        if not add:
            return
        if len(add) > 3 or sum(add.values()) > 3:
            self.log("[倉庫] 倉庫の一覧(種類{})が前回と大きく違うので、判定には使いません(増えた種類 {})".format(kind, len(add)))
            return
        ch = self._ch()
        bag = ch.get("bag") or []
        for k, n in add.items():
            for _ in range(n):
                it = next((x for x in bag if self._ident(x) == k), None)
                if it is None:
                    continue
                st["applied"][k] = st["applied"].get(k, 0) + 1
                self._gone(it.get("inventoryIndex"), 4, via="倉庫の一覧の差分")

    def _inv_add(self, pkt):
        """0x0B41(70バイト・持ち物への追加)。+2 持ち物の番号 u16・+4 個数 u16・+6 アイテム番号 u32・+12/16/20/24 カード ×4(u32)・
        +28 装備部位 u32(0 = 装備でない)・+40 ランダムオプション 5枠×5バイト・+68 精錬 u8・+69 超越 u8。装備なら、持ち物の装備(bag)に足す。"""
        key = getattr(self, "_key", None)
        idx, _cnt, itid = struct.unpack_from("<HHI", pkt, 2)
        loc = struct.unpack_from("<I", pkt, 28)[0]
        if not (itid and 0 < loc <= 0x200000):                 # 装備ではない(薬・素材など)
            return
        now = time.time()
        recent = [r for r in self._recent_add.get(key, []) if now - r[1] < 2.0]
        recent.append((itid, now))
        self._recent_add[key] = recent
        if key not in self._synced:                            # 一覧を受け取っていない接続は、持ち物の番号が当てにならない
            return
        cards = [{"id": c, "name": self._item_name(c)} for c in struct.unpack_from("<4I", pkt, 12) if c]
        opts = []
        for k in range(5):
            oi, ov = struct.unpack_from("<HH", pkt, 40 + k * 5)
            if oi or ov:
                opts.append({"index": oi, "value": ov, "param": pkt[40 + k * 5 + 4]})
        item = {"slot": "", "wear": 0, "loc": loc, "type": pkt[10], "itemId": itid, "name": self._item_name(itid), "refine": pkt[68], "grade": pkt[69],
                "cards": cards, "options": opts, "inventoryIndex": idx}
        ch = self._ch()
        eq, bag = ch.get("equips") or [], ch.setdefault("bag", [])
        bag[:] = [x for x in bag if x.get("inventoryIndex") != idx]       # 同じ番号は使い回される(前の品は消えている)
        eq[:] = [x for x in eq if x.get("inventoryIndex") != idx]
        bag.append(item)
        ch["updated"] = int(now)
        self.changed = True
        self._diagadd = getattr(self, "_diagadd", 0) + 1
        if self._diagadd <= 100:
            self.log("[倉庫] 持ち物に装備が増えました(0B41): {} +{} 番号={} 部位={}".format(item["name"], item["refine"], idx, loc))

    def _gone(self, idx, reason, via=""):
        """持ち物から消えた(0x07FA)。装備(0B39 の一覧にあるもの)が消えたなら「持ったまま」から外し、記録に残す(倉庫に入れた・売った・使った など。reason は通信の値のまま)。"""
        if getattr(self, "_key", None) not in self._synced:       # 一覧を受け取っていない接続は、持ち物の番号が当てにならない
            return
        ch = self._ch()
        eq, bag = ch.get("equips") or [], ch.get("bag") or []
        item = next((x for x in eq + bag if x.get("inventoryIndex") == idx), None)
        if item is None:                                          # 装備ではない(薬・素材など)
            return
        key = getattr(self, "_key", None)
        if reason == 4 and any(r[0] == item.get("itemId") and time.time() - r[1] < 1.0 for r in self._recent_add.get(key, [])):
            self.log("[装備] 倉庫に入れられなかった(直前に持ち物へ戻っている): {}".format(self._item_name(item.get("itemId"))))      # 倉庫に入れられない品は、先に持ち物へ戻り、そのあと「倉庫へ」が届く
            return
        for lst in (eq, bag):
            if item in lst:
                lst.remove(item)
        now = int(time.time())
        ev = ch.setdefault("gone", [])
        ev.append({"t": now, "itemId": item.get("itemId"), "name": self._item_name(item.get("itemId")), "refine": item.get("refine", 0), "reason": reason})
        del ev[:-30]
        ch["updated"] = now
        if not ch.get("eq_stale"):
            ch["eq_t"] = now
        self.changed = True
        self.log("[装備] {} が持ち物から外れました: {} +{} (理由={}{}・持ったままの装備 残り {}点)".format(
            self._name(), self._item_name(item.get("itemId")), item.get("refine", 0), reason, "・" + via if via else "", len(self._worn(ch)) + len(bag)))

    def carry_view(self, ch):
        """倉庫に入れていない(持ったままの)装備。着ている装備(衣装は除く)+ 着ていない持ち物の装備。"""
        worn = self._worn(ch)
        bag = [x for x in (ch.get("bag") or []) if x.get("loc") is None or (x.get("loc", 0) & ~COSTUME_BITS)]        # 衣装(見た目だけの装備)は数えない
        items = [self._item_view(it) for it in worn] + [dict(self._item_view(it), slot="持ち物（着ていない）") for it in bag]
        return {"known": "bag" in ch, "stale": bool(ch.get("eq_stale")), "moved": ch.get("eq_moved") or None, "n": len(items), "worn": len(worn), "bag": len(bag), "items": items,
                "set": ch.get("cur_set") or "", "shadow": ch.get("cur_shadow") or "",
                "gone": (ch.get("gone") or [])[-5:]}

    def _wear(self, idx, loc, on):
        """装備した/外した。0x0B39 の一覧(equips と bag)の中で入れかえる。"""
        ch = self._ch()
        if getattr(self, "_key", None) not in self._synced:
            if not ch.get("eq_stale"):
                self.log("[装備] この接続では装備の一覧(ログイン時に届く)を受け取っていないので、持ち物の番号が合わず、装備の変更を反映できません。ログインし直すと取り直します")
            ch["eq_stale"] = True
            self.changed = True
            return
        eq, bag = ch.setdefault("equips", []), ch.setdefault("bag", [])
        item = next((x for x in eq + bag if x.get("inventoryIndex") == idx), None)
        if item is None:
            self.log("[装備] 持ち物の一覧に番号 {} が無いので、装備の変更を反映できません(一覧 {} 件)".format(idx, len(eq) + len(bag)))
            ch["eq_stale"] = True                       # 記録とずれている(取り出した装備の通信を取りこぼした など)。次にログインして一覧を受け取るまで、古い記録として扱う
            self.changed = True
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
            if self._own_name() and self._own_name() == self._name():
                self._claim(self._name(), [item])
        else:
            item["wear"], item["slot"] = 0, ""
            bag.append(item)
        ch["updated"] = int(time.time())
        ch["eq_t"] = ch["updated"]
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
            "loc": loc,
            "type": e[6],
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
