# -*- coding: utf-8 -*-
"""
quest_names.py
ROクライアントの System フォルダにある「クエスト一覧」から、クエストID → 名前 を作る。

  OngoingQuestInfoList_True.lub … Lua 5.1 の「コンパイル済み」ファイル(最新)
  OngoingQuestInfoList_True.lua … 文字のままのファイル(古いことがある)

.lub は機械語っぽい形なので、表(テーブル)を組み立てる命令だけを
小さく真似して中身を取り出す(ゲームのファイルは読むだけ・書き換えない)。
"""
import json
import os
import re
import struct


# ---------------------------------------------------------------
#  Lua 5.1 バイトコードの読み取り (表を作る命令だけ対応)
# ---------------------------------------------------------------
class _Reader(object):
    def __init__(self, data):
        self.d = data
        self.o = 0
        if data[:4] != b"\x1bLua" or data[4] != 0x51:
            raise ValueError("Lua 5.1 のファイルではありません")
        self.little = data[6] == 1
        self.int_size, self.size_t, self.ins_size, self.num_size = data[7], data[8], data[9], data[10]
        self.integral = data[11]
        self.o = 12
        e = "<" if self.little else ">"
        self.fmt_int = e + {4: "i", 8: "q"}[self.int_size]
        self.fmt_sz = e + {4: "I", 8: "Q"}[self.size_t]
        self.fmt_ins = e + "I"
        self.fmt_num = e + ({8: "d", 4: "f"}[self.num_size] if not self.integral else {8: "q", 4: "i"}[self.num_size])

    def _u(self, fmt, n):
        v = struct.unpack_from(fmt, self.d, self.o)[0]
        self.o += n
        return v

    def byte(self):
        v = self.d[self.o]
        self.o += 1
        return v

    def int(self):
        return self._u(self.fmt_int, self.int_size)

    def string(self):
        n = self._u(self.fmt_sz, self.size_t)
        if n == 0:
            return None
        s = self.d[self.o:self.o + n - 1]  # 最後のNULは除く
        self.o += n
        return s

    def function(self):
        f = {}
        self.string()          # ソース名
        self.int(); self.int()  # 行番号
        self.byte(); self.byte(); self.byte(); self.byte()
        n = self.int()
        f["code"] = list(struct.unpack_from(self.fmt_ins[0] + "%dI" % n, self.d, self.o))
        self.o += 4 * n
        n = self.int()
        ks = []
        for _ in range(n):
            t = self.byte()
            if t == 0:
                ks.append(None)
            elif t == 1:
                ks.append(bool(self.byte()))
            elif t == 3:
                ks.append(self._u(self.fmt_num, self.num_size))
            elif t == 4:
                ks.append(self.string())
            else:
                raise ValueError("知らない定数の型 %d" % t)
        f["k"] = ks
        n = self.int()
        f["p"] = [self.function() for _ in range(n)]
        n = self.int(); self.o += self.int_size * n        # 行情報
        n = self.int()
        for _ in range(n):                                  # ローカル変数名
            self.string(); self.int(); self.int()
        n = self.int()
        for _ in range(n):                                  # アップバリュー名
            self.string()
        return f


def _run(f, env):
    """表を作る命令だけを実行する。ほかの命令は無視。"""
    code, k = f["code"], f["k"]
    R = {}

    def RK(x):
        return k[x & 0xFF] if x & 0x100 else R.get(x)

    def key(v):
        if isinstance(v, float) and v.is_integer():
            return int(v)
        return v

    pc = 0
    top = 0
    while pc < len(code):
        i = code[pc]
        pc += 1
        op = i & 0x3F
        a = (i >> 6) & 0xFF
        c = (i >> 14) & 0x1FF
        b = (i >> 23) & 0x1FF
        bx = i >> 14
        if op == 0:      # MOVE
            R[a] = R.get(b)
        elif op == 1:    # LOADK
            R[a] = k[bx]
        elif op == 2:    # LOADBOOL
            R[a] = bool(b)
            if c:
                pc += 1
        elif op == 3:    # LOADNIL
            for r in range(a, b + 1):
                R[r] = None
        elif op == 5:    # GETGLOBAL
            R[a] = env.get(k[bx])
        elif op == 6:    # GETTABLE
            t = R.get(b)
            R[a] = t.get(key(RK(c))) if isinstance(t, dict) else None
        elif op == 7:    # SETGLOBAL
            env[k[bx]] = R.get(a)
        elif op == 9:    # SETTABLE
            t = R.get(a)
            if isinstance(t, dict):
                t[key(RK(b))] = RK(c)
        elif op == 10:   # NEWTABLE
            R[a] = {}
        elif op == 34:   # SETLIST
            if c == 0:
                c = code[pc]
                pc += 1
            n = b if b else (top - a)
            t = R.get(a)
            if isinstance(t, dict):
                for j in range(1, n + 1):
                    t[(c - 1) * 50 + j] = R.get(a + j)
        elif op == 30:   # RETURN
            break
    return env


def load_lub(path):
    with open(path, "rb") as fh:
        data = fh.read()
    r = _Reader(data)
    return _run(r.function(), {})


