# -*- coding: utf-8 -*-
"""
guild_packet.py
ROの通信(サーバー → 自分のPC に届くデータ)を「読むだけ」で、
ギルドメンバーの情報を拾う追加モジュール。guild_tracker.py から使います。

  - ゲームに何かを送ったり、ゲームの中身をいじったりは一切しません
  - ROサーバー(18.182.57.*)から届いたデータ以外は見ずに捨てます
  - Npcap(通信をのぞくためのドライバ)と scapy(Pythonの部品)が必要です

拾うもの:
  0x01F2 / 0x016D  ギルメンの接続・終了のお知らせ (正確な時刻がわかる)
  0x017F           ギルドチャット
  0x008D / 0x0109 / 0x008E  周りの発言 / パーティーチャット / 自分の発言
  0x0AA5 / 0x0154  ギルドメンバー一覧 (職業・Lv・役職など)
  0x0095 / 0x0A30 / 0x0ADF / 0x0194  ID → 名前 (0x0A30 はギルド名つき)
  0x016C           自分のギルド名
  0x015A / 0x015C  脱退・追放のお知らせ

0x0095 / 0x0A30 / 0x008D の形は、jROのリプレイファイル(実データ)で確認済み。
"""

import datetime as dt
import json
import os
import queue
import struct
import threading
import time

# ===============================================================
#  設定
# ===============================================================
# 自分のギルド名。空なら通信(0x016C)から自動で覚える。
GUILD_NAME = ""

# ROサーバーのIPアドレス帯(jRO)。変わったらここを書き換える。
RO_SERVER_NET = "18.182.57.0/24"
RO_SERVER_PREFIX = "18.182.57."

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(HERE, "guild_packet_cache.json")
JOB_FILE = os.path.join(HERE, "job_names.json")

# ===============================================================
#  パケットの形
# ===============================================================
OP_CHARSTAT2 = 0x01F2   # ギルメン接続状態 (20 byte)
OP_CHARSTAT = 0x016D    # ギルメン接続状態・旧型 (14 byte)
OP_NAME_BYGID = 0x0194  # キャラID → 名前 (30 byte)
OP_MEMBER_LIST_NEW = 0x0B7D  # ギルドメンバー一覧・jRO現行 (可変長, 1人58byte)  ※実データ確認済み
OP_MEMBER_LIST = 0x0AA5  # ギルドメンバー一覧 (可変長)
OP_MEMBER_LIST_OLD = 0x0154  # ギルドメンバー一覧・旧型 (可変長)
OP_LEAVE = 0x015A       # 脱退 (66 byte)
OP_BAN = 0x015C         # 追放 (90 byte)
OP_NAME_AID = 0x0095    # アカウントID → 名前 (30 byte)            ※実データ確認済み
OP_NAME_ALL = 0x0A30    # ID → 名前・PT名・ギルド名・役職 (106 byte) ※実データ確認済み
OP_NAME_TITLE = 0x0ADF  # ID → 名前・称号 (58 byte)
OP_GUILD_INFO = 0x016C  # 自分のギルド情報(ギルド名) (43 byte)
OP_CHAT = 0x008D        # 周りの発言 (可変長)                       ※実データ確認済み
OP_CHAT_SELF = 0x008E   # 自分の発言 (可変長)
OP_CHAT_PARTY = 0x0109  # パーティーチャット (可変長)
OP_CHAT_GUILD = 0x017F  # ギルドチャット (可変長)

FIXED_LEN = {
    OP_CHARSTAT2: 20,
    OP_CHARSTAT: 14,
    OP_NAME_BYGID: 30,
    OP_LEAVE: 66,
    OP_BAN: 90,
    OP_NAME_AID: 30,
    OP_NAME_ALL: 106,
    OP_NAME_TITLE: 58,
    OP_GUILD_INFO: 43,
}
MEMBER_LISTS = (OP_MEMBER_LIST_NEW, OP_MEMBER_LIST, OP_MEMBER_LIST_OLD)
CHATS = (OP_CHAT, OP_CHAT_SELF, OP_CHAT_PARTY, OP_CHAT_GUILD)
VARIABLE = MEMBER_LISTS + CHATS
ALL_OPS = tuple(FIXED_LEN) + VARIABLE
CHAT_MAX = 1024
OP_BYTES = {op: struct.pack("<H", op) for op in ALL_OPS}

# メンバー一覧1人分の大きさの候補(クライアントの年代で変わる)
#   34  : AID GID 頭 髪色 性別 職 Lv 貢献EXP 接続中 役職 最終ログイン
#   104 : AID GID 頭 髪色 性別 職 Lv 貢献EXP 接続中 役職 自己紹介(50) 名前(24)
#   58  : AID GID 頭 髪色 性別 職 Lv 貢献EXP 接続中 役職 最終ログイン 名前(24)  ← jRO現行(0x0B7D)
ENTRY_LAYOUTS = (58, 34, 104)

