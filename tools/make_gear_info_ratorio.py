# -*- coding: utf-8 -*-
"""
gear_info.json を ラトリオ(jRO 準拠)のデータから作る。rAthena 版(make_gear_info.py)の代わり。

  python tools/make_gear_info_ratorio.py <ラトリオのフォルダ> [rAthena版のgear_info.json] > gear_info.json
    2つ目を渡すと、ラトリオに載っていないアイテムだけ rAthena 版(make_gear_info.py の出力)で補う

  使うファイル(ラトリオ):
    engine/equip/item.dat.js, card.dat.js … 装備・カードの効果(ラトリオ独自の番号 + 効果の番号と値)
    ro4/m/items_part*.json              … jRO のアイテムID と名前(ラトリオの番号とは名前でつなぐ)

  出力: {"アイテムID": {"de": 鎧の属性, "ae": 武器の属性, "re": {"属性": %},
                       "rr": [[精錬○以上, 精錬○ごと, "属性", %], ...],
                       "x": {"種族:悪魔": %, "ボス": %, "一般": %, "サイズ:大": %, "遠距離": %, "魔法": %},
                       "xr": [[精錬○以上, 精錬○ごと, "ボス", %], ...]}}
    x / xr … 属性のほかの「受けるダメージの軽減」(計算機の被ダメの検証用)
    re … 条件なしの属性耐性
    rr … 精錬値で決まる属性耐性。精錬が「○以上」なら 値 × (精錬 ÷ ○ごと の切り捨て)。○ごと が 0 なら 値 × 1
    職業・BaseLv・ステータスなど精錬以外の条件つき、セット効果は入らないので「目安」。

  ラトリオの効果の番号(engine/status/equipped-sp.js の読み方と同じ):
    番号 % 100000            … 効果の種類
    (番号 // 100000) % 10    … 精錬値が ○ 上がるごとに
    (番号 // 1000000) % 100  … 精錬値が ○ 以上のとき
    番号 // 100000000        … それ以外の条件(職業・BaseLv など) → 0 でなければ使わない
"""
import glob
import json
import os
import re
import sys

ELES = ("無", "水", "地", "火", "風", "毒", "聖", "闇", "念", "不死")   # ラトリオの ELM_ID と同じ並び
SP_ELEMENTAL = 20          # 武器の属性
SP_ARMS_ELEMENT = 229      # 武器の属性
SP_BODY_ELEMENT = 198      # 鎧の属性
SP_RESIST_ELM = range(60, 70)   # 無〜不死 の属性耐性
SP_RESIST_ELM_ALL = 264    # 全属性耐性
RACES = ("無形", "不死", "動物", "植物", "昆虫", "魚貝", "悪魔", "人間", "天使", "竜")   # EnumRaceId
SIZES = ("小", "中", "大")
# 属性のほかの軽減: 効果の番号 -> 軽減の名前(複数に効くものは並べる)
SP_EXTRA = dict([(50 + i, ["種族:" + r]) for i, r in enumerate(RACES)] + [(190 + i, ["サイズ:" + s]) for i, s in enumerate(SIZES)] + [
    (77, ["ボス"]), (79, ["一般"]), (78, ["遠距離"]), (196, ["魔法"]), (108, ["種族:人間"]),
    (263, ["種族:" + r for r in RACES]),
])

ITEM_NAME, ITEM_SP = 8, 11     # EnumItemDataIndex
CARD_NAME, CARD_SP = 2, 5      # EnumCardDataIndex

# ラトリオのデータがjROの説明文と違うもの(説明文が正しい)。キーはjROのアイテムID
_NOT_NEUTRAL = ("水", "地", "火", "風", "毒", "聖", "闇", "念", "不死")
JRO_FIX = {
    "5294": {"re": {"念": 10}},                                          # ウィスパーマスク: ラトリオは -10
    "22019": {"re": dict({"無": 3}, **{e: -3 for e in _NOT_NEUTRAL}),     # イミューンブーツ: 無属性以外 +3% と精錬が抜けている
              "rr": [[6, 1, "無", 1]]},
    "2168": {"re": dict({"無": 5}, **{e: -5 for e in _NOT_NEUTRAL}),      # イミューンシールド: 精錬の分が説明文だけ
             "rr": [[6, 1, "無", 1]]},
}

