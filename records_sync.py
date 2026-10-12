"""2台の同期: 通信から集めた記録(キャラ・装備・装備セット・MD の記録)を、手動で「預ける」「取り込む」ための部品。被ダメの記録は対象外。

自動で混ぜない理由: 同じキャラを2台で別々に遊ぶと、ニャル様の回数のような「足し算の記録」を正しく混ぜる決まりが無く、
自動にすると、静かに記録を壊す・戻す危険が残る(レビューで確認)。だから向きをはっきり選んで、バックアップを取ってから行う。
  ・足す(add)       … この PC に無いキャラ・装備セット・履歴だけを足す。この PC にある記録は一切変えない
  ・置きかえる(replace) … この PC の記録を、預けてある記録で置きかえる(いま遊んでいるキャラと、名前の分からない通信の置き場は残す)
"""
import json

HISTORY_MAX = 300      # md_core.HISTORY_MAX と同じ
UNKNOWN = "(キャラ不明)"       # char_core.UNKNOWN: 名前がまだ分からない通信の置き場。その PC 限りなので同期しない


def norm(o):
    """JSON を通して、キーを並べた形にそろえる(比べやすく・数字のキーを文字にそろえる)"""
    return json.loads(json.dumps(o, ensure_ascii=False, sort_keys=True))


def _j(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True)


def _strip_idx(o):
    """持ち物の番号(inventoryIndex)は、ログインのたびに変わるその PC 限りの値"""
    if isinstance(o, dict):
        return {k: _strip_idx(v) for k, v in o.items() if k != "inventoryIndex"}
    if isinstance(o, list):
        return [_strip_idx(v) for v in o]
    return o


def prepare(rec):
    """預ける形に整える: 名前の分からない通信の置き場は外し、持ち物の番号は外す"""
    rec = norm(rec or {})
    for sect in ("md", "cs"):
        t = (rec.get(sect) or {}).get("chars")
        if isinstance(t, dict):
            t.pop(UNKNOWN, None)
    cc = (rec.get("cs") or {}).get("chars")
    if isinstance(cc, dict):
        rec["cs"]["chars"] = {k: _strip_idx(v) for k, v in cc.items()}
    return rec


def counts(rec):
    rec = rec or {}
    return {"md_chars": len((rec.get("md") or {}).get("chars") or {}), "chars": len((rec.get("cs") or {}).get("chars") or {}),
            "sets": len((rec.get("cs") or {}).get("sets") or {}), "shadows": len((rec.get("cs") or {}).get("shadows") or {})}


def _fix_tags(table):
    """同じ記号(A・B…)が別々のセットに付いていたら、先に作ったほうだけに残す"""
    seen = {}
    for sid, s in sorted(table.items(), key=lambda kv: (kv[1].get("first") or 0, kv[0])):
        t = s.get("tag")
        if not t:
            continue
        if t in seen:
            s["tag"] = ""
        else:
            seen[t] = sid


def _union_add(local, remote):
    out = dict(local or {})
    for k, v in (remote or {}).items():
        if k not in out:
            out[k] = v
    return out


def add_only(local, remote):
    """この PC に無いものだけを足す(この PC にある記録は変えない)。新しい装備セットの記号が、この PC の記号とぶつかるときは外す"""
    local, remote = prepare(local), prepare(remote)
    lm, rm, lc, rc = local.get("md") or {}, remote.get("md") or {}, local.get("cs") or {}, remote.get("cs") or {}
    out = {"md": {}, "cs": {}}
    out["md"]["chars"] = _union_add(lm.get("chars"), rm.get("chars"))
    out["cs"]["chars"] = _union_add(lc.get("chars"), rc.get("chars"))
    for name in ("sets", "shadows"):
        mine = lc.get(name) or {}
        used = {s.get("tag") for s in mine.values() if s.get("tag")}
        table = dict(mine)
        for k, v in (rc.get(name) or {}).items():
            if k not in table:
                v = dict(v)
                if v.get("tag") and v["tag"] in used:
                    v["tag"] = ""
                if v.get("tag"):
                    used.add(v["tag"])
                table[k] = v
        out["cs"][name] = table
    hist = {}
    for h in list(lm.get("history") or []) + list(rm.get("history") or []):
        hist[(h.get("char"), h.get("map"), h.get("md"), h.get("t"))] = h
    out["md"]["history"] = sorted(hist.values(), key=lambda h: (h.get("t") or 0, _j(h)))[-HISTORY_MAX:]
    out["md"]["quest_meta"] = _union_add(lm.get("quest_meta"), rm.get("quest_meta"))
    out["md"]["gid_name"] = _union_add(lm.get("gid_name"), rm.get("gid_name"))
    out["md"]["char_ports"] = sorted(set(lm.get("char_ports") or []) | set(rm.get("char_ports") or []))
    out["md"]["char_info"] = _union_add(lm.get("char_info"), rm.get("char_info"))
    out["md"]["account_aids"] = sorted(set(lm.get("account_aids") or []) | set(rm.get("account_aids") or []))
    out["cs"]["sim_links"] = _union_add(lc.get("sim_links"), rc.get("sim_links"))
    return out


def replace_with(local, remote):
    """この PC の記録を、預けてある記録で置きかえる(結びつけ・履歴などの「足すだけ」の項目は、この PC のぶんも残す)"""
    local, remote = prepare(local), prepare(remote)
    out = add_only(local, remote)
    for sect, name in (("md", "chars"), ("cs", "chars"), ("cs", "sets"), ("cs", "shadows")):
        out[sect][name] = dict((remote.get(sect) or {}).get(name) or {})
    _fix_tags(out["cs"]["sets"])
    _fix_tags(out["cs"]["shadows"])
    return out


# ---- 被ダメの記録(dmg): 標準では引っ越しに含めない。含めるときだけ ----
DMG_PER_CHAR = ("stats", "gstats", "ails", "acts")       # キャラ → 中身
DMG_PER_KEY = ("seen", "sets", "mob_seen", "cls_name")                # キー → 中身(この PC に無いキーだけ足す)


def dmg_counts(dmg):
    return len((dmg or {}).get("stats") or {})


def dmg_add_only(local, remote):
    """この PC に無いキャラの分(と、無いキー)だけ足す。この PC にある記録は変えない。足し算の集計なので、同じキャラの数字は混ぜない"""
    local, remote = dict(norm(local or {})), norm(remote or {})
    out = dict(local)
    for k in DMG_PER_CHAR + DMG_PER_KEY:
        out[k] = _union_add(local.get(k), remote.get(k))
    out["monnames"] = sorted(set(local.get("monnames") or []) | set(remote.get("monnames") or []))
    return out


def dmg_new_chars(local, remote):
    return sorted(set((remote or {}).get("stats") or {}) - set((local or {}).get("stats") or {}))
