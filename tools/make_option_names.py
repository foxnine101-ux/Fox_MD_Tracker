# -*- coding: utf-8 -*-
"""
option_names.json を作る(ランダムオプションの日本語の名前。装備タブ用)。

  python tools/make_option_names.py <rAthena db/re/item_randomopt_db.yml> > option_names.json

  出力: {"番号": "名前の型"}   型の中の {v} が値になる。(例 "無属性耐性 +{v}%")
  rAthena の Option 名から作るので、ゲームの表記と少し違うことがある。
"""
import json
import re
import sys

import yaml

ELE = {"NOTHING": "無", "WATER": "水", "GROUND": "地", "FIRE": "火", "WIND": "風", "POISON": "毒",
       "SAINT": "聖", "DARKNESS": "闇", "TELEKINESIS": "念", "UNDEAD": "不死"}
RACE = {"NOTHING": "無形", "UNDEAD": "不死形", "ANIMAL": "動物形", "PLANT": "植物形", "INSECT": "昆虫形",
        "FISHS": "魚貝形", "DEVIL": "悪魔形", "HUMAN": "人間形", "ANGEL": "天使形", "DRAGON": "竜形",
        "PLAYER_HUMAN": "人間(プレイヤー)", "PLAYER_DORAM": "ドラム(プレイヤー)", "ALL": "全種族"}
SIZE = {"SMALL": "小型", "MIDIUM": "中型", "LARGE": "大型"}
CLS = {"NORMAL": "ノーマルモンスター", "BOSS": "ボスモンスター"}
VAR = {"MAXHPAMOUNT": "MaxHP +{v}", "MAXSPAMOUNT": "MaxSP +{v}", "STRAMOUNT": "STR +{v}", "AGIAMOUNT": "AGI +{v}",
       "VITAMOUNT": "VIT +{v}", "INTAMOUNT": "INT +{v}", "DEXAMOUNT": "DEX +{v}", "LUKAMOUNT": "LUK +{v}",
       "MAXHPPERCENT": "MaxHP +{v}%", "MAXSPPERCENT": "MaxSP +{v}%", "HPACCELERATION": "HP自然回復 +{v}%",
       "SPACCELERATION": "SP自然回復 +{v}%", "ATKPERCENT": "ATK +{v}%", "MAGICATKPERCENT": "MATK +{v}%",
       "PLUSASPD": "ASPD +{v}", "PLUSASPDPERCENT": "攻撃速度 +{v}%", "ATTPOWER": "ATK +{v}", "HITSUCCESSVALUE": "HIT +{v}",
       "ATTMPOWER": "MATK +{v}", "ITEMDEFPOWER": "DEF +{v}", "MDEFPOWER": "MDEF +{v}", "AVOIDSUCCESSVALUE": "FLEE +{v}",
       "PLUSAVOIDSUCCESSVALUE": "完全回避 +{v}", "CRITICALSUCCESSVALUE": "CRI +{v}",
       "POWAMOUNT": "POW +{v}", "SPLAMOUNT": "SPL +{v}", "STAAMOUNT": "STA +{v}", "WISAMOUNT": "WIS +{v}",
       "CONAMOUNT": "CON +{v}", "CRTAMOUNT": "CRT +{v}", "PATKAMOUNT": "P.ATK +{v}", "SMATKAMOUNT": "S.MATK +{v}",
       "RESAMOUNT": "RES +{v}", "MRESAMOUNT": "MRES +{v}", "HEAL_PLUS": "H.PLUS +{v}", "CRITICAL_RATE": "C.RATE +{v}"}
FIXED = {"ATTR_TOLERACE_ALLBUTNOTHING": "無以外の全属性耐性 +{v}%", "ATTR_TOLERACE_ALL": "全属性耐性 +{v}%",
         "DAMAGE_SIZE_PERFECT": "サイズ補正無視", "DAMAGE_CRI_TARGET": "クリティカルダメージ +{v}%",
         "DAMAGE_CRI_USER": "クリティカル耐性 +{v}%", "RANGE_ATTACK_DAMAGE_TARGET": "遠距離物理ダメージ +{v}%",
         "RANGE_ATTACK_DAMAGE_USER": "遠距離物理耐性 +{v}%", "MELEE_ATTACK_DAMAGE_TARGET": "近接物理ダメージ +{v}%",
         "MELEE_ATTACK_DAMAGE_USER": "近接物理耐性 +{v}%", "HEAL_VALUE": "ヒール量 +{v}%", "HEAL_MODIFY_PERCENT": "受けるヒール量 +{v}%",
         "DEC_SPELL_CAST_TIME": "変動詠唱 -{v}%", "DEC_SPELL_DELAY_TIME": "ディレイ -{v}%", "DEC_SP_CONSUMPTION": "SP消費 -{v}%",
         "WEAPON_INDESTRUCTIBLE": "武器が壊れない", "BODY_INDESTRUCTIBLE": "鎧が壊れない",
         "REFLECT_DAMAGE_PERCENT": "反射ダメージ -{v}%", "ADDSKILLMDAMAGE_ALL": "全属性魔法ダメージ +{v}%",
         "ADDEXPPERCENT_KILLRACE_ALL": "全種族を倒したときの経験値 +{v}%"}
