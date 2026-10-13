# -*- coding: utf-8 -*-
"""
item_link.json を作る: ゲームのアイテム番号(jRO) → ラトリオの装備・カードの番号。

  python tools/make_item_link.py <ラトリオのフォルダ> > item_link.json

ラトリオの番号はラトリオ独自のもので、ゲームの番号とは別。つなぐ手がかりは名前だけなので、
実行時に app.html の simcFind / ratFindOption がやっている名前の照合(同じ名前 → [3] や (+10以上) を外す → 先頭の [シャドウ] を外す →
カードは「カード」を外す)を、作るときに1回だけやって表にする。

  出力: {"ratorio": ラトリオのコミット(わかれば), "i": {"ゲームの番号": ラトリオの装備の番号}, "c": {"ゲームの番号": ラトリオのカードの番号}}
  - 同じ名前の行がラトリオに複数あって決められないものは入れない(実行時の照合に任せる)
  - 使うときは「その番号が候補の中にあるか」を確かめてから使う(職業・場所で候補が絞られるため)
  - 装備でないもの(消耗品など)・ラトリオにまだ無い新しいアイテムは入らない
"""
import collections
import os
import re
import subprocess
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ROOT)
import json  # noqa: E402

import char_core  # noqa: E402
import make_gear_info_ratorio as g  # noqa: E402


def norm(t):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(t or "")))


def base(t):
    return norm(re.sub(r"\s*[(（]\+\d+以上[)）]\s*$", "", re.sub(r"\[\d\]$", "", str(t))))


def table(rows, ni):
    ex, bs = collections.defaultdict(set), collections.defaultdict(set)
    for r in rows:
        if len(r) > ni and isinstance(r[ni], str) and r[ni].strip():
            ex[norm(r[ni])].add(r[0])
            bs[base(r[ni])].add(r[0])
    return ex, bs


def main(folder):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    names = char_core.load_id2name()
    T = {}
    for kind, fn, ni in (("i", "item.dat.js", g.ITEM_NAME), ("c", "card.dat.js", g.CARD_NAME)):
        rows, _bad = g.read_rows(os.path.join(folder, "engine", "equip", fn))
        T[kind] = table(rows, ni)
    out, stat = {"i": {}, "c": {}}, collections.Counter()
    for gid, nm in names.items():
        n = norm(nm)
        isc = n.endswith("カード")
        hit = None
        for kind in (("c", "i") if isc else ("i", "c")):
            ex, bs = T[kind]
            for key, tbl in ((n, ex), (base(nm), bs), (base(re.sub(r"^\[[^\]]*\]", "", str(nm))), bs),
                             (base(nm).removesuffix("カード") if isc else None, bs)):
                ids = tbl.get(key) if key else None
                if ids:
                    hit = (kind, ids)
                    break
            if hit:
                break
        if not hit:
            stat["ラトリオに無い"] += 1
        elif len(hit[1]) > 1:
            stat["決められない(同名が複数)"] += 1
        else:
            out[hit[0]][str(gid)] = next(iter(hit[1]))
            stat["入った"] += 1
    try:
        head = subprocess.run(["git", "-C", folder, "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        head = ""
    json.dump({"ratorio": head, "i": out["i"], "c": out["c"]}, sys.stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    sys.stderr.write(json.dumps(dict(stat, 装備=len(out["i"]), カード=len(out["c"]), ratorio=head[:7]), ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
