# -*- coding: utf-8 -*-
"""
タスクトレイ(画面右下)に常駐するための部品。
  - 黒い画面(コンソール)なしで動かすときに使う
  - アイコンを右クリック → 画面を開く / 耐性リアルタイム(開発版のみ) / ログ / フォルダ / 自動起動 / 終了
pystray と Pillow が無いときは何もしない(コンソール版はそのまま動く)。
"""
import os
import sys
import threading
import webbrowser

try:
    import pystray
    from PIL import Image
except Exception:          # 部品が無い → トレイなし
    pystray = None


def message(text, title="Fox_MD_Tracker", kind="info", yesno=False):
    """Windowsの小さいお知らせ窓。はい/いいえ を聞くときは yesno=True(はい → True)。"""
    if os.name == "nt":
        import ctypes
        flags = {"info": 0x40, "warn": 0x30, "error": 0x10}.get(kind, 0x40) | 0x40000   # 手前に出す
        if yesno:
            flags |= 0x4
        r = ctypes.windll.user32.MessageBoxW(0, str(text), str(title), flags)
        return r == 6
    print("[{}] {}".format(title, text))
    return False


# ---------------- Windows 起動時に自動で起動 ----------------
def _startup_file():
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return None
    return os.path.join(appdata, r"Microsoft\Windows\Start Menu\Programs\Startup", "Fox_MD_Tracker.vbs")


def _old_startup_file():
    p = _startup_file()
    return p and os.path.join(os.path.dirname(p), "MDトラッカー.vbs")   # 改名前の名前


def startup_enabled():
    p, o = _startup_file(), _old_startup_file()
    return bool(p and os.path.exists(p)) or bool(o and os.path.exists(o))


def set_startup(on):
    """スタートアップに「黒い画面なしで exe を起動する」小さいファイルを置く/消す。"""
    p = _startup_file()
    if not p:
        return
    if on:
        exe = sys.executable
        with open(p, "w", encoding="utf-16") as f:
            f.write('CreateObject("WScript.Shell").Run """{}"" --hidden", 0, False\r\n'.format(exe))   # 起動時は窓を出さずトレイだけ
    else:
        if os.path.exists(p):
            os.remove(p)
    o = _old_startup_file()
    if o and os.path.exists(o):
        os.remove(o)              # 改名前のものは消しておく(新しい名前に置き換え)


class Tray(object):
    def __init__(self, icon_path, url, live_url, web_url, log_file, folder, on_quit, status=None, open_main=None,
                 update=None):
        self.url, self.live_url, self.web_url = url, live_url, web_url
        self.log_file, self.folder, self.on_quit = log_file, folder, on_quit
        self.status = status or (lambda: "")
        self.open_main = open_main or (lambda: webbrowser.open(self.url))   # 専用の窓があればそれを出す
        self.update = update      # (表示する文字を返す関数, 押したときの関数) / 無ければ出さない
        self.icon = None
        self.icon_path = icon_path

    @staticmethod
    def available():
        return pystray is not None

    def _image(self):
        try:
            return Image.open(self.icon_path)
        except Exception:
            img = Image.new("RGBA", (64, 64), (220, 80, 90, 255))
            return img

    def _open(self, path):
        try:
            os.startfile(path)   # Windows
        except Exception:
            webbrowser.open("file:///" + path)

    def notify(self, text, title="Fox_MD_Tracker"):
        try:
            if self.icon is not None:
                self.icon.notify(text, title)
        except Exception:
            pass

    def run(self):
        """トレイを出す(終了が押されるまでここで待つ)。"""
        frozen = getattr(sys, "frozen", False)
        items = [
            pystray.MenuItem("画面を開く", lambda i, it: self.open_main(), default=True),
            pystray.MenuItem("ブラウザで開く", lambda i, it: webbrowser.open(self.url)),
        ]
        if self.live_url:      # 開発版だけ
            items.append(pystray.MenuItem("耐性リアルタイムを開く", lambda i, it: webbrowser.open(self.live_url)))
        if self.web_url:
            items.append(pystray.MenuItem("ウェブのページを開く", lambda i, it: webbrowser.open(self.web_url)))
        items += [
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("動作ログを見る", lambda i, it: self._open(self.log_file)),
            pystray.MenuItem("フォルダを開く", lambda i, it: self._open(self.folder)),
        ]
        if frozen and os.name == "nt":
            items.append(pystray.MenuItem("Windows起動時に自動で起動", lambda i, it: set_startup(not startup_enabled()),
                                          checked=lambda it: startup_enabled()))
        if self.update:
            text_fn, act = self.update
            items += [pystray.Menu.SEPARATOR,
                      pystray.MenuItem(lambda it: text_fn() or "アップデートを確認", lambda i, it: act())]
        items += [pystray.Menu.SEPARATOR, pystray.MenuItem("終了", self._quit)]
        self.icon = pystray.Icon("Fox_MD_Tracker", self._image(), "Fox_MD_Tracker", pystray.Menu(*items))

        def ticker():
            ev = threading.Event()
            while not ev.wait(10):
                try:
                    self.icon.title = ("Fox_MD_Tracker\n" + self.status())[:120]
                except Exception:
                    pass
        threading.Thread(target=ticker, daemon=True).start()
        self.icon.run()

    def _quit(self, icon, item):
        try:
            self.on_quit()
        finally:
            icon.stop()
