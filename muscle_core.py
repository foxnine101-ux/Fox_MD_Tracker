# -*- coding: utf-8 -*-
"""
muscle_core.py
24thアニバーサリーの「マッスルマーチ」の20分サイクルと、通知を鳴らすタイミングの判定(通信や画面とは切り離した中身)。

サイクル(ROラトリオ・サイトの rotool bootcamp と同じ。UNIX 時間を1200秒で割った余りで決まる):
  0〜5分   受付・待機
  5〜15分  訓練実施
  15〜20分 休憩
通知のタイミングは画面のトグルで選べる(NOTIFY_POINTS)。初期は「訓練開始の1分前」と「訓練開始」。各サイクルで1回ずつ。
会場は rag_fes1(動作ログで確認: 訓練帯にチェックポイント①〜⑤が消え、その約8秒後に経験値が届く)。参加の記録は md_core の _muscle_record。
"""

CYCLE = 1200
VENUE_MAP = "rag_fes1"      # 会場のマップ(2026-11-25 の動作ログで確認)
TRAIN_FROM, TRAIN_TO = 300, 900
# 通知のタイミング: キー → (サイクルの中の秒, 画面の名前, 通知の文)。画面のトグルのキーと同じ(web/29_muscle.js の MM_POINTS)
NOTIFY_POINTS = {
    "wait":  (0,   "受付の開始",         "受付が始まりました"),
    "pre1":  (240, "訓練開始の1分前",    "訓練開始の1分前です"),
    "start": (300, "訓練の開始",         "訓練が始まりました"),
    "end1":  (840, "訓練終了の1分前",    "訓練終了の1分前です"),
    "rest":  (900, "休憩の開始",         "休憩に入りました"),
}
DEFAULT_POINTS = ("pre1", "start")
WINDOW = 6            # 時刻から何秒の間なら「その時刻」とみなすか


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


def in_notify_window(now):
    """いま、どれかの通知の時刻の範囲か(違えば設定ファイルを読まなくてよい)"""
    t = int(now) % CYCLE
    return any(at <= t < at + WINDOW for at, _n, _m in NOTIFY_POINTS.values())


def wanted_points(setting):
    """設定の mmWhen(キーの一覧)→ 有効なキーの集まり。無い・壊れているときは初期の2つ"""
    if isinstance(setting, (list, tuple)):
        return {k for k in setting if k in NOTIFY_POINTS}
    return set(DEFAULT_POINTS)


def is_hit_window(now, slack=60):
    """経験値が訓練の時間帯(終わりの少し後まで)に届いたか → 参加の報酬とみなしてよい時刻か"""
    t = int(now) % CYCLE
    return TRAIN_FROM <= t < TRAIN_TO + slack


class MuscleNotifier(object):
    """1秒ごとに poll(now, muted, points) を呼ぶ。鳴らすメッセージの一覧(あれば)を返す。
    時刻ごとに「最後に鳴らしたサイクル」を覚えるので、同じサイクルで2回は鳴らない。
    ミュート中・選んでいない時刻は鳴らさず、そのサイクルの分は鳴らしたことにする(あとで切りかえても遅れて鳴らない)。"""

    def __init__(self):
        self.last = {}

    def poll(self, now, muted, points=None):
        pts = set(DEFAULT_POINTS) if points is None else set(points)
        t = int(now) % CYCLE
        cycle = int(now) // CYCLE
        out = []
        for key, (at, _name, msg) in NOTIFY_POINTS.items():
            if at <= t < at + WINDOW and self.last.get(key) != cycle:
                self.last[key] = cycle
                if not muted and key in pts:
                    out.append(msg)
        return out
