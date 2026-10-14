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
import urllib.parse
import urllib.request

import netutil

HERE = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))
sys.path.insert(0, HERE)
# 記録・設定・ラトリオなど「利用者のデータ」を置く場所。ふつうは exe(またはこのファイル)と同じ場所。
# 環境変数 FOX_MD_HOME があればそこ(開発用: ソースから動かしても、リポジトリを汚さず、別の場所のデータで動く)。
# 同梱の部品(id2name.json など)・アップデートの入れ替えは HERE のまま。
DATA_HOME = os.path.abspath(os.environ.get("FOX_MD_HOME") or HERE)
if DATA_HOME != HERE:
    os.makedirs(DATA_HOME, exist_ok=True)

import guild_packet as gp   # 通信の切り分け(ギルドトラッカーと共通)
import md_core
import quest_names
import server_core          # どのサーバー(ワールド)の通信か。記録しないサーバーを読み飛ばす
import ratorio_core         # ROラトリオHub(計算機)をフォークから取り込んで配る
try:
    import char_core          # キャラのステ・装備を拾う(無くても動く)
except Exception:
    char_core = None

VERSION = "2.58.17"
try:
    from edition import DEV   # 開発版かどうか(ビルドで書きかわる)
except Exception:
    DEV = False
EDITION = "開発版" if DEV else "公開版"
CONFIG_FILE = os.path.join(DATA_HOME, "設定.json")
STATE_FILE = os.path.join(DATA_HOME, "md_state.json")
CHAR_STATE_FILE = os.path.join(DATA_HOME, "char_state.json")
DMG_FILE = os.path.join(DATA_HOME, "被ダメ記録.json")
OFFICIAL_FILE = os.path.join(DATA_HOME, "公式モンスター.json")      # RO公式ツールから集めたモンスター情報(この PC だけ。配らない)
SANDBAG_FILE = os.path.join(DATA_HOME, "サンドバックマン記録.json")   # サンドバックマンの計算結果の記録 {records: [{id, key, t, slot, job, model, sb, res, note}]}
SANDBAG_MAX = 200
SHARED_LINKS_FILE = os.path.join(DATA_HOME, "共有の結びつけ.json")      # 配布元が承認した、ゲームのアイテム番号 → ラトリオの名前 {v, links, t}
SIM_CHARS_FILE = os.path.join(DATA_HOME, "計算機のキャラ.json")       # 計算機(キャラ・装備のシミュ)で作ったキャラ {ID: {name, model, updated}}
ITEM_FIX_FILE = os.path.join(DATA_HOME, "アイテム名の手直し.json")     # 手で付けた(スクショから読んだ)アイテム名 {"番号": "名前"}
SKILL_FIX_FILE = os.path.join(DATA_HOME, "スキル名の手直し.json")     # 手で付けたスキル名 {"番号": "名前"}
DMG_RAW_FILE = os.path.join(DATA_HOME, "被ダメ_確認用データ.json")   # 通信そのもの(形を確かめる用)
NAMES_CACHE = os.path.join(DATA_HOME, "quest_names_cache.json")
LOCK_FILE = os.path.join(os.environ.get("TEMP", "/tmp"), "md_tracker.lock")
LOG_FILE = os.path.join(DATA_HOME, "動作ログ.txt")

_print = print


GUI = sys.stdout is None or "--tray" in sys.argv   # 黒い画面なし(タスクトレイ常駐)
if sys.stdout is None:   # exe(--noconsole)だと出力先が無い → 部品のエラー表示で落ちないように
    sys.stdout = sys.stderr = open(os.path.join(DATA_HOME, "エラーログ.txt"), "a", encoding="utf-8", buffering=1)
TRAY = None
SHOW_HOOK = None   # 専用の窓を前に出す関数(窓があるとき)
UPD = None         # updater.Updater(アップデート)
CALC_DATA = {}     # calc_data.json(属性の相性表など。ラトリオのデータから tools/make_calc_data.py で作る)
RATORIO = ratorio_core.Ratorio(os.path.join(DATA_HOME, "ラトリオ"), log=print)   # 計算機(ROラトリオHub)。/ratorio/… で配る
QUIT_HOOK = None   # アプリを終える関数(アップデートの入れ替え用)
LIC = None        # license_core.License(利用キー)
QUIT_ALL = None    # 画面の「アプリを終了」から呼ぶ(トレイの「終了」と同じ)


LOG_MAX = 5 * 1024 * 1024      # 動作ログがこの大きさを超えたら「動作ログ.1.txt」に回して新しく始める(古いものは1つだけ残す = 最大でも約10MB。1日で約1MB)
_log_n = 0


LOG_KEEP = False           # True のとき(自分用のトグル): 回したログを捨てずに 動作ログ保存/ に日付つきで取っておく
LOG_KEEP_DIR = os.path.join(DATA_HOME, "動作ログ保存")


def _log_rotate():
    try:
        if os.path.getsize(LOG_FILE) > LOG_MAX:
            if LOG_KEEP:
                os.makedirs(LOG_KEEP_DIR, exist_ok=True)
                os.replace(LOG_FILE, os.path.join(LOG_KEEP_DIR, "動作ログ_" + time.strftime("%Y%m%d_%H%M%S") + ".txt"))
            else:
                os.replace(LOG_FILE, os.path.splitext(LOG_FILE)[0] + ".1.txt")
    except OSError:
        pass


def set_log_keep(on):
    """動作ログの長期保存の入り切り(設定.json の「動作ログを長期保存」も書きかえる。送信キーなど、ほかの項目はそのまま)。"""
    global LOG_KEEP
    LOG_KEEP = bool(on)
    try:
        d = {}
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
                d = json.load(f)
        d["動作ログを長期保存"] = LOG_KEEP
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("[設定] 動作ログの長期保存の設定を書けませんでした:", e)
    print("[設定] 動作ログの長期保存: {}".format("オン(動作ログ保存フォルダに取っておく)" if LOG_KEEP else "オフ"))


def print(*a, **k):  # noqa: A001  画面とファイルの両方に出す
    global _log_n
    if not GUI:
        _print(*a, **k)
    _log_n += 1
    if _log_n % 100 == 1:                  # 100回に1回だけ大きさを見る
        _log_rotate()
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
    "動作ログを長期保存": False,      # 自分用。True にすると、動作ログを捨てずに「動作ログ保存」フォルダへ日付つきで取っておく(配布版は False)
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


_MUTEX = None


def single_instance():
    """二重起動の防止。Windows は名前つきの排他(mutex)を使う: プロセスが終われば OS が自動で解放するので、
    強制終了・再起動のあとに「番号を書いたファイル」が残って、別のソフトが同じ番号を使い回していても、起動を断らない。"""
    global _MUTEX
    if os.name == "nt":
        try:
            import ctypes
            k = ctypes.WinDLL("kernel32", use_last_error=True)
            k.CreateMutexW.restype = ctypes.c_void_p
            k.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
            h = k.CreateMutexW(None, False, "Local\\Fox_MD_Tracker_single_instance")
            if h:
                if ctypes.get_last_error() == 183:      # ERROR_ALREADY_EXISTS = 別の Fox_MD_Tracker が動いている
                    return False
                _MUTEX = h                                  # 持ち続ける(プロセスの終わりで解放される)
                return True
        except Exception as e:
            print("二重起動の確認(mutex)に失敗。番号ファイルで確認します:", e)
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


