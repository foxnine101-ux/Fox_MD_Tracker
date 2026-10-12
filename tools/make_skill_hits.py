# -*- coding: utf-8 -*-
"""
skill_hits.json を ラトリオのスキル定義から作る(スキル番号 → 1回で当たるヒット数)。

  python tools/make_skill_hits.py <ラトリオのフォルダ> > skill_hits.json

  engine/skill/**/*.js の defineSkill の中の  this.hitCount = function(...) { return 7; }  のように、数が決まっているものだけ。
  スキル名(先頭の「(△)」などの印は外す)で skill_names.json のゲームのスキル番号につなぐ。
  使い道: モンスター専用スキル(Mレイオブジェネシスなど)の種類・属性を、同じ名前の通常スキルから「借り」たとき、
          通信で実測したヒット数と合えば「確定」にする(dmg_core.borrow_state)。
"""
import collections
import glob
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
folder = sys.argv[1]
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
names = json.load(open(os.path.join(here, "skill_names.json"), encoding="utf-8"))
by_name = collections.defaultdict(list)
for sid, nm in names.items():
    by_name[nm].append(sid)
out = {}
for p in glob.glob(os.path.join(folder, "engine", "skill", "**", "*.js"), recursive=True):
    s = open(p, encoding="utf-8").read()
    for m in re.finditer(r"defineSkill\((\w+),\s*function\s*\(\)\s*\{(.*?)\n\t\t\}\)", s, re.S):
        body = m.group(2)
        nm = re.search(r'this\.name\s*=\s*"([^"]*)"', body)
        hc = re.search(r"this\.hitCount\s*=\s*function\s*\([^)]*\)\s*\{\s*return\s+(\d+)\s*;\s*\}", body)
        if not nm or not hc:
            continue
        name = re.sub(r"^\([^)]*\)", "", nm.group(1))
        for sid in by_name.get(name, []):
            out[sid] = int(hc.group(1))
json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
