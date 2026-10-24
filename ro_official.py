# -*- coding: utf-8 -*-
"""
RO公式ツール(https://rotool.gungho.jp/)のモンスター情報を、この PC の中だけに集めて覚える。

  - 入ったことのある MD(遊んだ場所)で見かけたモンスターの名前・被ダメで出てきた相手の名前を集めて、
    公式サイトの「モンスター検索」「モンスターの詳細」から Lv・HP・属性・種族・サイズ・ボス・使うスキル・出現マップを取る。
  - 公式サイトに負荷をかけない: 1回に1つずつ・3秒以上あけて・裏の作業で・集めたものは永久に覚えて同じものは二度と取らない。
    429/5xx/タイムアウトが出たら、その回はやめて30分あける。1回の作業は最大 RUN_MAX 件まで。クッキーは送らない。
  - サイトポリシーでは、中身の著作権は運営(ガンホー)にあり、個人的な利用以外での公開・配布はできないとされている。
    そのため集めたデータ(公式モンスター.json)は、利用者の PC の中だけに置く。アプリ(exe)にも GitHub にも入れない。
  - 使い道: ① 被ダメの「相手」の種族・サイズ・属性・ボス(これまでの mob_info.json = ラトリオより優先)
            ② 名前の分からない攻撃者(ID○○)を、使われたスキルから候補に絞って手で紐付ける
"""
import json
import os
import random
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

import netutil

BASE = "https://rotool.gungho.jp"
UA = "Fox_MD_Tracker (personal local cache; 1 request / 3+ sec; no redistribution)"
MIN_GAP = 3.0          # 秒。これに 0〜1 秒のゆらぎを足す
TIMEOUT = 25
RUN_MAX = 120          # 1回の作業で取る最大件数
PAUSE_AFTER_ERROR = 1800
MISS_KEEP = 14 * 86400  # 見つからなかった名前は、これだけたつまで調べ直さない
SMALL_MAP = 80         # この数までの出現モンスター一覧なら、全部の詳細を集める(それより大きい一覧は、見かけたものだけ)
STATE_V = 1


class Stop(Exception):
    """この回の作業をやめる(件数の上限・サイトのエラー)。"""


def norm(s):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(s or "")))


def _int(v, default=0):
    try:
        return int(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return default


def skill_key(s):
    """スキル名をくらべる形にそろえる(全角半角・空白)。"""
    return norm(s)


GENERIC_SKILLS = ("通常攻撃", "")


def is_named_skill(s):
    """名前の付いたスキルか(「スキル717」のような、名前が分からないものは数えない)。"""
    return bool(s) and s not in GENERIC_SKILLS and not re.match(r"^スキル\d+$", s)


# ---------------- 公式サイトのページを読む ----------------
def parse_detail(html_text):
    """モンスターの詳細ページ → {jname, lv, hp, ele, race, size, cls, atk, matk, def, mdef, res, mres, skills, maps}。読めなければ None。"""
    t = html_text
    m = re.search(r'<h1[^>]*class="conent-ttl"[^>]*>\s*(.*?)\s*</h1>', t, flags=re.S)
    if not m:
        return None

    def clean(x):
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", x)).strip()
    jname = clean(m.group(1))

    def field(cls):
        mm = re.search(r'<div class="%s">\s*<dl><dt>[^<]*</dt><dd>(.*?)</dd>' % re.escape(cls), t, flags=re.S)
        return clean(mm.group(1)) if mm else ""
    sk = re.search(r'<div class="mons-skill">.*?<dd>\s*<p>(.*?)</p>', t, flags=re.S)
    skills = [s.strip() for s in re.split(r"[、,]", clean(sk.group(1))) if s.strip()] if sk else []
    maps = []
    ms = re.search(r'出現マップ</h3>(.*?)(?:</section>|</div>\s*</section>)', t, flags=re.S)
    if ms:
        maps = [[a, clean(b)] for a, b in re.findall(r'<a href="/map/([^"]+)">(.*?)</a>', ms.group(1), flags=re.S)]
    if not field("lv"):
        return None
    return {"jname": jname, "lv": _int(field("lv")), "hp": _int(field("HP")), "ele": field("attr"), "race": field("race"),
            "size": field("size"), "cls": field("type"), "atk": _int(field("Atk")), "matk": _int(field("Matk")),
            "def": _int(field("Def")), "mdef": _int(field("Mdef")), "res": _int(field("Res")), "mres": _int(field("Mres")),
            "skills": skills, "maps": maps}


def parse_item(html_text):
    """アイテムのページ(/item/<番号>) → {name, desc, kind, pos, ele, slots, def, mdef, refine, wt, lv, equip}。読めなければ None。
    desc = 説明文(効果。改行つき)。系列・位置・属性・スロット・Def・Mdef・精錬・重量・要求レベル・装備は、説明文の最後の「系列 : …」の並び。"""
    t = html_text
    m = re.search(r'<h1[^>]*class="conent-ttl"[^>]*>\s*(.*?)\s*</h1>', t, flags=re.S)
    if not m:
        return None
    name = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(1))).strip()
    d = re.search(r'<div class="description">\s*<p class="note">(.*?)</p>', t, flags=re.S)
    if not name or not d:
        return None
    body = re.sub(r"<br\s*/?>", "\n", d.group(1))
    body = re.sub(r"<[^>]+>", "", body)
    body = re.sub(r"[ \u3000]+\n", "\n", body).strip()

    def field(label):
        mm = re.search(label + r"\s*:\s*([^\n]*?)(?=\s+[^\s:]+\s*:|\n|$)", body)
        return mm.group(1).strip() if mm else ""
    head, sep, tail = body.rpartition("系列 :")
    desc = head.strip(" \n―") if sep else body
    spec = "系列 :" + tail if sep else ""

    def sf(label):
        mm = re.search(label + r"\s*:\s*(.*?)(?=\s+\S+\s*:|\n|$)", spec)
        return mm.group(1).strip() if mm else ""
    return {"name": name, "desc": desc, "kind": sf("系列"), "pos": sf("位置"), "ele": sf("属性"), "slots": _int(sf("スロット")), "def": _int(sf("Def")),
            "mdef": _int(sf("Mdef")), "refine": sf("精錬"), "wt": _int(sf("重量")), "lv": _int(sf("要求レベル")), "equip": sf("装備")}


