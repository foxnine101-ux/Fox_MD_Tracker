"""2台の同期: 通信から集めた記録(キャラ・装備・装備セット・MD の記録)の混ぜ方。被ダメの記録は対象外。

考え方は設定の同期と同じ「前回同期したときの内容との3者比べ」を、項目(キャラ1人・装備セット1つ)ごとにやる:
  ・この PC だけが変えた → この PC のものを残す(相手に届く)
  ・相手だけが変えた    → 相手のものを採る
  ・この PC が消した(前回あったのに、いまは無い)・相手は変えていない → 消したままにする(相手からも消える)
  ・両方が変えた(または前回の記録が無い最初の同期) → 時刻が新しいほう(同じなら中身の並びで大きいほう)
「変えたか」は、その PC 限りの値(持ち物の番号・着た時刻など)を除いた中身の指紋(hash)で調べる。
同期の最中に遊んでいるキャラ(protect)は、相手の記録で置きかえない(通信の途中で持ち物の番号がずれるため)。
"""
import hashlib
import json

HISTORY_MAX = 300      # md_core.HISTORY_MAX と同じ
UNKNOWN = "(キャラ不明)"       # char_core.UNKNOWN: 名前がまだ分からない通信の置き場。その PC 限りなので同期しない


def norm(o):
    """JSON を通して、キーを並べた形にそろえる(比べやすく・数字のキーを文字にそろえる)"""
    return json.loads(json.dumps(o, ensure_ascii=False, sort_keys=True))


def _j(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True)


def _h(x):
    return hashlib.sha1(_j(x).encode("utf-8")).hexdigest()[:12]


# --- 項目ごとの「中身の指紋」: その PC 限りの値・遊ぶたびに変わる値は除く ---
def _strip_idx(o):
    """持ち物の番号(inventoryIndex)は、ログインのたびに変わるその PC 限りの値"""
    if isinstance(o, dict):
        return {k: _strip_idx(v) for k, v in o.items() if k != "inventoryIndex"}
    if isinstance(o, list):
        return [_strip_idx(v) for v in o]
    return o


def _stable_char(e):
    return {k: v for k, v in _strip_idx(e).items() if k not in ("bag", "derived")}


def _stable_set(e):
    return {k: v for k, v in e.items() if k not in ("last", "worn", "chars", "auto", "prof")}


TABLES = (          # (名前, 取り出し場所, 指紋に使う形, 時刻の欄)
    ("md.chars", ("md", "chars"), lambda e: e, "seen"),
    ("cs.chars", ("cs", "chars"), _stable_char, "updated"),
    ("cs.sets", ("cs", "sets"), _stable_set, "last"),
    ("cs.shadows", ("cs", "shadows"), _stable_set, "last"),
)
UNION = (            # 足すだけの項目(消さない)
    ("md", "quest_meta"), ("md", "history"), ("md", "gid_name"), ("md", "char_ports"),
    ("md", "char_info"), ("md", "account_aids"), ("cs", "sim_links"),
)


def prepare(rec):
    """同期に出す形に整える: 名前の分からない通信の置き場は外し、持ち物の番号は外す"""
    rec = norm(rec or {})
    for sect, name in (("md", "chars"), ("cs", "chars")):
        t = (rec.get(sect) or {}).get(name)
        if isinstance(t, dict):
            t.pop(UNKNOWN, None)
    cc = (rec.get("cs") or {}).get("chars")
    if isinstance(cc, dict):
        rec["cs"]["chars"] = {k: _strip_idx(v) for k, v in cc.items()}
    return rec


def hashes(rec):
    """記録全体の指紋の表 {"t|表|キー": 指紋, "u|項目": 指紋}。前回同期した内容として覚えておく"""
    out = {}
    for tname, (a, b), stable, _ in TABLES:
        for k, e in ((rec.get(a) or {}).get(b) or {}).items():
            out["t|%s|%s" % (tname, k)] = _h(stable(e))
    for a, b in UNION:
        out["u|%s.%s" % (a, b)] = _h((rec.get(a) or {}).get(b))
    return out


