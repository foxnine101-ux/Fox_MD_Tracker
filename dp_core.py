# -*- coding: utf-8 -*-
"""
Divine Pride(https://www.divine-pride.net/)の API から、jRO の「最新の更新」をこの PC の中だけに集める。

  - 使うのは latestupdates(変わった ID と日時だけ)と、その ID の詳細(名前・種類・Lv など最小限)。公式の使い方どおり
    「知っている ID だけ引く・同じ ID は二度引かない・全データの写しは作らない」。番号を片っ端から引くことはしない。
  - API キーは 環境変数 DP_API_KEY か、exe の隣の「DPキー.json」({"apiKey": "..."})から読む。
    キーは git にも exe にも入れない(.gitignore)。ログにも出さない。
  - 負荷対策: 1回に1つずつ・MIN_GAP 秒以上あけて・裏のスレッドで。429/5xx/タイムアウトで PAUSE 秒休む(Retry-After があればそれ)。
    1回の作業で取る詳細は DETAIL_MAX 件まで。更新の一覧は 14日ごとの窓で、前回の続きから(初回は INIT_DAYS 日前から)。
  - 集めたもの(DP最新情報.json)は利用者の PC の中だけ。アプリにも GitHub にも同梱しない(DP の著作権は運営・Gravity にある)。
"""
import datetime
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import netutil

BASE = "https://www.divine-pride.net/api/database"
UA = "Fox_MD_Tracker (personal local cache; 1 request / 3+ sec; no redistribution)"
SERVER = "jRO"
LANG = "ja"
TYPES = ("item", "monster", "skill", "efst")
WINDOW_DAYS = 14        # latestupdates は開始日から 14日まで
WINDOW_MAX = 6          # 1回の作業で、1種類あたり取る窓の最大数(進まなくなっても無限に呼ばない)
INIT_DAYS = 28          # 初回にさかのぼる日数(14日×2窓)
MIN_GAP = 3.0
TIMEOUT = 25
DETAIL_MAX = 40         # 1回の作業で引く詳細の最大件数
PAUSE = 1800
KEEP = 400              # 種類ごとに覚える更新の件数(新しい順)
STATE_V = 1


class Stop(Exception):
    """この回の作業をやめる(休み・キーなし・サイトのエラー)。"""


def _today():
    return datetime.datetime.utcnow().date()


def _parse_day(s):
    try:
        return datetime.datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def load_key(path):
    """キーを 環境変数 → DPキー.json の順で探す。無ければ ""(値は絶対にログへ出さない)。"""
    k = (os.environ.get("DP_API_KEY") or "").strip()
    if k:
        return k
    try:
        with open(path, "r", encoding="utf-8") as f:
            return str(json.load(f).get("apiKey") or "").strip()
    except (OSError, ValueError, AttributeError):
        return ""


def brief(kind, d):
    """詳細の返事から、覚える分(最小限)だけ取り出す。"""
    if not isinstance(d, dict):
        return None
    out = {"name": str(d.get("name") or "")}
    if kind == "item":
        out["type"] = str(d.get("type") or "")
        out["aegis"] = str(d.get("aegisName") or "")
    elif kind == "monster":
        out["level"] = d.get("level")
    elif kind == "skill":
        out["db"] = str(d.get("databaseName") or "")
    elif kind == "efst":
        out["key"] = str(d.get("key") or "")
    return out


