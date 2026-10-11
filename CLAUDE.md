# Fox_MD_Tracker 引き継ぎメモ

ラグナロクオンライン(jRO)の通信を読んで、キャラごとのMDクールタイム・ニャル様の報告・被ダメ・装備を記録して画面に出す Windows 常駐ツール。
利用者はプログラミング初心者。説明は日本語で、専門用語は身近なものにたとえる。作業は確認を挟まず最後まで進め、自分で動作確認してから報告する。

## 開発の進め方(ローカル・クラウド共通)
- **正は GitHub の main**。作業の最初に必ず `git pull`、区切りごとに push。別のセッションが先に進んでいることがある(v2.37.4 がそうだった)
- コミットは `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`(既定のメールだと GitHub が push を拒否)
- 画面のテスト: `python tools/ui_test_server.py`(ポート 18788・保存は一時フォルダ。本物の exe の 8788 は避ける)をブラウザで開く。本物のデータは `--data <フォルダ>` で読むだけ(クラウドには無いので、無くても空で動く)。計算機の中身は `--ratorio <フォルダ>`。自動更新の確認は `tools/redraw_check.js` をコンソールで実行(`{kept:true, redrawn:true}` が正常)
- 公開: `python tools/release.py <版> "<日本語メッセージ>" --notes <公開メモ>`(検査 → VERSION → release_notes.md → コミット → push → Actions 成功まで待つ。`--dry-run` で検査だけ)
- リリース前に critic に diff を見せる(v2.37.4 の「描き直さない」が効いていないのを見つけた)。場所探しは scout

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
- v2.20.1: 保存データの読み込みは `engLoadData(q)`(計算係の中で `_ratorioReg.CSaveController.loadFromURL(q)` → `engFullModel()`。開き直さない。開き直した場合と同じ model になることを確認ずみ)。
  セーブファイル(1行目 `#ratoriohub-savedata#`、2行目が「名前,保存データ」の `;` 区切り。名前は `CSaveController.decodeSaveName`)は `simcOpenFile` → 一覧で選ぶ(`SIMC.pick`)→ `simcImportPicked`。
  ASPD の横は「あといくつ」ではなく、AGI・DEX を単独で動かして 193 になる最小の値(`simcNeedKick` が二分探索 → `simcNeedText`)。利用者の要望:「あと2」は意味がない、AGI/DEX をどれだけ変えるかが大事
- **第2段階(v2.21.0)= 装備の編集と Fox からの取り込み**:
  - 候補はラトリオの関数をそのまま呼んで作る(`ENG.x`)。装備 = `ItemObjNew` を種類(ITEM_KIND)と `IsMatchJobRestrict(itemId, jobId)` で絞る(`simcItemOpts`。武器は種類をまたいで全部出し、選ぶと `weapon.type` も合わせる)。
    カード・エンチャント = 計算係の画面に `RebuildCardSelect(場所, itemId)` で枠を作らせて、`OBJID_〇〇_CARD_1〜4` の選択肢を読む(`simcCardOpts`)。
    ランダムオプション = `GetRndOptTypeId(item[4])` → `g_rndOptTypeArray[種類][リスト番号の配列]` → 切り離した select に `SetUpRndOptKind` / `SetUpRndOptValue` で作らせる
  - model の場所: 装備 `equip[0〜10]`、カード・エンチャント `card[SIMC_CARD[場所][枠]]`、精錬 `weapon.atkPlus` / `defPlus.*`、★ `weapon.transcendence` / `defTranscendence.*`、
    シャドウ `shadowEquip.itemId/refined/rndOpt[14,15,19,21,22,23]`(シャドウのエンチャント `card[54〜71]` は表示だけ)。「なし」の番号は開いた直後の値(`ENG.blank`)
  - **落とし穴(隠れた状態 その2)**: ふつうの装備のランダムオプションは model に入らず、ラトリオの中の表 `g_equipRndOptTable[場所][枠] = [種類, 値]` に残る。
    Fox では `model.foxRnd[0〜10]` に持ち、`engCalc` のたびに `engRndReset` で表へ書き戻す(シャドウの分は model からラトリオが入れる)。読み込み・職業変更の前にも表を空にする
  - 「はずす」ときはカードも全部 0 にする(「なし」の装備にもカードの枠があり、残すと計算に入る)。`engTemplate` は同じ職業のままだと前のキャラの装備が残るので、いったん別の職業にする
  - 検索つきプルダウンは `pickOpen(anchor, opts, cur, onPick)`(body に出す。ひらがな→カタカナ・全角半角をそろえて、読み(kana)も探す)
  - Fox からの取り込み: `simcFromFox(新規か)` → `simcWear`(場所のビット → ラトリオの場所 `SIMC_FOXBITS` / `SIMC_FOXSH`)→ 名前でつなぐ `simcFind`(ラトリオタブと同じ `SETTINGS.ratLinks` を使う)。
    つながらなかったものは `SIMC.report.rows` → 画面の「選ぶ」で結びつけ。Fox のランダムオプション(ゲームの番号)→ ラトリオの番号の対応表はまだ無い。二刀流の左手は未対応
- v2.21.1 の並べ方(利用者の指定): 基本と特性を横並び → たたんだ計算結果(`<details id=sccdet>`、1行の要約 `simcSumText`)→ いつも見せる「ASPD・詠唱・ディレイ」(`simcKeyHtml`)→
  横いっぱいの装備欄 → 別枠のシャドウ欄。それぞれ右上に装備セットのタブ(`simcSetTabs` → `simcWearSet`。着ているセットは `model.foxSet` / `model.foxShadow`、手で替えたら外す)。
  「Fox から取り込む」は意味が伝わらなかったので「ゲームのキャラから作る」にした(画面の言葉に「Fox から」は使わない)
- v2.21.2: 枠は全部 `simcFold(名前, 見出し, 中身, 見出しの右, 最初から開くか)`(`<details data-fold>`。開け閉めは `md_simfold`)。
  補助情報 = ラトリオの拡張情報。`engCalc(model, 種類の配列)` が計算の直後に `engExtra` を呼び、表示係 `CExtraInfoAreaComponentManager` の1つ目に
  計算係の中の見えない枠(`OBJID_TD_EXTRA_INFO_<番号>` を自分で作る)へ描かせて、その HTML を持ち帰る(表示係は直前の計算の変数を読むので、別の計算をはさまない)。種類は `ENG_XKINDS`、選んだものは `md_simx`
  装備セットのタブは `simcSetList`: 名前つき / 着た回数 2 以上 / いまゲームで着ている / このキャラが着ている を新しい順に `SIMC_TABMAX`(8)個、残りは「ほか」→ `pickOpen`。
  利用者の懸念: 装備セットは着がえの途中の組み合わせも登録されて際限なく増える(要検討)。根本の対策(短時間しか着ていないセットを登録しない/自動で片づける)は未着手
- **v2.22.0 装備セット = 履歴 + 手で登録**(利用者の考え: 通信で読んだ組み合わせは「履歴に近い」。記号を押したら、その装備は A から外れる):
  - `char_core._register` は記号なし(`tag: ""`)で履歴に入れるだけ。記号は `register_set(sid, take)`(take = 記号・名前・色を引き継ぐ相手。上書き = 記号の付けかえで、元は履歴に戻る)、`unregister_set(sid)`。
    前の版で自動で付いた記号は残してある(着た回数 worn は「着がえた回数」で、着っぱなしだと 1 のままなので、自動では外せない)
  - 計算機で作った装備は `put_sim_set(shadow, items, data)`: ID は `mx…` / `sx…`(中身 data のハッシュ)。`items` は画面に出す用(itemId は無い → 耐性のまとめ prof は空)、`sim` = 計算機が着せ直す中身(`simcGearFrag` の形。番号はラトリオのもの)
  - `/api/equipset`: `{sim: {shadow, items, data}, take}` → `{sid}` / `{sid, register: 1, take}` / `{sid, unregister: 1}`
  - 計算機: タブ = 記号つきだけ(`simcSetList`)。着せる `simcWearSet(sid か "now:キャラ")`(sim つきは `simcApplyFrag`、通信のものは名前でつなぐ `simcWear`)、登録・上書き `simcRegister(shadow, take)`。
    着ているセットは `model.foxSet / foxShadow`、着せたときの中身の印 `foxSetSig / foxShadowSig` と違えばタブに ＊(`simcDirty`)
  - 確認の窓は `askOnce(種類, 文, ボタン名)`(「次から確認しない」→ `SETTINGS.noAsk[種類]`。種類: wear / over / unreg)
  - 耐性の枠: `ENG_RKINDS`(7 ダメージ耐性・6 属性倍率・8 状態異常・9 新状態異常)。たたんだときの1行は `simcResistSum`(ラトリオの表の HTML を読んで、最高の耐性と 100% 以上の状態異常を出す)