# ゲーム側の装備データと説明文から足した分。キーは項目ごとに上書きする(JRO_FIX は項目を丸ごと置き換える)。
# 4642〜4646 の「-50」は精錬11以上の分を打ち消す行(精錬10のときだけ +50 を、「○以上」の書き方で表すため)
CLIENT_FIX = {
    "1138": {"ae": "闇"},
    "1169": {"ae": "闇"},
    "1179": {"ae": "闇"},
    "4642": {"rr": [[0, 1, "不死", 5], [10, 0, "不死", 50], [11, 0, "不死", -50]]},
    "4643": {"rr": [[0, 1, "闇", 5], [10, 0, "闇", 50], [11, 0, "闇", -50]]},
    "4644": {"rr": [[0, 1, "念", 5], [10, 0, "念", 50], [11, 0, "念", -50]]},
    "4646": {"rr": [[0, 1, "毒", 5], [10, 0, "毒", 50], [11, 0, "毒", -50]]},
    "13080": {"re": {"水": 2, "火": -5}, "rr": [[7, 0, "水", 3]]},
    "13084": {"re": {"地": 2, "風": -5}, "rr": [[7, 0, "地", 3]]},
    "13085": {"re": {"水": -5, "火": 2}, "rr": [[7, 0, "火", 3]]},
    "13087": {"re": {"地": -5, "風": 2}, "rr": [[7, 0, "風", 3]]},
    "13338": {"ae": "風"},
    "13453": {"ae": "闇"},
    "20783": {"re": {"無": 1}, "rr": [[3, 3, "無", 3], [10, 0, "無", 20]]},
    "20818": {"re": {"不死": 5, "地": 5, "念": 5, "毒": 5, "水": 5, "火": 5, "無": 5, "聖": 5, "闇": 5, "風": 5}, "rr": [[7, 0, "水", 30], [7, 0, "風", 30]]},
    "26103": {"ae": "聖"},
    "28709": {"ae": "火"},
    "28762": {"ae": "火"},
    "29042": {"re": {"不死": 7, "地": 7, "念": 7, "毒": 7, "水": 7, "火": 7, "無": 7, "聖": 7, "闇": 7, "風": 7}},
    "29472": {"re": {"地": 15, "水": 15, "火": 15, "風": 15}},
    "300614": {"re": {"風": 25}, "rr": [[7, 0, "無", 15], [9, 0, "風", 25]]},
    "300812": {"re": {"火": 10, "聖": 10}},
    "300813": {"re": {"火": 50}},
    "300816": {"re": {"地": 15, "念": 15}},
    "300851": {"re": {"水": 5}},
    "300852": {"re": {"地": 5, "闇": 5}},
    "300855": {"re": {"火": 5}},
    "300870": {"re": {"闇": 25}},
    "300883": {"re": {"聖": 5}},
    "480074": {"re": {"水": 75}},
    "480549": {"re": {"火": 50, "無": 20}},
    "480550": {"re": {"水": 50, "聖": 50}},
    "480756": {"re": {"毒": 50, "闇": 50}},
}

# 行の書き方は2種類: 「[1,2,…],」(古い) と 「ItemObjNew[5461] = [5461,…];」(新しく足された分)
ROW_RE = re.compile(r"^\s*(?:[A-Za-z_]\w*\[\d+\]\s*=\s*)?(\[\d+,.*\])\s*[,;]?\s*$")
BIGINT_RE = re.compile(r"(?<=[,\[])(-?\d+)n(?=[,\]])")
EMPTY_RE = re.compile(r"([,\[])\s*,")


def read_rows(path):
    rows, bad = [], 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = ROW_RE.match(line)
            if not m:
                continue
            s = BIGINT_RE.sub(r"\1", m.group(1))      # JS の 123n(大きな整数) → 123
            while EMPTY_RE.search(s):
                s = EMPTY_RE.sub(r"\1null,", s)        # JS の [1,,2](空き) → [1,null,2]
            try:
                rows.append(json.loads(s))
            except ValueError:
                bad += 1
    return rows, bad


def effects(row, sp_begin):
    """行の [効果の番号, 値] を 0 が来るまで取り出す。"""
    out = []
    i = sp_begin
    while i + 1 < len(row) and isinstance(row[i], int) and row[i] != 0:
        out.append((row[i], row[i + 1]))
        i += 2
    return out