def load_servers():
    """見たことのあるサーバーと、表示の設定の「記録しないサーバー」を読む。"""
    try:
        with open(SERVERS_FILE, "r", encoding="utf-8") as f:
            SERVERS.restore(json.load(f))
    except (OSError, ValueError):
        pass
    try:
        with open(VIEW_SETTINGS_FILE, "r", encoding="utf-8") as f:
            SERVERS.set_ignore(json.load(f).get("ignoreServers"))
    except (OSError, ValueError, AttributeError):
        pass


def on_char_rename(old, new):
    """サーバーを分ける前の「名前」だけの記録を「名前@サーバー」へ引き継いだ(装備・被ダメも付けかえる)。"""
    if CHARS is not None:
        CHARS.rename_char(old, new)
    if DMG is not None:
        DMG.rename_char(old, new)


def save_servers():
    try:
        _write_json(SERVERS_FILE, SERVERS.snapshot(), indent=1)
    except Exception as e:
        print("[サーバー] 保存できませんでした:", e)


ACCOUNTS_FILE = os.path.join(DATA_HOME, "accounts.json")


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


NYAR_FIX_FILE = os.path.join(DATA_HOME, "nyar_fix.json")


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
        for k in ("lv", "jobLv", "job", "account"):
            if info.get(k) is not None:
                chars[name][k] = info[k]
        if char_core is not None and info.get("job") is not None:
            chars[name]["jobName"] = char_core.job_name(info["job"])
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
            "titles": titles, "spans": spans, "history": core.history[-history:], "accounts": sorted(core.account_aids)}


# ---------------------------------------------------------------
#  PCだけで見るリアルタイム画面 http://127.0.0.1:8788/
#  (この PC の中だけ。ネットには出ない・Netlifyのクレジットも使わない)
# ---------------------------------------------------------------
LIVE_PORT = 8788
SERVERS_FILE = os.path.join(DATA_HOME, "サーバー.json")   # 見たことのあるサーバー(キャラ選択サーバーの IP)と、そこで遊んだキャラ
VIEW_SETTINGS_FILE = os.path.join(DATA_HOME, "表示の設定.json")   # ローカル表示の設定(MDの分類・キャラの並び など)


def resource(name):
    """同梱ファイル: exe/スクリプトの隣にあればそれ、無ければ exe の中(PyInstaller)。"""
    for d in (HERE, getattr(sys, "_MEIPASS", None)):
        if d and os.path.exists(os.path.join(d, name)):
            return os.path.join(d, name)
    return None


def load_cdn_map():
    """ラトリオが外部(CDN)から読む部品の写し(ratorio_cdn/)。{元の URL: ファイル名}。無ければ空(= 今までどおり外部から読む)。"""
    try:
        with open(resource("ratorio_cdn/map.json"), "r", encoding="utf-8") as f:
            m = json.load(f)
        return {u: n for u, n in m.items() if resource("ratorio_cdn/" + os.path.basename(n))}
    except (OSError, ValueError, TypeError):
        return {}


CDN_MAP = load_cdn_map()
CDN_MIME = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2"}


def local_url():
    return "http://127.0.0.1:{}/".format(LIVE_PORT)
_SHEET_CACHE = {"t": 0, "url": "", "body": None}


