# -*- coding: utf-8 -*-
"""
md_tracker.py  —  Fox_MD_Tracker (ROのMDクールタイム自動記録ツール)

ROの通信を「読むだけ」で、キャラごとの MD の再入場できる時刻を記録して、
自分用のウェブページ(Netlify)に送ります。ゲームには何も送りません。

  python md_tracker.py            … 常駐(通信を読み続ける)
  python md_tracker.py --replay X … リプレイファイル X(.rrf)を読むだけ(確認用)
  python md_tracker.py --once     … 今ある記録をウェブに送るだけ
"""
import argparse
import json
import os
import sys
import threading
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))
sys.path.insert(0, HERE)

import guild_packet as gp   # 通信の切り分け(ギルドトラッカーと共通)
import md_core
import quest_names
try:
    import char_core          # キャラのステ・装備を拾う(無くても動く)
except Exception:
    char_core = None

VERSION = "2.9.1"
try:
    from edition import DEV   # 開発版かどうか(ビルドで書きかわる)
except Exception:
    DEV = False
EDITION = "開発版" if DEV else "公開版"
CONFIG_FILE = os.path.join(HERE, "設定.json")
STATE_FILE = os.path.join(HERE, "md_state.json")
CHAR_STATE_FILE = os.path.join(HERE, "char_state.json")
DMG_FILE = os.path.join(HERE, "被ダメ記録.json")
SKILL_FIX_FILE = os.path.join(HERE, "スキル名の手直し.json")     # 手で付けたスキル名 {"番号": "名前"}
DMG_RAW_FILE = os.path.join(HERE, "被ダメ_確認用データ.json")   # 通信そのもの(形を確かめる用)
NAMES_CACHE = os.path.join(HERE, "quest_names_cache.json")
LOCK_FILE = os.path.join(os.environ.get("TEMP", "/tmp"), "md_tracker.lock")
LOG_FILE = os.path.join(HERE, "動作ログ.txt")

_print = print


GUI = sys.stdout is None or "--tray" in sys.argv   # 黒い画面なし(タスクトレイ常駐)
if sys.stdout is None:   # exe(--noconsole)だと出力先が無い → 部品のエラー表示で落ちないように
    sys.stdout = sys.stderr = open(os.path.join(HERE, "エラーログ.txt"), "a", encoding="utf-8", buffering=1)
TRAY = None
SHOW_HOOK = None   # 専用の窓を前に出す関数(窓があるとき)
UPD = None         # updater.Updater(アップデート)
QUIT_HOOK = None   # アプリを終える関数(アップデートの入れ替え用)


def print(*a, **k):  # noqa: A001  画面とファイルの両方に出す
    if not GUI:
        _print(*a, **k)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(time.strftime("%m/%d %H:%M:%S ") + " ".join(str(x) for x in a) + "\n")
    except Exception:
        pass

DEFAULT_CONFIG = {
    "_説明": "空欄(\"\")はおまかせ。変えたら起動し直してね",
    "ROフォルダ": "",
    "ウェブのURL": "",
    "ウェブの送信キー": "",
    "ウェブに送る": True,
    "アップデートを確認": True,
    "耐性シートURL": "",
    "ネットワーク名": "",
}
RO_DIRS = [r"C:\Gravity\Ragnarok", r"C:\Program Files (x86)\Gravity\Ragnarok",
           r"C:\Program Files\Gravity\Ragnarok", r"D:\Gravity\Ragnarok"]


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
                cfg.update(json.load(f))
        except Exception as e:
            print("設定.json が読めませんでした:", e)
    else:
        # ギルドトラッカーの設定が近くにあれば、ウェブ以外(ROフォルダ等)はそっちを参考にする
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print("設定.json を作りました。(ウェブに送らないなら空欄のままでOK)")
    return cfg


def find_ro_dir(cfg):
    cands = [cfg.get("ROフォルダ")] + RO_DIRS
    for d in cands:
        if d and os.path.isdir(os.path.join(d, "System")):
            return d
    return None


def single_instance():
    try:
        if os.path.exists(LOCK_FILE):
            with open(LOCK_FILE) as f:
                pid = int(f.read().strip() or 0)
            if pid and pid != os.getpid() and _alive(pid):
                return False
        with open(LOCK_FILE, "w") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass
    return True


def _alive(pid):
    if os.name == "nt":
        import ctypes
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
        if not h:
            return False
        code = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
        ctypes.windll.kernel32.CloseHandle(h)
        return code.value == 259
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


# ---------------------------------------------------------------
#  記録の保存とウェブ送信
# ---------------------------------------------------------------
def save_state(core):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(core.snapshot(), f, ensure_ascii=False)
    os.replace(tmp, STATE_FILE)
    save_accounts(core)


