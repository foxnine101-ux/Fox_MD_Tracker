# -*- coding: utf-8 -*-
"""
ランタンハント(イベントの「ランタンの座標の一覧」)の部品。

- 座標の一覧は利用者が貼り付ける・ファイルで入れる(他の人がまとめた一覧を、このツールには同梱しない)。ここは読み取りと、マップの名前 → マップID の対応だけ。
- 一覧の形: 1行 = [番号, マップ名, X, Y, 備考…](タブ区切り=スプレッドシートからコピーした形、または CSV)。番号で始まらない行(見出しなど)は読み飛ばす。
  何回かに分けて貼っても、番号で合流する(同じ番号は新しい方で置きかえ)。
- マップ ID(/navi2 に使う)は、①公式サイトのマップ一覧(Fox が集めたもの。[ファイル名, 名前])で名前が1つに決まるもの → ②町・フィールドの名前の決まり(推定)の順。決まらないものは None。
"""
import csv
import hashlib
import hmac
import io
import os
import re
import unicodedata


def norm(s):
    """名前の比較用: 全角半角をそろえて、空白をすべて外す。"""
    return re.sub(r"[\s　]+", "", unicodedata.normalize("NFKC", str(s or "")))


def parse_text(text):
    """貼り付けた文字(タブ区切りか CSV。複数シートを続けて貼ってよい)→ [{n, map, x, y, memo}]。番号の小さい順。"""
    out = {}
    for line in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if not line.strip():
            continue
        if "\t" in line:
            cells = line.split("\t")
        else:
            try:
                cells = next(csv.reader(io.StringIO(line)))
            except (csv.Error, StopIteration):
                continue
        cells = [c.strip().strip('"').strip() for c in cells]
        while cells and cells[0] == "" and len(cells) > 4:        # 行頭の空の列(スプレッドシートの余白)
            cells = cells[1:]
        if len(cells) < 4 or not cells[0].isdigit():
            continue
        if len(cells) >= 6 and cells[3] and not cells[3].isdigit() and cells[4].isdigit() and cells[5].isdigit():
            # 熊の形: 番号, マップ, (空 または入口などのメモ), 属性(固定・俳諧・曜日固定・曜日俳諧), X, Y, 月木, 火金, 水土(〇が出る曜日)
            n, x, y = int(cells[0]), int(cells[4]), int(cells[5])
            days = [d for d, c in zip(("月木", "火金", "水土"), cells[6:9]) if c in ("〇", "○", "◯", "O")]
            if 0 < n < 100000 and cells[1]:
                out[n] = {"n": n, "map": cells[1], "x": x, "y": y, "memo": " ".join([cells[3]] + days + ([cells[2]] if cells[2] else []))}
            continue
        try:
            n, x, y = int(cells[0]), int(float(cells[2])), int(float(cells[3]))
        except ValueError:
            continue
        if not (0 < n < 100000) or not cells[1]:
            continue
        out[n] = {"n": n, "map": cells[1], "x": x, "y": y, "memo": " ".join(c for c in cells[4:] if c)}
    return [out[k] for k in sorted(out)]


# ---- マップ ID ----
_BAD = re.compile(r"@|_q$|^jp_ev|^22nd|^que_|^e_tower$|^p_cas_gr")      # インスタンス・クエスト用・イベント用の ID は、町・フィールドの候補にしない

# 町・主要な場所の名前の決まり(推定。公式の一覧に無い名前を補う)
TOWNS = {
    "プロンテラ": "prontera", "イズルード": "izlude", "フェイヨン": "payon", "ゲフェン": "geffen", "アルベルタ": "alberta", "モロク": "morocc",
    "コモド": "comodo", "ウンバラ": "umbala", "ニブルヘイム": "niflheim", "アルデバラン": "aldebaran", "ルティエ": "xmas", "ジュノー": "yuno",
    "アインブロック": "einbroch", "アインベフ": "einbech", "リヒタルゼン": "lighthalzen", "フィゲル": "hugel", "ラヘル": "rachel", "ベインス": "veins",
    "アマツ": "amatsu", "コンロン": "gonryun", "龍之城": "louyang", "アユタヤ": "ayothaya", "モスコビア": "moscovia", "ブラジリス": "brasilis",
    "デワタ": "dewata", "ポートマラヤ": "malaya", "マラン島": "malangdo",
}
# 「○○フィールドNN」→ 接頭辞(推定)
FIELDS = {
    "プロンテラ": "prt_fild", "ゲフェン": "gef_fild", "ソグラト砂漠": "moc_fild", "コモド": "cmd_fild", "ウンバラ": "um_fild", "ニブルヘイム": "nif_fild",
    "ジュノー": "yuno_fild", "アインブロック": "ein_fild", "リヒタルゼン": "lhz_fild", "フィゲル": "hu_fild", "ラヘル": "ra_fild", "ベインス": "ve_fild",
}