def _sheet_csv(url):
    """耐性シート(CSV)を取ってくる。60秒はキャッシュ。"""
    c = _SHEET_CACHE
    if c["body"] is not None and c["url"] == url and time.time() - c["t"] < 60:
        return c["body"]
    req = urllib.request.Request(url, headers={"User-Agent": "Fox_MD_Tracker"})
    with urllib.request.urlopen(req, timeout=10, context=netutil.CTX) as r:
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

        def _send(self, code, body, ctype, cache="no-store"):
            if isinstance(body, str):
                body = body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", cache)
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
            if path == "/api/links" and self._local_only():
                d = load_shared_links()
                return self._send(200, json.dumps({"v": d.get("v"), "links": d.get("links"), "t": d.get("t")}, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/api/license" and self._local_only():
                return self._send(200, json.dumps(LIC.status() if LIC else {"state": "off"}, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/api/data":
                with lock:
                    data = build_payload(core, history=300)
                    if DMG is not None:
                        data["dmg_recent"] = DMG.recent[-200:]
                        data["dmg_skills"] = DMG.seen_list()
                        data["dmg_kinds"] = DMG.kinds()
                        data["dmg_sets"] = DMG.sets
                        data["dmg_mobs"] = DMG.mob_view()   # 相手のモンスターの種族・サイズ・属性など(公式サイトの情報があればそれ)
                        data["mob_groups"] = DMG.unknown_groups()   # 名前の分からない相手(ID○○)を、使った技ごとにまとめたもの+候補
                        if OFFICIAL is not None:
                            data["official"] = OFFICIAL.status(OFFICIAL.pending(DMG.wanted()))
                            with OFFICIAL.lock:                 # 裏の作業が書き足している最中に読まない
                                data["official_names"] = sorted({r.get("jname") for r in OFFICIAL.mobs.values() if r.get("jname")})
                    data["servers"] = SERVERS.view()          # 見たことのあるサーバー(設定の「記録しない」用)
                    if CHARS is not None:
                        data["equip"] = CHARS.equip_view()
                        data["now_chars"] = [n for n in core.currents.values() if n]      # いまログインしているキャラ(つながっている通信ごと)
                    data["calc"] = CALC_DATA                  # 属性の相性表など(計算機の被ダメの検証用)
                    if DMG is not None:
                        data["skill_names"] = {k: DMG.skill_name(int(k)) for ch in (CHARS.chars.values() if CHARS is not None else [])
                                               for k in (ch.get("skills") or {})}   # 覚えているスキルの名前
                return self._send(200, json.dumps({"data": data, "settings": self._settings()}, ensure_ascii=False),
                                  "application/json; charset=utf-8")
            if path.startswith("/ratorio/"):          # 計算機(ROラトリオHub)のファイル
                rest, cache, pre = path[len("/ratorio/"):], "no-store", "/ratorio/"
                if rest.startswith("v-"):             # /ratorio/v-<取り込んだ版>/… は中身が変わらない → ブラウザに覚えさせる(計算係の起動が、2回目から速くなる)
                    tok, _, rest = rest.partition("/")
                    cache, pre = "public, max-age=31536000, immutable", "/ratorio/" + tok + "/"
                if rest.startswith("_cdn/"):          # 外部(CDN)の部品の写し(アプリに同梱)
                    name = os.path.basename(rest)
                    full = resource("ratorio_cdn/" + name)
                    if not full or not os.path.isfile(full):
                        return self._send(404, "not found", "text/plain")
                    with open(full, "rb") as f:
                        return self._send(200, f.read(), CDN_MIME.get(os.path.splitext(name)[1].lower(), "application/octet-stream"), cache)
                hit = RATORIO.resolve(rest)
                if not hit:
                    return self._send(404, "not found", "text/plain")
                with open(hit[0], "rb") as f:
                    body = f.read()
                # ラトリオは起動のたびに外部(CDN)から グラフ・画像化・アイコン の部品を読む。そこが遅い・つながらないと起動が止まるので、
                # 同梱した写しを読むように URL を読みかえる(写しが無い URL はそのまま)
                if CDN_MAP and b"https://cdn" in body and hit[1].startswith("text/"):
                    for u, n in CDN_MAP.items():
                        body = body.replace(u.encode("utf-8"), (pre + "_cdn/" + n).encode("utf-8"))
                return self._send(200, body, hit[1], cache)
            if path == "/api/itemnames" and self._local_only():      # アイテム番号 → 名前(計算機の装備を手で結びつけるときの候補)
                with lock:
                    names = dict(CHARS.id2name) if CHARS is not None else {}
                return self._send(200, json.dumps(names, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/api/itemlink" and self._local_only():      # ゲームのアイテム番号 → ラトリオの番号(同梱の item_link.json)
                try:
                    with open(resource("item_link.json") or "", "rb") as f:
                        return self._send(200, f.read(), "application/json; charset=utf-8", "max-age=3600")
                except OSError:
                    return self._send(200, b"{}", "application/json")
            if path == "/api/sandbag":            # サンドバックマンの記録(この PC に保存)
                return self._send(200, json.dumps({"records": load_sandbag()}, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/api/simchars":           # 計算機のキャラ(この PC に保存)
                try:
                    d = load_sim_chars_strict()
                except (OSError, ValueError) as e:
                    return self._send(503, json.dumps({"error": str(e)}), "application/json; charset=utf-8")
                return self._send(200, json.dumps(d, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/api/ratorio":
                st = RATORIO.check() if "check=1" in self.path else RATORIO.status()
                return self._send(200, json.dumps(st, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/api/update":
                st = UPD.status() if UPD else {"current": VERSION, "state": "off", "can_install": False}
                return self._send(200, json.dumps(st, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/__show":
                (SHOW_HOOK or open_browser)()
                return self._send(200, "ok", "text/plain")
            if path.startswith("/mapimg/"):           # 公式のマップの画像(この PC に取り込んだもの)
                full = OFFICIAL.img_path(urllib.parse.unquote(path[len("/mapimg/"):])) if OFFICIAL is not None else ""
                if not full or not os.path.isfile(full):
                    return self._send(404, "not found", "text/plain")
                with open(full, "rb") as f:
                    return self._send(200, f.read(), "image/png" if full.endswith(".png") else "image/jpeg", "public, max-age=86400")
            if path == "/api/placeguide":          # 「この場所の対策」
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                with lock:
                    out = DMG.place_guide((q.get("where") or [""])[0]) if DMG is not None else {}
                return self._send(200, json.dumps(out, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/api/skillview":          # 「技から見る」: 技の定義・軽減する装備・敵ごとのダメージ
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                with lock:
                    out = DMG.skill_view((q.get("name") or [""])[0]) if DMG is not None else {}
                return self._send(200, json.dumps(out, ensure_ascii=False), "application/json; charset=utf-8")
            if path == "/api/mobplaces":          # 「モンスター情報」タブ: 場所ごとのモンスター
                with lock:
                    out = {"places": DMG.place_view() if DMG is not None else {}, "official": OFFICIAL.status() if OFFICIAL is not None else None}
                return self._send(200, json.dumps(out, ensure_ascii=False), "application/json; charset=utf-8")
            if path in ("/api/map", "/api/maps", "/api/mapcur"):
                if OFFICIAL is None:
                    return self._send(200, json.dumps({"off": True}), "application/json")
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                if path == "/api/maps":            # マップの一覧から探す
                    out = {"rows": OFFICIAL.map_search((q.get("q") or [""])[0]), "have": len(OFFICIAL.maplist)}
                elif path == "/api/mapcur":        # いまいるマップ(通信から分かったもの) → 公式のマップの候補
                    with lock:
                        w = core.where()
                        cur = [n for n in core.currents.values() if n]
                    cand = sorted(((v["t"], n, v) for n, v in w.items()), reverse=True)
                    cand = [c for c in cand if c[1] in cur] or cand
                    out = {"char": "", "map": "", "files": []}
                    if cand:
                        _, n, v = cand[0]
                        out = {"char": n, "map": v["map"], "md": v.get("md", ""), "live": n in cur, "files": OFFICIAL.map_files_by_suffix(v["map"])}
                else:                              # 取り込んだマップの中身と、読み込みの様子
                    f = (q.get("file") or [""])[0]
                    out = {"map": OFFICIAL.map_view(f) if f else None, "job": dict(OFFICIAL.map_job), "status": OFFICIAL.status()}
                return self._send(200, json.dumps(out, ensure_ascii=False), "application/json; charset=utf-8")
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
                    b = json.loads(self.rfile.read(min(n, 200000)).decode("utf-8"))
                    if CHARS is None:
                        raise ValueError
                    out = {"ok": True}
                    with lock:
                        if isinstance(b.get("simlink"), dict):   # 計算機の名前をゲームのアイテム番号に結びつける: {simlink: {name, id}}(id: 番号 / 0 = 結びつけない / null = 消す)
                            v = b["simlink"].get("id")
                            CHARS.link_sim(str(b["simlink"].get("name") or ""), None if v is None else int(v))
                        elif isinstance(b.get("sim"), dict):      # 計算機の装備を登録: {sim: {shadow, items, data}, take: 上書きする相手の ID, links: {名前: 番号}}
                            sim = b["sim"]
                            for nm, iid in list((b.get("links") or {}).items())[:200]:
                                if str(nm) not in CHARS.sim_links and str(iid).isdigit():
                                    CHARS.sim_links[str(nm)[:80]] = int(iid)
                            out["sid"] = CHARS.put_sim_set(bool(sim.get("shadow")), sim.get("items") or [], sim.get("data") or {})
                            CHARS.register_set(out["sid"], str(b.get("take") or ""))
                            s_ = CHARS._table(out["sid"]).get(out["sid"]) or {}
                            out["unlinked"] = sum((it.get("itemId") is None) for it in s_.get("items") or [])
                        elif b.get("register"):                 # 履歴の1つを登録: {sid, register: 1, take}
                            CHARS.register_set(str(b["sid"]), str(b.get("take") or ""))
                        elif b.get("unregister"):
                            CHARS.unregister_set(str(b["sid"]))
                        elif b.get("delete"):
                            CHARS.delete_set(str(b.get("char") or ""), str(b["sid"]))
                        elif "tag" in b:
                            CHARS.set_tag(str(b["sid"]), str(b.get("tag") or ""))
                        elif "color" in b:
                            CHARS.set_color(str(b["sid"]), str(b.get("color") or ""))
                        else:
                            CHARS.rename_set(str(b.get("char") or ""), str(b["sid"]), str(b.get("name") or ""))
                        save_chars()
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, json.dumps(out), "application/json")
            if self.path.split("?")[0] == "/api/moblink" and self._local_only():
                # 名前の分からない相手をまとめて結びつける: {where, ids: ["ID123", …], name, remember: bool, skills: [...]}
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 20000)).decode("utf-8"))
                    if DMG is None:
                        raise ValueError
                    name = str(b.get("name") or "").strip()[:60]
                    if not name:
                        raise ValueError
                    with lock:
                        k = DMG.link_ids(str(b.get("where") or ""), [str(x) for x in (b.get("ids") or [])][:500], name,
                                         remember=bool(b.get("remember")), skills=[str(x) for x in (b.get("skills") or [])][:30])
                        DMG.changed = True
                        save_dmg()
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, json.dumps({"ok": True, "n": k}), "application/json")
            if self.path.split("?")[0] == "/api/records" and self._local_only():
                # 記録(キャラ・装備・MD)を預ける・取り込む窓口(手動): {op: "export"} / {op: "preview", remote} / {op: "apply", mode: "add"|"replace", remote}
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 6000000)).decode("utf-8"))
                    with lock:
                        op = b.get("op")
                        if op == "export":
                            out = {"ok": True, "records": records_export(core, bool(b.get("dmg")))}
                        elif op in ("preview", "apply"):
                            if not isinstance(b.get("remote"), dict):
                                raise ValueError("預けてある記録の形が違います")
                            if op == "preview":
                                out = dict(records_preview(core, b["remote"], bool(b.get("dmg"))), ok=True)
                            else:
                                out = dict(records_apply(core, b["remote"], "replace" if b.get("mode") == "replace" else "add", bool(b.get("dmg"))), ok=True)
                        else:
                            raise ValueError("op")
                except Exception as e:
                    return self._send(200, json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False), "application/json; charset=utf-8")
                return self._send(200, json.dumps(out, ensure_ascii=False), "application/json; charset=utf-8")
            if self.path.split("?")[0] == "/api/sync" and self._local_only():
                # 2台の同期の窓口(暗号化は画面側): {op: "get", since} / {op: "put", base, data}
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 4000000)).decode("utf-8"))
                    if LIC is None:
                        raise RuntimeError("利用キーの機能が使えません")
                    slot = "rec" if b.get("slot") == "rec" else ""
                    out = LIC.sync_get(b.get("since"), slot) if b.get("op") == "get" else LIC.sync_put(b.get("base"), str(b.get("data") or ""), slot)
                except Exception as e:
                    return self._send(200, json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False), "application/json; charset=utf-8")
                return self._send(200, json.dumps(out, ensure_ascii=False), "application/json; charset=utf-8")
            if self.path.split("?")[0] == "/api/links" and self._local_only():
                # 共有の結びつけ: {propose: {番号: 名前}} で提案 / {refresh: 1} で今すぐ取り直す
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 200000)).decode("utf-8"))
                    out = {"ok": True}
                    if LIC is None:
                        raise RuntimeError("利用キーの機能が使えません")
                    if isinstance(b.get("propose"), dict):
                        out["added"] = LIC.links_propose(b["propose"])
                    if b.get("refresh"):
                        out["msg"] = refresh_shared_links(True, lock)
                except Exception as e:
                    return self._send(200, json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False), "application/json; charset=utf-8")
                d = load_shared_links()
                out.update({"v": d.get("v"), "n": len(d.get("links") or {}), "t": d.get("t")})
                return self._send(200, json.dumps(out, ensure_ascii=False), "application/json; charset=utf-8")
            if self.path.split("?")[0] == "/api/license" and self._local_only():
                # 利用キー: {key} で登録 / {release: 1} でこの PC をはずす / {check: 1} で今すぐ確認
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 2000)).decode("utf-8"))
                    if LIC is None:
                        raise ValueError
                    st = LIC.release() if b.get("release") else LIC.check() if b.get("check") else LIC.activate(b.get("key"))
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, json.dumps(st, ensure_ascii=False), "application/json; charset=utf-8")
            if self.path.split("?")[0] == "/api/quit" and self._local_only():
                # 画面の「アプリを終了」(トレイの「終了」と同じ)
                def _bye():
                    time.sleep(0.4)
                    try:
                        (QUIT_ALL or (lambda: os._exit(0)))()
                    except Exception:
                        os._exit(0)
                threading.Thread(target=_bye, daemon=True).start()
                return self._send(200, json.dumps({"ok": True}), "application/json")
            if self.path.split("?")[0] == "/api/map" and self._local_only():
                # 公式サイトからマップを1つ読み込む: {file: "1@23inf"}。裏で動かす(進み具合は GET /api/map?file=…)
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 2000)).decode("utf-8"))
                    if OFFICIAL is None:
                        raise ValueError
                    started = OFFICIAL.start_map(str(b.get("file") or ""))
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, json.dumps({"ok": True, "started": started}), "application/json")
            if self.path.split("?")[0] == "/api/official" and self._local_only():
                # 公式サイトからの収集: {enabled: bool} で入り切り、{run: 1} で「今すぐ調べる」(休み中でなければ)
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 2000)).decode("utf-8"))
                    if OFFICIAL is None or DMG is None:
                        raise ValueError
                    started = False
                    if "enabled" in b:
                        OFFICIAL.enabled = bool(b["enabled"])
                        OFFICIAL.save()
                    if b.get("run"):
                        with lock:
                            w = DMG.wanted()
                        started = OFFICIAL.kick(w)
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, json.dumps({"ok": True, "started": started}), "application/json")
            if self.path.split("?")[0] == "/api/log" and self._local_only():
                # 画面側の状況を動作ログに残す(計算係の起動にかかった時間・失敗したときの様子など)
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 4000)).decode("utf-8"))
                    print("[画面] " + str(b.get("msg") or "")[:600].replace("\n", " "))
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, '{"ok":true}', "application/json")
            if self.path.split("?")[0] == "/api/sandbag" and self._local_only():
                # サンドバックマンの記録: {add: 記録} / {delete: ID} / {note: [ID, 文]}。同じ中身(key)の記録は1つにまとめる。最大 SANDBAG_MAX 件(古いものから消える)
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 400000)).decode("utf-8"))
                    with lock:
                        recs = load_sandbag()
                        out = {"ok": True}
                        if isinstance(b.get("add"), dict):
                            r = b["add"]
                            if not isinstance(r.get("model"), dict) or not r.get("key"):
                                raise ValueError
                            r["id"] = "r" + format(int(time.time() * 1000), "x")
                            r["t"] = int(time.time())
                            r.setdefault("note", "")
                            old = next((x for x in recs if x.get("key") == r["key"]), None)
                            if old is not None:
                                old["t"] = r["t"]                 # 同じ中身は新しく作らず、日時だけ更新して先頭へ
                                recs.remove(old)
                                recs.insert(0, old)
                                out["id"] = old["id"]
                            else:
                                recs.insert(0, r)
                                out["id"] = r["id"]
                            del recs[SANDBAG_MAX:]
                        elif b.get("delete"):
                            recs = [x for x in recs if x.get("id") != str(b["delete"])]
                        elif isinstance(b.get("note"), list) and len(b["note"]) == 2:
                            for x in recs:
                                if x.get("id") == str(b["note"][0]):
                                    x["note"] = str(b["note"][1])[:200]
                        else:
                            raise ValueError
                        _write_json(SANDBAG_FILE, {"records": recs})
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, json.dumps(out), "application/json")
            if self.path.split("?")[0] == "/api/simchars" and self._local_only():
                # 計算機のキャラを保存・削除: {id, name, model} / {id, delete: 1}
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 800000)).decode("utf-8"))
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                if b.get("quarantine"):          # 壊れたファイルを別名にして、作り直せるようにする(画面の「作り直す」ボタン)
                    try:
                        with lock:
                            name = quarantine_sim_chars()
                        print("[計算機] 壊れたスロットのファイルを別名にしました:", name)
                        return self._send(200, json.dumps({"ok": True, "name": name}, ensure_ascii=False), "application/json; charset=utf-8")
                    except OSError as e:
                        return self._send(503, json.dumps({"error": str(e)}), "application/json; charset=utf-8")
                try:
                    cid = str(b["id"])[:40]
                    with lock:
                        chars = load_sim_chars_strict()          # 読めないときは書かない(1スロットだけ書いて、ほかを消さないように)
                        if b.get("delete"):
                            chars.pop(cid, None)
                        else:
                            if not isinstance(b.get("model"), dict):
                                raise ValueError
                            chars[cid] = {"name": str(b.get("name") or "")[:40], "model": b["model"], "updated": int(time.time())}
                            if isinstance(b.get("saved"), dict):      # スロットに「保存」したときの中身(model は作業中の中身)
                                chars[cid]["saved"] = b["saved"]
                        _write_json(SIM_CHARS_FILE, chars)
                except (OSError, ValueError) as e:
                    if isinstance(e, (json.JSONDecodeError, OSError)) or str(e).startswith("計算機"):      # 読めない(ファイル側の問題)は 503・送られた中身の問題は 400
                        return self._send(503, json.dumps({"error": str(e)}), "application/json; charset=utf-8")
                    return self._send(400, "bad data", "text/plain")
                except Exception:
                    return self._send(400, "bad data", "text/plain")
                return self._send(200, '{"ok":true}', "application/json")
            if self.path.split("?")[0] == "/api/ratorio" and self._local_only():
                # 計算機(ROラトリオHub)をフォークから取り込む・更新する
                return self._send(200, json.dumps(RATORIO.update(), ensure_ascii=False), "application/json; charset=utf-8")
            if self.path.split("?")[0] == "/api/jslog" and self._local_only():
                # 画面(JavaScript)のエラーを エラーログ.txt に残す(原因を調べる用): {m: メッセージ, s: スタック, tab, simv}
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 6000)).decode("utf-8"))
                    print("[画面のエラー] {} タブ={} {} | {}".format(time.strftime("%m/%d %H:%M:%S"), b.get("tab"), b.get("simv"), str(b.get("m"))[:300]), flush=True)
                    print("    " + str(b.get("s") or "").replace("\n", "\n    ")[:1800], flush=True)
                except Exception:
                    pass
                return self._send(200, "{}", "application/json; charset=utf-8")
            if self.path.split("?")[0] == "/api/ocr" and self._local_only():
                # スクリーンショット(画像そのもの)から文字を読む → {"name": 1行目から出した名前, "lines": 読めた行}
                try:
                    import ocr_core
                    n = int(self.headers.get("Content-Length") or 0)
                    if not 0 < n <= ocr_core.MAX_IMAGE:
                        raise RuntimeError("画像が大きすぎるか、空です")
                    lines = ocr_core.read_lines(self.rfile.read(n))
                    out = {"ok": True, "name": ocr_core.guess_name(lines), "lines": [ocr_core.tidy(x) for x in lines]}
                except Exception as e:
                    out = {"ok": False, "error": str(e)}
                return self._send(200, json.dumps(out, ensure_ascii=False), "application/json; charset=utf-8")
            if self.path.split("?")[0] == "/api/itemname" and self._local_only():
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    b = json.loads(self.rfile.read(min(n, 10000)).decode("utf-8"))
                    if CHARS is None:
                        raise ValueError
                    with lock:
                        if not CHARS.set_item_name(b["id"], str(b.get("name") or "")):
                            raise ValueError
                        save_item_name(str(b["id"]), CHARS.id2name[str(b["id"])])
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
                with lock:
                    SERVERS.set_ignore(s.get("ignoreServers"))
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
        request_queue_size = 256      # 同時に待てる接続の数。既定の 5 だと、計算係(ラトリオ)が約250ファイルを一気に取りに来たときに一部が断られて、起動に失敗する
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
        with urllib.request.urlopen(req, timeout=20, context=netutil.CTX) as r:
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
        with self.lock:
            SERVERS.packet(self.key, pkt)            # マップへの行き先(どのサーバーか引き継ぐ用)は必ず読む
            if SERVERS.ignored(self.key):
                return                               # 記録しないサーバー(露店用など)
        if len(pkt) >= 2:
            op = pkt[0] | (pkt[1] << 8)
            if op in md_core.WANT_OPS or op in (0x08C8, 0x01DE, 0x09FD, 0x09FE, 0x09FF, 0x0095, 0x0A30, 0x0ADF, 0x0983, 0x0229, 0x09CB, 0x0B39, 0x0999, 0x099A, 0x07FA, 0x00F4, 0x01C4, 0x0A0A, 0x0B41, 0x00F6, 0x00F2):   # 被ダメ・装備・倉庫関係も数える
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
            c = self.core.conn.get(self.key)
            if c and c.get("name"):
                SERVERS.note_char(self.key, c["name"])   # このサーバーで遊んだキャラ(設定で見分ける用)