ACCOUNTS_FILE = os.path.join(HERE, "accounts.json")


def load_accounts(core):
    """自分のアカウントID(起動し直しても、すぐ自分のキャラを見分けられるように)。"""
    try:
        with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
            core.account_aids |= set(int(x) for x in json.load(f))
    except Exception:
        pass


def save_accounts(core):
    try:
        with open(ACCOUNTS_FILE, "w", encoding="utf-8") as f:
            json.dump(sorted(core.account_aids), f)
    except Exception:
        pass


NYAR_FIX_FILE = os.path.join(HERE, "nyar_fix.json")


def apply_nyar_fix(core):
    """nyar_fix.json があれば、ニャル様の回数をその内容で上書きする(1回だけ。終わったら名前を変える)。"""
    if not os.path.exists(NYAR_FIX_FILE):
        return
    try:
        with open(NYAR_FIX_FILE, "r", encoding="utf-8") as f:
            fix = json.load(f)
        for name, ny in fix.items():
            core._char(name)["nyar"] = ny
            print("[ニャル様] {} の今週の回数を {} に補正しました".format(name, ny.get("count")))
        core.changed = True
        os.replace(NYAR_FIX_FILE, NYAR_FIX_FILE + ".done")
    except Exception as e:
        print("nyar_fix.json を読めませんでした:", e)


def load_state(core):
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                core.restore(json.load(f))
        except Exception as e:
            print("記録ファイルが読めませんでした(新しく作ります):", e)


def build_payload(core, history=100):
    chars = {}
    used = set()
    where = core.where()
    for name, ch in core.chars.items():
        qs = {str(q): v["end"] for q, v in ch["quests"].items()}
        used.update(ch["quests"].keys())
        chars[name] = {"seen": ch.get("seen", 0), "quests": qs}
        info = dict(core.char_info.get(name, {}))
        if info.get("account") is None and len(core.account_aids) == 1:
            info["account"] = next(iter(core.account_aids))   # アカウントが1つだけならそれ
        for k in ("lv", "job", "account"):
            if info.get(k) is not None:
                chars[name][k] = info[k]
        if ch.get("nyar"):
            chars[name]["nyar"] = ch["nyar"]
        if name in where:
            chars[name]["at"] = where[name]
        if DMG is not None:
            d = DMG.for_char(name)
            if d:
                chars[name]["dmg"] = d          # 被ダメのまとめ(MDごと)
            ail, act = DMG.for_char_status(name)
            if ail:
                chars[name]["ail"] = ail        # 受けた状態異常(MDごと)
            if act:
                chars[name]["act"] = act        # ダメージの無い技(MDごと)
            g = DMG.for_char_gear(name)
            if g:
                chars[name]["dmg_g"] = g        # 被ダメのまとめ(MDごと・装備セットごと)
        # イベント用クエスト: {ID: [イベント名, 種類]} (キャラの中に入れるとサーバー側の変更なしで届く)
        ev = {str(q): [core.events[q]["g"], core.events[q]["s"]] for q in ch["quests"] if q in core.events}
        if ev:
            chars[name]["ev"] = ev
    titles = {str(q): core.title(q) for q in used}
    spans = {str(q): core.quest_meta.get(q, {}).get("span", 0) for q in used}
    return {"version": VERSION, "edition": EDITION, "updated": int(time.time()), "chars": chars,
            "titles": titles, "spans": spans, "history": core.history[-history:]}


# ---------------------------------------------------------------
#  PCだけで見るリアルタイム画面 http://127.0.0.1:8788/
#  (この PC の中だけ。ネットには出ない・Netlifyのクレジットも使わない)
# ---------------------------------------------------------------
LIVE_PORT = 8788
VIEW_SETTINGS_FILE = os.path.join(HERE, "表示の設定.json")   # ローカル表示の設定(MDの分類・キャラの並び など)


def resource(name):
    """同梱ファイル: exe/スクリプトの隣にあればそれ、無ければ exe の中(PyInstaller)。"""
    for d in (HERE, getattr(sys, "_MEIPASS", None)):
        if d and os.path.exists(os.path.join(d, name)):
            return os.path.join(d, name)
    return None


def local_url():
    return "http://127.0.0.1:{}/".format(LIVE_PORT)
_SHEET_CACHE = {"t": 0, "url": "", "body": None}


