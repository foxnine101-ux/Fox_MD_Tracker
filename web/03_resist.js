"use strict";
// ===== MD耐性(共通部品) =====
const RESIST_SHEET_DEFAULT = "1AFcb8-JhY5tklH2j-NntGX6ZvSmzix3GYTC6UaVVseA";
const RESIST_HEAD = ["MD名", "判定キー(マップ名/MD内部名)", "場面", "鎧", "肩", "鎧の備考(反射・破損など)", "肩の備考(耐性%など)", "状態異常・その他", "ボス・注意点", "メモ", "信頼度", "出典"];
const RESIST_DEFAULT = [["ゲフェン夜間闘技場", "夜間闘技場, 夜間", "ノーマル1-6戦目", "", "", "", "", "特に指定なし", "戦ごとに属性が異なる", "N/Hで分けて記載。ハード8/10戦目はfukoto未記載、ro-eagleより", "高", "https://fukoto.com/ragnarokonline-attribute-resistance/"], ["ゲフェン夜間闘技場", "", "ノーマル7戦目(ハゼ)", "聖鎧", "", "", "", "", "", "", "", ""], ["ゲフェン夜間闘技場", "", "ノーマル9戦目(ユメヒメ)", "", "念肩", "", "念耐性95%", "", "", "", "", ""], ["ゲフェン夜間闘技場", "", "ノーマル10戦目(フェンリル)", "聖鎧", "水肩", "", "水耐性75%以上", "無属性耐性", "", "", "", ""], ["ゲフェン夜間闘技場", "", "ハード5戦目(フェモン)", "念鎧", "", "", "", "", "", "", "", ""], ["ゲフェン夜間闘技場", "", "ハード6戦目(黒魔)", "念鎧", "念肩", "", "", "SP回復剤", "", "", "", ""], ["ゲフェン夜間闘技場", "", "ハード7戦目(レチェニエ)", "聖鎧", "念肩", "", "念耐性95%", "沈黙・睡眠対策", "", "", "", ""], ["ゲフェン夜間闘技場", "", "ハード8戦目(ジュー)", "聖鎧", "", "", "", "", "", "", "", ""], ["ゲフェン夜間闘技場", "", "ハード9戦目(カナビアン)", "念鎧", "念肩", "", "念耐性95%", "火レジストポーション", "", "", "", ""], ["ゲフェン夜間闘技場", "", "ハード10戦目(ディワイ)", "念鎧", "念肩", "反射耐性100%", "念耐性95%", "", "", "", "", ""], ["保安区域(ノーマル)", "security area, herbs2", "ボス前", "", "地肩", "", "", "", "ボスは闇GX(グランドクロス系)", "道中はspicaでは念鎧。miohapiは念鎧聖肩(抽出不安定)", "高", "https://fukoto.com/ragnarokonline-attribute-resistance/"], ["保安区域(ノーマル)", "", "ボス戦", "闇鎧", "聖肩", "", "聖耐性90%程度", "", "", "", "", ""], ["保安区域(ハード)", "2nd security area, herbs3", "ボス前", "地鎧", "念肩", "", "", "地耐性", "ボスは念攻撃主体+闇", "道中鎧はfukoto地鎧/spica念鎧で割れる。ボス闇鎧念肩は複数一致(naonaoo 23/11は毒鎧+念肩も可)", "高", "https://fukoto.com/ragnarokonline-attribute-resistance/"], ["保安区域(ハード)", "", "ボス戦", "闇鎧", "念肩", "", "念耐性90%程度", "", "", "", "", ""], ["水上植物園(ノーマル)", "", "ボス前", "聖鎧", "水肩", "", "", "凍結耐性", "", "", "高", "https://fukoto.com/ragnarokonline-attribute-resistance/"], ["水上植物園(ノーマル)", "", "ボス戦", "毒鎧", "聖肩", "", "", "", "", "", "", ""], ["水上植物園(ハード)", "", "ボス前", "聖鎧", "水肩", "", "", "凍結耐性(アンフロ)", "ボスは念攻撃", "", "高", "https://fukoto.com/ragnarokonline-attribute-resistance/"], ["水上植物園(ハード)", "", "ボス戦", "聖鎧", "念肩", "", "", "長引くなら水耐性", "", "", "", ""], ["聖域セスルムニル", "セスルムニル", "ボス前", "念鎧", "", "クリティカルスラッシュ対策", "", "", "ボス後半に火攻撃", "spicaは念鎧念肩・ラスボスはSWで可と記載(少数意見)", "高", "https://fukoto.com/ragnarokonline-attribute-resistance/"], ["聖域セスルムニル", "", "ボス戦", "毒鎧", "火肩", "", "", "火耐性重要", "", "", "", ""], ["飛行船墜落地", "airship_crash_point, 墜落", "全体", "毒鎧", "念肩", "破損(鎧破壊)対策", "念耐性80%以上", "", "ボスが鎧破壊を使う", "", "高", "https://fukoto.com/ragnarokonline-attribute-resistance/"], ["飛行船破壊作戦", "whl, 破壊作戦", "全体", "毒鎧", "聖肩", "", "聖耐性95%", "", "毒・聖攻撃が標準", "", "高", "https://fukoto.com/ragnarokonline-attribute-resistance/"], ["飛行船襲撃", "", "ボス戦", "", "火肩", "", "", "", "ワイバーン闇4/ペルロック闇2。敵は風・闇属性中心", "darayukuの必要耐性欄に「火」のみ(鎧/耐性どちらの欄か判別不能)。ペルロックのソウルブレイカー注意", "低", "https://darayuku.exblog.jp/243952915/"], ["シミュレーション戦闘", "jca_1, jca_2, シミュ", "全体", "念鎧", "聖肩", "", "聖耐性95%(最低90)", "精神衝撃(固定詠唱)対策、詠唱妨害不可", "", "", "高", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["欺瞞の別荘", "Villa of Deception, advs", "MAP1-3", "聖鎧", "念肩", "", "", "マンドラ(状態異常)対策", "", "状態異常対策を多めに", "高", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["欺瞞の別荘", "", "ボス戦", "念鎧", "聖肩", "", "", "", "", "", "", ""], ["悔恨の墓", "spa2", "MAP1", "毒鎧", "聖肩", "", "", "念肩も併用(聖念肩)、ノックバック耐性", "", "MAP1は毒服(毒鎧)。3MAP目はromechaでは毒鎧+聖念肩", "高", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["悔恨の墓", "", "MAP2(姫)", "念鎧", "毒肩", "", "", "スタン対策(VIT120)", "", "", "", ""], ["悔恨の墓", "", "MAP3", "毒鎧", "念肩", "", "", "", "", "", "", ""], ["悔恨の墓", "", "ボス戦(サクライ)", "念鎧", "毒肩", "", "", "石化耐性、ウエポン等コート、STA100", "", "", "", ""], ["封じられた不死者", "", "全体", "念鎧", "毒肩", "", "毒耐性110-120%(STA100未満時)", "狂乱対策、HIT1400程度", "ボス(ラスガンド)は毒耐性を下げる毒攻撃", "", "高", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["変えられない最後", "変えられない運命", "全体", "念鎧", "火肩", "ストリップヘルム対策", "", "闇耐性、精神衝撃対策、狂乱対策", "", "naonaooのみ。公式の「最後の部屋」(Lv140MD、火・風耐性)とは別物", "中", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["星座の塔", "ct*", "全体", "聖鎧", "念肩", "", "", "毒霧は回避、石化対策(50F付近から)", "", "代替: 毒鎧+聖耐性(naonaoo富裕層案)、lawcemelo(2026)は毒鎧メインでナハト以降念鎧", "中", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["星座の塔", "", "ナハト以降", "念鎧", "", "", "", "キリングオーラ対策", "", "", "", ""], ["夢幻の迷宮", "Labyrinth of Phantom, le100, 異形の迷宮, 幻影の迷宮", "異形10F(ロードオブデス)", "毒鎧", "", "", "", "", "階層ボスごとに属性が違う", "異形の迷宮の情報(2019年記事、95%上限化前)。試練は別項目", "低", "https://ro.dewassyoi.com/labyrinth/variant-boss/"], ["夢幻の迷宮", "", "異形40F(オークロード)", "", "", "", "", "ゴス服", "", "", "", ""], ["夢幻の迷宮", "", "異形50F(ミストレス)", "", "風肩", "", "風耐性100%", "ノックバック耐性", "", "", "", ""], ["夢幻の迷宮", "", "異形55F(シーラカンス)", "", "水肩", "", "水耐性100%", "ゴス服、石化耐性", "", "", "", ""], ["夢幻の迷宮", "", "異形60F(カトリーヌ)", "", "火肩", "", "火耐性95%", "", "", "", "", ""], ["呪われた次元（4th）", "ghc*, 呪われた次元, GHC4th", "全体", "毒鎧", "聖肩", "", "聖耐性95%(RoG対策)、毒耐性95%", "石化耐性、凍結耐性、詠唱妨害不可", "毒床(クラウドキル)・Mレイオブジェネシス", "ストリップウェポンあり(ro-challenge)", "中", "https://sumizakki.hatenablog.com/entry/2024/06/15/041330"], ["生命の殿堂", "", "MAP1-3", "毒鎧", "聖肩", "", "", "念肩併用(聖念肩)、スタン耐性、石化耐性", "リゲル: キリング+Mクラウドキル", "lawcemeloはボス念鎧+毒肩を基本形とする", "中", "https://ameblo.jp/romecha/entry-12961528194.html"], ["生命の殿堂", "", "MAP4(春)", "", "念肩", "", "", "", "", "", "", ""], ["生命の殿堂", "", "MAP4(夏)", "", "毒肩", "", "", "テトラ対策", "", "", "", ""], ["生命の殿堂", "", "MAP4(秋)", "", "聖肩", "", "", "", "", "", "", ""], ["生命の殿堂", "", "MAP4(冬)", "", "毒肩", "", "", "", "", "", "", ""], ["生命の殿堂", "", "ボス戦(春)", "念鎧", "念肩", "", "", "金盾", "", "", "", ""], ["生命の殿堂", "", "ボス戦(夏・冬)", "念鎧", "毒肩", "", "", "金盾", "", "", "", ""], ["生命の殿堂", "", "ボス戦(秋)", "念鎧", "聖肩", "", "", "金盾", "", "", "", ""], ["生命の殿堂", "", "ボス戦共通", "", "", "物理反射注意", "", "スタン・石化対策、頭・武器脱衣→コート", "", "", "", ""], ["特異点 名もなき島", "名もなき島, 名無し", "道中", "毒鎧", "聖肩", "", "念耐性95%", "スタン・沈黙対策、凍結・石化無効、Mレイオブジェネシス対策、ディレイカット(スロースキル)", "", "不死鎧はコラプトアンデッドがあるため不可(helldhuran)。強毒あり", "中", "https://naonaoo.hatenablog.com/entry/2025/06/11/060652"], ["特異点 名もなき島", "", "ボス戦", "念鎧", "", "", "", "キリングオーラ対策", "", "", "", ""], ["特異点 生体工学研究所", "特異点 生体", "第7区画", "念鎧", "", "", "", "", "", "1記事のみ・区画一部のみ。EDDA生体4thモード(念鎧+聖肩)とは別コンテンツ", "低", "https://helldhuran.hatenablog.com/entry/2025/11/26/165543"], ["特異点 生体工学研究所", "", "第8区画", "聖鎧", "", "反射対策", "", "", "", "", "", ""], ["特異点 タナトスタワー", "", "", "", "", "", "", "", "", "具体的な耐性情報が見つからず", "低", ""], ["浸食されたゲフェニア", "", "東部", "念鎧", "聖肩", "", "", "スタン・石化対策、鎧脱衣対策", "東部は聖攻撃(ホーリークロス等)が痛い", "MDではなく30分制限の挑戦ダンジョン", "中", "https://naonaoo.hatenablog.com/entry/2026/03/10/153058"], ["浸食されたゲフェニア", "", "西部", "念鎧", "闇肩+毒肩", "", "", "代替: 毒鎧+闇肩+無耐性、頭脱衣対策、スタン対策、Mクラウドキル", "", "", "", ""], ["破壊されたヴァルキリーレルム", "", "全体", "念鎧", "毒肩", "Mリフレクトダメージ(反射)対策", "", "代替: 毒鎧+無肩", "", "MDではなく30分制限の挑戦ダンジョン。1出典のみ", "低", "https://naonaoo.hatenablog.com/entry/2026/03/10/153058"], ["バルムントのバイオスフィア", "バイオスフィア, 標本環境", "死屍", "念鎧", "念肩", "", "", "", "エリアごとに異なる", "miohapiのみ・取得結果が不安定だったため要確認", "低", "https://miohapi.com/zokusei-soubi01/"], ["バルムントのバイオスフィア", "", "聖殿", "聖鎧", "念肩", "", "", "", "", "", "", ""], ["バルムントのバイオスフィア", "", "猛毒", "毒鎧", "毒肩", "", "", "", "", "", "", ""], ["バルムントのバイオスフィア", "", "霊魂", "念鎧", "念肩", "", "", "", "", "", "", ""], ["バルムントのバイオスフィア", "", "氷河", "", "", "", "", "精神衝撃・スローキャスト・ディスペル注意", "", "", "", ""], ["べたつく海", "slug", "全体", "念鎧", "毒肩", "", "", "", "", "武器は風付与推奨", "高", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["バルター号捜索", "wtgsb, 旧バルター号捜索, 旧バルター号捜索", "全体", "毒鎧", "闇肩", "", "", "", "", "", "高", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["魔神殿", "", "ブリナラネア戦", "", "水肩", "", "", "耐性不足なら風アンフロ鎧", "ブリナラ水/ムスペル火/モロクは風範囲+EQ", "", "中", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["魔神殿", "", "ムスペルスコール戦", "", "火肩", "", "火耐性60%以上", "獄炎呪対策(永久霜)", "", "", "", ""], ["魔神殿", "", "モロク戦", "念鎧", "風肩", "", "風耐性40%以上", "ゴス服", "", "", "", ""], ["グラストヘイムの没落", "GH没落", "道中", "", "聖肩", "", "", "凍結対策(フロストダイバー)", "呪いを呑み込んだ王: 聖4", "", "中", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["グラストヘイムの没落", "", "ボス戦", "", "聖肩+火肩", "", "", "石化対策(石化で地属性化)", "", "", "", ""], ["コルメモリアル", "コル", "ボス戦", "", "火肩", "", "", "念耐性、沈黙対策、火レジストポーション", "EL-A17T: 火4、念属性攻撃あり", "念鎧・不死鎧は避ける(darayuku)。ボスへは水属性武器", "中", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["ヘイ！スウィーティ！", "スウィーティ", "全体", "念鎧", "念肩", "クリティカルスラッシュ対策", "", "呪い対策、ギミック回避", "", "", "高", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["ヴェルナーの痕跡", "ヴェルナー研究所, ヴェルナー研究所中央室", "道中", "闇鎧", "", "", "", "", "セイレン念1/CUTIE闇2", "darayukuはボス闇鎧+火耐性", "中", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["ヴェルナーの痕跡", "", "ボス戦", "念鎧", "火肩", "", "", "DEF無視、ノックバック無効があると楽", "", "", "", ""], ["試練の迷宮/夢幻の迷宮", "試練の迷宮", "バフォメット", "闇鎧", "風肩", "", "", "風75%以上", "", "dewassyoiは2019年記事(上限95%化前)", "中", "https://naonaoo.hatenablog.com/entry/2023/01/06/192731"], ["試練の迷宮/夢幻の迷宮", "", "イフリート", "", "火肩", "", "", "火100%、ゴス服、ノックバック耐性", "", "", "", ""], ["試練の迷宮/夢幻の迷宮", "", "ジェジェリン/タートルジェネラル", "闇鎧", "水肩", "", "", "", "", "", "", ""], ["試練の迷宮/夢幻の迷宮", "", "オシリス", "闇鎧", "", "", "", "ノックバック耐性", "", "", "", ""], ["試練の迷宮/夢幻の迷宮", "", "シーラカンス", "", "水肩", "", "", "水100%", "", "", "", ""], ["試練の迷宮/夢幻の迷宮", "", "ルキフル", "毒鎧", "念肩", "", "水・念・毒耐性100%(壁)", "武器闇付与", "", "", "", ""], ["サラの記憶", "", "ボス戦", "", "", "", "", "無属性耐性", "大長老アイリン: 無1、素殴りのみ", "1出典", "低", "https://darayuku.exblog.jp/243589930/"], ["フェンリルとサラ", "FS", "道中", "火鎧", "", "", "", "火耐性", "サラ: 火・風魔法、後半闇化", "", "中", "https://ro-challenge.blog.jp/archives/1076135645.html"], ["フェンリルとサラ", "", "ボス戦", "風鎧", "火肩", "", "火耐性50-80%", "風耐性、石化注意(地属性化→メテオ)", "", "", "", ""], ["ゲフェン魔法大会", "", "全体", "", "", "", "", "凍結注意(フロストダイバー→サンダーストーム)", "", "耐性装備の明記なし", "低", "https://ro-challenge.blog.jp/archives/1057804776.html"], ["呪いの剣士", "Cursed Knight", "全体", "闇鎧", "地肩", "", "", "グランドダークネス/ダーククロス無効化", "ボス地3。敵は不死・闇中心(火3・風3も)", "", "中", "https://ro-challenge.blog.jp/archives/1076002984.html"], ["ホラーおもちゃ工場", "", "ボス戦", "不死鎧", "闇肩", "", "", "ノックバック対策、無属性耐性", "セリーヌ・キミ: 念1、闇JTで吹き飛ばし", "不死鎧はイビルドルイドカード服(mm1re)", "中", "https://darayuku.exblog.jp/243890042/"], ["悪夢のジターバグ", "ジターバグ", "なだらかな道", "火鎧", "", "", "", "火耐性", "ジターバグ: 不死2-3", "", "中", "https://darayuku.exblog.jp/244772469/"], ["悪夢のジターバグ", "", "険しい道", "闇鎧", "風肩", "", "", "凍結対策", "", "", "", ""], ["永劫の戦", "", "道中", "", "", "", "", "石化対策", "エレメス毒/ハワード水/マーガレッタ聖/カトリーヌ念、各状態異常(睡眠・スタン・沈黙・呪い)", "出典表で「風」が鎧欄か耐性欄か判別不能", "低", "https://darayuku.exblog.jp/243907596/"], ["永劫の戦", "", "ボス戦", "", "風肩", "", "", "凍結対策(凍結→JTコンボ)", "", "", "", ""], ["絶望の神", "", "", "", "", "", "", "", "", "単独MDとしての耐性情報なし。魔神殿のモロク戦は「魔神殿」参照", "低", ""], ["モルスの洞窟", "", "", "", "", "", "", "", "", "アンデッド多数・呪いトラップの記述のみ", "低", ""], ["ビオスの島", "", "ボス戦", "闇鎧", "火肩", "", "", "不死鎧も可、火or闇耐性", "死神アンク: 不死4、火・闇攻撃", "1出典", "低", "https://rolog.blog.jp/archives/19966220.html"], ["地下排水路", "", "お掃除エキスパート", "風鎧", "水肩", "", "", "凍結耐性、風耐性(6点盛り以上)、石化耐性(ギガミックス盛り)", "水・風攻撃(東西で属性が分かれる)", "", "中", "https://ro-challenge.blog.jp/archives/1077201279.html"], ["ファロス燈台地下迷宮", "infi, ファロス", "一般Mob", "闇鎧", "", "", "", "", "", "", "中", "https://mm1re.net/ro1-42/9255/"], ["ファロス燈台地下迷宮", "", "全体", "", "", "魔法反射対策、ストリップ対策(コート)", "ボスごとに水/火/地/念/聖/風耐性95%", "毒服(毒鎧)必須の場面あり、ゴス服(無)", "", "", "", ""], ["オズの迷路", "", "02", "念鎧", "", "ストリップヘルム注意", "", "", "敵は火1中心", "MDではなくフィールド", "中", "https://spica.tokyo.jp/spica_ro/professor/9933/"], ["古代神殿アケト", "アケト", "全体", "毒鎧", "闇肩", "", "", "火耐性", "", "", "中", "https://spica.tokyo.jp/spica_ro/study/equip/8547/"], ["ニブルヘイムカボチャ農場", "カボチャ農場", "全体", "毒鎧", "闇肩", "", "", "", "", "", "中", "https://spica.tokyo.jp/spica_ro/study/equip/8547/"], ["貯蔵庫タルタロス", "タルタロス", "下層", "火鎧", "", "", "", "", "", "1出典", "低", "https://spica.tokyo.jp/spica_ro/professor/9933/"], ["フェイスワームの巣", "", "第3エリア", "火鎧", "", "", "", "自爆対策", "女王: SG・LoV・EQ使用", "1出典", "低", "https://moco.mints.ne.jp/ro/freo/index.php/view/251"], ["フェイスワームの巣", "", "第4エリア", "毒鎧", "", "", "", "毒沼対策(不死鎧も可)", "", "", "", ""]];
// シートのURL/IDから CSV のURLを作る
function resistCsvUrl(s) {
  s = String(s || "").trim();
  if (!s) return "";
  if (/output=csv|tqx=out:csv/.test(s)) return s;
  const m = s.match(/\/d\/(e\/)?([\w-]{20,})/) || s.match(/^()([\w-]{20,})$/);
  if (!m) return "";
  if (m[1]) return `https://docs.google.com/spreadsheets/d/e/${m[2]}/pub?output=csv`;
  const id = m[2];
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent("MD耐性")}`;
}
function parseCSV(t) {
  const out = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); out.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}
// 表(1行目=見出し) → 項目名で読む。列の順番が入れ替わってもOK
function resistFromTable(tbl) {
  if (!tbl.length) return [];
  const head = tbl[0].map((x) => x.trim());
  const col = (name) => { const k = name.replace(/\(.*$/, ""); return head.findIndex((h) => h === name || h.replace(/\(.*$/, "") === k); };
  const ix = RESIST_HEAD.map(col);
  if (ix[0] < 0) throw new Error("見出し「MD名」が見つかりません");
  return tbl.slice(1).map((r) => ix.map((i) => (i >= 0 ? (r[i] || "").trim() : ""))).filter((r) => r.some((x) => x));
}
// 行 → MDごとにまとめる
function resistEntries(rows) {
  const M = new Map(); let last = null;
  for (const r of rows) {
    const name = r[0] || (last && last.name) || "";
    if (!name) continue;
    let E = M.get(name);
    if (!E) { E = { name, keys: [], phases: [], boss: [], memo: [], conf: "", src: [] }; M.set(name, E); }
    last = E;
    for (const k of r[1].split(/[,、，]/)) if (k.trim()) E.keys.push(k.trim());
    if (r[2] || r[3] || r[4] || r[5] || r[6] || r[7]) E.phases.push({ when: r[2], armor: r[3], shoulder: r[4], anote: r[5], snote: r[6], other: r[7] });
    if (r[8]) E.boss.push(r[8]);
    if (r[9]) E.memo.push(r[9]);
    if (r[10]) E.conf = r[10];
    for (const u of r[11].split(/\s+/)) if (/^https?:/.test(u)) E.src.push(u);
  }
  return [...M.values()];
}
const rnorm = (s) => String(s || "").toLowerCase().replace(/[\s　_\-（）()]/g, "");
// いる場所(マップ名・MD内部名) → 該当MD。見つからなければ null
function resistMatch(entries, map, md) {
  const base = String(map || "").replace(/^.*@/, "").toLowerCase();
  const mdn = rnorm(md);
  const hit = (k) => {
    const kl = k.toLowerCase();
    if (kl.endsWith("*")) { const p = kl.slice(0, -1); return base.startsWith(p) || (mdn && mdn.startsWith(rnorm(p))); }
    if (base && base === kl) return true;
    const kn = rnorm(k);
    return !!(mdn && kn && (mdn === kn || (kn.length >= 4 && mdn.startsWith(kn)) || (mdn.length >= 6 && kn.startsWith(mdn))));
  };
  // MD内部名で先に探す(同じマップを使うMDがあるため) → マップ名
  for (const E of entries) if (mdn && [E.name, ...E.keys].some((k) => !k.endsWith("*") && rnorm(k) && (rnorm(k) === mdn || (rnorm(k).length >= 4 && mdn.startsWith(rnorm(k))) || (mdn.length >= 6 && rnorm(k).startsWith(mdn))))) return E;
  for (const E of entries) if (E.keys.some(hit)) return E;
  return null;
}
// MDの名前(クエスト名から作った名前など) → 該当MD
function resistFind(entries, name) {
  const n = rnorm(name);
  if (!n) return null;
  const all = (E) => [E.name, ...E.keys.filter((k) => !k.endsWith("*"))].map(rnorm).filter(Boolean);
  for (const E of entries) if (all(E).includes(n)) return E;
  for (const E of entries) if (all(E).some((k) => k.length >= 3 && (n.includes(k) || k.includes(n)))) return E;
  return null;
}
const EL_CLS = { 毒: "e-poi", 念: "e-gho", 聖: "e-hol", 闇: "e-dar", 火: "e-fir", 水: "e-wat", 風: "e-win", 地: "e-ear", 無: "e-neu", 不死: "e-und" };
function elBadge(s) {
  if (!s) return `<span class="rz-none">―</span>`;
  return String(s).split(/\s*(?:\/|／|・|\+|＋|、|,|\bor\b|または)\s*/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const k = Object.keys(EL_CLS).find((e) => x.startsWith(e));
    return `<span class="rz-b ${k ? EL_CLS[k] : ""}">${resc(x)}</span>`;
  }).join(" ");
}
const resc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function resistCard(E, opt = {}) {
  let h = `<div class="rz-card ${opt.hot ? "rz-hot" : ""}" data-rz="${resc(E.name)}">`;
  h += `<div class="rz-h"><b>${resc(E.name)}</b>${E.conf ? `<span class="rz-conf c-${resc(E.conf)}">信頼度 ${resc(E.conf)}</span>` : ""}${opt.extra || ""}</div>`;
  if (!E.phases.length) h += `<div class="rz-empty">まだ情報がありません（シートに書き足してね）</div>`;
  else {
    h += `<table class="rz-t"><thead><tr><th>場面</th><th>鎧</th><th>肩</th><th>備考</th></tr></thead><tbody>`;
    for (const p of E.phases) {
      const notes = [p.anote && `<span class="rz-n">鎧: ${resc(p.anote)}</span>`, p.snote && `<span class="rz-n">肩: ${resc(p.snote)}</span>`, p.other && `<span class="rz-n">${resc(p.other)}</span>`].filter(Boolean).join("");
      h += `<tr><td class="rz-w">${resc(p.when || "全体")}</td><td>${elBadge(p.armor)}</td><td>${elBadge(p.shoulder)}</td><td>${notes}</td></tr>`;
    }
    h += `</tbody></table>`;
  }
  if (E.boss.length) h += `<div class="rz-m">ボス・注意: ${resc(E.boss.join(" / "))}</div>`;
  if (E.memo.length && opt.memo !== false) h += `<div class="rz-m rz-memo">メモ: ${resc(E.memo.join(" / "))}</div>`;
  if (E.src.length && opt.src !== false) h += `<div class="rz-m rz-src">出典: ${E.src.map((u, i) => `<a href="${resc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(" ")}</div>`;
  if (opt.after) h += opt.after;
  return h + `</div>`;
}
const RESIST_CSS = `
.rz-card{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:10px 12px;margin-bottom:10px}
.rz-flash{animation:rzf 1.6s ease-out 2}@keyframes rzf{0%{box-shadow:0 0 0 6px rgba(59,91,219,.55)}100%{box-shadow:0 0 0 0 rgba(59,91,219,0)}}
.rz-hot{border:2px solid #3b5bdb;box-shadow:0 0 0 3px rgba(59,91,219,.15)}
.rz-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;font-size:15px}
.rz-conf{font-size:11px;border-radius:999px;padding:1px 8px;background:var(--line);color:var(--muted)}
.rz-conf.c-低{background:#fff3bf;color:#8a6d00}
.rz-t{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
.rz-t th:nth-child(2),.rz-t th:nth-child(3){width:6.5em}
.rz-t th{font-size:11px;color:var(--muted);text-align:left;font-weight:600;padding:4px 6px;border-bottom:1px solid var(--line);position:static;min-width:0;max-width:none;background:none}
.rz-t td{padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left;white-space:normal}
.rz-t tr:last-child td{border-bottom:0}
.rz-w{color:var(--muted);font-size:12px}
.rz-t th:first-child{width:9em}
.rz-n{display:inline-block;margin:0 6px 2px 0;font-size:12px}
.rz-n+.rz-n::before{content:"／ ";color:var(--muted)}
.rz-m{font-size:12px;color:var(--muted);margin-top:6px}
.rz-src a{margin-right:4px}
.rz-empty{font-size:13px;color:var(--muted)}
.rz-none{color:var(--muted)}
.rz-b{display:inline-block;font-weight:700;font-size:13px;padding:1px 8px;border-radius:6px;background:#e9ecef;color:#343a40;white-space:nowrap;margin:1px 0}
.e-poi{background:#e5dbff;color:#5f3dc4}.e-gho{background:#dbe4ff;color:#364fc7}.e-hol{background:#fff3bf;color:#8a6d00}
.e-dar{background:#343a40;color:#f1f3f5}.e-fir{background:#ffe3e3;color:#c92a2a}.e-wat{background:#d0ebff;color:#1864ab}
.e-win{background:#d3f9d8;color:#2b8a3e}.e-ear{background:#f3e3cf;color:#7c4a16}.e-neu{background:#f1f3f5;color:#495057}.e-und{background:#e6d5ef;color:#5c2a74}
@media (max-width:600px){.rz-t th:first-child{width:6em}.rz-t th:nth-child(2),.rz-t th:nth-child(3){width:5em}.rz-t{font-size:12px}}
`;

document.head.insertAdjacentHTML("beforeend", `<style>${RESIST_CSS}
.rz-where{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px}
.rz-chip{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:var(--panel)}
.rz-chip.md{font-weight:700;border-color:#3b5bdb}
.rz-out{padding:12px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:13px;margin-bottom:10px}
.rzgo{cursor:pointer}
.updbar{margin:0 0 10px;padding:10px 12px;border-color:#3b5bdb;background:rgba(59,91,219,.06);font-size:14px}
.updbar button{margin-left:8px}
.updbar pre{white-space:pre-wrap;font-size:12px;margin:6px 0 0}
.dm-box{margin-bottom:12px;padding:10px 12px;overflow-x:auto}
.dm-h{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px}
.dm-h .dm-rz{margin-left:auto;font-size:13px}
table.dm-t{width:100%;border-collapse:collapse;font-size:13px}
table.dm-t th{font-size:11px;color:var(--muted);font-weight:600;padding:4px 6px;border-bottom:1px solid var(--line);position:static;min-width:0;max-width:none;white-space:nowrap;text-align:right;background:none}
table.dm-t td{padding:5px 6px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
table.dm-t .l{text-align:left}
td.dm-max{font-weight:700}
.eq-box{padding:10px 12px;margin-bottom:10px}
.eq-h{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}
.eq-h input.eqname{font:inherit;font-weight:700;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);flex:1 1 380px;min-width:200px}
.eq-btns{margin-left:auto;display:flex;gap:6px}
.eq-h input.eqtag{font:inherit;font-weight:700;width:3.6em;text-align:center;padding:3px 4px;border:1px solid var(--accent);border-radius:99px;background:var(--chip);color:var(--ink)}
.eq-use{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;padding:6px 0;border-top:1px solid var(--line)}
.eq-use:first-child{border-top:0}
.ch-row{margin-bottom:8px;padding:0}
.ch-h{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;padding:10px 14px;cursor:pointer;border-radius:12px}
.ch-h:hover{background:var(--chip)}
.ch-h .ch-name{font-weight:700;min-width:9em}
.ch-h .ch-lv{font-variant-numeric:tabular-nums}
.ch-body{padding:2px 14px 12px;border-top:1px solid var(--line)}
.sk-list{display:flex;flex-wrap:wrap;gap:5px 6px;margin-top:4px}
.sk{font-size:12px;padding:2px 8px;border-radius:99px;background:var(--chip);white-space:nowrap}
.sk b{margin-left:4px}
.simnav{display:flex;gap:6px;margin-bottom:10px}
.simnav button{padding:5px 14px;border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:8px}
.simnav button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.simc{display:grid;grid-template-columns:minmax(300px,380px) 1fr;gap:10px;align-items:start}
@media (max-width:820px){.simc{grid-template-columns:1fr}}
.simc .panel{padding:10px 14px}
.simc h3{margin:0 0 6px;font-size:14px}
.simc td:last-child{white-space:normal}
.eqt td{vertical-align:top}
.simc2{display:flex;flex-direction:column;gap:10px;align-items:stretch}
.simrow2{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
@media (max-width:700px){.simrow2{grid-template-columns:1fr}}
.simc2 details>summary{cursor:pointer;white-space:normal;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.simc2 details>summary::before{content:"▸";display:inline-block;width:1em;color:var(--muted,#999)}
.simc2 details[open]>summary::before{content:"▾"}
.simc2 details>summary::-webkit-details-marker{display:none}
.simc2 details[open]>summary{margin-bottom:6px}
.settabs.right{margin-left:auto}
.abar{display:flex;align-items:center;gap:8px;padding:2px 4px;border-radius:6px;font-size:13px}
.abar[data-apick]{cursor:pointer}.abar[data-apick]:hover,.abar.cur{background:var(--chip)}
.abar .an{flex:0 0 14em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.abar .aw{flex:1;height:10px;background:var(--chip);border-radius:5px;overflow:hidden}
.abar .aw i{display:block;height:100%;background:var(--accent);border-radius:5px}.abar .av{flex:0 0 7em;text-align:right;font-variant-numeric:tabular-nums}.abar .an2{flex:0 0 10em;font-size:12px}
.atkbig{display:flex;flex-wrap:wrap;gap:24px}.atkbig b{font-size:24px}.atkmres{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}.atkmob{margin-top:4px}
.atkfxg{margin:6px 0}.atkfxl{display:flex;flex-wrap:wrap;gap:6px}.afx{border:1px solid var(--line);border-radius:8px;padding:3px 9px;font-size:13px;background:var(--panel);cursor:pointer;display:inline-flex;gap:4px;align-items:center}
.colorpop{position:fixed;z-index:9999;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.45);padding:10px 12px}.swgrid{display:grid;grid-template-columns:repeat(12,22px);gap:4px}.swgrid .sw{width:22px;height:22px;border-radius:5px;border:1px solid rgba(128,128,128,.5);padding:0;cursor:pointer}.swgrid .sw:hover{outline:2px solid var(--accent)}.licdlg{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}.licbox{width:min(760px,92vw);max-height:84vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px}.licpre{white-space:pre-wrap;font:12.5px/1.6 inherit;margin:6px 0 0}.infopop{position:fixed;z-index:9999;width:430px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;overscroll-behavior:contain;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.45);padding:8px 12px;font-size:13px}.infoh{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px}.infox{cursor:pointer;opacity:.7}.infob{line-height:1.5}.afx{user-select:none}.afxn{margin-left:3px}.afxrate td,.afxrate th{padding:2px 8px}.afx.dim{color:var(--muted);opacity:.7}.afx.on.dim{opacity:1}.afx.on{background:var(--accent);color:#fff;border-color:var(--accent)}.afx.off{opacity:.45}.afx input{display:none}.afx a{margin-left:4px;opacity:.7}.atkadd{margin-top:8px}
.sbres{margin:6px 0}
.sbrec{margin-top:10px}
.sbdet{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
.mgcard{border-top:1px solid var(--line);padding:8px 0}
.mgcard:first-of-type{border-top:0}
.mgsk{display:inline-block;margin:0 6px 2px 0;padding:0 8px;border-radius:99px;background:var(--chip);font-size:12px}
.mgsk.dim{opacity:.55}
.mgtabs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.mgtab{font:inherit;padding:2px 10px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
.mgtab.on{background:var(--accent,#5b8def);border-color:var(--accent,#5b8def);color:#fff}
.mgtab small{opacity:.75;margin-left:4px}
.mgtab.auto{border-style:dashed}
.dm-gear{margin-top:10px}
.dm-gh{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:2px}
.slotmake{margin-top:8px}
.slotmake button{font-size:14px;padding:6px 14px;font-weight:700}
.tgrip{opacity:1;color:inherit;padding:0;cursor:pointer}
.fgrip{opacity:.4;padding:0 2px;font-size:12px;letter-spacing:-2px}
summary:hover .fgrip{opacity:1}
.simc2 details>summary:has(.fgrip)::before{margin-left:0}
button.drop-left,[data-ord].drop-left{box-shadow:inset 3px 0 0 var(--accent)}
button.drop-right,[data-ord].drop-right{box-shadow:inset -3px 0 0 var(--accent)}
[data-ord].drop-above{box-shadow:0 -3px 0 var(--accent)}
[data-ord].drop-below{box-shadow:0 3px 0 var(--accent)}
[data-ord].dragging,#tabs button.dragging{opacity:.5}
details.slotc{border-color:var(--slotc)}
.slotc .pk,.slotc .eqt select{border-color:var(--slotc)}
.slotc.dirty .pk,.slotc.dirty .eqt select{border-style:dashed}
.xrow{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;width:100%}
.xwho{font-weight:400;font-size:12px;color:var(--muted,#999);margin-left:4px}
.settab:disabled{opacity:.45;cursor:default}
.simgo{padding:0 8px;font-size:12px}
.cmpbox:not(:empty){margin-top:10px;padding-top:8px;border-top:1px dashed var(--line);overflow-x:auto}
.simc table.cmp td.cmpd{background:rgba(227,160,8,.12)}
.simc table.cmp tr.cmpk td{padding-top:8px;border-bottom:1px solid var(--line)}
.relbox{margin-top:8px}
.relbox>summary{font-size:13px}
.relgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:3px 6px}
.bfi.sm{padding:1px 6px;font-size:12px}
#stp{overflow-x:auto}.stpmainw{display:grid;grid-template-columns:auto minmax(300px,1fr);gap:16px;align-items:start}@media (max-width:1000px){.stpmainw{grid-template-columns:1fr}}.stpsbc{border:1px solid var(--line);border-radius:8px;padding:6px 10px;margin:6px 0}.stpc{white-space:nowrap}.stpbtn{padding:1px 7px;font-size:12px}.stpin{width:4.4em;text-align:center}
.stpres{display:flex;flex-direction:column;gap:10px;margin:2px 0}.stph{font-weight:700;margin:10px 0 2px;font-size:13px}
.bfi.sw{gap:8px}.bfi.sw input[type=checkbox]{display:none}
.bfi .swt{flex:none;width:28px;height:15px;border-radius:8px;background:var(--line);position:relative;transition:background .15s}
.bfi .swt::after{content:"";position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:#fff;transition:left .15s}
.bfi.on .swt{background:var(--ok,#3fb950)}.bfi.on .swt::after{left:15px}
.setframe{border:2px solid transparent;border-radius:10px;padding:6px;background:linear-gradient(var(--panel),var(--panel)) padding-box,var(--fc) border-box}
.setdot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.missdet{font-size:12px;color:var(--soon,#e8a100);white-space:normal}.missdet button{padding:0 8px;font-size:11px;margin-left:2px}
.leftover{font-size:16px;font-weight:700}.multi td.sub{font-size:12px;color:var(--muted,#999)}

.relnote{font-size:12px;margin-top:6px}
.simc table.multi{width:auto}
.simc table.multi th{font-weight:400;color:var(--muted,#999);font-size:12px;padding:3px 10px 3px 6px}
.simc table.multi td{padding:3px 10px 3px 6px}
.multisum{margin-top:8px;line-height:1.8}
.warn{color:#e3a008}
.unl{display:inline-block;margin-left:3px;padding:0 5px;border-radius:99px;background:#b8860b;color:#fff;font-size:11px;font-weight:700;cursor:help}
.simlink{margin:2px 2px 0 0}
.bfbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
.bfbar input[type=text]{flex:1 1 14em;max-width:22em;font:inherit;padding:2px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}
.bfgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:4px 8px}
.bfi{display:flex;align-items:center;gap:6px;padding:2px 8px;border:1px solid var(--line);border-radius:6px;min-width:0;cursor:pointer}
.bfi.on{border-color:var(--ok,#3fb950);background:rgba(63,185,80,.12)}
.bfi .bfl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bfi .bfg{font-size:11px;color:var(--muted,#999);white-space:nowrap}
.bfi select{max-width:11em;font-size:12px}
.simc .bfi input[type=number]{width:4.5em}
.simc2 details[open]>summary .foldsum{display:none}
.askbg{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
.askbox{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:16px 18px;max-width:min(460px,90vw);box-shadow:0 8px 30px rgba(0,0,0,.4)}
.asktext{line-height:1.7}
.asknever{display:block;margin:12px 0 0;color:var(--muted,#999);font-size:13px}
.askbtns{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.eqtagb{font:inherit;font-weight:700;min-width:3em;padding:3px 10px;border:1px solid;border-radius:99px;color:#fff;cursor:pointer}
.eq-box.hist{opacity:.85}
.gshist{margin:14px 0 6px;font-size:14px}
.settab.more{border-style:dashed;font-weight:400}
.xwrap{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
.xinfo{font-size:12px}
.xinfo .xttl{font-weight:700;font-size:13px;margin-bottom:2px}
.xinfo table{width:auto;border-collapse:collapse}
.simc .xinfo td{padding:1px 6px;border-bottom:none;vertical-align:top}
.xinfo [class*=_TITLE],.xinfo td.CSSCLS_EXTRA_INFO_DISP_TABLE{font-weight:700;border-bottom:1px solid var(--line) !important}
.xinfo [class*=_VALUE]{text-align:right}
.xinfo .CSSCLS_EXTRA_INFO_DISP_TABLE_BLUE{color:#5aa9ff}
.xinfo .CSSCLS_EXTRA_INFO_DISP_TABLE_RED{color:#ff6b6b}
.eqhead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.eqhead h3{margin:0}
.settabs{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.settab{font:inherit;font-weight:700;min-width:2.2em;padding:1px 8px;border-radius:6px;border:2px solid var(--c,#888);background:transparent;color:var(--ink);cursor:pointer}
.settab.on{background:var(--c,#888);color:#fff}
.eqt td:first-child{width:8.5em}
.eqrow{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.eqrf{display:inline-flex;gap:4px;width:7.6em;flex:none}
.eqrf.sh{width:3.8em}
.eqt select{padding:1px 2px}
.pk{flex:0 1 20em;min-width:0;text-align:left;font:inherit;padding:2px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pk:hover{border-color:var(--accent,#888)}
.pk.sm{flex:0 1 auto;font-size:12px;padding:1px 6px;max-width:100%}
.pk.none{color:var(--muted,#999)}
.eqrnd{display:inline-flex;gap:2px}
.eqrnd select{font-size:12px;max-width:13em}
.sfrow{margin-top:4px}
.pick{position:fixed;z-index:9999;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);padding:6px;font-size:13px}
.pick input{width:100%;box-sizing:border-box;font:inherit;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}
.pick-list{max-height:280px;overflow:auto;margin-top:4px}
.pick-o{padding:2px 8px;border-radius:4px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pick-o.cur{font-weight:700}
.pick-o.at{background:rgba(128,128,128,.25)}
.pick-more{padding:4px 8px}
.pick-desc{margin-top:4px;padding:4px 8px;border-top:1px solid var(--line);font-size:12px;white-space:normal;max-height:6em;overflow:auto}
.scpick{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:2px 12px;margin:8px 0;max-height:260px;overflow:auto}
.scpick label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.simc table{width:100%;border-collapse:collapse;font-size:13px}
.simc td,.simc th{padding:3px 6px;border-bottom:1px solid var(--line);text-align:left;position:static;min-width:0;max-width:none;background:none;white-space:nowrap}
.simc td.v{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
.simc input[type=number]{width:5em;font:inherit;padding:2px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}
.simc input[type=text],.simc select{font:inherit;padding:2px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);max-width:100%}
.simc .bon{color:var(--muted);font-size:12px;margin-left:4px}
.simc .good{color:var(--ok);font-weight:700}.simc .warn{color:var(--soon);font-weight:700}
.simbox{padding:10px 14px;margin-bottom:10px}
.simbox .opts{margin:0 0 6px}
.simbox label{white-space:nowrap}
.simbox input[type=number]{width:7em;font:inherit;padding:2px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}
.simset{display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:13px}
table.sim-t{width:100%;border-collapse:collapse;font-size:13px}
table.sim-t th,table.sim-t td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
table.sim-t th:first-child,table.sim-t td:first-child{text-align:left;position:static;min-width:0;max-width:none}
table.sim-t thead th{position:static;background:none;font-weight:700}
table.sim-t td.base{background:var(--chip)}
table.sim-t tr.big td{font-weight:700;font-size:15px}
.sim-ok{color:var(--ok);font-weight:700}.sim-ng{color:#e03131;font-weight:700}
.unk-drop{border:2px dashed var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:13px}
.unk-drop.over{border-color:var(--accent);background:var(--chip)}
.eq-use input.unkname{font:inherit;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);flex:1 1 260px;min-width:160px}
.eq-sub{font-size:12px;margin:0 0 6px}
.eq-st{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;margin:4px 0}
table.eq-t{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}
table.eq-t th{width:120px;text-align:left;font-weight:600;color:var(--muted);font-size:12px;padding:5px 6px;border-bottom:1px solid var(--line);position:static;min-width:0;max-width:none;background:none;vertical-align:top;white-space:nowrap}
table.eq-t td{text-align:left;padding:5px 6px;border-bottom:1px solid var(--line);white-space:normal}
.eq-name{font-weight:600}.eq-opt{font-size:11px;color:var(--muted)}
.ek{display:inline-block;min-width:1.6em;padding:0 5px;border-radius:5px;font-size:12px;font-weight:700;text-align:center;border:1px solid var(--line)}
.ek-水{color:#1c7ed6;border-color:#1c7ed6}.ek-火{color:#e03131;border-color:#e03131}.ek-風{color:#2f9e44;border-color:#2f9e44}.ek-地{color:#a0662b;border-color:#a0662b}
.ek-聖{color:#c99a06;border-color:#c99a06}.ek-闇{color:#7048e8;border-color:#7048e8}.ek-念{color:#9c36b5;border-color:#9c36b5}.ek-毒{color:#5c940d;border-color:#5c940d}
.ek-不死{color:#495057;border-color:#495057}.ek-無{color:var(--muted)}
.mob{margin-left:6px;white-space:nowrap;font-size:11px;color:var(--muted)}.mob .ek{font-size:11px;min-width:0;padding:0 3px}.mob .boss{color:#e03131;font-weight:700}
.kd{font-size:12px;color:var(--muted)}.kd-魔法{color:#7048e8}.kd-固定{color:#c92a2a}
.dm-st{display:flex;flex-wrap:wrap;gap:4px 8px;font-size:12px;margin:0 0 6px;align-items:center}
.ail{border:1px solid var(--line);border-radius:999px;padding:1px 8px;background:var(--panel)}
.dm-mix{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;margin:0 0 6px}.dm-mix b{font-weight:700}
input.skfix{font:inherit;font-size:13px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);width:180px}
input.skfix.saved{border-color:var(--ok)}
tr.sk-unk td:first-child{color:var(--soon);font-weight:700}
.hl-col{background:rgba(59,91,219,.07)}
tr.mx-dim td{opacity:.28;filter:grayscale(1);transition:opacity .12s}
.mx-off{opacity:.22;filter:grayscale(1);transition:opacity .12s}
.mx-ico{display:block;cursor:pointer}
.mx-name.rzgo:hover{color:#3b5bdb;text-decoration:underline}
thead th.mx-lock{box-shadow:inset 0 -3px 0 #3b5bdb}
td.cell[data-ci]{cursor:pointer}
.mx-flash{animation:rzf 1.2s ease-out 2}
#rzall [data-rz],.rz-hot{cursor:pointer}
td.rzgo:hover{outline:2px solid rgba(59,91,219,.35);outline-offset:-2px}
.rz-q{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);width:100%;max-width:360px}
</style>`);
// ---------- 耐性 ----------
let RZ = { entries: resistEntries(RESIST_DEFAULT), err: "", t: 0, src: "", q: "", focus: "" };
let MX_FOCUS = "", MX_LOCK = "", GRID_CLICK = null;
// ページのどこをクリックしても受け取る(表の外のクリックで固定を解除するため)
document.addEventListener("click", (ev) => {
  if (SEL.mds.size && Date.now() - SEL_GUARD > 300 && ["weekly", "daily", "other"].includes(TAB) && ev.target.isConnected && !ev.target.closest("thead th[data-g], #ctx")) { SEL.mds.clear(); render(); }   // MD の選択は、見出し以外をクリックで解除
  if (ev.target.isConnected && GRID_CLICK && ["weekly", "daily", "other"].includes(TAB) && !ev.target.closest("#tabs")) GRID_CLICK(ev);
});
// 耐性のカード → そのMDがあるマトリクス(週次/デイリー/クエスト)の列へ戻る
function goMatrix(rzName) {
  const E = RZ.entries.find((x) => x.name === rzName);
  const G = E && buildGroups().find((g) => ["weekly", "daily", "other"].includes(g.kind) && resistFind(RZ.entries, g.name) === E);
  if (!G) return false;
  MX_FOCUS = G.name; TAB = G.kind; store.set("md_tab", TAB); render();
  return true;
}
function goResist(name) {
  RZ.focus = name; RZ.q = "";
  TAB = "resist"; store.set("md_tab", TAB); render();
}
async function loadResistSheet(force) {
  const url = resistCsvUrl(SETTINGS.resistSheet || RESIST_SHEET_DEFAULT);
  if (!force && RZ.src === url && Date.now() - RZ.t < 5 * 60e3) return;
  RZ.t = Date.now(); RZ.src = url;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const t = await r.text();
    if (/^\s*<!doctype|<html/i.test(t.slice(0, 300))) throw new Error("シートが公開されていません");
    const E = resistEntries(resistFromTable(parseCSV(t)));
    if (!E.length) throw new Error("シートが空です");
    RZ.entries = E; RZ.err = "";
  } catch (e) {
    RZ.err = `シートを読めないので、最初に入れた内容で表示中（${e.message === "Failed to fetch" ? "シートが公開されていないかも" : e.message}）`;
  }
  if (DATA && TAB !== "settings") render();
}
function renderResist(chars, now) {
  loadResistSheet();
  const at = chars.map((c) => [c, (DATA.chars[c] || {}).at]).filter(([, a]) => a && now - a.t < 6 * 3600).sort((a, b) => b[1].t - a[1].t);
  const ago = (t) => { const s = now - t; return s < 60 ? "いま" : s < 3600 ? `${Math.floor(s / 60)}分前` : `${Math.floor(s / 3600)}時間前`; };
  let h = `<div class="opts"><span>いまMDにいるキャラの必要耐性を自動で出します（ツールがMDの出入りを送ってきたとき更新・20秒ごとに確認）。内容は「MD耐性一覧」シートを編集すると反映されます。</span></div>`;
  if (at.length) h += `<div class="rz-where">` + at.map(([c, a]) => `<span class="rz-chip ${a.map.includes("@") ? "md" : ""}">${esc(cn(c))}：${esc(a.map.includes("@") ? (a.md || a.map) : a.map)} <span class="muted">${ago(a.t)}</span></span>`).join("") + `</div>`;
  const inMd = at.filter(([, a]) => a.map.includes("@"));
  const shown = new Set();
  for (const [c, a] of inMd) {
    const E = resistMatch(RZ.entries, a.map, a.md);
    if (E && shown.has(E.name)) continue;
    if (E) { shown.add(E.name); h += resistCard(E, { hot: true, extra: `<span class="muted">← ${esc(inMd.filter(([, b]) => resistMatch(RZ.entries, b.map, b.md) === E).map(([n]) => n).join("・"))}</span>` }); }
    else h += `<div class="rz-out"><b>${esc(cn(c))}</b> がいるMD（${esc(a.md || a.map)}）はシートに見つかりませんでした。シートの「判定キー」に <b>${esc(a.map.replace(/^.*@/, ""))}</b>${a.md ? ` か <b>${esc(a.md)}</b>` : ""} を書き足してね。</div>`;
  }
  if (!inMd.length) h += `<div class="rz-out">${at.length ? "いまMDにいるキャラはいません。" : "まだ場所の記録がありません（Fox_MD_Trackerを起動したままMDに入ると出ます）。"}</div>`;
  if (RZ.err) h += `<div class="err" style="margin-bottom:10px">${esc(RZ.err)}</div>`;
  h += `<h2 style="margin-top:18px">MDごとの耐性</h2><p><input class="rz-q" id="rzq" placeholder="MD名で検索" value="${esc(RZ.q)}"></p><div id="rzall"></div>`;
  $("#view").innerHTML = h;
  // 実際に受けた攻撃(被ダメの記録)をカードの下に
  const dm = dmgMerge(chars), byE = new Map();
  for (const [w, W] of Object.entries(dm)) {
    const E = resistMatch(RZ.entries, "", w) || resistFind(RZ.entries, w);
    if (!E) continue;
    const M = byE.get(E.name) || {};
    for (const [k, v] of Object.entries(W)) { const x = M[k] = M[k] || [0, 0, 0, 0, 0, new Set()]; x[0] += v[0]; x[1] += v[1]; x[2] = Math.max(x[2], v[2]); x[3] = Math.max(x[3], v[3]); v[5].forEach((n) => x[5].add(n)); }
    byE.set(E.name, M);
  }
  const after = (E) => byE.has(E.name) ? `<div class="rz-m"><b>実際に受けた攻撃（最大ダメージ順・上位5）</b></div>${dmgTable(byE.get(E.name), false, 5)}` : "";
  const drawAll = () => { const q = rnorm(RZ.q); $("#rzall").innerHTML = RZ.entries.filter((E) => !q || rnorm(E.name + E.keys.join()).includes(q)).map((E) => resistCard(E, { after: after(E) })).join(""); };
  drawAll();
  $("#rzq").oninput = (e) => { RZ.q = e.target.value; drawAll(); };
  // カードをクリック → マトリクスのそのMDへ(出典リンクは除く)
  $("#view").onclick = (ev) => {
    if (ev.target.closest("a")) return;
    const card = ev.target.closest("[data-rz]");
    if (card && !goMatrix(card.dataset.rz)) {
      card.classList.add("rz-flash"); setTimeout(() => card.classList.remove("rz-flash"), 1500);
      card.title = "このMDはマトリクスにありません（まだCTの記録がないMD）";
    }
  };
  if (RZ.focus) {
    const name = RZ.focus; RZ.focus = "";
    const E = resistFind(RZ.entries, name);
    const el = E && [...document.querySelectorAll("#rzall [data-rz]")].find((x) => x.dataset.rz === E.name);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("rz-flash"); setTimeout(() => el.classList.remove("rz-flash"), 3500);
    } else {
      RZ.q = name; drawAll(); $("#rzq").value = name;
      $("#rzall").insertAdjacentHTML("afterbegin", `<div class="rz-out">「${esc(name)}」はシートにまだありません。シートに行を足すとここに出ます。</div>`);
      $("#rzq").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}
setInterval(() => { if (DATA && !document.hidden && TAB === "resist") load(true); }, 20000);
