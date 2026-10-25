# -*- coding: utf-8 -*-
"""map_ledger.py — マップの「ID(ファイル名)↔ 日本語の名前」の台帳。

これまで、マップ ID は別々の場所に散らばっていた:
  ・lantern_core: MEASURED(ゲームに入って確かめたもの)・REFERENCE_IDS(他の人のまとめと突き合わせたもの)・INDOOR_TOWN・TOWNS
  ・公式サイトのマップ一覧(公式モンスター.json の maplist)
  ・MD の履歴(通信で見た「MD名@マップ ID」)
ここで1つにまとめて、どこからでも「IDから名前」「名前からID」を引けるようにする(場所の名前の整理・ランタン・ログの表示 など)。
同じ ID に名前が複数あるときは、実測・参考(人が確かめたもの) > 通信で学んだもの(MD の履歴) > 公式のマップ一覧 > 町の決まり の順で採用する。
学んだもの・公式のものは、`learn()` で渡す(この PC のデータなので、起動中に入れかわる。配るデータではない)。
"""
import lantern_core as L


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
    for name, mid in L.INDOOR_TOWN.items():
        put(name + "室内", mid, "町の決まり")
    for name, mid in L.TOWNS.items():
        put(name, mid, "町の決まり")
    return by_id, by_name


_BY_ID, _BY_NAME = _build()
_TRUSTED = ("実測", "参考")
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


def size():
    """台帳に入っているマップ ID の数(同梱の分 + 学んだ分 + 公式の分。重なりは1つ)"""
    return len(set(_BY_ID) | set(_LEARNED) | set(_OFFICIAL))
