"""画面のテスト用サーバー(本物の exe とは別: ポート 18788)。保存は一時フォルダに逃がすので、リポジトリも本物のデータも汚さない。

使い方:
  python tools/ui_test_server.py                     # 空のデータで起動(クラウドでも動く)
  python tools/ui_test_server.py --data <本物のデータのフォルダ> --ratorio <ラトリオのフォルダ>
      --data: md_state.json / char_state.json / 被ダメ記録.json を「読むだけ」(書かない)。設定.json は開かない
      --ratorio: 取り込み済みのラトリオ(計算機の中身)。無ければ計算機は使えない(画面の確認だけならなくてよい)
起動したら http://127.0.0.1:18788/ をブラウザで開く。止めるときは Ctrl+C。
"""
import argparse, json, os, sys, tempfile, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
ap = argparse.ArgumentParser()
ap.add_argument("--data", default="")
ap.add_argument("--ratorio", default="")
ap.add_argument("--port", type=int, default=18788)
a = ap.parse_args()

import md_tracker as mt, md_core, char_core, dmg_core
T = tempfile.mkdtemp(prefix="fox_ui_")
for k in ("CONFIG_FILE", "STATE_FILE", "CHAR_STATE_FILE", "DMG_FILE", "SKILL_FIX_FILE", "DMG_RAW_FILE", "LOG_FILE", "ACCOUNTS_FILE",
          "NYAR_FIX_FILE", "SERVERS_FILE", "VIEW_SETTINGS_FILE", "ITEM_FIX_FILE", "SIM_CHARS_FILE", "OFFICIAL_FILE", "SANDBAG_FILE", "LANTERN_FILE", "MARKET_FILE", "SHARED_FILE", "LEDGER_FILE"):
    if hasattr(mt, k):
        setattr(mt, k, os.path.join(T, os.path.basename(getattr(mt, k))))
if a.data:      # 計算機のスロットも、本物の写しを一時フォルダに入れて読む(本物のファイルは書かない)
    _sc = os.path.join(a.data, os.path.basename(mt.SIM_CHARS_FILE))
    if os.path.exists(_sc):
        import shutil
        shutil.copy(_sc, mt.SIM_CHARS_FILE)
if a.data and os.path.exists(os.path.join(a.data, "公式モンスター.json")):      # 公式のマップ一覧(ランタンのマップ ID を引く用)。写しを一時フォルダに置いて読む(取りにいく処理は動かさない)
    import shutil, ro_official
    shutil.copy(os.path.join(a.data, "公式モンスター.json"), mt.OFFICIAL_FILE)
    mt.OFFICIAL = ro_official.Official(mt.OFFICIAL_FILE, log=lambda *x: None)
mt.LIVE_PORT = a.port
mt.CALC_DATA.update(json.load(open(mt.resource("calc_data.json"), encoding="utf-8")))
if a.ratorio:
    import ratorio_core
    mt.RATORIO = ratorio_core.Ratorio(a.ratorio, log=print)


def rd(name):
    p = os.path.join(a.data, name)
    return json.load(open(p, encoding="utf-8")) if a.data and os.path.exists(p) else None


names = {int(k): v for k, v in ((rd("quest_names_cache.json") or {}).get("names") or {}).items()}
core = md_core.MDCore(names, log=lambda *x: None)
if rd("md_state.json"):
    core.restore(rd("md_state.json"))
# app.html は 8788 を「本物の exe」と見なす箇所があるので、テスト用ポートに読みかえた写しを配る
html = open(mt.resource("app.html"), encoding="utf-8").read().replace('location.port === "8788"', 'location.port === "%d"' % a.port)
open(os.path.join(T, "app.html"), "w", encoding="utf-8").write(html)
os.makedirs(os.path.join(T, "web"), exist_ok=True)           # 画面の中身(web/*.js)も同じ読みかえをして配る
_webdir = os.path.dirname(mt.resource("app.html")) + os.sep + "web"
for _f in os.listdir(_webdir):
    if _f.endswith(".js"):
        _js = open(os.path.join(_webdir, _f), encoding="utf-8").read().replace('location.port === "8788"', 'location.port === "%d"' % a.port)
        open(os.path.join(T, "web", _f), "w", encoding="utf-8").write(_js)
_orig = mt.resource
mt.resource = lambda n: os.path.join(T, n) if n == "app.html" or n.startswith("web/") else _orig(n)
mt.CHARS = char_core.CharCore(md=core, log=print)
if rd("char_state.json"):
    mt.CHARS.restore(rd("char_state.json"))
    mt.CHARS.claim_all()      # 本物の起動と同じ: 倉庫経由で受け渡した装備の古い記録を片づける
