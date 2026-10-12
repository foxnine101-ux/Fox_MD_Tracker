# -*- coding: utf-8 -*-
"""
mob_ids.json を rAthena の mob_db.yml から作る(ゲームのモンスター番号 → ID名)。

  python tools/make_mob_ids.py <mob_db.yml> > mob_ids.json
  (mob_db.yml は https://raw.githubusercontent.com/rathena/rathena/master/db/re/mob_db.yml から取れる)

  ゲームの通信の出現パケット(09FD〜FF)の「クラス」(23バイト目)が、この番号と一致する(jRO で確認: 21568 = ECO_AQUA_ELEMENTAL = 氷河のAエレメンタル)。
  ID名は公式ツール(rotool.gungho.jp)のモンスター ID と同じ → 公式のページを名前で探さず、ID で直接取れる。
  コメントアウトされている行(データ未定義の新しいモンスター)の番号も使う。入れるのは「番号と ID名」だけ(公式サイトの中身は入れない)。
"""
import json
import re
import sys

ids, cur = {}, None
for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    m = re.match(r"^#?\s*-\s*Id:\s*(\d+)", line)
    if m:
        cur = int(m.group(1))
        continue
    m = re.match(r"^#?\s*AegisName:\s*(\S+)", line)
    if m and cur is not None:
        ids[str(cur)] = m.group(1)
        cur = None
json.dump(ids, sys.stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