def guess_id(name):
    """名前の決まりから ID を推定する。決められなければ None。"""
    n = norm(name)
    if n in {norm(k) for k in TOWNS}:
        for k, v in TOWNS.items():
            if norm(k) == n:
                return v
    m = re.fullmatch(r"(.+?)フィールド(\d{1,2})", n)
    if m and m.group(1) in {norm(k) for k in FIELDS}:
        pre = next(v for k, v in FIELDS.items() if norm(k) == m.group(1))
        return "{}{:02d}".format(pre, int(m.group(2)))
    m = re.fullmatch(r"(ソグラト砂漠)(\d{1,2})", n)
    if m:
        return "moc_fild{:02d}".format(int(m.group(2)))
    m = re.fullmatch(r"(ミョルニール山脈)(\d{1,2})", n)
    if m:
        return "mjolnir_{:02d}".format(int(m.group(2)))
    m = re.fullmatch(r"(フェイヨン迷いの森)(\d{1,2})", n)
    if m:
        return "pay_fild{:02d}".format(int(m.group(2)))
    return None


def resolve_ids(names, maplist, manual=None):
    """マップ名のリスト → {名前: {"id": ID か None, "how": "手"/"公式"/"推定"/""}}。
    maplist = [[ファイル名, 名前], …](公式サイトのマップ一覧。空でもよい)・manual = {名前: ID}(利用者が決めたもの。いちばん優先)。"""
    by = {}
    for f, nm in maplist or []:
        by.setdefault(norm(nm), []).append(str(f))
    manual = {norm(k): v for k, v in (manual or {}).items() if v}
    out = {}
    for name in names:
        k = norm(name)
        if k in manual:
            out[name] = {"id": manual[k], "how": "手"}
            continue
        c = [f for f in by.get(k, []) if not _BAD.search(f)]
        if len(c) == 1:
            out[name] = {"id": c[0], "how": "公式"}
            continue
        g = guess_id(name)
        if g:
            out[name] = {"id": g, "how": "推定"}
            continue
        out[name] = {"id": None, "how": "", "cand": c[:4]}        # 決められない(候補が複数・名前が無い)
    return out


# ---- スプレッドシートの URL から取り込む ----
MAIN_SHEETS = ["001", "104", "202", "302", "358", "400", "456", "518", "546", "601"]      # ランタン・ハントの座標のシート(番号の始まり)。よくある並びで、違えば貼り付けで入れる
MORE_SHEETS = ["熊"]                                                                      # もっとランタン・ハントのシート(まだ空のことがある)


def sheet_id(url):
    m = re.search(r"/spreadsheets/d/([A-Za-z0-9_-]{20,})", str(url or ""))
    return m.group(1) if m else ""


def fetch_sheets(url, sheets, fetch, pause=0.4, log=print):
    """URL(リンクで共有されている Google スプレッドシート)の、指定したシートを CSV で取って、1つの文字にして返す。
    fetch(取りにいく URL) → 文字 を渡す(通信は呼び出し側 = 証明書の設定つき)。取れなかったシートは飛ばす。"""
    import time
    import urllib.parse
    sid = sheet_id(url)
    if not sid:
        raise ValueError("スプレッドシートの URL ではありません")
    out, got = [], []
    for name in sheets:
        u = "https://docs.google.com/spreadsheets/d/{}/gviz/tq?tqx=out:csv&sheet={}".format(sid, urllib.parse.quote(name))
        try:
            t = fetch(u)
            if t and t.strip():
                out.append(t)
                got.append(name)
        except Exception as e:      # 共有されていない・シートが無い など
            log("[ランタン] シート {} を取れませんでした: {}".format(name, e))
        time.sleep(pause)
    return "\n".join(out), got


# ---- 同梱の座標の暗号(標準ライブラリだけ。鍵はアプリに入れず、利用キーの確認が通った人にだけサーバーが渡す) ----
SEED_MAGIC = b"FXE1"


def _stream(key, nonce, n):
    out = b""
    i = 0
    while len(out) < n:
        out += hmac.new(key, b"enc" + nonce + i.to_bytes(4, "big"), hashlib.sha256).digest()
        i += 1
    return out[:n]


def seal(plain, key_hex):
    """bytes を暗号化 → FXE1 + nonce(16) + 改ざん検査(32) + 本体"""
    key = bytes.fromhex(key_hex)
    nonce = os.urandom(16)
    ct = bytes(a ^ b for a, b in zip(plain, _stream(key, nonce, len(plain))))
    return SEED_MAGIC + nonce + hmac.new(key, b"mac" + nonce + ct, hashlib.sha256).digest() + ct


def unseal(blob, key_hex):
    """seal の逆。鍵が違う・壊れているときは ValueError"""
    key = bytes.fromhex(key_hex)
    if blob[:4] != SEED_MAGIC or len(blob) < 52:
        raise ValueError("形式が違います")
    nonce, tag, ct = blob[4:20], blob[20:52], blob[52:]
    if not hmac.compare_digest(tag, hmac.new(key, b"mac" + nonce + ct, hashlib.sha256).digest()):
        raise ValueError("鍵が違うか、壊れています")
    return bytes(a ^ b for a, b in zip(ct, _stream(key, nonce, len(ct))))