MAX_GUILD_MEMBERS = 80
NAME_LEN = 24


def decode_name(raw):
    """名前(Shift-JIS, NUL終わり)を文字列に。変な中身なら None。"""
    nul = raw.find(b"\x00")
    if nul == 0:
        return None
    if nul > 0:
        raw = raw[:nul]
    try:
        s = raw.decode("cp932")
    except UnicodeDecodeError:
        return None
    s = s.strip()
    if not s or len(s) > NAME_LEN:
        return None
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in s):
        return None
    return s


def _plausible_ids(aid, gid):
    return 0 < aid < 0x7FFFFFFF and 0 < gid < 0x7FFFFFFF and aid != gid


def _parse_entry(e, size, now_epoch):
    aid, gid, head, pal, sex, job, lv, cexp, state, pos = struct.unpack_from("<IIhhhhhiii", e, 0)
    if not _plausible_ids(aid, gid):
        return None
    if sex not in (0, 1) or state not in (0, 1):
        return None
    if not (1 <= lv <= 300) or not (0 <= job < 10000):
        return None
    if not (0 <= pos < 100) or cexp < 0:
        return None
    info = {"aid": aid, "gid": gid, "job": job, "level": lv,
            "contribution": cexp, "online": bool(state), "position": pos}
    if size in (34, 58):
        (last,) = struct.unpack_from("<I", e, 30)
        # 0(不明) か、2002年〜今+2日 の範囲だけ信じる
        if last != 0 and not (1009843200 <= last <= now_epoch + 172800):
            return None
        info["last_login"] = last or None
        if size == 58:
            name = decode_name(e[34:58])
            if not name:
                return None
            info["name"] = name
    else:
        name = decode_name(e[80:104])
        if not name:
            return None
        info["name"] = name
    return info


LAYOUTS_BY_OP = {OP_MEMBER_LIST_NEW: (58,), OP_MEMBER_LIST: (34, 104), OP_MEMBER_LIST_OLD: (104, 34)}


def parse_member_list(pkt, now_epoch=None):
    """メンバー一覧パケットを読む。読めなければ None。"""
    now_epoch = now_epoch or int(time.time())
    if len(pkt) < 4:
        return None
    body = pkt[4:]
    (op,) = struct.unpack_from("<H", pkt, 0)
    for size in LAYOUTS_BY_OP.get(op, ENTRY_LAYOUTS):
        if not body or len(body) % size:
            continue
        n = len(body) // size
        if n > MAX_GUILD_MEMBERS:
            continue
        out = []
        for i in range(n):
            info = _parse_entry(body[i * size:(i + 1) * size], size, now_epoch)
            if info is None:
                break
            out.append(info)
        else:
            if len({m["gid"] for m in out}) == n:
                return out
    return None


def parse_chat(op, pkt):
    """チャットのパケット。「名前 : 発言」の形だけ受け付ける。"""
    if len(pkt) < 6 or pkt[-1] != 0:
        return None
    aid = None
    if op in (OP_CHAT, OP_CHAT_PARTY):
        if len(pkt) < 10:
            return None
        (aid,) = struct.unpack_from("<I", pkt, 4)
        raw = pkt[8:-1]
    else:
        raw = pkt[4:-1]
    if b"\x00" in raw:
        return None
    try:
        text = raw.decode("cp932")
    except UnicodeDecodeError:
        return None
    if any(ord(c) < 0x20 for c in text) or " : " not in text:
        return None
    name, _msg = text.split(" : ", 1)
    name = name.strip()
    if not name or len(name) > NAME_LEN:
        return None
    channel = {OP_CHAT: "周り", OP_CHAT_SELF: "自分", OP_CHAT_PARTY: "PT", OP_CHAT_GUILD: "ギルド"}[op]
    return {"type": "chat", "channel": channel, "aid": aid, "name": name, "msg": _msg}


