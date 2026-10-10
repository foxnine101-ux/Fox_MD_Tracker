# -*- coding: utf-8 -*-
"""
calc_data.json を ラトリオ(jRO 準拠)のデータから作る(計算機の被ダメの検証用)。

  python tools/make_calc_data.py <ラトリオのフォルダ> > calc_data.json

  出力: {"ele": {"鎧の属性": {"攻撃の属性": 倍率%}}}
    engine/data/element-affinity.dat.js の zokusei[鎧の属性×10 + 属性Lv][攻撃の属性] = 増減%。
    プレイヤーの鎧は属性Lv1 なので、Lv1 の行だけ使う(100 = そのまま、25 = 4分の1、0 = 効かない)。
"""
import json
import re
import sys

ELES = ("無", "水", "地", "火", "風", "毒", "聖", "闇", "念", "不死")


def main(folder):
    sys.stdout.reconfigure(encoding="utf-8")
    with open(folder.rstrip("/\\") + "/engine/data/element-affinity.dat.js", encoding="utf-8") as f:
        s = f.read()
    rows = {int(m.group(1)): [int(x) for x in m.group(2).split(",")]
            for m in re.finditer(r"zokusei\[(\d+)\]\s*=\s*\[([-\d,\s]+)\]", s)}
    ele = {}
    for d, de in enumerate(ELES):
        row = rows[d * 10 + 1]
        ele[de] = {ae: 100 + row[a] for a, ae in enumerate(ELES)}
    json.dump({"ele": ele}, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1])
