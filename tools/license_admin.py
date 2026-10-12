"""利用キーの発行・停止・一覧(管理者用)。
使い方:  python tools/license_admin.py issue "名前" [台数]  /  revoke <キー>  /  restore <キー>  /  release <キー> <pcid>  /  list
URL は license_core.LICENSE_URL、管理トークンは 環境変数 FOX_ADMIN_TOKEN か 管理トークン.txt(git に入れない)。
"""
import json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import license_core


def call(path, body):
    tok = os.environ.get("FOX_ADMIN_TOKEN")
    if not tok:
        tok = open(os.path.join(os.path.dirname(license_core.__file__), "管理トークン.txt"), encoding="utf-8").read().strip()
    req = urllib.request.Request(license_core.LICENSE_URL.rstrip("/") + path, json.dumps(body).encode("utf-8"),
                                 {"Content-Type": "application/json", "Authorization": "Bearer " + tok, "User-Agent": "Fox_MD_Tracker"})
    return json.loads(urllib.request.urlopen(req, timeout=20).read().decode("utf-8"))


def main(a):
    if not license_core.LICENSE_URL:
        sys.exit("license_core.LICENSE_URL が空です(先にサーバーを作って URL を入れてください)")
    c = a[0] if a else ""
    if c == "issue":
        r = call("/admin/issue", {"name": a[1], "limit": int(a[2]) if len(a) > 2 else 2})
        print("キー:", r["key"], "/ 名前:", r["name"], "/ 台数:", r["limit"])
    elif c in ("revoke", "restore"):
        print(call("/admin/" + c, {"key": a[1]}))
    elif c == "release":
        print(call("/admin/release", {"key": a[1], "pcid": a[2]}))
    elif c == "list":
        for r in call("/admin/list", {})["rows"]:
            print(r["key"], r["status"], r["name"], "{}/{}台".format(len(r["pcs"]), r["limit"]), [p["pcname"] for p in r["pcs"]])
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
