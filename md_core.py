# -*- coding: utf-8 -*-
"""
md_core.py
ROの通信(サーバー → 自分)から、キャラごとの「MDのクールタイム(再入場できる時刻)」を拾う中身。
通信のつかまえ方(Npcap/scapy)とは切り離してあるので、リプレイファイルでもテストできる。

使うパケット (jROの実データで形を確認済み):
  0x0B72  キャラ選択画面のキャラ一覧   1人175byte: GID@0, 名前@108(24), 最後のマップ@142(16)
  0x0071  選んだキャラでマップへ        GID@2, マップ名@6(16)
  0x0283  マップに入った: 自分のAID
  0x0095  ID → 名前 (自分のAIDなら自分のキャラ名)
  0x0AFF  クエスト一覧(ログイン/マップ移動のたび) 1件=ID u32, 有効 u8, サーバー現在時刻 u32, 期限 u32, 討伐数 u16 (+討伐情報)
  0x0B0C  クエスト追加 (MDに入ると「〇〇入場時間制限」が増える)
  0x02B4  クエスト削除
  0x0091 / 0x0092  マップ移動 (「@」が入ったマップ = MDの中)
  0x02CD  MD情報 (MDの内部名)

「〇〇入場時間制限」クエストの期限 = そのMDにまた入れるようになる時刻。
サーバーが毎回ぜんぶ送ってくるので、手でチェックしなくてもCTがわかる。
"""
import struct
import time

OP_CHARLIST = 0x0B72
OP_CHAR_TO_MAP = 0x0071
OP_CHAR_TO_MAP2 = 0x0AC5
OP_AID = 0x0283
OP_NAME = 0x0095
OP_NAME_ALL = 0x0A30
OP_QUEST_LIST = 0x0AFF
OP_QUEST_LIST_OLD = 0x09F8
OP_QUEST_ADD = 0x0B0C
OP_QUEST_ADD_OLD = 0x09F9
OP_QUEST_DEL = 0x02B4
OP_MAPMOVE = 0x0091
OP_SERVERMOVE = 0x0092
OP_SERVERMOVE2 = 0x0AC7
OP_MD_INFO = 0x02CD
OP_NPC_TALK = 0x00B4    # NPCの会話文 (op, 長さ, NPCのID, 文章)
OP_PING_AID = 0x0187
OP_PARAM = 0x00B0       # ステータスの値が変わった (varID u16, 値 i32)。11 = BaseLv
OP_LONGPARAM2 = 0x0ACB  # 大きい値が変わった (varID u16, 値 i64)。1 = Base経験値
OP_EXP_GAIN = 0x0ACC    # 経験値をもらった (AID u32, 量 i64, varID u16, 種類 u16[1=クエスト])

# ---- ニャル様のラッキーお散歩デイズ (2026/09/29メンテ後〜10/20メンテ前) ----
# 1回あたりの Base経験値 (BaseLv帯ごと)。公式ページの表より
NYAR_EXP = [(270, 63280000000), (260, 42750000000), (250, 29250000000),
            (240, 20650000000), (230, 15450000000), (220, 11250000000)]
NYAR_WEEK_LIMIT = 420   # 1キャラ・1アカウントとも 1週間に420回まで (火曜12:00リセット)


def nyar_quest_count(title):
    """NLWDクエスト1つを報告したときの経験値獲得回数(公式の表より)。対象外なら 0。"""
    import re
    t = title.replace("　", " ")
    if "NLWD" not in t or t.startswith("NLWD"):     # 「NLWD 〇〇 1回目」はミッションの外枠
        return 0
    if t.startswith("【"):   # 【東部】【西部】【草原】【火炎】【氷河】… は「どれか1つ」のサブクエスト(数えるのは枠のほう)
        return 0
    num = lambda: int((re.search(r"(\d+)", t) or [0, 0])[1]) if re.search(r"\d+", t) else 0
    if "ゲフェニア" in t or "ヴァルキリーレルム" in t or "バイオスフィア" in t:
        return 3
    if "シュラン" in t or "デミフレイヤ" in t:
        return 5
    if "ティアラ姫" in t or "サクライ" in t or "ラスガンド" in t or "侵食されたタン" in t:
        return 8
    if "夢幻の迷宮" in t:
        f = num()
        return 4 if f >= 102 else 3 if f >= 75 else 2
    if "ベテルギウス" in t:
        return 3
    if "星座の塔" in t:
        return 2 if num() == 75 else 1
    if "呪いに汚染された欠片" in t or "暴食の力の回収" in t:
        return 3 if num() >= 11 else 2
    if "アムダライス" in t or "大神官" in t:
        return 4
    if "ヒメルメズ" in t or "ヴェルゼブブ" in t or "憤怒のコア実験体" in t:
        return 6
    if "神獣" in t or "金の竜" in t or "憤怒の思念体" in t:
        return 3
    if "リゲル" in t:
        return 5
    if "傲慢のエナジー" in t:
        return 4 if num() >= 550 else 3
    if "暴走したタナトス" in t:
        return 12
    if "傲慢なタナトス" in t:
        return 8
    return 0


