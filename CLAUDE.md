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