def parse_map(html_text):
    """マップのページ → その出現モンスターの一覧 [[ID名, 日本語名], …]"""
    out, seen = [], set()
    i = html_text.find('id="monster_list_simple"')
    if i >= 0:                               # 出現モンスターの表がある → その中だけ(ほかの場所のリンクを拾わない)
        j = html_text.find("</table>", i)
        html_text = html_text[i:j if j > 0 else len(html_text)]
    for a, b in re.findall(r'href="/monster/([^"/?#]+)"[^>]*>(.*?)</a>', html_text, flags=re.S):
        if a in seen:
            continue
        seen.add(a)
        out.append([a, re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", b)).strip()])
    return out


def parse_map_page(html_text):
    """マップのページ → {title, file, img, props: [[項目, 値]], blocked: [使えないスキルなど], mons}。読めなければ None。
    画像の場所はページの中の <figure class="img-map"> から取る(ファイル名と同じとは限らない。1@23inf は 1@infi.png)。"""
    t = html_text
    m = re.search(r'<h1[^>]*class="conent-ttl"[^>]*>\s*(.*?)\s*</h1>', t, flags=re.S)
    if not m:
        return None

    def clean(x):
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", x)).strip()
    title = clean(m.group(1))
    mf = re.search(r"\(([^()\s]+)\)\s*$", title)
    img = re.search(r'<figure class="img-map">\s*<img[^>]*src="([^"]+)"', t, flags=re.S)
    props, blocked = [], []
    ms = re.search(r'<div class="map-status">\s*<table>(.*?)</table>\s*</div>', t, flags=re.S)
    if ms:
        for th, td in re.findall(r"<tr>\s*<th>(.*?)</th>\s*<td>(.*?)</td>\s*</tr>", ms.group(1), flags=re.S):
            k = clean(th.replace("<br>", " / "))
            if '<div id="' in td:                       # 「使えないスキル」などの一覧(中に <br> 区切りの名前)
                items = [clean(x) for x in re.split(r"<br\s*/?>", re.sub(r'.*?<div id="[^"]*">', "", td, count=1, flags=re.S)) if clean(x)]
                blocked.append([k, items])
            else:
                props.append([k, clean(td)])
    return {"title": title, "file": mf.group(1) if mf else "", "img": img.group(1) if img else "", "props": props, "blocked": blocked,
            "mons": parse_map(t)}


def from_search(d):
    """モンスター検索(JSON)の1件 → 保存する形(使うスキル・出現マップは詳細ページで足す)。"""
    return {"jname": str(d.get("JName") or "").strip(), "sub": str(d.get("SubJName") or "").strip(), "lv": _int(d.get("LV")),
            "hp": _int(d.get("HP")), "ele": str(d.get("property") or ""), "race": str(d.get("race") or ""), "size": str(d.get("scale") or ""),
            "cls": str(d.get("class") or ""), "atk": _int(d.get("atk1")), "matk": _int(d.get("atk2")), "def": _int(d.get("def")),
            "mdef": _int(d.get("mdef")), "res": _int(d.get("res")), "mres": _int(d.get("mres"))}


def boss_flag(cls):
    c = str(cls or "")
    if not c:
        return None
    return 0 if c in ("一般", "NORMAL") else 1


def _join(vals):
    """mob_info と同じ書き方: 全部同じならその値、ちがえば「185/250」のように / でつなぐ。"""
    out = []
    for v in vals:
        if v not in out:
            out.append(v)
    return out[0] if len(out) == 1 else "/".join(str(x) for x in out)


def to_info(recs):
    """同じ名前の公式の記録(強さちがいなど)をまとめて、mob_info.json と同じ形にする。"""
    recs = [r for r in recs if r.get("lv")]
    if not recs:
        return None
    out = {"lv": _join([r["lv"] for r in recs]), "hp": _join([r["hp"] for r in recs]),
           "race": _join([r["race"] for r in recs if r.get("race")] or [""]), "size": _join([r["size"] for r in recs if r.get("size")] or [""]),
           "ele": _join([r["ele"] for r in recs if r.get("ele")] or [""])}
    b = [boss_flag(r.get("cls")) for r in recs]
    b = [x for x in b if x is not None]
    out["boss"] = _join(b) if b else 0
    return out


class Official(object):
    """公式モンスター.json を持って、足りないものを(ゆっくり)取りにいく。"""

    def __init__(self, path, log=print, fetch=None, sleep=time.sleep, clock=time.time):
        self.path = path
        self.log = log
        self._fetch = fetch or self._http_get       # テスト用に差しかえられる: fetch(url) -> bytes(本文)
        self._sleep = sleep
        self._clock = clock
        self.lock = threading.RLock()
        self.enabled = True
        self.mobs = {}        # ID名 -> {jname, sub, lv, hp, ele, race, size, cls, atk, …, skills, maps, d(詳細まで取れたか), t}
        self.maps = {}        # マップのファイル名 -> {"name": 名前, "mons": [[ID名, 名前], …], "t": 時刻}
        self.mdmaps = {}      # MD の名前 -> {"files": [[ファイル名, マップ名], …], "t": 時刻}
        self.misses = {}      # 見つからなかった名前 -> 時刻
        self.items = {}       # アイテムの番号(文字) -> {name, desc, kind, slots, def, mdef, lv, equip, t}。名前の分からないアイテム用(この PC だけ)
        self.item_misses = {}  # 見つからなかった番号 -> 時刻
        self.pause_until = 0
        self.SMALL_MAP = SMALL_MAP
        self._run_lock = threading.Lock()     # 取りにいく作業は同時に1つだけ(裏の作業と「今すぐ調べる」が重ならないように)
        self.state = "idle"   # idle / working / paused / off
        self.last_run = 0
        self.last_error = ""
        self.budget = 0
        self.requests = 0     # 起動してからの件数
        self._last_get = 0.0
        self._pace = threading.Lock()
        self._tl = threading.local()
        self.maplist = []     # 公式のマップの一覧 [[ファイル名, マップ名], …]
        self.maplist_t = 0
        self.mapdir = os.path.join(os.path.dirname(os.path.abspath(path)), "公式マップ")      # マップの画像(この PC だけ)
        self._save_lock = threading.Lock()
        self.map_job = {"file": "", "state": "idle", "done": 0, "total": 0, "msg": ""}
        self._by_name = None
        self._thread = None
        self.changed = False
        self.on_items = None      # 公式から集めたアイテムの名前が増えたとき呼ぶ関数: on_items({番号: 名前})
        self.load()

    # ---------- 保存 ----------
    def load(self):
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            return
        if not isinstance(d, dict):
            return
        self.enabled = d.get("enabled", True) is not False
        self.mobs = d.get("mobs") or {}
        self.maps = d.get("maps") or {}
        self.mdmaps = d.get("mdmaps") or {}
        self.misses = d.get("misses") or {}
        self.items = d.get("items") or {}
        self.item_misses = d.get("item_misses") or {}
        self.maplist = d.get("maplist") or []
        self.maplist_t = d.get("maplist_t") or 0
        self.pause_until = d.get("pause_until") or 0
        self._by_name = None

    def save(self):
        with self.lock:                                   # 書き足している最中のものを読まない(JSON はここで作りきる)
            d = {"v": STATE_V, "note": "RO公式ツールから集めたこの PC だけのデータ。配布しないでください。", "enabled": self.enabled,
                 "mobs": self.mobs, "maps": self.maps, "mdmaps": self.mdmaps, "misses": self.misses, "items": self.items, "item_misses": self.item_misses, "maplist": self.maplist, "maplist_t": self.maplist_t,
                 "pause_until": self.pause_until}
            try:
                text = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
            except (TypeError, ValueError) as e:
                self.log("[公式] 保存の中身を作れませんでした: {}".format(e))
                return
            self.changed = False
        with self._save_lock:                             # ファイルへの書き込みは同時に1つだけ
            tmp = self.path + ".tmp"
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write(text)
                os.replace(tmp, self.path)
            except OSError as e:
                self.changed = True
                self.log("[公式] 保存できませんでした: {}".format(e))

    # ---------- 引く ----------
    def _index(self):
        if self._by_name is None:
            idx = {}
            for aegis, r in self.mobs.items():
                idx.setdefault(norm(r.get("jname")), []).append(aegis)
            self._by_name = idx
        return self._by_name

    def recs(self, name):
        with self.lock:
            return [self.mobs[a] for a in self._index().get(norm(name), []) if a in self.mobs]

    def info(self, name):
        """mob_info.json と同じ形(無ければ None)。"""
        return to_info(self.recs(name))

    def skills_of(self, name):
        out = []
        for r in self.recs(name):
            for s in r.get("skills") or []:
                if s not in out:
                    out.append(s)
        return out

    def has(self, name):
        return bool(self.recs(name))

    def detailed(self, name):
        """詳細ページまで取れている(使うスキルが分かっている)か。使うスキルが無いモンスターでも、取れていれば True。"""
        rs = self.recs(name)
        return bool(rs) and all(r.get("d") for r in rs)

    def map_index(self):
        """どこかのマップの一覧に載っている 日本語名 -> [ID名]"""
        idx = {}
        for mf, m in self.maps.items():
            for a, jn in m.get("mons") or []:
                idx.setdefault(norm(jn), [])
                if a not in idx[norm(jn)]:
                    idx[norm(jn)].append(a)
        return idx

    def map_files_for(self, md_name, suffix):
        """MD の名前と、入ったマップの後ろの部分(「0ef1@ct0」の ct0)から、公式のマップのファイル名を探す。"""
        m = self.mdmaps.get(md_name) or {}
        return [f for f, _ in m.get("files") or [] if f.split("@")[-1] == suffix]

    def monsters_on(self, md_name, suffixes):
        """入ったマップの出現モンスター(公式の一覧)。{日本語名: [ID名]}"""
        out = {}
        for suf in suffixes:
            for mf in self.map_files_for(md_name, suf):
                for a, jn in (self.maps.get(mf) or {}).get("mons") or []:
                    out.setdefault(jn, [])
                    if a not in out[jn]:
                        out[jn].append(a)
        return out

    def status(self, pending=0):
        with self.lock:
            return {"enabled": self.enabled, "state": self.state, "mobs": len(self.mobs), "details": sum(1 for r in self.mobs.values() if r.get("d")),
                    "maps": len(self.maps), "pending": pending, "paused_until": int(self.pause_until) if self.pause_until > self._clock() else 0,
                    "last_run": int(self.last_run), "error": self.last_error, "requests": self.requests}

    # ---------- 取りにいく(ゆっくり) ----------
    def _http_get(self, url):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja", "Accept": "text/html,application/json"})
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=netutil.CTX))      # クッキーを扱う部品を入れない = 送らない
        with opener.open(req, timeout=TIMEOUT) as r:
            return r.read()

    def _get(self, path):
        """1件取る。前の1件から MIN_GAP 秒以上あける。上限・エラーは Stop。"""
        free = getattr(self._tl, "free", False)          # 画面からの「このマップを読み込む」は、自分の上限で動く
        if not free and self.budget <= 0:
            raise Stop("件数の上限")
        with self._pace:                                  # 裏の作業と「マップ読み込み」が同時に動いても、3秒以上あける
            slot = max(self._clock(), self._last_get + MIN_GAP + random.random())
            wait = slot - self._clock()
            self._last_get = slot
            if not free:
                self.budget -= 1
            self.requests += 1
        if wait > 0:
            self._sleep(wait)
        try:
            body = self._fetch(BASE + path)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            self._backoff("HTTP {}".format(e.code))
        except Exception as e:                       # タイムアウト・つながらない など
            self._backoff(type(e).__name__)
        return body

    def _backoff(self, why):
        self.last_error = why
        self.pause_until = self._clock() + PAUSE_AFTER_ERROR
        self.log("[公式] サイトの調子が悪いので、30分あけます({})".format(why))
        raise Stop(why)

    def _json(self, path):
        body = self._get(path)
        if body is None:
            return None
        try:
            return json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
        except ValueError:
            self._backoff("JSON が読めない")

    def _text(self, path):
        body = self._get(path)
        if body is None:
            return None
        return body.decode("utf-8", "replace") if isinstance(body, bytes) else body

    def fetch_detail(self, aegis, base=None):
        """詳細ページを取って mobs に入れる。"""
        with self.lock:
            r = self.mobs.get(aegis)
            if r and r.get("d"):
                return r
        t = self._text("/monster/" + urllib.parse.quote(aegis, safe="_-"))
        det = parse_detail(t) if t else None
        with self.lock:
            r = self.mobs.setdefault(aegis, dict(base or {}))
            if det:
                r.update(det)
                r["d"] = 1
            else:
                r["d"] = 0
                r.setdefault("jname", (base or {}).get("jname") or "")
            r["t"] = int(self._clock())
            self._by_name = None
            self.changed = True
        return r

    def fetch_item(self, iid):
        """アイテムのページを1件取る。名前などを self.items に覚える。見つからなければ item_misses に。"""
        iid = str(iid)
        html = self._text("/item/{}/".format(iid))
        if html is None:
            self.item_misses[iid] = self._clock()
            self.changed = True
            return None
        r = parse_item(html)
        with self.lock:
            if r is None:
                self.item_misses[iid] = self._clock()
            else:
                r["t"] = int(self._clock())
                self.items[iid] = r
            self.changed = True
        return r

    def item_names(self):
        """{アイテムの番号(文字): 名前}。集めてあるもの"""
        with self.lock:
            return {k: v.get("name") for k, v in self.items.items() if v.get("name")}

    def ensure_name(self, name):
        """名前から集める: 公式の一覧に載っていればそこから、無ければ検索して、詳細まで。"""
        n = norm(name)
        if not n:
            return
        with self.lock:
            have = [self.mobs[a] for a in self._index().get(n, [])]
        if have and all(r.get("d") for r in have):
            return
        if have:
            for a in [a for a in self._index().get(n, []) if not self.mobs[a].get("d")]:
                self.fetch_detail(a)
            return
        if self._recent_miss(name):
            return
        ids = self.map_index().get(n)
        if ids:
            for a in ids:
                self.fetch_detail(a, {"jname": name})
            return
        data = self._json("/monster_filtered_search/?name={}&detail=1".format(urllib.parse.quote(name)))
        hits = []
        if isinstance(data, list):
            for d in data:
                if isinstance(d, dict) and norm(d.get("JName")) == n:
                    hits.append(d)
        if not hits:
            with self.lock:
                self.misses[name] = int(self._clock())
                self.changed = True
            return
        for d in hits:
            a = str(d.get("Name") or "").strip()
            if a:
                self.fetch_detail(a, from_search(d))

    def ensure_md_maps(self, md_name, suffixes):
        """MD の名前から、入ったマップの出現モンスターの一覧を集める(マップごとに1回)。"""
        if not md_name:
            return
        with self.lock:
            m = self.mdmaps.get(md_name)
        if m is None:
            files = []
            tried = []
            field = md_name.startswith("フィールド ")
            if field:          # @ の無いマップ(bl_ice など): 通信のマップ名がそのまま公式のファイル名。公式の一覧(1回)から探す
                if not self.maplist:
                    self.fetch_maplist()
                files = [[f, n] for f, n in self.maplist if f == md_name[len("フィールド "):]]
            for q in (() if field else (md_name, re.sub(r"[（(][^（）()]*[）)]\s*$", "", md_name).strip())):     # 名前のとおり → 後ろの（ノーマル）などをはずして
                if not q or q in tried:
                    continue
                tried.append(q)
                data = self._json("/map_filtered_search/?name={}".format(urllib.parse.quote(q)))
                if isinstance(data, list):
                    files = [[str(d.get("map_file") or ""), str(d.get("map_name") or "")] for d in data if isinstance(d, dict) and d.get("map_file")]
                if any(f.split("@")[-1] in (suffixes or []) for f, _ in files):
                    break
            with self.lock:
                m = self.mdmaps[md_name] = {"files": files, "t": int(self._clock())}
                self.changed = True
        for suf in suffixes:
            for mf in self.map_files_for(md_name, suf):
                if mf in self.maps:
                    continue
                t = self._text("/map/" + urllib.parse.quote(mf, safe="@_-"))
                mons = parse_map(t) if t else []
                with self.lock:
                    self.maps[mf] = {"name": next((n for f, n in m["files"] if f == mf), ""), "mons": mons, "t": int(self._clock())}
                    self.changed = True

    def _recent_miss(self, name):
        t = self.misses.get(name)
        return t is not None and self._clock() - t < MISS_KEEP

    def _recent_item_miss(self, iid):
        t = self.item_misses.get(str(iid))
        return t is not None and self._clock() - t < MISS_KEEP

    def pending(self, wanted):
        """これから取りにいく名前の数(目安)。"""
        n = 0
        with self.lock:
            n += sum(1 for i in wanted.get("items") or [] if str(i) not in self.items and not self._recent_item_miss(i))
            for ae, _ in wanted.get("aegis") or []:
                if (self.mobs.get(ae) or {}).get("d") is None:
                    n += 1
            for name in wanted.get("names") or []:
                have = self._index().get(norm(name))
                if have:
                    n += sum(1 for a in have if not self.mobs[a].get("d"))
                elif not self._recent_miss(name):
                    n += 1
        return n

    def run_once(self, wanted):
        """wanted = {"names": [名前, …](大事な順), "maps": [[MD の名前, [マップの後ろの部分, …]], …]}。やることが無ければすぐ終わる。"""
        if not self.enabled:
            self.state = "off"
            return "off"
        if self._clock() < self.pause_until:
            self.state = "paused"
            return "paused"
        if not self._run_lock.acquire(False):
            return "busy"                      # もう1つの作業が動いている → 重ねない(サイトに同時に2つ聞かない)
        self.state = "working"
        self.budget = RUN_MAX
        self.last_error = ""
        try:
            for iid in wanted.get("items") or []:           # 名前の分からないアイテム(新しい装備など。ラトリオ・名前の表にまだ無いもの)。公式のアイテムのページから
                iid = str(iid)
                if iid not in self.items and not self._recent_item_miss(iid):
                    self.fetch_item(iid)
            for ae, nm in wanted.get("aegis") or []:        # ゲームの番号から分かった ID名は、名前で探さずに直接取る(1件で済む・同じ名前の別物と混ざらない)
                if (self.mobs.get(ae) or {}).get("d") is None:
                    self.fetch_detail(ae, {"jname": nm})
            for name in wanted.get("names") or []:
                self.ensure_name(name)
            for md, sufs in wanted.get("maps") or []:
                self.ensure_md_maps(md, sufs)
            # 出現モンスターの一覧が小さいマップは、そこのモンスターの詳細も集める(候補を絞るときにスキルが要る)
            for md, sufs in wanted.get("maps") or []:
                for jn, ids in self.monsters_on(md, sufs).items():
                    if len(self.monsters_on(md, sufs)) > SMALL_MAP:
                        break
                    for a in ids:
                        if not (self.mobs.get(a) or {}).get("d"):
                            self.fetch_detail(a, {"jname": jn})
            res = "done"
        except Stop as e:
            res = "stop: {}".format(e)
        finally:
            try:
                self.last_run = self._clock()
                if self.changed:
                    self.save()
                if self.on_items is not None:
                    try:
                        self.on_items(self.item_names())
                    except Exception as e:
                        self.log("[公式] アイテムの名前を反映できませんでした: {}".format(e))
            finally:
                self.state = "paused" if self._clock() < self.pause_until else "idle"
                self._run_lock.release()
        return res

    # ---------- マップ読み込み(画面から。1つのマップを、ゆっくり丸ごと取る) ----------
    def _bytes(self, path):
        return self._get(path)

    def _img_name(self, src):
        """画像の場所 → 保存するファイル名(安全な文字だけ)。"""
        n = os.path.basename(urllib.parse.urlparse(src or "").path)
        return n if re.match(r"^[\w@.\-]+\.(png|jpg|jpeg|gif)$", n) else ""

    def img_path(self, name):
        n = self._img_name(name)
        return os.path.join(self.mapdir, n) if n else ""

    def map_search(self, q, limit=60):
        """マップの一覧から名前・ファイル名で探す(ひらがな/カタカナ・全角半角はそろえる)。[[ファイル名, マップ名, 取り込みずみか], …]"""
        k = norm(q)
        with self.lock:
            rows = list(self.maplist)
            have = set(self.maps)
        out = []
        for f, n in rows:
            if not k or k in norm(n) or k in norm(f):
                out.append([f, n, f in have and bool(self.maps[f].get("page"))])
                if len(out) >= limit:
                    break
        return out

    def map_files_by_suffix(self, name):
        """ゲームの中のマップ名(MD の中は「0ef1@ct0」)→ 公式のマップのファイル名の候補。フィールドは同じ名前、MD は @ の後ろが同じもの。"""
        name = str(name or "")
        suf = name.split("@")[-1] if "@" in name else ""
        with self.lock:
            rows = list(self.maplist)
        if "@" in name:
            return [[f, n] for f, n in rows if f.split("@")[-1] == suf]
        return [[f, n] for f, n in rows if f == name]

    def fetch_maplist(self):
        data = self._json("/map_filtered_search/?name=")
        if isinstance(data, list):
            with self.lock:
                self.maplist = [[str(d.get("map_file") or ""), str(d.get("map_name") or "")] for d in data if isinstance(d, dict) and d.get("map_file")]
                self.maplist_t = int(self._clock())
                self.changed = True

    def map_view(self, mf):
        """画面に出す形: ページの内容 + 出現モンスターごとの詳細(取れている分)。無ければ None。"""
        with self.lock:
            m = self.maps.get(mf)
            if not m or not m.get("page"):
                return None
            mons = []
            for a, jn in m.get("mons") or []:
                r = self.mobs.get(a) or {}
                mons.append({"id": a, "jname": r.get("jname") or jn, "lv": r.get("lv"), "hp": r.get("hp"), "ele": r.get("ele"), "race": r.get("race"),
                             "size": r.get("size"), "cls": r.get("cls"), "def": r.get("def"), "mdef": r.get("mdef"), "skills": r.get("skills") or [],
                             "d": bool(r.get("d"))})
            return {"file": mf, "name": m.get("name") or m.get("title") or mf, "title": m.get("title") or "", "img": self._img_name(m.get("img")),
                    "props": m.get("props") or [], "blocked": m.get("blocked") or [], "mons": mons, "t": m.get("t") or 0,
                    "small": len(mons) <= self.SMALL_MAP}

    def load_map(self, mf, details=True, max_details=SMALL_MAP):
        """1つのマップを取る: ページ → 画像 → (出現モンスターが少ないマップなら)モンスターの詳細。
        取りにいく作業とは別に動くが、サイトへの間隔(3秒)は共通。同じ時に動くのは1つだけ。休み中・オフなら何もしない。"""
        mf = str(mf or "")
        if not re.match(r"^[\w@.\-]+$", mf):
            return "bad"
        if not self.enabled:
            self.map_job = {"file": mf, "state": "error", "done": 0, "total": 0, "msg": "公式サイトからの取得がオフです（被ダメタブで入り切りできます）"}
            return "off"
        if self._clock() < self.pause_until:
            self.map_job = {"file": mf, "state": "error", "done": 0, "total": 0, "msg": "サイトの調子が悪かったので、しばらく休んでいます"}
            return "paused"
        if not self._run_lock.acquire(False):             # 裏の収集と同じ鍵: サイトに同時に2つ聞かない
            self.map_job = {"file": mf, "state": "error", "done": 0, "total": 0, "msg": "いま裏でモンスター情報を集めている最中です。少ししてからもう一度押してください"}
            return "busy"
        self._tl.free = True
        job = self.map_job = {"file": mf, "state": "loading", "done": 0, "total": 1, "msg": "ページを取っています"}
        try:
            if not self.maplist:
                job["msg"] = "マップの一覧を取っています"
                self.fetch_maplist()
            job["msg"] = "ページを取っています"
            t = self._text("/map/" + urllib.parse.quote(mf, safe="@_-"))
            pg = parse_map_page(t) if t else None
            if not pg:
                job.update(state="error", msg="公式サイトにこのマップのページが見つかりませんでした")
                return "none"
            with self.lock:
                self.maps[mf] = {"name": next((n for f, n in self.maplist if f == mf), "") or pg["title"], "title": pg["title"], "mons": pg["mons"],
                                 "img": pg["img"], "props": pg["props"], "blocked": pg["blocked"], "page": 1, "t": int(self._clock())}
                self.changed = True
            nm = self._img_name(pg["img"])
            if nm and not os.path.isfile(os.path.join(self.mapdir, nm)):
                job["msg"] = "マップの画像を取っています"
                body = self._bytes(urllib.parse.urlparse(pg["img"]).path)
                if body:
                    os.makedirs(self.mapdir, exist_ok=True)
                    tmp = os.path.join(self.mapdir, nm + ".tmp")
                    with open(tmp, "wb") as f:
                        f.write(body)
                    os.replace(tmp, os.path.join(self.mapdir, nm))
            todo = []
            if details and 0 < len(pg["mons"]) <= self.SMALL_MAP:
                todo = [(a, jn) for a, jn in pg["mons"] if (self.mobs.get(a) or {}).get("d") is None][:max_details]      # 前に取れなかったもの(d=0)は取り直さない
            job.update(done=0, total=len(todo))
            for i, (a, jn) in enumerate(todo):
                job.update(done=i, msg="モンスターの情報を取っています（{}/{}）".format(i + 1, len(todo)))
                self.fetch_detail(a, {"jname": jn})
            job.update(state="done", done=len(todo), msg="")
            return "done"
        except Stop as e:
            job.update(state="error", msg="途中で止まりました（{}）。取れた分は残してあります".format(e))
            return "stop"
        except Exception as e:                  # 画像が書けないなど。取れた分は残す
            job.update(state="error", msg="読み込めませんでした（{}）".format(type(e).__name__))
            return "error"
        finally:
            self._tl.free = False
            try:
                if self.changed:
                    self.save()
            finally:
                self._run_lock.release()

    def start_map(self, mf):
        """画面の「読み込む」: 裏で動かす。もう動いているなら False。(返す前に「読み込み中」にして、直後の問い合わせが古い状態を読まないように)"""
        with self.lock:
            if self.map_job.get("state") == "loading":
                return False
            self.map_job = {"file": str(mf or ""), "state": "loading", "done": 0, "total": 1, "msg": "始めています"}
        th = threading.Thread(target=lambda: self.load_map(mf), name="official-map", daemon=True)
        th.start()
        return True

    # ---------- 裏で動かす ----------
    def start(self, wanted_fn, first_delay=90, every=1800):
        """アプリを開いてしばらくたってから、やることがあれば取りにいく(以後 30 分おき)。wanted_fn() が見るもの。"""
        def loop():
            self._sleep(first_delay)
            while True:
                try:
                    w = wanted_fn()
                    if self.enabled and (self.pending(w) or self._maps_todo(w)):
                        self.log("[公式] モンスター情報を集めます(名前 {} 件)".format(self.pending(w)))
                        res = self.run_once(w)
                        self.log("[公式] 今回の作業: {}(取った件数 {})".format(res, RUN_MAX - self.budget))
                except Exception as e:                  # 裏の作業で表の動きを止めない
                    self.log("[公式] 作業でエラー: {}".format(e))
                self._sleep(every)
        th = threading.Thread(target=loop, name="official-collector", daemon=True)
        th.start()
        self._thread = th
        return th

    def _maps_todo(self, wanted):
        for md, sufs in wanted.get("maps") or []:
            if md not in self.mdmaps:
                return True
            for suf in sufs:
                if any(mf not in self.maps for mf in self.map_files_for(md, suf)):
                    return True
            mons = self.monsters_on(md, sufs)
            if 0 < len(mons) <= SMALL_MAP and any(not (self.mobs.get(a) or {}).get("d") for ids in mons.values() for a in ids):
                return True
        return False

    def kick(self, wanted):
        """「今すぐ調べる」: 休み中でなければ、いま1回だけ裏で動かす。"""
        if self.state == "working" or not self.enabled or self._clock() < self.pause_until:
            return False                       # 作業中・オフ・サイトの調子が悪くて休み中(休みは途中で解除しない)
        th = threading.Thread(target=lambda: self.run_once(wanted), name="official-kick", daemon=True)
        th.start()
        return True
