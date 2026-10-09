# -*- coding: utf-8 -*-
"""
gear_info.json を ラトリオ(jRO 準拠)のデータから作る。rAthena 版(make_gear_info.py)の代わり。

  python tools/make_gear_info_ratorio.py <ラトリオのフォルダ> [rAthena版のgear_info.json] > gear_info.json
    2つ目を渡すと、ラトリオに載っていないアイテムだけ rAthena 版(make_gear_info.py の出力)で補う

  使うファイル(ラトリオ):
    engine/equip/item.dat.js, card.dat.js … 装備・カードの効果(ラトリオ独自の番号 + 効果の番号と値)
    ro4/m/items_part*.json              … jRO のアイテムID と名前(ラトリオの番号とは名前でつなぐ)

  出力: {"アイテムID": {"de": 鎧の属性, "ae": 武器の属性, "re": {"属性": %},
                       "rr": [[精錬○以上, 精錬○ごと, "属性", %], ...]}}
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

ROW_RE = re.compile(r"^\s*(\[\d+,.*\])\s*,?\s*$")
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
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    sys.stderr.write(json.dumps({"件数": len(out), "rAthenaで補った": added, "手直し": len(JRO_FIX), "内訳": stats},
                                ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