def _sheet_csv(url):
    """耐性シート(CSV)を取ってくる。60秒はキャッシュ。"""
    c = _SHEET_CACHE
    if c["body"] is not None and c["url"] == url and time.time() - c["t"] < 60:
        return c["body"]
    req = urllib.request.Request(url, headers={"User-Agent": "Fox_MD_Tracker"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read()
    if b"<html" in body[:500].lower():
        raise ValueError("シートが公開されていません")
    c.update(t=time.time(), url=url, body=body)
    return body


def start_live_server(core, lock, cfg):
    import http.server
    import socketserver

    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype):
            if isinstance(body, str):
                body = body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _file(self, name, ctype):
            path = resource(name)
            if not path:
                return self._send(404, name + " がありません", "text/plain; charset=utf-8")
            with open(path, "rb") as f:
                return self._send(200, f.read(), ctype)

        def _local_only(self):
            """ほかのサイトから勝手に書き換えられないように(この PC のページからだけ受け付ける)"""
            o = self.headers.get("Origin")
            return o in (None, "", "null") or o.rstrip("/") in ("http://127.0.0.1:%d" % LIVE_PORT, "http://localhost:%d" % LIVE_PORT)

        def _settings(self):
            try:
                with open(VIEW_SETTINGS_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (OSError, ValueError):
                return {}

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/index.html", "/app.html"):
                return self._file("app.html", "text/html; charset=utf-8")
            if DEV and path in ("/live", "/live.html"):   # 耐性リアルタイムは開発版だけ
                return self._file("live.html", "text/html; charset=utf-8")
            if path == "/api/data":
                with lock:
                    data = build_payload(core, history=300)
                    if DMG is not None:
                        data["dmg_recent"] = DMG.recent[-200:]
                        data["dmg_skills"] = DMG.seen_list()
                        data["dmg_kinds"] = DMG.kinds()
                        data["dmg_sets"] = DMG.sets
                    if CHARS is not None:
                        data["equip"] = CHARS.equip_view()
                return self._send(200, json.dumps({"data": data, "settings": self._settings()}, ensure_ascii=False),
                                  "application/json; charset=utf-8")
            if path == "/api/update":
                st = UPD.status() if UPD else {"current": VERSION, "state": "off", "can_install": False}
                return self._send(200, json.dumps(st, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/__show":
                (SHOW_HOOK or open_browser)()
                return self._send(200, "ok", "text/plain")
            if path == "/now.json":
                with lock:
                    w = core.where()
                    cur = [n for n in core.currents.values() if n]
                return self._send(200, json.dumps({"now": int(time.time()), "where": w, "current": cur}, ensure_ascii=False),
                                  "application/json; charset=utf-8")
            if path == "/sheet.csv":
                url = resist_csv_url(cfg.get("耐性シートURL"))
                try:
                    return self._send(200, _sheet_csv(url), "text/csv; charset=utf-8")
                except Exception as e:
                    return self._send(502, "シートを読めませんでした: {}".format(e), "text/plain; charset=utf-8")
            return self._send(404, "not found", "text/plain")

        def do_POST(self):
            if self.path.startswith("/api/update") and self._local_only():
                if UPD is None:
                    return self._send(400, "off", "text/plain")
                if "do=install" in self.path:
                    st = UPD.download_and_install(QUIT_HOOK or (lambda: os._exit(0)))
                else:
                    st = UPD.check()
                return self._send(200, json.dumps(st, ensure_ascii=False), "application/json; charset=utf-8")
            if self.path.split("?")[0] == "/api/equipset" and self._local_only():
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 10000)).decode("utf-8"))
                    if CHARS is None:
                        raise ValueError
                    with lock:
                        if b.get("delete"):
                            CHARS.delete_set(str(b["char"]), str(b["sid"]))
                        else:
                            CHARS.rename_set(str(b["char"]), str(b["sid"]), str(b.get("name") or ""))
                        save_chars()
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, '{"ok":true}', "application/json")
            if self.path.split("?")[0] == "/api/skillname" and self._local_only():
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 10000)).decode("utf-8"))
                    sk = int(b["id"])
                    if DMG is None or sk <= 0:
                        raise ValueError
                    with lock:
                        if "name" in b:
                            DMG.rename(sk, str(b.get("name") or ""))
                        if "ele" in b or "kind" in b:
                            fx = DMG.efix.get(sk) or {}
                            DMG.set_attr(sk, str(b.get("ele", fx.get("ele")) or ""), str(b.get("kind", fx.get("kind")) or ""))
                        save_skill_fix()
                        save_dmg()
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, '{"ok":true}', "application/json")
            if self.path.split("?")[0] != "/api/data" or not self._local_only():
                return self._send(403, "forbidden", "text/plain")
            try:
                n = int(self.headers.get("Content-Length") or 0)
                s = json.loads(self.rfile.read(min(n, 300000)).decode("utf-8"))
                if not isinstance(s, dict):
                    raise ValueError
                tmp = VIEW_SETTINGS_FILE + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(s, f, ensure_ascii=False, indent=1)
                os.replace(tmp, VIEW_SETTINGS_FILE)
            except Exception:
                return self._send(400, "bad data", "text/plain")
            return self._send(200, '{"ok":true}', "application/json")

        def do_DELETE(self):
            if self.path.startswith("/api/dmg") and self._local_only():
                from urllib.parse import urlparse, parse_qs
                who = (parse_qs(urlparse(self.path).query).get("char") or [""])[0]
                with lock:
                    if DMG is not None:
                        DMG.clear(who or None)
                        save_dmg()
                return self._send(200, '{"ok":true}', "application/json")
            if not self.path.startswith("/api/data") or not self._local_only():
                return self._send(403, "forbidden", "text/plain")
            from urllib.parse import urlparse, parse_qs
            name = (parse_qs(urlparse(self.path).query).get("char") or [""])[0]
            with lock:
                if core.chars.pop(name, None) is not None:
                    core.changed = True
            return self._send(200, '{"ok":true}', "application/json")

    class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    try:
        srv = S(("127.0.0.1", LIVE_PORT), H)
    except OSError as e:
        print("リアルタイム画面を開けませんでした(ポート{}が使用中?): {}".format(LIVE_PORT, e))
        return None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    if DEV:
        print("この PC で見るページ: {}  (リアルタイム耐性は {}live)".format(local_url(), local_url()))
    else:
        print("この PC で見るページ: {}".format(local_url()))
    return srv


