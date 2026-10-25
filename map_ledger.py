# -*- coding: utf-8 -*-
"""map_ledger.py — マップの「ID(ファイル名)↔ 日本語の名前」の台帳。

これまで、マップ ID は別々の場所に散らばっていた:
  ・lantern_core: MEASURED(ゲームに入って確かめたもの)・REFERENCE_IDS(他の人のまとめと突き合わせたもの)・INDOOR_TOWN・TOWNS
  ・公式サイトのマップ一覧(公式モンスター.json の maplist)
  ・MD の履歴(通信で見た「MD名@マップ ID」)
ここで1つにまとめて、どこからでも「IDから名前」「名前からID」を引けるようにする(場所の名前の整理・ランタン・ログの表示 など)。
同じ ID に名前が複数あるときは、実測 > 参考 > 町の決まり の順で採用する。
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


def name_of(map_id):
    """マップ ID(例 hal_opera)→ 日本語の名前。台帳に無ければ None。「MD@id」の形なら後ろの部分で引く。"""
    mid = str(map_id or "").split("@", 1)[-1]
    r = _BY_ID.get(mid)
    return r[0] if r else None


def id_of(name):
    """日本語の名前 → マップ ID。台帳に無ければ None。"""
    r = _BY_NAME.get(L.norm(name))
    return r[0] if r else None


def size():
    return len(_BY_ID)
