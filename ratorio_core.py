# -*- coding: utf-8 -*-
"""
ROラトリオHub(ステータス・ダメージ計算機)を、フォークから取り込んでこの PC に置く。

  置き場所: exe と同じフォルダの「ラトリオ」。画面サーバーが /ratorio/… として配る(計算機タブの中に表示)。
  取り込み元: GitHub の foxnine101-ux/ratorio(本家 roratorio-hub/ratorio のフォーク。本家の更新を取り込み、
              見た目の手直しだけを足す)。Fox の新しい版を出さなくても「ラトリオを更新」で届く。

  やり方(計算に要らない 167MB の ro4/m/items_part*.json を落とさないため、zip ではなくファイルごと):
    1. api.github.com/repos/<repo>/commits/<branch>            … いまの版(コミット)
    2. api.github.com/repos/<repo>/git/trees/<コミット>?recursive=1 … ファイルの一覧と中身の印(sha)
    3. raw.githubusercontent.com/<repo>/<コミット>/<パス>        … 変わったファイルだけ落とす
  ラトリオはビルド不要(ES modules をそのまま配る)なので、置くだけで動く。

  ライセンス: PolyForm Noncommercial 1.0.0(LICENSE も一緒に置く)。
"""
import json
import os
import shutil
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

REPO = "foxnine101-ux/ratorio"
BRANCH = "master"
# 計算機に要るものだけ(テスト・解析メモ・AI 用の巨大なアイテムデータは要らない)
WANT_PREFIX = ("engine/", "assets/", "lib/", "pages/")
WANT_FILES = ("index.html", "ro4/m/calcx.html", "LICENSE", "LICENSE_jp")
SKIP_EXT = (".xcf", ".md", ".ts", ".drawio", ".svg.bak")
ENTRY = "ro4/m/calcx.html"
MANIFEST = "_fox_manifest.json"
UA = {"User-Agent": "Fox_MD_Tracker", "Accept": "application/vnd.github+json"}
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png",
        ".jpg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".wasm": "application/wasm",
        ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"}


def wanted(path):
    if path.lower().endswith(SKIP_EXT):
        return False
    return path in WANT_FILES or path.startswith(WANT_PREFIX)