STATS = {"segments": 0, "ops": {}, "errors": 0, "conns": set()}
CHARS = None   # char_core.CharCore (あれば)
SERVERS = server_core.Servers(log=print)   # どのサーバーの通信か(記録しないサーバーを読み飛ばす)
DMG = None     # dmg_core.DmgCore (被ダメの記録)
OFFICIAL = None  # ro_official.Official (公式サイトから集めたモンスター情報)


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


def records_export(core, dmg=False):
    """預ける記録(MD の記録・キャラ・装備。dmg=True なら被ダメの記録も)。lock の中で呼ぶ。キーを並べた形にそろえ、その PC 限りの値(持ち物の番号・名前の分からない通信の置き場)は外す"""
    import records_sync
    cs = CHARS.snapshot() if CHARS is not None else {}
    cs.pop("updated", None)            # 保存のたびに変わる時刻は、中身ではないので外す
    rec = {"md": core.snapshot(), "cs": cs}
    if dmg and DMG is not None:
        rec["dmg"] = DMG.snapshot()
    return records_sync.prepare(rec)


def records_backup():
    """記録を書きかえる前に、いまのファイルを「同期前のバックアップ」に写す(新しい7つだけ残す)"""
    import shutil
    root = os.path.join(DATA_HOME, "同期前のバックアップ")
    stamp, n = time.strftime("%Y%m%d_%H%M%S"), 0
    dst = os.path.join(root, stamp)
    while os.path.exists(dst):                     # 同じ秒にもう一度作るときは、上書きせず番号をつける
        n += 1
        dst = os.path.join(root, "{}_{}".format(stamp, n))
    os.makedirs(dst)
    for f in (STATE_FILE, CHAR_STATE_FILE, DMG_FILE):
        if os.path.exists(f):
            shutil.copy2(f, dst)
    for old in sorted(os.listdir(root))[:-7]:
        shutil.rmtree(os.path.join(root, old), ignore_errors=True)
    return dst