def _newer(a, b, field):
    ta, tb = a.get(field) or 0, b.get(field) or 0
    if ta != tb:
        return a if ta > tb else b
    return a if _j(a) >= _j(b) else b


def _union(a, b, better):
    out = dict(a or {})
    for k, v in (b or {}).items():
        out[k] = better(out[k], v) if k in out else v
    return out


def _bigger(x, y):
    return x if _j(x) >= _j(y) else y


def _merge_table(tname, stable, field, local, remote, base, protect):
    out = {}
    for k in set(local) | set(remote):
        l, r, b = local.get(k), remote.get(k), base.get("t|%s|%s" % (tname, k))
        hl = _h(stable(l)) if l is not None else None
        hr = _h(stable(r)) if r is not None else None
        if l is not None and k in protect:          # 遊んでいるキャラは、相手の記録で置きかえない
            out[k] = l
        elif l is None:
            if b is not None and hr == b:           # この PC が消した(相手は変えていない) → 消したまま
                continue
            out[k] = r
        elif r is None:
            if b is not None and hl == b:           # 相手が消した(この PC は変えていない) → 消す
                continue
            out[k] = l
        elif hl == hr:
            out[k] = l
        elif b == hl:                               # この PC は変えていない → 相手のものを採る
            out[k] = r
        elif b == hr:                               # 相手は変えていない → この PC のものを残す
            out[k] = l
        else:                                       # 両方が変えた / 最初の同期
            out[k] = _newer(l, r, field)
    return out


def _fix_tags(table):
    """同じ記号(A・B…)が別々のセットに付いていたら、先に作ったほうだけに残す(どちら側から見ても同じ答え)"""
    seen = {}
    for sid, s in sorted(table.items(), key=lambda kv: (kv[1].get("first") or 0, kv[0])):
        t = s.get("tag")
        if not t:
            continue
        if t in seen:
            s["tag"] = ""
        else:
            seen[t] = sid


def merge_records(local, remote, base=None, protect=()):
    """local・remote = {md, cs}(prepare ずみ)、base = 前回同期した内容の指紋の表(hashes の結果)、protect = いま遊んでいるキャラの名前。
    返り値 = 混ぜた {md, cs}"""
    local, remote, base, protect = prepare(local), prepare(remote), base or {}, set(protect or ())
    out = {"md": {}, "cs": {}}
    for tname, (a, b), stable, field in TABLES:
        out[a][b] = _merge_table(tname, stable, field, (local.get(a) or {}).get(b) or {}, (remote.get(a) or {}).get(b) or {}, base,
                                 protect if b == "chars" else ())
    lm, rm, lc, rc = local.get("md") or {}, remote.get("md") or {}, local.get("cs") or {}, remote.get("cs") or {}
    hist = {}
    for h in list(lm.get("history") or []) + list(rm.get("history") or []):
        hist[(h.get("char"), h.get("map"), h.get("md"), h.get("t"))] = h
    out["md"]["history"] = sorted(hist.values(), key=lambda h: (h.get("t") or 0, _j(h)))[-HISTORY_MAX:]
    out["md"]["quest_meta"] = _union(lm.get("quest_meta"), rm.get("quest_meta"), _bigger)
    out["md"]["gid_name"] = _union(lm.get("gid_name"), rm.get("gid_name"), lambda x, y: max(str(x), str(y)))
    out["md"]["char_ports"] = sorted(set(lm.get("char_ports") or []) | set(rm.get("char_ports") or []))
    out["md"]["char_info"] = _union(lm.get("char_info"), rm.get("char_info"),
                                    lambda x, y: x if ((x.get("lv") or 0), _j(x)) >= ((y.get("lv") or 0), _j(y)) else y)
    out["md"]["account_aids"] = sorted(set(lm.get("account_aids") or []) | set(rm.get("account_aids") or []))
    out["cs"]["sim_links"] = _union(lc.get("sim_links"), rc.get("sim_links"), _bigger)
    _fix_tags(out["cs"]["sets"])
    _fix_tags(out["cs"]["shadows"])
    return out