PATTERNS = [
    (r"ATTR_TOLERACE_(\w+)", lambda m: ELE.get(m[1]) and "{}属性耐性 +{{v}}%".format(ELE[m[1]])),
    (r"DAMAGE_PROPERTY_(\w+)_USER", lambda m: "{}属性の敵から受ける物理 -{{v}}%".format(ELE[m[1]])),
    (r"DAMAGE_PROPERTY_(\w+)_TARGET", lambda m: "{}属性の敵に物理 +{{v}}%".format(ELE[m[1]])),
    (r"MDAMAGE_PROPERTY_(\w+)_USER", lambda m: "{}属性の敵から受ける魔法 -{{v}}%".format(ELE[m[1]])),
    (r"MDAMAGE_PROPERTY_(\w+)_TARGET", lambda m: "{}属性の敵に魔法 +{{v}}%".format(ELE[m[1]])),
    (r"BODY_ATTR_(\w+)", lambda m: "鎧が{}属性".format(ELE[m[1]])),
    (r"WEAPON_ATTR_(\w+)", lambda m: "武器が{}属性".format(ELE[m[1]])),
    (r"RACE_WEAPON_TOLERACE_(\w+)", lambda m: "{}から受ける物理 -{{v}}%".format(RACE[m[1]])),
    (r"RACE_TOLERACE_(\w+)", lambda m: "{}耐性 +{{v}}%".format(RACE[m[1]])),
    (r"RACE_DAMAGE_(\w+)", lambda m: "{}に物理 +{{v}}%".format(RACE[m[1]])),
    (r"RACE_MDAMAGE_(\w+)", lambda m: "{}に魔法 +{{v}}%".format(RACE[m[1]])),
    (r"RACE_CRI_PERCENT_(\w+)", lambda m: "{}へのクリティカル +{{v}}".format(RACE[m[1]])),
    (r"RACE_IGNORE_DEF_PERCENT_(\w+)", lambda m: "{}のDEF {{v}}%無視".format(RACE[m[1]])),
    (r"RACE_IGNORE_MDEF_PERCENT_(\w+)", lambda m: "{}のMDEF {{v}}%無視".format(RACE[m[1]])),
    (r"CLASS_DAMAGE_(\w+)_TARGET", lambda m: "{}に物理 +{{v}}%".format(CLS[m[1]])),
    (r"CLASS_DAMAGE_(\w+)_USER", lambda m: "{}から受けるダメージ -{{v}}%".format(CLS[m[1]])),
    (r"CLASS_MDAMAGE_(\w+)", lambda m: "{}に魔法 +{{v}}%".format(CLS[m[1]])),
    (r"CLASS_IGNORE_DEF_PERCENT_(\w+)", lambda m: "{}のDEF {{v}}%無視".format(CLS[m[1]])),
    (r"CLASS_IGNORE_MDEF_PERCENT_(\w+)", lambda m: "{}のMDEF {{v}}%無視".format(CLS[m[1]])),
    (r"DAMAGE_SIZE_(\w+)_TARGET", lambda m: "{}に物理 +{{v}}%".format(SIZE[m[1]])),
    (r"DAMAGE_SIZE_(\w+)_USER", lambda m: "{}から受ける物理 -{{v}}%".format(SIZE[m[1]])),
    (r"MDAMAGE_SIZE_(\w+)_TARGET", lambda m: "{}に魔法 +{{v}}%".format(SIZE[m[1]])),
    (r"MDAMAGE_SIZE_(\w+)_USER", lambda m: "{}から受ける魔法 -{{v}}%".format(SIZE[m[1]])),
    (r"ADDSKILLMDAMAGE_(\w+)", lambda m: "{}属性魔法ダメージ +{{v}}%".format(ELE[m[1]])),
    (r"ADDEXPPERCENT_KILLRACE_(\w+)", lambda m: "{}を倒したときの経験値 +{{v}}%".format(RACE[m[1]])),
]


def name_of(opt):
    if opt in FIXED:
        return FIXED[opt]
    if opt.startswith("VAR_") and opt[4:] in VAR:
        return VAR[opt[4:]]
    for pat, fn in PATTERNS:
        m = re.fullmatch(pat, opt)
        if m:
            try:
                r = fn(m)
            except KeyError:
                r = None
            if r:
                return r
    return None


def main(path):
    out = {}
    for x in yaml.safe_load(open(path, encoding="utf-8"))["Body"]:
        n = name_of(x["Option"])
        if n:
            out[str(x["Id"])] = n
    json.dump(out, sys.stdout, ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main(sys.argv[1])
