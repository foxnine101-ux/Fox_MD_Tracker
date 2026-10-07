# -*- coding: utf-8 -*-
"""
Fox_MD_Tracker 専用の窓(ブラウザを使わずに画面を出す)。pywebview を使う。
  - × で閉じてもツールは止まらず、タスクトレイに隠れるだけ
  - show() でまた出てくる / quit() で本当に終わる
  - 窓の大きさ・位置を覚えておく
pywebview が無い・動かないときは available() が False になり、ブラウザで開く(今まで通り)。
"""
import json
import os
import threading

try:
    import webview
except Exception:            # 部品が無い → ブラウザで開く
    webview = None


class AppWindow(object):
    def __init__(self, url, folder, title="Fox_MD_Tracker", show=True, on_hide=None, log=print):
        self.url, self.folder, self.title = url, folder, title
        self.show_first = show
        self.on_hide = on_hide or (lambda: None)
        self.log = log
        self.win = None
        self.quitting = False
        self.ready = threading.Event()
        self.geo_file = os.path.join(folder, "窓の位置.json")
        self.hid_once = False

    @staticmethod
    def available():
        return webview is not None

    def _load_geo(self):
        try:
            with open(self.geo_file, "r", encoding="utf-8") as f:
                g = json.load(f)
            return {k: int(g[k]) for k in ("width", "height", "x", "y") if g.get(k) is not None}
        except Exception:
            return {}

    def _save_geo(self):
        try:
            w = self.win
            g = {"width": w.width, "height": w.height, "x": w.x, "y": w.y}
            if g["width"] and g["height"] and g["width"] > 300 and g["height"] > 200 and g["x"] > -2000 and g["y"] > -2000:
                with open(self.geo_file, "w", encoding="utf-8") as f:
                    json.dump(g, f)
        except Exception:
            pass

    def start(self):
        """窓を作って待つ(メインの流れで呼ぶ。quit() されるまで戻らない)。"""
        geo = self._load_geo()
        self.win = webview.create_window(
            self.title, self.url,
            width=geo.get("width", 1280), height=geo.get("height", 860),
            x=geo.get("x"), y=geo.get("y"),
            min_size=(640, 420), hidden=not self.show_first, text_select=True)
        self.win.events.closing += self._closing
        self.win.events.loaded += lambda *a: self.ready.set()
        storage = os.path.join(self.folder, "画面のデータ")
        try:
            webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True   # 出典などのリンクはいつものブラウザで
        except Exception:
            pass
        webview.start(private_mode=False, storage_path=storage)

    def _closing(self, *a):
        self._save_geo()
        if self.quitting:
            return True
        # × は「隠す」だけ(ツールは動き続ける)
        threading.Thread(target=self.win.hide, daemon=True).start()
        if not self.hid_once:
            self.hid_once = True
            self.on_hide()
        return False

    def show(self):
        if self.win is None:
            return
        try:
            self.win.show()
            self.win.restore()
        except Exception:
            pass
        try:
            self.win.evaluate_js("window.focus && window.focus()")
        except Exception:
            pass

    def quit(self):
        self.quitting = True
        if self.win is not None:
            try:
                self._save_geo()
                self.win.destroy()
            except Exception:
                pass