def parse_packet(op, pkt, now_epoch=None):
    """1パケット分を読んで、イベント(dict)を返す。関係ない/変な中身なら None。"""
    if op == OP_CHARSTAT2:
        aid, gid, st, sex, hair, color = struct.unpack_from("<IIihhh", pkt, 2)
        if not _plausible_ids(aid, gid) or st not in (0, 1) or sex not in (0, 1):
            return None
        if not (0 <= hair < 1000 and 0 <= color < 1000):
            return None
        return {"type": "status", "aid": aid, "gid": gid, "online": bool(st)}
    if op == OP_CHARSTAT:
        aid, gid, st = struct.unpack_from("<IIi", pkt, 2)
        if not _plausible_ids(aid, gid) or st not in (0, 1):
            return None
        return {"type": "status", "aid": aid, "gid": gid, "online": bool(st)}
    if op == OP_NAME_BYGID:
        (gid,) = struct.unpack_from("<I", pkt, 2)
        name = decode_name(pkt[6:30])
        if not (0 < gid < 0x7FFFFFFF) or not name:
            return None
        return {"type": "name", "gid": gid, "name": name}
    if op in (OP_NAME_AID, OP_NAME_ALL, OP_NAME_TITLE):
        (aid,) = struct.unpack_from("<I", pkt, 2)
        name_off = 10 if op == OP_NAME_TITLE else 6
        name = decode_name(pkt[name_off:name_off + 24])
        if not (0 < aid < 0x7FFFFFFF) or not name:
            return None
        ev = {"type": "name", "aid": aid, "name": name}
        if op == OP_NAME_ALL:
            ev["guild"] = decode_name(pkt[54:78])
        return ev
    if op == OP_GUILD_INFO:
        (gdid,) = struct.unpack_from("<I", pkt, 2)
        gname = decode_name(pkt[19:43])
        if not (0 < gdid < 0x7FFFFFFF) or not gname:
            return None
        return {"type": "guild_info", "guild_id": gdid, "guild_name": gname}
    if op in CHATS:
        return parse_chat(op, pkt)
    if op in (OP_LEAVE, OP_BAN):
        name = decode_name(pkt[2:26])
        if not name:
            return None
        return {"type": "leave", "name": name, "kind": "追放" if op == OP_BAN else "脱退"}
    if op in MEMBER_LISTS:
        members = parse_member_list(pkt, now_epoch)
        if members is None:
            return None
        return {"type": "member_list", "members": members}
    return None


# ===============================================================
#  パケットの長さ表 (packet_lengths.json)
#  jROのリプレイ(実データ)で確かめた長さ + 一般的な長さ表。-1 は「長さが中に書いてある」。
# ===============================================================
LENGTHS_FILE = os.path.join(HERE, "packet_lengths.json")
_LENGTHS = None


def load_lengths():
    global _LENGTHS
    if _LENGTHS is None:
        _LENGTHS = {}
        try:
            with open(LENGTHS_FILE, "r", encoding="utf-8") as f:
                for k, v in json.load(f).items():
                    _LENGTHS[int(k, 16)] = int(v)
        except (OSError, ValueError):
            pass
        for op, ln in FIXED_LEN.items():
            _LENGTHS.setdefault(op, ln)
        for op in VARIABLE:
            _LENGTHS.setdefault(op, -1)
    return _LENGTHS


