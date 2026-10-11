# -*- coding: utf-8 -*-
"""
calc_data.json の rndopt を作る(ゲームのランダムオプション番号 → ラトリオの「効果の種類(SPID)」)。

  python tools/make_rndopt_map.py <ラトリオのフォルダ>

  calc_data.json の "rndopt" に書き込む(画面では DATA.calc.rndopt)。
  中身: {"game": {"ゲームの番号": SPID}, "rat": {"ラトリオのID": [SPID, 最小, 最大, きざみ]}, "unmapped": {"ゲームの番号": "名前"}}
  ゲームの番号は option_names.json の日本語の名前の型から決める(名前の言い方で一致させる)。ラトリオに無い効果は unmapped。
  使いかた: 装備の枠のランダムオプション選択肢(ラトリオのID)のうち、SPID が同じで、値が 最小〜最大(きざみ)に入るものを選ぶ。
"""
import json
import os
import re
import sys

root = sys.argv[1]
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
names = json.load(open(os.path.join(here, "option_names.json"), encoding="utf-8"))
src = open(os.path.join(root, "engine", "equip", "rndopt.dat.js"), encoding="utf-8").read()
rat = {}
for m in re.finditer(r"^\s*\[(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\]", src, re.M):
    i, spid, mn, mx, st, flag = map(int, m.groups())
    rat[i] = [spid, mn, mx, st]

ELE = ["無", "水", "地", "火", "風", "毒", "聖", "闇", "念", "不死"]
RACE = ["無形", "不死形", "動物形", "植物形", "昆虫形", "魚貝形", "悪魔形", "人間形", "天使形", "竜形"]
# ラトリオの SPID の並び(rndopt.dat.js の並びから): 種族ごとに連番
def seq(base, n=10): return {i: base + i for i in range(n)}
PHYS_RACE, MAG_RACE, CRI_RACE = seq(30), seq(170), seq(110)
IGN_DEF_RACE, IGN_MDEF_RACE = seq(300), seq(310)
RES_RACE = {0: 50, 1: 51, 2: 52, 3: 53, 4: 54, 5: 55, 6: 56, 7: 57, 8: 58, 9: 59}
PHYS_ELE, MAG_ELE = seq(40), seq(350)
RES_ELE_ATTACK, RES_FROM_ELE = seq(60), seq(330)      # 属性耐性 / 属性の敵から受けるダメージ
SIMPLE = {"MaxHP +{v}": 13, "MaxSP +{v}": 14, "STR +{v}": 1, "AGI +{v}": 2, "VIT +{v}": 3, "INT +{v}": 4, "DEX +{v}": 5, "LUK +{v}": 6,
          "MaxHP +{v}%": 15, "MaxSP +{v}%": 16, "HP自然回復 +{v}%": 75, "SP自然回復 +{v}%": 76, "ASPD +{v}": 101,
          "攻撃速度 +{v}%": 12, "ATK +{v}": 17, "HIT +{v}": 8, "MATK +{v}": 100, "DEF +{v}": 18, "MDEF +{v}": 19, "FLEE +{v}": 9,
          "完全回避 +{v}": 11, "CRI +{v}": 10, "POW +{v}": 230, "STA +{v}": 231, "WIS +{v}": 232, "SPL +{v}": 233, "CON +{v}": 234,
          "CRT +{v}": 235, "P.ATK +{v}": 250, "S.MATK +{v}": 251, "H.PLUS +{v}": 252, "C.RATE +{v}": 253, "RES +{v}": 254, "MRES +{v}": 255,
          "サイズ補正無視": 228, "クリティカルダメージ +{v}%": 70, "遠距離物理ダメージ +{v}%": 25, "遠距離物理耐性 +{v}%": 78,
          "ヒール量 +{v}%": 91, "受けるヒール量 +{v}%": 92, "変動詠唱 -{v}%": 73, "ディレイ -{v}%": 74, "SP消費 -{v}%": 102,
          "武器が壊れない": 194, "鎧が壊れない": 194, "全属性耐性 +{v}%": None}
SUFFIX = [  # (名前の末尾の型, 表, 'e'=属性 / 'r'=種族)
    ("属性耐性 +{v}%", RES_ELE_ATTACK, "e"), ("属性の敵に物理 +{v}%", PHYS_ELE, "e"), ("属性の敵から受ける物理 -{v}%", RES_FROM_ELE, "e"),
    ("属性の敵に魔法 +{v}%", MAG_ELE, "e"),
    ("耐性 +{v}%", RES_RACE, "r"), ("に物理 +{v}%", PHYS_RACE, "r"), ("に魔法 +{v}%", MAG_RACE, "r"),
    ("へのクリティカル +{v}", CRI_RACE, "r"), ("のDEF {v}%無視", IGN_DEF_RACE, "r"), ("のMDEF {v}%無視", IGN_MDEF_RACE, "r"),
]
EXTRA = {"ノーマルモンスターに物理 +{v}%": 267, "ボスモンスターに物理 +{v}%": 26, "ノーマルモンスターに魔法 +{v}%": 268, "ボスモンスターに魔法 +{v}%": 96,
         "ノーマルモンスターから受けるダメージ -{v}%": 79, "ボスモンスターから受けるダメージ -{v}%": 77,
         "ノーマルモンスターのDEF {v}%無視": 291, "ボスモンスターのDEF {v}%無視": 292,
         "ノーマルモンスターのMDEF {v}%無視": 296, "ボスモンスターのMDEF {v}%無視": 297,
         "小型に物理 +{v}%": 27, "中型に物理 +{v}%": 28, "大型に物理 +{v}%": 29, "小型に魔法 +{v}%": 97, "中型に魔法 +{v}%": 98, "大型に魔法 +{v}%": 99,
         "小型から受ける物理 -{v}%": 190, "中型から受ける物理 -{v}%": 191, "大型から受ける物理 -{v}%": 192,
         "人間(プレイヤー)に物理 +{v}%": 275, "ドラム(プレイヤー)に物理 +{v}%": 272, "人間(プレイヤー)に魔法 +{v}%": 276, "ドラム(プレイヤー)に魔法 +{v}%": 273,
         "人間(プレイヤー)耐性 +{v}%": 277, "ドラム(プレイヤー)耐性 +{v}%": 274}


def spid_of(t):
    if t in SIMPLE:
        return SIMPLE[t]
    if t in EXTRA:
        return EXTRA[t]
    for suf, table, kind in SUFFIX:
        if t.endswith(suf):
            head = t[:-len(suf)]
            if kind == "e" and head in ELE:
                return table[ELE.index(head)]
            if kind == "r" and head in RACE:
                return table[RACE.index(head)]
    m = re.fullmatch(r"(鎧|武器)が(.+)属性", t)       # 属性の付与はラトリオでは別の欄(属性付与)で設定するので対応しない
    return None


game, unmapped = {}, {}
for k, t in names.items():
    s = spid_of(t)
    if s is None:
        unmapped[k] = t
    else:
        game[k] = s
spids = {v[0] for v in rat.values()}
bad = {k: s for k, s in game.items() if s not in spids}
for k in bad:
    unmapped[k] = names[k] + "(ラトリオにSPIDが無い)"
    del game[k]
cp = os.path.join(here, "calc_data.json")
cd = json.load(open(cp, encoding="utf-8"))
cd["rndopt"] = {"game": game, "rat": {str(i): v for i, v in rat.items()}, "unmapped": unmapped}
json.dump(cd, open(cp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("対応 %d / 未対応 %d" % (len(game), len(unmapped)))
