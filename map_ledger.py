# -*- coding: utf-8 -*-
"""map_ledger.py — マップの「ID(ファイル名)↔ 日本語の名前」の台帳。

これまで、マップ ID は別々の場所に散らばっていた:
  ・lantern_core: MEASURED(ゲームに入って確かめたもの)・REFERENCE_IDS(他の人のまとめと突き合わせたもの)・INDOOR_TOWN・TOWNS
  ・公式サイトのマップ一覧(公式モンスター.json の maplist)
  ・クライアントのマップ名表で確かめた MD のマップ(_CLIENT_MD)
  ・MD の履歴(通信で見た「MD名@マップ ID」)
ここで1つにまとめて、どこからでも「IDから名前」「名前からID」を引けるようにする(場所の名前の整理・ランタン・ログの表示 など)。
同じ ID に名前が複数あるときは、実測・参考・クライアント表(人が確かめたもの) > 通信で学んだもの(MD の履歴) > 公式のマップ一覧 > 町の決まり の順で採用する。
学んだもの・公式のものは、`learn()` で渡す(この PC のデータなので、起動中に入れかわる。配るデータではない)。
"""
import lantern_core as L


# 亜空の迷宮(lg)・幻影の迷宮(le)のマップ名。クライアントのマップ名表で確かめ、
# 亜空分は公式ナビデータ(navi_map_jp.lub)とも一致を確認した(2026-11-18)。
# 幻影分はナビ側に名称が無く、クライアント表のみが出典。
# 接頭辞つき(1@・3@ など)の別名は入れない(name_of が「@」の後ろで引くため、これで足りる)。
_CLIENT_MD = {
    "lg100": "亜空の迷宮 大樹の幹", "lg101": "亜空の迷宮 新緑の大樹",
    "lg102": "亜空の迷宮 赤の森", "lg103": "亜空の迷宮 灰の森",
    "lg104": "亜空の迷宮 溶岩の湖", "lg105": "亜空の迷宮 溶岩の湖",
    "lg106": "亜空の迷宮 地下洞窟", "lg107": "亜空の迷宮 隠匿された通路",
    "lg108": "亜空の迷宮 荒廃した実験場", "lg109": "亜空の迷宮 転移魔法陣",
    "lg110": "亜空の迷宮 太古の神殿", "lg111": "亜空の迷宮 鮮緑の神殿",
    "lg112": "亜空の迷宮 神殿の聖域", "lg113": "亜空の迷宮 淫靡な大聖堂",
    "lg114": "亜空の迷宮 魔女の菜園", "lg115": "亜空の迷宮 瘴気の谷底",
    "lg116": "亜空の迷宮 煌めきの氷河", "lg117": "亜空の迷宮 煌めきの氷河",
    "lg118": "亜空の迷宮 小さな聖域", "lg119": "亜空の迷宮 不吉な幽霊船",
    "lg120": "亜空の迷宮 不吉な幽霊船", "lg121": "亜空の迷宮 暗い干潟",
    "lg122": "亜空の迷宮 悲哀の王城", "lg123": "亜空の迷宮 悲哀の王城",
    "lg124": "亜空の迷宮 邪教徒の神殿", "lg125": "亜空の迷宮 邪教徒の神殿",
    "lg126": "亜空の迷宮 邪神の胎", "lg127": "亜空の迷宮 転移魔法陣",
    "lg128": "亜空の迷宮 悪魔の修道院", "lg129": "亜空の迷宮 生命の実験場",
    "lg130": "亜空の迷宮 生命の実験場", "lg131": "亜空の迷宮 重なりあう世界",
    "lg199": "亜空の迷宮 隠された聖域",
    "le100": "幻影の迷宮 大樹の幹", "le101": "幻影の迷宮 新緑の大樹",
    "le102": "幻影の迷宮 地底洞窟", "le103": "幻影の迷宮 凍える氷穴",
    "le104": "幻影の迷宮 火山地帯", "le105": "幻影の迷宮 魔物の巣穴",
    "le106": "幻影の迷宮 財宝の眠る地底湖", "le107": "幻影の迷宮 湿った洞窟",
    "le108": "幻影の迷宮 湿った鉱山", "le109": "幻影の迷宮 湿った鉱山",
    "le110": "幻影の迷宮 穢れた廃村", "le111": "幻影の迷宮 荒れた廃棄場",
    "le112": "幻影の迷宮 荒れた廃棄場", "le113": "幻影の迷宮 荒れた廃棄場",
    "le114": "幻影の迷宮 血濡れた研究所", "le115": "幻影の迷宮 血濡れた研究所",
    "le116": "幻影の迷宮 汚染処理場", "le117": "幻影の迷宮 実験施設",
    "le118": "幻影の迷宮 未知の箱庭", "le119": "幻影の迷宮 逢魔の館",
    "le120": "幻影の迷宮 逢魔の館", "le121": "幻影の迷宮 陰鬱な倉庫",
    "le122": "幻影の迷宮 汚染された廃城", "le123": "幻影の迷宮 煮え滾る浴場",
    "le124": "幻影の迷宮 悪魔の劇場", "le125": "幻影の迷宮 夢の花園",
    "le126": "幻影の迷宮 夢の花園", "le127": "幻影の迷宮 鮮緑の神殿",
    "le128": "幻影の迷宮 太古の塔", "le129": "幻影の迷宮 塔の地下",
    "le130": "幻影の迷宮 深海遺跡", "le131": "幻影の迷宮 海底神殿",
    "le199": "幻影の迷宮 隠された聖域",
}