# ---------------------------------------------------------------
#  クエストID → 名前
# ---------------------------------------------------------------
def _dec(b):
    if b is None:
        return ""
    if isinstance(b, bytes):
        return b.decode("cp932", "replace")
    return str(b)


DONE_MARK = "【報告済】"


def names_from_lub(path):
    env = load_lub(path)
    tbl = env.get(b"QuestInfoList") or {}
    out = {}
    for qid, v in tbl.items():
        if isinstance(qid, int) and isinstance(v, dict):
            t = v.get(b"Title")
            if t:
                t = _dec(t)
                # ニャル様: 同じ名前で「報告が完了した」印のクエストがある → 見分けられるように印を付ける
                if "NLWD" in t:
                    d = v.get(b"Description")
                    d = " ".join(_dec(x) for x in d.values()) if isinstance(d, dict) else _dec(d)
                    if _dec(v.get(b"Summary")) == "クールタイム" or "報告が完了" in d:
                        t = DONE_MARK + t
                out[qid] = t
    return out


_LUA_RE = re.compile(r'\[(\d+)\]\s*=\s*\{\s*Title\s*=\s*(?:\[=\[|")(.*?)(?:\]=\]|")', re.S)


def nlwd_stages(system_dir):
    """ニャル様クエストの段階: {ID: "進行中"/"完了"/"討伐"…}。lub の Summary から。"""
    p = os.path.join(system_dir, "OngoingQuestInfoList_True.lub")
    out = {}
    try:
        tbl = load_lub(p).get(b"QuestInfoList") or {}
    except Exception:
        return out
    for qid, v in tbl.items():
        if isinstance(qid, int) and isinstance(v, dict) and "NLWD" in _dec(v.get(b"Title")):
            out[qid] = _dec(v.get(b"Summary"))
    return out


def _event_group(title, desc):
    """イベント名(グループ)を推定。説明の先頭【〇〇】→ タイトルの区切り(全角空白/：)の前 → タイトル。"""
    m = re.match(r"\s*(?:\^[0-9A-Fa-f]{6})?\s*【([^】]{2,40})】", desc)
    if m:
        return m.group(1)
    t = re.sub(r"\s*\d+$", "", title)
    for sep in ("\u3000", "：", ":"):
        if sep in t:
            head = t.split(sep)[0].strip()
            if len(head) >= 2:
                return head
    return t


def event_info(system_dir):
    """イベント用クエスト(アイコンが ico_ev)の一覧: {ID: {"g": イベント名, "s": 種類(Summary)}}"""
    p = os.path.join(system_dir, "OngoingQuestInfoList_True.lub")
    out = {}
    try:
        tbl = load_lub(p).get(b"QuestInfoList") or {}
    except Exception:
        return out
    for qid, v in tbl.items():
        if not (isinstance(qid, int) and isinstance(v, dict)):
            continue
        if _dec(v.get(b"IconName")).lower() != "ico_ev.bmp":
            continue
        d = v.get(b"Description")
        d = " ".join(_dec(x) for x in d.values()) if isinstance(d, dict) else _dec(d)
        t = _dec(v.get(b"Title")).strip()
        g = _event_group(t, d).strip() or t or "その他のイベント"
        out[qid] = {"g": g, "s": _dec(v.get(b"Summary"))}
    return out


def names_from_lua(path):
    with open(path, "rb") as fh:
        s = fh.read().decode("cp932", "replace")
    return {int(m.group(1)): m.group(2) for m in _LUA_RE.finditer(s)}


def load_quest_names(system_dir, cache_path=None):
    """.lub(新しい) と .lua(古いことがある) をまとめて読む。新しい方を優先。"""
    names = {}
    lua = os.path.join(system_dir, "OngoingQuestInfoList_True.lua")
    lub = os.path.join(system_dir, "OngoingQuestInfoList_True.lub")
    stamp = []
    for p in (lua, lub):
        if os.path.exists(p):
            stamp.append("%s:%d:%d" % (os.path.basename(p), os.path.getsize(p), int(os.path.getmtime(p))))
    stamp = "v3|" + "|".join(stamp)   # v3: 報告済の印は Summary で判定
    if cache_path and os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as fh:
                c = json.load(fh)
            if c.get("stamp") == stamp:
                return {int(k): v for k, v in c["names"].items()}
        except Exception:
            pass
    if os.path.exists(lua):
        try:
            names.update(names_from_lua(lua))
        except Exception as e:
            print("[クエスト名] .lua を読めませんでした:", e)
    if os.path.exists(lub):
        try:
            names.update(names_from_lub(lub))
        except Exception as e:
            print("[クエスト名] .lub を読めませんでした:", e)
    if cache_path and names:
        try:
            with open(cache_path, "w", encoding="utf-8") as fh:
                json.dump({"stamp": stamp, "names": {str(k): v for k, v in names.items()}}, fh, ensure_ascii=False)
        except Exception:
            pass
    return names


if __name__ == "__main__":
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else r"C:\Gravity\Ragnarok\System"
    n = load_quest_names(d)
    print(len(n), "件")