RESIST_SHEET_ID = "1AFcb8-JhY5tklH2j-NntGX6ZvSmzix3GYTC6UaVVseA"


def resist_csv_url(s):
    """シートのURL/ID → CSVのURL(ウェブ版と同じルール)"""
    import re
    s = (s or "").strip() or RESIST_SHEET_ID
    if "output=csv" in s or "tqx=out:csv" in s:
        return s
    m = re.search(r"/d/(e/)?([\w-]{20,})", s) or re.match(r"^()([\w-]{20,})$", s)
    if not m:
        return ""
    if m.group(1):
        return "https://docs.google.com/spreadsheets/d/e/{}/pub?output=csv".format(m.group(2))
    return "https://docs.google.com/spreadsheets/d/{}/gviz/tq?tqx=out:csv&headers=1&sheet=MD%E8%80%90%E6%80%A7".format(m.group(2))


def web_on(cfg):
    """ウェブ(Netlify)に送るか。「ウェブに送る」が false なら送らない(URLは残したまま止められる)。"""
    return cfg.get("ウェブに送る", True) is not False and bool((cfg.get("ウェブのURL") or "").strip())


def upload(cfg, payload):
    if not web_on(cfg):
        return None
    url = (cfg.get("ウェブのURL") or "").strip().rstrip("/")
    key = (cfg.get("ウェブの送信キー") or "").strip()
    if not url or not key:
        return None
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url + "/api/upload", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "x-upload-token": key})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200
    except Exception as e:
        print("[ウェブ] 送信に失敗:", e)
        return False


# ---------------------------------------------------------------
#  通信を読む
# ---------------------------------------------------------------
class _Scanner(gp.StreamScanner):
    def __init__(self, core, key, lock):
        gp.StreamScanner.__init__(self, lambda e: None)
        self.core, self.key, self.lock = core, key, lock

    def _handle(self, pkt):
        if len(pkt) >= 2:
            op = pkt[0] | (pkt[1] << 8)
            if op in md_core.WANT_OPS or op in (0x08C8, 0x01DE, 0x09FD, 0x09FE, 0x09FF, 0x0095, 0x0A30, 0x0ADF, 0x0983, 0x0229, 0x09CB):   # 被ダメ関係も数える
                STATS["ops"][op] = STATS["ops"].get(op, 0) + 1
        with self.lock:
            try:
                self.core.feed(self.key, pkt)
            except Exception as e:
                STATS["errors"] += 1
                if STATS["errors"] <= 5:
                    import traceback
                    print("[解析エラー]", repr(e), traceback.format_exc().splitlines()[-2:])
            if DMG is not None:
                try:
                    DMG.feed(self.key, pkt)
                except Exception:
                    pass
            if CHARS is not None:
                try:
                    CHARS.feed(self.key, pkt)
                except Exception:
                    pass


STATS = {"segments": 0, "ops": {}, "errors": 0, "conns": set()}
CHARS = None   # char_core.CharCore (あれば)
DMG = None     # dmg_core.DmgCore (被ダメの記録)