# ===============================================================
#  TCPの流れを1本のデータにつなぎ直して、パケットに切り分ける
# ===============================================================
class StreamScanner(object):
    """1本の通信(サーバー→自分)を受け取って、パケットに切り分ける。

    - 大きいパケットは何回かに分かれて届くので、番号(seq)を見て順番どおりにつなげる
    - 長さ表を使って先頭から1個ずつ切る(=ほかのデータを見間違えない)
    - 表にないパケットが来て見失ったら、「長さ表どおりに3個続けて並んでいる場所」を探して復帰する
    - 見失った区間から学んだ長さは覚えておく(アップデートで新しいパケットが増えても自然に直る)
    """
    MAX_BUF = 1 << 20        # つなぎ待ちでためておく上限(1MB)
    MAX_PACKET = 0xFFFF
    CHAIN = 3                # 復帰の条件: 何個続けて正しく並んでいるか
    PROBATION = 8            # 復帰した直後は、この個数ぶん正しく続くまで結果を保留する

    def __init__(self, on_event, lengths=None):
        self.on_event = on_event
        self.lengths = lengths if lengths is not None else load_lengths()
        self.buf = b""
        self.next_seq = None
        self.pending = {}      # 先に届いてしまった分 seq -> data
        self.synced = True
        self.lost_op = None
        self.lost_since = 0    # 見失った位置からここまでに流れたバイト数
        self.seg_starts = []   # buf 内の「TCPのかたまりの先頭」位置(復帰の第一候補)
        self.learn = {}        # 表にないop -> {長さ: 回数}
        self.stats = {"packets": 0, "lost": 0, "unknown": {}}
        self.probation = 0     # 残りの保留個数
        self.held = []         # 保留中のイベント

    # ---- TCPのつなぎ直し ----
    def feed_segment(self, seq, data):
        if not data:
            return
        if self.next_seq is None:
            self.next_seq = seq
        diff = (seq - self.next_seq) & 0xFFFFFFFF
        if diff >= 0x80000000:
            back = (self.next_seq - seq) & 0xFFFFFFFF
            if back >= len(data):
                return  # 再送
            data = data[back:]
            diff = 0
        if diff > 0:
            self.pending[seq] = data
            if sum(len(v) for v in self.pending.values()) > self.MAX_BUF:
                self._gap()
            return
        self._append(data)
        while True:
            nxt = self.pending.pop(self.next_seq, None)
            if nxt is None:
                break
            self._append(nxt)

    def _gap(self):
        """抜けが埋まらない。あきらめて、次のかたまりから読み直す。"""
        seqs = sorted(self.pending, key=lambda x: (x - self.next_seq) & 0xFFFFFFFF)
        self.next_seq = seqs[0]
        self.buf = b""
        self.seg_starts = []
        self._lose(None)
        for x in seqs:
            if x == self.next_seq:
                self._append(self.pending.pop(x))
        self.pending.clear()

    def _append(self, data):
        self.next_seq = (self.next_seq + len(data)) & 0xFFFFFFFF
        self.feed(data)

    # ---- パケットの切り分け ----
    def _len_at(self, buf, pos):
        """pos から始まるパケットの長さ。表に無い/おかしいなら None、データ不足なら 0。"""
        if pos + 2 > len(buf):
            return 0
        (op,) = struct.unpack_from("<H", buf, pos)
        if op == 0x08AE:
            # 包み込み型: [0x08AE][中身のop][長さ] (jROの実データで確認)
            if pos + 6 > len(buf):
                return 0
            (ln,) = struct.unpack_from("<H", buf, pos + 4)
            return ln if ln >= 6 else None
        ln = self.lengths.get(op)
        if ln is None:
            return None
        if ln == -1:
            if pos + 4 > len(buf):
                return 0
            (ln,) = struct.unpack_from("<H", buf, pos + 2)
            if ln < 4:
                return None
        return ln

    def _chain_ok(self, buf, pos):
        """pos から長さ表どおりに CHAIN 個並んでいるか(最後がデータの終わりにぴったりでもOK)。"""
        n = 0
        while n < self.CHAIN:
            ln = self._len_at(buf, pos)
            if ln is None:
                return False
            if ln == 0:
                return n >= 1 and pos == len(buf)
            pos += ln
            n += 1
            if pos == len(buf):
                return True
            if pos > len(buf):
                return n >= 2   # 最後の1個が途中まで届いている
        return True

    def _chain_strict(self, buf, pos, n=6):
        """pos から n 個が完全に届いていて、長さ表どおりか。データ不足なら None。"""
        for i in range(n):
            ln = self._len_at(buf, pos)
            if ln is None:
                return i >= 3       # 3個以上きれいに続いた後の「表にないもの」は許す
            if ln == 0 or pos + ln > len(buf):
                return None
            pos += ln
        return True

    def _lose(self, op):
        if self.synced:
            self.stats["lost"] += 1
        # 復帰が怪しかった → 保留していた分は、形を厳しく確かめたもの(チャット・接続通知)だけ残す
        held, self.held = self.held, []
        for e in held:
            if e["type"] in ("chat", "status"):
                e["weak"] = True
                self.on_event(e)
        self.probation = 0
        self.synced = False
        self.lost_op = op
        self.lost_since = 0

    def feed(self, data):
        """順番どおりにつながったデータを入れる。"""
        base = len(self.buf)
        self.seg_starts.append(base)
        self.buf += data
        buf = self.buf
        pos = 0
        while pos < len(buf):
            if not self.synced:
                start = pos
                pos = self._resync(buf, pos)
                if pos is None:
                    # まだ見つからない。最後のほうだけ残して次を待つ
                    keep = max(start, len(buf) - 64 * 1024)
                    self._scan_lost(buf[start:keep])
                    self.lost_since += keep - start
                    buf = buf[keep:]
                    self.seg_starts = [x - keep for x in self.seg_starts if x >= keep]
                    pos = len(buf)
                    self.buf = buf
                    return
                self._scan_lost(buf[start:pos])
                self._learn(pos - start + self.lost_since)
                self.synced = True
                self.probation = self.PROBATION
            ln = self._len_at(buf, pos)
            if ln == 0:
                break                       # 続きを待つ
            if ln is None:
                (op,) = struct.unpack_from("<H", buf, pos)
                # 表にないパケット。まず「3〜4バイト目が長さ」の形だと仮定して、その先がきれいに続くか見る
                if pos + 4 > len(buf):
                    break
                (guess,) = struct.unpack_from("<H", buf, pos + 2)
                if 4 <= guess <= 16384:
                    ok = self._chain_strict(buf, pos + guess)
                    if ok is None and guess <= 2048 and len(buf) - pos < 8192:
                        break               # 確かめるための続きを待つ(少しだけ)
                    if ok:
                        self._learn_var(op)
                        pos += guess
                        continue
                u = self.stats["unknown"]
                u["0x%04x" % op] = u.get("0x%04x" % op, 0) + 1
                self._lose(op)
                self.lost_field = (struct.unpack_from("<H", buf, pos + 2)[0]
                                   if pos + 4 <= len(buf) else None)
                pos += 2
                self.lost_since = 2
                continue
            if pos + ln > len(buf):
                break                       # 続きを待つ
            pkt = buf[pos:pos + ln]
            self._handle(pkt)
            pos += ln
        self.buf = buf[pos:]
        self.seg_starts = [x - pos for x in self.seg_starts if x >= pos]

    LOST_SCAN_OPS = (OP_CHAT_GUILD, OP_CHAT, OP_CHAT_PARTY, OP_CHARSTAT2)

    def _scan_lost(self, region):
        """見失っていた区間から、大事なもの(チャット・接続通知)だけは形を厳しく確かめて拾う。"""
        for op in self.LOST_SCAN_OPS:
            b = OP_BYTES[op]
            i = region.find(b)
            while i != -1:
                if op in FIXED_LEN:
                    ln = FIXED_LEN[op]
                elif i + 4 <= len(region):
                    (ln,) = struct.unpack_from("<H", region, i + 2)
                else:
                    ln = 0
                if 6 <= ln <= len(region) - i and (op in FIXED_LEN or ln <= CHAT_MAX):
                    try:
                        ev = parse_packet(op, region[i:i + ln])
                    except struct.error:
                        ev = None
                    if ev is not None:
                        ev["weak"] = True   # 確かさが少し低い印
                        self.on_event(ev)
                i = region.find(b, i + 1)

    def _resync(self, buf, pos):
        # まずは TCPのかたまりの先頭(ほぼ必ずパケットの切れ目)を試す
        for s in self.seg_starts:
            if s >= pos and self._chain_ok(buf, s):
                return s
        # かたまりの先頭で見つからなければ、1バイトずつ(より厳しく6個続くこと)
        for s in range(pos, len(buf) - 1):
            ok = self._chain_strict(buf, s)
            if ok:
                return s
            if ok is None and self._chain_ok(buf, s) and len(buf) - s < 256:
                return None     # 最後のほうで候補あり。続きを待ってから決める
        return None

    def _learn_var(self, op):
        c = self.learn.setdefault(op, {"n": 0, "var": 0, "len": {}})
        c["var_ok"] = c.get("var_ok", 0) + 1
        if c["var_ok"] >= 3:
            self.lengths[op] = -1

    def _learn(self, distance):
        """見失ってから復帰するまでの長さ = 表になかったパケットの長さ(かもしれない)。"""
        op = self.lost_op
        if op is None or not (2 <= distance <= self.MAX_PACKET):
            return
        c = self.learn.setdefault(op, {"n": 0, "var": 0, "len": {}})
        c["n"] += 1
        if getattr(self, "lost_field", None) == distance:
            c["var"] += 1
        c["len"][distance] = c["len"].get(distance, 0) + 1
        if c["n"] >= 3:
            best, cnt = max(c["len"].items(), key=lambda x: x[1])
            if c["var"] >= 3 and c["var"] >= 0.8 * c["n"]:
                self.lengths[op] = -1       # 長さが中に書いてあるタイプ
            elif cnt >= 3 and cnt >= 0.8 * c["n"]:
                self.lengths[op] = best     # いつも同じ長さ

    def _handle(self, pkt):
        self.stats["packets"] += 1
        (op,) = struct.unpack_from("<H", pkt, 0)
        ev = None
        if op in ALL_OPS:
            try:
                ev = parse_packet(op, pkt)
            except struct.error:
                ev = None
        if self.probation > 0:
            if ev is not None:
                self.held.append(ev)
            self.probation -= 1
            if self.probation == 0:
                held, self.held = self.held, []
                for e in held:
                    self.on_event(e)
            return
        if ev is not None:
            self.on_event(ev)


