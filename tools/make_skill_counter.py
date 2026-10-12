# -*- coding: utf-8 -*-
"""
skill_counter.json を ラトリオの装備・カードの説明文から作る(技の名前 → その技のダメージを減らす装備・カード)。

  python tools/make_skill_counter.py <ラトリオのフォルダ> > skill_counter.json

  説明文の「[Mレイオブジェネシス]で受けるダメージ - 50%」の形を探す(card.dat.js / item.dat.js)。
  出力: {"Mレイオブジェネシス": [["カード"|"装備", 名前, 説明文], …]}
"""
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
folder = sys.argv[1]
out = {}
for fn, kind in (("card.dat.js", "カード"), ("item.dat.js", "装備")):
    for line in open(os.path.join(folder, "engine", "equip", fn), encoding="utf-8"):
        if "で受けるダメージ" not in line:
            continue
        nm = re.search(r'\d+,"([^"]+)"', line)
        txt = re.search(r'"((?:[^"]*\[[^\]]+\]で受けるダメージ[^"]*))"', line)
        if not txt:
            continue
        for sk in set(re.findall(r"\[([^\]]+)\]で受けるダメージ\s*[-−－]", txt.group(1))):
            who = nm.group(1) if nm else ""
            if who.startswith("["):                      # 「[信奉者のローブ]の精錬値が…」のような、名前の欄が説明文そのままの行 → 最初の [ ] の中を名前にする
                who = re.match(r"\[([^\]]+)\]", who).group(1)
            t = re.sub(r"<[^>]+>", " ", txt.group(1)).strip()
            out.setdefault(sk, []).append([kind, who, t[:160]])
json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
