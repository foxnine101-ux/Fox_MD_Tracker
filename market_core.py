# -*- coding: utf-8 -*-
"""
相場(露店の取引履歴): RO公式ツール(rotool.gungho.jp)のアイテムページと同じデータを、この PC にだけ覚える。

  /item_trade_log_filtered_search/?item_id=<番号>&make_flag=0          → 取引の一覧(新しい順。全ワールド・全期間)
  /item_trade_log_summary_filtered_search/?item_id=<番号>&make_flag=0  → {max, min, median, …}(単価・通常価格)
単価 = price ÷ item_count(通常価格)。Noatun 価格はそれをさらに 1000 で割った値(公式ページと同じ計算)。

サイトに負荷をかけない: 1件ずつ・前の通信から 3秒以上あける・同じ品は 6時間は取り直さない・画面の「相場」ボタンを押したときだけ。
取った内容は 相場.json(この PC だけ。配布・公開しない)に保存する。
"""
import html
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request

import netutil

BASE = "https://rotool.gungho.jp"
UA = "Fox_MD_Tracker (personal local cache; 1 request / 3+ sec; no redistribution)"
MIN_GAP = 3.0          # 通信と通信の間(秒)
FRESH = 6 * 3600       # この間は取り直さない
KEEP = 60              # 1回に取る取引は、新しい順に何件まで取り込むか
TRADES_MAX = 400       # 1つの品について、取り込んだ取引を何件まで覚えておくか(取り直すたびに足していく。重なりは捨てる。グラフ用)
HIST_MAX = 400         # 取り直すたびの 中央値・最低・最高 の記録を何回ぶん覚えておくか(グラフ用)
TIMEOUT = 20


