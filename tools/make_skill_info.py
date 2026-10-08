# -*- coding: utf-8 -*-
"""
skill_info.json を作る(被ダメの「種類(物理/魔法/固定)」「属性」用)。

  python tools/make_skill_info.py <rAthena の db/re/skill_db.yml> > skill_info.json

  出力: {"番号": [種類, 属性, 射程, 印]}
    種類 … "W"=物理 / "M"=魔法 / "X"=固定(その他) / ""=不明
    属性 … "無""水""地""火""風""毒""聖""闇""念""不死" / "武器"(使い手の武器の属性) / "付与" / "ランダム"
           Lv で変わるものは Lv ごとのリスト
    射程 … 数字(Lv で変わるものはリスト)。マイナスは「使い手の射程」
    印   … "T"=罠(いつも近接) / "S"=いつも近接 / "L"=いつも遠距離 / "I"=属性を無視
"""
import json
import sys

import yaml

ELE = {"Neutral": "無", "Water": "水", "Earth": "地", "Fire": "火", "Wind": "風", "Poison": "毒",
       "Holy": "聖", "Dark": "闇", "Ghost": "念", "Undead": "不死", "Weapon": "武器", "Endowed": "付与",
       "Random": "ランダム", "None": "無"}
TYPE = {"Weapon": "W", "Magic": "M", "Misc": "X"}
# battle.cpp battle_range_type() で決め打ちになっているもの(モンスターが使ったとき)
ALWAYS_SHORT = {"AC_SHOWER", "AM_DEMONSTRATION", "NJ_KIRIKAGE", "GC_CROSSIMPACT", "DK_SERVANT_W_PHANTOM",
                "SHC_SAVAGE_IMPACT", "SHC_FATAL_SHADOW_CROW", "MT_RUSH_QUAKE", "MT_RUSH_STRIKE",
                "ABC_UNLUCKY_RUSH", "ABC_CHASING_BREAK", "MH_THE_ONE_FIGHTER_RISES", "NPC_MAXPAIN_ATK",
                "SS_SHIMIRU", "SKE_STAR_LIGHT_KICK"}
ALWAYS_LONG = {"KN_BRANDISHSPEAR", "SR_RAMPAGEBLASTER", "BO_ACIDIFIED_ZONE_WATER_ATK", "BO_ACIDIFIED_ZONE_FIRE_ATK",
               "BO_ACIDIFIED_ZONE_GROUND_ATK", "BO_ACIDIFIED_ZONE_WIND_ATK", "NW_THE_VIGILANTE_AT_NIGHT",
               "SS_KUNAIKAITEN", "SS_KUNAIKUSSETSU", "SS_HITOUAKUMU"}


def per_level(v, key):
    if isinstance(v, list):
        out = [x.get(key) for x in sorted(v, key=lambda x: x.get("Level", 0))]
        return out[0] if len(set(map(str, out))) == 1 else out
    return v


def main(path):
    body = yaml.safe_load(open(path, encoding="utf-8"))["Body"]
    out = {}
    for s in body:
        ele = per_level(s.get("Element", "None"), "Element")
        ele = [ELE.get(e, "無") for e in ele] if isinstance(ele, list) else ELE.get(ele or "None", "無")
        rng = per_level(s.get("Range", 0), "Size")
        mark = ""
        if (s.get("Flags") or {}).get("IsTrap"):
            mark += "T"
        if s.get("Name") in ALWAYS_SHORT:
            mark += "S"
        if s.get("Name") in ALWAYS_LONG:
            mark += "L"
        if (s.get("DamageFlags") or {}).get("IgnoreElement"):
            mark += "I"
        out[str(s["Id"])] = [TYPE.get(s.get("Type"), ""), ele, rng if rng is not None else 0, mark]
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1])
