# -*- coding: utf-8 -*-
"""
ail_counter.json を ラトリオの装備・カードの効果から作る(状態異常 → その耐性が付く装備・カード)。

  python tools/make_ail_counter.py <ラトリオのフォルダ> > ail_counter.json

  効果の番号(engine/const/EnumItemSpId.js): 150〜159 = 旧状態異常の耐性、160〜164 = 装備破壊の耐性、360〜366・370〜379 = 新状態異常の耐性。
  値は耐性(%)。100 以上で無効。精錬や職業などの条件つきのものは、条件を書いて残す。
  出力: {"毒": [["カード"|"装備", 名前, 耐性%, 条件], …]}(耐性の大きい順・条件なしが先。1つの状態異常につき最大 60 件)
  状態異常の名前は ラトリオの拡張情報の表の名前(「暗黒」「漆黒」など。ゲームの表示名と違うものがある)。
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_gear_info_ratorio import read_rows, effects, ITEM_NAME, ITEM_SP, CARD_NAME, CARD_SP   # noqa: E402

LABEL = {150: "毒", 151: "スタン", 152: "凍結", 153: "呪い", 154: "暗黒", 155: "睡眠", 156: "沈黙", 157: "混乱", 158: "出血", 159: "石化",
         160: "装備破壊(武器)", 161: "装備破壊(兜)", 162: "装備破壊(鎧)", 163: "装備破壊(盾)", 164: "装備破壊(肩)",
         360: "冷凍", 361: "氷結", 362: "発火", 363: "恐怖", 364: "深い眠り", 365: "魅了", 366: "狂乱",
         370: "無気力", 371: "漆黒", 372: "強毒", 373: "激流", 374: "憂鬱", 375: "静寂", 376: "火災", 377: "急冷", 378: "結晶化", 379: "不幸"}

sys.stdout.reconfigure(encoding="utf-8")
folder = sys.argv[1]
out = {}
for kind, fn, ni, si in (("装備", "item.dat.js", ITEM_NAME, ITEM_SP), ("カード", "card.dat.js", CARD_NAME, CARD_SP)):
    rows, _ = read_rows(os.path.join(folder, "engine", "equip", fn))
    for row in rows:
        if len(row) <= si or not isinstance(row[ni], str) or not row[ni].strip():
            continue
        name = row[ni].strip()
        if name in ("廃止", "未使用", "予約"):          # ラトリオの使われなくなった行
            continue
        if name.startswith("["):
            name = re.match(r"\[([^\]]+)\]", name).group(1)
        for code, val in effects(row, si):
            if not isinstance(val, (int, float)) or code < 0:
                continue
            sp = code % 100000
            if sp not in LABEL or val <= 0:
                continue
            by, over, other = (code // 100000) % 10, (code // 1000000) % 100, code // 100000000
            cond = []
            if over:
                cond.append("精錬%d以上" % over)
            if by:
                cond.append("精錬%dごと" % by)
            if other:
                cond.append("ほかの条件あり")
            out.setdefault(LABEL[sp], []).append([kind, name, int(val), "・".join(cond)])
for k, v in out.items():
    v.sort(key=lambda x: (x[3] != "", -x[2], x[1]))
    seen, keep = set(), []
    for x in v:
        if (x[1], x[3]) in seen:
            continue
        seen.add((x[1], x[3]))
        keep.append(x)
    out[k] = keep[:60]
json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
