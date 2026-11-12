# -*- coding: utf-8 -*-
"""
身内の共有相場: 「RO相場自動記録」(ユーザースクリプト・Worker zatta)が貯めた日ごとの相場を、受け取るだけ。

- 送るのは「前回受け取った時刻」だけ。品の番号も持ち物も送らない(全員が同じものを受け取るので、誰が何を持っているかは分からない)
- 合言葉(読むだけのもの)は利用キーの Worker から渡される(License.data_key("zatta"))。トラッカーには書かない
- 15分おきに /lastupdate を見て、変わっていたら /latest?since= で差分だけ受け取る。直近 KEEP_DAYS 日分だけ覚える
- 取ったものは 共有相場.json(この PC)に保存。画面の「直近の売価・中央値」で、自分で取った相場が無い・古いときに使う
"""
import json
import os
import threading
import time
import urllib.parse
import urllib.request

import netutil

URL = "https://zatta.foxnine101.workers.dev"
EVERY = 15 * 60       # 確かめる間隔(秒)
FIRST = 20            # 起動してから最初に確かめるまで(秒)
KEEP_DAYS = 60        # 覚えておく日数
MED_DAYS = 30         # 「中央値」に使う日数
TIMEOUT = 20


def _day_ago(n):
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() + 9 * 3600 - n * 86400))


class Shared(object):
    def __init__(self, path, key=lambda: "", log=None, url=URL):
        self.path, self.key, self.log, self.url = path, key, log or (lambda *a: None), url
        self.lock = threading.Lock()
        self.d = {"t": "", "items": {}}      # items: {アイテム番号: {日: [件数, 中央値, 最安, 最高]}}(通常のワールド・絞り込みなしの値だけ)
        self.err = ""
        self.checked = 0.0
        self.load()

    def load(self):
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                d = json.load(f)
            if isinstance(d, dict) and isinstance(d.get("items"), dict):
                self.d = {"t": str(d.get("t") or ""), "items": d["items"]}
        except (OSError, ValueError):
            pass

    def save(self):
        tmp = self.path + ".tmp"
        with self.lock:
            s = json.dumps(self.d, ensure_ascii=False, separators=(",", ":"))
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(s)
        os.replace(tmp, self.path)

    def _get(self, path, tok):
        req = urllib.request.Request(self.url + path, headers={"Authorization": "Bearer " + tok, "User-Agent": "Fox_MD_Tracker"})
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=netutil.CTX) as r:
            return json.loads(r.read().decode("utf-8"))

    def merge(self, rows):
        """/latest の行 [番号, make, 精錬, カード, 超越, 種類, 日, 件数, 中央値, 最安, 最高] を足す。同じ日は件数が多い方。"""
        n = 0
        with self.lock:
            it = self.d["items"]
            for r in rows:
                if len(r) < 11 or r[1] != 0 or r[2] or r[3] or r[4] or r[5] != "n":
                    continue
                k, day, cnt = str(r[0]), r[6], r[7]
                cur = it.setdefault(k, {}).get(day)
                if not cur or cnt >= cur[0]:
                    it[k][day] = [cnt, r[8], r[9], r[10]]
                    n += 1
            old = _day_ago(KEEP_DAYS)
            for k in list(it):
                for day in [x for x in it[k] if x < old]:
                    del it[k][day]
                if not it[k]:
                    del it[k]
        return n

    def poll(self):
        """1回確かめる。受け取った行数を返す(合言葉が無ければ -1)。"""
        tok = self.key() or ""
        if not tok:
            self.err = "nokey"
            return -1
        self.checked = time.time()
        last = self._get("/lastupdate", tok).get("t") or ""
        if last and last == self.d["t"]:
            self.err = ""
            return 0
        since, got = self.d["t"], 0
        for _ in range(20):      # 続きがあれば続けて(1回 5000 行まで)
            r = self._get("/latest?" + urllib.parse.urlencode({"since": since}), tok)
            got += self.merge(r.get("rows") or [])
            since = r.get("next") or since
            if not r.get("more"):
                break
        with self.lock:
            self.d["t"] = since
        self.save()
        self.err = ""
        return got

    def run(self):
        time.sleep(FIRST)
        while True:
            try:
                n = self.poll()
                if n > 0:
                    self.log("[共有相場] {} 件の新しい値を受け取りました".format(n))
            except Exception as e:
                self.err = str(e)[:120]
                self.log("[共有相場] 受け取れませんでした:", e)
            time.sleep(EVERY)

    def start(self):
        threading.Thread(target=self.run, name="zatta", daemon=True).start()

    def brief(self):
        """{番号: [受け取った時刻(秒), いちばん新しい日の中央値, その日, 直近 MED_DAYS 日の中央値(件数で重みづけ)]}"""
        out, since = {}, _day_ago(MED_DAYS)
        with self.lock:
            for k, days in self.d["items"].items():
                ks = sorted(days)
                if not ks:
                    continue
                lastd = ks[-1]
                pts = sorted((v[1], v[0]) for d, v in days.items() if d >= since and v[1] is not None)
                med = None
                if pts:
                    half, acc = sum(c for _, c in pts) / 2.0, 0
                    for p, c in pts:
                        acc += c
                        if acc >= half:
                            med = p
                            break
                out[k] = [self.checked, days[lastd][1], lastd, med]
        return out

    def status(self):
        with self.lock:
            return {"t": self.d["t"], "items": len(self.d["items"]), "err": self.err, "checked": self.checked}
