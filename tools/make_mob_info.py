# -*- coding: utf-8 -*-
"""
mob_info.json を ラトリオ(jRO 準拠)のモンスターデータから作る(被ダメの「相手」の種族・サイズ・属性など)。

  python tools/make_mob_info.py <ラトリオのフォルダ> > mob_info.json

  使うファイル: engine/monster/monster.dat.js
  出力: {"名前": {"lv": Lv, "hp": HP, "race": 種族, "size": サイズ, "ele": "闇4", "boss": 1/0}}
    ゲームのモンスター番号はラトリオに無いので、通信で出てくる名前でつなぐ。
    同じ名前で中身が違うもの(MD ごとの強さ違いなど)は「185/250」のように / でつなぐ。
    「スケゴルトブラウン（取り巻き）」のような後ろの（）は外した名前でも引けるようにする(元の名前が無いときだけ)。
"""
import json
import re
import sys

ELES = ("無", "水", "地", "火", "風", "毒", "聖", "闇", "念", "不死")          # EnumElmId
RACES = ("無形", "不死", "動物", "植物", "昆虫", "魚貝", "悪魔", "人間", "天使", "竜")   # EnumRaceId
SIZES = ("小", "中", "大")                                                   # EnumSizeId
# EnumMonsterDataIndex
I_NAME, I_LV, I_HP, I_SIZE, I_ELE, I_RACE, I_BOSS = 1, 2, 3, 17, 18, 19, 20
FIELDS = ("lv", "hp", "race", "size", "ele", "boss")

ROW_RE = re.compile(r"^\s*(\[\d+,.*\])\s*,?\s*$")
EMPTY_RE = re.compile(r"([,\[])\s*,")
SUFFIX_RE = re.compile(r"[（(][^（）()]*[）)]$")


def read_rows(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = ROW_RE.match(line)
            if not m:
                continue
            s = m.group(1)
            while EMPTY_RE.search(s):
                s = EMPTY_RE.sub(r"\1null,", s)      # JS の [1,,2](空き) → [1,null,2]
            s = re.sub(r",\s*\]$", "]", s)           # 最後の , を外す
            try:
                rows.append(json.loads(s))
            except ValueError:
                pass
    return rows


def info_of(r):
    e = r[I_ELE]
    return {"lv": r[I_LV], "hp": r[I_HP], "race": RACES[r[I_RACE]] if 0 <= r[I_RACE] < 10 else "",
            "size": SIZES[r[I_SIZE]] if 0 <= r[I_SIZE] < 3 else "",
            "ele": "{}{}".format(ELES[e // 10], e % 10) if 0 <= e // 10 < 10 else "", "boss": 1 if r[I_BOSS] == 1 else 0}


def merge(infos):
    """同じ名前のものをまとめる。値が違う項目は / でつなぐ(並びは Lv の低い順)。"""
    infos = sorted(infos, key=lambda x: (x["lv"], x["hp"]))
    out = {}
    for k in FIELDS:
        vals = []
        for i in infos:
            if i[k] not in vals:
                vals.append(i[k])
        out[k] = vals[0] if len(vals) == 1 else "/".join(str(v) for v in vals)
    return out


def main(folder):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    by = {}
    for r in read_rows(folder.rstrip("/\\") + "/engine/monster/monster.dat.js"):
        name = (r[I_NAME] or "").strip() if isinstance(r[I_NAME], str) else ""
        if not name or name.startswith(("(×)", "(仮)")):     # 未実装・仮のもの
            continue
        by.setdefault(name, []).append(info_of(r))
    # 後ろの（）を外した名前(元の名前が無いときだけ)
    alias = {}
    for name, infos in by.items():
        base = name
        while SUFFIX_RE.search(base):
            base = SUFFIX_RE.sub("", base).strip()
        if base and base != name and base not in by:
            alias.setdefault(base, []).extend(infos)
    out = {n: merge(v) for n, v in list(by.items()) + list(alias.items())}
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    sys.stderr.write(json.dumps({"件数": len(out), "名前": len(by), "（）を外した名前": len(alias),
                                 "同じ名前で中身違い": sum(1 for v in out.values() if isinstance(v["lv"], str))},
                                ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