- **第3段階(v2.23.0)= 支援・アイテム・スキル**:
  - 一覧は `engSchema(jobId)`(職業ごとに1回・`ENG.cache`): 計算係の職業をその職業にして、固有自己支援 A1(`A_skillN` → `passiveSkill`)・A4(`A4_SkillN` → `buff4`)・A7(`buff7`)・A8(`buff8`)の欄を
    チェック(`OBJID_CHECK_A?_SKILL(_)SW`)+ `Click_*SW()` で開かせて入力欄を読む。他職の支援と状態異常は `CConfBase.targetArray[0〜4]`(`confIchizi/Nizi/Sanzi/Yozi/Debuff`)を
    `BuildUpSelectArea(objRoot, true)` で開いて `confDataObj`(名前)と `OBJID_CONTROL_CONF_<番号>_ID_<添字>` を読む。習得スキルは `OBJID_SKILL_COLUMN_EXTRACT_CHECKBOX` を押して `OBJID_SELECT_LEARNED_SKILL_LEVEL_<添字>` → `learnedSkill`。読み終わったら全部たたむ
  - 値: チェックは A系 = true/false、conf系 = 1/0(`simcBuffSet`)。選択肢が150を超えるもの(ステータス+ など)は数値入力にする
  - 目的別のしぼり込みは自動: `simcTagKick` が1つずつオンにして計算し、変わった結果で a(ASPD)/c(詠唱・ディレイ)/f(火力)/d(耐久)/s(ステータス)を付ける。
    ASPD が 193 に張りつくと差が出ないので AGI・DEX を 1 にした写しで調べる。結果は `md_simtags:<ラトリオの日付>:<職業>` に覚える(ブラウザ側)
  - 計算係の今の職業は `ENG.state.n_A_JOB`(`#OBJID_SELECT_JOB` の value は当てにならない)
  - まだ無いもの: 性能カスタマイズ(`confCustom*`)・時限効果(`timeItemConf`)・オートスペル、よく使う組み合わせの保存
- **v2.24.0 計算機の装備にゲームのアイテム番号を割り振る**(利用者の案: ラトリオの DB から番号を割り振る。無いものは手で結びつけ):
  - `char_core.resolve_name(名前, カードか)`: 手の結びつけ `sim_links`(名前 → 番号。char_state に保存)→ `id2name` の逆引き `_name_index`(NFKC・空白なし・末尾の [n] なし。同名は耐性データのあるもの優先)
    → 頭の [〇〇] を外す / 頭に [シャドウ] を足す / カードは「カード」を足す。`put_sim_set` と `restore` と `link_sim` のたびに `_resolve_sim` で引き直す
  - `/api/equipset` `{simlink: {name, id}}`、`{sim: …, links: {名前: 番号}}`(画面の `SETTINGS.ratLinks` の逆向きを渡す)→ 返事に `unlinked`。候補は GET `/api/itemnames`(id2name 全部・約600KB)
  - 画面: 装備セットタブで `simUnlinked(st)` の名前がボタンで並ぶ → `pickOpen(…, 最初の検索語)`。結びつけたら `SETTINGS.ratLinks[番号] = 名前` も書く(ゲームの装備 → 計算機 の向きと共用)
  - id2name.json は ratorio の `ro4/m/items_part*.json` から作った表(アプリに同梱)。新しいアイテムが足りなくなったら作り直す
- **よく使うオンオフの組み合わせ**: `SETTINGS.simPresets = [{name, job, on: {"欄:添字": 値}}]`(表示の設定.json に入る)。`simcPresetApply(m, p, これだけにするか)`。習得スキルは入れない。自分のスキルは同じ職業のときだけ当てる
- **第4段階(v2.25.0)= 保存URL の書き出しと、装備セットごとの確認**:
  - 書き出しは `engExportData(model)`。画面の入力欄へ流し込む必要は無かった: `engCalc` で model がラトリオの変数に入る → `savedata-collect.js` の `extractSaveModelFromState()` が変数から保存用の形を作る
    → 入力欄から読む項目(職業・Lv・ステータス・特性・武器の属性・速度ポーション・カード `cardIds`、`passiveSkillSelfCount`)だけ model の値で上書き(`cardCategoryIds` は null)
    → `buildSaveDataUnits()` → 各ユニットの `doCompaction()`・`encodeToURL(text, bitOffset)` → `CSaveDataConverter.CompressDataTextMIG` → `{base, chart: null}` を zstd + base64 → 先頭に `dx`。
    書き出し → 読み込みで元と同じ model に戻ることを 3職業で確認(支援のチェックは true/false と 1/0 の違いだけ)
  - **落とし穴**: 計算係を起動した直後は、ラトリオの初期化が時間差でまだ動いていて、読み込んだスキルなどを消すことがある → `engSettle()`(取り出した中身が2回続けて同じになるまで待つ)を、最初の読み込みの前と、毎回の読み込みのあとに入れた
  - 装備セットごとの確認: `simcMultiKick`(枠を開いているときだけ・裏で少しずつ)。いまの装備 + 登録した装備セットを1つずつ写しに着せて計算し、`simcMinStat` で 193 に要る AGI/DEX を二分探索。
    結果は `SIMC.multi = {sig, rows}`(sig = model + タブの ID)。表は `simcMultiTable`
- **v2.26.0 ステ振りの相談**(利用者の指摘: AGI・DEX・INT は詠唱と ASPD に相互作用がある → ポイント効率のよい振り方を支援):
  - `simcOptRun`: 条件(ASPD 193 / 詠唱の値 530)を満たす AGI・DEX・INT のうち、`GetStatusTotalCost` の合計が最小のものを探す。
    DEX を上限から1ずつ下げながら「その DEX で 193 に要る最小の AGI」を計算係でたどる(AGI は増える一方 = 階段)。INT は 詠唱の値の式から決まる(補正 = 合計 − 素の値 を、セットごとに計算係で測る)。
    詠唱の条件があると DEX の下限が決まるので、計算は 40回(4秒)ほど。最後に計算係で確かめ、足りなければ INT/AGI を足す。下限 `SIMC.opt.min`、対象 `scope`(cur / all)
  - 残りポイント `simcPoints`: もらえる = 48(転生職 100。養子 `buff8[13]` は 48)+ Σ `GetEarningStatusPoint(1..BaseLv)`、使う = 6つの `GetStatusTotalCost`(`hmjob.js`)
- **v2.27.0 比べる・たたんだときの数値・効く支援のチェック欄**:
  - 比べる: `SIMC.cmp`(装備セットの ID の並び。ASPD/耐性/補助情報の3枠で共通。見出しの `simcCmpChips`)→ `simcCmpKick` が裏で1セットずつ写しに着せて `engCalc(…, 全部の表)` → `SIMC.cmpRes = {sig, cols}` → `simcCmpFill` が
    `#scckeycmp`(`simcCmpKeyHtml`)・`#sccresistcmp` / `#sccxcmp`(`simcCmpXHtml`: ラトリオの表を `simcXParse` で「見出し|項目 → 値」にして、違う行だけ並べる)を書きかえる
  - ASPD の枠をたたんだときの1行は `simcKeySum`
  - 効く支援のチェック欄: `simcRelHtml(m, 印の文字, 枠の名前, 題)`。目的別の印(`simcTags`)が a/c のものを ASPD の枠に、d のものを耐性の枠に出す。`data-rel` → `simcBuffSet` → 全部描き直し(= 支援の枠と同期)。
    印は枠の開け閉めに関係なく、キャラを開いたら調べる(`simcTagKick`)
- **v2.28.0 起動の高速化・スロット保存・上の並べ方**(利用者の報告: 本物の exe で「計算係を起動できませんでした」、起動が遅い):
  - 計算係は calcx.html と部品 約250ファイルを読む。前は全部 `Cache-Control: no-store` で毎回読み直し(手元で 13秒、遅い PC では 30秒の上限を超えて失敗)。
    → `/ratorio/v-<取り込んだ版 commit>/…` という URL で読み(`engBase()`)、サーバーはこの形だけ `immutable` で返す(md_tracker.py)。2回目から 1秒弱。
    **計算係の中の import も必ず `engBase()` の頭にする**(頭が違うと、同じ部品が別物として二重に読み込まれて、計算係の中の変数とずれる)
  - 待ちの上限は 2分半、失敗時は「もう一度試す」。`md_simused` が 1 の PC ではアプリを開いて3秒後に前もって `engInit()`
  - スロット: 計算機のキャラ = スロット。`model` = 作業中(自動で残る)、`saved` = 「保存」を押したときの中身(`/api/simchars` に `saved` も送る)。＊ = `simcDirtySlot`。「元に戻す」= `model = saved`
  - 上の並べ方(利用者の指定: ゲームから作るが主体): スロットの行 →「ゲームのキャラから作る」(開いた枠 `mkgame`)→「ラトリオから作る」(閉じた枠 `mkrat`)
