# -*- coding: utf-8 -*-
"""
アプリのランタンのタブに入れる「回る順」(web/24_lantern_route.js)を作る。身内向けページと同じ中身(tools/lantern_route.js)を、アプリの形に合わせて包む。
  python tools/make_app_route.py
  - 行き来できる組 = tools/world_links.json、マスの並び = tools/world_grid.json(どちらも公式ワールドマップの図から)
  - アプリは、マップ名 → ID を LNT.data.ids({名前: {id, how}})から、入口つきの座標は it.e = [親マップ名, x, y] から読む
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
src = open(os.path.join(HERE, "lantern_route.js"), encoding="utf-8").read().rstrip("\n")


def rep(s, o, n):
    if s.count(o) != 1:
        sys.exit("置きかえ先が1つではありません: " + o[:60])
    return s.replace(o, n)


i = src.index("function orderCtl()")
src = src[:i].rstrip("\n")                                                      # 画面の選択欄は、アプリ側(15_halloween.js)で作る
src = rep(src, 'function cellId(name) { let id = (DATA.ids[name] || [])[0]; id = ALIAS[id] || id; return id && CELLOF[id] ? id : null; }',
          'function cellId(name) { let id = ((((LNT.data || {}).ids) || {})[name] || {}).id; id = ALIAS[id] || id; return id && CELLOF[id] ? id : null; }')
src = rep(src, 'function navName(it) { return it.e ? RAW.m[it.e[0]] : it.map; }', 'function navName(it) { return it.e ? it.e[0] : it.map; }')
grid = open(os.path.join(HERE, "world_grid.json"), encoding="utf-8").read().strip()
links = open(os.path.join(HERE, "world_links.json"), encoding="utf-8").read().strip()
out = ('"use strict";\n// ランタンの「回る順」(隣のマップをたどる並べ替え)。tools/make_app_route.py が tools/lantern_route.js から作る(直接は直さない)。\n'
       "const LNTROUTE = (() => {\nconst GRID = " + grid + ";\nconst LINKS = " + links + ";\nconst ST = { get start() { return LNT.start; } };\n"
       + src + "\nreturn { routeSort, STARTS };\n})();\n")
open(os.path.join(ROOT, "web", "24_lantern_route.js"), "w", encoding="utf-8", newline="\n").write(out)
print("web/24_lantern_route.js", len(out), "バイト")
