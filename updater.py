# -*- coding: utf-8 -*-
"""
アップデート(新しい Fox_MD_Tracker.exe を受け取って入れ替える)。

  - GitHub の「リリース」に置かれた最新版を見に行く(公開リポジトリなのでログイン不要)
      https://api.github.com/repos/<リポジトリ>/releases/latest
  - 新しい版があれば知らせる → 「アップデート」で
      1) Fox_MD_Tracker.new.exe にダウンロード
      2) 小さいバッチ(Fox_MD_Tracker_update.bat)を黒い画面なしで起動して、このアプリを終了
      3) バッチが exe を入れ替えて、新しい exe を起動する
  - exe で動いているとき(PyInstaller)だけ使える。python で直接動かしているときは確認だけ。
"""
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.request

DEFAULT_REPO = "foxnine101-ux/Fox_MD_Tracker"
ASSET_NAME = "Fox_MD_Tracker.exe"
ASSET_OLD = "MDTracker.exe"   # 改名前の名前(古い版のリリース用)
CHECK_EVERY = 6 * 3600


def vtuple(v):
    """"v2.1.0" → (2, 1, 0)"""
    nums = re.findall(r"\d+", str(v or ""))
    return tuple(int(x) for x in nums[:4]) or (0,)


def _same_exe(pid, exe):
    """pid のプロセスが同じ exe ファイルかどうか(Windows)。わからなければ False。"""
    try:
        import ctypes
        from ctypes import wintypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x1000, False, pid)        # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        try:
            buf = ctypes.create_unicode_buffer(1024)
            n = wintypes.DWORD(1024)
            if not k.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(n)):
                return False
            return os.path.normcase(os.path.abspath(buf.value)) == os.path.normcase(os.path.abspath(exe))
        finally:
            k.CloseHandle(h)
    except Exception:
        return False