- **第5段階(v2.29.0)= 被ダメの検証を計算機のキャラで**:
  - 攻撃の選び方は前からの「被ダメの検証」と共通(`SIM`。`simAtkPick()` に切り出した)。被ダメタブの「検証」ボタン(`data-simgo`)→ `simcGoDmg`
  - 軽減の段階は計算係の結果から `simcDmgStages`: 属性 = 拡張情報「属性倍率」の表(耐性・鎧の相性)、種族/ボス/サイズ/遠距離 = 「ダメージ耐性」の表(`simcXParse`)、
    DEF/MDEF = `charaData[7,8]`(除算・減算)/`[9,10]`、RES/MRES = `specData[254,255]` + STA/WIS の分(ラトリオは RES/MRES の最終値を出さないので目安)
  - **ダメージは比で出す**: `simcDmgBase` = このスロットのキャラに「そのときのステータス(通信の値)と装備セット」を入れた写しを計算係で計算 →
    記録のダメージ ×(いまの軽減 ÷ 写しの軽減)。計算係が再現できない分(RES/MRES など)は打ち消し合う。職業が違うスロットでは写しを作れず、記録の表(gear_info)からの逆算にもどる(警告を出す)
  - 「このときのキャラ・装備でスロットを作る」= `SIMC.fox = {char, set, shadow}` → `simcFromFox(true)`。「比べる」の結果(`SIMC.cmpRes`)があれば列に足す
- **v2.29.1 外部(CDN)の部品を同梱**(利用者の報告: v2.28 でも「起動に時間がかかりすぎました」。「アプデ時に事前に盛り込めないのか」):
  - calcx.html は cdnjs から font-awesome の css と html2canvas を、`engine/ui/calchistory.js` は jsDelivr から chart.js を **静的 import** で読む。ここが遅い・つながらないと、部品の読み込み全体が止まって計算係が起動しない
  - `ratorio_cdn/`(リポジトリに入れて exe に同梱。build.yml の `--add-data "ratorio_cdn;ratorio_cdn"`)に写しを置き、`map.json` = {元の URL: ファイル名}。
    サーバーはラトリオのテキストを配るときに URL を `/ratorio/[v-…/]_cdn/<名前>` に読みかえる(md_tracker.py。写しの無い URL はそのまま = 外部から)。ラトリオ側が版を上げたら、新しい URL の分を足す(README.txt)
  - 配る中身を変えたら `ENG_CACHE_VER` を上げる(`/ratorio/v-<commit>-<版>/`。同じ URL は immutable でブラウザが覚えたままになる)
  - 起動の様子は POST `/api/log` → 動作ログ.txt の `[画面] 計算係を起動しました(秒): 読み込み=…・部品=…・職業の欄=…・読んだファイル=…・エラー=…`(失敗時も)。利用者のフォルダの動作ログで確かめられる
  - 前もっての起動は、ラトリオを取り込んである PC では常に(窓が見えているときに)。待ちの上限は「見えている時間」で2分半
- **v2.30.0 スロットの考え方にそろえる**(利用者の設計変更):
  - 「いま着ている装備」= **いまログインしているキャラ**の装備だけ(`nowChar()`。`/api/data` の `now_chars` = `core.currents` の値。複数なら最近動いたもの)
  - キャラのスロットの行:「保存」の隣に「新しいスロットを作成」(ノービス Lv1 の空の model)、「現在のキャラを反映」= `simcFromFox(false, {char: nowChar(), full: true})`(職業ごと作り直して、いまのスロットの `model` を置きかえる)
  - 装備スロット(`simcSetTabs`): 記号を押すとメニュー(反映 = `simcWearSet` / 上書き = `simcRegister(shadow, sid)` / 名前 / 記号 / 登録を外す)。
    「＋新しいスロットに保存」「いま着ている装備を反映」(`now:<nowChar>`)「保存した装備から」(記号なしの履歴)
  - 「保存したキャラから作る」= 前の「ゲームのキャラから作る」(枠の名前 `mkchar`、最初は閉じる)。装備セットタブの「いま着ている装備」も nowChar だけ(記号なしなら「スロットに登録」ボタン)
  - 補助情報の比較は、ラトリオの表をそのまま横に並べる(`simcExtraBody` の `.xrow`)。`SIMC.cmp` は2つまで
  - 画面の言葉: 「装備セット」より「装備スロット」、「着せる」より「反映」、「登録・上書き」
- **v2.30.1 初回に起動しない本当の原因**(利用者の動作ログで判明: `読み込み=complete・部品=なし・読んだファイル=250・エラー=…/engine/entry/calcx.js` で155秒 → やり直しは1.2秒で成功):
  socketserver の `request_queue_size` の既定は 5。計算係が約250ファイルを一気に取りに来ると一部が断られ、module の取得が1つでも失敗するとラトリオは起動しない。→ `request_queue_size = 256`。
  `engInit` は、エラーが出て部品が現れないときは 2.5秒後に `f.src = f.src` で読み込み直す(5回まで。取れた分は覚えているので残りが減る)。CDN の同梱(v2.29.1)は別の弱点への対策として残す
- **v2.31.0**: 装備スロットは 押す = 切りかえ(`simcWearSet`。消えるものがあるときだけ `wearAsk`)、右クリック = メニュー。表示中のスロットの色は `details.slotc` の `--slotc`(枠と `.pk` の縁。手で変えたら `.dirty` = 点線)。
  並びかえ: 上のタブは `SETTINGS.tabOrder`(`makeSortable(#tabs, …, "x")`。つまみはラベルの `span.grip.tgrip`)、計算機の枠は `SETTINGS.simOrder`(描いたあとに `#sccmain` の子を並べ直し、見出しに `⋮⋮`(`.fgrip`)を足す。基本+特性は `stats` として1つ)
- **v2.32.0**(利用者の指定): サブタブの名前は「キャラシミュレーター」「被ダメシミュ」。キャラシミュレーターから被ダメの枠は外した(`simcDmg*` の関数は残っているが、枠は出していない。被ダメタブの「検証」は `SIMV = "dmg"` を開く)。
  「新しいスロットを作成」「現在のキャラを反映」はスロットの行の下の段(`.slotmake`、大きめ)。「保存URLを書き出す」は「ラトリオ」の枠(`mkrat`)。「比べる」は いまの装備 + 1つ(`SIMC.cmp` は1つだけ)
- v2.32.1: 装備セットタブの履歴は、記号なしのうち「よく使う」上位 `GS_HISTN`(10)件(着た回数 worn → 被ダメの記録の数 → 新しさ)。`GS_HISTALL` で全部。登録のメニューは「新しいスロットを作成して登録」「スロット ○ に上書き」
- **v2.33.0 被ダメタブ**(利用者の指定): 合計の列 → 最新(`dmg_core` の行の [7] = 最新のダメージ。`_merge` は [7] を足さずに新しいほうを残す。前の版の行は 5つか7つで [7] 無し)。
  最初のキャラはログイン中のキャラ(`DMG_CHAR_AUTO`。自分で選んだら外す)。場所ごとの表は `dmgByGear` で装備セットごとに分け(シャドウ違いはまとめる。`DATA.equip.sets` に無い古い ID は `_old` = 「前の記録」に一括)、
  各行の「シミュ」(`data-simgo` = [キャラ, 場所, 相手, 技, 装備+シャドウの ID])→ `simcGoDmg` が被ダメシミュを開く