def records_preview(core, remote, dmg=False):
    """取り込む前の確認用: いまの数・預けてある数・足されるキャラの名前・いま遊んでいるキャラ。lock の中で呼ぶ"""
    import records_sync
    local, remote = records_export(core, dmg), records_sync.prepare(remote)
    live = sorted({n for n in core.currents.values() if n})
    added = sorted(set((remote.get("cs") or {}).get("chars") or {}) - set((local.get("cs") or {}).get("chars") or {}))
    out = {"local": records_sync.counts(local), "remote": records_sync.counts(remote), "add_chars": added[:30], "n_add_chars": len(added), "live": live}
    if dmg and DMG is not None and remote.get("dmg"):
        out["dmg_remote_chars"] = records_sync.dmg_counts(remote["dmg"])
        out["dmg_add_chars"] = len(records_sync.dmg_new_chars(local.get("dmg"), remote["dmg"]))
    return out


def records_apply(core, remote, mode, dmg=False):
    """預けてある記録を、この PC に取り込む。mode = "add"(無いものだけ足す) / "replace"(置きかえる)。lock の中で呼ぶ。
    書きかえる前にバックアップを取り、途中で失敗したら元に戻す。いま遊んでいるキャラと、名前の分からない通信の置き場は、元の記録を残す"""
    import copy
    import records_sync
    use_dmg = bool(dmg and DMG is not None and remote.get("dmg"))           # 被ダメの記録は、含めると指定したときだけ
    local = records_export(core, use_dmg)
    remote = records_sync.prepare(remote)
    merged = records_sync.replace_with(local, remote) if mode == "replace" else records_sync.add_only(local, remote)
    if use_dmg:
        merged["dmg"] = remote["dmg"] if mode == "replace" else records_sync.dmg_add_only(local.get("dmg"), remote["dmg"])
    # 変わらない項目と、遊んでいるキャラ・名前の分からない置き場は、持ち物の番号つきの元の記録をそのまま残す
    live = {n for n in core.currents.values() if n} | {records_sync.UNKNOWN}
    for n, e in list(merged["md"]["chars"].items()):
        if n in core.chars and e == local["md"]["chars"].get(n):
            merged["md"]["chars"][n] = copy.deepcopy(core.chars[n])
    for n, e in list(merged["cs"]["chars"].items()):
        if CHARS is not None and n in CHARS.chars and e == local["cs"]["chars"].get(n):
            merged["cs"]["chars"][n] = copy.deepcopy(CHARS.chars[n])
    for n in live:                    # 遊んでいるキャラと名前の分からない置き場は、預けてある記録に無くても、この PC の元の記録をそのまま残す
        if n in core.chars:
            merged["md"]["chars"][n] = copy.deepcopy(core.chars[n])
        if CHARS is not None and n in CHARS.chars:
            merged["cs"]["chars"][n] = copy.deepcopy(CHARS.chars[n])
    if records_sync.prepare(merged) == local:
        return {"changed": False}
    old_md, old_cs = copy.deepcopy(core.snapshot()), (copy.deepcopy(CHARS.snapshot()) if CHARS is not None else None)
    old_dmg = copy.deepcopy(DMG.snapshot()) if use_dmg else None
    backup = records_backup()
    try:
        core.restore(merged["md"])
        if CHARS is not None:
            CHARS.restore(merged["cs"])
            CHARS.changed = True
        save_state(core)
        if CHARS is not None:
            _write_json(CHAR_STATE_FILE, CHARS.snapshot())          # 保存の失敗を、ここでは握りつぶさない(失敗したら元に戻す)
        if use_dmg:
            DMG.restore(merged["dmg"])
            DMG.changed = True
            _write_json(DMG_FILE, DMG.snapshot())
    except Exception:
        core.restore(old_md)
        if CHARS is not None and old_cs is not None:
            CHARS.restore(old_cs)
        if old_dmg is not None:
            DMG.restore(old_dmg)
        raise
    print("[同期] 預けてある記録を取り込みました({}): MD {}人・キャラ {}人・装備セット {}個(バックアップ: {})".format(
        "置きかえ" if mode == "replace" else "足す", len(merged["md"]["chars"]), len(merged["cs"]["chars"]), len(merged["cs"]["sets"]), os.path.basename(backup)))
    return {"changed": True}