def _build():
    by_id, by_name = {}, {}

    def put(name, mid, how):
        if not name or not mid:
            return
        by_name.setdefault(L.norm(name), (mid, how))
        by_id.setdefault(mid, (name, how))
    for tbl, how in ((L.MEASURED, "実測"), (L.REFERENCE_IDS, "参考")):
        for k, mid in tbl.items():
            put(k, mid, how)          # キーは norm 済み(空白なしの名前)
    _cnt = {}
    for _name in _CLIENT_MD.values():
        _cnt[_name] = _cnt.get(_name, 0) + 1
    for mid, name in _CLIENT_MD.items():
        by_id.setdefault(mid, (name, "クライアント"))
        if _cnt[name] == 1:           # 同じ名前が複数の ID にあるものは、名前→ID には入れない(誤った ID を返さないため)
            by_name.setdefault(L.norm(name), (mid, "クライアント"))
    for name, mid in L.INDOOR_TOWN.items():
        put(name + "室内", mid, "町の決まり")
    for name, mid in L.TOWNS.items():
        put(name, mid, "町の決まり")
    return by_id, by_name


_BY_ID, _BY_NAME = _build()
_TRUSTED = ("実測", "参考", "クライアント")
_LEARNED, _OFFICIAL, _OFF_BY_NAME = {}, {}, {}      # ID -> 日本語の名前(履歴で学んだもの)・ID -> 公式の名前の頭・公式の名前 -> ID(1つに決まるものだけ)


def learn(learned=None, official=None, official_full=None):
    """この PC で集まった対応を台帳に入れる(毎回入れかえ)。
    learned = {ID: 日本語の MD の名前}(MD の履歴: 通信で見た「MD@ID」)・official = {ID: 公式のマップ名の頭}・official_full = [[ID, 公式のマップ名], …]"""
    _LEARNED.clear()
    _LEARNED.update(learned or {})
    _OFFICIAL.clear()
    _OFFICIAL.update(official or {})
    by = {}
    for f, nm in official_full or []:
        by.setdefault(L.norm(nm), set()).add(str(f).split("@", 1)[-1])
    _OFF_BY_NAME.clear()
    _OFF_BY_NAME.update({k: next(iter(v)) for k, v in by.items() if len(v) == 1})


def name_of(map_id):
    """マップ ID(例 hal_opera)→ 日本語の名前。台帳に無ければ None。「MD@id」の形なら後ろの部分で引く。"""
    mid = str(map_id or "").split("@", 1)[-1]
    r = _BY_ID.get(mid)
    if r and r[1] in _TRUSTED:
        return r[0]
    return _LEARNED.get(mid) or _OFFICIAL.get(mid) or (r[0] if r else None)


def id_of(name):
    """日本語の名前 → マップ ID。台帳に無ければ None。"""
    r = _BY_NAME.get(L.norm(name))
    if r and r[1] in _TRUSTED:
        return r[0]
    k = L.norm(name)
    return _OFF_BY_NAME.get(k) or next((i for i, n in _LEARNED.items() if L.norm(n) == k), None) or (r[0] if r else None)


def md_search(q, limit=60):
    """台帳にある MD のマップ(亜空 lg*・幻影 le*)を、名前・ID の部分一致で探す。[[ID, 名前], …]。
    公式のマップ一覧には載らない MD の名前を、画面のマップ検索にも出すための入口。"""
    k = L.norm(q or "")
    out = []
    ids = {str(m).split("@", 1)[-1] for m in list(_BY_ID) + list(_LEARNED) + list(_OFFICIAL)}
    for base in sorted(ids):
        if not (base.startswith("lg") or base.startswith("le")):
            continue
        name = name_of(base)
        if name and (not k or k in L.norm(name) or k in base):
            out.append([base, name])
            if len(out) >= limit:
                break
    return out


def size():
    """台帳に入っているマップ ID の数(同梱の分 + 学んだ分 + 公式の分。重なりは1つ)"""
    return len(set(_BY_ID) | set(_LEARNED) | set(_OFFICIAL))