class DivinePride(object):
    def __init__(self, path, key_path, log=print, opener=None):
        self.path = path
        self.key_path = key_path
        self.log = log
        self.enabled = True
        self.since = {}                 # 種類 → 次に調べる開始日(YYYY-MM-DD)
        self.updates = {k: {} for k in TYPES}   # 種類 → {id(文字): 更新日時}
        self.names = {k: {} for k in TYPES}     # 種類 → {id(文字): brief}
        self.last_run = 0.0
        self.last_msg = ""
        self.pause_until = 0.0
        self._lock = threading.Lock()
        self._run_lock = threading.Lock()
        self._last_req = 0.0
        self._opener = opener or urllib.request.build_opener(urllib.request.HTTPSHandler(context=netutil.CTX))
        self._load()

    # ---- 保存 ----
    def _load(self):
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            return
        if not isinstance(d, dict):
            return
        self.enabled = bool(d.get("enabled", True))
        self.since = {k: v for k, v in (d.get("since") or {}).items() if k in TYPES and _parse_day(v)}
        for k in TYPES:
            self.updates[k] = dict((d.get("updates") or {}).get(k) or {})
            self.names[k] = dict((d.get("names") or {}).get(k) or {})
        self.last_run = float(d.get("last_run") or 0)
        self.last_msg = str(d.get("last_msg") or "")

    def save(self):
        d = {"v": STATE_V, "server": SERVER, "enabled": self.enabled, "since": self.since,
             "updates": self.updates, "names": self.names, "last_run": self.last_run, "last_msg": self.last_msg}
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False)
        os.replace(tmp, self.path)

    # ---- 通信 ----
    def _get(self, path, params, key):
        wait = self._last_req + MIN_GAP - time.time()
        if wait > 0:
            time.sleep(wait)
        q = dict(params)
        q["apiKey"] = key
        url = "{}/{}?{}".format(BASE, path, urllib.parse.urlencode(q))
        req = urllib.request.Request(url, headers={"User-Agent": UA, "x-server": SERVER, "Accept-Language": LANG})
        self._last_req = time.time()
        try:
            with self._opener.open(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                try:
                    secs = int(e.headers.get("Retry-After") or 0)
                except (TypeError, ValueError):
                    secs = 0
                self.pause_until = time.time() + max(secs, PAUSE)
                raise Stop("制限(429)のため休みます")
            if e.code in (401, 403):
                raise Stop("APIキーが使えません({})".format(e.code))
            if e.code == 404:
                return None
            if e.code >= 500:
                self.pause_until = time.time() + PAUSE
                raise Stop("サイトのエラー({})のため休みます".format(e.code))
            raise Stop("取得できませんでした({})".format(e.code))
        except (urllib.error.URLError, OSError, ValueError) as e:
            self.pause_until = time.time() + PAUSE
            raise Stop("つながりません: {}".format(type(e).__name__))

    # ---- 1回の作業 ----
    def run_once(self):
        """更新の一覧を前回の続きから取り、新しい ID の詳細を DETAIL_MAX 件まで取る。戻り値 = メッセージ。"""
        if not self._run_lock.acquire(False):
            return "busy"
        try:
            key = load_key(self.key_path)
            if not key:
                self.last_msg = "APIキーがありません(DPキー.json か DP_API_KEY)"
                return self.last_msg
            if time.time() < self.pause_until:
                return "休み中です"
            new_ids, detail = 0, 0
            try:
                for kind in TYPES:
                    start = _parse_day(self.since.get(kind)) or (_today() - datetime.timedelta(days=INIT_DAYS))
                    for _w in range(WINDOW_MAX):
                        if start > _today():
                            break
                        d = self._get("latestupdates", {"type": kind, "startDate": start.isoformat()}, key)
                        res = (d or {}).get("results") or []
                        with self._lock:
                            for r in res:
                                i = str(r.get("id"))
                                if i not in self.updates[kind]:
                                    new_ids += 1
                                self.updates[kind][i] = str(r.get("lastUpdate") or "")
                            # 新しい順に KEEP 件だけ覚える
                            if len(self.updates[kind]) > KEEP:
                                keep = sorted(self.updates[kind].items(), key=lambda kv: kv[1], reverse=True)[:KEEP]
                                self.updates[kind] = dict(keep)
                        # 窓の終わりの日(取れなかった日を飛ばさないよう、返ってきた endDate を使う)。
                        # 開始日が「いま」に近いと endDate が開始日のまま進まない = これ以上先は無いので、この種類は今回おしまい
                        end = _parse_day((d or {}).get("endDate")) or (start + datetime.timedelta(days=WINDOW_DAYS))
                        if end <= start:
                            self.since[kind] = start.isoformat()
                            self.save()
                            break
                        start = end
                        self.since[kind] = min(start, _today()).isoformat()
                        self.save()
                # 詳細: まだ名前が無い ID を、新しい更新から順に
                for kind in TYPES:
                    todo = [i for i, _t in sorted(self.updates[kind].items(), key=lambda kv: kv[1], reverse=True)
                            if i not in self.names[kind]]
                    for i in todo:
                        if detail >= DETAIL_MAX:
                            break
                        d = self._get("{}/{}".format(kind.capitalize(), i), {}, key)
                        b = brief(kind, d)
                        with self._lock:
                            self.names[kind][i] = b or {"name": "", "missing": 1}
                        detail += 1
                        self.save()
                self.last_msg = "ok: 新しい更新 {}件・詳細 {}件".format(new_ids, detail)
            except Stop as e:
                self.last_msg = str(e)
            finally:
                self.last_run = time.time()
                try:
                    self.save()
                except OSError:
                    pass
            return self.last_msg
        finally:
            self._run_lock.release()

    # ---- 画面向け ----
    def view(self, limit=30):
        rows = []
        for kind in TYPES:
            for i, t in self.updates[kind].items():
                nm = self.names[kind].get(i) or {}
                rows.append({"kind": kind, "id": int(i) if i.isdigit() else i, "updated": t, "name": nm.get("name", ""),
                             "info": {k: v for k, v in nm.items() if k not in ("name", "missing") and v not in ("", None)}})
        rows.sort(key=lambda r: r["updated"], reverse=True)
        return {"server": SERVER, "enabled": self.enabled, "has_key": bool(load_key(self.key_path)),
                "last_run": self.last_run, "last_msg": self.last_msg,
                "paused": max(0, int(self.pause_until - time.time())), "rows": rows[:limit],
                "counts": {k: len(self.updates[k]) for k in TYPES}}

    # ---- 裏のスレッド ----
    def kick(self):
        if self._run_lock.locked():
            return False
        threading.Thread(target=self.run_once, name="dp-run", daemon=True).start()
        return True

    def start(self, first_delay=150, every=6 * 3600):
        def loop():
            time.sleep(first_delay)
            while True:
                try:
                    if self.enabled and load_key(self.key_path):
                        self.run_once()
                except Exception as e:      # 裏の作業は止めない
                    self.log("[DP] 取得に失敗: {}".format(type(e).__name__))
                time.sleep(every)
        threading.Thread(target=loop, name="dp-loop", daemon=True).start()