- v2.33.1: スロットの「元に戻す」は「ロード」に名前を変えて「保存」の横へ(`#sccrevert`。働きは同じ = `model = saved`)
- **v2.34.0 公式サイトのモンスター情報**(`ro_official.py`。利用者の依頼: 入った MD のモンスター情報を公式サイトから負荷をかけずに自動で集める / 名前が分からない相手は使われたスキルから候補をタブで選んで手で紐付ける):
  - 取り先: `https://rotool.gungho.jp/`(robots.txt は全部許可)。JSON 検索 `/monster_filtered_search/?name=&detail=1`(名前の部分一致。ID名 `Name`・`JName`・Lv・HP・属性 `property`・種族・サイズ `scale`・種類 `class`・Atk 等。**スキルは無い**)、
    モンスター詳細 `/monster/<ID名>`(HTML。**使うスキル**・出現マップもある。`parse_detail`)、`/map_filtered_search/?name=`(MD の名前 → `map_file` 「1@ct0」。入ったマップ「0ef1@ct0」の後ろ `ct0` で見分ける)、`/map/<map_file>`(出現モンスター一覧 `parse_map`)。
    **MD のマップの一覧は当てにならない**: `1@nls1`=26体 / `9@infi`(ファロス)=0体 / `1@ct2`(星座の塔)=268体(全部入り。リンクが1体につき2つあるので、数えるときは重複をはずす)。だから主な名簿は「見かけたモンスター」(`dmg_core.mob_seen` = 場所 → 名前。出現 09FD〜FF の種類 pkt[4]==5 が monster。フィールドは覚えない)と被ダメの相手の名前。一覧が `SMALL_MAP`(80)以下のマップだけ、そこのモンスターの詳細も集める
  - **サイトポリシー(/sitepolicy/)**: 著作権は運営(ガンホー)にあり、個人的な利用以外での公開・配布は不可 → **集めたデータは `公式モンスター.json`(各 PC のローカル・.gitignore)だけ。アプリ(exe)にも GitHub にも同梱しない**(先に集めて同梱する案は、これで見送った)
  - 負荷対策: 1件ずつ・`MIN_GAP`(3秒)+0〜1秒のゆらぎ・裏のスレッド・クッキー無し・同じものは二度取らない(見つからない名前は14日)・429/5xx/タイムアウトで30分休む(「今すぐ調べる」でも休みは解除しない)・取りにいく作業は同時に1つだけ(`_run_lock`。重なったら "busy")・1回 `RUN_MAX`(120)件まで・アプリ起動の90秒後から30分おき(やることがあるときだけ)。UA は `Fox_MD_Tracker (personal local cache; …)`
  - データ優先順位に足した: **実測(JRO_FIX) > 公式サイト(`Official.info`) > ラトリオ(mob_info.json) > rAthena**(`DmgCore.mob_view` が公式を先に引く。語彙は mob_info と同じ: 属性「闇1」・種族「悪魔」・サイズ「中」・ボス = 種類が一般以外なら 1。強さ違いは「185/250」)
  - 名前の分からない相手 `ID○○` は **1体ごとの番号(出会うたびに変わる)** で、モンスターの種類ではない。だから `DmgCore.unknown_groups()` が 場所 × 使った(名前のある)技の組み合わせ でグループにして、候補 = その場所で見かけた名前 + 公式の出現一覧、
    技が全部合う順(使った技が1つも合わないものは外す)。`auto` = **その場所の候補の使うスキルが全部取れていて**(`Official.detailed`。集めている途中は決めない)、全部の技に当てはまるのが見かけたモンスター1つだけのとき(`apply_auto` が60秒おきに自動で紐付ける。`_rename_who` は元に戻せないので慎重に)。出現一覧が `SMALL_MAP` を超えるマップ(星座の塔など)は一覧を候補にしない。`link_ids(where, ids, name, remember, skills)` は `_rename_who` で記録を付けかえて、`names[ID]` も入れる(その ID の次の被ダメが名前で入る)。
    `remember` = 決まり `links`([{where, skills, name}])。記録するときに `_rule_name(where, skill)` がその技にぴったり1つの決まりがあれば、その場で名前にする。他の技も使う相手は別グループ(混ぜない)
  - API: `/api/data` に `mob_groups`・`official`(状態)・`official_names`、POST `/api/moblink`・POST `/api/official`({enabled} / {run:1}。`kick`)。画面は被ダメタブの上(`officialHtml` / `mobGroupsHtml` / `bindMobGroups`)
  - テスト: 実ページを保存した fixture で `parse_*`・間隔・キャッシュ・429・上限を確認(scratchpad の `t_official.py`)、本物のサイトで 4 リクエストだけ実地確認ずみ。画面は `ui_server9.py`(`Official` の fetch を差しかえてサイトを呼ばない)
- **v2.35.0 ステ振りの相談**(利用者の指定): 目標 ASPD(`SIMC.opt.target`。`SIMC_ASPD`=193 は ASPD の欄など他の枠の印のまま)、対象は装備スロットのタグ × シャドウのスロットのタグ(`mainSel` / `shSel`。"now" = 計算機にいま入っているもの。`simcOptSets`。最大 `SIMC_OPT_COMBO_MAX`=16通り)。
  **ラトリオは基本ステータスを 130 に切らない**(AGI 300 でも ASPD が伸びる)ので、届かないときは `SIMC_STTOP`(400)まで探して「いくつ要るか」を出す(`simcOptShort`、`simcMinStat`、`simcNeedKick`)。ふつうの探索は 130 まで。画面の言葉は「（1個入らず）」ではなく「（未装備 1）」