# ===============================================================
#  集めた情報の保存 (guild_packet_cache.json)
# ===============================================================
class GuildCache(object):
    """キャラID(GID)ごとの情報をためておく。"""

    def __init__(self, path=CACHE_FILE):
        self.path = path
        self.lock = threading.Lock()
        self.data = {"chars": {}, "names": {}, "aid_names": {}, "guild_name": GUILD_NAME,
                     "seen_members": {}}
        self.dirty = False
        self.version = 0   # 中身が変わるたびに増える(表を書き直すかの判定用)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    d = json.load(f)
                for k in ("chars", "names", "aid_names", "seen_members"):
                    self.data[k] = d.get(k, {})
                self.data["guild_name"] = GUILD_NAME or d.get("guild_name", "")
            except (OSError, ValueError):
                pass

    def save(self):
        with self.lock:
            if not self.dirty:
                return
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=1)
            os.replace(tmp, self.path)
            self.dirty = False

    def _char(self, gid):
        return self.data["chars"].setdefault(str(gid), {})

    def name_of(self, gid):
        c = self.data["chars"].get(str(gid), {})
        return (c.get("name") or self.data["names"].get(str(gid))
                or self.data["aid_names"].get(str(c.get("aid"))))

    def _resolve(self, gid, c):
        """GIDの名前を、GID→名前 / アカウントID→名前 の順で探す。"""
        return (c.get("name") or self.data["names"].get(str(gid))
                or self.data["aid_names"].get(str(c.get("aid"))))

    def apply(self, ev, now=None):
        """イベントを反映する。目撃ログに残すべきもの (name, time, kind) を返す。"""
        now = now or dt.datetime.now()
        stamp = now.strftime("%Y-%m-%d %H:%M:%S")
        out = []
        with self.lock:
            before = json.dumps(self.data, sort_keys=True, ensure_ascii=False)
            t = ev["type"]
            if t == "name" and "gid" in ev:
                gid = str(ev["gid"])
                if self.data["names"].get(gid) != ev["name"]:
                    self.data["names"][gid] = ev["name"]
                    self.dirty = True
                c = self.data["chars"].get(gid)
                if c is not None and c.get("name") != ev["name"]:
                    c["name"] = ev["name"]
                    self.dirty = True
            elif t == "name":
                aid = str(ev["aid"])
                self.data["aid_names"][aid] = ev["name"]
                for c in self.data["chars"].values():
                    if str(c.get("aid")) == aid and c.get("name") != ev["name"]:
                        c["name"] = ev["name"]
                # 名前表示にギルド名がついていて、自分のギルドなら「在籍」として覚える
                g = ev.get("guild")
                mine = self.data.get("guild_name")
                if g and mine and g == mine:
                    self.data["seen_members"][ev["name"]] = {"aid": ev["aid"], "seen": stamp}
            elif t == "guild_info":
                self.data["guild_name"] = ev["guild_name"]
                self.data["guild_id"] = ev["guild_id"]
            elif t == "chat":
                if ev.get("aid"):
                    self.data["aid_names"][str(ev["aid"])] = ev["name"]
                    for c in self.data["chars"].values():
                        if str(c.get("aid")) == str(ev["aid"]) and not c.get("name"):
                            c["name"] = ev["name"]
                if ev["channel"] == "ギルド":
                    sm = self.data["seen_members"].setdefault(ev["name"], {})
                    sm["seen"] = stamp
                out.append((ev["name"], now, "発言", ev["channel"]))
            elif t == "status" and ev.get("weak") and str(ev["gid"]) not in self.data["chars"]:
                pass    # 確かさが低く、知らないキャラ → 無視
            elif t == "status":
                c = self._char(ev["gid"])
                c["aid"] = ev["aid"]
                c["online"] = ev["online"]
                c["in_guild"] = True
                if ev["online"]:
                    c["last_online_seen"] = stamp
                self.dirty = True
                name = self._resolve(ev["gid"], c)
                if name:
                    c["name"] = name
                    out.append((name, now, "ログイン" if ev["online"] else "ログアウト", "ギルド"))
                else:
                    # 名前がまだわからない。わかった時にまとめて記録する
                    c.setdefault("unnamed_events", []).append(
                        [stamp, "ログイン" if ev["online"] else "ログアウト"])
                    c["unnamed_events"] = c["unnamed_events"][-20:]
            elif t == "member_list":
                listed = set()
                for m in ev["members"]:
                    gid = str(m["gid"])
                    listed.add(gid)
                    c = self._char(gid)
                    for k in ("aid", "job", "level", "contribution", "online", "position"):
                        c[k] = m[k]
                    if m.get("last_login"):
                        c["last_login"] = dt.datetime.fromtimestamp(
                            m["last_login"]).strftime("%Y-%m-%d %H:%M:%S")
                    if m.get("name"):
                        c["name"] = m["name"]
                        self.data["names"][gid] = m["name"]
                    elif self._resolve(gid, c):
                        c["name"] = self._resolve(gid, c)
                    c["in_guild"] = True
                    c["list_seen"] = stamp
                    if m["online"]:
                        c["last_online_seen"] = stamp
                # 一覧に載っていない人 = 抜けた人
                for gid, c in self.data["chars"].items():
                    if gid not in listed and c.get("in_guild"):
                        c["in_guild"] = False
                        c["left_seen"] = stamp
                self.data["list_updated"] = stamp
                self.dirty = True
            elif t == "leave":
                # 知っているギルメンの名前のときだけ信じる(たまたま似た並びのデータ対策)
                hit = False
                for gid, c in self.data["chars"].items():
                    if (c.get("name") or self.data["names"].get(gid)) == ev["name"] and c.get("in_guild"):
                        c["in_guild"] = False
                        c["left_seen"] = stamp
                        hit = True
                if hit:
                    out.append((ev["name"], now, ev["kind"], "ギルド"))
                    self.dirty = True

            # 名前が後からわかった人の、ためていた記録を出す
            for gid, c in self.data["chars"].items():
                if c.get("unnamed_events"):
                    name = self._resolve(gid, c)
                    if name:
                        c["name"] = name
                        for s, kind in c.pop("unnamed_events"):
                            out.append((name, dt.datetime.strptime(s, "%Y-%m-%d %H:%M:%S"), kind, "ギルド"))
                        self.dirty = True
            if json.dumps(self.data, sort_keys=True, ensure_ascii=False) != before:
                self.version += 1
                self.dirty = True
        return out

    def pending_unnamed(self):
        """名前がまだわからない接続記録: [(gid, 時刻文字列, 種類), ...] 古い順"""
        out = []
        with self.lock:
            for gid, c in self.data["chars"].items():
                for s, kind in c.get("unnamed_events", []):
                    out.append((gid, s, kind))
        out.sort(key=lambda x: x[1])
        return out

    def known_names(self):
        with self.lock:
            names = set(self.data["names"].values())
            names.update(self.data["aid_names"].values())
            names.update(c["name"] for c in self.data["chars"].values() if c.get("name"))
        return names

    def member_info(self):
        """名前 -> 表に出す情報 (名前がわかっている人だけ)"""
        jobs = load_job_names()
        res = {}
        with self.lock:
            for name, sm in self.data["seen_members"].items():
                res[name] = {"job": None, "level": None, "last_login": None, "online": None,
                             "in_guild": True, "position": None, "contribution": None,
                             "last_online_seen": None}
            for gid, c in self.data["chars"].items():
                name = self._resolve(gid, c)
                if not name:
                    continue
                job = c.get("job")
                res[name] = {
                    "job": (jobs.get(str(job)) or "ID:{}".format(job)) if job is not None else None,
                    "level": c.get("level"),
                    "last_login": c.get("last_login"),
                    "online": c.get("online"),
                    "in_guild": c.get("in_guild"),
                    "position": c.get("position"),
                    "contribution": c.get("contribution"),
                    "last_online_seen": c.get("last_online_seen"),
                }
        return res


