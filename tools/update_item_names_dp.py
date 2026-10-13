"""Divine Pride の latestupdates から、jRO で最近更新されたアイテムの日本語名を item_names_fix.json に足す。

開発者(あなた)が手元で実行するツール。APIキーはアプリ(exe)には入れない・リポジトリにも書かない。
  set DP_API_KEY=キー         (Windows)  /  export DP_API_KEY=キー
  python tools/update_item_names_dp.py            # 何が足りないか表示するだけ
  python tools/update_item_names_dp.py --write    # item_names_fix.json に書く
  python tools/update_item_names_dp.py --start 2026-09-01   # 14日の窓の開始日(古いパッチを取るとき。窓ごとに繰り返す)

id2name.json(ラトリオ由来)にも item_names_fix.json にも無い番号だけ、1件ずつ詳細を取る(間隔 GAP 秒・429 は Retry-After を待つ)。
取りすぎないこと(Divine Pride の規約: 総当たりは不可。更新のあった番号だけ)。
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://www.divine-pride.net/api/database"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAP = 3.0
DETAIL_MAX = 150        # 1回の実行で詳細を取る上限


def get(path, params, key, tries=5):
    q = "&".join("{}={}".format(k, v) for k, v in dict(params, apiKey=key).items())
    req = urllib.request.Request(
        "{}/{}?{}".format(BASE, path, q),
        headers={"x-server": "jRO", "Accept-Language": "ja", "User-Agent": "Fox_MD_Tracker-tools/1.0 (personal)"})
    for _ in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get("Retry-After") or 30)
                print("  429 のため {} 秒待ちます".format(wait), file=sys.stderr)
                time.sleep(wait + 1)
                continue
            if e.code == 404:
                return None
            if e.code >= 500:
                print("  {} のため 15 秒待ちます".format(e.code), file=sys.stderr)
                time.sleep(15)
                continue
            raise
        except (TimeoutError, urllib.error.URLError, OSError) as e:
            print("  通信エラー({})のため 10 秒待ちます".format(e), file=sys.stderr)
            time.sleep(10)
    raise RuntimeError("429/5xx が続きました。少し置いてからやり直してください。")


def load(fn):
    with open(os.path.join(ROOT, fn), encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", help="窓の開始日 YYYY-MM-DD(省略すると14日前)")
    ap.add_argument("--write", action="store_true", help="item_names_fix.json に書く")
    a = ap.parse_args()
    key = os.environ.get("DP_API_KEY", "").strip()
    if not key:
        sys.exit("環境変数 DP_API_KEY にキーを入れてください。")

    known = set(load("id2name.json")) | set(load("item_names_fix.json"))
    p = {"type": "item"}
    if a.start:
        p["startDate"] = a.start
    d = get("latestupdates", p, key)
    ids = sorted({r["id"] for r in d["results"] if str(r["id"]) not in known})
    print("[jRO] {} 〜 {}: 更新 {} 件・名前表に無い {} 件".format(
        d["startDate"][:10], d["endDate"][:10], len(d["results"]), len(ids)))
    if len(ids) > DETAIL_MAX:
        print("  多いので先頭 {} 件だけ取ります(もう一度実行すると続きを取ります)".format(DETAIL_MAX))
        ids = ids[:DETAIL_MAX]

    got = {}
    try:
        for i in ids:
            time.sleep(GAP)
            det = get("Item/{}".format(i), {}, key) or {}
            name = (det.get("name") or "").strip()
            if name:
                got[str(i)] = name
                print("  {:>8}  {}".format(i, name))
            else:
                print("  {:>8}  (名前なし)".format(i))
    except Exception as e:      # 途中までの分は残す(もう一度実行すると続きを取る)
        print("中断しました: {}".format(e), file=sys.stderr)

    if a.write and got:
        fix = load("item_names_fix.json")
        fix.update(got)
        head = {k: v for k, v in fix.items() if k.startswith("_")}
        body = {k: fix[k] for k in sorted((k for k in fix if not k.startswith("_")), key=int)}
        with open(os.path.join(ROOT, "item_names_fix.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(dict(head, **body), f, ensure_ascii=False, indent=1)
            f.write("\n")
        print("item_names_fix.json に {} 件足しました".format(len(got)))
    elif got:
        print("(書いていません。--write を付けると item_names_fix.json に足します)")


if __name__ == "__main__":
    main()
