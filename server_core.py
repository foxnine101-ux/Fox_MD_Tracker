# -*- coding: utf-8 -*-
"""
どのサーバー(ワールド)の通信かを見分ける。「記録しない」サーバー(露店用など)の通信は記録に回さない。

  jRO の実際の通信で確かめたこと(2026-10-10):
    サーバーごとにキャラ選択サーバーの住所が違う(例 18.182.57.201:6121 と 18.182.57.231:6121)。
    → サーバーは「キャラ選択サーバーの IP」で見分ける。

  マップの接続はキャラ選択の接続から行き先を教わるので、その住所でサーバーを引き継ぐ:
    0x0071 / 0x0AC5  キャラ選択 → マップへ   GID(4)@2 マップ名(16)@6 IP(4)@22 ポート(2)@26
    0x0092 / 0x0AC7  マップサーバーの移動     マップ名(16)@2 x(2)@18 y(2)@20 IP(4)@22 ポート(2)@26
  行き先がわからない接続は、最後にキャラ選択をしたサーバーのものとする(同時に2つのサーバーで遊ぶことはほとんど無い前提)。
"""
import struct
import time

OP_TO_MAP = (0x0071, 0x0AC5, 0x0092, 0x0AC7)
CHAR_PORT = 6121
LOGIN_PORTS = (6900,)
CHARS_MAX = 12          # サーバーごとに覚えておくキャラ名(画面でどのサーバーか見分ける用)


class Servers(object):
    def __init__(self, log=None):
        self.log = log or (lambda *a: None)
        self.ignore = set()     # 記録しないサーバー(キャラ選択サーバーの IP)
        self.known = {}         # IP -> {"first": 時刻, "last": 時刻, "chars": [名前...]}
        self.conn = {}          # 接続 -> サーバー(わからなければ None)
        self.addr = {}          # "IP:ポート"(マップサーバー) -> サーバー
        self.last = None        # 最後にキャラ選択をしたサーバー
        self.changed = False

    # ---------- 保存 ----------
    def snapshot(self):
        return {"known": self.known}

    def restore(self, d):
        if d:
            self.known = d.get("known") or {}

    def set_ignore(self, ips):
        new = set(str(x) for x in ips or [])
        if new != self.ignore:
            self.log("[サーバー] 記録しないサーバー: {}".format(", ".join(sorted(new)) or "なし"))
        self.ignore = new

    # ---------- 通信 ----------
    def new_conn(self, key, is_char=None):
        """新しい接続がどのサーバーのものか決める。key = (サーバーIP, ポート, 自分のIP, 自分のポート)"""
        if key in self.conn or not isinstance(key, tuple) or len(key) < 2:
            return self.conn.get(key)
        ip, port = key[0], key[1]
        if port in LOGIN_PORTS:
            srv = None
        elif is_char if is_char is not None else port == CHAR_PORT:
            srv = ip
            self.last = srv
            now = int(time.time())
            k = self.known.get(srv)
            if k is None:
                k = self.known[srv] = {"first": now, "chars": []}
                self.log("[サーバー] 新しいサーバー: {}".format(srv))
            k["last"] = now
            self.changed = True
        else:
            srv = self.addr.get("{}:{}".format(ip, port), self.last)
        self.conn[key] = srv
        if srv in self.ignore:
            self.log("[サーバー] {}:{} は記録しないサーバー({})の接続なので読み飛ばします".format(ip, port, srv))
        return srv

    def packet(self, key, pkt):
        """マップへの行き先(IP・ポート)を覚える。記録しないサーバーの通信もこれだけは読む。"""
        if len(pkt) < 28:
            return
        op = pkt[0] | (pkt[1] << 8)
        if op not in OP_TO_MAP:
            return
        srv = self.conn.get(key)
        if srv is None:
            return
        ip = ".".join(str(b) for b in pkt[22:26])
        (port,) = struct.unpack_from("<H", pkt, 26)
        self.addr["{}:{}".format(ip, port)] = srv

    def ignored(self, key):
        srv = self.conn.get(key)
        return srv is not None and srv in self.ignore

    def note_char(self, key, name):
        """この接続で遊んでいるキャラ名を、そのサーバーの名前一覧に入れる(画面で見分ける用)。"""
        srv = self.conn.get(key)
        k = self.known.get(srv) if srv else None
        if not k or not name:
            return
        chars = k.setdefault("chars", [])
        if chars and chars[0] == name:
            return
        if name in chars:
            chars.remove(name)
        chars.insert(0, name)
        del chars[CHARS_MAX:]
        self.changed = True

    def view(self):
        """画面用: [{ip, first, last, chars, ignore}](新しく使った順)"""
        out = []
        for ip, k in sorted(self.known.items(), key=lambda kv: -(kv[1].get("last") or 0)):
            out.append({"ip": ip, "first": k.get("first"), "last": k.get("last"), "chars": k.get("chars") or [],
                        "ignore": ip in self.ignore})
        return out