def save_chars():
    if CHARS is None:
        return
    try:
        _write_json(CHAR_STATE_FILE, CHARS.snapshot())
    except Exception as e:
        print("[キャラ] 保存に失敗:", e)


def prune_equip_history():
    """装備セットの履歴の自動片づけ(起動時と1日おき)。被ダメの記録・計算機のスロットが使っているものは残す。"""
    if CHARS is None or DMG is None:                     # 被ダメの記録が読めていないときは、参照が分からないので片づけない
        return
    try:
        if os.path.exists(SIM_CHARS_FILE):
            with open(SIM_CHARS_FILE, "r", encoding="utf-8") as f:     # あるのに読めないときは例外 → 片づけない
                sim = json.load(f)
        else:
            sim = {}
        blob = json.dumps(DMG.snapshot(), ensure_ascii=False) + json.dumps(sim, ensure_ascii=False)
        blob += json.dumps(load_sandbag(), ensure_ascii=False)
        if CHARS.prune_sets(blob):
            save_chars()
    except Exception as e:
        print("[キャラ] 履歴の片づけに失敗:", e)


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


def load_sandbag():
    """サンドバックマン記録.json → [記録, …](新しい順)"""
    try:
        with open(SANDBAG_FILE, "r", encoding="utf-8") as f:
            d = json.load(f)
        r = d.get("records") if isinstance(d, dict) else None
        return r if isinstance(r, list) else []
    except (OSError, ValueError):
        return []


_SHARED_LOCK = threading.Lock()


def load_shared_links():
    """共有の結びつけ.json → {v, links, t}"""
    try:
        with open(SHARED_LINKS_FILE, "r", encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict) and isinstance(d.get("links"), dict):
            return d
    except (OSError, ValueError):
        pass
    return {"v": -1, "links": {}, "t": 0}