import market_core
mt.MARKET = market_core.Market(mt.MARKET_FILE, log=print)
import zatta_core
mt.SHARED = zatta_core.Shared(mt.SHARED_FILE)      # 受け取りは動かさない(見本だけ)
if os.environ.get("FOX_SEED_INV"):
    mt.SHARED.merge([[501, 0, "", "", "", "n", zatta_core._day_ago(1), 12, 150, 120, 200], [607, 0, "", "", "", "n", zatta_core._day_ago(3), 4, 52000, 50000, 55000]])
import ledger_core
mt.LEDGER = ledger_core.Ledger(mt.LEDGER_FILE, chars=mt.CHARS, md=core, log=print)
if os.environ.get("FOX_SEED_INV"):      # 家計簿の見本
    _c = next(iter(mt.CHARS.chars), "テスト")
    _t = int(time.time())
    mt.LEDGER.rows = [{"t": _t - 90000, "c": _c, "k": "vend_sell", "d": 150000, "b": 2150000, "it": [[607, -3, 0]], "p": 50000},
                      {"t": _t - 3600, "c": _c, "k": "vend_buy", "d": -3000, "b": 2147000, "it": [[501, 10, 0]], "p": 300},
                      {"t": _t - 1800, "c": _c, "k": "bs_sell", "d": 2500, "b": 2149500, "it": [[512, -5, 0]], "p": 500},
                      {"t": _t - 600, "c": _c, "k": "mail", "d": 200000, "b": 2349500},
                      {"t": _t - 300, "c": _c, "k": "other_out", "d": -1000, "b": 2348500, "ops": ["0A0B"]},
                      {"t": _t - 200, "c": _c, "k": "unseen", "d": 50000, "b": 2398500}]
    mt.LEDGER.t = _t
if os.environ.get("FOX_SEED_INV"):      # インベントリ画面の確認用: 見本の持ち物と倉庫を入れる
    _n = next(iter(mt.CHARS.chars), "テスト")
    mt.CHARS.chars.setdefault(_n, {"stats": {}, "derived": {}, "statusPoint": None, "equips": [], "updated": 1})
    mt.CHARS.chars[_n]["items"] = [{"index": 5, "itemId": 501, "count": 100}, {"index": 6, "itemId": 503, "count": 20}]; mt.CHARS.chars[_n]["items_t"] = 1793700000
    _acc = ((core.char_info.get(_n) or {}).get("account")) or _n
    mt.CHARS.stores[str(_acc)] = {"2|メイン": {"inv": 2, "title": "メイン", "items": [{"index": 1, "itemId": 512, "count": 300}], "eq": [], "t": 1793700000, "by": _n},
                                  "4|W倉庫": {"inv": 4, "title": "W倉庫", "items": [{"index": 1, "itemId": 607, "count": 5}], "eq": [], "t": 1793700000, "by": _n}}
mt.DMG = dmg_core.DmgCore(core, dmg_core.load_skill_names(mt.resource("skill_names.json")), info=dmg_core.load_skill_info(mt.resource("skill_info.json")),
                          mobs=dmg_core.load_mob_info(mt.resource("mob_info.json")))
mt.DMG.official = getattr(mt, "OFFICIAL", None)          # 本物の起動と同じに(場所の名前を公式の一覧で整える)
mt.DMG.hits_info = dmg_core.load_json(mt.resource("skill_hits.json") or "", lambda d: {int(k): v for k, v in d.items()})
mt.DMG.counter = dmg_core.load_json(mt.resource("skill_counter.json") or "")
mt.DMG.ail_counter = dmg_core.load_json(mt.resource("ail_counter.json") or "")
mt.DMG.mob_ids = dmg_core.load_mob_ids(mt.resource("mob_ids.json") or "")
if rd("被ダメ記録.json"):
    mt.DMG.restore(rd("被ダメ記録.json"))
    mt.DMG.remap_sets(mt.CHARS.set_map)
print("chars:", len(core.chars), "sets:", len(mt.CHARS.sets), "保存先(一時):", T, flush=True)
mt.start_live_server(core, threading.Lock(), {})
print("ready: http://127.0.0.1:%d/" % a.port, flush=True)
try:
    while True:
        time.sleep(3600)
except KeyboardInterrupt:
    pass
