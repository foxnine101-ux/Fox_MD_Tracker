"""利用キーの確認(server/worker.js とやりとりする)。

- 初回だけキーを入れる → /activate で この PC を登録(台数の上限あり)→ `利用キー.json` に覚える
- 起動時と1日1回 /check。ネットにつながらないだけでは止めず、最後に確認できた日から GRACE_DAYS 日は使える
- LICENSE_URL が空のあいだは機能ぜんぶオフ(state = "off")。サーバーを作ってから URL を入れる
- ENFORCE が False のあいだは「警告を出すだけ」で止めない(配り始めの段階)
"""
import hashlib
import json
import os
import threading
import time
import unicodedata
import urllib.error
import urllib.request

LICENSE_URL = "https://fox-md-license.foxnine101.workers.dev"            # 例: "https://fox-md-license.<アカウント>.workers.dev"(サーバーを作ったらここに入れる)
ENFORCE = False             # True にすると、キーが無効・未入力のとき画面をふさぐ(画面側の判断。ここでは state を返すだけ)
GRACE_DAYS = 14
CHECK_EVERY = 24 * 3600
FILE = "利用キー.json"


def pcid():
    """この PC の識別子(マシンGUID のハッシュ。PC の名前・ユーザー名は送らない)"""
    raw = ""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as k:
            raw = winreg.QueryValueEx(k, "MachineGuid")[0]
    except Exception:
        raw = "{:x}".format(__import__("uuid").getnode())
    return hashlib.sha256(("fox-md|" + raw).encode("utf-8")).hexdigest()[:32]


class License:
    def __init__(self, base_dir, url=None, log=print):
        self.path = os.path.join(base_dir, FILE)
        self.url = (url if url is not None else LICENSE_URL).rstrip("/")
        self.log = log
        self.lock = threading.Lock()
        self.d = {}                                   # {key, name, last_ok, bad: 理由 or ""}
        self.msg = ""
        try:
            with open(self.path, encoding="utf-8") as f:
                self.d = json.load(f)
            if not isinstance(self.d, dict):
                self.d = {}
        except Exception:
            self.d = {}

    def _save(self):
        try:
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.d, f, ensure_ascii=False)
            os.replace(tmp, self.path)
        except Exception as e:
            self.log("[利用キー] 保存できません:", e)

    def _post(self, path, body):
        req = urllib.request.Request(self.url + path, json.dumps(body).encode("utf-8"),
                                     {"Content-Type": "application/json", "User-Agent": "Fox_MD_Tracker"})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                out = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:           # 400 など。中身(reason)があれば読む(ネットの不通とは区別する)
            try:
                out = json.loads(e.read().decode("utf-8"))
            except Exception:
                raise e
        if not isinstance(out, dict):
            raise ValueError("サーバーの返事の形が違います")
        return out

    def _body(self):
        return {"key": self.d.get("key", ""), "pcid": pcid()}

    def activate(self, key):
        """キーを入れて登録する。返り値は status()"""
        key = unicodedata.normalize("NFKC", str(key or "")).strip().upper().replace(" ", "")      # 全角・空白をそろえる
        if not key:
            self.msg = "キーを入力してください。"
            return self.status()
        if not self.url:
            return self.status()
        with self.lock:
            try:
                r = self._post("/activate", {"key": key, "pcid": pcid()})
            except Exception as e:
                self.msg = "サーバーにつながりませんでした。ネットを確認してもう一度試してください。"
                self.log("[利用キー] 登録できません:", e)
                return self.status()
            if r.get("ok"):
                self.d = {"key": key, "name": r.get("name", ""), "last_ok": int(time.time()), "bad": "", "limit": r.get("limit"), "pcs": r.get("pcs")}
                self.msg = ""
                self._save()
                self.log("[利用キー] 登録しました:", r.get("name", ""))
            else:
                self.msg = {"unknown": "このキーは見つかりません。入力を確認してください。",
                            "bad request": "このキーは見つかりません。入力を確認してください。",
                            "revoked": "このキーは停止されています。",
                            "limit": "このキーで登録できる台数({}台)に達しています。使わない PC で「この PC をはずす」を押してください。".format(r.get("limit")),
                            }.get(r.get("reason"), "登録できませんでした。")
            return self.status()

    def check(self):
        """サーバーに確認する(起動時・1日1回)。つながらないときは猶予のまま"""
        if not self.url or not self.d.get("key"):
            return self.status()
        with self.lock:
            try:
                r = self._post("/check", self._body())
            except Exception as e:
                self.log("[利用キー] 確認できません(猶予の間は使えます):", e)
                return self.status()
            if r.get("reason") == "bad request":
                return self.status()
            if r.get("ok"):
                self.d.update({"last_ok": int(time.time()), "bad": "", "name": r.get("name", self.d.get("name", ""))})
                self.msg = ""
            else:
                self.d["bad"] = r.get("reason") or "bad"
                self.log("[利用キー] 無効になっています:", self.d["bad"])
            self._save()
            return self.status()

    def release(self):
        """この PC をはずす(別の PC で使うため)"""
        with self.lock:
            if self.url and self.d.get("key"):
                try:
                    self._post("/release", self._body())
                except Exception as e:
                    self.msg = "サーバーにつながらないため、はずせませんでした(サーバー側に登録が残ります)。ネットを確認してもう一度試してください。"
                    self.log("[利用キー] はずせません:", e)
                    return self.status()
            self.d = {}
            self.msg = ""
            try:
                os.remove(self.path)
            except Exception:
                pass
        return self.status()

    def status(self):
        """state: off(機能なし) / none(未入力) / ok / grace(オフラインの猶予中) / expired(猶予切れ) / revoked(停止・登録なし)"""
        if not self.url:
            return {"state": "off", "enforce": False}
        k = self.d.get("key")
        out = {"enforce": ENFORCE, "msg": self.msg, "last_ok": self.d.get("last_ok", 0), "name": self.d.get("name", ""), "pc": pcid()[:6]}
        if not k:
            out["state"] = "none"
        elif self.d.get("bad"):
            out["state"] = "revoked"
        else:
            age = (time.time() - (self.d.get("last_ok") or 0)) / 86400
            out["state"] = "ok" if age < 2 else ("grace" if age <= GRACE_DAYS else "expired")
            out["days_left"] = max(0, int(GRACE_DAYS - age))
        if k:
            out["key_tail"] = k[-4:]
        return out

    def start_background(self, stop):
        """起動の少しあとと、その後1日おきに /check"""
        def run():
            if stop.wait(20):
                return
            while True:
                try:
                    self.check()
                except Exception as e:
                    self.log("[利用キー] 確認で例外:", e)
                if stop.wait(CHECK_EVERY):
                    return
        threading.Thread(target=run, daemon=True).start()