def _write_json(path, obj, indent=None):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
    os.replace(tmp, path)


def save_dmg():
    if DMG is None:
        return
    try:
        _write_json(DMG_FILE, DMG.snapshot())
        if DMG.raw:
            _write_json(DMG_RAW_FILE, DMG.raw_snapshot(), indent=1)
    except Exception as e:
        print("[被ダメ] 保存に失敗:", e)


def save_chars():
    if CHARS is None:
        return
    try:
        _write_json(CHAR_STATE_FILE, CHARS.snapshot())
    except Exception as e:
        print("[キャラ] 保存に失敗:", e)


def load_skill_fix():
    """スキル名の手直し.json → (名前, 種類・属性)。中身は {"番号": "名前"} か {"番号": {"name", "ele", "kind"}}"""
    names, attrs = {}, {}
    try:
        with open(SKILL_FIX_FILE, "r", encoding="utf-8") as f:
            for k, v in json.load(f).items():
                if isinstance(v, dict):
                    if str(v.get("name") or "").strip():
                        names[int(k)] = str(v["name"])
                    a = {x: v[x] for x in ("ele", "kind") if v.get(x)}
                    if a:
                        attrs[int(k)] = a
                elif str(v).strip():
                    names[int(k)] = str(v)
    except FileNotFoundError:
        pass
    except Exception as e:
        print("[被ダメ] スキル名の手直しが読めませんでした:", e)
    return names, attrs


def save_skill_fix():
    out = {}
    for k in sorted(set(DMG.fix) | set(DMG.efix)):
        a = DMG.efix.get(k) or {}
        out[str(k)] = dict(a, name=DMG.fix[k]) if a and k in DMG.fix else (a if a else DMG.fix[k])
    _write_json(SKILL_FIX_FILE, out, indent=1)


def split_account_prefix(data, lengths):
    """キャラ選択サーバーは、つないだ直後に「名前なしの4バイト(アカウントID)」を送ってくる。
    それを見分けて (AID, 残り) を返す。違えば (None, data)。"""
    if len(data) < 4:
        return None, data
    op = data[0] | (data[1] << 8)
    if op in lengths:
        return None, data
    if len(data) == 4 or (len(data) >= 6 and (data[4] | (data[5] << 8)) in lengths):
        aid = int.from_bytes(data[:4], "little")
        if 0 < aid < 0x7FFFFFFF:
            return aid, data[4:]
    return None, data


class Sniffer(object):
    def __init__(self, core, lock, iface=None):
        self.core, self.lock, self.iface = core, lock, iface
        self.scanners = {}
        self.sniffer = None

    def start(self):
        from scapy.all import AsyncSniffer
        kw = {"filter": "tcp and src net {}".format(gp.RO_SERVER_NET), "prn": self._on, "store": False}
        if not self.iface:
            self.iface = pick_iface()
        if self.iface:
            kw["iface"] = self.iface
        print("[通信] 使うネットワーク:", self.iface or "(おまかせ)")
        self.sniffer = AsyncSniffer(**kw)
        self.sniffer.start()
        time.sleep(1.5)
        err = getattr(self.sniffer, "exception", None)
        if err is not None or not getattr(self.sniffer, "running", True):
            raise RuntimeError("通信の読み取りを始められませんでした: {}".format(err))

    def _strip_account(self, data, tcp):
        aid, rest = split_account_prefix(data, gp.load_lengths())
        if aid is not None:
            with self.lock:
                self.core.account(aid, self._cur_key)
            return rest
        return data

    def _on(self, p):
        try:
            from scapy.layers.inet import IP, TCP
            if IP not in p or TCP not in p:
                return
            ip, tcp = p[IP], p[TCP]
            if not ip.src.startswith(gp.RO_SERVER_PREFIX):
                return
            data = bytes(tcp.payload)
            if not data:
                return
            key = (ip.src, tcp.sport, ip.dst, tcp.dport)
            STATS["segments"] += 1
            if key not in STATS["conns"]:
                STATS["conns"].add(key)
                print("[通信] 新しい接続: {}:{} → {}:{}".format(*key))
            sc = self.scanners.get(key)
            if sc is None:
                with self.lock:
                    self.core._c(key)          # 新しい接続を覚える(キャラ選択サーバーなら、いまのキャラをリセット)
                sc = _Scanner(self.core, key, self.lock)
                self.scanners[key] = sc
                self._cur_key = key
                data = self._strip_account(data, tcp)
                if not data:
                    sc.next_seq = (tcp.seq + 4) & 0xFFFFFFFF
                    return
                if len(bytes(tcp.payload)) != len(data):
                    sc.feed_segment((tcp.seq + 4) & 0xFFFFFFFF, data)
                    return
            sc.feed_segment(tcp.seq, data)
            with self.lock:
                self.core.raw(key, data)
        except Exception as e:
            print("[通信] 読み取りエラー:", e)