class Ratorio(object):
    def __init__(self, folder, repo=REPO, branch=BRANCH, log=print):
        self.folder, self.repo, self.branch, self.log = folder, repo, branch, log
        self.lock = threading.Lock()
        self.state = "idle"        # idle / checking / downloading / error
        self.progress = 0          # 0〜100
        self.error = ""
        self.latest = None         # {"commit", "date"}(確認できたとき)
        self.manifest = self._load_manifest()

    # ---------- いまの状態 ----------
    def _load_manifest(self):
        try:
            with open(os.path.join(self.folder, MANIFEST), "r", encoding="utf-8") as f:
                m = json.load(f)
            return m if os.path.exists(os.path.join(self.folder, *ENTRY.split("/"))) else None
        except (OSError, ValueError):
            return None

    def status(self):
        m = self.manifest or {}
        return {"installed": bool(self.manifest), "commit": (m.get("commit") or "")[:7], "date": m.get("date") or "",
                "files": len(m.get("files") or {}), "state": self.state, "progress": self.progress, "error": self.error,
                "latest": ({"commit": self.latest["commit"][:7], "date": self.latest["date"]} if self.latest else None),
                "newer": bool(self.latest and self.manifest and self.latest["commit"] != m.get("commit")),
                "repo": self.repo, "entry": "/ratorio/" + ENTRY}

    # ---------- 配る ----------
    def resolve(self, url_path):
        """/ratorio/ の後ろのパス → (ファイルの場所, 種類)。フォルダの外や無いファイルは None。"""
        rel = urllib.parse.unquote(url_path.split("?")[0].split("#")[0]).lstrip("/")
        if not rel or rel.endswith("/"):
            rel += "index.html"
        full = os.path.normpath(os.path.join(self.folder, *rel.split("/")))
        root = os.path.normpath(self.folder)
        if not (full == root or full.startswith(root + os.sep)) or os.path.basename(full) == MANIFEST or not os.path.isfile(full):
            return None
        return full, MIME.get(os.path.splitext(full)[1].lower(), "application/octet-stream")

    # ---------- 取り込み ----------
    def _get(self, url, timeout=30):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
            return r.read()

    def check(self):
        """フォークのいまの版を確かめる(取り込みはしない)。"""
        with self.lock:
            if self.state in ("checking", "downloading"):
                return self.status()
            self.state, self.error = "checking", ""
        try:
            c = json.loads(self._get("https://api.github.com/repos/{}/commits/{}".format(self.repo, self.branch)).decode("utf-8"))
            self.latest = {"commit": c["sha"], "date": (c.get("commit", {}).get("committer", {}).get("date") or "")[:10]}
            self.state = "idle"
        except Exception as e:
            self.state, self.error = "error", "確認できませんでした: {}".format(e)
        return self.status()

    def update(self, background=True):
        """フォークのいまの版を取り込む(変わったファイルだけ)。"""
        with self.lock:
            if self.state == "downloading":
                return self.status()
            self.state, self.progress, self.error = "downloading", 0, ""
        if background:
            threading.Thread(target=self._update, daemon=True).start()
        else:
            self._update()
        return self.status()

    def _update(self):
        try:
            c = json.loads(self._get("https://api.github.com/repos/{}/commits/{}".format(self.repo, self.branch)).decode("utf-8"))
            commit = c["sha"]
            date = (c.get("commit", {}).get("committer", {}).get("date") or "")[:10]
            self.latest = {"commit": commit, "date": date}
            tree = json.loads(self._get("https://api.github.com/repos/{}/git/trees/{}?recursive=1".format(self.repo, commit)).decode("utf-8"))
            want = {t["path"]: t["sha"] for t in tree.get("tree", []) if t.get("type") == "blob" and wanted(t["path"])}
            if ENTRY not in want:
                raise RuntimeError("計算機のファイルが見つかりません({})".format(ENTRY))
            have = (self.manifest or {}).get("files") or {}
            todo = [p for p, sha in want.items()
                    if have.get(p) != sha or not os.path.isfile(os.path.join(self.folder, *p.split("/")))]
            self.log("[ラトリオ] 取り込み: {} ({}) 全{}個のうち {}個を落とします".format(commit[:7], date, len(want), len(todo)))
            tmp = os.path.join(self.folder, "_tmp")
            shutil.rmtree(tmp, ignore_errors=True)
            done = [0]

            def fetch(p):
                url = "https://raw.githubusercontent.com/{}/{}/{}".format(self.repo, commit, urllib.parse.quote(p))
                last = None
                for _ in range(3):                     # うまく落ちないときは3回まで
                    try:
                        data = self._get(url, timeout=60)
                        break
                    except Exception as e:
                        last = e
                        time.sleep(1)
                else:
                    raise RuntimeError("{}: {}".format(p, last))
                dst = os.path.join(tmp, *p.split("/"))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with open(dst, "wb") as f:
                    f.write(data)
                done[0] += 1
                self.progress = int(done[0] * 100 / max(1, len(todo)))

            with ThreadPoolExecutor(max_workers=8) as ex:
                list(ex.map(fetch, todo))
            # 全部落とせてから入れ替える(途中で失敗しても、前の版がそのまま残る)
            for p in todo:
                dst = os.path.join(self.folder, *p.split("/"))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                os.replace(os.path.join(tmp, *p.split("/")), dst)
            for p in set(have) - set(want):            # 無くなったファイルは消す
                try:
                    os.remove(os.path.join(self.folder, *p.split("/")))
                except OSError:
                    pass
            shutil.rmtree(tmp, ignore_errors=True)
            self.manifest = {"repo": self.repo, "branch": self.branch, "commit": commit, "date": date,
                             "updated": int(time.time()), "files": want}
            with open(os.path.join(self.folder, MANIFEST), "w", encoding="utf-8") as f:
                json.dump(self.manifest, f, ensure_ascii=False)
            self.state, self.progress = "idle", 100
            self.log("[ラトリオ] 取り込みました: {} ({}) {}個".format(commit[:7], date, len(want)))
        except Exception as e:
            self.state, self.error = "error", "取り込めませんでした: {}".format(e)
            self.log("[ラトリオ]", self.error)


if __name__ == "__main__":
    import sys
    r = Ratorio(sys.argv[1])
    r.update(background=False)
    print(json.dumps(r.status(), ensure_ascii=False))