def refresh_shared_links(force=False, lock=None):
    """配布元から承認ずみの表を取る(1日1回。変わっていなければ何もしない)。返り値 = 状態の文"""
    if LIC is None:
        return "利用キーの機能が使えません"
    with _SHARED_LOCK:                                  # 裏の更新と「今すぐ更新」が重ならないように
        d = load_shared_links()
        if not force and time.time() - d.get("t", 0) < 20 * 3600:
            return "最近確認ずみです"
        try:
            r = LIC.links_get(d.get("v", -1))
        except Exception as e:
            return str(e)
        d["t"] = int(time.time())
        if r is not None:
            d["v"], d["links"] = r["v"], r["links"]
            print("[共有の結びつけ] 更新しました: {}件(版 {})".format(len(d["links"]), d["v"]))
        _write_json(SHARED_LINKS_FILE, d)
        if lock is not None:                       # 装備セットを書きかえるので、通信を読むスレッドと同時にならないよう、データの鍵を取る
            with lock:
                apply_shared_links(d)
        else:
            apply_shared_links(d)
        return "更新しました" if r is not None else "変わりありません"


def apply_shared_links(d=None):
    """共有の表を、装備の名前の引き当て(char_core)に渡す(参照するだけ。保存はしない)"""
    try:
        if CHARS is not None:
            CHARS.set_shared_links((d or load_shared_links()).get("links") or {})
    except Exception as e:
        print("[共有の結びつけ] 反映できませんでした:", e)


def quarantine_sim_chars():
    """壊れて読めない 計算機のキャラ.json を、別名(壊れた_日時)に退避して、空から作り直せるようにする。退避したファイル名を返す"""
    if not os.path.exists(SIM_CHARS_FILE):
        return ""
    dst = os.path.join(os.path.dirname(SIM_CHARS_FILE), "計算機のキャラ.壊れた_{}.json".format(time.strftime("%Y%m%d_%H%M%S")))
    os.replace(SIM_CHARS_FILE, dst)
    return os.path.basename(dst)


def load_sim_chars_strict():
    """計算機のキャラ.json。あるのに読めない(OneDrive の一瞬のロックなど)ときは「空」と答えず例外にする(空と勘違いして、ほかの分を消さないように)"""
    if not os.path.exists(SIM_CHARS_FILE):
        return {}
    with open(SIM_CHARS_FILE, "r", encoding="utf-8") as f:
        d = json.load(f)
    if not isinstance(d, dict):
        raise ValueError("計算機のキャラの形が違います")
    return d