def nyar_exp_for(lv):
    for lo, exp in NYAR_EXP:
        if lv and lv >= lo:
            return exp
    return None


def week_start(t):
    """t を含む週の始まり(火曜 12:00 JST)の UNIX時刻。"""
    jst = t + 9 * 3600
    day = int(jst // 86400)               # 1970/01/01(木)=0
    wd = (day + 3) % 7                    # 月=0 … 火=1
    start_day = day - ((wd - 1) % 7)
    s = start_day * 86400 + 12 * 3600 - 9 * 3600
    if s > t:
        s -= 7 * 86400
    return s    # サーバーからの生存確認。中身は自分のアカウントID
CHAR_PORTS_DEFAULT = {6121}   # jROのキャラ選択サーバーのポート

WANT_OPS = {
    OP_CHARLIST, OP_CHAR_TO_MAP, OP_CHAR_TO_MAP2, OP_AID, OP_NAME, OP_NAME_ALL,
    OP_QUEST_LIST, OP_QUEST_LIST_OLD, OP_QUEST_ADD, OP_QUEST_ADD_OLD, OP_QUEST_DEL,
    OP_MAPMOVE, OP_SERVERMOVE, OP_SERVERMOVE2, OP_MD_INFO, OP_PING_AID,
    OP_PARAM, OP_LONGPARAM2, OP_EXP_GAIN, OP_NPC_TALK,
}

CHAR_ENTRY = 175
HISTORY_MAX = 300


def cstr(b):
    b = b.split(b"\x00", 1)[0]
    try:
        return b.decode("cp932")
    except UnicodeDecodeError:
        return b.decode("cp932", "replace")


def good_name(s):
    return bool(s) and len(s) <= 24 and all(ord(c) >= 0x20 for c in s) and "�" not in s


def parse_quest_list(pkt):
    """0x0AFF / 0x09F8。討伐情報の1件の大きさは長さから逆算する。"""
    if len(pkt) < 8:
        return None
    (count,) = struct.unpack_from("<I", pkt, 4)
    if count > 5000:
        return None
    # まず討伐数だけ拾って、討伐情報1件の大きさを決める
    def walk(hsize):
        out, o = [], 8
        for _ in range(count):
            if o + 15 > len(pkt):
                return None
            qid, act, now, end, hc = struct.unpack_from("<IBIIH", pkt, o)
            o += 15 + hc * hsize
            out.append((qid, act, now, end, hc))
        return out if o == len(pkt) else None
    got = walk(0)
    if got is not None:
        return got
    for hsize in (44, 48, 42, 46, 40, 50, 52, 36, 32, 30, 28, 24, 12):
        got = walk(hsize)
        if got is not None:
            return got
    return None


class MDCore(object):
    """通信1本ごと(=接続ごと)の状態 + キャラ全体の記録。"""

    def __init__(self, quest_names=None, now_func=time.time, log=print):
        self.names = quest_names or {}
        self.now = now_func
        self.log = log
        self.chars = {}         # 名前 -> {"quests": {qid: {...}}, "seen": 時刻, "gid": ...}
        self.gid_name = {}      # キャラ選択画面で見たGID -> 名前
        self.selected = None    # 直前にキャラ選択で選んだキャラ名 (時刻, 名前)
        self.aid_name = {}      # AID -> いまそのAIDで遊んでいるキャラ名
        self.account_aids = set()  # キャラ選択サーバーが最初に送ってくる「自分のアカウントID」
        self.currents = {}      # 自分側のIP -> いま遊んでいるキャラ名(ROを2つ起動しても混ざりにくく)
        self.last_account = None
        self.char_conns = set()  # キャラ選択サーバーとの接続(ここから来たキャラ選択・一覧だけ信じる)
        self.char_ports = set(CHAR_PORTS_DEFAULT)
        self.wait_gid = {}      # 自分側IP -> (名前待ちのGID, 時刻)
        self.conn_account = {}  # キャラ選択サーバーの接続 -> アカウントID
        self.char_info = {}     # キャラ名 -> {"gid", "lv", "job", "account"}
        self.stages = {}        # ニャル様クエストID -> 段階(進行中/完了/討伐)
        self.events = {}        # イベント用クエストID -> {"g": イベント名, "s": 種類}
        self.exp_stats = {}     # 確認用: 経験値通信 "種類/区分" -> [回数, 最大量]
        self.raw_tail = {}      # 接続 -> 前のかたまりの末尾(境目をまたぐ並びも探すため)  # キャラ選択サーバーのポート(途中から読み始めても判定できるように)
        self.conn = {}          # 接続 -> {"aid":, "name":, "pending": [...], "map":, "md":}
        self.history = []       # MD入場の記録
        self.quest_meta = {}    # qid -> {"title":, "span": 最大の残り秒}
        self.changed = False

    # ---------- 外から呼ぶ ----------
    def feed(self, conn_key, pkt):
        if len(pkt) < 2:
            return
        (op,) = struct.unpack_from("<H", pkt, 0)
        if op not in WANT_OPS:
            return
        try:
            self._handle(conn_key, op, pkt)
        except struct.error:
            pass

    def tick(self):
        """一覧が届き終わったか(3秒来なければ終わり)を確かめる。定期的に呼ぶ。"""
        now = self.now()
        for key, c in list(self.conn.items()):
            rep = c.get("report")
            if rep and now - max(rep["t"], c.get("exp_last_t", 0)) > 3:
                c["report"] = None
                self._judge_report(c, rep)
        for key, c in list(self.conn.items()):
            if c["batch"] is not None and now - c["batch_t"] > 3:
                self._close_batch(key, c)

    def _close_batch(self, key, c):
        if c["batch"] is None:
            return
        batch, ok = c["batch"], c["batch_ok"]
        c["batch"] = None
        if ok:
            self._queue(key, c, ("sync", batch, self.now()))

    @staticmethod
    def _side(key):
        return key[2] if isinstance(key, tuple) and len(key) >= 3 else ""

    @property
    def current(self):   # 互換用(テスト・表示)
        return next(iter(self.currents.values()), None) if len(self.currents) == 1 else None

    def account(self, aid, conn_key=None):
        """キャラ選択サーバーにつないだ直後の生の4バイト = 自分のアカウントID。"""
        if conn_key is not None:
            self.char_conns.add(conn_key)
            if 100000 <= aid < 0x7FFFFFFF:
                self.conn_account[conn_key] = aid
            if isinstance(conn_key, tuple) and len(conn_key) >= 2 and isinstance(conn_key[1], int):
                self.char_ports.add(conn_key[1])
        if 100000 <= aid < 0x7FFFFFFF:
            self.last_account = aid
            if aid not in self.account_aids:
                self.account_aids.add(aid)
                self.log("[MD] アカウントID: {}".format(aid))

    def raw(self, key, data):
        """解読とは別に、届いた生データから「自分のID+キャラID+名前」の並びを探す。
        解読がズレた区間でもキャラ名を取りこぼさないための保険。"""
        if not self.account_aids:
            return
        side = self._side(key)
        buf = self.raw_tail.get(key, b"") + data
        self.raw_tail[key] = buf[-40:]
        found = None
        for aid in self.account_aids:
            a = struct.pack("<I", aid)
            i = buf.find(a)
            while i != -1 and found is None:
                # [AID][GID][名前24] (マップに入った直後に届く)
                if i + 8 + 24 <= len(buf):
                    gid = struct.unpack_from("<I", buf, i + 4)[0]
                    name = cstr(buf[i + 8:i + 32])
                    if 0 < gid < 0x7FFFFFFF and good_name(name) and len(name) >= 2 and (
                            gid in self.gid_name or self.wait_gid.get(side, (None,))[0] == gid):
                        found = (gid, name)
                # 0x0095 [AID][名前24] (自分の名前)
                if found is None and i >= 2 and buf[i - 2:i] == b"\x95\x00" and i + 4 + 24 <= len(buf):
                    name = cstr(buf[i + 4:i + 28])
                    if good_name(name) and len(name) >= 2:
                        found = (None, name)
                i = buf.find(a, i + 1)
            if found:
                break
        if not found:
            return
        gid, name = found
        if gid is not None and self.gid_name.get(gid) != name:
            self.gid_name[gid] = name
        w = self.wait_gid.get(side)
        if w and (gid is None or w[0] == gid):
            self.wait_gid.pop(side, None)
        if self.currents.get(side) != name:
            self.currents[side] = name
            self.log("[MD] キャラ名を確定(生データ): {}".format(name))
        c = self._c(key)
        if not c["name"] or c["name"] != name:
            self._set_name(key, c, name)

    def is_char_conn(self, key):
        if key in self.char_conns:
            return True
        return isinstance(key, tuple) and len(key) >= 2 and key[1] in self.char_ports

    def name_for(self, key):
        """その接続で遊んでいるキャラ名(わからなければ None)。"""
        c = self.conn.get(key)
        if c and c.get("name"):
            return c["name"]
        return self.currents.get(self._side(key))

    def snapshot(self):
        return {
            "chars": self.chars,
            "quest_meta": {str(k): v for k, v in self.quest_meta.items()},
            "history": self.history[-HISTORY_MAX:],
            "gid_name": {str(k): v for k, v in self.gid_name.items()},
            "char_ports": sorted(self.char_ports),
            "char_info": self.char_info,
            "account_aids": sorted(self.account_aids),
        }

    def restore(self, data):
        if not data:
            return
        self.chars = data.get("chars", {})
        for c in self.chars.values():
            c["quests"] = {int(k): v for k, v in c.get("quests", {}).items()}
        self.quest_meta = {int(k): v for k, v in data.get("quest_meta", {}).items()}
        self.history = data.get("history", [])
        self.gid_name = {int(k): v for k, v in data.get("gid_name", {}).items()}
        self.char_ports |= set(data.get("char_ports", []))
        self.char_info = data.get("char_info", {})
        self.account_aids |= set(data.get("account_aids", []))   # ゲーム中に起動し直しても自分を見分けられるように

    # ---------- 中身 ----------
    def _c(self, key):
        c = self.conn.get(key)
        if c is None and self.is_char_conn(key):
            # キャラ選択画面に戻った → 次のキャラが決まるまで「いまのキャラ」は不明(前のキャラと混ぜない)
            side = self._side(key)
            if self.currents.get(side):
                self.log("[MD] キャラ選択画面へ: {} の記録をいったん止めます".format(self.currents[side]))
            self.currents[side] = None
        if c is None:
            c = {"aid": None, "name": None, "pending": [], "map": "", "md": "",
                 "batch": None, "batch_t": 0, "batch_ok": True}
            self.conn[key] = c
        return c

    def where(self):
        """キャラごとの「いまいる場所」: {名前: {"map", "md"(MDの中だけ), "t"}}"""
        out = {}
        for c in self.conn.values():
            n, m = c.get("name"), c.get("map")
            if not n or not m:
                continue
            t = c.get("map_t", 0)
            if n not in out or t >= out[n]["t"]:
                out[n] = {"map": m, "md": c.get("md", "") if "@" in m else "", "t": int(t)}
        return out

    def keep_no_ct(self, qid):
        """期限なしでも覚えるクエスト(ニャル様・イベント)"""
        return qid in self.events or "NLWD" in self.title(qid)

    def title(self, qid):
        return self.names.get(qid) or "クエスト{}".format(qid)

    def _handle(self, key, op, pkt):
        now = self.now()
        if op in (OP_CHARLIST, OP_CHAR_TO_MAP, OP_CHAR_TO_MAP2) and not self.is_char_conn(key):
            return   # ゲーム中の通信に偶然まざった同じ並びは無視
        if op == OP_PING_AID:
            (aid,) = struct.unpack_from("<I", pkt, 2)
            if len(pkt) == 6 and 100000 <= aid < 0x7FFFFFFF:
                self.account(aid)
                if self.is_char_conn(key):
                    self.conn_account[key] = aid   # 途中から読み始めても、この接続のアカウントがわかる
                c = self._c(key)
                if c["aid"] is None:
                    c["aid_hint"] = aid
            return
        if op == OP_CHARLIST:
            body = pkt[4:]
            for i in range(len(body) // CHAR_ENTRY):
                e = body[i * CHAR_ENTRY:(i + 1) * CHAR_ENTRY]
                (gid,) = struct.unpack_from("<I", e, 0)
                name = cstr(e[108:132])
                if 0 < gid < 0x7FFFFFFF and good_name(name):
                    self.gid_name[gid] = name
                    # 1人175byte: 職@84 BaseLv@92 (jROの実データで確認)
                    job, lv = struct.unpack_from("<HH", e, 84)[0], struct.unpack_from("<H", e, 92)[0]
                    info = self.char_info.setdefault(name, {})
                    info.update({"gid": gid, "job": job})
                    if 1 <= lv <= 300:
                        info["lv"] = lv
                    acc = self.conn_account.get(key)
                    if acc:
                        info["account"] = acc
                    self.changed = True
            return
        if op in (OP_CHAR_TO_MAP, OP_CHAR_TO_MAP2):
            (gid,) = struct.unpack_from("<I", pkt, 2)
            name = self.gid_name.get(gid)
            self.log("[MD] キャラ選択: GID {} → {}".format(gid, name or "(名前不明・自分の名前の通信待ち)"))
            self.selected = (now, name) if name else None
            acc = self.conn_account.get(key)
            if name and acc:
                self.char_info.setdefault(name, {})["account"] = acc
            if not name:
                self.wait_gid[self._side(key)] = (gid, now)   # 名前はマップ側の生データから探す
            self.currents[self._side(key)] = name   # 名前不明なら None にして、前のキャラと混ざらないようにする
            if self.last_account is not None:
                self.aid_name.pop(self.last_account, None)   # このアカウントはキャラが変わった
            return
        c = self._c(key)
        if op == OP_AID:
            self._close_batch(key, c)
            (aid,) = struct.unpack_from("<I", pkt, 2)
            c["aid"] = aid
            c["name"] = None
            # キャラ選択直後ならそのキャラ。マップ移動(同じキャラのまま)なら前と同じ名前
            if self.selected and now - self.selected[0] < 120:
                self._set_name(key, c, self.selected[1])
                self.selected = None
            elif aid in self.aid_name:
                self._set_name(key, c, self.aid_name[aid])   # 同じキャラのままマップ移動
            return
        if op in (OP_NAME, OP_NAME_ALL):
            (aid,) = struct.unpack_from("<I", pkt, 2)
            mine = (c["aid"] is not None and aid == c["aid"]) or aid in self.account_aids
            if mine:
                name = cstr(pkt[6:30])
                if good_name(name):
                    c["aid"] = aid
                    self.currents[self._side(key)] = name
                    if aid in self.account_aids and self.char_info.get(name, {}).get("account") != aid:
                        self.char_info.setdefault(name, {})["account"] = aid   # 自分の名前の通信 = このアカウントのキャラ
                        self.changed = True
                    if name != c["name"]:
                        self._set_name(key, c, name)
            return
        if op in (OP_QUEST_LIST, OP_QUEST_LIST_OLD):
            # 一覧は何個かのパケットに分かれて届く → まとめてから「消えたクエスト」を判定する
            q = parse_quest_list(pkt)
            if c["batch"] is None:
                c["batch"] = set()
                c["batch_ok"] = True
            c["batch_t"] = now
            if q is None:
                c["batch_ok"] = False
                return
            c["batch"].update(x[0] for x in q)
            self._queue(key, c, ("list", q, now))
            return
        if op in (OP_QUEST_ADD, OP_QUEST_ADD_OLD):
            qid, act, qnow, end = struct.unpack_from("<IBII", pkt, 2)
            self._queue(key, c, ("add", (qid, act, qnow, end), now))
            return
        if op == OP_QUEST_DEL:
            (qid,) = struct.unpack_from("<I", pkt, 2)
            self._queue(key, c, ("del", qid, now, key))
            return
        if op == OP_PARAM and len(pkt) >= 8:
            var, val = struct.unpack_from("<Hi", pkt, 2)
            if var == 11 and 1 <= val <= 300:          # BaseLv
                name = self.name_for(key)
                if name:
                    info = self.char_info.setdefault(name, {})
                    if info.get("lv") != val:
                        info["lv"] = val
                        self.changed = True
            return
        if op == OP_EXP_GAIN and len(pkt) >= 18:
            aid, amount, var, kind = struct.unpack_from("<IqHH", pkt, 2)
            # 経験値の通信は自分あてだけ → ここのIDは自分のアカウントID(途中から起動しても覚えられる)
            if c.get("aid") is None and 100000 <= aid < 0x7FFFFFFF and not self.is_char_conn(key):
                c["aid"] = aid
                if aid not in self.account_aids:
                    self.account(aid)
                    self.log("[MD] 経験値の通信から自分のアカウントIDを覚えました: {}".format(aid))
            st = self.exp_stats.setdefault("{}/{}".format(var, kind), [0, 0])
            st[0] += 1
            st[1] = max(st[1], amount)
            if var == 1 and amount > 0 and (aid in self.account_aids or aid == c.get("aid")):
                self._exp_gain(key, amount, kind, "0ACC")
            return
        if op == OP_LONGPARAM2 and len(pkt) >= 12:
            var, val = struct.unpack_from("<Hq", pkt, 2)
            if var == 1:                                # Base経験値の現在値
                last = c.get("base_exp")
                c["base_exp"] = val
                if last is not None and val > last and now - c.get("exp_gain_t", 0) > 3:
                    self._exp_gain(key, val - last, None, "0ACB差分")
            return
        if op == OP_NPC_TALK and len(pkt) > 8:
            self._npc_talk(key, c, cstr(pkt[8:]), now)
            return
        if op == OP_MD_INFO:
            c["md"] = cstr(pkt[2:63])
            return
        if op in (OP_MAPMOVE, OP_SERVERMOVE, OP_SERVERMOVE2):
            m = cstr(pkt[2:18])
            if m.endswith(".gat"):
                m = m[:-4]
            prev = c["map"]
            c["map"] = m
            c["map_t"] = now
            if ("@" in m) != ("@" in prev):
                self.changed = True          # MDに入った/出た → ウェブの「いまいる場所」を更新
            if "@" in m and "@" not in prev:
                self._queue(key, c, ("enter", m, now))
            if op != OP_MAPMOVE:
                # サーバー移動は新しい接続でも覚えておく(次の接続のために)
                self._last_map = m
            return

    def _exp_gain(self, key, amount, kind, src):
        """もらった経験値が「ニャル様の1回分 × 整数」ならミッション報告として数える。
        1回の報告で何個かの通信に分かれて届く場合に備えて、3秒以内のまとまり(合計)でも判定する。"""
        c = self._c(key)
        now = self.now()
        c["exp_gain_t"] = now
        name = self.name_for(key)
        lv = self.char_info.get(name, {}).get("lv") if name else None
        if amount >= 1000000000:
            self.log("[経験値] {} (Lv{}) +{:,} {}".format(name or "(キャラ不明)", lv or "?", amount, src))
        b = c.get("burst")
        if not b or now - b[1] > 3:
            b = [now, now, 0, 0]          # 開始, 最後, 合計, 個数
        b[1] = now
        b[2] += amount
        b[3] += 1
        c["burst"] = b
        if b[2] >= 10000000000:
            c["big_exp_t"] = now          # 報告らしい大きな経験値(合計100億以上)が来た
            c["big_exp_total"] = b[2]
        # 報告ひとまとまりの経験値(20秒あけば区切り)
        if now - c.get("exp_last_t", -99) > 20:
            c["rep_exp"] = 0
        c["rep_exp"] = c.get("rep_exp", 0) + amount
        c["exp_last_t"] = now

    def _judge_report(self, c, rep):
        """報告で消えたクエストから、達成していた分だけを数える。
        - 段階があるクエスト: 「完了」段階のIDが消えたものだけ
        - 討伐クエスト(IDが1つ): 経験値の合計と合う組み合わせを選ぶ(1回分の経験値はキャラごとに学習)"""
        import itertools
        name = rep["name"]
        lv = self.char_info.get(name, {}).get("lv")
        unit = nyar_exp_for(lv)
        sure, unsure, seen = [], [], set()
        for qid in rep["dels"]:
            t = self.title(qid)
            n = nyar_quest_count(t)
            if not n or t in seen:
                continue
            st = self.stages.get(qid, "")
            if st == "進行中":
                continue                      # 未達成のまま片付けられた
            if st == "完了":
                seen.add(t); sure.append((t, n))
            elif (t, n) not in unsure:
                unsure.append((t, n))
        # 同じ名前の「完了」があれば討伐側は捨てる
        unsure = [(t, n) for t, n in unsure if t not in seen]
        ch = self._char(name)
        per = ch.get("exp_per_count")          # このキャラの1回分の実際の経験値(経験値アップ込み)
        exp = c.get("rep_exp", 0)
        chosen = list(unsure)
        if unsure and per:
            target = exp / per - sum(n for _, n in sure)
            best = None
            for r in range(len(unsure) + 1):
                for comb in itertools.combinations(unsure, r):
                    d = abs(sum(n for _, n in comb) - target)
                    if best is None or d < best[0]:
                        best = (d, comb)
            chosen = list(best[1])
        total = sum(n for _, n in sure) + sum(n for _, n in chosen)
        if total and exp and (not unsure or not per):
            ch["exp_per_count"] = exp / float(total)   # 確実な報告から1回分を覚える
        if total:
            skipped = [t for t, _ in unsure if (t, dict(unsure)[t]) not in chosen]
            self._nyar_count(name, total, lv, c, "クエスト報告", " / ".join(t for t, _ in sure + chosen))
            if skipped:
                self.log("[ニャル様] {}: 未達成と判断: {}".format(name, " / ".join(skipped)))

    def _nyar_count(self, name, n, lv, c, src, quest=""):
        now = self.now()
        ws = week_start(now)
        ny = self._char(name).setdefault("nyar", {})
        if ny.get("week") != ws:
            ny.clear()
            ny.update({"week": ws, "count": 0, "log": []})
        ny["count"] += n
        ny["log"].append({"t": int(now), "n": n, "lv": lv, "map": c.get("map", ""), "q": quest})
        del ny["log"][:-200]
        self.changed = True
        self.log("[ニャル様] {}: 報告 {}回分 (今週 {}/{})  {}".format(name, n, ny["count"], NYAR_WEEK_LIMIT, src))

    def _npc_talk(self, key, c, text, now):
        """ニャル様の会話から公式の回数とミッションの状況を読む(いちばん正確)。
        例: [103/420]【アカウントの経験値獲得回数】 / [0/420]【このキャラクターの経験値獲得回数】 / [未受注] 浸食されたゲフェニア 1回目"""
        import re
        t = re.sub(r"\^[0-9a-fA-F]{6}", "", text).strip()
        name = self.name_for(key)
        if not name:
            return
        m = re.match(r"\[(\d+)\s*[／/]\s*(\d+)\]\s*【(アカウント|このキャラクター)の経験値獲得回数】", t)
        ws = week_start(now)
        ny = self._char(name).setdefault("nyar", {})
        if ny.get("week") != ws:
            ny.clear()
            ny.update({"week": ws, "count": 0, "log": []})
        if m:
            n = int(m.group(1))
            if m.group(3) == "アカウント":
                ny["acc_official"] = {"n": n, "t": int(now)}
                self.log("[ニャル様] {}: アカウントの今週の回数(公式) {}/{}".format(name, n, m.group(2)))
            else:
                if ny.get("count") != n:
                    self.log("[ニャル様] {}: このキャラの今週の回数を公式の {} に合わせました(記録は {})".format(name, n, ny.get("count")))
                ny["count"] = n
                ny["official"] = {"n": n, "t": int(now)}
            self.changed = True
            return
        m = re.match(r"\[([^\]]{2,6})\]\s*(.+?)\s*$", t)
        if m and ("回目" in m.group(2) or any(k in m.group(2) for k in ("迷宮", "塔", "殿堂", "次元", "特異点", "別荘", "墓", "不死者", "最後"))):
            ms = ny.setdefault("missions", {})
            if ms.get(m.group(2)) != m.group(1):
                ms[m.group(2)] = m.group(1)
                self.changed = True

    def _set_name(self, key, c, name):
        if c.get("name") != name:
            self.log("[MD] この接続のキャラ: {} (AID {})".format(name, c.get("aid")))
        c["name"] = name
        if c["aid"] is not None:
            self.aid_name[c["aid"]] = name
        pend, c["pending"] = c["pending"], []
        for item in pend:
            self._apply(name, item)

    def _queue(self, key, c, item):
        cur = self.currents.get(self._side(key))
        if not c["name"] and cur and c["aid"] is None:
            self._set_name(key, c, cur)   # AIDが来ない接続は、いま遊んでいるキャラの続き
        if c["name"]:
            self._apply(c["name"], item)
        else:
            c["pending"].append(item)
            del c["pending"][:-60]

    def _char(self, name):
        ch = self.chars.get(name)
        if ch is None:
            ch = {"quests": {}, "seen": 0}
            self.chars[name] = ch
            self.log("[MD] 新しいキャラ: {}".format(name))
        return ch

    def _meta(self, qid, remain):
        m = self.quest_meta.get(qid)
        if m is None:
            m = {"title": self.title(qid), "span": 0}
            self.quest_meta[qid] = m
        m["title"] = self.title(qid)
        if remain > m.get("span", 0):
            m["span"] = int(remain)

    def _sync_missions(self, name, ch):
        """ニャル様の会話で覚えたミッション状況を、クエストの最新状態で上書きする
        (会話の内容は次に話しかけるまで更新されないので、古いまま残らないように)"""
        ny = ch.get("nyar") or {}
        ms = ny.get("missions")
        if not ms or ny.get("week") != week_start(self.now()):
            return
        for qid in ch["quests"]:
            t = self.title(qid)
            if not (t.startswith("NLWD") or t.startswith("【報告済】NLWD")):
                continue
            done = t.startswith("【報告済】")
            key = t.replace("【報告済】", "").replace("NLWD", "", 1).strip()
            new = "報告済み" if done else "未報告"
            if ms.get(key) != new and not (not done and ms.get(key) == "報告済み"):
                ms[key] = new
                self.changed = True

    def _apply(self, name, item):
        kind = item[0]
        ch = self._char(name)
        try:
            self._apply2(name, item, ch)
        finally:
            if kind in ("list", "add", "sync"):
                self._sync_missions(name, ch)

    def _apply2(self, name, item, ch):
        kind = item[0]
        ch["seen"] = int(item[2] if item[0] == "del" else item[-1])
        self.changed = True
        if kind == "list":
            _, q, now = item
            for qid, act, qnow, end, _hc in q:
                if end <= 0:
                    if self.keep_no_ct(qid):     # ニャル様・イベントのクエストは期限なしでも覚える
                        self._meta(qid, 0)
                        ch["quests"][qid] = {"end": 0, "since": ch["quests"].get(qid, {}).get("since") or int(now), "nlwd": 1}
                    else:
                        ch["quests"].pop(qid, None)
                    continue   # 期限の無いクエストは関係なし
                ref = qnow or now
                self._meta(qid, end - ref)
                old = ch["quests"].get(qid, {})
                ch["quests"][qid] = {"end": int(end),
                                     "since": old.get("since") if old.get("end") == end else int(ref)}
        elif kind == "sync":
            _, batch, now = item
            for qid in [k for k in ch["quests"] if k not in batch]:
                del ch["quests"][qid]
            self.log("[MD] {}: クエスト一覧を受信 (CT付き {}件)".format(name, len(ch["quests"])))
        elif kind == "add":
            _, (qid, act, qnow, end), now = item
            if "NLWD" in self.title(qid):
                self.log("[ニャル様] {}: クエスト付与 {} (期限 {})".format(name, self.title(qid), _fmt(end) if end > 0 else "なし"))
            if end <= 0 and self.keep_no_ct(qid):
                self._meta(qid, 0)
                ch["quests"][qid] = {"end": 0, "since": int(now), "nlwd": 1}
            if end > 0:
                ref = qnow or now
                self._meta(qid, end - ref)
                ch["quests"][qid] = {"end": int(end), "since": int(ref)}
                self.log("[MD] {}: {} → {}".format(name, self.title(qid), _fmt(end)))
        elif kind == "del":
            qid, now = item[1], item[2]
            if "NLWD" in self.title(qid):
                self.log("[ニャル様] {}: クエスト終了 {}".format(name, self.title(qid)))
                cc = self.conn.get(item[3]) if len(item) > 3 else None
                if cc is not None and now - cc.get("big_exp_t", -99) <= 15:
                    rep = cc.get("report") or {"name": name, "dels": [], "t": now}
                    cc["report"] = rep
                    rep["dels"].append(qid)
                    rep["t"] = now
            if ch["quests"].pop(qid, None) is not None:
                self.log("[MD] {}: {} が消えました(また入れる)".format(name, self.title(qid)))
        elif kind == "enter":
            _, m, now = item
            conn_md = ""
            for cc in self.conn.values():
                if cc["name"] == name and cc["md"]:
                    conn_md = cc["md"]
            self.history.append({"char": name, "map": m, "md": conn_md, "t": int(now)})
            del self.history[:-HISTORY_MAX]
            self.log("[MD] {} がMDに入りました: {}".format(name, m))


def _fmt(t):
    import datetime as dt
    return dt.datetime.fromtimestamp(t, dt.timezone(dt.timedelta(hours=9))).strftime("%m/%d %H:%M")
