# -*- coding: utf-8 -*-
"""Divine Pride から、実際に出会ったモンスターだけ情報を取って、アプリに同梱する小さな表 dp_mobs.json を作る。

開発者(あなた)が手元で実行するツール。キーはリポジトリ直下の api.txt(.gitignore 済み)か環境変数 DP_API_KEY。
  python tools/dp_mobs.py --data <被ダメ記録.json のあるフォルダ> --limit 30          # 何を取るか表示だけ
  python tools/dp_mobs.py --data <フォルダ> --limit 30 --fetch                        # 取って tools/dp_cache/ に保存(取り終えたものは取り直さない)
  python tools/dp_mobs.py --build                                                     # 保存したものから dp_mobs.json を作る

Divine Pride の API ドキュメント(Usage Guidelines)に合わせる: 個人用・結果は保存して再取得しない・429 は待つ・
**DB 全体のコピーや ID の総当たりはしない**(取るのは「出会ったモンスターの番号」だけ。1回 --limit 件まで)。
同梱するのは、アプリで使う項目だけ(説明文・ドロップ・出現マップ・画像のURLは入れない)。
"""
import argparse
import glob
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import update_item_names_dp as dp  # noqa: E402  (get / 間隔 GAP を共有)

CACHE = os.path.join(HERE, "dp_cache", "monster")
OUT = os.path.join(ROOT, "dp_mobs.json")
KEEP = ("name", "spriteName", "level", "race", "element", "elementLevel", "size", "type", "health",
        "def", "mDef", "res", "mRes", "hit", "flee")


def api_key():
    k = os.environ.get("DP_API_KEY", "").strip()
    if not k:
        try:
            with open(os.path.join(ROOT, "api.txt"), encoding="utf-8-sig") as f:
                k = f.readline().strip()
        except OSError:
            pass
    return k


def wanted(data_dir, limit):
    """出会ったモンスターの番号。既存のデータ(ラトリオの mob_info.json)に名前が無いものを先に、そのあとは新しいコンテンツ(大きい番号)から。"""
    with open(os.path.join(data_dir, "被ダメ記録.json"), encoding="utf-8") as f:
        d = json.load(f)
    with open(os.path.join(ROOT, "mob_info.json"), encoding="utf-8") as f:
        known = set(json.load(f))
    skip = ("進入不可", "名前の無い相手")
    cls = {int(k): v for k, v in (d.get("cls_name") or {}).items() if v not in skip}
    first = sorted(c for c, n in cls.items() if n not in known)
    rest = sorted((c for c in cls if c not in set(first)), reverse=True)
    have = {int(os.path.basename(p)[:-5]) for p in glob.glob(os.path.join(CACHE, "*.json"))}
    todo = [c for c in first + rest if c not in have]
    return todo[:limit], cls, len(have), len(first)


def slim(full):
    s = {k: full.get(k) for k in KEEP if full.get(k) is not None}
    s["skills"] = [[x.get("skillId"), x.get("skillName")] for x in (full.get("skills") or []) if x.get("skillId")]
    return s


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", help="被ダメ記録.json のあるフォルダ(読むだけ)")
    ap.add_argument("--limit", type=int, default=30)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--build", action="store_true")
    a = ap.parse_args()
    if a.build:
        out = {}
        for p in sorted(glob.glob(os.path.join(CACHE, "*.json"))):
            with open(p, encoding="utf-8") as f:
                out[os.path.basename(p)[:-5]] = slim(json.load(f))
        out = {k: out[k] for k in sorted(out, key=int)}
        with open(OUT, "w", encoding="utf-8", newline="\n") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        print("dp_mobs.json: {} 件・{} バイト".format(len(out), os.path.getsize(OUT)))
        return
    if not a.data:
        sys.exit("--data か --build を指定してください")
    todo, cls, have, nmd = wanted(a.data, a.limit)
    print("出会った番号 {} 件(うち既存のデータに名前が無い {} 件)・保存ずみ {} 件 → 今回取る {} 件".format(len(cls), nmd, have, len(todo)))
    for c in todo:
        print("  {:>6}  {}".format(c, cls.get(c)))
    if not a.fetch:
        print("(取っていません。--fetch を付けると取ります)")
        return
    key = api_key()
    if not key:
        sys.exit("api.txt か環境変数 DP_API_KEY にキーを入れてください。")
    os.makedirs(CACHE, exist_ok=True)
    n = 0
    try:
        for c in todo:
            time.sleep(dp.GAP)
            full = dp.get("Monster/{}".format(c), {}, key)
            if not full:
                print("  {:>6}  (見つからない)".format(c))
                full = {"id": c, "_notfound": True}
            with open(os.path.join(CACHE, "{}.json".format(c)), "w", encoding="utf-8") as f:
                json.dump(full, f, ensure_ascii=False)
            n += 1
            print("  {:>6}  {}  Lv{} HP{}".format(c, full.get("name"), full.get("level"), full.get("health")))
    except Exception as e:      # 取れた分は残る。もう一度実行すると続きを取る
        print("中断しました:", e, file=sys.stderr)
    print("{} 件を保存しました({})".format(n, CACHE))


if __name__ == "__main__":
    main()