def pick_iface():
    """ROのサーバーへ向かう回線(ルート)を選ぶ。わからなければ None(おまかせ)。"""
    try:
        from scapy.all import conf
        r = conf.route.route(gp.RO_SERVER_PREFIX + "201")
        ifc = r[0]
        name = getattr(ifc, "description", None) or getattr(ifc, "name", None) or ifc
        print("[通信] ROサーバーへの経路: 回線={} 自分のIP={}".format(name, r[1]))
        try:
            for i in conf.ifaces.values():
                print("[通信]   回線候補: {} / {} / {}".format(getattr(i, "name", ""), getattr(i, "description", ""), getattr(i, "ip", "")))
        except Exception:
            pass
        return ifc
    except Exception as e:
        print("[通信] 経路がわかりませんでした:", e)
        return None


def ensure_scapy():
    try:
        import scapy  # noqa
        return True
    except ImportError:
        if getattr(sys, "frozen", False):
            return False
        print("scapy を入れています…")
        import subprocess
        subprocess.call([sys.executable, "-m", "pip", "install", "--user", "scapy"])
        try:
            import scapy  # noqa
            return True
        except ImportError:
            return False


def run_replay(core, path):
    clock = [0.0]
    t0 = os.path.getmtime(path) - 3600
    core.now = lambda: t0 + clock[0] / 1000.0
    sc = _Scanner(core, "replay", threading.Lock())
    for t, p in gp.read_rrf_packets(path):
        clock[0] = t
        sc.feed(p)
        core.tick()
    clock[0] += 10000
    core.tick()
    core.now = time.time


