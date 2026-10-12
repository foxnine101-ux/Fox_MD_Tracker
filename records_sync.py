"""2台の同期: 通信から集めた記録(キャラ・装備・MD の記録)の混ぜ方。

どの混ぜ方も、順番に関係なく同じ結果になる(A と B を混ぜても B と A を混ぜても同じ)ように決めてある。
そうでないと、2台がいつまでも違う内容のままで、預け直しを繰り返してしまう。
消すことはしない(足すだけ・新しいほうを採るだけ)。被ダメの記録は対象外。
"""
import json

HISTORY_MAX = 300      # md_core.HISTORY_MAX と同じ


def norm(o):
    """JSON を通して、キーを並べた形にそろえる(比べやすく・数字のキーを文字にそろえる)"""
    return json.loads(json.dumps(o, ensure_ascii=False, sort_keys=True))


def _j(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True)


def _newer(a, b, field):
    """項目まるごと、field(時刻)が新しいほう。同じなら中身の並びで大きいほう(どちら側から見ても同じ答え)"""
    if a is None:
        return b
    if b is None:
        return a
    ta, tb = a.get(field) or 0, b.get(field) or 0
    if ta != tb:
        return a if ta > tb else b
    return a if _j(a) >= _j(b) else b


def _union_pick(a, b, better):
    """辞書の和。両方にある項目は better(x, y) で選ぶ"""
    out = dict(a or {})
    for k, v in (b or {}).items():
        out[k] = better(out[k], v) if k in out else v
    return out


def _bigger(x, y):
    return x if _j(x) >= _j(y) else y


def merge_md(l, r):
    l, r = l or {}, r or {}
    chars = _union_pick(l.get("chars"), r.get("chars"), lambda x, y: _newer(x, y, "seen"))
    # 同じキャラの記録は、いちばん新しく見たほうを丸ごと採る(同じキャラが2台で同時に動くことはないため)
    hist = {}
    for h in list(l.get("history") or []) + list(r.get("history") or []):
        hist[(h.get("char"), h.get("map"), h.get("md"), h.get("t"))] = h
    history = sorted(hist.values(), key=lambda h: (h.get("t") or 0, _j(h)))[-HISTORY_MAX:]
    return {
        "chars": chars,
        "quest_meta": _union_pick(l.get("quest_meta"), r.get("quest_meta"), _bigger),
        "history": history,
        "gid_name": _union_pick(l.get("gid_name"), r.get("gid_name"), lambda x, y: max(str(x), str(y))),
        "char_ports": sorted(set(l.get("char_ports") or []) | set(r.get("char_ports") or [])),
        "char_info": _union_pick(l.get("char_info"), r.get("char_info"),
                                 lambda x, y: x if ((x.get("lv") or 0), _j(x)) >= ((y.get("lv") or 0), _j(y)) else y),
        "account_aids": sorted(set(l.get("account_aids") or []) | set(r.get("account_aids") or [])),
    }


def _merge_set(a, b):
    """装備セット1つ。中身は最後に着た時刻が新しいほう。名前・記号・色は、空でないほう(両方あれば新しいほうの)。"""
    top = _newer(a, b, "last")
    other = b if top is a else a
    out = json.loads(_j(top))
    for f in ("name", "tag", "color"):
        if not out.get(f) and other.get(f):
            out[f] = other[f]
    firsts = [x for x in (a.get("first"), b.get("first")) if x]
    out["first"] = min(firsts) if firsts else 0
    out["last"] = max(a.get("last") or 0, b.get("last") or 0)
    out["worn"] = max(a.get("worn") or 0, b.get("worn") or 0)
    out["chars"] = _union_pick(a.get("chars"), b.get("chars"), lambda x, y: _newer(x, y, "last"))
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


def merge_cs(l, r):
    l, r = l or {}, r or {}
    out = {
        "chars": _union_pick(l.get("chars"), r.get("chars"), lambda x, y: _newer(x, y, "updated")),
        "sets": _union_pick(l.get("sets"), r.get("sets"), _merge_set),
        "shadows": _union_pick(l.get("shadows"), r.get("shadows"), _merge_set),
        "sim_links": _union_pick(l.get("sim_links"), r.get("sim_links"), _bigger),
    }
    _fix_tags(out["sets"])
    _fix_tags(out["shadows"])
    return out


def merge_records(l, r):
    """{md, cs} どうしを混ぜる(どちらかが無ければ、もう一方をそのまま)"""
    l, r = norm(l or {}), norm(r or {})
    return {"md": merge_md(l.get("md"), r.get("md")), "cs": merge_cs(l.get("cs"), r.get("cs"))}