class Market(object):
    def __init__(self, path, clock=time.time, sleep=time.sleep, log=None):
        self.path = path
        self.data = {}           # アイテム番号(文字) -> {t, summary, trades, err}
        self.busy = {}           # アイテム番号(文字) -> 取りにいっている最中
        self.lock = threading.Lock()
        self._pace = threading.Lock()
        self._last = 0.0
        self._clock, self._sleep = clock, sleep
        self.log = log or (lambda *a: None)
        self.dirty = False
        self.load()

    def load(self):
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                d = json.load(f)
            if isinstance(d, dict):
                self.data = d
        except (OSError, ValueError):
            self.data = {}

    def save(self):
        if not self.dirty:
            return
        tmp = self.path + ".tmp"
        try:
            with self.lock:                         # 書くのも1つずつ(同時に書いて、片方の記録が消えないように)
                text = json.dumps(self.data, ensure_ascii=False, separators=(",", ":"))
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write(text)
                os.replace(tmp, self.path)
                self.dirty = False
        except OSError as e:
            self.log("[相場] 保存できませんでした: {}".format(e))

    def view(self, iid):
        """画面用: 覚えている相場と、いま取りにいっているか。"""
        k = str(iid)
        with self.lock:
            r = self.data.get(k)
            return {"id": k, "busy": k in self.busy, "rec": r, "age": int(self._clock() - r["t"]) if r and r.get("t") else None}

    def ask(self, iid, force=False):
        """取りにいく(裏のスレッドで)。新しければ何もしない。すでに取りにいっていれば何もしない。"""
        k = str(int(iid))
        with self.lock:
            r = self.data.get(k)
            if k in self.busy:
                return
            if r and r.get("t") and not r.get("err") and (r.get("name") or r.get("pg")) and self._clock() - r["t"] < FRESH and not force:      # 名前が無く、品のページも見ていない古い記録は、名前のために取り直す
                return
            if r and r.get("t") and force and self._clock() - r["t"] < 60:       # 連打で何度も取りにいかない
                return
            self.busy[k] = True
        threading.Thread(target=self._run, args=(k,), daemon=True).start()

    # ---- 取りにいく ----
    def _fetch(self, path, text=False):
        with self._pace:                                   # 全体で3秒以上あける
            wait = self._last + MIN_GAP - self._clock()
            if wait > 0:
                self._sleep(wait)
            self._last = self._clock()
        req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept-Language": "ja", "Accept": "text/html" if text else "application/json"})
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=netutil.CTX))      # クッキーは送らない
        with opener.open(req, timeout=TIMEOUT) as r:
            body = r.read().decode("utf-8", "replace")
            return body if text else json.loads(body)

    @staticmethod
    def _tkey(t):
        return (t.get("d"), t.get("n"), t.get("p"), t.get("map"), t.get("w"), t.get("r"), t.get("g"), tuple(t.get("c") or ()))

    def merge(self, old, new):
        """前に覚えた取引に、新しく取れた取引を足す(同じ取引は1つに)。新しい順・TRADES_MAX 件まで。"""
        seen, out = set(), []
        for t in list(new) + list(old or []):
            k = self._tkey(t)
            if k in seen:
                continue
            seen.add(k)
            out.append(t)
        out.sort(key=lambda t: str(t.get("d") or ""), reverse=True)
        return out[:TRADES_MAX]

    def brief(self):
        """画面の一覧用: {アイテム番号: [取った時刻, 直近の売価(単価), その日時, 中央値]}。覚えているものだけ(通信はしない)。"""
        out = {}
        with self.lock:
            for k, r in self.data.items():
                if not r or not r.get("t"):
                    continue
                tr = (r.get("trades") or [None])[0]
                last = int(tr["p"] / max(1, tr["n"])) if tr else None
                out[k] = [r["t"], last, tr["d"] if tr else "", (r.get("summary") or {}).get("median")]
        return out

    @staticmethod
    def shape(log, summary):
        """公式の返事 → 保存する形(取引は新しい順に KEEP 件)。"""
        trades = []
        if isinstance(log, list):
            rows = sorted((x for x in log if isinstance(x, dict)), key=lambda x: str(x.get("log_date") or ""), reverse=True)
            for x in rows[:KEEP]:
                try:
                    cnt = max(1, int(x.get("item_count") or 1))
                    price = int(x.get("price") or 0)
                except (TypeError, ValueError):
                    continue
                trades.append({"d": str(x.get("log_date") or "")[:16], "n": cnt, "p": price, "map": x.get("mapname") or "",
                               "w": x.get("world") or "", "r": int(x.get("refining_level") or 0), "g": int(x.get("GradeLevel") or 0),
                               "c": [c for c in (x.get("card1"), x.get("card2"), x.get("card3"), x.get("card4")) if c]})
        summ = None
        if isinstance(summary, dict) and summary.get("median") is not None:
            summ = {k: summary.get(k) for k in ("median", "min", "max", "min_date", "max_date")}
        return trades, summ, (len(log) if isinstance(log, list) else 0)

    def _page_name(self, k):
        try:
            h = self._fetch("/item/{}/".format(k), text=True)
        except Exception:
            return ""
        m = re.search(r"<title>\s*(.*?)\s*\|\s*RO公式ツール\s*</title>", h, re.S)
        return html.unescape(m.group(1)).strip() if m else ""

    def _run(self, k):
        err = ""
        try:
            q = urllib.parse.urlencode({"item_id": k, "make_flag": 0})
            log = self._fetch("/item_trade_log_filtered_search/?" + q)
            summary = self._fetch("/item_trade_log_summary_filtered_search/?" + q)
            trades, summ, total = self.shape(log, summary)
            name = next((str(x.get("item_name")).strip() for x in log if isinstance(x, dict) and x.get("item_name")), "") if isinstance(log, list) else ""
            pg = False
            if not name:                                    # 取引が1件もない品でも、公式の品のページはある → 名前だけ、そこから読む
                name, pg = self._page_name(k), True
            with self.lock:
                old = self.data.get(k) or {}
            trades = self.merge(old.get("trades"), trades)              # 取り直すたびに足していく(あとでグラフにするため、取った取引は捨てない)
            hist = list(old.get("hist") or [])
            if summ:
                hist.append([int(self._clock()), summ.get("median"), summ.get("min"), summ.get("max")])
            rec = {"t": int(self._clock()), "summary": summ, "trades": trades, "total": total, "none": log == "none", "name": name or old.get("name") or "", "pg": pg or bool(old.get("pg")), "hist": hist[-HIST_MAX:]}      # name = 公式の品名(番号から名前を調べるのに使う)
        except Exception as e:                              # つながらない・形が違う など。前の記録は消さない
            err = "{}: {}".format(type(e).__name__, e)
            self.log("[相場] {} が取れませんでした: {}".format(k, err))
            rec = None
        with self.lock:
            if rec is not None:
                self.data[k] = rec
                self.dirty = True
            elif k in self.data:
                self.data[k]["err"] = err
            else:
                self.data[k] = {"t": 0, "err": err, "trades": [], "summary": None}
            self.busy.pop(k, None)
        self.save()
