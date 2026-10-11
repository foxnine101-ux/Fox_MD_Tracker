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
          "NYAR_FIX_FILE", "SERVERS_FILE", "VIEW_SETTINGS_FILE", "ITEM_FIX_FILE", "SIM_CHARS_FILE", "OFFICIAL_FILE", "SANDBAG_FILE"):
    if hasattr(mt, k):
        setattr(mt, k, os.path.join(T, os.path.basename(getattr(mt, k))))
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
_orig = mt.resource
mt.resource = lambda n: os.path.join(T, "app.html") if n == "app.html" else _orig(n)
mt.CHARS = char_core.CharCore(md=core, log=print)
if rd("char_state.json"):
    mt.CHARS.restore(rd("char_state.json"))
mt.DMG = dmg_core.DmgCore(core, dmg_core.load_skill_names(mt.resource("skill_names.json")), mobs=dmg_core.load_mob_info(mt.resource("mob_info.json")))
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
