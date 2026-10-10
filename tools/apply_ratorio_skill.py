# -*- coding: utf-8 -*-
"""
skill_info.json(rAthena の skill_db から作った 種類・属性・射程・印)を、ラトリオ(jRO 準拠)のスキル定義で上書きする。

  python tools/apply_ratorio_skill.py <ラトリオのフォルダ> [--write]
    --write を付けないと、変わる所を出すだけ(skill_info.json は書きかえない)。

  ラトリオの engine/skill/**/*.js の defineSkill(…) から、スキル名ごとに
    type    … TYPE_PHYSICAL / TYPE_MAGICAL
    range   … RANGE_SHORT(近接) / RANGE_LONG(遠距離) / RANGE_MAGIC / RANGE_SPECIAL
    element … ELEMENT_FORCE_〇〇(属性を決め打ち)
  を読み、スキル名(skill_names.json = ラトリオの名前)でゲームのスキル番号につなぐ。

  上書きのきまり(ラトリオに情報があるものだけ。make_skill_info.py の JRO_FIX は実測なので変えない):
    種類 … Fox が不明("")ならラトリオで埋める。物理と魔法で食い違えばラトリオ。
           Fox の固定("X")は残す(ラトリオには「固定」の区分が無く、物理に入れているだけ)
    属性 … ラトリオが決め打ちしているものはラトリオ
    印   … 物理でラトリオが 近接/遠距離 を決めているものは S / L(罠の T と、属性を無視の I は残す)
  ラトリオにあるのはプレイヤーのスキルだけ(モンスター専用の「M〇〇」などは変わらない)。
"""
import collections
import glob
import json
import os
import re
import sys

ELE = {"FORCE_VANITY": "無", "FORCE_WATER": "水", "FORCE_EARTH": "地", "FORCE_FIRE": "火", "FORCE_WIND": "風",
       "FORCE_POISON": "毒", "FORCE_HOLY": "聖", "FORCE_DARK": "闇", "FORCE_PSYCO": "念", "FORCE_UNDEAD": "不死"}
KEEP = {"736"}          # make_skill_info.py の JRO_FIX(実際に受けて確かめたもの)


def read_ratorio(folder):
    out = {}
    for p in glob.glob(os.path.join(folder, "engine", "skill", "**", "*.js"), recursive=True):
        with open(p, encoding="utf-8") as f:
            s = f.read()
        for m in re.finditer(r"defineSkill\((\w+),\s*function\s*\(\)\s*\{(.*?)\n\t\t\}\)", s, re.S):
            body = m.group(2)
            nm = re.search(r'this\.name\s*=\s*"([^"]*)"', body)
            ty = re.search(r"this\.type\s*=\s*([^;]+);", body)
            if not nm or not ty or "TYPE_PASSIVE" in ty.group(1):
                continue
            rg = re.search(r"this\.range\s*=\s*CSkillData\.RANGE_(\w+)", body)
            el = re.search(r"this\.element\s*=\s*CSkillData\.ELEMENT_(\w+)", body)
            kind = "M" if "TYPE_MAGICAL" in ty.group(1) else "W" if "TYPE_PHYSICAL" in ty.group(1) else ""
            if kind:
                out[nm.group(1)] = {"kind": kind, "range": rg.group(1) if rg else "", "ele": ELE.get(el.group(1)) if el else None}
    return out


def main(folder, write):
    sys.stdout.reconfigure(encoding="utf-8")
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(here, "skill_names.json"), encoding="utf-8") as f:
        names = json.load(f)
    with open(os.path.join(here, "skill_info.json"), encoding="utf-8") as f:
        info = json.load(f)
    rat = read_ratorio(folder)
    by_name = collections.defaultdict(list)
    for sid, nm in names.items():
        by_name[nm].append(sid)
    changes = collections.defaultdict(list)
    for nm, r in rat.items():
        for sid in by_name.get(nm, []):
            if sid in KEEP or sid not in info:
                continue
            kind, ele, rng, mark = (info[sid] + ["", "", 0, ""])[:4]
            new_kind, new_ele, new_mark = kind, ele, mark
            if kind == "" or (kind in "WM" and kind != r["kind"]):
                new_kind = r["kind"]
            if r["ele"] and ele != r["ele"]:
                new_ele = r["ele"]
            if new_kind == "W" and r["range"] in ("SHORT", "LONG") and "T" not in mark:
                new_mark = "".join(c for c in mark if c not in "SL") + ("S" if r["range"] == "SHORT" else "L")
            if new_kind != kind:
                changes["種類"].append((sid, nm, kind or "不明", new_kind))
            if new_ele != ele:
                changes["属性"].append((sid, nm, ele if isinstance(ele, str) else "/".join(dict.fromkeys(ele)), new_ele))
            if new_mark != mark:
                changes["近接・遠距離"].append((sid, nm, "射程{} 印{}".format(rng, mark or "-"), new_mark))
            info[sid] = [new_kind, new_ele, rng, new_mark]
    for k, v in changes.items():
        print("■ {} {}件".format(k, len(v)))
        for x in v:
            print("   {} {}: {} → {}".format(*x))
    if write:
        with open(os.path.join(here, "skill_info.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(info, f, ensure_ascii=False, separators=(",", ":"))
        print("skill_info.json を書きかえました")


if __name__ == "__main__":
    main(sys.argv[1], "--write" in sys.argv)
