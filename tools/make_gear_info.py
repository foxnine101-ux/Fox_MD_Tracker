# -*- coding: utf-8 -*-
"""
gear_info.json を作る(被ダメの「そのときの装備」用: 鎧の属性と属性耐性)。

  python tools/make_gear_info.py <rAthena db/re/item_db_equip.yml> <item_db_etc.yml> > gear_info.json

  出力: {"アイテムID": {"de": 鎧の属性, "re": {"属性": %}}}
    スクリプトのいちばん外側(if や精錬条件の中ではない)の
      bonus bDefEle,Ele_X;            → 鎧の属性
      bonus2 bSubEle,Ele_X,N;         → その属性の耐性 N%(Ele_All は全部)
    だけを拾う。条件つき・セット効果は入らないので「目安」。
"""
import json
import re
import sys

import yaml

ELE = {"Neutral": "無", "Water": "水", "Earth": "地", "Fire": "火", "Wind": "風", "Poison": "毒",
       "Holy": "聖", "Dark": "闇", "Ghost": "念", "Undead": "不死"}
RE_DEF = re.compile(r"^\s*bonus\s+bDefEle\s*,\s*Ele_(\w+)\s*;")
RE_SUB = re.compile(r"^\s*bonus2\s+bSubEle\s*,\s*Ele_(\w+)\s*,\s*(-?\d+)\s*;")


def top_level_lines(script):
    depth = 0
    for line in script.splitlines():
        if depth == 0:
            yield line
        depth += line.count("{") - line.count("}")
        depth = max(depth, 0)


def main(paths):
    out = {}
    for path in paths:
        for it in yaml.safe_load(open(path, encoding="utf-8"))["Body"]:
            sc = it.get("Script") or ""
            if "bDefEle" not in sc and "bSubEle" not in sc:
                continue
            info = {}
            for line in top_level_lines(sc):
                m = RE_DEF.match(line)
                if m and m.group(1) in ELE:
                    info["de"] = ELE[m.group(1)]
                m = RE_SUB.match(line)
                if m:
                    eles = list(ELE.values()) if m.group(1) == "All" else [ELE.get(m.group(1))]
                    for e in eles:
                        if e:
                            info.setdefault("re", {})[e] = info.get("re", {}).get(e, 0) + int(m.group(2))
            if info:
                out[str(it["Id"])] = info
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1:])
