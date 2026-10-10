# Fox_MD_Tracker 引き継ぎメモ

ラグナロクオンライン(jRO)の通信を読んで、キャラごとのMDクールタイム・ニャル様の報告・被ダメ・装備を記録して画面に出す Windows 常駐ツール。
利用者はプログラミング初心者。説明は日本語で、専門用語は身近なものにたとえる。作業は確認を挟まず最後まで進め、自分で動作確認してから報告する。

## ファイル
| ファイル | 役目 |
|---|---|
| `md_tracker.py` | 本体。通信を読む(scapy)・ローカルWebサーバー(127.0.0.1:8788)・トレイ・保存・アップデート。`VERSION` |
| `md_core.py` | MD のクエスト期限・キャラ・接続・ニャル様の報告の判定 |
| `dmg_core.py` | 被ダメ(01DE/08C8)・相手の名前・距離・状態異常・ダメージの無い技・装備セット別の集計 |
| `char_core.py` | キャラのステ・装備(0B39/0999/099A/00B0/0141/00BD)。装備セット(メイン10か所 `sets`、ID `m…`)・シャドウセット(6か所 `shadows`、ID `s…`)はキャラをまたいで共通(中身のハッシュ)。記号 `tag`(A,B…/S1,S2…)・名前・使ったキャラごとの最後とステータス。被ダメの装備 ID は `combo_id` = 装備セット+シャドウセット。前の版の「キャラ:中身」は `_migrate_sets` で移し、`set_map` で被ダメも付けかえ |
| `guild_packet.py` | 通信の切り分け(StreamScanner)・Npcap |
| `quest_names.py` | RO の `System` フォルダの `.lub`(Lua 5.1 バイトコード)を自前で読む小さなVM。クエスト名 |
| `server_core.py` | どのサーバー(ワールド)の通信か。キャラは「名前@サーバーIP」で記録する(`qualify`。md_core の `qual`)。サーバーを分ける前の「名前」だけの記録は、キャラ一覧(0x006B)・名前が決まったときに `md_core._claim` が引き継ぐ(装備・被ダメも `on_rename` で付けかえ)。画面は `cn()` で @ 以降を外し、見出しのプルダウン(`#srvsel`。ふだんは最新ログインのワールド、最新ログインのワールドが変わったら選択を戻す)で切りかえ。名前は設定の「サーバー」欄(`serverNames`)。ワールド名はログインサーバー(6900)の生データから「18.182.57.x+6121+名前」の並びを探して拾う(`login_data`。0x0AC4 の形が未確認でも読める)。ワールドグループは扱わずワールド単体で分ける。キャラ選択サーバーの IP で見分け、0071/0AC5/0092/0AC7 の行き先でマップの接続に引き継ぐ。設定の「記録しない」(`ignoreServers`)のサーバーは `_Scanner` で読み飛ばす |
| `updater.py` | GitHub リリースから自動アップデート(入れ替えバッチ) |
| `app.html` | 画面(1ファイル・素のJS)。MDの表: 見出しはクリック/なぞって選択(`SEL.mds`)、アイコン(`.grip.mx-ico`)はつかんで並び替え・動かさず離すと選択(`makeSortable` の `onTap`)、マスのクリックでグレーの固定、キャラ名クリックでキャラ詳細(`CH_OPEN`)。キャラタブは一覧(クリックでベース/ジョブ・ステータス・スキル・よく使う装備セット)。装備セットの記号の色は `tagColor`(自動 or `color`)。タブ: 週次/デイリー/その他/耐性/被ダメ/キャラ/装備セット/計算機(`sim`)/ラトリオ(`calc`)/ニャル様。イベント/入場履歴/設定は見出しの歯車(⚙)のメニュー |
| `live.html` | 耐性リアルタイム(開発版だけ) |
| `edition.py` | `DEV = True/False`。ビルドが書きかえて 公開版/開発版 を作る |
| `skill_names.json` | スキル番号→名前(ラトリオ) |
| `skill_info.json` | スキル番号→[種類,属性,射程,印]。`tools/make_skill_info.py`(rAthena skill_db + `JRO_FIX`)で作ったあと、`tools/apply_ratorio_skill.py <ラトリオ> --write` でラトリオ(jRO 準拠)のスキル定義(engine/skill/**/*.js の type / range / element)を上書きする。ラトリオにあるのはプレイヤーのスキルだけ(モンスター専用の「M〇〇」は rAthena のまま)。Fox の「固定」(X)は残す(ラトリオに固定の区分が無い) |
| `gear_info.json` | アイテム→鎧属性/武器属性/属性耐性/精錬条件つき耐性(`rr`)。`tools/make_gear_info_ratorio.py <ラトリオ> <rAthena版>`(ラトリオ=jRO 準拠が土台、無いものだけ `tools/make_gear_info.py` の rAthena 版で補う。ラトリオの誤りは `JRO_FIX`)。item.dat.js / card.dat.js の行は「[1,…],」(古い)と「ItemObjNew[5461] = […];」(新しく足された分)の2種類ある(両方読む。片方だけだと新しい装備・エンチャントが抜ける) |
| `mob_info.json` | モンスターの名前→Lv/HP/種族/サイズ/属性/ボス。`tools/make_mob_info.py <ラトリオ>`(ラトリオに番号が無いので名前でつなぐ。同じ名前の強さ違いは "185/250" のように / でつなぐ)。被ダメの相手の札(`dmg_mobs`) |
| `option_names.json` | ランダムOP番号→日本語。`tools/make_option_names.py` |
| `id2name.json` | アイテムID→日本語名(ラトリオ) |
| `item_names_fix.json` | ラトリオに無いアイテムの名前(大本の手直し表。id2name より優先)。利用者の `アイテム名の手直し.json` をもらったらここに足す |
| `ratorio_core.py` | 計算機(ROラトリオHub)をフォーク `foxnine101-ux/ratorio`(本家 roratorio-hub/ratorio + 見た目の手直しだけ)から取り込んで exe の隣の「ラトリオ」フォルダに置く。GitHub の commits → git/trees → raw で、要るファイル(engine/assets/lib/pages/calcx.html。約440個・13MB)の変わった分だけ落とす。`/ratorio/…` で配り、`/api/ratorio`(状態・確認・取り込み)。ラトリオはビルド不要。画面は `#calcwrap` の iframe(タブを切りかえても消さない)。**本家の更新はフォークに merge するだけ**。Fox 側は外から入力欄(OBJID_…)を動かすつなぎ役だけを持つ(app.html の `ratFill`): 職業 → Lv → 装備(欄は `RAT_MAIN`/`RAT_SHADOW`。武器は `ARMS_TYPE_RIGHT` を順に試す)・精錬・★(TRANSCENDENCE)・カード/エンチャント → ステータスの順。装備は 番号→名前(id2name)→選択肢の名前 でつなぐ(`ratFindOption`: 同じ名前 / 「[3]」「 (+10以上)」を外す / 先頭の「[シャドウ]」を外す / カードは「カード」を外す)。Fox はカードの空き枠を詰めて覚えているので、エンチャントは4枠のうち選択肢にある枠へ入れる。「なし」は値 0 の選択肢(検索つきの欄は先頭が「なし」とは限らない)。精錬を入れたあとは選択肢が作り直されるので待つ。つながらないものは手で結びつけ(`SETTINGS.ratLinks` = {番号: 選択肢の名前})。未対応: ランダムOP・スキル |
| `calc_data.json` | 計算機用のデータ。`ele` = 鎧の属性(Lv1)×攻撃の属性の倍率%。`tools/make_calc_data.py <ラトリオ>`(element-affinity.dat.js) |
| `ocr_core.py` | スクショから文字を読む(Windows.Media.Ocr 日本語を PowerShell から。2倍に拡大)。アイテムの説明の画面の1行目からアイテム名(`guess_name`)。`/api/ocr`・`/api/itemname` |