def load_sim_chars():
    """計算機のキャラ.json → {ID: {name, model, updated}}"""
    try:
        with open(SIM_CHARS_FILE, "r", encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def load_item_fix():
    """アイテム名の手直し.json → {"番号": "名前"}"""
    try:
        with open(ITEM_FIX_FILE, "r", encoding="utf-8") as f:
            return {str(k): str(v) for k, v in json.load(f).items() if str(k).isdigit() and str(v).strip()}
    except FileNotFoundError:
        return {}
    except Exception as e:
        print("[キャラ] アイテム名の手直しが読めませんでした:", e)
        return {}


def save_item_name(iid, name):
    """アイテムの名前を1つ覚える(アイテム名の手直し.json に足す)。"""
    fix = load_item_fix()
    fix[str(iid)] = name
    _write_json(ITEM_FIX_FILE, fix, indent=1)
    print("[キャラ] アイテムの名前を覚えました: {} = {}".format(iid, name))


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
                if not SERVERS.ignored(self._cur_key):
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
            key = (ip.src, tcp.sport, ip.dst, tcp.dport)
            if int(tcp.flags) & 0x02:          # SYN(サーバーの SYN+ACK)= 新しい接続。パソコン側のポートは使い回されるので、前の接続の続きと取り違えないよう古い記録を捨てる
                with self.lock:
                    old = self.scanners.pop(key, None)
                    if old is not None:
                        self.core.forget_conn(key)
                        if CHARS is not None:
                            CHARS._synced.discard(key)
                        for k in [k for k in _EQ_WATCH if k[0] == key]:
                            _EQ_WATCH.pop(k, None)
                            _EQ_LOGGED.discard(k)
                        print("[通信] 同じポートで接続し直されました。前の接続の記録を捨てます: {}:{} → {}:{}".format(*key))
                return
            data = bytes(tcp.payload)
            if not data:
                return
            if tcp.sport in server_core.LOGIN_PORTS:
                with self.lock:
                    SERVERS.login_data(key, data)    # ワールドの一覧(ワールド名とキャラ選択サーバーの IP)
            STATS["segments"] += 1
            if key not in STATS["conns"]:
                STATS["conns"].add(key)
                print("[通信] 新しい接続: {}:{} → {}:{}".format(*key))
            sc = self.scanners.get(key)
            if sc is None:
                with self.lock:
                    SERVERS.new_conn(key, is_char=self.core.is_char_conn(key))
                    if not SERVERS.ignored(key):
                        self.core._c(key)      # 新しい接続を覚える(キャラ選択サーバーなら、いまのキャラをリセット)
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
                if not SERVERS.ignored(key):
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
        __import__("scapy")   # 入っているか試すだけ
        return True
    except ImportError:
        if getattr(sys, "frozen", False):
            return False
        print("scapy を入れています…")
        import subprocess
        subprocess.call([sys.executable, "-m", "pip", "install", "--user", "scapy"])
        try:
            __import__("scapy")   # 入っているか試すだけ
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
    global LOG_KEEP
    LOG_KEEP = bool(cfg.get("動作ログを長期保存", False))
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
    load_servers()
    try:
        with open(resource("calc_data.json") or "", "r", encoding="utf-8") as f:
            CALC_DATA.update(json.load(f))
    except (OSError, ValueError) as e:
        print("[計算機] calc_data.json が読めませんでした:", e)
    core.qual = SERVERS.qualify               # キャラは「名前@サーバー」で記録する(サーバーごとに分ける)
    core.on_rename = on_char_rename
    apply_nyar_fix(core)
    if char_core is not None:
        CHARS = char_core.CharCore(md=core, log=print)
        CHARS.id2name.update(load_item_fix())          # この PC で付けたアイテム名
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
                               fix=SKFIX[0], efix=SKFIX[1], info=dmg_core.load_skill_info(resource("skill_info.json") or ""),
                               mobs=dmg_core.load_mob_info(resource("mob_info.json") or ""))
        if os.path.exists(DMG_FILE):
            with open(DMG_FILE, "r", encoding="utf-8") as f:
                DMG.restore(json.load(f))
        print("被ダメの記録: スキル名 {}件 (手直し {}件) / モンスター {}件".format(len(DMG.skills), len(DMG.fix), len(DMG.mobs)))
        try:
            import ro_official
            global OFFICIAL
            OFFICIAL = ro_official.Official(OFFICIAL_FILE, log=print)
            DMG.official = OFFICIAL
            DMG.mob_ids = dmg_core.load_mob_ids(resource("mob_ids.json") or "")
            DMG.hits_info = dmg_core.load_json(resource("skill_hits.json") or "", lambda d: {int(k): v for k, v in d.items()})
            DMG.counter = dmg_core.load_json(resource("skill_counter.json") or "")
            DMG.ail_counter = dmg_core.load_json(resource("ail_counter.json") or "")
            print("公式モンスター情報(この PC に集めたもの): {}件".format(len(OFFICIAL.mobs)))
        except Exception as e:
            print("公式モンスター情報が使えません:", e)
        if CHARS is not None:
            DMG.gear = CHARS.gear_profile              # 当たったときの装備(鎧の属性・耐性・DEF・MDEF)も覚える
            if CHARS.set_map:                          # 前の版の装備セットIDを、共通の 装備セット+シャドウセット に付けかえ
                DMG.remap_sets(CHARS.set_map)
                save_dmg()
                save_chars()
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
                proc = None
                try:
                    proc = gp.install_npcap()
                except Exception as e:
                    tray.message("自動で開けませんでした。https://npcap.com/ から入れてください。\n" + str(e), kind="warn")
                for _ in range(400):                    # 最大20分、入るのを待つ。インストーラーが終わるまで待つ(途中で wpcap.dll だけ先に現れても、まだ使えない)
                    done = proc.poll() is not None if hasattr(proc, "poll") else gp.npcap_available()
                    if done and gp.npcap_available():
                        break
                    time.sleep(3)
                time.sleep(2)                           # 入れ終わった直後は、ドライバの準備が済むのを少し待つ
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

    global LIC
    try:
        import license_core
        LIC = license_core.License(DATA_HOME, cfg.get("利用キー確認先") or None, log=print)
    except Exception as e:
        print("[利用キー] 使えません:", e)
        LIC = None
    lock = threading.Lock()
    start_live_server(core, lock, cfg)   # 画面は先に出す(Npcapが無くても見られるように)
    if OFFICIAL is not None and DMG is not None:
        def _wanted():
            with lock:
                return DMG.wanted()
        OFFICIAL.start(_wanted)          # しばらくしてから、足りないモンスター情報を公式サイトからゆっくり集める(裏の作業)
    sn = Sniffer(core, lock, cfg.get("ネットワーク名") or None)
    try:
        for _try in range(10):                          # Npcap を入れた直後や、インストール中は、すぐには始められないことがある → 少し待って何度か試す
            try:
                sn.start()
                break
            except Exception as e:
                if _try == 9:
                    raise
                print("通信の読み取りを始められませんでした。3秒後にもう一度試します:", e)
                time.sleep(3)
    except Exception as e:
        print(e)
        fail("通信の読み取りを始められませんでした。\nNpcap が入っているか確認してね (https://npcap.com/)\n\n{}".format(e))
        return
    print("[起動] v{} データの置き場所: {} / 作業フォルダ: {} / exe: {}".format(VERSION, DATA_HOME, os.getcwd(), sys.executable))     # 「ファイルがデスクトップに出る」などの調査用
    print("通信を読んでいます。ROでログイン・マップ移動するとCTが記録されます。")
    local_only = upload(cfg, build_payload(core)) is None
    if local_only:
        print("※ ウェブには送りません(この PC だけで記録・表示します)")

    stop = threading.Event()
    if LIC is not None:
        LIC.start_background(stop)

        with lock:
            apply_shared_links()        # 前に取ってあった表を、まず反映
        def _links_loop():
            if stop.wait(60):
                return
            while True:
                try:
                    refresh_shared_links(lock=lock)
                except Exception as e:
                    print("[共有の結びつけ] 取れませんでした:", e)
                if stop.wait(6 * 3600):
                    return
        threading.Thread(target=_links_loop, daemon=True).start()
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
                    app = appwin.AppWindow(local_url(), DATA_HOME, show=not args.hidden, log=print,
                                           on_hide=lambda: TRAY and TRAY.notify("右下のアイコンに隠れました。ダブルクリックでまた開けます。終了は右クリックから。", "Fox_MD_Tracker"))
                else:
                    print("[窓] 専用の窓の部品(pywebview)が使えないので、画面はブラウザで開きます。理由:", getattr(appwin, "IMPORT_ERR", "") or "不明")
            except Exception as e:
                print("[窓] 使えません:", e)
            auto_open = (not args.hidden) and cfg.get("起動時にブラウザで開く", True) is not False      # 専用の窓が使えないときだけ関係する。設定.json に "起動時にブラウザで開く": false と書くと、自動では開かない

            def quit_all():
                stop.set()
                if app is not None:
                    app.quit()
            global QUIT_ALL
            QUIT_ALL = lambda: (quit_all(), TRAY.icon.stop() if TRAY and TRAY.icon else None)

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
                             ((cfg.get("ウェブのURL") or "").strip() if web_on(cfg) else ""), LOG_FILE, DATA_HOME,
                             on_quit=quit_all, status=status, open_main=(app.show if app else None),
                             update=(upd_text, upd_act),
                             extras=[("動作ログを長期保存(自分用)", lambda: set_log_keep(not LOG_KEEP), lambda: LOG_KEEP)])
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
                print("[窓] 専用の窓を開けなかったので、ブラウザで開きます" if auto_open else "[窓] 専用の窓を開けませんでした。右下のアイコンから画面を開けます")
                if auto_open:
                    open_browser()
                while not stop.wait(1):    # トレイ(別の流れ)の「終了」を待つ
                    pass
            else:
                if local_only and auto_open:
                    print("[窓] ブラウザで画面を開きます")
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


_EQ_WATCH, _EQ_LOGGED = {}, set()


def run_loop(core, lock, cfg, stop):
    last_up = 0
    dirty_since = None
    last_stat = time.time()
    last_dmg_save = 0
    last_link = 0
    last_prune = time.time() - 86400 + 180      # 起動の3分後に1回、そのあとは1日おき(起動の途中・複数起動のときに書かないように)
    while not stop.wait(1):
        if time.time() - last_prune > 86400:
            last_prune = time.time()
            with lock:
                prune_equip_history()
        if DMG is not None and DMG.changed and time.time() - last_dmg_save > 30:
            with lock:
                DMG.changed = False
                save_dmg()
            last_dmg_save = time.time()
        if DMG is not None and time.time() - last_link > 60:
            last_link = time.time()
            with lock:
                try:
                    if DMG.apply_auto():
                        DMG.changed = True
                except Exception as e:
                    print("[被ダメ] 名前の自動の紐付けでエラー:", e)
        if CHARS is not None:
            # ログインして12秒たっても装備の一覧(0B39)が届いていない接続を、マップの名前つきで動作ログに残す(「イズルードだと取れない」などの原因調べ用)
            with lock:
                for key, c in list(core.conn.items()):
                    n = c.get("name")
                    if not n:
                        continue
                    k = (key, n)
                    t0 = _EQ_WATCH.setdefault(k, time.time())
                    if k not in _EQ_LOGGED and time.time() - t0 > 12:
                        _EQ_LOGGED.add(k)
                        if key not in CHARS._synced:
                            print("[装備] ログインして12秒たっても装備の一覧が届いていません: {} マップ={} (この接続でそれまでに読んだ通信: {}件)".format(n, c.get("map") or "不明", c.get("n", "?")))
                        else:
                            print("[装備] 装備の一覧を受け取っています: {} マップ={}".format(n, c.get("map") or "不明"))
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
            if SERVERS.changed:
                SERVERS.changed = False
                save_servers()
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
