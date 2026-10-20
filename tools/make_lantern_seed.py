# -*- coding: utf-8 -*-
"""
ランタンの座標の一覧を、アプリに同梱する形(lantern_seed.bin)にする。

  python tools/make_lantern_seed.py <CSV/TSV のファイル or フォルダ> [...] > 出力は lantern_seed.bin(リポジトリ直下)に書く

  - 入力 = スプレッドシートの各シートを CSV にしたもの(番号・マップ名・X・Y・備考)。複数のファイルを渡すと、番号で合流する。
  - 出力 = zlib で圧縮した JSON({"v":1, "items":[{n,map,x,y,memo}…]})。リポジトリの画面で文字としては読めない形(暗号ではない)。
  - アプリは、「ランタンハント.json」(利用者が取り込んだもの)が無いときだけ、これを初期値に使う。利用者の取り込みが優先。
"""
import glob
import json
import os
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import lantern_core  # noqa: E402


def main(args):
    sys.stdout.reconfigure(encoding="utf-8")
    files = []
    for a in args:
        files += sorted(glob.glob(os.path.join(a, "*.csv"))) if os.path.isdir(a) else [a]
    if not files:
        sys.exit("CSV のファイル(またはフォルダ)を渡してください")
    text = "\n".join(open(f, encoding="utf-8").read() for f in files)
    items = lantern_core.parse_text(text)
    if not items:
        sys.exit("座標を読めませんでした")
    out = os.path.join(ROOT, "lantern_seed.bin")
    with open(out, "wb") as f:
        f.write(zlib.compress(json.dumps({"v": 1, "items": items}, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9))
    nums = [x["n"] for x in items]
    print("{} か所({}〜{})→ {} ({} バイト)".format(len(items), nums[0], nums[-1], out, os.path.getsize(out)))


if __name__ == "__main__":
    main(sys.argv[1:])