def attrs(effs):
    info = {}
    for code, val in effs:
        if not isinstance(val, (int, float)) or code < 0:
            continue
        if code // 100000000:
            continue
        sp = code % 100000
        by = (code // 100000) % 10
        over = (code // 1000000) % 100
        cond = by or over
        if sp in (SP_ELEMENTAL, SP_ARMS_ELEMENT) and not cond and 0 <= val < 10:
            info["ae"] = ELES[int(val)]
        elif sp == SP_BODY_ELEMENT and not cond and 0 <= val < 10:
            info["de"] = ELES[int(val)]
        elif sp in SP_RESIST_ELM or sp == SP_RESIST_ELM_ALL:
            eles = ELES if sp == SP_RESIST_ELM_ALL else (ELES[sp - 60],)
            for e in eles:
                if cond:
                    info.setdefault("rr", []).append([over, by, e, int(val)])
                else:
                    info.setdefault("re", {})[e] = info.get("re", {}).get(e, 0) + int(val)
        elif sp in SP_EXTRA:
            for k in SP_EXTRA[sp]:
                if cond:
                    info.setdefault("xr", []).append([over, by, k, int(val)])
                else:
                    info.setdefault("x", {})[k] = info.get("x", {}).get(k, 0) + int(val)
    return info


def norm(s):
    return re.sub(r"\s+", "", s or "").replace("　", "")


def load_jro_ids(folder):
    """jRO の名前 → アイテムID(同じ名前が複数あるときは全部)。カードは「〇〇カード」も別に覚える。"""
    by_name = {}
    for p in sorted(glob.glob(os.path.join(folder, "ro4", "m", "items_part*.json"))):
        with open(p, encoding="utf-8") as f:
            for it in json.load(f):
                n = norm(it.get("displayname"))
                if n:
                    by_name.setdefault(n, []).append(it["id"])
    return by_name


def lookup(by_name, raw, kind):
    name = norm(raw)
    for n in (name, re.sub(r"\[\d\]$", "", name)):      # ラトリオは「エクスキャリバー[3]」のようにスロット数が付くことがある
        ids = by_name.get(n) or (by_name.get(n + "カード") if kind == "カード" else None)
        if ids:
            return ids
    return None


def main(folder, rathena_path=None):
    sys.stdout.reconfigure(encoding="utf-8")     # Windows でも UTF-8 で書く
    sys.stderr.reconfigure(encoding="utf-8")
    by_name = load_jro_ids(folder)
    out, stats, covered = {}, {}, set()
    for kind, fn, ni, si in (("装備", "item.dat.js", ITEM_NAME, ITEM_SP), ("カード", "card.dat.js", CARD_NAME, CARD_SP)):
        rows, bad = read_rows(os.path.join(folder, "engine", "equip", fn))
        hit = miss = used = 0
        for row in rows:
            if len(row) <= si or not isinstance(row[ni], str) or not row[ni].strip():
                continue
            ids = lookup(by_name, row[ni], kind)
            covered.update(str(i) for i in ids or [])
            info = attrs(effects(row, si))
            if not info:
                continue
            used += 1
            if not ids:
                miss += 1
                continue
            hit += 1
            for iid in ids:
                out[str(iid)] = info
        stats[kind] = {"行": len(rows), "読めない行": bad, "属性の効果あり": used, "IDが見つかった": hit, "見つからない": miss}
    # ラトリオに載っていないアイテムだけ rAthena 版で補う
    added = 0
    if rathena_path:
        with open(rathena_path, encoding="utf-8") as f:
            for iid, info in json.load(f).items():
                if iid not in covered and iid not in out:
                    out[iid] = info
                    added += 1
    for iid, info in JRO_FIX.items():
        out[iid] = info
    for iid, info in CLIENT_FIX.items():
        out[iid] = {**out.get(iid, {}), **info}     # 同じ名前の別アイテムと中身を共有しないよう、新しい辞書にする
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    sys.stderr.write(json.dumps({"件数": len(out), "rAthenaで補った": added, "手直し": len(JRO_FIX), "足した分": len(CLIENT_FIX), "内訳": stats},
                                ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