class Updater(object):
    def __init__(self, version, repo=None, folder=None, log=print, on_found=None):
        self.version = version
        self.repo = (repo or DEFAULT_REPO).strip().strip("/")
        self.folder = folder or os.path.dirname(os.path.abspath(sys.executable))
        self.log = log
        self.on_found = on_found or (lambda info: None)
        self.latest = None          # {"version", "url", "size", "notes", "page"}
        self.state = "idle"         # idle / checking / none / available / downloading / ready / error
        self.error = ""
        self.progress = 0
        self.last_check = 0
        self.lock = threading.Lock()

    def cleanup(self):
        """前回のアップデートの残り(.new.exe / _update.bat)を片付ける。"""
        for n in ("Fox_MD_Tracker.new.exe", "MDTracker.new.exe", "MDTracker_update.bat"):
            p = os.path.join(self.folder, n)
            try:
                if os.path.exists(p):
                    os.remove(p)
                    self.log("[アップデート] 前回の残りを片付けました: " + n)
            except OSError:
                pass

    @staticmethod
    def frozen():
        return bool(getattr(sys, "frozen", False)) and os.name == "nt"

    def status(self):
        return {"current": self.version, "state": self.state, "error": self.error, "progress": self.progress,
                "latest": self.latest, "can_install": self.frozen(), "repo": self.repo}

    # ---------------- 確認 ----------------
    def check(self):
        with self.lock:
            if self.state in ("downloading", "ready"):
                return self.status()
            self.state, self.error = "checking", ""
        try:
            req = urllib.request.Request("https://api.github.com/repos/{}/releases/latest".format(self.repo),
                                         headers={"User-Agent": "Fox_MD_Tracker/" + self.version,
                                                  "Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=15) as r:
                rel = json.loads(r.read().decode("utf-8"))
            ver = rel.get("tag_name") or rel.get("name") or ""
            assets = rel.get("assets", [])
            asset = next((a for a in assets if a.get("name") == ASSET_NAME), None) or \
                next((a for a in assets if a.get("name") == ASSET_OLD), None)
            info = {"version": ver.lstrip("vV"), "notes": (rel.get("body") or "")[:2000],
                    "page": rel.get("html_url"), "url": asset and asset.get("browser_download_url"),
                    "size": asset and asset.get("size")}
            self.last_check = time.time()
            if vtuple(info["version"]) > vtuple(self.version) and info["url"]:
                was = self.latest and self.latest.get("version")
                self.latest, self.state = info, "available"
                if was != info["version"]:
                    self.log("[アップデート] 新しい版があります: v{} (いまは v{})".format(info["version"], self.version))
                    self.on_found(info)
            else:
                self.latest, self.state = info, "none"
        except urllib.error.HTTPError as e:
            self.state = "error"
            self.error = "まだ公開された版がありません" if e.code == 404 else "確認できませんでした (HTTP {})".format(e.code)
        except Exception as e:
            self.state, self.error = "error", "確認できませんでした: {}".format(e)
        return self.status()

    def start_background(self, stop_event):
        def loop():
            time.sleep(20)                       # 起動直後は少し待つ
            while not stop_event.is_set():
                self.check()
                if stop_event.wait(CHECK_EVERY):
                    break
        threading.Thread(target=loop, daemon=True).start()

    # ---------------- 入れ替え ----------------
    def download_and_install(self, quit_app):
        """ダウンロード → 入れ替え用バッチを起動 → quit_app() でこのアプリを終える。"""
        if not self.frozen():
            self.state, self.error = "error", "exe で動かしているときだけアップデートできます"
            return self.status()
        if not (self.latest and self.latest.get("url")):
            self.check()
            if self.state != "available":
                return self.status()
        with self.lock:
            if self.state in ("downloading", "ready"):
                return self.status()
            self.state, self.progress, self.error = "downloading", 0, ""
        threading.Thread(target=self._install, args=(quit_app,), daemon=True).start()
        return self.status()

    def _install(self, quit_app):
        exe = os.path.abspath(sys.executable)
        new = os.path.join(self.folder, "Fox_MD_Tracker.new.exe")
        try:
            req = urllib.request.Request(self.latest["url"], headers={"User-Agent": "Fox_MD_Tracker/" + self.version})
            with urllib.request.urlopen(req, timeout=60) as r, open(new, "wb") as f:
                total = int(r.headers.get("Content-Length") or self.latest.get("size") or 0)
                got = 0
                while True:
                    chunk = r.read(256 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    got += len(chunk)
                    if total:
                        self.progress = int(got * 100 / total)
            size = os.path.getsize(new)
            if size < 1000000 or (self.latest.get("size") and size != self.latest["size"]):
                raise ValueError("ダウンロードが途中で切れたみたい({}バイト)".format(size))
            with open(new, "rb") as f:
                if f.read(2) != b"MZ":
                    raise ValueError("exe ではないファイルでした")
            bat = os.path.join(self.folder, "Fox_MD_Tracker_update.bat")
            log = os.path.join(self.folder, "アップデートログ.txt")
            pids = [os.getpid()]
            try:
                pp = os.getppid()          # exe(1つにまとめた形)は「親+子」の2つで動いている
                if pp and pp != os.getpid() and _same_exe(pp, exe):
                    pids.append(pp)        # 親も同じ exe のときだけ待つ(エクスプローラー等は絶対に止めない)
            except Exception:
                pass
            # 黒い画面なしで動くので timeout は使えない → ping で1秒ずつ待つ
            sleep1 = "ping -n 2 127.0.0.1 > nul"
            lines = ["@echo off",
                     "rem Fox_MD_Tracker のアップデート(自動で作られて、終わったら消えます)",
                     'echo %date% %time% アップデート開始 >> "{}"'.format(log)]
            for pid in pids:
                lines += ["set n=0",
                          ":wait{}".format(pid),
                          'tasklist /FI "PID eq {0}" 2> nul | find " {0} " > nul || goto gone{0}'.format(pid),
                          "set /a n+=1",
                          'if %n% geq 25 (echo 終わらないので止めます {0} >> "{1}" & taskkill /F /PID {0} >> "{1}" 2>&1 & goto gone{0})'.format(pid, log),
                          sleep1,
                          "goto wait{}".format(pid),
                          ":gone{}".format(pid)]
            lines += ["set n=0",
                      ":retry",
                      'move /y "{}" "{}" >> "{}" 2>&1 && goto moved'.format(new, exe, log),
                      "set /a n+=1",
                      'if %n% geq 30 (echo 入れ替えできませんでした >> "{}" & goto start)'.format(log),
                      sleep1,
                      "goto retry",
                      ":moved",
                      'echo 入れ替えました >> "{}"'.format(log),
                      ":start",
                      'start "" "{}"'.format(exe),
                      'del "%~f0"',
                      ""]
            with open(bat, "w", encoding="cp932", errors="replace") as f:
                f.write("\r\n".join(lines))
            self.state, self.progress = "ready", 100
            self.log("[アップデート] v{} をダウンロードしました。入れ替えて起動し直します".format(self.latest["version"]))
            flags = 0x08000000 | 0x00000008     # 黒い画面を出さない / 親と切り離す
            subprocess.Popen(["cmd", "/c", bat], cwd=self.folder, creationflags=flags, close_fds=True)
            time.sleep(0.5)
            # 終わりきらないことがあるので、少し待っても残っていたら強制的に終える
            threading.Timer(8, lambda: os._exit(0)).start()
            try:
                quit_app()
            except Exception:
                pass
        except Exception as e:
            self.state, self.error = "error", "アップデートできませんでした: {}".format(e)
            self.log("[アップデート] " + self.error)
            try:
                os.remove(new)
            except OSError:
                pass