def main():
    global CHARS
    ap = argparse.ArgumentParser()
    ap.add_argument("--replay")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--tray", action="store_true")
    ap.add_argument("--hidden", action="store_true")   # 窓を出さずにトレイだけ(Windows起動時の自動起動)   # 黒い画面なしでタスクトレイに常駐
    args = ap.parse_args()
    print("Fox_MD_Tracker v{} ({})".format(VERSION, EDITION))
    cfg = load_config()
    ro = find_ro_dir(cfg)
    names = {}
    if ro:
        names = quest_names.load_quest_names(os.path.join(ro, "System"), NAMES_CACHE)
        print("クエスト名: {}件 ({})".format(len(names), ro))
    else:
        print("ROのフォルダが見つかりません。設定.json の「ROフォルダ」に書いてください(例 C:\\\\Gravity\\\\Ragnarok)")
    core = md_core.MDCore(names, log=print)
    if ro:
        core.stages = quest_names.nlwd_stages(os.path.join(ro, "System"))
        try:
            core.events = quest_names.event_info(os.path.join(ro, "System"))
            print("イベントクエスト: {}件".format(len(core.events)))
        except Exception as e:
            print("イベントクエストを読めませんでした:", e)
    load_state(core)
    load_accounts(core)
    apply_nyar_fix(core)
    if char_core is not None:
        CHARS = char_core.CharCore(md=core, log=print)
        try:
            if os.path.exists(CHAR_STATE_FILE):
                with open(CHAR_STATE_FILE, "r", encoding="utf-8") as f:
                    CHARS.restore(json.load(f))
        except Exception as e:
            print("[キャラ] 記録が読めませんでした(新しく作ります):", e)

    global DMG
    try:
        import dmg_core
        SKFIX = load_skill_fix()
        DMG = dmg_core.DmgCore(core, dmg_core.load_skill_names(resource("skill_names.json") or ""), log=print,
                               fix=SKFIX[0], efix=SKFIX[1], info=dmg_core.load_skill_info(resource("skill_info.json") or ""))
        if os.path.exists(DMG_FILE):
            with open(DMG_FILE, "r", encoding="utf-8") as f:
                DMG.restore(json.load(f))
        print("被ダメの記録: スキル名 {}件 (手直し {}件)".format(len(DMG.skills), len(DMG.fix)))
        if CHARS is not None:
            DMG.gear = CHARS.gear_profile              # 当たったときの装備(鎧の属性・耐性・DEF・MDEF)も覚える
    except Exception as e:
        print("[被ダメ] 使えません:", e)
        DMG = None

    if args.replay:
        run_replay(core, args.replay)
        save_state(core)
        print(json.dumps(build_payload(core), ensure_ascii=False)[:500])
        r = upload(cfg, build_payload(core))
        print("ウェブ送信:", {None: "未設定", True: "OK", False: "失敗"}[r])
        return
    if args.once:
        r = upload(cfg, build_payload(core))
        print("ウェブ送信:", {None: "未設定", True: "OK", False: "失敗"}[r])
        return

    if not single_instance():
        print("もう動いています。")
        if not args.hidden:
            try:
                urllib.request.urlopen(local_url() + "__show", timeout=3).read()   # 動いている方の窓を前に出す
            except Exception:
                open_browser()
        if not GUI:
            time.sleep(3)
        return
    if not gp.npcap_available():
        if GUI:
            import tray
            if tray.message("通信を読むための部品「Npcap」が入っていません。\nインストール画面を開きますか？\n(画面の案内どおりに進めてOK)",
                            yesno=True):
                try:
                    gp.install_npcap()
                except Exception as e:
                    tray.message("自動で開けませんでした。https://npcap.com/ から入れてください。\n" + str(e), kind="warn")
                for _ in range(400):                    # 最大20分、入るのを待つ
                    if gp.npcap_available():
                        break
                    time.sleep(3)
            if not gp.npcap_available():
                tray.message("Npcap が入っていないので終了します。入れてからもう一度起動してね。", kind="warn")
                return
        else:
            print("Npcap(通信を読む部品)が入っていません。インストール画面を開きます。")
            try:
                gp.install_npcap()
            except Exception as e:
                print("自動で開けませんでした。 https://npcap.com/ から入れてください:", e)
            input("インストールが終わったら Enter を押してね…")
    if not ensure_scapy():
        fail("scapy(通信を読む部品)が使えません。")
        return

    lock = threading.Lock()
    start_live_server(core, lock, cfg)   # 画面は先に出す(Npcapが無くても見られるように)
    sn = Sniffer(core, lock, cfg.get("ネットワーク名") or None)
    try:
        sn.start()
    except Exception as e:
        print(e)
        fail("通信の読み取りを始められませんでした。\nNpcap が入っているか確認してね (https://npcap.com/)\n\n{}".format(e))
        return
    print("通信を読んでいます。ROでログイン・マップ移動するとCTが記録されます。")
    local_only = upload(cfg, build_payload(core)) is None
    if local_only:
        print("※ ウェブには送りません(この PC だけで記録・表示します)")

    stop = threading.Event()
    if GUI:
        global TRAY
        import tray
        if tray.Tray.available():
            def status():
                with lock:
                    n = len(core.chars)
                    cur = [x for x in core.currents.values() if x]
                return "キャラ {}人{}".format(n, " / プレイ中: " + cur[0] if cur else "")
            # 専用の窓(pywebview)。使えなければブラウザで開く
            app = None
            try:
                import appwin
                if appwin.AppWindow.available():
                    app = appwin.AppWindow(local_url(), HERE, show=not args.hidden, log=print,
                                           on_hide=lambda: TRAY and TRAY.notify("右下のアイコンに隠れました。ダブルクリックでまた開けます。終了は右クリックから。", "Fox_MD_Tracker"))
            except Exception as e:
                print("[窓] 使えません:", e)

            def quit_all():
                stop.set()
                if app is not None:
                    app.quit()

            global UPD, QUIT_HOOK
            try:
                if DEV:
                    raise RuntimeError("開発版はリリースから更新しません(公開版で上書きされるため)")
                import updater
                UPD = updater.Updater(VERSION, cfg.get("アップデート元") or None, HERE, log=print,
                                      on_found=lambda info: TRAY and TRAY.notify(
                                          "新しい版 v{} があります。画面の上か、右クリックの「アップデート」から更新できます。".format(info["version"]),
                                          "Fox_MD_Tracker"))
                if UPD.frozen():
                    UPD.cleanup()
                if cfg.get("アップデートを確認", True) is not False:
                    UPD.start_background(stop)
            except Exception as e:
                print("[アップデート] 使えません:", e)
                UPD = None

            def quit_for_update():
                quit_all()
                try:
                    TRAY.icon.stop()
                except Exception:
                    pass
            QUIT_HOOK = quit_for_update

            def upd_text():
                if UPD is None:
                    return ""
                if UPD.state == "available":
                    return "アップデート (v{})".format(UPD.latest["version"])
                if UPD.state == "downloading":
                    return "アップデート中… {}%".format(UPD.progress)
                return "アップデートを確認 (いまは v{})".format(VERSION)

            def upd_act():
                if UPD is None:
                    return
                if UPD.state == "available":
                    UPD.download_and_install(quit_for_update)
                else:
                    st = UPD.check()
                    msg = {"none": "最新版です (v{})".format(VERSION), "available": "新しい版 v{} があります".format((st.get("latest") or {}).get("version"))}.get(st["state"], st.get("error") or "")
                    TRAY.notify(msg, "Fox_MD_Tracker")
            TRAY = tray.Tray(resource("tray.png") or resource("icon.ico"), local_url(), (local_url() + "live") if DEV else "",
                             ((cfg.get("ウェブのURL") or "").strip() if web_on(cfg) else ""), LOG_FILE, HERE,
                             on_quit=quit_all, status=status, open_main=(app.show if app else None),
                             update=(upd_text, upd_act))
            th = threading.Thread(target=run_loop, args=(core, lock, cfg, stop), daemon=True)
            th.start()
            if app is not None:
                global SHOW_HOOK
                SHOW_HOOK = app.show
                threading.Thread(target=TRAY.run, daemon=True).start()   # トレイは別の流れで
                try:
                    app.start()            # 窓(メインの流れ)。「終了」で戻ってくる
                    ok = True
                except Exception as e:
                    print("[窓] 開けませんでした(ブラウザで開きます):", e)
                    ok = False
                    SHOW_HOOK = None
                if ok or stop.is_set():
                    stop.set()
                    try:
                        TRAY.icon.stop()
                    except Exception:
                        pass
                    th.join(5)
                    with lock:
                        save_state(core)
                        save_dmg()
                        save_chars()
                    return
                TRAY.open_main = lambda: open_browser()
                if not args.hidden:
                    open_browser()
                while not stop.wait(1):    # トレイ(別の流れ)の「終了」を待つ
                    pass
            else:
                if local_only and not args.hidden:
                    open_browser()
                threading.Timer(2, lambda: TRAY.notify("右下のアイコンから画面を開けます。終了もここから。", "Fox_MD_Trackerを起動しました")).start()
                TRAY.run()                 # 「終了」が押されるまでここで待つ
            stop.set()
            th.join(5)
            with lock:
                save_state(core)
                save_dmg()
                save_chars()
            return
    print("(このウィンドウは最小化でOK。閉じると止まります)")
    if local_only:
        open_browser()
    run_loop(core, lock, cfg, stop)


