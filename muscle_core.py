# -*- coding: utf-8 -*-
"""
muscle_core.py
24thアニバーサリーの「マッスルマーチ」の20分サイクルと、通知を鳴らすタイミングの判定(通信や画面とは切り離した中身)。

サイクル(ROラトリオ・サイトの rotool bootcamp と同じ。UNIX 時間を1200秒で割った余りで決まる):
  0〜5分   受付・待機
  5〜15分  訓練実施
  15〜20分 休憩
通知は2つ: 訓練開始の1分前(4:00〜4:59)と、訓練開始(5:00〜5:05)。各サイクルで1回ずつ。
"""

CYCLE = 1200
PRE_FROM, START_FROM, START_TO = 240, 300, 306


def phase_at(now):
    """now(秒) → (key, 名前, サイクルの中の秒, サイクル番号, 次の区切りまでの秒)"""
    sec = int(now)
    t = sec % CYCLE
    cycle = sec // CYCLE
    if t < 300:
        return "wait", "受付・待機", t, cycle, 300 - t
    if t < 900:
        return "train", "訓練実施", t, cycle, 900 - t
    return "rest", "休憩", t, cycle, CYCLE - t


class MuscleNotifier(object):
    """1秒ごとに poll(now) を呼ぶ。鳴らすメッセージ(あれば)を返す。ミュート中は何も返さず、そのサイクルの分は鳴らしたことにする(あとでミュートを外しても遅れて鳴らない)。"""

    def __init__(self):
        self.pre = -1
        self.start = -1

    def poll(self, now, muted):
        _key, _name, t, cycle, _rem = phase_at(now)
        out = None
        if PRE_FROM <= t < START_FROM and self.pre != cycle:
            self.pre = cycle
            out = "訓練開始の1分前です" if not muted else None
        elif START_FROM <= t < START_TO and self.start != cycle:
            self.start = cycle
            out = "訓練が始まりました" if not muted else None
        return out
