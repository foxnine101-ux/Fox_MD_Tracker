# Fox_MD_Tracker 引き継ぎメモ

ラグナロクオンライン(jRO)の通信を読んで、キャラごとのMDクールタイム・ニャル様の報告・被ダメ・装備・ゼニーを記録して画面に出す Windows 常駐ツール(計算機・ハロウィン用タブ・ランタンハントつき)。
利用者はプログラミング初心者。説明は日本語で、専門用語は身近なものにたとえる。作業は確認を挟まず最後まで進め、自分で動作確認してから報告する。
**この文書は「いまの仕様と進め方」だけ。版ごとの経緯・実測の数字・落とし穴の詳しい話は `docs/開発履歴.md`(2026-11-01 までの全履歴。`grep -n "v2.58.40" docs/開発履歴.md` のように版や関数名で探す)。公開のたびに、経緯・実測・落とし穴は `docs/開発履歴.md` の先頭に追記し、`CLAUDE.md` には「いまの仕様」が変わった分だけ反映する。**

## 開発の進め方
- **正は GitHub の main**。作業の最初に `git pull --rebase origin main`、区切りごとに push。別のセッション(フォーク)が先に進んでいることがある。`md_tracker.py` の `VERSION` もいま何版か読み直す
- **作業の最初に動作ログを見る(利用者の決めたルール)**: 依頼が別の内容でも、まず Desktop の `動作ログ.txt` の末尾と、ID が絡む行(`マップ=`・MD 名・「不明」や `ID数字` のまま出ている名前・エラー)を確かめ、マップ ID・モンスター ID・名前の対応が台帳(`map_ledger`・`mob_ids.json` など)と食い違っていないか見てから答える。見つけたものは回答の最後に短く報告し、直せるものは直す
- コミットは `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`(既定のメールだと GitHub が push を拒否)。メッセージは日本語
- 公開: `PYTHONIOENCODING=utf-8 python tools/release.py <版> "<日本語メッセージ>" --notes <公開メモ>`(検査 → VERSION → release_notes.md → コミット → push → Actions 成功まで待つ。`--dry-run` で検査だけ)。**公開メモは先頭が見出し行(「・…（v2.xx.x）」)、続きが「  - …」の箇条書き。メモのファイルはリポジトリの外(scratchpad)に置く**(`git add -A` で入る)。メッセージに絵文字を入れない(cp932 で落ちる)。細かい公開を重ねない(利用者の希望)。リリース前に critic に diff を見せる。場所探しは scout
- 画面のテスト: `python tools/ui_test_server.py`(ポート 18788・保存は一時フォルダ・起動時に `web/*.js` を写すので JS を直したら起動し直す)。本物のデータは `--data <フォルダ>` で読むだけ、計算機の中身は `--ratorio <フォルダ>`。確認は新しいタブで。自動更新の確認は `tools/redraw_check.js`(`{kept:true, redrawn:true}` が正常)
- 検査: `python -m pyflakes *.py`、`web/*.js` を1つずつ `node --check`(`release.py` がやる)。**属性やメソッドを足すときは同名が無いか grep**(`self.kinds` が `kinds()` を上書きして `/api/data` が落ちた)。公開前は本物のデータで `/api/data` が 200 で返ることを確認
- 利用者の実測データ: `C:\Users\fuso1\OneDrive\Desktop\Fox_MD_Tracker`(読むだけ。`設定.json` は送信キーがあるので開かない)。開発用のコピー: `F:\Claude\Fox_dev_data\Fox_MD_Tracker\`(環境変数 `FOX_MD_HOME` で `DATA_HOME` を差しかえる。`tools/run_dev.bat`)
- 公開の落とし穴: 作業ツリー(worktree)は古い写しから始まる → 最初に pull。`release.py` は作業ツリーでは使えない(手で `git fetch && git rebase origin/main && git push origin HEAD:main` → `gh run watch`)。`release.py` は `git add -A` なので、鍵・`api.txt`・データを置かない
- 新しく通信を足すときは `context=netutil.CTX` を付ける(証明書エラー対策)
- **教訓(再発したもの)**: ①保存するものに変わりうる辞書を参照で入れない(コピーする)②同じデータを作る場所は全部探す(`SIMC.report` が2か所)③「PID が生きている」は「自分が動いている」ではない(mutex を使う)④押せないボタンは反応がないように見える → 理由を出す ⑤「署名が無い」問題はインストーラー形式を変えても直らない ⑥heredoc で日本語・バックスラッシュ入りのコードを書くと壊れる → ファイルに書いて実行するか Edit を使う

## ファイル(Python)
| ファイル | 役目 |
|---|---|
| `md_tracker.py` | 本体。通信を読む(scapy `Sniffer`・`_Scanner`)・ローカルWebサーバー(127.0.0.1:8788。巨大な `Handler`)・トレイ・保存・`VERSION`。`pick_iface` / `Sniffer.widen`(通信が1つも来ないとき全部の回線で聞き直す) |
| `md_core.py` | MD のクエスト期限・キャラ・接続・ニャル様の判定・キャラ選択画面の一覧(0B72) |
| `char_core.py` | キャラのステ・装備・ゼニー・装備セット(下) |
| `dmg_core.py` | 被ダメ・相手の名前・ダメージの無い技・場所の整理(`canon_where`)・モンスタータブ(`place_view`/`place_guide`) |
| `guild_packet.py` | 通信の切り分け(`StreamScanner`)・Npcap |
| `server_core.py` | どのサーバー(ワールド)の通信か。キャラは「名前@サーバーIP」で記録(`qualify`)。画面は `cn()` で @ 以降を外す |
| `map_ledger.py` | マップ ID ↔ 日本語名の台帳(下) |
| `ro_official.py` | 公式サイト(rotool.gungho.jp)から、この PC にだけ集める(下) |
| `market_core.py` | 相場(露店の取引履歴): 公式の `/item_trade_log_filtered_search/`・`…summary…` を、画面の「相場」ボタンを押したときだけ3秒あけて取り、`相場.json`(この PC だけ・.gitignore)に新しい60件+概要を保存。6時間は取り直さない。単価 = price ÷ item_count、Noatun価格 = それ ÷ 1000 |
| `lantern_core.py` | ランタンハント(座標の取り込み・マップ ID・暗号化した同梱データ) |
| `quest_names.py` | RO の `System/*.lub`(Lua バイトコード)を自前で読む小さな VM。クエスト名・イベント |
| `ratorio_core.py` | 計算機(ROラトリオ)をフォーク `foxnine101-ux/ratorio` から取り込み、exe の隣の「ラトリオ」に置く(変わった分だけ)。**本家の更新はフォークに merge するだけ** |
| `license_core.py` / `records_sync.py` / `netutil.py` / `updater.py` / `appwin.py` / `tray.py` / `ocr_core.py` / `edition.py` | 利用キー・2台の同期 / 記録の引っ越し / 証明書つき通信 / 自動アップデート / 専用の窓(pywebview)/ トレイ / スクショからアイテム名 / 公開版・開発版の切りかえ |

データ(同梱): `id2name.json`(アイテム名)・`item_names_fix.json`(手直し)・`item_link.json`(ゲームの番号→ラトリオの番号)・`gear_info.json`(耐性)・`skill_*.json`・`mob_info.json`・`mob_ids.json`(モンスター番号→ID名)・`option_names.json`・`calc_data.json`・`ail_counter.json`・`packet_lengths.json`・`ratorio_cdn/`・`lantern_seed.bin`(暗号化)。データファイルを増やしたら `build.yml` の `--add-data` 2か所(公開版・開発版)にも足す。作り方は `tools/make_*.py`(コメントに引数)。

## 画面(`app.html` は枠だけ。中身は `web/NN_名前.js` を番号順に読む。1つの名前空間を共有)
`01_base`(設定・サーバー・アカウント・複数選択・render 骨組み) / `02_menu`(右クリック・MDの表・ゼニー表示) / `03_resist`(耐性・スタイル) / `04_dmg_equip`(被ダメ・装備・外し忘れの印) / `05_sim_core`(計算機の土台 `ENG`/`SIMC`) / `06_sim_gear`(装備編集・装備スロット・支援) / `07_sim_status`(ステータスシミュレーター) / `08_sim_compare` / `09_sim_sandbag`(サンドバックマン・精霊) / `10_sim_atk`(与ダメ) / `11_sim_fox`(ゲームのキャラ→計算機 `simcFromFox`/`simcWear`) / `12_sim_dmgcheck` / `13_ratorio` / `14_chars` / `15_halloween`(次郎・経験値・ランタン) / `16_equipset` / `17_official` / `18_events` / `19_nyar` / `20_monsters_maps` / `21_license_sync` / `22_update` / `25_inventory`(インベントリ・相場。`23_boot` の前に読む)/ `23_boot`(最後。`load()`) / `24_lantern_route`(**`tools/make_app_route.py` が `tools/lantern_route.js` から作る。直接は直さない**)。
- 注意: 関数宣言の巻き上げは同じファイルの中だけ。**読み込み中(トップレベル)にあとのファイルの関数を呼ばない**。ファイルを足したら `app.html` の `<script src>` に番号順で足す。確認の型: 古い版と新しい版を別ポートで動かし、全タブ・サブタブの描画ハッシュが一致すること
- 自動の読み直し(5秒)は `load(quiet)`(同じ内容なら描き直さない)。60ms 以上かかる画面は15秒に1回まで。描き直しで横スクロールが戻らないよう `HSCROLL_SEL` を覚える。エラーは `render()` の try/catch で画面に出し `/api/jslog` で `エラーログ.txt` へ

## ビルド・公開
`main` に push → GitHub Actions(`build.yml`)。公開版 `Fox_MD_Tracker.exe` は `VERSION` が上がったときだけリリースに置く(本文は `release_notes.md`)。開発版は毎回 Artifacts(自動更新なし)。署名は無い(スマート アプリ コントロールがオンの PC では起動できない。利用者の方針: 無理に使ってもらわない・オフにできる人だけ)。

## jRO の通信で確かめた形(rAthena と違うところ)
- 出現 09FD/09FE/09FF: 名前は 90/83/84 バイト目から最後まで(可変長)、ID は 5、種類 pkt[4](5=モンスター・0=プレイヤー・6=NPC・7=ペット・10=精霊)、職業(クラス)は 23(= rAthena mob_db の Id)、速さは 13
- 名前の返事: 0095/0A30 は 6〜30、0ADF は 10〜34。自分の移動 0087、止まる 0088/01FF、マップ移動 0091/0092/0AC7 [名前16][x][y]。01DE の Lv はモンスターだと -1 が多い
- BaseLv(00B0 の 11)・JobLv(55)はふだん流れず、上がったときだけ。**キャラ選択の一覧 0B72(1人175バイト・先頭4バイトの後)**: GID@0・**ゼニー u32@12**・JobLv u32@24・職業@84・BaseLv@92・名前@108(24)・最後のマップ@142(16)
- スキル一覧 0B32(15バイト×n)・010F(37バイト×n)・010E(1つ上がった)。地面に置く技の 01DE は使った人が「設置物ID」→ 09CA の置いた人に付けかえる
- **装備・持ち物・倉庫**: `0B39` 装備一覧(`pkt[4]` 種類 0=自分の持ち物・1=カート・2〜4=倉庫。68バイト/件・100件で区切って届く。精錬@65・★@66)/ `0B41` 持ち物に増えた(70バイト。+2 番号・+4 個数・+6 アイテム・+12..24 カード・+28 装備部位(0=装備でない)・+40 ランダムOP・+68 精錬)/ `07FA` 持ち物から消えた(理由@2・番号@4・個数@6。**理由4=倉庫へ**・5=カート。失敗した預け入れは先に 0B41 で手元に戻る)/ `00F6` 倉庫から取り出す / `00F2` 倉庫の件数 / `0999`・`099A` 装備した・外した(結果=0が成功)。倉庫に入れる専用の通信は無い(`00F4`/`01C4`/`0A0A` は届かない)。RO Storage Manager(`C:\Users\fuso1\AppData\Local\Programs\ro-storage-manager`)が先達
- **持ち物・倉庫の「装備ではない品」**(RO Storage Manager と同じ読み方。**実機で未確認 = 動作ログの `[倉庫] 一覧の始まり`/`倉庫「…」を記録` で確かめる**): `0B08`[op2][長さ2=5][種類1](0=持ち物・2=倉庫・3=ギルド・4=W倉庫)→ `0B09`[op2][長さ2][種類1]+34バイト×n(番号u16・アイテムu32・種類1・**個数u16@7**)→ 装備は `0B39` → `0B0B` 終わり。倉庫の名前は `0995/0996/0975/0976`[op2][長さ2][名前24 cp932] が先に届く(`packet_lengths.json` に可変で足した)。`char_core._list_items/_list_equip/_list_commit` が、持ち物は `ch["items"]`、倉庫は `stores[アカウント(分からなければキャラ名)]["種類|名前"]` に書く(届くたびに置きかえ)。個数の増減は `0B41`(`_item_add`)と `07FA`(`_item_sub`)だけ。使った・売った分は次の一覧で直る。`/api/inv`(タブを開いたときだけ読む。`inv_t` が変わったら読み直す)
- **ゼニー**: ゲーム中は 00B1(変数20・u32)/0ACB(i64)、ログイン時は届かず **0B72 から**取る
- サーバーごとにキャラ選択サーバーの IP が違う(18.182.57.201 通常・.231 露店・.129 別ワールド)。同じキャラ名が別サーバーにいることがある。文字コードは cp932。名前の「#番号」は `shown_name` で外す
- リプレイ(`Replay/*.rrf`)は `gp.read_rrf_packets`。2026-10 の新しいものは暗号の鍵が変わって読めない。アイテム名は通信に無い(番号だけ)
- 自分のポートは使い回される → 接続の SYN を見たら古い scanner・`core.forget_conn`・`_synced` を捨てる

## 装備・外し忘れ・ゼニー(char_core / md_core / 画面)
- 装備セット: 衣装をのぞくメイン10か所が全部うまったら(シャドウ6か所は別に `shadows`)。ID は中身のハッシュ(`m…`/`s…`・計算機で作ったものは `mx…`/`sx…`)でキャラをまたいで共通。記号 `tag`(A,B…/S1…)は**手で登録した箱**(`register_set`/`unregister_set`。記号を押す=その装備に切りかえ・右クリック=メニュー)。通信で読んだ組み合わせは記号なしの履歴。履歴は `prune_sets` で片づける。自動の名前「+10ｾﾚｽ聖/…」(武器/鎧/盾/肩)。セットの items は `_snapshot`(深いコピー)で保存する
- **ログイン時の 0B39 が名前の決まる前に届く**ことがあり、`_pending[接続]` に貯めて名前が決まったら `_merge_pending` で合流(`flush_pending`)。**0B39 が届かないログイン**(動作ログの「12秒たっても装備の一覧が届いていません」)は、そのキャラの記録に `eq_stale = True`(印が薄くなり「古い記録」と説明が出る。届けば解除)。根本原因は未特定
- `_synced`(0B39 を受け取った接続)に無い接続の 0999/099A/07FA は反映しない
- **外し忘れ(持ったまま)**: `carry_view` = 着ている装備(衣装は除く)+ 持ち物の着ていない装備(`ch["bag"]`・`loc` が衣装だけのものは除く)。更新: `0B39`(種類0のみ。着ているものが無くても `bag` を作る)・`0B41`(装備を足す `_inv_add`)・`07FA` 理由4(`_gone`。同じ itemId の 0B41 が直前1秒にあれば失敗した預け入れとして外さない。0.8秒以内の同じ (番号,理由) は二重取りで捨てる)・**倉庫の一覧の差分**(`_storage_list`: 0B39 種類2〜4 を前回と比べ、増えた品(`_ident`=番号・精錬・★・カード・OP)が持ち物の着ていない装備にあれば倉庫入れとみなす。増えたのが1〜3種類のときだけ・接続が変わったら比べない)・見失った区間の拾い直し(`_Scanner._scan_lost` が `07FA` 理由4・1個と `0B39` を形を確かめて拾う)。画面は `carryChip`: 通常装備が未登録なら 👕 だけ、登録ずみなら記号(シャドウも登録ずみなら並べる)。スペアは `SETTINGS.carryIgnore` で「数えない」
- **ゼニー**: `char_info[名前]["zeny"]`(0B72 と 00B1 のどちらも書く)。`zenyShort`(3けた+K/M/B)をMDの表のキャラ名の横に、左上に「計」(表に出ているキャラ)と「隠」(隠したキャラ。合計に入れない)
- キャラの右クリック: 隠す・隠したキャラを戻す・色・「アカウントの設定…」(まとめた別メニュー)。複数アカウント: アカウントIDはキャラ選択の最初の4バイト、手で決められる(`SETTINGS.charAcc`/`accNames`)。見出しのワールド・アカウントのプルダウンで切りかえ

## マップ ID の台帳(map_ledger)
`name_of(id)` の優先順 = 人が確かめたもの(`lantern_core` の `MEASURED`・`REFERENCE_IDS`)> MD の履歴で学んだ名前 > 公式のマップ一覧 > 町の決まり(`TOWNS`/`INDOOR_TOWN`)。`id_of(名前)` は名前が1つの ID に決まるものだけ。学んだ分・公式の分は `learn()` で毎回入れかえる(この PC のデータ。配らない)。使うのは `dmg_core.canon_where`(モンスタータブの場所の整理)。次の案: ランタンの `resolve_ids` も台帳を使う(循環 import に注意)・動作ログの「マップ=…」に日本語名を添える

## 公式サイトの情報(ro_official.py)
- 取り先 `https://rotool.gungho.jp/`: モンスター(JSON 検索・`/monster/<ID名>`)・マップ(`/map/…`)・**アイテム(`/item/<番号>/` → `parse_item`。名前の表に無い新装備の名前を `CHARS.add_official_names` で足す)**
- **サイトポリシー(個人利用のみ・再配布しない)**: 集めたデータは `公式モンスター.json`(各 PC のローカル・.gitignore)と `公式マップ/` だけ。**exe にも GitHub にも入れない**。同じ方針でゲームのファイル(クエスト名など)も各 PC で読むだけで配らない
- 負荷対策: 1件ずつ・3秒+ゆらぎ・裏のスレッド・同じものは二度取らない・429/5xx で30分休む・同時に1つ・1回120件まで・起動90秒後から30分おき。データの優先順位は **実測(JRO_FIX)> 公式サイト > ラトリオ(jRO 準拠)> rAthena**
- 名前の分からない相手 `ID○○` は1体ごとの番号 → `unknown_groups()`(場所×使った技)で候補を出し、`apply_auto` が確実なものだけ自動で紐付け
- ROフォルダ(`find_ro_dir`): 設定.json →よくある場所→インストール情報→全ドライブ(C〜Z)。見つからなければクエスト名は前回の控え(`quest_names_cache.json`)から。画面から選ぶ設定は未実装
- Divine Pride は**開発者の PC でのアイテム名取得だけ**(`tools/update_item_names_dp.py`・キーは `api.txt`/`DP_API_KEY`。アプリにもリポジトリにも入れない・総当たりしない)。モンスターには向かない(jRO の新しいモンスターは空)

## モンスタータブ・被ダメ
- 場所 `where` は `DmgCore._where`(`MD <@の後ろ>`/`フィールド <マップ名>`/`不明`)。壊れた名前は `md_core.MAP_NAME_OK` で捨て、表示のとき `canon_where` で整える(記録は書きかえない)
- モンスター専用の技 M〇〇: 定義が無ければ通常スキルから**種類・属性だけ**借りる(`borrow`)。「技から見る」`skill_view`、「この場所の対策」`place_guide`(状態異常は `AIL_LABEL`・`SKILL_AILMENT`・`ail_counter.json`)
- ダメージの無い技(09CB/011A)からプレイヤーの支援を外す(`spawn_kinds`)。被ダメの装備 ID は `combo_id`(装備セット+シャドウセット)
- 場所ごとに装備セット別に集計(`dmgByGear`)。被ダメシミュ(`SIMV="dmg"`)は記録から逆算(軽減前 = (受けたダメージ + 引かれる分)÷ 受けたときの軽減)

## 計算機(ラトリオの画面なしの計算を使う)
- **計算係**: 裏に隠した `calcx.html`(iframe)の中の `_ratorioReg.calcCoreFromModel(model)` を直接呼ぶ(1回 約0.1秒)。`ENG`(`engInit`/`engCalc`/`engCalcCached`/`engFullModel`/`engTemplate`)。model は `createEmptyModel()` の形。`/ratorio/v-<commit>-<ENG_CACHE_VER>/…` は immutable で配る(配る中身を変えたら `ENG_CACHE_VER` を上げる)。`request_queue_size = 256`(250ファイルを一気に取るため)。CDN の部品は `ratorio_cdn/` に同梱
- **隠れた状態(3回ずれた)**: ①支援の欄は「欄を開いている」印 `n_Skill1/4/7/8SW` が立っているときだけ model から流し込まれる(`engCalc` が計算の間だけ立てる)②ふつうの装備のランダムオプションは model に入らず `g_equipRndOptTable` に残る → Fox は `model.foxRnd` に持ち `engRndReset` で書き戻す③ダメージ計算は `dispDataMap` を書きかえて残す(`engSandbag` が写しを取って戻す)。**ダメージを出す計算を足すときは、魔法職と物理職の両方で「前後で engCalc の結果が同じ」ことを確認**
- スロット: 計算機のキャラ = スロット(`計算機のキャラ.json`)。`model`(作業中)と `saved`。装備スロット(A,B…)は「箱」で、キャラスロットは記号を覚え、`simcFollowBoxes` が最新の中身に自動で着せ替える(未保存の変更＊がある枠は追従しない)。「現在のキャラ」系は `nowChar()`(いまログイン)→ なければ `lastChar()`
- 装備の編集: 候補はラトリオの関数で作る(`simcItemOpts`/`simcCardOpts`/`simcRndKinds`)。ゲームの装備は `item_link.json` → 名前の一致(`simcFind`: 【習】を外す・[n] を外す…)→ 共有の結びつけ。**装備名の照合を触ったら、登録した全装備セットを `simcWear` で着せて入らなかったものが空であることを確認**。ランダムオプションの対応表は `calc_data.json` の `rndopt`
- ステータスシミュレーター(`07_sim_status.js`): ASPD は式で解く(2回の計算で k・C を決め `stpSolve`)。優先は ASPD・無詠唱(詠唱の値 530)> MHP > 状態異常耐性。**ASPD が効くのはモーションだけ**(モーション = (200−ASPD)×0.02秒)ので、ディレイ・CT が長いスキルでは上げても縮まない。ダメージ重視(利用者): 小型サンドバックマン・段差(ステータス条件つき効果)・K/M 表示
- サンドバックマン(`09_sim_sandbag.js`): ラトリオの「手入力モンスター」929(HP 1e9・DEF 600・MDEF 100)。`engSandbag(model, cfg, mt)`。スキルの選びは `sbPickItem`(前回を引き継ぐ)、精霊は `sereHtml`(精霊を使う職業では常にタブ)。記録は `サンドバックマン記録.json`。時限効果は `ATK_FX`/`atkEval`(発動率の期待値)。**実測との差は1〜4%**(ランダムオプション等の未取り込みと推測)
- 与ダメシミュ(`10_sim_atk.js`): 敵はラトリオの本物のモンスター(`mobId`)。時限効果(性能カスタマイズに足す)

## ハロウィン(15_halloween.js・lantern_core.py)
- ガーリン次郎のMDの表(`HW_JIRO`)・経験値(`hwExp*`。**公式の表の数字**。4次職は `HW_FOURTH` の20職・終わりは `HW_END` = 11/10 8:00)・ランタンハント
- ランタン: 座標は `lantern_seed.bin`(**暗号化**。鍵は Worker `fox-md-license` の `/data/key` から利用キーで渡す。bin の作り直し: `FOX_SEED_KEY=<鍵> python tools/make_lantern_seed.py <CSVのフォルダ>`・鍵の元は `F:\Claude\Fox_license\配信鍵_lantern.txt`・鍵を変えたら bin も同時にリリース)。熊(もっとランタン)は別セット。ナビ `/navi2 マップID X/Y 1/1/1`。室内はメモの座標がある親マップの入口で並べ替え、コピーは室内の ID が確かならそれ。回る順は `LNTROUTE`(`tools/world_links.json`・`world_grid.json`)。身内向けページは Cloudflare Worker + KV(`tools/make_lantern_site.py` のコメント)
- マップ ID の確認ずみ: `MEASURED`(利用者が確認)・`REFERENCE_IDS`(他のまとめと突き合わせ)・`CORRECTIONS`。**16番(イズルード)の x が 60 か 61 かは未確認**

## 利用キー・同期・引っ越し
- 利用キー: Worker `fox-md-license`(`F:\Claude\Fox_license`・別 git・管理画面 `/admin`)・`license_core.py`(`ENFORCE=False`=警告のみ)。共有の結びつけ(承認式・6時間おき)・2台の同期(設定とスロット。WebCrypto で暗号化・3者比べ)・**記録の引っ越しは手動のみ**(自動の双方向同期は記録を静かに壊すので作らない。`records_sync.py`)

## ルール・サーバー・その他
- 物理の近接/遠距離は当たった距離(3セルより遠いと遠距離)。モンスターの通常攻撃と「武器」属性の技は無属性。717=マックスペイン(反射)。736 Mサイキックウェーブは念
- ニャル様の回数表は公式の表と一致を確認ずみ(星座の塔は合計20)
- 通信が1つも来ない PC(VPN/TAP が経路に選ばれる): 75秒後に全部の回線で聞き直す。それでも出なければ設定.json の「ネットワーク名」
- 動作ログは5MBで回す。装備セットの履歴は起動3分後と1日おきに片づける

## 利用者のファイル(exe と同じフォルダ。git に入れない)
`設定.json` `表示の設定.json` `サーバー.json` `md_state.json` `char_state.json` `被ダメ記録.json` `被ダメ_確認用データ.json` `スキル名の手直し.json` `アイテム名の手直し.json` `計算機のキャラ.json` `サンドバックマン記録.json` `ランタンハント.json` `公式モンスター.json` `公式マップ/` `共有の結びつけ.json` `利用キー.json` `ラトリオ/` `動作ログ.txt` `アップデートログ.txt` `エラーログ.txt`

## 未確認・次の候補
- 16番(イズルード)の x(60/61)・Chapter1 の新装備(フロンティア武器・ディメンショナルブーツ・次元調律書・新カード)はラトリオ/Divine Pride に入ってから `item_link.json`・`gear_info.json`・名前を作り直す・新 MD の確認(利用者のレベルが足りない)
- ログイン時に装備の一覧が届かない根本原因・倉庫の使用数 00F2 を検算に使う案・Fifteen のセレスティアルマント +7(倉庫か手元か未確認)
- 台帳をランタン・動作ログの「マップ=」にも使う・ROフォルダの画面での選択・説明文(公式アイテムの `desc`)の表示
- 被ダメタブの軽量化・「複数装備の比較」の手動化・ステータス条件つき装備効果の一覧(「あと何ptで効果」)・Fox のランダムオプション→ラトリオの未対応分(79件)・二刀流の左手
- ゲームとアプリの数字の照合(ASPD は食品・アイテム未設定で HP/SP/HIT/FLEE が少しずれる)