- **v2.36.0 サンドバックマン**(利用者の依頼。ゲームのお試し道場のモンスター。ブログ https://ro-challenge.blog.jp/archives/1080740694.html : 最大HP 1,000倍 = 10億、属性・サイズを自由に指定。草とプレイヤーの種類はオミット):
  - 計算は、ラトリオの「手入力モンスター」(`MONSTER_ID_MONSTER_TENYURYOKU` = 929。値は `CMobConfInput` の `SetMobConfInput(MOB_CONF_INPUT_DATA_INDEX_*)`)を使う。`engSandbag(model, cfg, mt)`:
    手入力の値(Lv1・HP 1e9・DEF 600・MDEF 100・RES/MRES 0・属性 = 属性番号×10+Lv・種族・サイズ・BOSS)を入れ、`CMonsterMapAreaComponentManager.GetMonsterId` を一時的に 929 を返すものに差しかえ、`calcFromModel`(= 計算 + ダメージ。`calcCoreFromModel` はダメージを出さない)を呼び、
    `finally` で全部元に戻す(支援の印・手入力の値・GetMonsterId)。**キャラの計算 → サンドバックマン → キャラの計算 で charaData・補助情報の表が同じになることを確認ずみ**(隠れた状態の確認。この枠はこれまで2回ここでずれた)
  - DEF 600 / MDEF 100 は `DEF_DIV` / `MDEF_DIV`(ラトリオの除算 DEF = 装備側。ゲームの画面の「防御力」)に入る。ゲームの実測とは未照合なので画面は「目安」
  - 攻撃方法の一覧: `engAttackMethods(model)` = `CAttackMethodAreaComponentManager.GetEffectiveAttackMethodDataArray()`(直前に `engCalc(model)` で計算係を model に合わせる。職業ごとの攻撃スキルだけ)。各方法の `GetNextOptionList()` が「レベル → ほかの設定」の鎖(`sbChain`)。
    `optionValueArray` = 鎖の2つ目以降の値、`skillLv` = 1つ目。通常攻撃(skill 0)は結果が空なので候補から外している。エレメンタルバスターなどが 0 になるのは精霊などの「自分のスキル」の設定が要るため(追加設定ではない)
  - 設定は `model.foxSb`(`simcSbCfg`)。**「変更」には数えない**(`simcStripSb`。スロットの ＊ が付かない)。枠は `simcFold("sb")`(最後。開いたときだけ計算する)
  - 記録: `サンドバックマン記録.json`(`/api/sandbag` GET / POST {add / delete / note}。同じ `key`(中身のハッシュ)は日時だけ更新。最大 200 件。.gitignore)。1件 = {key, slot, job, model(その時の全部), sb(設定とスキル), res(数字), note}。
    タブは `SIMV = "sb"`(`renderSandbagTab`)。結果 → 記録: `sbxGo`、記録 → キャラシミュ: `sbxApply`(いまのスロットの作業中の内容を置きかえる。`askOnce("sbapply")`。スロットが無ければ新しく作る)
- v2.36.1: **隠れた状態 その3**: ダメージの計算(`ComputeBattleResult`)は、補助情報の表が読む `CExtraInfoAreaComponentManager.dispDataMap`(物理特化の `STRDEX_BONUS` など)を書きかえて残す(魔法職のスキルでは変わらないので、EM だけのテストをすり抜けた)。
  → `engSandbag` は計算の前に `dispDataMap` を写しておき、`finally` で戻す。確認: IG・RG・EM の全スキル × 2設定(計170回)で、サンドバックマン計算のたびに `engCalc(m, 全部の表)` の c/core/tot/spec/x が計算前と一致(食い違い 0)。
    **サンドバックマン(や、ダメージを出す計算を足すとき)は、魔法職と物理職の両方でこの確認をする**。`engSbInit` は失敗しても計算機の起動を止めない(`ENG.sb = null`。枠に「使えません」)。計算係を作り直すとき `ENG.sb = null` にする(前の窓の部品を持ち越さない)。
    ダメージ 0 の理由は、別の属性(火1/水1)でもう1回計算して見分ける(出れば属性の相性、出なければ「自分のスキル」の設定)。手入力モンスターの値が `mobData` に渡っていること(ID 929・Lv・HP・SIZE・ELEMENT・RACE・BOSS_TYPE・DEF_DIV・MDEF_DIV)を確認ずみ。サイズは物理スキルで効く(片手剣は小・大が中の約88%)
- **v2.37.0**(利用者の指摘): 「新しいスロットを作成」の空のスロットは職業がノービス(0)。`simcItemOpts` は職業で絞るため、ノービスだとシャドウの候補が「（なし）」だけ(=ピッカーが開かない)・`simcWear` が装備を見つけられず「反映されない」になっていた。→ `simcItemOpts(job, region, any)`: 職業に合う候補が1つも無い場所は制限を外して出す。`simcWear` も職業で見つからなければ制限なしで探す。「＋ 現在のキャラで新しいスロットを作成」(`#sccnewnow` → `simcFromFox(true, {char: nowChar()})`)。スロット名 = `simcSlotName`(キャラ名_Lv_職業の略称 `SIMC_JOBABBR`_装備スロットの記号。記号が無ければ「いま」)。「現在のキャラを反映」と、装備枠の「いま着ている装備を反映」(メインのみ)でも付けかえる。押したときの色: (v2.37.4 で光る枠は廃止 → `button:active` の配色のみ)、時間のかかる作業は `SIMC.busy` を黄色い `.busybar` で出す。サンドバックマンの実測(利用者: Fox のEM・バフなし・テラドライブ Lv1 = 31,149K)は、撃ったキャラ・相手の設定が不明で未照合。
- v2.37.1: `simcFromFox`(新規・全部反映)で、Fox のスキル `e.skills`({番号: Lv})を名前(`DATA.skill_names`)でラトリオの「習得スキル」(`engSchema` の g=learn)に入れる(`simcApplySkills`)。入れないと与ダメージが低い。**実測との照合(利用者: Fox_Thirteen・EM・バフなし・テラドライブ Lv1・BOSS・無形・無2 = 31,149K)**: スキル無し 24.83M → スキルあり 29.84M(実測の 0.958倍。残り約4%はランダムオプション等の未取り込みと推測)。テラドライブは DEF/MDEF を変えても結果が同じ(防御を無視)ので、DEF 600/MDEF 100 の入れ方の照合にはならない。防御に影響されるスキルでの実測が別に要る
- v2.37.2: 「現在のキャラ」系のボタン(`#sccnewnow` `#sccnow` `#sccnowequip`、装備枠の `data-wearnow`)は `lastChar()` = `nowChar()` が空(キャラ選択画面に戻っている間)なら、装備と職業を覚えている中で最後に更新されたキャラを使う(`charWho()` が名前を出す)。利用者の「押しても反応がない」の原因は、ボタンが disabled(動作ログに「キャラ選択画面へ」)。**押せないボタンは反応がないように見える → 押せないときは理由を出す/代わりの動きをさせる**。エラーの `SIMC.msg` は赤い `.busybar` で出す
- v2.37.3: 見出しに `#whochar`(`renderWhoChar`。`lastChar()` / `nowChar()`。ログイン中は緑の●、いなければ「最後: …」)
- **実測の照合(2026-10-11)**: Fox_Thirteen(EM Lv267)・バフなし・BOSS無形無2中。ダイヤモンドストーム Lv1 の実測 = 5ヒット×約601万〜614万(1回 3005万〜3069万)、ツール 平均2984万(最小2928万〜最大3041万) → 実測は約1.5%高い。テラドライブ Lv1 は実測3115万(ツールの1.044倍)。ダイヤモンドストームとテラドライブはラトリオで同じ式(同じ数字)。**このキャラは靴とアクセに「Mdef50%無視」が2つ = MDEF 100% 無視、魔法は DEF を使わないので、EM の魔法スキルでは DEF 600/MDEF 100 の入れ方は照合できない**(値を変えても全スキルで同じ数字になる。これは正しい動き)。照合するなら、MDEF 無視の無い魔法職か、物理職(DEF が効く)の実測が要る。残りの差(1〜4%)はランダムオプション等の未取り込みと推測
- **v2.37.4 計算機の安定化・軽量化**(利用者の報告: 計算機まわり、特に各枠のドロワーが不安定):
  - 原因: ローカルでは5秒ごとに `load()` → `render()` で #view 全体を `innerHTML` で作り直していた(開いた枠・スクロールが乱れる)。さらに描き直した直後に `<details>` の `toggle` が勝手に飛び、「サンドバックマン」枠が開いていると `sbxLoad().then(render)` → 描き直し → toggle … の連鎖になりうる
  - 直し: `load(quiet)`(自動の読み直しは `JSON.stringify(data)` が前と同じなら描き直さない。手動の `load()` は従来どおり)/ `render()` は `renderNow()` を呼ぶ前後で `scrollY` を戻す/ 30秒ごとの `render` は時間表示のあるタブ(週次・デイリー・その他・ニャル様・イベント・入場履歴・耐性)だけ/ 枠の開け閉めは `foldBind(root, after)`(`el.open` が変わったときだけ保存・`after` 実行。初回の toggle は無視)
  - ボタン押下: 光る枠(`.clickflash`)は廃止。`button:active` は `background-image: linear-gradient(rgba(0,0,0,.28)…)` で配色が濃くなるだけ(filter・transform は使わない)。読み込み・計算中は `.spin`(くるくる)
  - 確認: Playwright で、同じ内容の `load(true)` は描き直さない・押下で色が変わる・`.clickflash` が出ない・`foldBind` が初回に発火しない、を確認ずみ。**ラトリオ(計算機の中身)が無い環境なので、実機の計算機での確認は未**
  - **v2.37.5 の訂正**: v2.37.4 の `load(quiet)` の比較は、`build_payload` の `updated`(= 毎回の現在時刻)が入っていて常に「違う」扱いだった(critic が発見)。比較から `updated` を除き、`j.settings` も含める。描き直さないときも `#upd` の表示だけ更新。確認: ui_server9 で `load(true)` を3回 → #view の最初の要素が同じまま・`load()` は描き直す
  - まだ重い所(未着手): ①「複数装備の比較」枠(`simcMultiKick`)= 装備スロットごとに計算+`simcMinStat` の二分探索で、枠を開いたまま数値を触るたびに再計算 → 「計算する」ボタンで手動にするのが効きそう ②支援・アイテムの一覧(数百項目)を検索・タブ切りかえのたびに全部作り直す(`relist` / `simcBuffListHtml`)→ 行を絞る ③被ダメ記録・サンドバックマン記録が増えると描画と読み込みが重くなる(記録を新しい順に一部だけ描く) ④`makeSortable` を描き直しごとに付け直している
- **v2.41.2 ゲームの装備が入らない不具合**(利用者: セット C の左手「デイヴィッドシールド」がシミュで「(なし)」): ラトリオの候補の名前に先頭「【習】」が付く装備が220件あり(例 `【習】デイヴィッドシールド`。武器の `[本] ` の接頭辞は `o.n` に外した名前が入っているが、【習】は入っていない)、`simcFind` の名前照合で一致しなかった。→ `simcFind` は候補の先頭の【…】を外して比べ、【】の無い候補があればそちらを先に選ぶ。**確認の型**: 登録した全部の装備セット・シャドウセットを `simcWear` で着せて、返り値(入らなかったもの)が空であること(17件すべて空)。装備名の照合を触ったら、この確認を必ずやる
- **v2.46.1 ゲームとアプリの ASPD の齟齬(利用者: ゲームは 192、アプリは 191.4)**: **原因 = ポーションの設定違い**。同じキャラ・同じ装備で、能力値(STR〜LUK の合計)・ATK・MATK・DEF・MDEF はゲームと**完全一致**。ASPD は 濃縮サラマインジュース + ハイスピードポーション で 192.0(利用者の設定は「スピードアップ」= 191.4)。**ASPD ポーション(`m.status.speedPot`)は「支援・アイテム・スキル」の一覧に無かった**(シミュレーターの中だけ)ので、`simcPotHtml`(共通部品)を「支援・アイテム・スキル」(`simcBuffListHtml` の先頭。アイテム・食品/オンのもの/ASPD の分類)・「ASPDに効く支援」・シミュレーターに出し、`simcBuffSum` にも含める。**ゲームの ASPD は通信の `derived.ASPD`(amotion。ゲームの表示 = 200 − ASPD/10。192 ↔ 80)**で取れる。→ `stpGameCmp`(枠 `stpgame`「ゲームの表示との照合」): `E.status.derived`(ゲームが最後に送ったステータス)と `engCalc` を並べ、差を出す。ASPD の差は4通りのポーションを試して「合うのは○○」と出す。**残る差(利用者のデータ): 最大HP −23,312(−7%)・SP −2,159・HIT −10・FLEE −10・CRI −9.6 は、ゲームで食べている食品・使っているアイテムが未設定のため(原因の食品は未特定)**
- **v2.45.0 ステータスシミュレーターのダメージ重視(利用者の指示)**: 「提案で一番安い振り方だと INT がガッツリ下がる。**一番気になるのはダメージがどれくらい変わるか**(ExtraInt の条件110も大事。固定の数字が下がるとバフ発動時にどれくらい影響が出るかも)。サンドバックマンはこのために作った → 小型サンドバックマンのコントローラを。数値で重点を。ダメージは K/M、増減は実数(+%)」。→ `stpSbCtl`(スキル・Lv・追加設定・敵の設定 = `m.foxSb`(サンドバックマンの枠と同じ)・時限効果のチップ = `SETTINGS.atkFx.on`(与ダメシミュと共通))、`simcSbAvg(m, over, useFx)`(時限効果 `atkFxApplied(atkActiveIds(kind), boss)` を `mt.fx` に足して計算。結果は `ENG.cache["sbd:…"]` に覚える。スキルの物理/魔法は `stpSbKind`)、`stpKM`(K/M/G)・`stpDelta`(実数と%)。出す場所: ①その場の結果(`stpDmgBlock`。基準 = 基本ステータス欄の値)②提案の各候補(ダメージ・時限効果込み)③+10の影響表 ④**新しい枠「ステータスを変えたときのダメージ」**(`stpsw`・`stpSwHtml`。ステータス・向き・刻み・回数を選んで並べる。**段差**(1刻みの下がりが中央値の1.8倍以上)に「⚠ 段差」= ステータス条件つきの効果(ExtraInt 等)が外れた/付いた境目)。**実測: Fox_Thirteen の セット C・ダイヤモンドストーム・BOSS 無形 無2 中 で、INT 130→128 は −0.04%/刻みなのに、128→127 と 121→120 で各 約 −0.3M(約0.9%)の段差(INT 127・120 に条件がある効果)。INT 130→68(提案)は −9.4%(時限効果込み −11.8%)**。時限効果(真理の解放 = ボスへ+100%・暴走した魔力 = INT+200。参考 https://lawcemelo-n.com/the-liberation-of-truth-and-runaway-magic/ 、真理 > ExtraInt > 暴走 の目安)は「かかっているとき」の数字で、発動率・持続時間の期待値は未
  - **v2.46.0(利用者の指示)**: ①**Extra系**を効果の一覧(`ATK_FX`)に追加。ラトリオのデータ(`card.dat.js` 1859〜1864 の `400000089, 1, 28000000089, 5` など)の読み(`equip/item.h.js` の条件の分解): `4e8+89` = 「純粋なINTが10上がる度に、魔法ダメージ(spid 89)+1」、`28e9+89` = 「純粋なINTが**110以上**の時、魔法ダメージ+5」。STR=物理ダメージ(80)/AGI=必中攻撃(86)/VIT=回復量(92)/INT=魔法ダメージ(89)/DEX=遠距離ダメージ(25)/LUK=クリティカルダメージ(70)。ステータスで値が変わるので `dyn: (st) => [[欄, 番号, 値]]`(`atkFxApplied(ids, boss, st)` に素のステータス `st` を渡す)。**実測: ExtraInt(INT130)は 魔法ダメージ+18% を足すと、サンドバックマンのダメージ +6.0%(ブログの「常時約6%」と一致。ラトリオの「魔法ダメージ」欄は装備の分と足し算で掛かるため)。INT 109→110 で +2%(+5%の条件)**。②装備に付いていない効果はグレー(`atkOwnedNames` = 装備中のカード名の一覧、`atkFxOwned`)。選ぶことはできる。③並び: stpmain → 「装備パターンごとの確認」(枠 `stppat`・開いている。装備スロット/シャドウのスロットのチップはこの中)→「ダメージの目安(小型サンドバックマン)」(枠 `stpsb`・閉じている)→ いちばん安い振り方 → 掃引(`stpsw`)→ 影響(`stpeff`)。装備パターンの表の計算は `stppat` を開いているときだけ
  - **まだ**: ステータス条件つきの装備効果の一覧(「あと何ptで効果」)。段差の中身(どの装備・カードか)は出していない(境目の数字だけ)。ラトリオの補助情報(種類12)の閾値表は未使用
- **v2.44.5 装備セットの中身が付け替えで壊れる(利用者: 略称が取れてない。セット C の武器・盾・肩が場所なし・名前が「+10ﾖﾙｽ念」だけ)**: `char_core._register` が、セットの items に**着ている装備(`ch["equips"]`)の辞書そのもの**(`"slot" in i` のときは `_item_view` を通さずそのまま)を入れていたため、あとで `_wear`(外した/付け替えた)が `item["wear"] = 0` に書きかえると**セットの中身も書きかわり**、そのまま保存されていた(`inventoryIndex` も残っていた)。→ `_snapshot`(deepcopy + `inventoryIndex` 除去)を入れる。**壊れた保存ずみのセットは `repair_sets`(起動時 `restore` で)が直す**: 同じ itemId が別のセット・着ている装備で場所つきで見つかればそれを使う / 見つからなくて「場所なし1つ・空いたメインの場所1つ」ならそこへ。実データで23個直り、全セットの略称に武器・盾・肩が出ることを確認。**教訓: 保存するものに、変わりうる辞書をそのまま参照で入れない(コピーする)**
  - ステータスシミュレーターの装備スロットのチップ: 枠の色になっている(= 着用中・手を加えていない `stpNowSid`)記号は、「いまの装備」を選んでいるあいだ選択済みに見せる。押すと「いまの装備」の代わりにその記号を選ぶ(同じ中身を2回数えない)
- **v2.44.4 反映後に計算機がエラー**(v2.44.2 の見える化で判明。利用者の画面の `Cannot read properties of undefined (reading 'join') at renderSimChara`): **`SIMC.report` を作る場所が2つあり**(`simcFromFox` と `simcWearSet`)、v2.38 でランダムオプションの「入らなかった一覧 `rndMiss`」を足したとき `simcFromFox` だけ直して、`simcWearSet`(装備スロットの記号・いま着ている装備の反映)が `{id, rows, rnd(真偽)}` のままだった。ランダムオプション付きの装備だと `rep.rnd` が真 → `rep.rndMiss.join` で落ちる。→ `simcWearSet` も `SIMC.rndMiss/rndOk` を使って同じ形に。表示側も `(rep.rndMiss || []).join`。**教訓: 同じデータ(`SIMC.report`)を作る場所は全部探す。確認の型: 反映の全経路(`simcFromFox` 新規/全部/装備だけ・`simcWearSet` now/登録セット/シャドウ)を、ランダムオプション付きの装備(シャドウ S1 など)で通して、画面がエラーにならないこと**
- **v2.44.3 反映系の軽量化(利用者: 「現在の装備を反映」系が重い)**: 計測(Fox_Thirteen): `engTemplate`(職業のまっさらな model)が**毎回 約2.5秒**(職業を2回切りかえて 700ms ずつ待つ + 読み取り)。→ 職業ごとに `ENG.cache["tpl"+jobId]` に覚える(2回目から約0.3秒。**ひな形はキャラによらない**。`ENG.cache = {}` のとき忘れる)。装備を着せる処理(`simcWear`)自体は約50ms。`simcFromFox` の最初の `render()`(計算し直すので重い)を `simcBusyNow`(帯だけ出す)に。反映のあとの裏の計算(`stpHeavy`)は、①`SIMC.busy` の間は始めない ②「ポイントを足したときの影響」(`stpeff` 枠)は開いたときだけ。**職業のひな形の初回(アプリを開いたあと最初の1回)は約3秒かかる**(まだ)
- **v2.44.2 画面のエラーの見える化**(利用者: 装備スロットの登録・反映をしていたら「ツールが止まっているみたい」と出て、計算機のタブに古い装備セット画面が残った): **「ツールが止まっているみたい」は `load()` の catch が出す表示で、`render()` の例外でも出る**(原因の取り違えを招く)。しかも例外のとき `LOAD_SIG` は更新済みなので、次の自動の読み直しは「同じ内容」で描き直さず、古い画面が残り続ける。→ `render()` を try/catch で包み、エラーの中身を `#view` に出す・`LOAD_SIG = ""` で次の読み直しで再描画・`/api/jslog`(POST。exe の エラーログ.txt に `[画面のエラー]` を残す)・`window` の error/unhandledrejection も同じ記録。`simcFollowBoxes` はスロットごとに try/catch。**原因の例外そのものは、実データのスロット・装備セットを使った再現(登録・上書き・反映・タブ切りかえ)では出ず、未特定**。次に同じことが起きたら エラーログ.txt の `[画面のエラー]` の行か、画面に出るエラー文で分かる。`tools/ui_test_server.py --data` は、計算機のスロット(計算機のキャラ.json)も写しで読むようにした
- **v2.43.0 ステータスシミュレーター(利用者の指示で、旧「ステ振りの相談」「維持の確認」を作り直し)**: 利用者の考え方: **ポイントは振るほど要求が重くなるので、130まで振るのは非効率。条件(ASPD・無詠唱)に要る分だけ振り、ステータス条件つきの装備・カード・エンチャントのために必要最小限にする。優先は ASPD と無詠唱 > MHP(VIT) > ステータスによる状態異常耐性・重量。四次職は特性ステが主体で通常ステのダメージへの影響は微々たるものと思われる(要検証)** → 「余りを STR・LUK に振り切る」提案は誤り(廃止)。
  - **ASPD の式(ラトリオ `status/stallcalc-magic-dmg-aspd.js`。実測で誤差 0 を確認)**: 素 = 武器の基本 + √(AGI×(10+10/111) + DEX×9/49)×(…)(AGI・DEX は補正込みの合計。**DEX は AGI の約1/55**)→ ポーション等 T で (200−x)×T → 装備の「攻撃速度+%」U で (200−x)×U → 最後に装備・スキルの「ASPD+」P を足す。上限 193(BaseLv100未満は190)。つまり 上限前の合計(`core.aspdRaw`)= C + k×√(AGI×AW+DEX×DW)。**2回の計算で k・C が決まる**(`stpCal`。AGI+12 を動かす)→ 必要な AGI は式で出る(`stpSolve`: DEX を1ずつ動かし、要る AGI・INT を出して費用 = `GetStatusTotalCost` の合計が最小のものを選ぶ)。条件で効果が出る装備(「AGI100以上で…」など)があるので、答えは必ず `stpVerify` でラトリオの計算で全パターンを確かめ、足りなければ INT/AGI を1ずつ足す。無詠唱 = 詠唱の値 2×DEX+INT(補正込み合計)≧530。旧の探索(80回・約8秒)と同じ答え(AGI124/DEX100/INT48)が、計算数回で出ることを確認ずみ
  - 内訳の取り出し: `engCalcRaw` が `aspdU`(`dispDataMap.get(12)` = 攻撃速度+%)・`aspdP`(`get(101)` = ASPD+)を結果に持つ(計算の直後にしか読めない隠れた状態)。素のASPD a1 = (aspdRaw − P − 2U)/(1 − U/100)
  - 画面: 基本ステータス・特性ステータスを縦に並べ(`.stcol`)、右にステータスシミュレーター(枠 `opt`・`stpHtml`)。試算のステータス `SIMC.stp.d`(触るまでは基本ステータス欄についていく)をステッパーで動かすと `stpMainHtml` がその場で計算(補正込みの合計・次の1ptの費用・使用pt・ASPD の内訳・詠唱の値・HP・所持限界量・ステ耐性)。重い計算は入力が落ち着いてから: ①装備パターンの表(`stpPatsHtml`。素・攻撃速度+%・ASPD+・補正を並べる)②いちばん安い振り方(`stpSugHtml`。届かないときは上限(`SIMC_STTOP`)を超えていくつ要るか)③+10 したときの影響(`stpEffHtml`。ASPD・詠唱・HP・所持限界量・ステ耐性・サンドバックマンのダメージと費用)。「基本ステータスに反映」で `m.status` に入れる。旧 `simcKeep*`・`simcOptRun`・`simcOptShort`・`simcOptHtml` は削除(`simcOptSets`・`simcOptSel`・`simcOptColors`・`simcSbAvg`・`simcLearnedList` は残して使用)
  - **v2.44.0 の変更(利用者の指摘)**: ①**「130で届かないとき上限なしでいくつ要るか」は意味が薄い → 「AGI 130＋○○」(上限130を超える分 = 装備・支援の補正があと○○足りない)の目安**。②**ASPD を優先しすぎ**(AGI・INT・DEX は ASPD と変動詠唱の両方に関わる)→ 届かないときは `stpBest`(予算内で、無詠唱=詠唱の値530を満たしたうえで ASPD の全パターン最小が最大になる AGI・DEX・INT。DEX を1ずつ動かし、INT は詠唱に要る最小、残りの予算を AGI に)を「いまと同じポイントで」「余りのポイントも使って」の2通りで出し、`stpCheck` でラトリオの計算で確かめる。`stpSurplus` = 詠唱の値が530を超える分の案内。③「支援・アイテム・スキル」と同期したスイッチ(`stpBuffHtml`。`SIMC_QUICK` の3つ)。④配置: 基本ステータス | 特性ステータスは元の横並び(縦並びは狭かった)、シミュレーターは全幅(`.stpmainw` = 左ステッパー・右結果)
  - v2.44.1: ポーション(`STP_POTS`。`m.status.speedPot` 0〜3 = なし/攻撃速度増加(スピードアップ)/ハイスピード/バーサーク。ASPD の式の T に 10/15/20% として入る。ほかの支援(OTP・ガラナキャンディ・期間限定食品)とは大きいほうが採用される)の排他選択を `stpBuffHtml` の上に。「支援・アイテム・スキル」の一覧には無い(モデルの `status.speedPot` が唯一の持ち主)
  - **まだ(次の候補)**: ステータス条件つきの装備効果(「STR77以上で…」など)の一覧と、「あと何ptで効果が出る」表示。ラトリオの補助情報(種類12)に「←前値|判定|次値→」のスキル倍率の閾値表があり使えそう。優先度(MHP・状態異常耐性・重量)ごとの自動配分は未(いまは +10 の効果表で判断)。MHP や特性ステータス(POW/SPL など)のポイントの効率は未検証
- **v2.42.0 装備スロット(A・B…)は「箱」・自動の名前に盾(利用者の指示)**: 装備セットは中身のハッシュの ID で、上書き(`register_set(sid, take)`)すると記号が新しい ID に移る。キャラスロット(`SIMC.chars`)は `foxSet`(ID)の他に **記号 `foxSetTag` / `foxShadowTag`** を覚え、`simcFollowBoxes()`(`renderSim` の先頭で毎回。ENG が使えるときだけ)が、記号が指す最新の中身(`simcBoxLatest`)に全キャラスロットを自動で着せ替える(`simcApplyFrag` / `simcWear`)。**追従は「変更」に数えない**(`c.saved` も更新して＊を付けない)。**未保存の変更(＊ = `simcDirty`)がある枠は追従しない**(作業中を守る。`simcSetTabs` に「Aの中身が更新されています」)。非カレントの枠は `simcPutSlot(id)` で保存。確認: 2つのキャラスロットを A で作り、片方で精錬を変えて A を上書き → もう片方が自動で追従(＊なし)・未保存の変更がある枠は追従せず注意が出る。**まだ**: 箱を編集したら自動で上書きする(自動保存)はしていない(上書きは今までどおり手動)。被ダメ記録など、箱を使うほかの画面は、もともと記号で表示しているので追従済み
  - `char_core._auto_names`: bits=(2,16,32,4) = 武器/鎧/盾/肩。盾(32・シャドウは 262144)は「属性(鎧の属性が変わる盾のとき) + いちばん高い耐性」の両方を `・` でつなぐ(例 `+4ﾃﾞｲｳ地風毒聖念20`: 属性なし・耐性のみ。片方だけならその片方)
- **v2.41.3 【習】装備(利用者: 【習】は習得スキルのレベルで効果が変わる装備なので考慮して)**: 【習】はラトリオが付ける印(`equip-name.js` の `IsLearnedEffectEquipable`。効果が「◯◯の習得Lvが上がる度に…」)。習得スキルは装備セットに入っておらず、モデルの `learnedSkill`(`simcApplySkills` がゲームのキャラのスキルを入れる)を使うので、**着せ替えても習得スキルは「いまのキャラのもの」のまま**=意図どおり。確認: Fox_Thirteen の習得スキル 64個が全部ラトリオの習得スキルに対応・入っている。`simcLearnedList(m)`(装備・カードの【習】を判定)/`simcLearnedCount(m)`(入っている習得スキルの数)。維持の表の行に「習 N」、枠の上に【習】装備の一覧と習得スキルの個数(0個なら警告)
- **v2.41.0 装備パターンまわりの使い勝手(利用者の指摘4点)**: ①「未装備 N」の中身: `simcWear` が返す行(slot・name・region・gameId・isCard)を `simcOptSets` が `missRows` に持ち、維持の表に `simcMissHtml`(「入らなかった: 左手 +4 デイヴィッドシールド 選ぶ」)。「選ぶ」(`data-kfix`。document の click 委譲)= `pickOpen` で候補を選び `SETTINGS.ratLinks[gameId]` に保存 → `SIMC.keep = null` で再計算。比べる(`simcCmpHead`)にも同じ一覧。②支援のスイッチ: `.bfi.sw`(`.swt` がつまみ)。`simcRelHtml`(ASPD・詠唱・ディレイなどに効く支援の一覧)は `SIMC_QUICK`(濃縮サラマインジュース・ブレッシング・速度増加)を先頭に。(画面の上の専用の「よく使う支援」枠は v2.41.1 で削除)。**「比べる」(`SIMC.cmp`)は複数選べる(最大5)**。③「いちばん余る振り方」: 候補の表に「余るポイント」(= いま残り − (この振り方に使う − いま使っている))と、その分で STR/VIT/LUK をどこまで上げられるか(`roomFor`)。④色の枠(**v2.42.1 で「画面全体の大枠」から「項目(枠)ごと」に変更**。利用者の指示): `simcFold` が `SIMC_FOLDCOL` の枠(res/key/opt/resist/x/sb = 装備セット+シャドウ、eq = メイン、sh = シャドウ、key/resist/x は「比べる」で選んだ装備スロットの色も足す)の縁を `.setframe` + `simcGrad`(色を等分した斜めのしま。1色ならその色、2色なら半分ずつ)で色づけ(`simcFoldColors`)。維持の表は選んだパターンの色(`simcOptColors`)の枠 `.setframe` と、行の丸印(`.setdot`)
- **v2.40.1 計算の軽量化(利用者: ラトリオの計算はレスポンスが悪い)**: **実測(Fox_Thirteen。装備10・カード34・シャドウ6)**: ラトリオの計算(`calcCoreFromModel`)は1回 約90ms。装備を外すと12ms・カードを外すと51ms → **時間は装備・カード(エンチャント)の数にほぼ比例**し、ラトリオの中身なので外から縮められない(画面の描画は 25ms・HTML の組み立ては 1ms 未満で、遅さの原因ではない)。重さの正体は「計算の回数」: ステータスを1つ触ると、同期の計算1回(`recalc`)のあと、裏で `simcNeedKick`(AGI・DEX の必要な値。13回前後)と `simcKeepKick`(維持の表。パターン数×1回)が走っていた(計15回=1.4秒)。
  → ①`engCalc` は結果を `ENG.calcCache`(Map・最大80件・`ENG.cache = {}` のときに空にする)に覚える。**`engCalcCached(model, xkinds)` は覚えていれば計算せず返す**(結果だけ読む探索・表用。**返した結果は書きかえない**。`engAttackMethods` のように「計算係の中の状態を model に合わせたい」ところは必ず `engCalc`(毎回計算)を使う) ②`simcNeedKick` は 250ms→1秒待ってから。**前の答えを手がかりに**(`simcGallop`: 手がかりから広げて探す。INT などを触っただけなら答えは同じなので 2 回前後)。③`simcKeepKick` は 0.7 秒待ってから(`simcKeepRun`)。「いまの装備」は recalc の結果を覚えているので計算しない。結果: 1回の編集で裏の計算 約15回→約4回。
  → まだ: 「探す」(`simcOptRun`)は 1パターンあたり 80回前後(約8秒)・16パターンで約2分。探索を賢くする(ASPD は AGI・DEX の式で決まるので、数点を測って内挿する)のは、見逃しの危険があるので未。計算をページの外(Worker)に出すのは、ラトリオがページ内の部品を使うため未調査。
- **v2.40.0 ASPD・無詠唱の維持(利用者の指示: 「ステ振りの相談」と「装備セットごとの確認」は役割が同じなので統合)**: 枠 `opt` 1つ(旧 `multi` の枠・`simcMulti*`・`simcMinStat` は削除)。上半分 = `simcKeepKick`/`simcKeepTable`(選んだ装備スロット × シャドウのスロット = `simcOptSets` の全部を、いまのステータス・支援のまま着せて `engCalc` した ASPD・詠唱の値・変動/固定詠唱・ディレイ・HP と、目標に対する「維持できる/あと◯」)。下半分 = 従来の「いちばん安い振り方を探す」(`simcOptRun`)。**想定する支援・ステータス補正込みで、実際に着ているときと同じ状態で出す**のが目的(ラトリオの計算なので、装備の ASPD・詠唱の効果・セット効果・エンチャント・カード・ランダムオプション・精錬は入る)。候補の表に、サンドバックマンの設定のメインスキルのダメージ(`simcSbAvg`。INT を下げたときの影響。サンドバックマンはもともと「INT を極端に下げたときの影響を簡易に測る」ために作った)を並べる。`SIMC_QUICK` = 画面の上の「よく使う支援」(濃縮サラマインジュース = buff7:22 / ブレッシング = confIchizi:0 / 速度増加 = confIchizi:1。支援の枠と同じ値を動かす)。以前の「193 に要る AGI だけ/DEX だけ」の列は無くした(探す結果に統合)
- **v2.38.0 ランダムオプション**(`simcWearRnd`。キャラシミュへ反映するとき、`simcWear` の装備ごとに呼ぶ):
  - 対応表 = `calc_data.json` の `rndopt`(`tools/make_rndopt_map.py <ラトリオ>` が `option_names.json` の日本語の型から作る)。`game` = ゲームの番号 → ラトリオの効果の種類(SPID)(170件)、`rat` = ラトリオの選択肢ID → [SPID,最小,最大,きざみ]、`unmapped` = ラトリオに無い(79件。ATK%・MATK%・属性の付与・属性の敵から受ける魔法・属性魔法ダメージ・経験値・全属性耐性 など)
  - **ラトリオは同じ SPID でも値の範囲ごとに別の選択肢**(例 STR+ は最大 200/20/10/3 の4つ)。枠の候補(`simcRndKinds(リスト番号)`)から「SPID が同じで、値が 最小〜最大(きざみ)に入る」もののうち最大が小さいものを選ぶ。1つの枠には1つ。入らないものは `SIMC.report.rndMiss`(「入らなかった」と画面に出す)
  - ふつうの装備 → `model.foxRnd[場所]`、シャドウ → `model.shadowEquip.rndOpt[場所]`(`simcRndArr`)。ラトリオの装備にランダムオプションの枠が無い装備(`simcRndLists` が空)は全部「入らなかった」
  - 確認: Fox_Thirteen のシャドウ(DEX+3・MaxHP+50・HP自然回復+1%・LUK+1・SPL+3)が全部入り、外した場合とステータス・ダメージが変わることを確認ずみ。本物のデータにはふつうの装備のランダムオプションが無く、ふつうの装備側は合成データで確認(杖に ATK+10 → 入る)
  - まだ: ラトリオの「装備」タブ側(`ratFill`、app.html の `CALC.report`)はまだ入れない。実測(サンドバックマン)との差が縮むかは、ランダムオプション付きの装備のキャラでの再測定が要る
- **v2.39.0 与ダメシミュ**(利用者の依頼。サブタブ `SIMV = "atk"` = `renderAtkTab`。キャラは「いま開いているスロット」`simcCur()`):
  - 敵: ラトリオの本物のモンスター(`monster/monster.dat.js` の `MonsterObjNew` 約2500体。`atkMons`)を名前・かなで検索。**`engSandbag(model, {mobId}, mt)`** は `cfg.mobId` があると手入力モンスター(929)ではなく `GetMonsterId = () => mobId` で本物の敵を使う(サンドバックマンの計算と同じ関数。終わったら全部戻す)。スキルは `engAttackMethods` + `sbChain`(サンドバックマンと共通)
  - **ランダム発動の時限効果**(`ATK_FX`。利用者の依頼: ラトリオにオンオフが無い。**物理と魔法で分ける**): `confCustomStatus` / `confCustomAtk` / `confCustomSpecStatus`(ラトリオの「性能カスタマイズ」。番号 = 画面の並び。`ATK_FIELDS`)に足して計算する(`mt.fx` = [[欄, 番号, 足す値(, "B")]]。`engSandbag` が model の複製に足す)。中身はラトリオ card.dat.js の説明文(「一定確率で◯秒間」のエンチャント124種のうち、ダメージ・速度に効く約35種)。**ラトリオの「ボス／一般」の欄(confCustomAtk 22・23)は、ボスにも一般にも同じだけ効く(実測: 魔法+100 → ボス・一般どちらも2倍)** ので、「ボスだけ」の効果(豪傑・真理の解放)は4つ目 "B" を付けて、敵がボスのときだけ足す(`atkFxApplied(ids, boss)`)
  - 技が物理か魔法かは、物理ダメージ+100% / 魔法ダメージ+100% を足して数字が動くほうで判定(`atkKind`。結果は `ENG.cache`)。効果の kind(p/m/b)が技と合わないものは薄くして計算に入れない
  - 「根源の魔力」はラトリオのデータに見つからなかった(名前違いか未収録)ので、画面の「自分で効果を追加」(`SETTINGS.atkFx.custom`)で入れてもらう。オン状態は `SETTINGS.atkFx.on`(サーバーに保存)
  - グラフの代わり: 横棒(`.abar`)。「時限効果ごとの上がり幅」(1つ外したときとの差)と「スキルの比較」(`atkRank` = 各スキルを最大Lv・ほかの設定は初期値で計算。1回/1秒切りかえ。バーを押すとそのスキルを選ぶ)
  - 確認: EM(Fox_Thirteen)で 悪夢のバフォメット(ボス)/.Jr(一般) に、INT+200・魔法ダメージ+100%・MATK+150 を足して数字が動く・計算の前後で `engCalc` の結果が同じ(隠れた状態を残さない)ことを確認ずみ。**物理職での確認(物理の時限効果・ボス欄)は未**。ダメージの絶対値の実測との照合も未
  - まだ: 被ダメ記録からの連携(そのときのキャラ・装備・敵・技を入れる)、敵の状態異常・耐性(`mobConf*`)、時限効果の発動率・持続時間を使った期待値、効果の一括保存(プリセット)
- 残り: ~~5 ダメージ・被ダメとの連携~~(済)。与ダメージ(攻撃側)の計算はまだ(被ダメの記録から、そのときのキャラ・装備・敵・技を計算機に入れる)。ほかに 性能カスタマイズ・時限効果・オートスペル、二刀流の左手、シャドウのエンチャント、Fox のランダムオプション → ラトリオの番号
- 第3段階への利用者の注文(済): 数が多いので目的別のタブ。加えて、**他職の支援はフィルター(絞り込み)と検索窓を付ける**
- 残り(2 は v2.21.0 で済み): 2 装備の編集(プルダウン・検索)と Fox のキャラ/装備セットの取り込み、3 支援・アイテムのオンオフ(数が多いので目的別のタブ・検索・オンのものだけ表示・よく使う組み合わせ)、
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
`設定.json` `表示の設定.json`(画面の設定。`ignoreServers` も) `サーバー.json` `md_state.json` `char_state.json` `被ダメ記録.json` `被ダメ_確認用データ.json` `スキル名の手直し.json` `アイテム名の手直し.json` `計算機のキャラ.json` `公式モンスター.json`(公式サイトから集めた、その PC だけのデータ。配らない) `ラトリオ/`(取り込んだ計算機) `動作ログ.txt` `アップデートログ.txt`

## テストのしかた
- `python -m pyflakes *.py`、app.html の `<script>` を取り出して `node --check`
- 画面(おすすめは上の `tools/ui_test_server.py`): md_tracker を import → `md_core.MDCore` にダミーのキャラ・通信を流す → `start_live_server` → Playwright(Chromium)で操作・スクショ
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