生成スクリプトは rAthena の `db/re/*.yml` を引数に取る(raw.githubusercontent.com から取れる)。

## ビルド・公開
- `main` に push → GitHub Actions(`.github/workflows/build.yml`, windows-latest)
  - 公開版 `Fox_MD_Tracker.exe`: `VERSION` が上がったときだけ作ってリリースに置く(本文は `release_notes.md`)
  - 開発版 `Fox_MD_Tracker_dev.exe`: 毎回作って Actions の Artifacts に置く(自動アップデートなし)
- データファイルを増やしたら build.yml の `--add-data` 2か所(公開版・開発版)にも足す
- 流れ: 直す → テスト → `VERSION` を上げる → `release_notes.md` を書く → commit(日本語) → push → ビルド成功を確認

## jRO の通信で確かめた形(rAthena と違うところ)
- 出現 09FD/09FE/09FF: 名前は 09FD=90 / 09FE=83 / 09FF=84 から最後まで(可変長)。ID は 5、職業(クラス)は 23、速さは 13
  - 位置: 09FE/09FF は 63 から PosDir 3バイト、09FD は 66 から MoveData 6バイト・開始時刻 37
- 名前の返事: 0095/0A30 は 6〜30、0ADF は 10〜34。長い名前はサーバーが途中で切ることがある
- 自分の移動 0087 [時刻4][移動6]、止まる/飛ばされる 0088・01FF [ID4][x2][y2]、マップ移動 0091/0092 [名前16][x2][y2]
- 01DE の Lv はモンスターだと -1 が多い
- BaseLv(00B0 の 11)・JobLv(55)はふだん流れてこない(上がったときだけ)。キャラ一覧(1人175byte)の JobLv = u32 @24、職業 @84、BaseLv @92、名前 @108 から読む
- スキルの一覧: 0B32 [op2][長さ2]+15byte×n(番号2 種類4 Lv2 SP2 射程2 上げられる1 Lv2)、010F は 37byte×n(名前24つき)、010E は1つ上がったとき(番号2 Lv2 …)。`char_core` の `skills` = {番号: Lv}
- 地面に置く技(ライトニングランド等)の 01DE は、使った人が「技の設置物ID」になる。設置物の出現 09CA [設置物ID4]@4 [置いた人ID4]@8 [x2][y2][種類4] で置いた人に付けかえる(リプレイ 01.rrf で、名前のわからない当たり 13,063回が全部これだった)
- リプレイ(RO フォルダの Replay/*.rrf)は `gp.read_rrf_packets` で読める。ただし 2026-10 の新しいリプレイ(02.rrf)は暗号の鍵が変わっていて読めない(通信の番号が D8B0 などに化ける)。アイテム名は通信に無い(番号だけ)
- サーバー(ワールド)ごとにキャラ選択サーバーの IP が違う(いつもの 18.182.57.201、露店用 .231、別のワールド .129)。jRO は Urdr/Breidablik/World Group 1-3/露店専用(Noatun)/Yggdrasill に分かれる。同じアカウントID・同じキャラ名が別サーバーにいることがある(Fox_Nine)
- 名前に「#」以降の番号が付くモンスターがいる(「暴食の変異Hプードル#4」= MD の100体討伐サブクエ用。ゲームのダメージチャットにも番号つきで出る仕様)
  → 被ダメでは番号ごとに行が分かれないよう `dmg_core.shown_name` で「#」以降を外してまとめる(モンスターの表ともつながる)。「#」始まりは「名前の無い相手」
- 文字コードは cp932(UTF-8 として正しく読めるときだけ UTF-8)
- まだ本物で確かめていない: 状態異常(0983/043F/0196/0229)、ダメージの無い技(09CB/011A)、装備の付けかえ(0999/099A)
  → 利用者の `被ダメ_確認用データ.json`(`raw` の `st_XXXX` など)で確かめる

## 改良版ラトリオ(キャラと装備のシミュレーター)の方針(2026-10-10 に利用者と決めた。これから作る)
- 目的: ラトリオを土台に、入出力しやすいキャラ・装備シミュを Fox の中に作る。1からキャラを作る/個別に保存/ラトリオ互換URLを出す/
  Fox のキャラ・装備セットを取り込む/装備をプルダウンで編集/レイアウトはラトリオに近く。**大事なのはプルダウンで選ぶとステータスやディレイに反映されるデータベース**。
  ダメージ・被ダメのシミュは二の次(被ダメの記録から「そのときのキャラ・装備・敵・技」を入れるのは、キャラと装備のシミュができてから)
- 計算は「画面のラトリオを外から操作」ではなく、ラトリオの**画面なしの計算の入口**を使う(実験で確認ずみ):
  - `engine/runtime/calc-headless.js` の `calcCoreFromModel(model)` / `calcFromModel(model)`(`window._ratorioReg` にも登録される)。
    model は `engine/runtime/calc-model.js` の `createEmptyModel()` の形(プレーンな JSON・約5KB。status / weapon / defPlus / defTranscendence /
    equip[] / card[] / costume[] / shadowEquip{itemId,refined,rndOpt} / passiveSkill / buff4,7,8 / conf* / learnedSkill …。ID はラトリオ独自の番号)
  - **裏に隠した calcx.html(iframe)を計算係にして、その中の `_ratorioReg.calcCoreFromModel(model)` を直接呼ぶ**。1回 約0.1秒。入力欄は変わらない。
    AGI 86→120 で ASPD 191.7→193、VIT→1 で MaxHP 262,854→168,870、靴を外すと HP・ASPD が下がることを確認
  - 空のページから import しただけだと、装備の効果(specData)はほぼ合うが、最終ステータス(charaData: MaxHP・ASPD など)が NaN になる
    (calcx.html の起動時の下ごしらえが要る)→ 計算係は calcx.html の中で動かす
  - 保存URL → model: iframe に `calcx.html?<保存データ>` を読み込んで `_ratorioReg.extractModelFromDom()`(2〜3秒)
  - model → 保存URL: `CSaveController.encodeToURL()` は**画面の入力欄**から作る(HydrateFromModel だけでは反映されない)
    → 書き出すときだけ、入力欄に model の内容を入れてから呼ぶ
  - charaData の添字(ASPD = 37、MaxHP = 5、MaxSP = 6 など)は `CHARA_DATA_INDEX_*` を見る。specData は装備効果の集計(451項目)
- 本家の更新: フォークを更新 →「ラトリオを更新」で取り込むだけ(入口の名前と model の形が変わったときだけ Fox 側を直す)
- **第1段階(v2.20.0)まで作った**: app.html の `ENG`(計算係。`engInit` / `engCalc` / `engTemplate` / `engFullModel`)と `SIMC`・`renderSimChara`(計算機タブの「キャラ・装備」)。
  キャラは `計算機のキャラ.json`(`/api/simchars`。{ID: {name, model}})。新規(職業を選ぶ → ラトリオの画面で職業を変えて model を取り出す)・保存URL の読み込み・複製・削除、
  職業/Lv/ステータス/特性の入力 → その場で再計算。装備は表示だけ
- **落とし穴(隠れた状態)**: 支援・アイテムの欄(パッシブ A1・ギルド等 A4・アイテム/食品 A7・その他 A8)は、「欄を開いている」印 `n_Skill1/4/7/8SW` が立っているときだけ、
  model から取り出し・流し込みされる。印が無いと計算係に前のキャラの値が残り、結果がずれる(AGI120 で ASPD 193 のはずが 191.9 になった)。
  → `engCalc` は計算の間だけ `setN_Skill*SW(true)`、`engFullModel` はたたんだ欄の値を `engine/skill/skillstate.js` の `n_A_PassSkill/4/7/8` から直接読む
- ステータスの合計は計算のあとの `roro-state.js` の `n_A_STR`…(基本6つ)。特性は `n_A_WIS` などが当てにならないので、素点 `pureStatus[6..11]` + `hmjob.js` の `g_bonusStatus[6..11]`
- 残り: 2 装備の編集(プルダウン・検索)と Fox のキャラ/装備セットの取り込み、3 支援・アイテムのオンオフ(数が多いので目的別のタブ・検索・オンのものだけ表示・よく使う組み合わせ)、
  4 保存URL の書き出しと「複数の装備セットで 無詠唱/ASPD193 を満たすか」、5 ダメージ・被ダメとの連携(被ダメの検証を合流)

## 計算機(被ダメの検証。app.html の `renderSim`)
- 記録から逆算: 軽減前 = (受けたダメージ + 引かれる分) ÷ 受けたときの軽減 → 別の装備セットの軽減をかけ直す
- 軽減の段階(`simStages`): 鎧の属性の相性 × 属性耐性(上限95%) × 種族 × ボス/一般 × サイズ × 遠距離/魔法 × DEF(4000+d)/(4000+10d) または MDEF(1000+d)/(1000+10d) × RES/MRES(2000+r)/(2000+5r) × 補助。最後にステータスの DEF/MDEF を引く
- 00B0 の DEF(45)/MDEF(47) = ステータス分(引かれる分)、DEF2(46)/MDEF2(48) = 装備分(割合)。壊れた値(マイナスなど)は 0 扱い
- 装備セットの軽減のまとめは `char_core.items_profile`(`sets[*].prof`)。gear_info.json の `x`/`xr`(種族:〇/ボス/一般/サイズ:〇/遠距離/魔法)
- 未対応: セット効果・ランダムOPの一部・条件つきの効果(精錬以外)・支援や料理。次の予定: ステータスの検討(無詠唱/ASPD193 を複数の装備セットで満たす最低ステ。裏でラトリオを動かす)

## ルールとしてわかっていること
- **データの優先順位: 実測(JRO_FIX など) > ラトリオ(jRO 準拠) > rAthena**。rAthena を使うのは、ラトリオに情報が無い所だけ(2026-10-10 に精査):
  - 装備の耐性: ラトリオに載っていないアイテムだけ(212件。うち177件は jRO のアイテム一覧に番号が無い)
  - スキル: モンスター専用の技・「固定」の区分・ラトリオが属性を決めていない技
  - ランダムオプションの番号→名前(option_names.json)・状態異常のアイコン番号・通信の形: ラトリオはゲームの番号を持っていないので rAthena のまま
- 物理の近接/遠距離は当たったときの距離(3セルより遠いと遠距離)。罠・射程3以下などは技で決まる
- モンスターの通常攻撃と「武器」属性の技は無属性。717 = マックスペイン(反射)、736 Mサイキックウェーブは jRO では念
- 装備セット: 衣装(C頭上/中/下・C肩)をのぞくメイン10か所が全部うまったら。シャドウ6か所はシャドウセットとして別に(人によってシャドウだけキャラ別のため)。中身が同じならキャラが違っても同じセット
  - 自動の名前「+10ｾﾚｽ聖/+10ﾖﾙｽ毒/+7ｽﾃﾗ聖念50」(武器+武器属性 / 鎧+鎧属性(無なら最高耐性) / 肩+最高耐性。頭3文字・漢字は2文字・カナは半角)
- ニャル様の回数表は公式の表と全部一致を確認ずみ(星座の塔は合計20)

## 利用者のファイル(exe と同じフォルダ。git には入れない)
- 利用者のローカルの置き場所: `C:\Users\fuso1\OneDrive\Desktop\Fox_MD_Tracker`(実測データはここ。読むだけ。`設定.json` は送信キーがあるので開かない)
`設定.json` `表示の設定.json`(画面の設定。`ignoreServers` も) `サーバー.json` `md_state.json` `char_state.json` `被ダメ記録.json` `被ダメ_確認用データ.json` `スキル名の手直し.json` `アイテム名の手直し.json` `計算機のキャラ.json` `ラトリオ/`(取り込んだ計算機) `動作ログ.txt` `アップデートログ.txt`

## テストのしかた
- `python -m pyflakes *.py`、app.html の `<script>` を取り出して `node --check`
- 画面: md_tracker を import → `md_core.MDCore` にダミーのキャラ・通信を流す → `start_live_server` → Playwright(Chromium)で操作・スクショ
  - 保存先の定数(`DMG_FILE` など)は一時フォルダに差しかえてから動かす(リポジトリを汚さない)
- 利用者が送ってくれた本物の通信(確認用データの `hex`)をそのまま流して確かめるのがいちばん確実

## 次にやること(引き継ぎ時点)
1. ~~jRO のアイテム情報ファイルを読む~~ → v2.9.4 でラトリオのデータに切りかえ済み
   - RO フォルダの `System/iteminfo.lub` は読めるが名前などだけで説明文が無い。説明文は `data.grf` の中にあるが Gravity 独自の暗号(flags=0x80)なので使わない
   - ラトリオ(`F:\Claude\ratorio`、フォーク)の `engine/equip/item.dat.js`・`card.dat.js` の効果の番号から作る。ゲームのIDとは `ro4/m/items_part*.json`(jRO の名前と説明文が全部ある)で名前でつなぐ
   - jRO の説明文と比べるとラトリオのほうが rAthena より正確(角兜・イミューン系・属性靴など)。ただしラトリオにも誤りがある(ウィスパーマスクの符号など)→ 見つけたら `JRO_FIX` に足す
   - まだ: エンチャント(紅蓮・「無属性耐性4」など)はゲームのアイテム名と合わずつながっていない。セット効果は入っていない
2. 状態異常・ダメージの無い技・装備の付けかえの通信を、本物のデータで確かめる
   - ~~「ID○○」(名前がわからない相手)~~ → v2.13.1 で解決(技の設置物 09CA の置いた人)。`raw.id_src` は残してある
3. Atk/Matk/Hit/Flee が装備タブで「-」のままなら 00BD の読み方を確かめる
