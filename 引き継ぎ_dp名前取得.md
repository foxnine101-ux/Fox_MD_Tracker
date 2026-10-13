# 引き継ぎ: Divine Pride で新パッチのアイテム名を足す(2026-10-13)

このメモは `dp-item-names` ブランチにある。**リリース(版上げ・公開)は本体のセッションでやる**(この作業では main にも入れていないし、`VERSION` も上げていない)。

## 何をしたか
- jRO の最新パッチで更新されたアイテム 67 件が、`id2name.json`(ラトリオ由来)に 1 件も無かった → Divine Pride の API で名前を取って `item_names_fix.json` に足した(54 + 13 = 67 件。名前表は 14,970 → 15,040 件)。
  - 例: `1270290` = `[シャドウ] セレスティアルペンダント` / `300609` = `シレーナカード`。
  - `char_core.load_id2name()` が `item_names_fix.json` を重ねて読むので、アプリ側のコードは変えていない。読み込みは確認ずみ。
- 開発者向けツール `tools/update_item_names_dp.py` を追加。CLAUDE.md の `item_names_fix.json` の行に使い方を追記ずみ。

## ブランチの中身(main との差)
| ファイル | 内容 |
|---|---|
| `item_names_fix.json` | 67 件の名前を追加(番号順) |
| `tools/update_item_names_dp.py` | 新規。名前取得ツール |
| `CLAUDE.md` | `item_names_fix.json` の行に追記 |
| `引き継ぎ_dp名前取得.md` | このメモ |

## リリースするなら(本体でやること)
1. `git pull --rebase origin main`(別のセッションが先に進んでいることがある)して、`dp-item-names` を取り込む。`VERSION` は `md_tracker.py` の今の値を確かめてから上げる(CLAUDE.md の「公開の落とし穴」参照)。
2. データだけの変更。`id2name`/`item_names_fix` は exe に同梱済みなので、版を上げて公開すれば利用者の PC に届く。`--add-data` の追加は不要。
3. 公開前の確認: `python -c "import char_core; d=char_core.load_id2name(); print(len(d), d['1270290'])"` が `15040` と `[シャドウ] セレスティアルペンダント` を返すこと。`python tools/release.py <版> "<日本語メッセージ>" --notes <公開メモ>`。
4. 公開メモの案: 「新パッチ(10/6 ほか)で追加されたアイテム 67 件の名前が出るようになりました(セレスティアルシャドウ装備・新カードなど)」。

## Divine Pride API の仕様(公式ドキュメント https://divine-pride.net/tools/api-doc を読んで確認)
- 基本 URL `https://www.divine-pride.net/api`、キーは**クエリ `apiKey`**。サーバーは**ヘッダー `x-server: jRO`**(クエリの `server=` は無視される)、言語はヘッダー `Accept-Language: ja`。
- エンドポイント: `/database/Monster|Item|Skill|Efst/{id}` と **`/database/latestupdates?type=item|monster|skill|efst&startDate=YYYY-MM-DD`**(更新されたIDと時刻だけ。**1 回で見られるのは startDate から 14 日分まで**。省略すると 14 日前から)。検索・一覧の口は無い。
- 利用ルール: 結果は保存して再取得しない・429 は `Retry-After` を待つ・**ID の総当たりや DB の丸ごとコピーは禁止**(キー失効)。レート制限はキーごと(実測: 数秒おきでも 429 が出ることがある)。
- 実際に叩いて分かったこと: Python の標準の名乗り(User-Agent)だと 403 になるので、ツールは名乗りを付けている。Cloudflare 由来の 520 や読み取りタイムアウトが出ることがある(ツールは再試行する)。
- このクラウド環境では、環境設定の「Network access」に `www.divine-pride.net` を許可しないと届かない。

## 名前取得ツールの使い方
```
set DP_API_KEY=キー                                  (Windows。macOS/Linux は export)
python tools/update_item_names_dp.py                 # 足りない名前を表示するだけ
python tools/update_item_names_dp.py --write         # item_names_fix.json に書く
python tools/update_item_names_dp.py --start 2026-09-01   # 14 日の窓を指定(古いパッチ分。窓ごとに繰り返す)
```
- id2name.json にも item_names_fix.json にも無い番号**だけ**、1 件ずつ詳細を取る(間隔 3 秒・1 回 150 件まで・途中で止まっても取れた分は残る)。
- **キーはアプリ(exe)にもリポジトリにも入れない**。利用者の PC から API は叩かせない(開発者が手元で実行 → 結果の JSON を配る形)。
- 時々(パッチの後)実行して `item_names_fix.json` を更新 → リリース、が運用。

## 注意・まだのこと
- **API キーが `foxnine101-ux/dp` の README.md に平文で書かれている**(コミット履歴にも残る。リポジトリは非公開)。`dp` リポジトリは不要になったので、利用者が消すつもり。消す前に、Divine Pride 側でキーを作り直すかを決めてもらう。このブランチ・このメモにはキーを書いていない。
- `foxnine101-ux/dp`(`add-latest-updates-script` ブランチ)に `dp_latest.py`(更新の一覧を見るだけの試作)がある。必要な機能は `tools/update_item_names_dp.py` に移したので、`dp` を消してよい。
- 名前の分からない**モンスター・スキル**は未対応(`latestupdates` の `type=monster|skill` は同じ要領で取れる。必要なら別ツールで。ただし公式サイトのデータの扱いは `ro_official.py` のポリシーと同じ配慮が要る)。
- 名前が付いても、ラトリオの選択肢とのつなぎは別の話(ラトリオ側にも無い新アイテムは、計算機では「選ぶ」で手で結びつけ)。

## 提案(未着手。利用者に提案ずみ・返事待ち)
「ゲームの番号 → 名前(id2name) → ラトリオの選択肢の名前」の照合を、実行時のあいまい探し(`ratFindOption` / `simcFind` / `resolve_name` の「[3]を外す・【習】を外す・[シャドウ]を外す・カードを外す」)から、**作るときに 1 回だけ**にする案。
1. `tools/` で「ゲームの番号 → ラトリオの番号」の表 `item_link.json` を作って同梱し、実行時は表を引くだけにする(合わない分だけ `SETTINGS.ratLinks` と共有の結びつけが上書き)。
2. Divine Pride の `aegisName` を橋にする案(ラトリオ側に英字名があるかを先に確かめる。未確認)。
3. 名前表 2 枚(`id2name` と `item_names_fix`)をビルド時に 1 枚へ統合する(今も起動時に重ねているだけ)。
→ まず 1 番がおすすめ。ラトリオの取り込みフォルダが要るので、利用者の PC で実行する形になる。