_JOBS = None


def load_job_names():
    global _JOBS
    if _JOBS is None:
        try:
            with open(JOB_FILE, "r", encoding="utf-8") as f:
                _JOBS = json.load(f)
        except (OSError, ValueError):
            _JOBS = {}
    return _JOBS


# ===============================================================
#  通信の読み取り (Npcap + scapy)
# ===============================================================
class PacketWatcher(object):
    """裏で通信を読み続けて、見つけたイベントを queue にためる。"""

    def __init__(self, cache, iface=None, server_net=RO_SERVER_NET, dump_path=None):
        self.cache = cache
        self.iface = iface
        self.server_net = server_net
        self.events = queue.Queue()
        self.scanners = {}
        self.sniffer = None
        self.dump = open(dump_path, "a", encoding="utf-8") if dump_path else None
        self.stats = {"packets": 0, "events": 0}

    def start(self):
        try:
            from scapy.all import AsyncSniffer
        except ImportError:
            raise RuntimeError("scapy が入っていません。  pip install scapy  で入れてください。")
        flt = "tcp and src net {}".format(self.server_net)
        kw = {"filter": flt, "prn": self._on_packet, "store": False}
        if self.iface:
            kw["iface"] = self.iface
        self.sniffer = AsyncSniffer(**kw)
        self.sniffer.start()
        time.sleep(1.5)
        err = getattr(self.sniffer, "exception", None)
        if err is not None or not getattr(self.sniffer, "running", True):
            raise RuntimeError(
                "通信の読み取りを始められませんでした: {}\n"
                "Npcap が入っているか確認してください (https://npcap.com/#download)。".format(err))

    def stop(self):
        if self.sniffer is not None:
            try:
                self.sniffer.stop()
            except Exception:
                pass
        if self.dump:
            self.dump.close()

    def _on_packet(self, p):
        try:
            from scapy.layers.inet import IP, TCP
            if IP not in p or TCP not in p:
                return
            ip, tcp = p[IP], p[TCP]
            if not ip.src.startswith(RO_SERVER_PREFIX):
                return
            data = bytes(tcp.payload)
            if not data:
                return
            self.stats["packets"] += 1
            if self.dump:
                self.dump.write(json.dumps({
                    "t": time.time(), "src": ip.src, "sport": tcp.sport,
                    "dst": ip.dst, "dport": tcp.dport, "seq": tcp.seq,
                    "hex": data.hex()}) + "\n")
            key = (ip.src, tcp.sport, ip.dst, tcp.dport)
            sc = self.scanners.get(key)
            if sc is None:
                sc = StreamScanner(self._on_event)
                self.scanners[key] = sc
            sc.feed_segment(tcp.seq, data)
        except Exception as e:  # 1パケットの失敗で止まらないように
            print("[通信] 読み取りエラー:", e)

    def _on_event(self, ev):
        self.stats["events"] += 1
        for item in self.cache.apply(ev):
            self.events.put(item)

    def learn_name(self, gid, name):
        """チャットログとの突き合わせでわかった名前を覚える。"""
        for item in self.cache.apply({"type": "name", "gid": int(gid), "name": name}):
            self.events.put(item)

    def drain(self):
        """たまった目撃ログを全部取り出す。"""
        out = []
        while True:
            try:
                out.append(self.events.get_nowait())
            except queue.Empty:
                return out


