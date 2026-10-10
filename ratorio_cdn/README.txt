ROラトリオHub が起動時に外部(CDN)から読む部品の写し。アプリに同梱して、外部を待たずに起動できるようにする。
ラトリオのファイルを配るときに、map.json の URL をこのフォルダのファイルに読みかえる(md_tracker.py)。
ラトリオ側が版を上げたら(URL が変わる)、新しい URL のものを足す。足すまでは今までどおり外部から読む。

- chart.js 4.5.1 / @kurkle/color 0.3.4 … MIT License (jsDelivr の +esm。chart.js の中の import を ./kurkle-color.js に書きかえ)
- html2canvas 1.4.1 … MIT License
- Font Awesome Free 7.0.0 … アイコン CC BY 4.0 / フォント SIL OFL 1.1 / コード MIT (css の中の ../webfonts/ を ./ に書きかえ)
