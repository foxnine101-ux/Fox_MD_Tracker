"""公開の流れを1回で: 検査 → VERSION を上げる → release_notes.md → コミット → push → GitHub Actions の成功まで待つ。

使い方:  python tools/release.py <新しい版 例 2.37.6> <コミットのメッセージ(日本語)> --notes <公開メモのファイル>
  公開メモは先頭の行が見出し(「・…（v2.37.6）」)、続きが「  - …」の箇条書き。
  --dry-run: 検査だけして、何も書きかえない。
  変更のあるファイルは全部コミットされる(git add -A)ので、関係ないものは先に退けておくこと。
"""
import argparse, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
ATTR = "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"


def run(*cmd, check=True, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    if check and r.returncode:
        sys.exit("失敗: %s\n%s%s" % (" ".join(cmd), r.stdout, r.stderr))
    return r


ap = argparse.ArgumentParser()
ap.add_argument("version")
ap.add_argument("message")
ap.add_argument("--notes", required=True)
ap.add_argument("--dry-run", action="store_true")
a = ap.parse_args()
if not re.fullmatch(r"\d+\.\d+\.\d+", a.version):
    sys.exit("版は 2.37.6 の形で")

# 検査
run(sys.executable, "-m", "pyflakes", *[f for f in os.listdir(".") if f.endswith(".py")])
for f in sorted(os.listdir("web")):                       # 画面の中身(web/*.js)を1つずつ構文検査
    if f.endswith(".js"):
        run("node", "--check", os.path.join("web", f))
print("検査OK(pyflakes・web/*.js の構文)")
if a.dry_run:
    sys.exit(0)

# 最新を取り込んでから上げる
run("git", "pull", "--rebase", "--autostash")
src = open("md_tracker.py", encoding="utf-8").read()
src2, n = re.subn(r'^VERSION = "[\d.]+"', 'VERSION = "%s"' % a.version, src, count=1, flags=re.M)
if n != 1:
    sys.exit("md_tracker.py に VERSION が見つかりません")
open("md_tracker.py", "w", encoding="utf-8", newline="").write(src2)
open("release_notes.md", "w", encoding="utf-8").write(open(a.notes, encoding="utf-8").read().rstrip("\n") + "\n")
run("git", "add", "-A")
run("git", "-c", "user.name=Claude", "-c", "user.email=noreply@anthropic.com", "commit", "-q", "-m", "%s (v%s)\n\n%s" % (a.message, a.version, ATTR))
print(run("git", "push").stderr.strip())

# ビルドの成功まで待つ
import time
time.sleep(15)
rid = run("gh", "run", "list", "--limit", "1", "--json", "databaseId", "-q", ".[0].databaseId").stdout.strip()
r = run("gh", "run", "watch", rid, "--exit-status", check=False)
print(run("gh", "run", "list", "--limit", "1").stdout.strip())
sys.exit(r.returncode)