def replay_dump(path, cache):
    """--packet-dump で保存したファイルを読み直す(調査・テスト用)。"""
    scanners = {}
    found = []

    def on_event(ev):
        found.append(ev)
        cache.apply(ev)

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            key = (r["src"], r["sport"], r["dst"], r["dport"])
            sc = scanners.setdefault(key, StreamScanner(on_event))
            sc.feed_segment(r["seq"], bytes.fromhex(r["hex"]))
    return found


# ===============================================================
#  ROのリプレイファイル(.rrf)を読む (動作確認用)
#  ゲームの「リプレイ」機能で保存されるファイル。サーバーから届いたパケットが入っている。
#  ※リプレイにはギルドチャットやギルメンの接続通知は入らない(画面の再現に要る分だけ)
# ===============================================================
RRF_K0, RRF_KD = 0x00CA9000, 0x00E4A240


def read_rrf_packets(path):
    """リプレイから (時刻ms, パケット) を順に返す。"""
    with open(path, "rb") as f:
        d = f.read()
    if not d.startswith(b"<< Ragnarok Replay File"):
        raise ValueError("ROのリプレイファイルではありません")
    # 目次(ID, 長さ, 位置)のうち、ID=1 がパケットの並び
    o = 0x7A
    start = None
    while o + 10 <= 0x200:
        cid, ln, off = struct.unpack_from("<HII", d, o)
        if cid == 1:
            start = off
            break
        o += 10
    if start is None:
        raise ValueError("パケットの場所が見つかりません")
    o = start
    while o + 10 <= len(d):
        _a, t, ln = struct.unpack_from("<IIH", d, o)
        if o + 10 + ln > len(d):
            break
        raw = d[o + 10:o + 10 + ln]
        out = bytearray(raw)
        for i in range(0, ln - 3, 4):   # 4バイトずつXOR。端数は暗号化されていない
            k = (RRF_K0 + (i // 4) * RRF_KD) & 0xFFFFFFFF
            v = int.from_bytes(raw[i:i + 4], "little") ^ k
            out[i:i + 4] = v.to_bytes(4, "little")
        yield t, bytes(out)
        o += 10 + ln


def replay_rrf(path, cache=None):
    """リプレイのパケットを1本の流れとして読ませて、見つかったイベントを返す。"""
    found = []

    def on_event(ev):
        found.append(ev)
        if cache is not None:
            cache.apply(ev)

    sc = StreamScanner(on_event)
    for _t, pkt in read_rrf_packets(path):
        sc.feed(pkt)
    return found


# ===============================================================
#  Npcap の確認とインストール
# ===============================================================
NPCAP_PAGE = "https://npcap.com/"
NPCAP_FALLBACK = "https://npcap.com/dist/npcap-1.89.exe"


def npcap_available():
    """Npcap が入っているか。Windows以外では常に True(libpcapを使う)。"""
    if os.name != "nt":
        return True
    root = os.environ.get("SystemRoot", r"C:\Windows")
    return os.path.exists(os.path.join(root, "System32", "Npcap", "wpcap.dll"))


def npcap_download_url():
    import re
    import urllib.request
    try:
        with urllib.request.urlopen(NPCAP_PAGE, timeout=20) as r:
            html = r.read().decode("utf-8", "replace")
        m = re.findall(r"dist/npcap-(\d+(?:\.\d+)+)\.exe", html)
        if m:
            ver = max(m, key=lambda v: tuple(int(x) for x in v.split(".")))
            return "https://npcap.com/dist/npcap-{}.exe".format(ver)
    except Exception:
        pass
    return NPCAP_FALLBACK


def install_npcap():
    """Npcap のインストーラーをダウンロードして起動する(画面の案内に沿って進めるだけ)。"""
    import tempfile
    import urllib.request
    url = npcap_download_url()
    dst = os.path.join(tempfile.gettempdir(), os.path.basename(url))
    print("Npcap をダウンロードしています:", url)
    urllib.request.urlretrieve(url, dst)
    print("インストーラーを開きます。画面の案内どおり「I Agree」→「Install」で進めてください。")
    print("(「Administrators only」のチェックは入れないでね)")
    if os.name == "nt":
        os.startfile(dst)  # noqa  (Windows専用)
    return dst