def open_browser():
    try:
        import webbrowser
        webbrowser.open(local_url())
    except Exception:
        pass


def fail(msg):
    """続けられないエラー: 黒い画面なら表示して Enter 待ち、トレイ版ならお知らせ窓。"""
    print(msg)
    if GUI:
        import tray
        tray.message(msg, kind="error")
    else:
        input("Enter で終了")


def run_loop(core, lock, cfg, stop):
    last_up = 0
    dirty_since = None
    last_stat = time.time()
    last_dmg_save = 0
    while not stop.wait(1):
        if DMG is not None and DMG.changed and time.time() - last_dmg_save > 30:
            with lock:
                DMG.changed = False
                save_dmg()
            last_dmg_save = time.time()
        if time.time() - last_stat > 60:
            last_stat = time.time()
            ops = ", ".join("{:04X}×{}".format(k, v) for k, v in sorted(STATS["ops"].items()))
            print("[状況] 届いたかたまり {} / 接続 {} / 大事な通信: {} / キャラ {} / エラー {}".format(
                STATS["segments"], len(STATS["conns"]), ops or "なし", ", ".join(core.chars) or "なし", STATS["errors"]))
            if core.exp_stats:
                print("[状況] 経験値の通信(varID/種類: 回数・最大): " + ", ".join(
                    "{}: {}回・{:,}".format(k, v[0], v[1]) for k, v in sorted(core.exp_stats.items())))
        with lock:
            core.tick()
            if core.changed:
                core.changed = False
                save_state(core)
                dirty_since = dirty_since or time.time()
            if CHARS is not None and CHARS.changed:
                CHARS.changed = False
                save_chars()
        # 変化があったら少しまとめてから送る(ログイン直後の連続更新を1回に)
        if dirty_since and time.time() - dirty_since > 8 and time.time() - last_up > 15:
            with lock:
                payload = build_payload(core)
            r = upload(cfg, payload)
            if r is not False:
                dirty_since = None
                last_up = time.time()
                if r:
                    print(time.strftime("%H:%M"), "ウェブ更新 ({}キャラ)".format(len(payload["chars"])))
            else:
                last_up = time.time()  # 失敗したら15秒おいて再挑戦


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as e:     # トレイ版で黙って落ちないように
        import traceback
        print(traceback.format_exc())
        if GUI:
            import tray
            tray.message("エラーで止まりました。動作ログ.txt を Claude に見せてね。\n\n{}".format(e), kind="error")
        else:
            raise
